'use strict'

/**
 * PresetBudgetStage - 预设预算处理 Stage
 *
 * 职责：
 * 1. 计算预设发放所需的预算
 * 2. 检查预算是否充足
 * 3. 支持预算欠账机制（budget_debt）
 * 4. 记录欠账信息到 preset_budget_debt 表
 *
 * 输出到上下文：
 * - preset_budget: 预算计算结果
 * - budget_sufficient: 预算是否充足
 * - budget_debt_required: 是否需要欠账
 * - budget_debt_amount: 欠账金额
 *
 * 设计原则（基于架构文档）：
 * - 预设语义：必须发放 + 尽力扣减 + 记欠账
 * - 欠账记录：写入 preset_budget_debt 表
 * - 欠账上限：检查 preset_debt_limits 表
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/PresetBudgetStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const {
  PresetBudgetDebt,
  PresetDebtLimit
  // eslint-disable-next-line spaced-comment -- sequelize: 预留用于事务管理扩展
} = require('../../../../models')
/* eslint-disable-next-line spaced-comment -- AssetService: 预留用于预算扣减功能扩展 */
// const AssetService = require('../../../AssetService')

/**
 * 预设预算处理 Stage
 */
class PresetBudgetStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('PresetBudgetStage', {
      required: true
    })
  }

  /**
   * 执行预算处理
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.stage_results.LoadPresetStage.data - 预设数据
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id } = context

    this.log('info', '开始预设预算处理', { user_id, campaign_id })

    // 获取预设数据
    const preset_data = this.getContextData(context, 'LoadPresetStage.data')
    if (!preset_data) {
      throw this.createError(
        '缺少预设数据，请确保 LoadPresetStage 已执行',
        'MISSING_PRESET_DATA',
        true
      )
    }

    const { preset_prize, preset_status } = preset_data
    // preset 对象预留用于未来扩展（如预设配置校验）

    try {
      // 计算所需预算（奖品价值积分）
      const required_budget = preset_prize.prize_value_points || 0

      // 获取活动当前预算余额
      const current_budget = await this._getCampaignBudget(campaign_id)

      // 判断预算是否充足
      const budget_sufficient = current_budget >= required_budget
      const budget_shortfall = budget_sufficient ? 0 : required_budget - current_budget

      // 检查是否允许预算欠账
      const allow_budget_debt =
        preset_status.advance_mode === 'budget_debt' || preset_status.advance_mode === 'both'

      let budget_debt_required = false
      let budget_debt_amount = 0

      if (!budget_sufficient) {
        if (allow_budget_debt) {
          // 检查欠账上限
          await this._checkDebtLimit(campaign_id, 'budget', budget_shortfall)

          budget_debt_required = true
          budget_debt_amount = budget_shortfall

          this.log('info', '预算不足，将记录预算欠账', {
            campaign_id,
            required_budget,
            current_budget,
            budget_shortfall
          })
        } else {
          throw this.createError(
            `预算不足且不允许欠账，当前: ${current_budget}，需要: ${required_budget}`,
            'INSUFFICIENT_BUDGET',
            true
          )
        }
      }

      const result = {
        preset_budget: {
          required_budget,
          current_budget,
          budget_sufficient,
          budget_shortfall
        },
        budget_sufficient,
        budget_debt_required,
        budget_debt_amount,
        deduct_amount: budget_sufficient ? required_budget : current_budget // 实际扣减金额
      }

      this.log('info', '预设预算处理完成', {
        required_budget,
        current_budget,
        budget_sufficient,
        budget_debt_required,
        budget_debt_amount
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '预设预算处理失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取活动当前预算余额
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<number>} 当前预算余额
   * @private
   */
  async _getCampaignBudget(campaign_id) {
    try {
      const { LotteryCampaign } = require('../../../../models')
      const campaign = await LotteryCampaign.findByPk(campaign_id, {
        attributes: ['budget_points', 'budget_used']
      })

      if (!campaign) {
        return 0
      }

      const total_budget = campaign.budget_points || 0
      const used_budget = campaign.budget_used || 0
      return Math.max(0, total_budget - used_budget)
    } catch (error) {
      this.log('warn', '获取活动预算失败', {
        campaign_id,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 检查欠账上限
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} debt_type - 欠账类型（budget/inventory）
   * @param {number} debt_amount - 欠账金额
   * @returns {Promise<Object>} 欠账检查结果
   * @private
   */
  async _checkDebtLimit(campaign_id, debt_type, debt_amount) {
    // 查找欠账上限配置
    const debt_limit = await PresetDebtLimit.findOne({
      where: {
        campaign_id,
        debt_type,
        is_active: true
      }
    })

    if (!debt_limit) {
      this.log('warn', '未找到欠账上限配置，使用默认上限', {
        campaign_id,
        debt_type
      })
      return // 无配置时允许欠账
    }

    // 查询当前已欠账金额
    const current_debt = await this._getCurrentDebt(campaign_id, debt_type)
    const total_debt_after = current_debt + debt_amount

    if (total_debt_after > debt_limit.max_debt_amount) {
      throw this.createError(
        `欠账超过上限，当前欠账: ${current_debt}，新增: ${debt_amount}，` +
          `上限: ${debt_limit.max_debt_amount}`,
        'DEBT_LIMIT_EXCEEDED',
        true
      )
    }

    this.log('debug', '欠账上限检查通过', {
      campaign_id,
      debt_type,
      current_debt,
      debt_amount,
      max_debt: debt_limit.max_debt_amount
    })
  }

  /**
   * 获取当前欠账金额
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} debt_type - 欠账类型
   * @returns {Promise<number>} 当前欠账金额
   * @private
   */
  async _getCurrentDebt(campaign_id, debt_type) {
    try {
      if (debt_type === 'budget') {
        const result = await PresetBudgetDebt.sum('debt_amount', {
          where: {
            campaign_id,
            status: 'pending'
          }
        })
        return result || 0
      }
      return 0
    } catch (error) {
      this.log('warn', '获取当前欠账金额失败', {
        campaign_id,
        debt_type,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 记录预算欠账（在 SettleStage 中调用）
   *
   * @param {Object} params - 参数
   * @param {Object} transaction - 事务对象
   * @returns {Promise<Object>} 欠账记录
   */
  static async recordBudgetDebt(params, transaction) {
    const { campaign_id, user_id, preset_id, draw_id, debt_amount, operator_id, reason } = params

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
}

module.exports = PresetBudgetStage
