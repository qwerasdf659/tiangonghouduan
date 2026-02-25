'use strict'

/**
 * DecisionSnapshotStage - 决策快照记录 Stage
 *
 * 职责：
 * 1. 汇总所有前置 Stage 的决策信息
 * 2. 构建完整的决策快照数据
 * 3. 准备写入 lottery_draw_decisions 表的数据
 * 4. 生成可追溯的审计记录
 * 5. 记录策略引擎决策数据（BxPx矩阵、体验平滑、运气债务）
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
 * - 策略决策数据完整记录，支持运营分析
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/DecisionSnapshotStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-20 - 增加策略引擎决策审计字段
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
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id, idempotency_key, lottery_session_id } = context

    this.log('info', '开始构建决策快照', { user_id, lottery_campaign_id })

    try {
      // 1. 收集各 Stage 的决策数据
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data') || {}
      const eligibility_data = this.getContextData(context, 'EligibilityStage.data') || {}
      const budget_data = this.getContextData(context, 'BudgetContextStage.data') || {}
      const prize_pool_data = this.getContextData(context, 'BuildPrizePoolStage.data') || {}
      const tier_pick_data = this.getContextData(context, 'TierPickStage.data') || {}
      const prize_pick_data = this.getContextData(context, 'PrizePickStage.data') || {}
      const guarantee_data = this.getContextData(context, 'GuaranteeStage.data') || {}

      // 收集策略引擎相关的决策数据
      const strategy_data = this.getContextData(context, 'TierPickStage.strategy_data') || {}

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

      // 4. 构建决策因素列表（包含策略引擎数据）
      const decision_factors = this._buildDecisionFactors({
        eligibility_data,
        budget_data,
        tier_pick_data,
        prize_pick_data,
        guarantee_data,
        strategy_data
      })

      // 5. 构建完整的决策快照
      const decision_snapshot = {
        // 基础信息
        user_id,
        lottery_campaign_id,
        idempotency_key,
        lottery_session_id,
        decision_time: BeijingTimeHelper.now(),

        // 活动配置快照
        campaign_snapshot: {
          lottery_campaign_id: campaign_data.campaign?.lottery_campaign_id,
          campaign_name: campaign_data.campaign?.campaign_name,
          pick_method: campaign_data.pick_method,
          budget_mode: campaign_data.budget_mode,
          tier_weight_scale: campaign_data.campaign?.tier_weight_scale,
          segment_resolver_version: tier_pick_data?.resolver_version || 'default'
        },

        // 资格检查结果
        eligibility_snapshot: {
          is_eligible: eligibility_data.is_eligible,
          daily_draws_count: eligibility_data.daily_draws_count,
          remaining_draws: eligibility_data.remaining_draws,
          quota_remaining: eligibility_data.quota_remaining
        },

        // 预算状态快照（增强版：包含 EffectiveBudget 和 BxPx 信息）
        budget_snapshot: {
          budget_mode: budget_data.budget_mode,
          budget_before: budget_data.budget_before,
          min_prize_cost: budget_data.min_prize_cost,
          budget_sufficient: budget_data.budget_sufficient,
          // 策略引擎增强字段 - EffectiveBudget 计算
          effective_budget: budget_data.effective_budget,
          wallet_available: budget_data.wallet_available,
          // BxPx 分层信息
          budget_tier: budget_data.budget_tier,
          pressure_tier: budget_data.pressure_tier,
          pressure_index: budget_data.pressure_index,
          // BxPx 矩阵输出
          cap_multiplier: budget_data.cap_multiplier,
          calculated_cap: budget_data.calculated_cap,
          empty_weight_multiplier: budget_data.empty_weight_multiplier
        },

        // 奖品池状态快照
        prize_pool_snapshot: {
          total_available: prize_pool_data.total_available,
          tier_counts: prize_pool_data.tier_counts,
          available_tiers: prize_pool_data.available_tiers,
          has_valuable_prizes: prize_pool_data.has_valuable_prizes
        },

        // 档位抽取决策（增强版：包含体验平滑和权重调整信息）
        tier_decision: {
          user_segment: tier_pick_data.user_segment,
          tier_weights: tier_pick_data.tier_weights,
          random_value: tier_pick_data.random_value,
          weight_scale: tier_pick_data.weight_scale,
          original_tier: tier_pick_data.original_tier,
          selected_tier: tier_pick_data.selected_tier,
          downgrade_path: tier_pick_data.tier_downgrade_path,
          // 策略引擎增强字段 - 权重调整详情
          base_weights: strategy_data.base_weights,
          adjusted_weights: strategy_data.adjusted_weights,
          weight_adjustments: strategy_data.weight_adjustments || {}
        },

        // 策略引擎决策快照（新增）
        strategy_snapshot: {
          // 体验状态输入
          experience_state: {
            empty_streak: strategy_data.experience_state?.empty_streak,
            recent_high_count: strategy_data.experience_state?.recent_high_count,
            total_draw_count: strategy_data.experience_state?.total_draw_count,
            total_empty_count: strategy_data.experience_state?.total_empty_count,
            pity_trigger_count: strategy_data.experience_state?.pity_trigger_count
          },

          // Pity 系统状态
          pity_system: {
            enabled: strategy_data.pity_enabled,
            soft_triggered: strategy_data.pity_soft_triggered,
            hard_triggered: strategy_data.pity_hard_triggered,
            boost_percentage: strategy_data.pity_boost_percentage
          },

          // Luck Debt 运气债务状态
          luck_debt: {
            enabled: strategy_data.luck_debt_enabled,
            global_draw_count: strategy_data.global_draw_count,
            historical_empty_rate: strategy_data.historical_empty_rate,
            debt_level: strategy_data.luck_debt_level,
            debt_multiplier: strategy_data.luck_debt_multiplier
          },

          // Anti-Streak 机制状态
          anti_streak: {
            anti_empty_triggered: strategy_data.anti_empty_triggered,
            anti_high_triggered: strategy_data.anti_high_triggered,
            forced_tier: strategy_data.forced_tier,
            capped_max_tier: strategy_data.capped_max_tier
          },

          // 总体权重调整因子
          total_weight_adjustment: strategy_data.total_weight_adjustment || 1.0
        },

        // 奖品抽取决策
        prize_decision: {
          tier_prize_count: prize_pick_data.tier_prize_count,
          tier_total_weight: prize_pick_data.tier_total_weight,
          random_value: prize_pick_data.prize_random_value,
          hit_range: prize_pick_data.prize_hit_range,
          selected_prize_id: prize_pick_data.selected_prize?.lottery_prize_id
        },

        // 保底机制
        guarantee_decision: {
          guarantee_triggered,
          user_draw_count: guarantee_data.user_draw_count,
          guarantee_threshold: guarantee_data.guarantee_threshold,
          guarantee_prize_id: guarantee_data.guarantee_prize?.lottery_prize_id,
          guarantee_reason: guarantee_data.guarantee_reason
        },

        // 最终结果
        final_result: {
          lottery_prize_id: final_prize.lottery_prize_id,
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
        lottery_campaign_id,
        final_prize_id: final_prize.lottery_prize_id,
        final_prize_name: final_prize.prize_name,
        final_tier,
        guarantee_triggered,
        decision_factors_count: decision_factors.length
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '决策快照构建失败', {
        user_id,
        lottery_campaign_id,
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
      guarantee_data,
      strategy_data = {}
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

    // BxPx 分层因素（策略引擎增强）
    if (budget_data.budget_tier) {
      factors.push({
        type: 'strategy',
        factor: 'budget_tier',
        value: budget_data.budget_tier,
        impact:
          budget_data.budget_tier === 'B3'
            ? 'positive'
            : budget_data.budget_tier === 'B0'
              ? 'negative'
              : 'neutral',
        description: `预算分层: ${budget_data.budget_tier} (EffectiveBudget: ${budget_data.effective_budget})`
      })
    }

    if (budget_data.pressure_tier) {
      factors.push({
        type: 'strategy',
        factor: 'pressure_tier',
        value: budget_data.pressure_tier,
        impact:
          budget_data.pressure_tier === 'P0'
            ? 'positive'
            : budget_data.pressure_tier === 'P2'
              ? 'negative'
              : 'neutral',
        description: `活动压力: ${budget_data.pressure_tier} (压力指数: ${(budget_data.pressure_index * 100).toFixed(1)}%)`
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

    // Pity 系统因素（策略引擎增强）
    if (strategy_data.pity_soft_triggered) {
      factors.push({
        type: 'strategy',
        factor: 'pity_soft_guarantee',
        value: strategy_data.pity_boost_percentage,
        impact: 'positive',
        description: `Pity 软保底触发: 非空奖概率提升 ${strategy_data.pity_boost_percentage}%`
      })
    }

    if (strategy_data.pity_hard_triggered) {
      factors.push({
        type: 'strategy',
        factor: 'pity_hard_guarantee',
        value: true,
        impact: 'positive',
        description: 'Pity 硬保底触发: 强制发放非空奖品'
      })
    }

    // Luck Debt 运气债务因素（策略引擎增强）
    if (strategy_data.luck_debt_level && strategy_data.luck_debt_level !== 'none') {
      factors.push({
        type: 'strategy',
        factor: 'luck_debt',
        value: strategy_data.luck_debt_multiplier,
        impact: 'positive',
        description: `运气债务补偿 (${strategy_data.luck_debt_level}): 权重乘数 ${strategy_data.luck_debt_multiplier}`
      })
    }

    // Anti-Empty 因素（策略引擎增强）
    if (strategy_data.anti_empty_triggered) {
      factors.push({
        type: 'strategy',
        factor: 'anti_empty_streak',
        value: strategy_data.experience_state?.empty_streak,
        impact: 'positive',
        description: `防连续空奖触发: 连续${strategy_data.experience_state?.empty_streak}次空奖后强制非空`
      })
    }

    // Anti-High 因素（策略引擎增强）
    if (strategy_data.anti_high_triggered) {
      factors.push({
        type: 'strategy',
        factor: 'anti_high_streak',
        value: strategy_data.experience_state?.recent_high_count,
        impact: 'negative',
        description: `防连续高价值触发: 近期高价值${strategy_data.experience_state?.recent_high_count}次，档位上限 ${strategy_data.capped_max_tier}`
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
