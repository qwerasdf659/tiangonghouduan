'use strict'

/**
 * BudgetContextStage - 预算上下文初始化 Stage
 *
 * 职责：
 * 1. 根据活动的 budget_mode 初始化对应的 BudgetProvider
 * 2. 调用 LotteryComputeEngine 计算预算分层（Budget Tier B0-B3）
 * 3. 调用 LotteryComputeEngine 计算活动压力分层（Pressure Tier P0-P2）
 * 4. 查询用户当前预算余额（EffectiveBudget）
 * 5. 检查预算是否足够支付最低价值奖品
 * 6. 将 budget_provider 和预算分层信息注入上下文
 *
 * 输出到上下文：
 * - budget_provider: BudgetProvider 实例
 * - budget_before: 抽奖前预算余额
 * - effective_budget: 有效预算（统一计算口径）
 * - budget_tier: 预算分层（B0/B1/B2/B3）
 * - pressure_tier: 活动压力分层（P0/P1/P2）
 * - available_tiers: 该预算分层可参与的档位列表
 * - min_prize_cost: 最低奖品成本
 * - budget_sufficient: 预算是否充足
 *
 * 计算引擎集成（2026-01-20）：
 * - 集成 LotteryComputeEngine.computeBudgetContext()
 * - 支持 BxPx 矩阵预算分层控制
 * - 为后续 BuildPrizePoolStage 和 TierPickStage 提供分层信息
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 预算不足时仍然继续（降级到空奖 B0），不直接失败
 * - 支持三种预算模式：user、pool、hybrid、none
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/BudgetContextStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-20 集成 LotteryComputeEngine
 */

const BaseStage = require('./BaseStage')
const { factory: budgetProviderFactory } = require('../budget/BudgetProviderFactory')

/* 抽奖计算引擎 */
const LotteryComputeEngine = require('../../compute/LotteryComputeEngine')

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

    /* 初始化抽奖计算引擎实例 */
    this.computeEngine = new LotteryComputeEngine()
  }

  /**
   * 执行预算上下文初始化
   *
   * 集成 LotteryComputeEngine 计算预算分层和压力分层
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id } = context

    this.log('info', '开始初始化预算上下文', { user_id, lottery_campaign_id })

    try {
      /* 获取活动配置（从 LoadCampaignStage 的结果中） */
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
        lottery_campaign_id,
        budget_mode
      })

      /* 1. 创建 BudgetProvider 实例 */
      const budget_provider = budgetProviderFactory.createByMode(budget_mode, {
        user_id,
        lottery_campaign_id,
        campaign,
        transaction: context.transaction || null
      })

      /* 2. 调用 LotteryComputeEngine 计算预算上下文（包含分层信息） */
      const strategy_context = await this.computeEngine.computeBudgetContext({
        user_id,
        campaign,
        prizes,
        transaction: context.transaction || null
      })

      // 3. 获取预算余额（使用 LotteryComputeEngine 计算结果）
      const budget_before = budget_mode === 'none' ? 0 : strategy_context.effective_budget || 0

      /* 4. 计算最低奖品成本 */
      const min_prize_cost = this._calculateMinPrizeCost(prizes)

      /* 5. 判断预算是否充足（能否抽中非空奖） */
      const budget_sufficient = budget_mode === 'none' || budget_before >= min_prize_cost

      /* 6. 构建返回数据（整合策略引擎结果） */
      const result = {
        /* 基础预算信息 */
        budget_provider,
        budget_mode,
        budget_before,
        min_prize_cost,
        budget_sufficient,
        can_win_valuable_prize: budget_sufficient && min_prize_cost > 0,

        /* 策略引擎计算的分层信息（新增） */
        effective_budget: strategy_context.effective_budget,
        budget_tier: strategy_context.budget_tier,
        available_tiers: strategy_context.available_tiers,
        budget_sufficiency: strategy_context.budget_sufficiency,

        /* 活动压力分层（新增） */
        pressure_index: strategy_context.pressure_index,
        pressure_tier: strategy_context.pressure_tier,
        time_progress: strategy_context.time_progress,
        virtual_consumption: strategy_context.virtual_consumption,
        weight_adjustment: strategy_context.weight_adjustment,

        /* 钱包可用性（新增） */
        wallet_available: strategy_context.wallet_available
      }

      /* 将关键数据存储到上下文中，供后续 Stage 使用 */
      this.setContextData(context, 'budget_provider', budget_provider)
      this.setContextData(context, 'budget_tier', strategy_context.budget_tier)
      this.setContextData(context, 'pressure_tier', strategy_context.pressure_tier)
      this.setContextData(context, 'available_tiers', strategy_context.available_tiers)
      this.setContextData(context, 'effective_budget', strategy_context.effective_budget)

      this.log('info', '预算上下文初始化完成', {
        user_id,
        lottery_campaign_id,
        budget_mode,
        budget_before,
        effective_budget: strategy_context.effective_budget,
        budget_tier: strategy_context.budget_tier,
        pressure_tier: strategy_context.pressure_tier,
        min_prize_cost,
        budget_sufficient
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '预算上下文初始化失败', {
        user_id,
        lottery_campaign_id,
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
    const min_cost = Math.min(...valuable_prizes.map(p => p.prize_value_points || 0))

    return min_cost
  }
}

module.exports = BudgetContextStage
