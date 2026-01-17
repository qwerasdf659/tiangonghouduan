'use strict'

/**
 * BudgetContextStage - 预算上下文初始化 Stage
 *
 * 职责：
 * 1. 根据活动的 budget_mode 初始化对应的 BudgetProvider
 * 2. 查询用户当前预算余额
 * 3. 检查预算是否足够支付最低价值奖品
 * 4. 将 budget_provider 和预算信息注入上下文
 *
 * 输出到上下文：
 * - budget_provider: BudgetProvider 实例
 * - budget_before: 抽奖前预算余额
 * - min_prize_cost: 最低奖品成本
 * - budget_sufficient: 预算是否充足
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 预算不足时仍然继续（降级到空奖），不直接失败
 * - 支持三种预算模式：user、pool、pool_quota
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/BudgetContextStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const BudgetProviderFactory = require('../budget/BudgetProviderFactory')

/**
 * 预算上下文初始化 Stage
 */
class BudgetContextStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('BudgetContextStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行预算上下文初始化
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id } = context

    this.log('info', '开始初始化预算上下文', { user_id, campaign_id })

    try {
      // 获取活动配置（从 LoadCampaignStage 的结果中）
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
      if (!campaign_data || !campaign_data.campaign) {
        throw this.createError(
          '缺少活动配置数据，请确保 LoadCampaignStage 已执行',
          'MISSING_CAMPAIGN_DATA',
          true
        )
      }

      const campaign = campaign_data.campaign
      const prizes = campaign_data.prizes || []
      const budget_mode = campaign.budget_mode || 'none'

      this.log('info', '活动预算模式', {
        campaign_id,
        budget_mode
      })

      // 1. 创建 BudgetProvider 实例
      const budget_provider = BudgetProviderFactory.create(budget_mode, {
        user_id,
        campaign_id,
        campaign: campaign,
        transaction: context.transaction || null
      })

      // 2. 查询当前预算余额
      let budget_before = 0
      if (budget_mode !== 'none') {
        try {
          budget_before = await budget_provider.getBalance()
        } catch (error) {
          this.log('warn', '获取预算余额失败，使用默认值0', {
            user_id,
            campaign_id,
            budget_mode,
            error: error.message
          })
          budget_before = 0
        }
      }

      // 3. 计算最低奖品成本
      const min_prize_cost = this._calculateMinPrizeCost(prizes)

      // 4. 判断预算是否充足（能否抽中非空奖）
      const budget_sufficient = budget_mode === 'none' || budget_before >= min_prize_cost

      // 5. 构建返回数据
      const result = {
        budget_provider: budget_provider,
        budget_mode: budget_mode,
        budget_before: budget_before,
        min_prize_cost: min_prize_cost,
        budget_sufficient: budget_sufficient,
        can_win_valuable_prize: budget_sufficient && min_prize_cost > 0
      }

      // 将 budget_provider 存储到上下文中，供后续 Stage 使用
      this.setContextData(context, 'budget_provider', budget_provider)

      this.log('info', '预算上下文初始化完成', {
        user_id,
        campaign_id,
        budget_mode,
        budget_before,
        min_prize_cost,
        budget_sufficient
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '预算上下文初始化失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 计算最低奖品成本
   *
   * 业务规则：
   * - 排除空奖（prize_value_points = 0）
   * - 找出最小的 prize_value_points
   *
   * @param {Array} prizes - 奖品列表
   * @returns {number} 最低奖品成本
   * @private
   */
  _calculateMinPrizeCost(prizes) {
    if (!prizes || prizes.length === 0) {
      return 0
    }

    // 过滤出有价值的奖品（prize_value_points > 0）
    const valuable_prizes = prizes.filter(p => {
      const cost = p.prize_value_points || 0
      return cost > 0
    })

    if (valuable_prizes.length === 0) {
      return 0
    }

    // 找出最小成本
    const min_cost = Math.min(
      ...valuable_prizes.map(p => p.prize_value_points || 0)
    )

    return min_cost
  }
}

module.exports = BudgetContextStage

