/**
 * 市场交易 API 模块统一导出入口
 *
 * @module api/market
 * @description 聚合导出市场交易相关的所有 API 模块
 * @version 2.0.0
 * @date 2026-01-30
 *
 * @example
 * // 导入全部
 * import { MarketAPI, MARKET_ENDPOINTS } from './api/market'
 *
 * // 按需导入
 * import { ExchangeAPI } from './api/market/exchange.js'
 * import { TradeAPI } from './api/market/trade.js'
 */

// 导入子模块
import { ExchangeAPI, EXCHANGE_ENDPOINTS } from './exchange.js'
import { TradeAPI, TRADE_ENDPOINTS } from './trade.js'
import { BidAPI, BID_ENDPOINTS } from './bid.js'

// 合并端点常量
export const MARKET_ENDPOINTS = {
  ...EXCHANGE_ENDPOINTS,
  ...TRADE_ENDPOINTS,
  ...BID_ENDPOINTS
}

// 合并 API 对象
export const MarketAPI = {
  ...ExchangeAPI,
  ...TradeAPI,
  ...BidAPI
}

// 分模块导出
export { ExchangeAPI, EXCHANGE_ENDPOINTS }
export { TradeAPI, TRADE_ENDPOINTS }
export { BidAPI, BID_ENDPOINTS }

export default MarketAPI
