'use strict'

/**
 * SettleStage - 结算阶段 Stage（唯一写入点）
 *
 * 职责：
 * 1. 扣减用户积分（从 PricingStage 获取 draw_cost）
 * 2. 创建抽奖记录（lottery_draws）
 * 3. 记录决策快照（lottery_draw_decisions）
 * 4. 扣减奖品库存
 * 5. 扣减用户预算（通过 BudgetProvider）
 * 6. 发放奖品到用户背包
 * 7. 更新用户配额（如果有）
 *
 * 输出到上下文：
 * - draw_record: 创建的抽奖记录
 * - decision_record: 创建的决策记录
 * - settle_result: 结算结果汇总
 *
 * 设计原则（Single Writer Principle）：
 * - 整个 Pipeline 中唯一执行写操作的 Stage
 * - 所有写操作在同一事务中执行
 * - 幂等性控制：通过 idempotency_key 防止重复执行
 * - 失败时事务回滚，保证数据一致性
 *
 * ⚠️ 关键约束（Phase 2 增强 - 2026-01-18）：
 * - **禁止硬编码默认值**：draw_cost 必须从 PricingStage 获取
 * - **幂等键派生规则**：:consume（积分扣减）/ :reward_N（奖品发放）
 * - **连抽场景**：支持 skip_points_deduction 跳过积分扣减
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/SettleStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-19 - Phase 2 增强（积分扣减、派生幂等键）
 */

const BaseStage = require('./BaseStage')
const {
  LotteryDraw,
  LotteryDrawDecision,
  LotteryPrize: _LotteryPrize,
  LotteryCampaignUserQuota: _LotteryCampaignUserQuota,
  LotteryHourlyMetrics, // Phase P2：监控指标埋点
  sequelize
} = require('../../../../models')
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const AssetService = require('../../../AssetService')
const { getInstance: getLotteryMetricsCollector } = require('../../../LotteryMetricsCollector') // 🆕 实时Redis指标采集

/*
 * ========== Phase 9-16 增强：体验状态管理器 ==========
 * 用于更新用户抽奖体验计数器（Pity/AntiEmpty/AntiHigh）
 *
 * 技术债务清理（2026-01-20）：
 * - 原引用：../../strategy/state
 * - 新引用：../../compute/state
 * - 详见：docs/技术债务彻底清理重构方案-2026-01-20.md P1-New 项9-15
 */
const { ExperienceStateManager, GlobalStateManager } = require('../../compute/state')

// eslint-disable-next-line no-unused-vars -- _LotteryPrize, _LotteryCampaignUserQuota: 预留用于未来扩展功能
const _preReserved = { _LotteryPrize, _LotteryCampaignUserQuota }

/**
 * 结算阶段 Stage
 */
class SettleStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('SettleStage', {
      is_writer: true, // 标记为写操作 Stage
      required: true
    })
  }

  /**
   * 执行结算操作
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @param {string} context.lottery_session_id - 抽奖会话ID
   * @param {Object} context.transaction - 外部事务（可选）
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @param {boolean} context.skip_points_deduction - 是否跳过积分扣减（连抽子请求）
   * @param {number} context.current_draw_index - 连抽时当前抽奖索引（用于派生幂等键）
   * @param {number} context.draw_count - 抽奖次数（1=单抽，>1=连抽）
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const {
      user_id,
      campaign_id,
      idempotency_key,
      lottery_session_id,
      draw_count = 1, // 🆕 支持连抽次数
      batch_id = null // 🆕 Phase 2：连抽批次ID（由外层生成）
    } = context

    this.log('info', '开始结算阶段', { user_id, campaign_id, idempotency_key, draw_count })

    // 幂等性检查
    const existing_draw = await this._checkIdempotency(idempotency_key)
    if (existing_draw) {
      this.log('info', '幂等检查：抽奖记录已存在，返回已有结果', {
        user_id,
        campaign_id,
        idempotency_key,
        draw_id: existing_draw.draw_id
      })

      return this.success({
        draw_record: existing_draw,
        is_duplicate: true,
        message: '幂等重复请求，返回已有结果'
      })
    }

    // 获取决策快照数据
    const decision_data = this.getContextData(context, 'DecisionSnapshotStage.data')
    if (!decision_data) {
      throw this.createError(
        '缺少决策快照数据，请确保 DecisionSnapshotStage 已执行',
        'MISSING_DECISION_DATA',
        true
      )
    }

    const { decision_snapshot, final_prize, final_tier, guarantee_triggered } = decision_data

    /*
     * ========== 🆕 Phase 2 增强：获取定价信息 ==========
     * 🔴 禁止硬编码默认值，draw_cost 必须从 PricingStage 获取
     */
    const pricing_data = this.getContextData(context, 'PricingStage.data')
    if (!pricing_data || pricing_data.draw_cost === undefined) {
      throw this.createError(
        'PricingStage 未提供 draw_cost，请确保 PricingStage 已执行',
        'MISSING_PRICING_DATA',
        true
      )
    }
    const draw_cost = pricing_data.draw_cost

    // 获取预算上下文
    const budget_data = this.getContextData(context, 'BudgetContextStage.data') || {}
    const budget_provider = context.stage_data?.budget_provider

    // 使用外部事务或创建新事务
    const use_external_transaction = !!context.transaction
    const transaction = context.transaction || (await sequelize.transaction())

    try {
      // 1. 生成唯一的抽奖ID
      const draw_id = this._generateDrawId(user_id)

      /*
       * ========== 🆕 Phase 2 增强：扣减用户积分 ==========
       * 🔴 连抽场景：检查是否跳过积分扣减（由外层统一处理）
       */
      const skip_points_deduction = context.skip_points_deduction === true
      let points_deducted = 0

      if (draw_cost > 0 && !skip_points_deduction) {
        /*
         * 🔴 幂等键派生规则（与旧链路一致）：idempotency_key + ':consume'
         * 确保重复请求时不会重复扣减积分
         */
        const consume_idempotency_key = `${idempotency_key}:consume`

        // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
        await AssetService.changeBalance(
          {
            user_id,
            asset_code: 'POINTS',
            delta_amount: -draw_cost,
            idempotency_key: consume_idempotency_key, // 🔴 派生幂等键
            lottery_session_id,
            business_type: 'lottery_consume', // 🔴 与旧链路一致
            meta: {
              source_type: 'system',
              title: '抽奖消耗',
              description: `抽奖消耗 ${draw_cost} 积分`,
              draw_count,
              discount_applied: pricing_data.saved_points || 0
            }
          },
          { transaction }
        )

        points_deducted = draw_cost

        this.log('info', '用户积分扣减成功', {
          user_id,
          draw_cost,
          idempotency_key: consume_idempotency_key,
          skip_points_deduction
        })
      } else if (skip_points_deduction) {
        this.log('info', '跳过积分扣减（连抽子请求）', {
          user_id,
          draw_cost,
          reason: 'skip_points_deduction=true'
        })
      }

      // 2. 扣减奖品库存
      await this._deductPrizeStock(final_prize, transaction)

      // 3. 扣减用户预算（如果有 BudgetProvider）
      let budget_deducted = 0
      if (budget_provider && final_prize.prize_value_points > 0) {
        budget_deducted = await this._deductBudget(
          budget_provider,
          final_prize.prize_value_points,
          {
            user_id,
            campaign_id,
            prize_id: final_prize.prize_id,
            idempotency_key,
            transaction
          }
        )
      }

      /*
       * ========== 🆕 Phase 2 增强：使用派生幂等键发奖 ==========
       * 🔴 幂等键派生规则：idempotency_key + ':reward_' + index
       */
      const reward_index = context.current_draw_index || 0
      const reward_idempotency_key = `${idempotency_key}:reward_${reward_index}`

      await this._distributePrize(user_id, final_prize, {
        idempotency_key: reward_idempotency_key, // 🔴 使用派生幂等键
        lottery_session_id,
        transaction
      })

      // 5. 创建抽奖记录（使用真实的 draw_cost）
      const draw_record = await this._createDrawRecord({
        draw_id,
        user_id,
        campaign_id,
        final_prize,
        final_tier,
        guarantee_triggered,
        idempotency_key,
        lottery_session_id,
        budget_data,
        budget_deducted,
        points_deducted, // 🆕 传递积分扣减信息
        draw_cost, // 🆕 传递抽奖成本
        draw_count, // 🆕 传递抽奖次数
        batch_id, // 🆕 Phase 2：连抽批次ID
        transaction
      })

      // 6. 记录决策快照
      const decision_record = await this._createDecisionRecord({
        draw_id,
        user_id,
        campaign_id,
        decision_snapshot,
        transaction
      })

      // 7. 更新用户配额（如果有）
      await this._updateUserQuota(user_id, campaign_id, transaction)

      /*
       * ========== Phase 9-16 增强：更新用户体验状态 ==========
       * 用于 Pity 系统、Anti-Empty Streak、Anti-High Streak、Luck Debt 机制
       *
       * 规则：
       * - 空奖（empty tier）：增加空奖连击计数
       * - 非空奖：重置空奖连击，增加对应档位计数
       * - 全局状态：记录跨活动的抽奖统计
       */
      await this._updateExperienceState({
        user_id,
        campaign_id,
        final_tier,
        final_prize,
        transaction
      })

      /*
       * ========== Phase P2 增强：记录监控指标 ==========
       * 按小时聚合监控数据，用于活动健康度监控和策略效果评估
       */
      await this._recordHourlyMetrics({
        campaign_id,
        draw_tier: final_tier,
        prize_value: final_prize.prize_value_points || 0,
        budget_tier: budget_data?.budget_tier || null,
        mechanisms: decision_snapshot.experience_smoothing || {},
        transaction
      })

      // 提交事务（如果是内部创建的事务）
      if (!use_external_transaction) {
        await transaction.commit()
        this.log('info', '结算事务已提交', { user_id, campaign_id, draw_id })
      }

      /*
       * ========== Phase P2 增强：Redis 实时指标采集 ==========
       * 事务提交成功后，异步记录到 Redis 实时层
       * - 用途：实时仪表板查询（低延迟）
       * - 特点：fire-and-forget，不阻塞主流程
       * - 数据流：Redis 实时层 → 小时聚合任务 → MySQL lottery_hourly_metrics
       */
      this._recordRealtimeMetrics({
        campaign_id,
        user_id,
        draw_tier: final_tier,
        prize_value: final_prize.prize_value_points || 0,
        budget_tier: budget_data?.budget_tier || null,
        mechanisms: decision_snapshot.experience_smoothing || {}
      }).catch(redis_error => {
        // Redis 记录失败不影响主业务，仅记录日志
        this.log('warn', 'Redis 实时指标记录失败（非致命）', {
          campaign_id,
          error: redis_error.message
        })
      })

      // 构建返回数据
      const result = {
        draw_record: draw_record.toJSON(),
        decision_record: decision_record.toJSON(),
        is_duplicate: false,
        settle_result: {
          draw_id,
          prize_id: final_prize.prize_id,
          prize_name: final_prize.prize_name,
          prize_value_points: final_prize.prize_value_points,
          reward_tier: final_tier,
          guarantee_triggered,
          budget_deducted,
          budget_after: budget_data.budget_before - budget_deducted,
          // 🆕 增加积分扣减信息
          draw_cost,
          points_deducted,
          skip_points_deduction
        }
      }

      this.log('info', '结算阶段完成', {
        user_id,
        campaign_id,
        draw_id,
        prize_id: final_prize.prize_id,
        prize_name: final_prize.prize_name,
        budget_deducted,
        draw_cost, // 🆕 增加日志
        points_deducted // 🆕 增加日志
      })

      return this.success(result)
    } catch (error) {
      // 回滚事务（如果是内部创建的事务）
      if (!use_external_transaction && transaction) {
        try {
          await transaction.rollback()
          this.log('error', '结算事务已回滚', {
            user_id,
            campaign_id,
            error: error.message
          })
        } catch (rollback_error) {
          this.log('error', '事务回滚失败', {
            error: rollback_error.message
          })
        }
      }

      this.log('error', '结算阶段失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 幂等性检查
   *
   * @param {string} idempotency_key - 幂等键
   * @returns {Promise<Object|null>} 已存在的抽奖记录或 null
   * @private
   */
  async _checkIdempotency(idempotency_key) {
    if (!idempotency_key) return null

    try {
      return await LotteryDraw.findOne({
        where: { idempotency_key }
      })
    } catch (error) {
      this.log('warn', '幂等检查失败', { error: error.message })
      return null
    }
  }

  /**
   * 生成唯一的抽奖ID
   *
   * @param {number} user_id - 用户ID
   * @returns {string} 抽奖ID
   * @private
   */
  _generateDrawId(user_id) {
    const timestamp = BeijingTimeHelper.generateIdTimestamp()
    const random = Math.random().toString(36).substr(2, 6)
    return `draw_${timestamp}_${user_id}_${random}`
  }

  /**
   * 扣减奖品库存
   *
   * @param {Object} prize - 奖品对象
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _deductPrizeStock(prize, transaction) {
    // 无限库存不扣减
    if (prize.stock_quantity === null) {
      this.log('debug', '奖品为无限库存，跳过扣减', { prize_id: prize.prize_id })
      return
    }

    // 使用原子操作扣减库存
    const [affected_rows] = await sequelize.query(
      `UPDATE lottery_prizes 
       SET stock_quantity = stock_quantity - 1, daily_win_count = daily_win_count + 1
       WHERE prize_id = ? AND stock_quantity >= 1`,
      {
        replacements: [prize.prize_id],
        transaction,
        type: sequelize.QueryTypes.UPDATE
      }
    )

    if (affected_rows === 0) {
      throw this.createError(`奖品库存不足: ${prize.prize_name}`, 'INSUFFICIENT_STOCK', true)
    }

    this.log('debug', '奖品库存扣减成功', {
      prize_id: prize.prize_id,
      prize_name: prize.prize_name
    })
  }

  /**
   * 扣减用户预算
   *
   * @param {Object} budget_provider - BudgetProvider 实例
   * @param {number} amount - 扣减金额
   * @param {Object} options - 选项
   * @returns {Promise<number>} 实际扣减金额
   * @private
   */
  async _deductBudget(budget_provider, amount, options) {
    try {
      const result = await budget_provider.deduct(amount, options)
      return result.deducted_amount || amount
    } catch (error) {
      this.log('error', '预算扣减失败', {
        amount,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 发放奖品到用户背包
   *
   * @param {number} user_id - 用户ID
   * @param {Object} prize - 奖品对象
   * @param {Object} options - 选项
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _distributePrize(user_id, prize, options) {
    const { idempotency_key, lottery_session_id, transaction } = options

    try {
      switch (prize.prize_type) {
        case 'points':
          // 积分奖品：增加用户积分
          // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
          await AssetService.changeBalance(
            {
              user_id,
              asset_code: 'POINTS',
              delta_amount: parseInt(prize.prize_value),
              idempotency_key: `${idempotency_key}:points`,
              lottery_session_id,
              business_type: 'lottery_reward',
              meta: {
                source_type: 'system',
                title: `抽奖奖励：${prize.prize_name}`,
                description: `获得${prize.prize_value}积分奖励`
              }
            },
            { transaction }
          )
          break

        case 'coupon':
        case 'physical':
          // 优惠券/实物：写入 item_instances
          await AssetService.mintItem(
            {
              user_id,
              item_type: prize.prize_type === 'coupon' ? 'voucher' : 'product',
              source_type: 'lottery',
              source_id: `${idempotency_key}:item`,
              meta: {
                name: prize.prize_name,
                description: prize.prize_description || `抽奖获得：${prize.prize_name}`,
                value: Math.round(parseFloat(prize.prize_value) || 0),
                prize_id: prize.prize_id,
                prize_type: prize.prize_type,
                acquisition_method: 'lottery'
              }
            },
            { transaction }
          )
          break

        case 'virtual':
          // 虚拟资产：写入材料余额
          if (prize.material_asset_code && prize.material_amount) {
            // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
            await AssetService.changeBalance(
              {
                user_id,
                asset_code: prize.material_asset_code,
                delta_amount: prize.material_amount,
                idempotency_key: `${idempotency_key}:material`,
                business_type: 'lottery_reward_material',
                meta: {
                  prize_id: prize.prize_id,
                  prize_name: prize.prize_name
                }
              },
              { transaction }
            )
          }
          break

        default:
          this.log('warn', '未知奖品类型，跳过发放', {
            prize_id: prize.prize_id,
            prize_type: prize.prize_type
          })
      }

      this.log('debug', '奖品发放完成', {
        user_id,
        prize_id: prize.prize_id,
        prize_type: prize.prize_type
      })
    } catch (error) {
      this.log('error', '奖品发放失败', {
        user_id,
        prize_id: prize.prize_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 创建抽奖记录
   *
   * @param {Object} params - 参数
   * @param {string} params.draw_id - 抽奖ID
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {Object} params.final_prize - 中奖奖品
   * @param {string} params.final_tier - 最终档位
   * @param {boolean} params.guarantee_triggered - 是否触发保底
   * @param {string} params.idempotency_key - 幂等键
   * @param {string} params.lottery_session_id - 抽奖会话ID
   * @param {Object} params.budget_data - 预算数据
   * @param {number} params.budget_deducted - 预算扣减金额
   * @param {number} params.points_deducted - 积分扣减金额（🆕 Phase 2）
   * @param {number} params.draw_cost - 抽奖成本（🆕 Phase 2，从 PricingStage 获取）
   * @param {number} params.draw_count - 抽奖次数（🆕 Phase 2，1=单抽，>1=连抽）
   * @param {string} params.batch_id - 批次ID（🆕 Phase 2，连抽批次标识）
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<Object>} 抽奖记录
   * @private
   */
  async _createDrawRecord(params) {
    const {
      draw_id,
      user_id,
      campaign_id,
      final_prize,
      final_tier,
      guarantee_triggered,
      idempotency_key,
      lottery_session_id,
      budget_data,
      budget_deducted,
      points_deducted = 0, // 🆕 Phase 2：积分扣减金额
      draw_cost = 0, // 🆕 Phase 2：抽奖成本（禁止硬编码）
      draw_count = 1, // 🆕 Phase 2：抽奖次数
      batch_id = null, // 🆕 Phase 2：连抽批次ID
      transaction
    } = params

    // 生成业务唯一键
    const business_id = `lottery_draw_${user_id}_${lottery_session_id || 'no_session'}_${draw_id}`

    /*
     * 🆕 Phase 2 增强：
     * - draw_type：根据 draw_count 动态确定（single/multi）
     * - cost_points：使用真实的 draw_cost（从 PricingStage 获取），禁止硬编码
     */
    const draw_type = draw_count > 1 ? 'multi' : 'single'

    return await LotteryDraw.create(
      {
        draw_id,
        business_id,
        idempotency_key,
        lottery_session_id,
        user_id,
        lottery_id: campaign_id,
        campaign_id,
        draw_type, // 🆕 动态确定（single/multi）
        batch_id, // 🆕 Phase 2：连抽批次ID（null 表示单抽）
        prize_id: final_prize.prize_id,
        prize_name: final_prize.prize_name,
        prize_type: final_prize.prize_type,
        prize_value: final_prize.prize_value,
        cost_points: draw_cost, // 🆕 使用真实的 draw_cost（禁止硬编码 100）
        reward_tier: final_tier,
        guarantee_triggered,
        prize_value_points: final_prize.prize_value_points || 0,
        budget_points_before: budget_data.budget_before || null,
        budget_points_after: (budget_data.budget_before || 0) - budget_deducted,
        points_deducted, // 🆕 记录实际积分扣减金额
        created_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )
  }

  /**
   * 创建决策记录
   *
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 决策记录
   * @private
   */
  async _createDecisionRecord(params) {
    const { draw_id, user_id, campaign_id, decision_snapshot, transaction } = params

    return await LotteryDrawDecision.create(
      {
        draw_id,
        user_id,
        campaign_id,
        decision_type: 'normal_draw',
        user_segment: decision_snapshot.tier_decision?.user_segment || 'default',
        tier_weights_used: JSON.stringify(decision_snapshot.tier_decision?.tier_weights),
        tier_random_value: decision_snapshot.tier_decision?.random_value,
        tier_selected: decision_snapshot.tier_decision?.selected_tier,
        tier_original: decision_snapshot.tier_decision?.original_tier,
        tier_downgrade_path: JSON.stringify(decision_snapshot.tier_decision?.downgrade_path),
        prize_pool_snapshot: JSON.stringify(decision_snapshot.prize_pool_snapshot),
        prize_random_value: decision_snapshot.prize_decision?.random_value,
        prize_selected_id: decision_snapshot.final_result?.prize_id,
        guarantee_triggered: decision_snapshot.guarantee_decision?.guarantee_triggered || false,
        guarantee_count: decision_snapshot.guarantee_decision?.user_draw_count,
        budget_mode: decision_snapshot.budget_snapshot?.budget_mode,
        budget_before: decision_snapshot.budget_snapshot?.budget_before,
        decision_factors: JSON.stringify(decision_snapshot.decision_factors),
        full_snapshot: JSON.stringify(decision_snapshot),
        created_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )
  }

  /**
   * 更新用户配额
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _updateUserQuota(user_id, campaign_id, transaction) {
    try {
      // 使用原子操作更新配额
      const [affected_rows] = await sequelize.query(
        `UPDATE lottery_campaign_user_quota 
         SET used_quota = used_quota + 1, updated_at = NOW()
         WHERE user_id = ? AND campaign_id = ? AND status = 'active'`,
        {
          replacements: [user_id, campaign_id],
          transaction,
          type: sequelize.QueryTypes.UPDATE
        }
      )

      if (affected_rows > 0) {
        this.log('debug', '用户配额已更新', { user_id, campaign_id })
      }
    } catch (error) {
      // 配额更新失败不应该阻断结算
      this.log('warn', '用户配额更新失败（非致命）', {
        user_id,
        campaign_id,
        error: error.message
      })
    }
  }

  /**
   * 更新用户体验状态（Phase 9-16 增强）
   *
   * 用于 Pity 系统、Anti-Empty Streak、Anti-High Streak、Luck Debt 机制
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {string} params.final_tier - 最终奖品档位
   * @param {Object} params.final_prize - 中奖奖品对象
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _updateExperienceState(params) {
    const { user_id, campaign_id, final_tier, final_prize, transaction } = params

    try {
      /*
       * 1. 更新活动级体验状态（用于 Pity / Anti-Empty / Anti-High）
       */
      const experience_manager = new ExperienceStateManager()
      const is_empty =
        final_tier === 'empty' || final_tier === 'fallback' || final_prize.prize_value_points === 0

      await experience_manager.updateState(
        {
          user_id,
          campaign_id,
          draw_tier: final_tier, // 传递实际档位而非 is_high 布尔值
          is_empty
        },
        { transaction }
      )

      this.log('debug', '活动体验状态已更新', {
        user_id,
        campaign_id,
        draw_tier: final_tier,
        is_empty
      })

      /*
       * 2. 更新全局状态（用于 Luck Debt 机制）
       */
      const global_manager = new GlobalStateManager()

      // 检查是否是该活动的首次抽奖（用于增加 participated_campaigns 计数）
      const is_first_draw = await global_manager.isFirstParticipation(
        { user_id, campaign_id },
        { transaction }
      )

      await global_manager.updateState(
        {
          user_id,
          campaign_id,
          draw_tier: final_tier,
          is_first_draw_in_campaign: is_first_draw
        },
        { transaction }
      )

      this.log('debug', '全局体验状态已更新', {
        user_id,
        campaign_id,
        draw_tier: final_tier,
        is_first_draw
      })
    } catch (error) {
      /*
       * 体验状态更新失败不应该阻断结算
       * 记录错误日志，但继续执行
       */
      this.log('warn', '体验状态更新失败（非致命）', {
        user_id,
        campaign_id,
        error: error.message
      })
    }
  }

  /**
   * 记录监控指标（Phase P2 增强）
   *
   * 按小时聚合抽奖监控数据，用于：
   * 1. 活动健康度监控（空奖率、高价值率）
   * 2. 策略效果评估（Pity/AntiEmpty/AntiHigh 触发率）
   * 3. 预算分布分析（B0-B3 用户分布）
   *
   * @param {Object} params - 参数
   * @param {number} params.campaign_id - 活动ID
   * @param {string} params.draw_tier - 抽奖档位（high/mid/low/fallback/empty）
   * @param {number} params.prize_value - 奖品价值（积分）
   * @param {string} params.budget_tier - 预算分层（B0/B1/B2/B3）
   * @param {Object} params.mechanisms - 触发的体验机制
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _recordHourlyMetrics(params) {
    const { campaign_id, draw_tier, prize_value, budget_tier, mechanisms, transaction } = params

    try {
      // 获取或创建当前小时的指标记录
      const metrics = await LotteryHourlyMetrics.findOrCreateMetrics(campaign_id, new Date(), {
        transaction
      })

      // 解析机制触发情况
      const mechanism_flags = {
        pity_triggered:
          mechanisms?.smoothing_applied &&
          mechanisms?.applied_mechanisms?.some(m => m.type === 'pity'),
        anti_empty_triggered: mechanisms?.anti_empty_result?.forced === true,
        anti_high_triggered: mechanisms?.anti_high_result?.tier_capped === true,
        luck_debt_triggered: mechanisms?.luck_debt_result?.debt_level !== 'none',
        guarantee_triggered: false, // 保底由其他逻辑处理
        tier_downgraded: mechanisms?.tier_downgraded === true
      }

      // 记录本次抽奖
      await metrics.recordDraw(
        {
          tier: draw_tier,
          prize_value, // 奖品价值（积分）
          budget_tier, // 预算分层（B0/B1/B2/B3）
          mechanisms: mechanism_flags
        },
        { transaction }
      )

      this.log('debug', '监控指标已记录', {
        campaign_id,
        draw_tier,
        prize_value,
        budget_tier,
        mechanisms: mechanism_flags
      })
    } catch (error) {
      /*
       * 监控指标记录失败不应该阻断结算
       * 记录错误日志，但继续执行
       */
      this.log('warn', '监控指标记录失败（非致命）', {
        campaign_id,
        error: error.message
      })
    }
  }

  /**
   * 记录实时指标到 Redis（事务提交后调用）
   *
   * 用途：
   * - 实时仪表板查询（低延迟读取）
   * - Redis INCR 原子操作确保高并发数据准确性
   * - 数据保留 25 小时（比小时聚合周期多 1 小时容错）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.user_id - 用户ID
   * @param {string} params.draw_tier - 抽奖档位 (high/mid/low/fallback)
   * @param {number} params.prize_value - 奖品价值（积分）
   * @param {string} params.budget_tier - 预算分层 (B0/B1/B2/B3)
   * @param {Object} params.mechanisms - 体验机制触发情况
   * @returns {Promise<void>} 无返回值，异步完成
   * @private
   */
  async _recordRealtimeMetrics(params) {
    const { campaign_id, user_id, draw_tier, prize_value, budget_tier, mechanisms } = params

    const metrics_collector = getLotteryMetricsCollector()

    // 解析机制触发情况
    const mechanism_flags = {
      pity_triggered:
        mechanisms?.smoothing_applied &&
        mechanisms?.applied_mechanisms?.some(m => m.type === 'pity'),
      anti_empty_triggered: mechanisms?.anti_empty_result?.forced === true,
      anti_high_triggered: mechanisms?.anti_high_result?.tier_capped === true,
      luck_debt_triggered: mechanisms?.luck_debt_result?.debt_level !== 'none'
    }

    /*
     * 记录到 Redis
     * 🔴 修正参数名：LotteryMetricsCollector 期望 selected_tier 和 triggers
     */
    await metrics_collector.recordDraw({
      campaign_id,
      user_id,
      selected_tier: draw_tier, // 映射 draw_tier → selected_tier
      prize_value,
      budget_tier,
      triggers: mechanism_flags // 映射 mechanisms → triggers
    })

    this.log('debug', 'Redis 实时指标已记录', {
      campaign_id,
      user_id,
      selected_tier: draw_tier
    })
  }
}

module.exports = SettleStage
