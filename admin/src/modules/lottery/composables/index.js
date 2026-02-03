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

// 用户抽奖档案模块
export { useUserProfileState, useUserProfileMethods } from './user-profile.js'

// 实时告警中心模块
export { useAlertsState, useAlertsMethods } from './alerts.js'

// 异常用户风控模块
export { useRiskControlState, useRiskControlMethods } from './risk-control.js'

// 活动复盘报告模块
export { useReportState, useReportMethods } from './report.js'

// 运营日报模块
export { useDailyReportState, useDailyReportMethods } from './daily-report.js'

// 批量操作模块
export { useBatchOperationsState, useBatchOperationsMethods } from './batch-operations.js'

// P1-3: 预设可视化模块
export {
  usePresetVisualizationState,
  usePresetVisualizationMethods
} from './preset-visualization.js'

// P1-10: 系统垫付看板模块
export { useSystemAdvanceState, useSystemAdvanceMethods } from './system-advance.js'

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
    ...useRedemptionState(),
    ...useUserProfileState(),
    ...useAlertsState(),
    ...useRiskControlState(),
    ...useReportState(),
    ...useDailyReportState(),
    ...useBatchOperationsState(),
    ...usePresetVisualizationState(),
    ...useSystemAdvanceState()
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
    ...useRedemptionMethods(),
    ...useUserProfileMethods(),
    ...useAlertsMethods(),
    ...useRiskControlMethods(),
    ...useReportMethods(),
    ...useDailyReportMethods(),
    ...useBatchOperationsMethods(),
    ...usePresetVisualizationMethods(),
    ...useSystemAdvanceMethods()
  }
}
