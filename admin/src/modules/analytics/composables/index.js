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

// 钻石账户模块
import { useDiamondAccountsState, useDiamondAccountsMethods } from './diamond-accounts.js'

// 商户积分模块
import { useMerchantPointsState, useMerchantPointsMethods } from './merchant-points.js'

// 债务管理模块
import { useDebtManagementState, useDebtManagementMethods } from './debt-management.js'

// 活动预算模块
import { useCampaignBudgetState, useCampaignBudgetMethods } from './campaign-budget.js'

// 商户操作日志模块
import { useMerchantLogsState, useMerchantLogsMethods } from './merchant-logs.js'

// 仪表盘运营大盘模块
import { useDashboardOverviewState, useDashboardOverviewMethods } from './dashboard-overview.js'

export { useConsumptionState, useConsumptionMethods }
export { useDiamondAccountsState, useDiamondAccountsMethods }
export { useMerchantPointsState, useMerchantPointsMethods }
export { useDebtManagementState, useDebtManagementMethods }
export { useCampaignBudgetState, useCampaignBudgetMethods }
export { useMerchantLogsState, useMerchantLogsMethods }
export { useDashboardOverviewState, useDashboardOverviewMethods }

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
  useMerchantLogsMethods,
  useDashboardOverviewState,
  useDashboardOverviewMethods
}
