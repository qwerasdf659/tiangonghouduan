/**
 * C2C 拍卖管理 API 模块
 *
 * @module api/market/auction
 * @description C2C 用户间竞拍管理、详情查看、强制取消/结算相关的 API 调用
 * @version 1.0.0
 * @date 2026-03-24
 *
 * 后端路由：/api/v4/console/bids（type=c2c 查询参数区分）
 *   + /api/v4/marketplace/auctions（查询公开列表）
 * 后端权限：role_level >= 100
 *
 * 直接使用后端字段名：auction_listing_id、seller_user_id、item_snapshot 等
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const AUCTION_ENDPOINTS = {
  /** C2C 拍卖列表（管理后台，通过 type=c2c 筛选） */
  AUCTION_LIST: `${API_PREFIX}/marketplace/auctions`,
  /** C2C 拍卖详情 */
  AUCTION_DETAIL: `${API_PREFIX}/marketplace/auctions/:id`,
  /** 管理后台强制取消C2C拍卖 */
  AUCTION_ADMIN_CANCEL: `${API_PREFIX}/console/bids/:id/cancel`,
  /** 管理后台手动结算C2C拍卖 */
  AUCTION_ADMIN_SETTLE: `${API_PREFIX}/console/bids/:id/settle`
}

// ========== API 调用方法 ==========

export const AuctionAPI = {
  /**
   * 获取C2C拍卖列表
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.sort_by] - 排序字段
   * @param {string} [params.sort_order] - 排序方向
   * @returns {Promise<Object>} API 响应 { auction_listings, pagination }
   */
  async getAuctionListings(params = {}) {
    const url = AUCTION_ENDPOINTS.AUCTION_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取C2C拍卖详情（含出价排行、卖方信息、物品快照）
   * @param {number} id - 拍卖挂牌 ID（auction_listing_id）
   * @returns {Promise<Object>} API 响应
   */
  async getAuctionDetail(id) {
    const url = buildURL(AUCTION_ENDPOINTS.AUCTION_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 管理后台强制取消C2C拍卖
   * @param {number} id - 拍卖 ID
   * @param {Object} data - 取消数据
   * @param {string} data.reason - 取消原因（必填）
   * @returns {Promise<Object>} API 响应
   */
  async cancelAuction(id, data) {
    const url = buildURL(AUCTION_ENDPOINTS.AUCTION_ADMIN_CANCEL, { id })
    return await request({ url, method: 'POST', data: { ...data, type: 'c2c' } })
  },

  /**
   * 管理后台手动结算C2C拍卖（处理 settlement_failed）
   * @param {number} id - 拍卖 ID
   * @returns {Promise<Object>} API 响应
   */
  async settleAuction(id) {
    const url = buildURL(AUCTION_ENDPOINTS.AUCTION_ADMIN_SETTLE, { id })
    return await request({ url, method: 'POST', data: { type: 'c2c' } })
  }
}

export default AuctionAPI
