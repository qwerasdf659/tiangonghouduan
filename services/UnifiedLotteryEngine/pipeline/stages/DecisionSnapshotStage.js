'use strict'

/**
 * DecisionSnapshotStage - 决策快照记录 Stage
 *
 * 职责：
 * 1. 汇总所有前置 Stage 的决策信息
 * 2. 构建完整的决策快照数据
 * 3. 准备写入 lottery_draw_decisions 表的数据
 * 4. 生成可追溯的审计记录
 *
 * 输出到上下文：
 * - decision_snapshot: 完整的决策快照对象
 * - final_prize: 最终选中的奖品（考虑保底覆盖）
 * - final_tier: 最终的档位（考虑保底覆盖）
 * - decision_factors: 影响决策的因素列表
 *
 * 设计原则：
 * - 读操作Stage，只做数据汇总
 * - 快照数据用于后续的 SettleStage 写入
 * - 确保所有决策过程可追溯
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/DecisionSnapshotStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * 决策快照记录 Stage
 */
class DecisionSnapshotStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('DecisionSnapshotStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行决策快照构建
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id, idempotency_key, lottery_session_id } = context

    this.log('info', '开始构建决策快照', { user_id, campaign_id })

    try {
      // 1. 收集各 Stage 的决策数据
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data') || {}
      const eligibility_data = this.getContextData(context, 'EligibilityStage.data') || {}
      const budget_data = this.getContextData(context, 'BudgetContextStage.data') || {}
      const prize_pool_data = this.getContextData(context, 'BuildPrizePoolStage.data') || {}
      const tier_pick_data = this.getContextData(context, 'TierPickStage.data') || {}
      const prize_pick_data = this.getContextData(context, 'PrizePickStage.data') || {}
      const guarantee_data = this.getContextData(context, 'GuaranteeStage.data') || {}

      // 2. 确定最终奖品（保底覆盖逻辑）
      const guarantee_triggered = guarantee_data.guarantee_triggered === true
      const final_prize = guarantee_triggered
        ? guarantee_data.guarantee_prize
        : prize_pick_data.selected_prize

      if (!final_prize) {
        throw this.createError(
          '无法确定最终奖品，请检查前置 Stage 执行结果',
          'NO_FINAL_PRIZE',
          true
        )
      }

      // 3. 确定最终档位
      const final_tier = guarantee_triggered
        ? 'high' // 保底强制为高档
        : tier_pick_data.selected_tier

      // 4. 构建决策因素列表
      const decision_factors = this._buildDecisionFactors({
        eligibility_data,
        budget_data,
        tier_pick_data,
        prize_pick_data,
        guarantee_data
      })

      // 5. 构建完整的决策快照
      const decision_snapshot = {
        // 基础信息
        user_id,
        campaign_id,
        idempotency_key,
        lottery_session_id,
        decision_time: BeijingTimeHelper.now(),

        // 活动配置快照
        campaign_snapshot: {
          campaign_id: campaign_data.campaign?.campaign_id,
          campaign_name: campaign_data.campaign?.campaign_name,
          pick_method: campaign_data.pick_method,
          budget_mode: campaign_data.budget_mode,
          tier_weight_scale: campaign_data.campaign?.tier_weight_scale,
          segment_resolver_version: campaign_data.campaign?.segment_resolver_version
        },

        // 资格检查结果
        eligibility_snapshot: {
          is_eligible: eligibility_data.is_eligible,
          daily_draws_count: eligibility_data.daily_draws_count,
          remaining_draws: eligibility_data.remaining_draws,
          quota_remaining: eligibility_data.quota_remaining
        },

        // 预算状态快照
        budget_snapshot: {
          budget_mode: budget_data.budget_mode,
          budget_before: budget_data.budget_before,
          min_prize_cost: budget_data.min_prize_cost,
          budget_sufficient: budget_data.budget_sufficient
        },

        // 奖品池状态快照
        prize_pool_snapshot: {
          total_available: prize_pool_data.total_available,
          tier_counts: prize_pool_data.tier_counts,
          available_tiers: prize_pool_data.available_tiers,
          has_valuable_prizes: prize_pool_data.has_valuable_prizes
        },

        // 档位抽取决策
        tier_decision: {
          user_segment: tier_pick_data.user_segment,
          tier_weights: tier_pick_data.tier_weights,
          random_value: tier_pick_data.random_value,
          weight_scale: tier_pick_data.weight_scale,
          original_tier: tier_pick_data.original_tier,
          selected_tier: tier_pick_data.selected_tier,
          downgrade_path: tier_pick_data.tier_downgrade_path
        },

        // 奖品抽取决策
        prize_decision: {
          tier_prize_count: prize_pick_data.tier_prize_count,
          tier_total_weight: prize_pick_data.tier_total_weight,
          random_value: prize_pick_data.prize_random_value,
          hit_range: prize_pick_data.prize_hit_range,
          selected_prize_id: prize_pick_data.selected_prize?.prize_id
        },

        // 保底机制
        guarantee_decision: {
          guarantee_triggered,
          user_draw_count: guarantee_data.user_draw_count,
          guarantee_threshold: guarantee_data.guarantee_threshold,
          guarantee_prize_id: guarantee_data.guarantee_prize?.prize_id,
          guarantee_reason: guarantee_data.guarantee_reason
        },

        // 最终结果
        final_result: {
          prize_id: final_prize.prize_id,
          prize_name: final_prize.prize_name,
          prize_type: final_prize.prize_type,
          prize_value: final_prize.prize_value,
          prize_value_points: final_prize.prize_value_points,
          reward_tier: final_tier,
          is_guarantee_award: guarantee_triggered
        },

        // 决策因素
        decision_factors
      }

      // 6. 构建返回数据
      const result = {
        decision_snapshot,
        final_prize,
        final_tier,
        decision_factors,
        guarantee_triggered
      }

      this.log('info', '决策快照构建完成', {
        user_id,
        campaign_id,
        final_prize_id: final_prize.prize_id,
        final_prize_name: final_prize.prize_name,
        final_tier,
        guarantee_triggered,
        decision_factors_count: decision_factors.length
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '决策快照构建失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 构建决策因素列表
   *
   * @param {Object} data - 各 Stage 的数据
   * @returns {Array} 决策因素列表
   * @private
   */
  _buildDecisionFactors(data) {
    const factors = []

    const {
      eligibility_data,
      budget_data,
      tier_pick_data,
      // prize_pick_data 预留用于详细奖品选择因素分析（当前版本简化处理）
      prize_pick_data: _prize_pick_data, // eslint-disable-line no-unused-vars
      guarantee_data
    } = data

    // 资格相关因素
    if (eligibility_data.daily_draws_count !== undefined) {
      factors.push({
        type: 'eligibility',
        factor: 'daily_draws',
        value: eligibility_data.daily_draws_count,
        impact: eligibility_data.is_eligible ? 'positive' : 'negative',
        description: `今日已抽奖${eligibility_data.daily_draws_count}次`
      })
    }

    // 预算相关因素
    if (budget_data.budget_mode && budget_data.budget_mode !== 'none') {
      factors.push({
        type: 'budget',
        factor: 'budget_balance',
        value: budget_data.budget_before,
        impact: budget_data.budget_sufficient ? 'positive' : 'negative',
        description: `预算余额${budget_data.budget_before}，${budget_data.budget_sufficient ? '充足' : '不足'}`
      })
    }

    // 分群因素
    if (tier_pick_data.user_segment) {
      factors.push({
        type: 'segment',
        factor: 'user_segment',
        value: tier_pick_data.user_segment,
        impact: 'neutral',
        description: `用户分群: ${tier_pick_data.user_segment}`
      })
    }

    // 档位降级因素
    if (tier_pick_data.tier_downgrade_path?.length > 1) {
      factors.push({
        type: 'tier',
        factor: 'tier_downgrade',
        value: tier_pick_data.tier_downgrade_path,
        impact: 'neutral',
        description: `档位降级: ${tier_pick_data.tier_downgrade_path.join(' → ')}`
      })
    }

    // 保底触发因素
    if (guarantee_data.guarantee_triggered) {
      factors.push({
        type: 'guarantee',
        factor: 'guarantee_triggered',
        value: true,
        impact: 'positive',
        description: guarantee_data.guarantee_reason || '触发保底机制'
      })
    }

    return factors
  }
}

module.exports = DecisionSnapshotStage
