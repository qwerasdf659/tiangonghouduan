/**
 * 市场交易 API 模块统一导出入口
 *
 * @module api/market
 * @description 聚合导出市场交易相关的所有 API 模块（仅 re-export，不合并）
 * @version 4.2.0
 * @date 2026-04-05
 *
 * 各页面直接导入域常量（模式 A — §14.3），本文件仅做聚合 re-export。
 *
 * 注：C2C 交易/拍卖 API（TradeAPI/AuctionAPI）已随 C2C 下线删除（2026-06-05 阶段五）
 *
 * @example
 * import { EXCHANGE_ENDPOINTS } from '@/api/market/exchange.js'
 * import { BID_ENDPOINTS } from '@/api/market/bid.js'
 */

export { ExchangeAPI, EXCHANGE_ENDPOINTS } from './exchange.js'
export { BidAPI, BID_ENDPOINTS } from './bid.js'
