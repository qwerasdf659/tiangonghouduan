'use strict'

/**
 * SettleStage - 结算阶段 Stage（唯一写入点）
 *
 * 职责：
 * 1. 创建抽奖记录（lottery_draws）
 * 2. 记录决策快照（lottery_draw_decisions）
 * 3. 扣减奖品库存
 * 4. 扣减用户预算（通过 BudgetProvider）
 * 5. 发放奖品到用户背包
 * 6. 更新用户配额（如果有）
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
 * @module services/UnifiedLotteryEngine/pipeline/stages/SettleStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const {
  LotteryDraw,
  LotteryDrawDecision,
  LotteryPrize: _LotteryPrize,
  LotteryCampaignUserQuota: _LotteryCampaignUserQuota,
  sequelize
} = require('../../../../models')
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const AssetService = require('../../../AssetService')

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
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id, idempotency_key, lottery_session_id } = context

    this.log('info', '开始结算阶段', { user_id, campaign_id, idempotency_key })

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

    // 获取预算上下文
    const budget_data = this.getContextData(context, 'BudgetContextStage.data') || {}
    const budget_provider = context.stage_data?.budget_provider

    // 使用外部事务或创建新事务
    const use_external_transaction = !!context.transaction
    const transaction = context.transaction || (await sequelize.transaction())

    try {
      // 1. 生成唯一的抽奖ID
      const draw_id = this._generateDrawId(user_id)

      // 2. 扣减奖品库存
      await this._deductPrizeStock(final_prize, transaction)

      // 3. 扣减用户预算
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

      // 4. 发放奖品到用户背包
      await this._distributePrize(user_id, final_prize, {
        idempotency_key,
        lottery_session_id,
        transaction
      })

      // 5. 创建抽奖记录
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

      // 提交事务（如果是内部创建的事务）
      if (!use_external_transaction) {
        await transaction.commit()
        this.log('info', '结算事务已提交', { user_id, campaign_id, draw_id })
      }

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
          budget_after: budget_data.budget_before - budget_deducted
        }
      }

      this.log('info', '结算阶段完成', {
        user_id,
        campaign_id,
        draw_id,
        prize_id: final_prize.prize_id,
        prize_name: final_prize.prize_name,
        budget_deducted
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
      transaction
    } = params

    // 生成业务唯一键
    const business_id = `lottery_draw_${user_id}_${lottery_session_id || 'no_session'}_${draw_id}`

    return await LotteryDraw.create(
      {
        draw_id,
        business_id,
        idempotency_key,
        lottery_session_id,
        user_id,
        lottery_id: campaign_id,
        campaign_id,
        draw_type: 'single',
        prize_id: final_prize.prize_id,
        prize_name: final_prize.prize_name,
        prize_type: final_prize.prize_type,
        prize_value: final_prize.prize_value,
        cost_points: 100, // 默认抽奖消耗积分
        reward_tier: final_tier,
        guarantee_triggered,
        prize_value_points: final_prize.prize_value_points || 0,
        budget_points_before: budget_data.budget_before || null,
        budget_points_after: (budget_data.budget_before || 0) - budget_deducted,
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
}

module.exports = SettleStage
