'use strict'

/**
 * PresetSettleStage - 预设结算阶段 Stage（写入点）
 *
 * 职责：
 * 1. 创建抽奖记录（标记为 preset 类型）
 * 2. 记录决策快照
 * 3. 扣减奖品库存（支持欠账）
 * 4. 扣减活动预算（支持欠账）
 * 5. 发放奖品到用户背包
 * 6. 更新预设状态为已执行
 * 7. 记录欠账信息
 *
 * 设计原则（Single Writer Principle）：
 * - 所有写操作在同一事务中执行
 * - 幂等性控制：通过 idempotency_key 防止重复执行
 * - 欠账记录：库存欠账写 preset_inventory_debt，预算欠账写 preset_budget_debt
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/PresetSettleStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const {
  LotteryDraw,
  LotteryDrawDecision,
  LotteryPrize: _LotteryPrize, // eslint-disable-line no-unused-vars
  LotteryPreset,
  LotteryCampaign: _LotteryCampaign, // eslint-disable-line no-unused-vars
  PresetInventoryDebt,
  PresetBudgetDebt,
  sequelize
} = require('../../../../models')
// _LotteryPrize, _LotteryCampaign: 预留用于未来扩展（如直接查询/更新）
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const AssetService = require('../../../AssetService')

/**
 * 预设结算阶段 Stage
 */
class PresetSettleStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('PresetSettleStage', {
      is_writer: true,
      required: true
    })
  }

  /**
   * 执行预设结算
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id, idempotency_key, lottery_session_id } = context

    this.log('info', '开始预设结算', { user_id, campaign_id, idempotency_key })

    // 幂等性检查
    const existing_draw = await this._checkIdempotency(idempotency_key)
    if (existing_draw) {
      this.log('info', '幂等检查：预设结算记录已存在', {
        draw_id: existing_draw.draw_id
      })
      return this.success({
        draw_record: existing_draw,
        is_duplicate: true
      })
    }

    // 获取预设数据
    const preset_data = this.getContextData(context, 'LoadPresetStage.data')
    if (!preset_data) {
      throw this.createError('缺少预设数据', 'MISSING_PRESET_DATA', true)
    }

    // 获取预算数据
    const budget_data = this.getContextData(context, 'PresetBudgetStage.data') || {}

    const { preset, preset_prize, preset_status } = preset_data
    const { budget_debt_required, budget_debt_amount, deduct_amount } = budget_data

    // 使用外部事务或创建新事务
    const use_external_transaction = !!context.transaction
    const transaction = context.transaction || (await sequelize.transaction())

    try {
      // 1. 生成唯一的抽奖ID
      const draw_id = this._generateDrawId(user_id, 'preset')

      // 2. 处理库存（支持欠账）
      const inventory_result = await this._handleInventory(
        preset_prize,
        preset_status.advance_mode,
        transaction
      )

      // 3. 处理预算（支持欠账）
      const budget_result = await this._handleBudget(
        campaign_id,
        deduct_amount || 0,
        budget_debt_required,
        budget_debt_amount,
        transaction
      )

      // 4. 发放奖品
      await this._distributePrize(user_id, preset_prize, {
        idempotency_key,
        lottery_session_id,
        transaction
      })

      // 5. 创建抽奖记录
      const draw_record = await this._createDrawRecord({
        draw_id,
        user_id,
        campaign_id,
        preset,
        preset_prize,
        idempotency_key,
        lottery_session_id,
        budget_data,
        transaction
      })

      // 6. 创建决策记录
      const decision_record = await this._createDecisionRecord({
        draw_id,
        user_id,
        campaign_id,
        preset,
        preset_prize,
        preset_status,
        inventory_result,
        budget_result,
        transaction
      })

      // 7. 记录欠账信息
      if (inventory_result.debt_required) {
        await this._recordInventoryDebt({
          campaign_id,
          user_id,
          preset_id: preset.preset_id,
          draw_id,
          prize_id: preset_prize.prize_id,
          debt_quantity: inventory_result.debt_quantity,
          operator_id: preset_status.operator_id,
          reason: preset_status.reason,
          transaction
        })
      }

      if (budget_debt_required && budget_debt_amount > 0) {
        await this._recordBudgetDebt({
          campaign_id,
          user_id,
          preset_id: preset.preset_id,
          draw_id,
          debt_amount: budget_debt_amount,
          operator_id: preset_status.operator_id,
          reason: preset_status.reason,
          transaction
        })
      }

      // 8. 更新预设状态
      await this._updatePresetStatus(preset.preset_id, draw_id, transaction)

      // 提交事务
      if (!use_external_transaction) {
        await transaction.commit()
        this.log('info', '预设结算事务已提交', { draw_id })
      }

      const result = {
        draw_record: draw_record.toJSON(),
        decision_record: decision_record.toJSON(),
        is_duplicate: false,
        settle_result: {
          draw_id,
          prize_id: preset_prize.prize_id,
          prize_name: preset_prize.prize_name,
          inventory_debt: inventory_result.debt_required,
          inventory_debt_quantity: inventory_result.debt_quantity,
          budget_debt: budget_debt_required,
          budget_debt_amount: budget_debt_amount || 0
        }
      }

      this.log('info', '预设结算完成', {
        draw_id,
        user_id,
        preset_id: preset.preset_id,
        prize_name: preset_prize.prize_name
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
      this.log('error', '预设结算失败', { error: error.message })
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
    return await LotteryDraw.findOne({
      where: { idempotency_key }
    })
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
   * 处理库存（支持欠账）
   *
   * @param {Object} prize - 奖品记录
   * @param {string} advance_mode - 欠账模式
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Object>} 库存处理结果
   * @private
   */
  async _handleInventory(prize, advance_mode, transaction) {
    const result = {
      debt_required: false,
      debt_quantity: 0,
      deducted_quantity: 0
    }

    // 无限库存不处理
    if (prize.stock_quantity === null) {
      return result
    }

    const allow_debt = advance_mode === 'inventory_debt' || advance_mode === 'both'

    // 尝试扣减库存
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

    if (affected_rows > 0) {
      result.deducted_quantity = 1
      return result
    }

    // 库存不足
    if (allow_debt) {
      result.debt_required = true
      result.debt_quantity = 1
      this.log('info', '库存不足，记录库存欠账', {
        prize_id: prize.prize_id,
        prize_name: prize.prize_name
      })
      return result
    }

    throw this.createError('库存不足且不允许欠账', 'INSUFFICIENT_STOCK', true)
  }

  /**
   * 处理预算（支持欠账）
   *
   * @param {number} campaign_id - 活动ID
   * @param {number} deduct_amount - 扣减金额
   * @param {boolean} debt_required - 是否需要欠账
   * @param {number} debt_amount - 欠账金额
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Object>} 预算处理结果
   * @private
   */
  async _handleBudget(campaign_id, deduct_amount, debt_required, debt_amount, transaction) {
    const result = {
      deducted_amount: 0,
      debt_required: false,
      debt_amount: 0
    }

    if (deduct_amount > 0) {
      // 扣减活动预算
      await sequelize.query(
        `UPDATE lottery_campaigns 
         SET budget_used = budget_used + ?
         WHERE campaign_id = ?`,
        {
          replacements: [deduct_amount, campaign_id],
          transaction,
          type: sequelize.QueryTypes.UPDATE
        }
      )
      result.deducted_amount = deduct_amount
    }

    if (debt_required && debt_amount > 0) {
      result.debt_required = true
      result.debt_amount = debt_amount
    }

    return result
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
            business_type: 'preset_award',
            meta: {
              source_type: 'preset',
              title: `预设奖励：${prize.prize_name}`,
              description: `预设发放${prize.prize_value}积分`
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
            source_type: 'preset',
            source_id: `${idempotency_key}:item`,
            meta: {
              name: prize.prize_name,
              description: `预设发放：${prize.prize_name}`,
              value: Math.round(parseFloat(prize.prize_value) || 0),
              prize_id: prize.prize_id,
              acquisition_method: 'preset'
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
              business_type: 'preset_award_material',
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
      preset,
      preset_prize,
      idempotency_key,
      lottery_session_id,
      budget_data,
      transaction
    } = params

    const business_id = `preset_draw_${user_id}_${preset.preset_id}_${draw_id}`

    return await LotteryDraw.create(
      {
        draw_id,
        business_id,
        idempotency_key,
        lottery_session_id,
        user_id,
        lottery_id: campaign_id,
        campaign_id,
        draw_type: 'preset',
        prize_id: preset_prize.prize_id,
        prize_name: preset_prize.prize_name,
        prize_type: preset_prize.prize_type,
        prize_value: preset_prize.prize_value,
        cost_points: 0, // 预设发放不消耗积分
        reward_tier: preset_prize.reward_tier || 'high',
        guarantee_triggered: false,
        prize_value_points: preset_prize.prize_value_points || 0,
        budget_points_before: budget_data?.preset_budget?.current_budget || null,
        budget_points_after:
          (budget_data?.preset_budget?.current_budget || 0) - (budget_data?.deduct_amount || 0),
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
      preset,
      preset_prize,
      preset_status,
      inventory_result,
      budget_result,
      transaction
    } = params

    const decision_snapshot = {
      decision_type: 'preset_award',
      preset_id: preset.preset_id,
      operator_id: preset_status.operator_id,
      approved_by: preset_status.approved_by,
      reason: preset_status.reason,
      advance_mode: preset_status.advance_mode,
      inventory_debt: inventory_result.debt_required,
      budget_debt: budget_result.debt_required,
      final_result: {
        prize_id: preset_prize.prize_id,
        prize_name: preset_prize.prize_name,
        prize_value: preset_prize.prize_value
      }
    }

    return await LotteryDrawDecision.create(
      {
        draw_id,
        user_id,
        campaign_id,
        decision_type: 'preset_award',
        user_segment: 'preset',
        tier_selected: preset_prize.reward_tier || 'high',
        prize_selected_id: preset_prize.prize_id,
        guarantee_triggered: false,
        budget_mode: 'preset',
        full_snapshot: JSON.stringify(decision_snapshot),
        created_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )
  }

  /**
   * 记录库存欠账
   *
   * @param {Object} params - 记录参数
   * @returns {Promise<Object>} 库存欠账记录
   * @private
   */
  async _recordInventoryDebt(params) {
    const {
      campaign_id,
      user_id,
      preset_id,
      draw_id,
      prize_id,
      debt_quantity,
      operator_id,
      reason,
      transaction
    } = params

    return await PresetInventoryDebt.create(
      {
        campaign_id,
        user_id,
        preset_id,
        draw_id,
        prize_id,
        debt_quantity,
        status: 'pending',
        created_by: operator_id,
        reason: reason || '预设发放库存不足'
      },
      { transaction }
    )
  }

  /**
   * 记录预算欠账
   *
   * @param {Object} params - 记录参数
   * @returns {Promise<Object>} 预算欠账记录
   * @private
   */
  async _recordBudgetDebt(params) {
    const {
      campaign_id,
      user_id,
      preset_id,
      draw_id,
      debt_amount,
      operator_id,
      reason,
      transaction
    } = params

    return await PresetBudgetDebt.create(
      {
        campaign_id,
        user_id,
        preset_id,
        draw_id,
        debt_amount,
        status: 'pending',
        created_by: operator_id,
        reason: reason || '预设发放预算不足'
      },
      { transaction }
    )
  }

  /**
   * 更新预设状态
   *
   * @param {number} preset_id - 预设ID
   * @param {string} draw_id - 抽奖ID
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _updatePresetStatus(preset_id, draw_id, transaction) {
    await LotteryPreset.update(
      {
        status: 'executed',
        executed_at: BeijingTimeHelper.createBeijingTime(),
        draw_id
      },
      {
        where: { preset_id },
        transaction
      }
    )
  }
}

module.exports = PresetSettleStage
