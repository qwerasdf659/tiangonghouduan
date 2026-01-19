'use strict'

/**
 * OverrideSettleStage - 管理干预结算 Stage（写入点）
 *
 * 职责：
 * 1. 执行干预逻辑（force_win/force_lose）
 * 2. 创建抽奖记录（标记为 override 类型）
 * 3. 记录决策快照（包含干预审计信息）
 * 4. 扣减奖品库存（force_win时）
 * 5. 发放奖品到用户背包（force_win时）
 *
 * 设计原则（Single Writer Principle）：
 * - 所有写操作在同一事务中执行
 * - 幂等性控制
 * - 审计信息必须完整（operator_id, reason, override_id）
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/OverrideSettleStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryDraw, LotteryDrawDecision, LotteryPrize, sequelize } = require('../../../../models')
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const AssetService = require('../../../AssetService')

/**
 * 管理干预结算 Stage
 */
class OverrideSettleStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('OverrideSettleStage', {
      is_writer: true,
      required: true
    })
  }

  /**
   * 执行干预结算
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 被干预用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id, idempotency_key, lottery_session_id } = context

    this.log('info', '开始干预结算', { user_id, campaign_id, idempotency_key })

    // 幂等性检查
    const existing_draw = await this._checkIdempotency(idempotency_key)
    if (existing_draw) {
      this.log('info', '幂等检查：干预记录已存在', { draw_id: existing_draw.draw_id })
      return this.success({ draw_record: existing_draw, is_duplicate: true })
    }

    // 获取干预数据
    const override_data = this.getContextData(context, 'LoadOverrideStage.data')
    if (!override_data) {
      throw this.createError('缺少干预数据', 'MISSING_OVERRIDE_DATA', true)
    }

    const { override, override_type, override_prize, operator_info } = override_data

    // 使用外部事务或创建新事务
    const use_external_transaction = !!context.transaction
    const transaction = context.transaction || (await sequelize.transaction())

    try {
      // 1. 生成唯一的抽奖ID
      const draw_id = this._generateDrawId(user_id, 'override')

      // 2. 根据干预类型执行不同逻辑
      let final_prize = null
      let is_win = false

      if (override_type === 'force_win') {
        final_prize = override_prize
        is_win = true

        // 扣减库存（如果有库存限制）
        if (final_prize.stock_quantity !== null) {
          await this._deductStock(final_prize.prize_id, transaction)
        }

        // 发放奖品
        await this._distributePrize(user_id, final_prize, {
          idempotency_key,
          lottery_session_id,
          transaction
        })
      } else if (override_type === 'force_lose') {
        // 获取兜底奖品
        final_prize = await this._getFallbackPrize(campaign_id)
        is_win = false

        // 发放兜底奖品
        if (final_prize) {
          await this._distributePrize(user_id, final_prize, {
            idempotency_key,
            lottery_session_id,
            transaction
          })
        }
      }

      // 3. 创建抽奖记录
      const draw_record = await this._createDrawRecord({
        draw_id,
        user_id,
        campaign_id,
        override,
        final_prize,
        is_win,
        idempotency_key,
        lottery_session_id,
        operator_info,
        transaction
      })

      // 4. 创建决策记录
      const decision_record = await this._createDecisionRecord({
        draw_id,
        user_id,
        campaign_id,
        override,
        override_type,
        final_prize,
        operator_info,
        transaction
      })

      // 提交事务
      if (!use_external_transaction) {
        await transaction.commit()
        this.log('info', '干预结算事务已提交', { draw_id })
      }

      const result = {
        draw_record: draw_record.toJSON(),
        decision_record: decision_record.toJSON(),
        is_duplicate: false,
        settle_result: {
          draw_id,
          override_type,
          is_win,
          prize_id: final_prize?.prize_id || null,
          prize_name: final_prize?.prize_name || '无奖品',
          operator_id: operator_info?.user_id,
          reason: override.reason
        }
      }

      this.log('info', '干预结算完成', {
        draw_id,
        user_id,
        override_type,
        prize_name: final_prize?.prize_name
      })

      return this.success(result)
    } catch (error) {
      if (!use_external_transaction && transaction) {
        try {
          await transaction.rollback()
        } catch (rollback_error) {
          this.log('error', '事务回滚失败', { error: rollback_error.message })
        }
      }
      this.log('error', '干预结算失败', { error: error.message })
      throw error
    }
  }

  /**
   * 幂等性检查
   *
   * @param {string} idempotency_key - 幂等键
   * @returns {Promise<Object|null>} 已存在的抽奖记录
   * @private
   */
  async _checkIdempotency(idempotency_key) {
    if (!idempotency_key) return null
    return await LotteryDraw.findOne({ where: { idempotency_key } })
  }

  /**
   * 生成抽奖ID
   *
   * @param {number} user_id - 用户ID
   * @param {string} prefix - ID前缀
   * @returns {string} 抽奖ID
   * @private
   */
  _generateDrawId(user_id, prefix = 'draw') {
    const timestamp = BeijingTimeHelper.generateIdTimestamp()
    const random = Math.random().toString(36).substr(2, 6)
    return `${prefix}_${timestamp}_${user_id}_${random}`
  }

  /**
   * 扣减库存
   *
   * @param {number} prize_id - 奖品ID
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _deductStock(prize_id, transaction) {
    const [affected_rows] = await sequelize.query(
      `UPDATE lottery_prizes 
       SET stock_quantity = GREATEST(0, stock_quantity - 1), daily_win_count = daily_win_count + 1
       WHERE prize_id = ?`,
      {
        replacements: [prize_id],
        transaction,
        type: sequelize.QueryTypes.UPDATE
      }
    )

    if (affected_rows === 0) {
      this.log('warn', '库存扣减未成功（可能库存已为0）', { prize_id })
    }
  }

  /**
   * 获取兜底奖品
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 兜底奖品
   * @private
   */
  async _getFallbackPrize(campaign_id) {
    return await LotteryPrize.findOne({
      where: {
        campaign_id,
        is_fallback: true,
        is_active: true
      }
    })
  }

  /**
   * 发放奖品
   *
   * @param {number} user_id - 用户ID
   * @param {Object} prize - 奖品记录
   * @param {Object} options - 配置选项
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _distributePrize(user_id, prize, options) {
    const { idempotency_key, lottery_session_id, transaction } = options

    if (!prize) return

    switch (prize.prize_type) {
      case 'points':
        // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
        await AssetService.changeBalance(
          {
            user_id,
            asset_code: 'POINTS',
            delta_amount: parseInt(prize.prize_value),
            idempotency_key: `${idempotency_key}:points`,
            lottery_session_id,
            business_type: 'override_award',
            meta: {
              source_type: 'override',
              title: `干预奖励：${prize.prize_name}`,
              description: `管理干预发放${prize.prize_value}积分`
            }
          },
          { transaction }
        )
        break

      case 'coupon':
      case 'physical':
        await AssetService.mintItem(
          {
            user_id,
            item_type: prize.prize_type === 'coupon' ? 'voucher' : 'product',
            source_type: 'override',
            source_id: `${idempotency_key}:item`,
            meta: {
              name: prize.prize_name,
              description: `管理干预发放：${prize.prize_name}`,
              value: Math.round(parseFloat(prize.prize_value) || 0),
              prize_id: prize.prize_id,
              acquisition_method: 'override'
            }
          },
          { transaction }
        )
        break

      case 'virtual':
        if (prize.material_asset_code && prize.material_amount) {
          // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
          await AssetService.changeBalance(
            {
              user_id,
              asset_code: prize.material_asset_code,
              delta_amount: prize.material_amount,
              idempotency_key: `${idempotency_key}:material`,
              business_type: 'override_award_material',
              meta: { prize_id: prize.prize_id, prize_name: prize.prize_name }
            },
            { transaction }
          )
        }
        break
    }
  }

  /**
   * 创建抽奖记录
   *
   * @param {Object} params - 记录参数
   * @returns {Promise<Object>} 抽奖记录
   * @private
   */
  async _createDrawRecord(params) {
    const {
      draw_id,
      user_id,
      campaign_id,
      override,
      final_prize,
      is_win,
      idempotency_key,
      lottery_session_id,
      operator_info: _operator_info, // eslint-disable-line no-unused-vars
      transaction
    } = params

    const business_id = `override_draw_${user_id}_${override.override_id}_${draw_id}`

    return await LotteryDraw.create(
      {
        draw_id,
        business_id,
        idempotency_key,
        lottery_session_id,
        user_id,
        lottery_id: campaign_id,
        campaign_id,
        draw_type: 'override',
        prize_id: final_prize?.prize_id || null,
        prize_name: final_prize?.prize_name || '无奖品',
        prize_type: final_prize?.prize_type || 'none',
        prize_value: final_prize?.prize_value || 0,
        cost_points: 0, // 干预不消耗积分
        reward_tier: is_win ? final_prize?.reward_tier || 'high' : 'fallback',
        guarantee_triggered: false,
        prize_value_points: final_prize?.prize_value_points || 0,
        created_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )
  }

  /**
   * 创建决策记录
   *
   * @param {Object} params - 记录参数
   * @returns {Promise<Object>} 决策记录
   * @private
   */
  async _createDecisionRecord(params) {
    const {
      draw_id,
      user_id,
      campaign_id,
      override,
      override_type,
      final_prize,
      operator_info,
      transaction
    } = params

    const decision_snapshot = {
      decision_type: 'management_override',
      override_id: override.override_id,
      override_type,
      operator_id: operator_info?.user_id,
      operator_name: operator_info?.username || operator_info?.nickname,
      reason: override.reason,
      created_at: override.created_at,
      final_result: {
        prize_id: final_prize?.prize_id || null,
        prize_name: final_prize?.prize_name || '无奖品',
        prize_value: final_prize?.prize_value || 0
      }
    }

    return await LotteryDrawDecision.create(
      {
        draw_id,
        user_id,
        campaign_id,
        decision_type: 'management_override',
        user_segment: 'override',
        tier_selected: final_prize?.reward_tier || 'fallback',
        prize_selected_id: final_prize?.prize_id || null,
        guarantee_triggered: false,
        budget_mode: 'override',
        decision_factors: JSON.stringify({
          override_type,
          operator_id: operator_info?.user_id,
          reason: override.reason
        }),
        full_snapshot: JSON.stringify(decision_snapshot),
        created_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )
  }
}

module.exports = OverrideSettleStage
