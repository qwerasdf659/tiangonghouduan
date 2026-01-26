/**
 * 财务分析模块 - Composables 索引
 *
 * @file admin/src/modules/analytics/composables/index.js
 * @description 导出所有财务分析相关的 composable 模块
 * @version 1.0.0
 * @date 2026-01-24
 */

// 消费记录模块
import { useConsumptionState, useConsumptionMethods } from './consumption.js'
export { useConsumptionState, useConsumptionMethods }

// 钻石账户模块
import { useDiamondAccountsState, useDiamondAccountsMethods } from './diamond-accounts.js'
export { useDiamondAccountsState, useDiamondAccountsMethods }

// 商户积分模块
import { useMerchantPointsState, useMerchantPointsMethods } from './merchant-points.js'
export { useMerchantPointsState, useMerchantPointsMethods }

// 债务管理模块
import { useDebtManagementState, useDebtManagementMethods } from './debt-management.js'
export { useDebtManagementState, useDebtManagementMethods }

// 活动预算模块
import { useCampaignBudgetState, useCampaignBudgetMethods } from './campaign-budget.js'
export { useCampaignBudgetState, useCampaignBudgetMethods }

// 商户操作日志模块
import { useMerchantLogsState, useMerchantLogsMethods } from './merchant-logs.js'
export { useMerchantLogsState, useMerchantLogsMethods }

// 默认导出（现在可以使用本地绑定）
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
