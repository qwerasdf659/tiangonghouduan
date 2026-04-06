/**
 * 市场模块 - Composables 索引
 *
 * @file admin/src/modules/market/composables/index.js
 * @description 导出所有市场相关的 composable 模块
 * @version 1.2.0
 * @date 2026-04-05
 */

// 兑换商品管理模块
import { useExchangeItemsState, useExchangeItemsMethods } from './exchange-items.js'

// 兑换订单管理模块
import { useExchangeOrdersState, useExchangeOrdersMethods } from './exchange-orders.js'

// 兑换统计分析模块
import { useExchangeStatsState, useExchangeStatsMethods } from './exchange-stats.js'

// ⚠️ 汇率管理 composable 已合并到 conversion-rule-management 页面（2026-04-05）

// 命名导出
export {
  useExchangeItemsState,
  useExchangeItemsMethods,
  useExchangeOrdersState,
  useExchangeOrdersMethods,
  useExchangeStatsState,
  useExchangeStatsMethods
}
