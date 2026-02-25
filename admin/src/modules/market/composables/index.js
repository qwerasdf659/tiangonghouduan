/**
 * 市场模块 - Composables 索引
 *
 * @file admin/src/modules/market/composables/index.js
 * @description 导出所有市场相关的 composable 模块
 * @version 1.1.0
 * @date 2026-02-24
 */

// 兑换商品管理模块
import { useExchangeItemsState, useExchangeItemsMethods } from './exchange-items.js'

// 兑换订单管理模块
import { useExchangeOrdersState, useExchangeOrdersMethods } from './exchange-orders.js'

// 兑换统计分析模块
import { useExchangeStatsState, useExchangeStatsMethods } from './exchange-stats.js'

// 汇率管理模块
import { useExchangeRateState, useExchangeRateActions } from './exchange-rates.js'

// 命名导出
export {
  useExchangeItemsState,
  useExchangeItemsMethods,
  useExchangeOrdersState,
  useExchangeOrdersMethods,
  useExchangeStatsState,
  useExchangeStatsMethods,
  useExchangeRateState,
  useExchangeRateActions
}
