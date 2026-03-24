/**
 * 市场交易 API 模块统一导出入口
 *
 * @module api/market
 * @description 聚合导出市场交易相关的所有 API 模块
 * @version 3.0.0
 * @date 2026-03-24
 *
 * 推荐：各模块直接导入域常量（模式 A — §14.3），barrel 仅用于全局审计。
 *
 * @example
 * // 推荐：域直接导入（依赖图清晰）
 * import { EXCHANGE_ENDPOINTS } from './api/market/exchange.js'
 * import { TRADE_ENDPOINTS } from './api/market/trade.js'
 *
 * // 兼容：全域合并（仅用于全局审计场景）
 * import { MARKET_ENDPOINTS } from './api/market'
 */

// 导入子模块
import { ExchangeAPI, EXCHANGE_ENDPOINTS } from './exchange.js'
import { TradeAPI, TRADE_ENDPOINTS } from './trade.js'
import { BidAPI, BID_ENDPOINTS } from './bid.js'
import { ExchangeRateAPI, EXCHANGE_RATE_ENDPOINTS } from './exchange-rate.js'

// 合并端点常量
export const MARKET_ENDPOINTS = {
  ...EXCHANGE_ENDPOINTS,
  ...TRADE_ENDPOINTS,
  ...BID_ENDPOINTS,
  ...EXCHANGE_RATE_ENDPOINTS
}

// 合并 API 对象
export const MarketAPI = {
  ...ExchangeAPI,
  ...TradeAPI,
  ...BidAPI,
  ...ExchangeRateAPI
}

// 分模块导出
export { ExchangeAPI, EXCHANGE_ENDPOINTS }
export { TradeAPI, TRADE_ENDPOINTS }
export { BidAPI, BID_ENDPOINTS }
export { ExchangeRateAPI, EXCHANGE_RATE_ENDPOINTS }

export default MarketAPI
