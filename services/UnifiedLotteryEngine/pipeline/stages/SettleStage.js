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
  LotteryManagementSetting, // 管理干预设置（force_win 使用后标记为 used）
  LotteryPreset, // 预设队列（使用后标记为 used）
  sequelize
} = require('../../../../models')
const BeijingTimeHelper = require('../../../../utils/timeHelper')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('../../../asset/BalanceService')
const ItemService = require('../../../asset/ItemService')
const { getInstance: getLotteryMetricsCollector } = require('../../../LotteryMetricsCollector') // 🆕 实时Redis指标采集

// 体验状态管理器 - 用于更新用户抽奖体验计数器（Pity/AntiEmpty/AntiHigh）
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
   * @param {number} context.lottery_campaign_id - 活动ID
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
      lottery_campaign_id,
      idempotency_key,
      lottery_session_id,
      draw_count = 1, // 🆕 支持连抽次数
      batch_id = null // 🆕 Phase 2：连抽批次ID（由外层生成）
    } = context

    this.log('info', '开始结算阶段', { user_id, lottery_campaign_id, idempotency_key, draw_count })

    // 幂等性检查
    const existing_draw = await this._checkIdempotency(idempotency_key)
    if (existing_draw) {
      this.log('info', '幂等检查：抽奖记录已存在，返回已有结果', {
        user_id,
        lottery_campaign_id,
        idempotency_key,
        lottery_draw_id: existing_draw.lottery_draw_id
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
     * 🔧 2026-01-28 修复：区分 draw_cost（批次总成本）和 per_draw_cost（单次成本）
     */
    const pricing_data = this.getContextData(context, 'PricingStage.data')
    if (!pricing_data || pricing_data.draw_cost === undefined) {
      throw this.createError(
        'PricingStage 未提供 draw_cost，请确保 PricingStage 已执行',
        'MISSING_PRICING_DATA',
        true
      )
    }
    const draw_cost = pricing_data.draw_cost // 批次总成本（用于扣款）
    const per_draw_cost = pricing_data.per_draw_cost || pricing_data.unit_cost || draw_cost // 单次抽奖成本（用于记录）

    // 获取预算上下文
    const budget_data = this.getContextData(context, 'BudgetContextStage.data') || {}
    /**
     * 🔴 2026-02-15 修复：budget_provider 获取逻辑加固
     *
     * 修复根因：
     * - 原代码只从 context.stage_data?.budget_provider 获取
     * - 但 BudgetContextStage 同时在 stage_results 和 stage_data 两处存储
     * - 当 context.stage_data 为空时（如管线上下文初始化不完整），budget_provider 为 null
     * - 导致高价值奖品的预算扣减被完全跳过
     *
     * 修复方案：双重取值 + 日志告警
     */
    const budget_provider = budget_data.budget_provider || context.stage_data?.budget_provider
    if (!budget_provider && budget_data.budget_mode && budget_data.budget_mode !== 'none') {
      this.log('error', '🔴 budget_provider 获取失败！预算扣减将被跳过', {
        user_id,
        lottery_campaign_id,
        budget_mode: budget_data.budget_mode,
        has_stage_data: !!context.stage_data,
        has_budget_data_provider: !!budget_data.budget_provider
      })
    }

    // 使用外部事务或创建新事务
    const use_external_transaction = !!context.transaction
    const transaction = context.transaction || (await sequelize.transaction())

    try {
      // 1. 生成唯一的抽奖ID
      const lottery_draw_id = this._generateDrawId(user_id)

      /*
       * ========== 🆕 Phase 2 增强：扣减用户积分 ==========
       * 🔴 连抽场景：检查是否跳过积分扣减（由外层统一处理）
       */
      const skip_points_deduction = context.skip_points_deduction === true
      let points_deducted = 0
      let asset_transaction_id = null // 资产流水ID（关联抽奖记录）

      if (draw_cost > 0 && !skip_points_deduction) {
        /**
         * 幂等键派生规则：idempotency_key + ':consume'
         * 确保重复请求时不会重复扣减积分
         */
        const consume_idempotency_key = `${idempotency_key}:consume`

        const burnAccount = await BalanceService.getOrCreateAccount(
          { system_code: 'SYSTEM_BURN' },
          { transaction }
        )
        // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
        const asset_result = await BalanceService.changeBalance(
          {
            user_id,
            asset_code: 'POINTS',
            delta_amount: -draw_cost,
            idempotency_key: consume_idempotency_key,
            lottery_session_id,
            business_type: 'lottery_consume',
            counterpart_account_id: burnAccount.account_id,
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
        // 获取资产流水ID（用于关联抽奖记录，必填字段）
        asset_transaction_id = asset_result.transaction_record?.transaction_id || null

        this.log('info', '用户积分扣减成功', {
          user_id,
          draw_cost,
          asset_transaction_id,
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
            lottery_campaign_id,
            lottery_prize_id: final_prize.lottery_prize_id,
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
        idempotency_key: reward_idempotency_key,
        lottery_session_id,
        lottery_draw_id,
        transaction
      })

      /**
       * 🔴 2026-02-15 修复：获取档位选择元数据用于审计
       * 之前 original_tier, final_tier, pick_method, downgrade_count 等字段全部为 NULL
       * 现在从 TierPickStage 的结果中提取并写入 lottery_draws 记录
       */
      const tier_pick_data = this.getContextData(context, 'TierPickStage.data') || {}

      // 5. 创建抽奖记录（使用单次抽奖成本 per_draw_cost）
      const draw_record = await this._createDrawRecord({
        lottery_draw_id,
        user_id,
        lottery_campaign_id,
        final_prize,
        final_tier,
        guarantee_triggered,
        idempotency_key,
        lottery_session_id,
        budget_data,
        budget_deducted,
        points_deducted, // 🆕 传递积分扣减信息
        per_draw_cost, // 🔧 2026-01-28 修复：传递单次抽奖成本（用于 cost_points 字段）
        draw_count, // 🆕 传递抽奖次数
        batch_id, // 🆕 Phase 2：连抽批次ID
        asset_transaction_id, // 🆕 关联资产流水ID（必填字段）
        tier_pick_data, // 🔴 2026-02-15 修复：传递档位选择元数据
        transaction
      })

      // 6. 记录决策快照
      const decision_record = await this._createDecisionRecord({
        lottery_draw_id,
        user_id,
        lottery_campaign_id,
        idempotency_key, // 🆕 传递幂等键（必填字段）
        decision_snapshot,
        transaction
      })

      // 7. 更新活动统计计数器（total_draws / total_prizes_awarded）
      await this._updateCampaignCounters(lottery_campaign_id, transaction)

      // 8. 更新用户配额（如果有）
      await this._updateUserQuota(user_id, lottery_campaign_id, transaction)

      /*
       * ========== Phase 9-16 增强：更新用户体验状态 ==========
       * 用于 Pity 系统、Anti-Empty Streak、Anti-High Streak、Luck Debt 机制
       *
       * 规则：
       * - 空奖（empty tier）：增加空奖连击计数
       * - 非空奖：重置空奖连击，增加对应档位计数
       * - 全局状态：记录跨活动的抽奖统计
       */
      /**
       * 🔴 2026-02-15 修复：传递 anti_high_triggered 和 cooldown_draws
       *
       * 修复根因：
       * - 原代码未传递体验平滑触发信息到 _updateExperienceState
       * - 导致 AntiHigh 触发后冷却期从未设置
       * - ExperienceStateManager 的 anti_high_cooldown 字段永远为 0
       * - AntiHigh 在同一用户连续抽奖时无法正确进入冷却期
       */
      const experience_smoothing = tier_pick_data.experience_smoothing || {}
      const anti_high_mechanism = (experience_smoothing.mechanisms || []).find(
        m => m.type === 'anti_high'
      )

      await this._updateExperienceState({
        user_id,
        lottery_campaign_id,
        final_tier,
        final_prize,
        anti_high_triggered: !!anti_high_mechanism,
        cooldown_draws: anti_high_mechanism ? 3 : 0, // AntiHigh 默认冷却 3 次
        transaction
      })

      /*
       * ========== Phase P2 增强：记录监控指标 ==========
       * 按小时聚合监控数据，用于活动健康度监控和策略效果评估
       */
      await this._recordHourlyMetrics({
        lottery_campaign_id,
        draw_tier: final_tier,
        prize_value: final_prize.prize_value_points || 0,
        budget_tier: budget_data?.budget_tier || null,
        mechanisms: decision_snapshot.experience_smoothing || {},
        transaction
      })

      /*
       * ========== 2026-02-15 修复：消耗决策来源 ==========
       * 抽奖完成后，将命中的预设/管理干预标记为已使用（status='used'）
       *
       * 修复根因：
       * - 原代码没有在抽奖成功后消耗决策来源
       * - 导致 force_win 管理干预永远不会变成 used 状态
       * - 用户每次抽奖都会反复命中同一条 active 的 force_win 规则
       * - 同理，预设队列也不会自动消耗
       *
       * 修复方案：在同一事务内将已使用的预设/干预标记为 used
       */
      await this._consumeDecisionSource(context, transaction)

      // 提交事务（如果是内部创建的事务）
      if (!use_external_transaction) {
        await transaction.commit()
        this.log('info', '结算事务已提交', { user_id, lottery_campaign_id, lottery_draw_id })
      }

      /*
       * ========== Phase P2 增强：Redis 实时指标采集 ==========
       * 事务提交成功后，异步记录到 Redis 实时层
       * - 用途：实时仪表板查询（低延迟）
       * - 特点：fire-and-forget，不阻塞主流程
       * - 数据流：Redis 实时层 → 小时聚合任务 → MySQL lottery_hourly_metrics
       */
      this._recordRealtimeMetrics({
        lottery_campaign_id,
        user_id,
        draw_tier: final_tier,
        prize_value: final_prize.prize_value_points || 0,
        budget_tier: budget_data?.budget_tier || null,
        mechanisms: decision_snapshot.experience_smoothing || {}
      }).catch(redis_error => {
        // Redis 记录失败不影响主业务，仅记录日志
        this.log('warn', 'Redis 实时指标记录失败（非致命）', {
          lottery_campaign_id,
          error: redis_error.message
        })
      })

      // 构建返回数据
      const result = {
        draw_record: draw_record.toJSON(),
        decision_record: decision_record.toJSON(),
        is_duplicate: false,
        settle_result: {
          lottery_draw_id,
          lottery_prize_id: final_prize.lottery_prize_id,
          prize_name: final_prize.prize_name,
          prize_type: final_prize.prize_type,
          prize_value: final_prize.prize_value,
          prize_value_points: final_prize.prize_value_points,
          reward_tier: final_tier,
          guarantee_triggered,
          budget_deducted,
          budget_after: budget_data.budget_before - budget_deducted,
          // 🆕 增加积分扣减信息
          draw_cost,
          points_deducted,
          skip_points_deduction,
          /**
           * 前端展示所需字段（多活动抽奖系统）
           * sort_order: 九宫格位置编号（顺时针 1-8），来自 lottery_prizes 表
           * rarity_code: 稀有度代码（来自 rarity_defs 外键），前端直接使用此字段名显示光效
           */
          sort_order: final_prize.sort_order,
          rarity_code: final_prize.rarity_code || 'common'
        }
      }

      this.log('info', '结算阶段完成', {
        user_id,
        lottery_campaign_id,
        lottery_draw_id,
        lottery_prize_id: final_prize.lottery_prize_id,
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
            lottery_campaign_id,
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
        lottery_campaign_id,
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
      this.log('debug', '奖品为无限库存，跳过扣减', { lottery_prize_id: prize.lottery_prize_id })
      return
    }

    // 使用原子操作扣减库存
    const [affected_rows] = await sequelize.query(
      `UPDATE lottery_prizes 
       SET stock_quantity = stock_quantity - 1, 
           daily_win_count = daily_win_count + 1,
           total_win_count = total_win_count + 1
       WHERE lottery_prize_id = ? AND stock_quantity >= 1`,
      {
        replacements: [prize.lottery_prize_id],
        transaction,
        type: sequelize.QueryTypes.UPDATE
      }
    )

    if (affected_rows === 0) {
      throw this.createError(`奖品库存不足: ${prize.prize_name}`, 'INSUFFICIENT_STOCK', true)
    }

    this.log('debug', '奖品库存扣减成功', {
      lottery_prize_id: prize.lottery_prize_id,
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
      const { user_id, lottery_campaign_id, lottery_prize_id, idempotency_key, transaction } =
        options
      const result = await budget_provider.deductBudget(
        {
          user_id,
          lottery_campaign_id,
          amount,
          reason: `抽奖扣减预算 lottery_prize_id=${lottery_prize_id}`,
          reference_id: idempotency_key
        },
        { transaction }
      )
      return result.deducted || amount
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
    const { idempotency_key, lottery_session_id, lottery_draw_id, transaction } = options

    try {
      const mintAccount = await BalanceService.getOrCreateAccount(
        { system_code: 'SYSTEM_MINT' },
        { transaction }
      )

      switch (prize.prize_type) {
        case 'points':
          // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
          await BalanceService.changeBalance(
            {
              user_id,
              asset_code: 'POINTS',
              delta_amount: parseInt(prize.prize_value),
              idempotency_key: `${idempotency_key}:points`,
              lottery_session_id,
              business_type: 'lottery_reward',
              counterpart_account_id: mintAccount.account_id,
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
          // 优惠券/实物：写入 items + item_ledger 双录（三表模型）
          await ItemService.mintItem(
            {
              user_id,
              item_type: prize.prize_type === 'coupon' ? 'voucher' : 'product',
              source: 'lottery',
              source_ref_id: lottery_draw_id ? String(lottery_draw_id) : null,
              item_name: prize.prize_name,
              item_description: prize.prize_description || `抽奖获得：${prize.prize_name}`,
              item_value: Math.round(parseFloat(prize.prize_value) || 0),
              prize_definition_id: prize.lottery_prize_id,
              rarity_code: prize.rarity_code || 'common',
              business_type: 'lottery_mint',
              idempotency_key: `${idempotency_key}:item`,
              meta: {
                lottery_draw_id,
                lottery_session_id,
                prize_type: prize.prize_type,
                acquisition_method: 'lottery'
              }
            },
            { transaction }
          )
          break

        case 'virtual':
          if (prize.material_asset_code && prize.material_amount) {
            // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
            await BalanceService.changeBalance(
              {
                user_id,
                asset_code: prize.material_asset_code,
                delta_amount: prize.material_amount,
                idempotency_key: `${idempotency_key}:material`,
                business_type: 'lottery_reward_material',
                counterpart_account_id: mintAccount.account_id,
                meta: {
                  lottery_prize_id: prize.lottery_prize_id,
                  prize_name: prize.prize_name
                }
              },
              { transaction }
            )

            /* 钻石奖品扣减 DIAMOND_QUOTA（双池隔离第二轨道） */
            if (prize.material_asset_code === 'DIAMOND') {
              await this._deductDiamondQuota(user_id, prize.material_amount, {
                idempotency_key: `${idempotency_key}:quota_deduct`,
                lottery_prize_id: prize.lottery_prize_id,
                transaction
              })
            }
          }
          break

        default:
          this.log('warn', '未知奖品类型，跳过发放', {
            lottery_prize_id: prize.lottery_prize_id,
            prize_type: prize.prize_type
          })
      }

      this.log('debug', '奖品发放完成', {
        user_id,
        lottery_prize_id: prize.lottery_prize_id,
        prize_type: prize.prize_type
      })
    } catch (error) {
      this.log('error', '奖品发放失败', {
        user_id,
        lottery_prize_id: prize.lottery_prize_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 扣减钻石配额（抽中钻石奖品时）
   *
   * 双池隔离第二轨道：预算积分管实物/券/水晶，钻石配额管钻石。
   * 扣减失败不阻断结算（配额可能未启用或余额不足），仅记录日志。
   *
   * @param {number} user_id - 用户ID
   * @param {number} diamond_amount - 发放的钻石数量
   * @param {Object} options - 扣减选项
   * @param {string} options.idempotency_key - 幂等键
   * @param {number} options.lottery_prize_id - 奖品ID
   * @param {Object} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _deductDiamondQuota(user_id, diamond_amount, options) {
    const { idempotency_key, lottery_prize_id, transaction } = options

    try {
      const burnAccount = await BalanceService.getOrCreateAccount(
        { system_code: 'SYSTEM_BURN' },
        { transaction }
      )

      // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
      await BalanceService.changeBalance(
        {
          user_id,
          asset_code: 'DIAMOND_QUOTA',
          delta_amount: -diamond_amount,
          idempotency_key,
          business_type: 'lottery_quota_deduct',
          counterpart_account_id: burnAccount.account_id,
          meta: {
            lottery_prize_id,
            diamond_amount,
            description: `抽奖扣减钻石配额 ${diamond_amount}`
          }
        },
        { transaction }
      )

      this.log('info', '钻石配额扣减成功', {
        user_id,
        diamond_amount,
        lottery_prize_id
      })
    } catch (error) {
      this.log('warn', '钻石配额扣减失败（非致命，配额可能未初始化）', {
        user_id,
        diamond_amount,
        lottery_prize_id,
        error: error.message
      })
    }
  }

  /**
   * 创建抽奖记录
   *
   * @param {Object} params - 参数
   * @param {string} params.lottery_draw_id - 抽奖ID
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {Object} params.final_prize - 中奖奖品
   * @param {string} params.final_tier - 最终档位
   * @param {boolean} params.guarantee_triggered - 是否触发保底
   * @param {string} params.idempotency_key - 幂等键
   * @param {string} params.lottery_session_id - 抽奖会话ID
   * @param {Object} params.budget_data - 预算数据
   * @param {number} params.budget_deducted - 预算扣减金额
   * @param {number} params.points_deducted - 积分扣减金额（🆕 Phase 2）
   * @param {number} params.per_draw_cost - 单次抽奖成本（🔧 2026-01-28 修复：用于 cost_points 字段）
   * @param {number} params.draw_count - 抽奖次数（🆕 Phase 2，1=单抽，>1=连抽）
   * @param {string} params.batch_id - 批次ID（🆕 Phase 2，连抽批次标识）
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<Object>} 抽奖记录
   * @private
   */
  async _createDrawRecord(params) {
    const {
      lottery_draw_id,
      user_id,
      lottery_campaign_id,
      final_prize,
      final_tier,
      guarantee_triggered,
      idempotency_key,
      lottery_session_id,
      budget_data,
      budget_deducted,
      points_deducted = 0, // 🆕 Phase 2：积分扣减金额
      per_draw_cost = 0, // 🔧 2026-01-28 修复：单次抽奖成本（用于 cost_points 字段）
      draw_count = 1, // 🆕 Phase 2：抽奖次数
      batch_id = null, // 🆕 Phase 2：连抽批次ID
      asset_transaction_id = null, // 🆕 关联资产流水ID（用于对账）
      tier_pick_data = {}, // 🔴 2026-02-15 修复：档位选择元数据
      transaction
    } = params

    // 生成业务唯一键
    const business_id = `lottery_draw_${user_id}_${lottery_session_id || 'no_session'}_${lottery_draw_id}`

    /*
     * 🆕 Phase 2 增强：
     * - draw_type：根据 draw_count 动态确定（single/multi）
     * - cost_points：使用单次抽奖成本 per_draw_cost（🔧 2026-01-28 修复）
     */
    const draw_type = draw_count > 1 ? 'multi' : 'single'

    /*
     * asset_transaction_id 处理策略：
     * - 有积分扣减时：使用 BalanceService 返回的流水 ID
     * - 免费抽奖时（per_draw_cost=0）：使用 0 表示无流水记录
     * - 连抽子请求跳过扣减时：使用 0 表示由批量扣减统一处理
     */
    const final_asset_transaction_id = asset_transaction_id || 0

    return await LotteryDraw.create(
      {
        lottery_draw_id,
        business_id,
        idempotency_key,
        lottery_session_id,
        user_id,
        lottery_id: lottery_campaign_id,
        lottery_campaign_id,
        draw_type, // 🆕 动态确定（single/multi）
        lottery_batch_id: batch_id, // 🆕 Phase 2：连抽批次ID（null 表示单抽）
        asset_transaction_id: final_asset_transaction_id, // 🆕 关联资产流水ID（必填字段）
        lottery_prize_id: final_prize.lottery_prize_id,
        prize_name: final_prize.prize_name,
        prize_type: final_prize.prize_type,
        prize_value: final_prize.prize_value,
        cost_points: per_draw_cost, // 🔧 2026-01-28 修复：使用单次抽奖成本（连抽时每条记录应该是 per_draw 而非 total_cost）
        reward_tier: final_tier,
        guarantee_triggered,
        prize_value_points: final_prize.prize_value_points || 0,
        budget_points_before: budget_data.budget_before || null,
        budget_points_after: (budget_data.budget_before || 0) - budget_deducted,
        points_deducted, // 🆕 记录实际积分扣减金额
        /**
         * 🔴 2026-02-15 修复：写入档位选择审计字段
         * 之前这些字段全部为 NULL，导致无法事后追踪中奖率异常
         */
        pipeline_type: 'normal',
        /**
         * pick_method 判定：
         * - TierPickStage 正常执行（有 weight_scale）→ tier_first
         * - TierPickStage 跳过（preset/override/guarantee 模式）→ 从 skip_reason 推断
         */
        pick_method: tier_pick_data.weight_scale
          ? 'tier_first'
          : tier_pick_data.skip_reason || 'tier_first',
        /**
         * original_tier 字段类型为 ENUM('high','mid','low')，不含 'fallback'
         * 当 _pickTier 原始选中 'fallback' 时，写入 null 避免 ENUM 溢出错误
         */
        original_tier: ['high', 'mid', 'low'].includes(tier_pick_data.original_tier)
          ? tier_pick_data.original_tier
          : null,
        final_tier: final_tier || null,
        downgrade_count: Math.max(0, (tier_pick_data.tier_downgrade_path?.length || 1) - 1),
        fallback_triggered:
          final_tier === 'fallback' && tier_pick_data.original_tier !== 'fallback',
        /**
         * 2026-03-04 架构重构：写入 budget_tier 和 pressure_tier 到 result_metadata
         * budget_tier 降级为纯监控指标，通过 result_metadata 支持运营报表和日志追踪
         */
        result_metadata: {
          budget_tier: budget_data?.budget_tier || null,
          pressure_tier: budget_data?.pressure_tier || tier_pick_data?.pressure_tier || null,
          effective_budget: budget_data?.effective_budget || 0,
          weight_adjustment: tier_pick_data?.weight_adjustment || null
        },
        created_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )
  }

  /**
   * 创建决策记录
   *
   * 🔴 2026-01-29 修复：补写策略引擎审计字段
   * - budget_tier: 预算分层（B0/B1/B2/B3）
   * - pressure_tier: 活动压力分层（P0/P1/P2）
   * - effective_budget: 有效预算（统一计算口径）
   * - pity_decision: Pity 系统决策信息（JSON）
   * - luck_debt_decision: 运气债务决策信息（JSON）
   * - experience_smoothing: 体验平滑机制应用记录（JSON）
   * - weight_adjustment: BxPx 矩阵权重调整信息（JSON）
   * - available_tiers: 可用档位列表（JSON）
   *
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 决策记录
   * @private
   */
  async _createDecisionRecord(params) {
    const {
      lottery_draw_id,
      user_id,
      lottery_campaign_id,
      idempotency_key,
      decision_snapshot,
      transaction
    } = params

    // 提取预算快照数据
    const budget_snapshot = decision_snapshot.budget_snapshot || {}

    // 提取策略快照数据
    const strategy_snapshot = decision_snapshot.strategy_snapshot || {}

    // 构建 Pity 系统决策信息（JSON）
    const pity_decision = {
      enabled: strategy_snapshot.pity_system?.enabled || false,
      soft_triggered: strategy_snapshot.pity_system?.soft_triggered || false,
      hard_triggered: strategy_snapshot.pity_system?.hard_triggered || false,
      boost_percentage: strategy_snapshot.pity_system?.boost_percentage || 0,
      empty_streak: strategy_snapshot.experience_state?.empty_streak || 0
    }

    // 构建运气债务决策信息（JSON）
    const luck_debt_decision = {
      enabled: strategy_snapshot.luck_debt?.enabled || false,
      global_draw_count: strategy_snapshot.luck_debt?.global_draw_count || 0,
      historical_empty_rate: strategy_snapshot.luck_debt?.historical_empty_rate || 0,
      debt_level: strategy_snapshot.luck_debt?.debt_level || 'none',
      debt_multiplier: strategy_snapshot.luck_debt?.debt_multiplier || 1.0
    }

    // 构建体验平滑机制应用记录（JSON）
    const experience_smoothing = {
      pity_applied: pity_decision.soft_triggered || pity_decision.hard_triggered,
      anti_empty_triggered: strategy_snapshot.anti_streak?.anti_empty_triggered || false,
      anti_high_triggered: strategy_snapshot.anti_streak?.anti_high_triggered || false,
      forced_tier: strategy_snapshot.anti_streak?.forced_tier || null,
      capped_max_tier: strategy_snapshot.anti_streak?.capped_max_tier || null,
      smoothing_applied:
        pity_decision.soft_triggered ||
        pity_decision.hard_triggered ||
        strategy_snapshot.anti_streak?.anti_empty_triggered ||
        strategy_snapshot.anti_streak?.anti_high_triggered,
      applied_mechanisms: this._buildAppliedMechanismsList(strategy_snapshot)
    }

    // 构建 BxPx 矩阵权重调整信息（JSON）
    const tier_decision = decision_snapshot.tier_decision || {}
    const weight_adjustment = {
      base_weights: tier_decision.base_weights || tier_decision.tier_weights || {},
      adjusted_weights: tier_decision.adjusted_weights || tier_decision.tier_weights || {},
      weight_adjustments: tier_decision.weight_adjustments || {},
      total_multiplier: strategy_snapshot.total_weight_adjustment || 1.0,
      cap_multiplier: budget_snapshot.cap_multiplier || null,
      empty_weight_multiplier: budget_snapshot.empty_weight_multiplier || null
    }

    // 提取可用档位列表（JSON）
    const prize_pool_snapshot = decision_snapshot.prize_pool_snapshot || {}
    const available_tiers = prize_pool_snapshot.available_tiers || []

    return await LotteryDrawDecision.create(
      {
        lottery_draw_id,
        user_id,
        lottery_campaign_id,
        idempotency_key, // 幂等键（必填字段，与lottery_draws.idempotency_key对应）
        pipeline_type: 'normal',
        segment_key: decision_snapshot.tier_decision?.user_segment || 'default',

        // 档位选择相关
        selected_tier: decision_snapshot.tier_decision?.selected_tier,
        original_tier: decision_snapshot.tier_decision?.original_tier,
        final_tier: decision_snapshot.final_result?.reward_tier,
        tier_downgrade_triggered:
          (decision_snapshot.tier_decision?.downgrade_path?.length || 0) > 1,
        downgrade_count: Math.max(
          0,
          (decision_snapshot.tier_decision?.downgrade_path?.length || 1) - 1
        ),

        /**
         * 随机数审计（random_value 已在 TierPickStage 中乘以 WEIGHT_SCALE）
         * random_value 范围：0 ~ 1,000,000，直接取整存入 UNSIGNED INT 字段
         */
        random_seed: Math.min(
          Math.round(decision_snapshot.tier_decision?.random_value || 0),
          4294967295
        ),

        // 预算相关
        budget_provider_type: budget_snapshot.budget_mode === 'none' ? 'none' : 'user',
        budget_deducted: budget_snapshot.budget_before
          ? budget_snapshot.budget_before - (budget_snapshot.budget_after || 0)
          : 0,

        // 保底相关
        guarantee_triggered: decision_snapshot.guarantee_decision?.guarantee_triggered || false,
        guarantee_type: decision_snapshot.guarantee_decision?.guarantee_triggered
          ? 'consecutive'
          : 'none',

        // 决策上下文
        decision_context: decision_snapshot.decision_factors || [],

        // 时间戳
        decision_at: BeijingTimeHelper.createBeijingTime(),

        // ============== 策略引擎审计字段（2026-01-29 修复） ==============

        // 预算分层（B0/B1/B2/B3）
        budget_tier: budget_snapshot.budget_tier || null,

        // 活动压力分层（P0/P1/P2）
        pressure_tier: budget_snapshot.pressure_tier || null,

        // 有效预算（统一计算口径）
        effective_budget: budget_snapshot.effective_budget || null,

        // 预算上限值
        cap_value: budget_snapshot.calculated_cap || null,

        // Pity 系统决策信息（JSON）
        pity_decision,

        // 运气债务决策信息（JSON）
        luck_debt_decision,

        // 体验平滑机制应用记录（JSON）
        experience_smoothing,

        // BxPx 矩阵权重调整信息（JSON）
        weight_adjustment,

        // 可用档位列表（JSON）
        available_tiers,

        created_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )
  }

  /**
   * 构建已应用的体验机制列表
   *
   * @param {Object} strategy_snapshot - 策略快照
   * @returns {Array} 已应用的机制列表
   * @private
   */
  _buildAppliedMechanismsList(strategy_snapshot) {
    const mechanisms = []

    // Pity 软保底
    if (strategy_snapshot.pity_system?.soft_triggered) {
      mechanisms.push({
        type: 'pity_soft',
        description: `Pity软保底：非空奖概率提升 ${strategy_snapshot.pity_system.boost_percentage || 0}%`
      })
    }

    // Pity 硬保底
    if (strategy_snapshot.pity_system?.hard_triggered) {
      mechanisms.push({
        type: 'pity_hard',
        description: 'Pity硬保底：强制发放非空奖品'
      })
    }

    // 防连续空奖
    if (strategy_snapshot.anti_streak?.anti_empty_triggered) {
      mechanisms.push({
        type: 'anti_empty',
        description: `防连续空奖：强制发放 ${strategy_snapshot.anti_streak.forced_tier || '非空'} 档位`
      })
    }

    // 防连续高价值
    if (strategy_snapshot.anti_streak?.anti_high_triggered) {
      mechanisms.push({
        type: 'anti_high',
        description: `防连续高价值：档位上限为 ${strategy_snapshot.anti_streak.capped_max_tier || 'mid'}`
      })
    }

    // 运气债务补偿
    if (
      strategy_snapshot.luck_debt?.debt_level &&
      strategy_snapshot.luck_debt.debt_level !== 'none'
    ) {
      mechanisms.push({
        type: 'luck_debt',
        description: `运气债务补偿(${strategy_snapshot.luck_debt.debt_level})：权重乘数 ${strategy_snapshot.luck_debt.debt_multiplier || 1.0}`
      })
    }

    return mechanisms
  }

  /**
   * 更新活动统计计数器
   *
   * 原子递增 lottery_campaigns 表的 total_draws 和 total_prizes_awarded 字段，
   * 确保策略效果分析页面的"总抽奖次数"和"总发奖次数"与实际数据一致。
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _updateCampaignCounters(lottery_campaign_id, transaction) {
    try {
      await sequelize.query(
        `UPDATE lottery_campaigns 
         SET total_draws = total_draws + 1, 
             total_prizes_awarded = total_prizes_awarded + 1,
             updated_at = NOW()
         WHERE lottery_campaign_id = ?`,
        {
          replacements: [lottery_campaign_id],
          transaction,
          type: sequelize.QueryTypes.UPDATE
        }
      )

      this.log('debug', '活动计数器已更新', { lottery_campaign_id })
    } catch (error) {
      this.log('warn', '活动计数器更新失败（非致命）', {
        lottery_campaign_id,
        error: error.message
      })
    }
  }

  /**
   * 更新用户配额
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _updateUserQuota(user_id, lottery_campaign_id, transaction) {
    try {
      // 使用原子操作更新配额（字段名: quota_used, quota_remaining）
      const [affected_rows] = await sequelize.query(
        `UPDATE lottery_campaign_user_quota 
         SET quota_used = quota_used + 1, 
             quota_remaining = GREATEST(quota_remaining - 1, 0),
             last_used_at = NOW(),
             updated_at = NOW()
         WHERE user_id = ? AND lottery_campaign_id = ? AND status = 'active'`,
        {
          replacements: [user_id, lottery_campaign_id],
          transaction,
          type: sequelize.QueryTypes.UPDATE
        }
      )

      if (affected_rows > 0) {
        this.log('debug', '用户配额已更新', { user_id, lottery_campaign_id })
      }
    } catch (error) {
      // 配额更新失败不应该阻断结算
      this.log('warn', '用户配额更新失败（非致命）', {
        user_id,
        lottery_campaign_id,
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
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {string} params.final_tier - 最终奖品档位
   * @param {Object} params.final_prize - 中奖奖品对象
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _updateExperienceState(params) {
    const {
      user_id,
      lottery_campaign_id,
      final_tier,
      final_prize: _final_prize, // eslint-disable-line no-unused-vars -- 保留参数完整性，用于未来扩展
      anti_high_triggered = false,
      cooldown_draws = 0,
      transaction
    } = params

    try {
      /*
       * 1. 更新活动级体验状态（用于 Pity / Anti-Empty / Anti-High）
       */
      const experience_manager = new ExperienceStateManager()

      /**
       * 🔴 2026-02-15 严重BUG修复：is_empty 判定逻辑
       *
       * 修复方案：只有 'fallback' 和 'empty' 档位才算真正的空奖
       * low 档位的零值奖品是"参与奖"，不计入空奖统计
       */
      const is_empty = final_tier === 'empty' || final_tier === 'fallback'

      await experience_manager.updateState(
        {
          user_id,
          lottery_campaign_id,
          draw_tier: final_tier,
          is_empty,
          anti_high_triggered,
          cooldown_draws
        },
        { transaction }
      )

      this.log('debug', '活动体验状态已更新', {
        user_id,
        lottery_campaign_id,
        draw_tier: final_tier,
        is_empty
      })

      /*
       * 2. 更新全局状态（用于 Luck Debt 机制）
       */
      const global_manager = new GlobalStateManager()

      // 检查是否是该活动的首次抽奖（用于增加 participated_campaigns 计数）
      const is_first_draw = await global_manager.isFirstParticipation(
        { user_id, lottery_campaign_id },
        { transaction }
      )

      await global_manager.updateState(
        {
          user_id,
          lottery_campaign_id,
          draw_tier: final_tier,
          is_first_draw_in_campaign: is_first_draw
        },
        { transaction }
      )

      this.log('debug', '全局体验状态已更新', {
        user_id,
        lottery_campaign_id,
        draw_tier: final_tier,
        is_first_draw
      })
    } catch (error) {
      /*
       * 体验状态更新失败不应该阻断结算
       * 记录错误日志，但继续执行
       *
       * 🔴 2026-02-15 增强：记录完整错误栈，便于排查 recent_high_count 不更新问题
       */
      this.log('error', '体验状态更新失败（非致命但需关注）', {
        user_id,
        lottery_campaign_id,
        final_tier,
        error: error.message,
        stack: error.stack
      })
    }
  }

  /**
   * 消耗决策来源（标记预设/管理干预为已使用）
   *
   * 业务场景：
   * - force_win 管理干预：使用后标记为 used，避免同一规则被反复命中
   * - 预设队列（preset）：使用后标记为 used，队列自动推进到下一个
   *
   * 在同一事务中执行，确保与抽奖记录创建的原子性：
   * - 如果抽奖失败回滚，决策来源状态也会回滚（不会误消耗）
   * - 如果消耗失败，整个抽奖事务回滚（不会发奖但不消耗规则）
   *
   * @param {Object} context - 执行上下文
   * @param {Object} transaction - Sequelize 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _consumeDecisionSource(context, transaction) {
    const decision_data = this.getContextData(context, 'LoadDecisionSourceStage.data')
    if (!decision_data) return

    const { decision_source } = decision_data

    // 预设模式：标记 LotteryPreset 为已使用
    if (decision_source === 'preset' && decision_data.preset) {
      const lottery_preset_id = decision_data.preset.lottery_preset_id
      if (lottery_preset_id) {
        const [affected_rows] = await LotteryPreset.update(
          { status: 'used' },
          {
            where: { lottery_preset_id, status: 'pending' },
            transaction
          }
        )

        this.log('info', '预设已标记为已使用', {
          lottery_preset_id,
          affected_rows
        })
      }
    }

    // 管理干预模式：标记 LotteryManagementSetting 为已使用
    if (decision_source === 'override' && decision_data.override) {
      const lottery_management_setting_id = decision_data.override.lottery_management_setting_id
      if (lottery_management_setting_id) {
        const [affected_rows] = await LotteryManagementSetting.update(
          { status: 'used' },
          {
            where: { lottery_management_setting_id, status: 'active' },
            transaction
          }
        )

        this.log('info', '管理干预已标记为已使用', {
          lottery_management_setting_id,
          setting_type: decision_data.override.setting_type,
          affected_rows
        })
      }
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
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {string} params.draw_tier - 抽奖档位（high/mid/low/fallback/empty）
   * @param {number} params.prize_value - 奖品价值（积分）
   * @param {string} params.budget_tier - 预算分层（B0/B1/B2/B3）
   * @param {Object} params.mechanisms - 触发的体验机制
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _recordHourlyMetrics(params) {
    const { lottery_campaign_id, draw_tier, prize_value, budget_tier, mechanisms, transaction } =
      params

    try {
      // 获取或创建当前小时的指标记录
      const metrics = await LotteryHourlyMetrics.findOrCreateMetrics(
        lottery_campaign_id,
        new Date(),
        {
          transaction
        }
      )

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
        lottery_campaign_id,
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
        lottery_campaign_id,
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
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {number} params.user_id - 用户ID
   * @param {string} params.draw_tier - 抽奖档位 (high/mid/low/fallback)
   * @param {number} params.prize_value - 奖品价值（积分）
   * @param {string} params.budget_tier - 预算分层 (B0/B1/B2/B3)
   * @param {Object} params.mechanisms - 体验机制触发情况
   * @returns {Promise<void>} 无返回值，异步完成
   * @private
   */
  async _recordRealtimeMetrics(params) {
    const { lottery_campaign_id, user_id, draw_tier, prize_value, budget_tier, mechanisms } = params

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
      lottery_campaign_id,
      user_id,
      selected_tier: draw_tier, // 映射 draw_tier → selected_tier
      prize_value,
      budget_tier,
      triggers: mechanism_flags // 映射 mechanisms → triggers
    })

    this.log('debug', 'Redis 实时指标已记录', {
      lottery_campaign_id,
      user_id,
      selected_tier: draw_tier
    })
  }
}

module.exports = SettleStage
