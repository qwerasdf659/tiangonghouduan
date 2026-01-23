/**
 * 抽奖管理模块 - Composables 导出汇总
 *
 * @file admin/src/modules/lottery/composables/index.js
 * @description 导出所有子模块，便于主模块组合使用
 * @version 1.0.0
 * @date 2026-01-24
 */

// 活动管理模块
export { useCampaignsState, useCampaignsMethods } from './campaigns.js'

// 奖品管理模块
export { usePrizesState, usePrizesMethods } from './prizes.js'

// 预算管理模块
export { useBudgetState, useBudgetMethods } from './budget.js'

// 策略配置模块
export { useStrategyState, useStrategyMethods } from './strategy.js'

// 配额管理模块
export { useQuotaState, useQuotaMethods } from './quota.js'

// 定价配置模块
export { usePricingState, usePricingMethods } from './pricing.js'

// 抽奖监控模块
export { useMetricsState, useMetricsMethods } from './metrics.js'

// 核销码管理模块
export { useRedemptionState, useRedemptionMethods } from './redemption.js'

/**
 * 组合所有状态
 * @returns {Object} 合并后的状态对象
 */
export function useAllLotteryState() {
  return {
    ...useCampaignsState(),
    ...usePrizesState(),
    ...useBudgetState(),
    ...useStrategyState(),
    ...useQuotaState(),
    ...usePricingState(),
    ...useMetricsState(),
    ...useRedemptionState()
  }
}

/**
 * 组合所有方法
 * @returns {Object} 合并后的方法对象
 */
export function useAllLotteryMethods() {
  return {
    ...useCampaignsMethods(),
    ...usePrizesMethods(),
    ...useBudgetMethods(),
    ...useStrategyMethods(),
    ...useQuotaMethods(),
    ...usePricingMethods(),
    ...useMetricsMethods(),
    ...useRedemptionMethods()
  }
}

