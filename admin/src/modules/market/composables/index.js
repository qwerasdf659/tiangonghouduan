/**
 * 市场模块 - Composables 索引
 *
 * @file admin/src/modules/market/composables/index.js
 * @description 导出所有市场相关的 composable 模块
 * @version 1.0.0
 * @date 2026-01-24
 */

// 兑换商品管理模块
export { useExchangeItemsState, useExchangeItemsMethods } from './exchange-items.js'

// 兑换订单管理模块
export { useExchangeOrdersState, useExchangeOrdersMethods } from './exchange-orders.js'

// 兑换统计分析模块
export { useExchangeStatsState, useExchangeStatsMethods } from './exchange-stats.js'

export default {
  useExchangeItemsState,
  useExchangeItemsMethods,
  useExchangeOrdersState,
  useExchangeOrdersMethods,
  useExchangeStatsState,
  useExchangeStatsMethods
}

