/**
 * C2C 交易市场 API 模块
 *
 * @module api/market/trade
 * @description C2C 交易订单、市场挂牌、孤儿冻结检测、业务记录相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-30
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const TRADE_ENDPOINTS = {
  // 交易订单
  TRADE_ORDERS: `${API_PREFIX}/console/marketplace/trade_orders`,
  TRADE_ORDER_DETAIL: `${API_PREFIX}/console/marketplace/trade_orders/:order_id`,

  // 市场上架
  LISTINGS_LIST: `${API_PREFIX}/console/marketplace/listings`,
  LISTINGS_DETAIL: `${API_PREFIX}/console/marketplace/listings/:listing_id`,
  LISTINGS_CREATE: `${API_PREFIX}/console/marketplace/listings`,
  LISTINGS_UPDATE: `${API_PREFIX}/console/marketplace/listings/:listing_id`,
  LISTINGS_DELETE: `${API_PREFIX}/console/marketplace/listings/:listing_id`,
  LISTINGS_STATS: `${API_PREFIX}/console/marketplace/listing-stats`,

  // 孤儿冻结检测
  ORPHAN_DETECT: `${API_PREFIX}/console/orphan-frozen/detect`,
  ORPHAN_STATS: `${API_PREFIX}/console/orphan-frozen/stats`,
  ORPHAN_CLEANUP: `${API_PREFIX}/console/orphan-frozen/cleanup`,

  // C2C市场扩展
  C2C_MARKET_ORDERS: `${API_PREFIX}/console/c2c-market/orders`,
  C2C_MARKET_ORDERS_STATS: `${API_PREFIX}/console/c2c-market/orders/stats`,
  C2C_MARKET_LISTINGS_SUMMARY: `${API_PREFIX}/console/c2c-market/listings/summary`,
  C2C_MARKET_LISTINGS_USER_STATS: `${API_PREFIX}/console/c2c-market/listings/user-stats`,

  // 市场统计扩展
  MARKETPLACE_STATS_ITEM_STATS: `${API_PREFIX}/console/marketplace/stats/items`,
  MARKETPLACE_STATS_ORDER_STATS: `${API_PREFIX}/console/marketplace/stats/orders`,
  MARKETPLACE_STATS: `${API_PREFIX}/console/marketplace/stats`,

  // 业务记录查询
  BUSINESS_RECORDS_LOTTERY_CLEAR: `${API_PREFIX}/console/business-records/lottery-clear-settings`,
  BUSINESS_RECORDS_LOTTERY_CLEAR_DETAIL:
    `${API_PREFIX}/console/business-records/lottery-clear-settings/:record_id`,
  BUSINESS_RECORDS_REDEMPTION: `${API_PREFIX}/console/business-records/redemption-orders`,
  BUSINESS_RECORDS_REDEMPTION_DETAIL:
    `${API_PREFIX}/console/business-records/redemption-orders/:order_id`,
  BUSINESS_RECORDS_REDEMPTION_REDEEM:
    `${API_PREFIX}/console/business-records/redemption-orders/:order_id/redeem`,
  BUSINESS_RECORDS_REDEMPTION_CANCEL:
    `${API_PREFIX}/console/business-records/redemption-orders/:order_id/cancel`,
  BUSINESS_RECORDS_CONTENT_REVIEWS: `${API_PREFIX}/console/business-records/content-reviews`,
  BUSINESS_RECORDS_CONTENT_REVIEWS_DETAIL:
    `${API_PREFIX}/console/business-records/content-reviews/:audit_id`,
  BUSINESS_RECORDS_ROLE_CHANGES: `${API_PREFIX}/console/business-records/user-role-changes`,
  BUSINESS_RECORDS_ROLE_CHANGES_DETAIL:
    `${API_PREFIX}/console/business-records/user-role-changes/:record_id`,
  BUSINESS_RECORDS_STATUS_CHANGES: `${API_PREFIX}/console/business-records/user-status-changes`,
  BUSINESS_RECORDS_STATUS_CHANGES_DETAIL:
    `${API_PREFIX}/console/business-records/user-status-changes/:record_id`,
  BUSINESS_RECORDS_EXCHANGE: `${API_PREFIX}/console/business-records/exchange-records`,
  BUSINESS_RECORDS_EXCHANGE_DETAIL: `${API_PREFIX}/console/business-records/exchange-records/:record_id`,
  BUSINESS_RECORDS_CHAT: `${API_PREFIX}/console/business-records/chat-messages`,
  BUSINESS_RECORDS_CHAT_DETAIL: `${API_PREFIX}/console/business-records/chat-messages/:message_id`,
  BUSINESS_RECORDS_CHAT_STATS: `${API_PREFIX}/console/business-records/chat-messages/statistics/summary`,

  // 交易订单扩展
  TRADE_ORDERS_LIST: `${API_PREFIX}/console/trade-orders`,
  TRADE_ORDERS_DETAIL: `${API_PREFIX}/console/trade-orders/:id`,
  TRADE_ORDERS_STATS: `${API_PREFIX}/console/trade-orders/stats`,
  TRADE_ORDERS_USER_STATS: `${API_PREFIX}/console/trade-orders/user/:user_id/stats`,
  TRADE_ORDERS_BY_BUSINESS_ID: `${API_PREFIX}/console/trade-orders/by-business-id/:business_id`,

  // C2C市场扩展（补充）
  C2C_MARKET_LIST: `${API_PREFIX}/console/marketplace/listings`,
  C2C_MARKET_DETAIL: `${API_PREFIX}/console/marketplace/listings/:listing_id`,
  C2C_MARKET_STATS: `${API_PREFIX}/console/marketplace/listing-stats`
}

// ========== API 调用方法 ==========

export const TradeAPI = {
  // ===== 交易订单 =====

  /**
   * 获取交易订单列表
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 订单状态
   * @param {number} [params.buyer_user_id] - 买家 ID
   * @param {number} [params.seller_user_id] - 卖家 ID
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} API 响应
   */
  async getTradeOrders(params = {}) {
    const url = TRADE_ENDPOINTS.TRADE_ORDERS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取交易订单详情
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object>} API 响应
   */
  async getTradeOrderDetail(orderId) {
    const url = buildURL(TRADE_ENDPOINTS.TRADE_ORDER_DETAIL, { order_id: orderId })
    return await request({ url, method: 'GET' })
  },

  // ===== 市场上架 =====

  /**
   * 获取上架列表
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.limit=20] - 每页数量
   * @param {string} [params.listing_kind] - 挂牌类型
   * @param {string} [params.sort='newest'] - 排序方式
   * @returns {Promise<Object>} API 响应
   */
  async getListings(params = {}) {
    const url = TRADE_ENDPOINTS.LISTINGS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取上架详情
   * @param {string} listingId - 上架 ID
   * @returns {Promise<Object>} API 响应
   */
  async getListingDetail(listingId) {
    const url = buildURL(TRADE_ENDPOINTS.LISTINGS_DETAIL, { listing_id: listingId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建上架
   * @param {Object} data - 上架数据
   * @returns {Promise<Object>} API 响应
   */
  async createListing(data) {
    return await request({ url: TRADE_ENDPOINTS.LISTINGS_CREATE, method: 'POST', data })
  },

  /**
   * 更新上架
   * @param {string} listingId - 上架 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} API 响应
   */
  async updateListing(listingId, data) {
    const url = buildURL(TRADE_ENDPOINTS.LISTINGS_UPDATE, { listing_id: listingId })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除上架
   * @param {string} listingId - 上架 ID
   * @returns {Promise<Object>} API 响应
   */
  async deleteListing(listingId) {
    const url = buildURL(TRADE_ENDPOINTS.LISTINGS_DELETE, { listing_id: listingId })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取上架统计
   * @returns {Promise<Object>} API 响应
   */
  async getListingStats() {
    return await request({ url: TRADE_ENDPOINTS.LISTINGS_STATS, method: 'GET' })
  },

  // ===== 孤儿冻结检测 =====

  /**
   * 检测孤儿冻结
   * @returns {Promise<Object>} API 响应
   */
  async detectOrphanFrozen() {
    return await request({ url: TRADE_ENDPOINTS.ORPHAN_DETECT, method: 'POST' })
  },

  /**
   * 获取孤儿冻结统计
   * @returns {Promise<Object>} API 响应
   */
  async getOrphanStats() {
    return await request({ url: TRADE_ENDPOINTS.ORPHAN_STATS, method: 'GET' })
  },

  /**
   * 清理孤儿冻结
   * @param {Object} data - 清理参数
   * @param {Array<number>} [data.ids] - 指定清理的记录 ID 列表
   * @param {boolean} [data.force=false] - 是否强制清理
   * @returns {Promise<Object>} API 响应
   */
  async cleanupOrphanFrozen(data) {
    return await request({ url: TRADE_ENDPOINTS.ORPHAN_CLEANUP, method: 'POST', data })
  },

  // ===== 业务记录查询 =====

  /**
   * 获取抽奖清除设置记录列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 记录列表
   */
  async getLotteryClearRecords(params = {}) {
    const url = TRADE_ENDPOINTS.BUSINESS_RECORDS_LOTTERY_CLEAR + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取抽奖清除设置记录详情
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getLotteryClearRecordDetail(recordId) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_LOTTERY_CLEAR_DETAIL, {
      record_id: recordId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取核销订单列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 订单列表
   */
  async getRedemptionOrders(params = {}) {
    const url = TRADE_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取核销订单详情
   * @param {number} orderId - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  async getRedemptionOrderDetail(orderId) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_DETAIL, { order_id: orderId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 执行核销订单
   * @param {number} orderId - 订单ID
   * @param {Object} [data={}] - 核销数据
   * @returns {Promise<Object>} 核销结果
   */
  async redeemOrder(orderId, data = {}) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_REDEEM, { order_id: orderId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 取消核销订单
   * @param {number} orderId - 订单ID
   * @param {Object} [data={}] - 取消数据
   * @returns {Promise<Object>} 取消结果
   */
  async cancelRedemptionOrder(orderId, data = {}) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_CANCEL, { order_id: orderId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 获取内容审核记录列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 记录列表
   */
  async getContentReviews(params = {}) {
    const url = TRADE_ENDPOINTS.BUSINESS_RECORDS_CONTENT_REVIEWS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取内容审核记录详情
   * @param {number} auditId - 审核ID
   * @returns {Promise<Object>} 记录详情
   */
  async getContentReviewDetail(auditId) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_CONTENT_REVIEWS_DETAIL, {
      audit_id: auditId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户角色变更记录列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 记录列表
   */
  async getRoleChangeRecords(params = {}) {
    const url = TRADE_ENDPOINTS.BUSINESS_RECORDS_ROLE_CHANGES + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户角色变更记录详情
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getRoleChangeRecordDetail(recordId) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_ROLE_CHANGES_DETAIL, {
      record_id: recordId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户状态变更记录列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 记录列表
   */
  async getStatusChangeRecords(params = {}) {
    const url = TRADE_ENDPOINTS.BUSINESS_RECORDS_STATUS_CHANGES + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户状态变更记录详情
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getStatusChangeRecordDetail(recordId) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_STATUS_CHANGES_DETAIL, {
      record_id: recordId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换记录列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 记录列表
   */
  async getExchangeRecords(params = {}) {
    const url = TRADE_ENDPOINTS.BUSINESS_RECORDS_EXCHANGE + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换记录详情
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getExchangeRecordDetail(recordId) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_EXCHANGE_DETAIL, { record_id: recordId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取聊天消息记录列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 记录列表
   */
  async getChatMessages(params = {}) {
    const url = TRADE_ENDPOINTS.BUSINESS_RECORDS_CHAT + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取聊天消息详情
   * @param {number} messageId - 消息ID
   * @returns {Promise<Object>} 消息详情
   */
  async getChatMessageDetail(messageId) {
    const url = buildURL(TRADE_ENDPOINTS.BUSINESS_RECORDS_CHAT_DETAIL, { message_id: messageId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取聊天消息统计汇总
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 统计汇总
   */
  async getChatMessageStats(params = {}) {
    const url = TRADE_ENDPOINTS.BUSINESS_RECORDS_CHAT_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 交易订单扩展 =====

  /**
   * 获取交易订单列表（扩展）
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 订单列表
   */
  async getTradeOrdersList(params = {}) {
    const url = TRADE_ENDPOINTS.TRADE_ORDERS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取交易订单详情（通过ID）
   * @param {number} orderId - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  async getTradeOrderById(orderId) {
    const url = buildURL(TRADE_ENDPOINTS.TRADE_ORDERS_DETAIL, { id: orderId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取交易订单统计
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 统计数据
   */
  async getTradeOrdersStats(params = {}) {
    const url = TRADE_ENDPOINTS.TRADE_ORDERS_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户交易订单统计
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 用户统计数据
   */
  async getUserTradeOrdersStats(userId, params = {}) {
    const url =
      buildURL(TRADE_ENDPOINTS.TRADE_ORDERS_USER_STATS, { user_id: userId }) +
      buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 按业务ID查询交易订单
   * @param {string} businessId - 业务ID
   * @returns {Promise<Object>} 订单信息
   */
  async getTradeOrderByBusinessId(businessId) {
    const url = buildURL(TRADE_ENDPOINTS.TRADE_ORDERS_BY_BUSINESS_ID, { business_id: businessId })
    return await request({ url, method: 'GET' })
  },

  // ===== 市场综合统计 =====

  /**
   * 获取市场综合统计
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 市场统计数据
   */
  async getMarketplaceStats(params = {}) {
    const url = TRADE_ENDPOINTS.MARKETPLACE_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取C2C市场列表（别名）
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 市场列表
   */
  async getC2CMarketList(params = {}) {
    const url = TRADE_ENDPOINTS.C2C_MARKET_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取C2C市场详情
   * @param {number} listingId - 挂牌ID
   * @returns {Promise<Object>} 挂牌详情
   */
  async getC2CMarketDetail(listingId) {
    const url = buildURL(TRADE_ENDPOINTS.C2C_MARKET_DETAIL, { listing_id: listingId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取C2C市场统计
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 统计数据
   */
  async getC2CMarketStats(params = {}) {
    const url = TRADE_ENDPOINTS.C2C_MARKET_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  }
}

export default TradeAPI

