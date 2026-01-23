/**
 * 财务分析模块 - Composables 索引
 *
 * @file admin/src/modules/analytics/composables/index.js
 * @description 导出所有财务分析相关的 composable 模块
 * @version 1.0.0
 * @date 2026-01-24
 */

// 消费记录模块
export { useConsumptionState, useConsumptionMethods } from './consumption.js'

// 钻石账户模块
export { useDiamondAccountsState, useDiamondAccountsMethods } from './diamond-accounts.js'

// 商户积分模块
export { useMerchantPointsState, useMerchantPointsMethods } from './merchant-points.js'

// 债务管理模块
export { useDebtManagementState, useDebtManagementMethods } from './debt-management.js'

// 活动预算模块
export { useCampaignBudgetState, useCampaignBudgetMethods } from './campaign-budget.js'

// 商户操作日志模块
export { useMerchantLogsState, useMerchantLogsMethods } from './merchant-logs.js'

export default {
  useConsumptionState,
  useConsumptionMethods,
  useDiamondAccountsState,
  useDiamondAccountsMethods,
  useMerchantPointsState,
  useMerchantPointsMethods,
  useDebtManagementState,
  useDebtManagementMethods,
  useCampaignBudgetState,
  useCampaignBudgetMethods,
  useMerchantLogsState,
  useMerchantLogsMethods
}

