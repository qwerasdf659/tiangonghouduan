/**
 * 市场交易 API 模块统一导出入口
 *
 * @module api/market
 * @description 聚合导出市场交易相关的所有 API 模块（仅 re-export，不合并）
 * @version 4.1.0
 * @date 2026-03-24
 *
 * 各页面直接导入域常量（模式 A — §14.3），本文件仅做聚合 re-export。
 *
 * @example
 * import { EXCHANGE_ENDPOINTS } from '@/api/market/exchange.js'
 * import { TRADE_ENDPOINTS } from '@/api/market/trade.js'
 * import { BID_ENDPOINTS } from '@/api/market/bid.js'
 * import { EXCHANGE_RATE_ENDPOINTS } from '@/api/market/exchange-rate.js'
 * import { AUCTION_ENDPOINTS } from '@/api/market/auction.js'
 */

export { ExchangeAPI, EXCHANGE_ENDPOINTS } from './exchange.js'
export { TradeAPI, TRADE_ENDPOINTS } from './trade.js'
export { BidAPI, BID_ENDPOINTS } from './bid.js'
export { ExchangeRateAPI, EXCHANGE_RATE_ENDPOINTS } from './exchange-rate.js'
export { AuctionAPI, AUCTION_ENDPOINTS } from './auction.js'
