/**
 * B2C 兑换市场 API 模块
 *
 * @module api/market/exchange
 * @description 兑换市场商品管理、兑换订单管理相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-30
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点（仅包含后端实际存在的路由） ==========

export const EXCHANGE_ENDPOINTS = {
  // 兑换订单（后端: routes/v4/console/market/marketplace.js）
  EXCHANGE_ORDERS: `${API_PREFIX}/console/marketplace/exchange_market/orders`,
  EXCHANGE_ORDER_DETAIL: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no`,
  EXCHANGE_ORDER_APPROVE: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/approve`,
  EXCHANGE_ORDER_SHIP: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/ship`,
  EXCHANGE_ORDER_REJECT: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/reject`,
  EXCHANGE_ORDER_REFUND: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/refund`,
  EXCHANGE_ORDER_COMPLETE: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/complete`,

  // 排序管理（后端: routes/v4/console/market/marketplace.js）
  EXCHANGE_ITEM_PIN: `${API_PREFIX}/console/marketplace/exchange_market/items/:exchange_item_id/pin`,
  EXCHANGE_ITEM_RECOMMEND: `${API_PREFIX}/console/marketplace/exchange_market/items/:exchange_item_id/recommend`,
  EXCHANGE_ITEMS_BATCH_SORT: `${API_PREFIX}/console/marketplace/exchange_market/items/batch-sort`,
  EXCHANGE_ITEMS_BATCH_STATUS: `${API_PREFIX}/console/marketplace/exchange_market/items/batch-status`,
  EXCHANGE_ITEMS_BATCH_PRICE: `${API_PREFIX}/console/marketplace/exchange_market/items/batch-price`,
  EXCHANGE_ITEMS_BATCH_CATEGORY: `${API_PREFIX}/console/marketplace/exchange_market/items/batch-category`,

  // 快递查询（后端: routes/v4/console/market/marketplace.js）
  EXCHANGE_SHIPPING_COMPANIES: `${API_PREFIX}/console/marketplace/exchange_market/shipping-companies`,
  EXCHANGE_ORDER_TRACK: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/track`,

  // 市场概览统计（二级市场成交，后端: marketplace.js）
  MARKET_STATS_OVERVIEW: `${API_PREFIX}/console/marketplace/stats/overview`,
  // 兑换市场聚合统计（服务端聚合，后端: exchange_market/statistics）
  EXCHANGE_MARKET_STATISTICS: `${API_PREFIX}/console/marketplace/exchange_market/statistics`
}

// ========== API 调用方法 ==========

export const ExchangeAPI = {
  // ===== 兑换订单 =====

  /**
   * 获取兑换订单列表
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 订单状态（pending/completed/shipped/cancelled）
   * @param {number} [params.user_id] - 用户 ID 筛选
   * @param {number} [params.item_id] - 商品 ID 筛选
   * @param {string} [params.order_no] - 订单号模糊搜索
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeOrders(params = {}) {
    const url = EXCHANGE_ENDPOINTS.EXCHANGE_ORDERS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换订单详情
   * @param {string} orderNo - 订单号
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeOrderDetail(orderNo) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ORDER_DETAIL, { order_no: orderNo })
    return await request({ url, method: 'GET' })
  },

  /**
   * 管理员审核通过兑换订单（pending → approved）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 审核数据
   * @param {string} [data.remark] - 审核备注
   * @returns {Promise<Object>} API 响应
   */
  async approveExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ORDER_APPROVE, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 管理员拒绝兑换订单（退还材料资产）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 拒绝数据
   * @param {string} [data.remark] - 拒绝原因
   * @returns {Promise<Object>} API 响应
   */
  async rejectExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ORDER_REJECT, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 管理员发货（approved → shipped）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 发货数据
   * @param {string} [data.remark] - 发货备注
   * @returns {Promise<Object>} API 响应
   */
  async shipExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ORDER_SHIP, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 管理员退款（approved/shipped → refunded，退还材料资产）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 退款数据
   * @param {string} [data.remark] - 退款原因
   * @returns {Promise<Object>} API 响应
   */
  async refundExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ORDER_REFUND, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 管理员标记订单完成（shipped/received/rated → completed）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 完成数据
   * @param {string} [data.remark] - 完成备注
   * @returns {Promise<Object>} API 响应
   */
  async completeExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ORDER_COMPLETE, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  // ===== 排序管理（Phase 3） =====

  /**
   * 置顶/取消置顶商品
   * @param {number} itemId - 商品 ID
   * @param {boolean} isPinned - 是否置顶
   * @returns {Promise<Object>} 操作结果
   */
  async toggleItemPin(itemId, isPinned) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ITEM_PIN, { exchange_item_id: itemId })
    return await request({ url, method: 'PUT', data: { is_pinned: isPinned } })
  },

  /**
   * 推荐/取消推荐商品
   * @param {number} itemId - 商品 ID
   * @param {boolean} isRecommended - 是否推荐
   * @returns {Promise<Object>} 操作结果
   */
  async toggleItemRecommend(itemId, isRecommended) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ITEM_RECOMMEND, { exchange_item_id: itemId })
    return await request({ url, method: 'PUT', data: { is_recommended: isRecommended } })
  },

  /**
   * 批量调整商品排序
   * @param {Array<{exchange_item_id: number, sort_order: number}>} items - 排序数据
   * @returns {Promise<Object>} 操作结果
   */
  async batchSortItems(items) {
    return await request({
      url: EXCHANGE_ENDPOINTS.EXCHANGE_ITEMS_BATCH_SORT,
      method: 'PUT',
      data: { items }
    })
  },

  /** 批量上下架 */
  async batchUpdateStatus(exchangeItemIds, status) {
    return await request({
      url: EXCHANGE_ENDPOINTS.EXCHANGE_ITEMS_BATCH_STATUS,
      method: 'PUT',
      data: { exchange_item_ids: exchangeItemIds, status }
    })
  },

  /** 批量改价 */
  async batchUpdatePrice(items) {
    return await request({
      url: EXCHANGE_ENDPOINTS.EXCHANGE_ITEMS_BATCH_PRICE,
      method: 'PUT',
      data: { items }
    })
  },

  /** 批量修改分类 */
  async batchUpdateCategory(exchangeItemIds, categoryId) {
    return await request({
      url: EXCHANGE_ENDPOINTS.EXCHANGE_ITEMS_BATCH_CATEGORY,
      method: 'PUT',
      data: { exchange_item_ids: exchangeItemIds, category_id: categoryId }
    })
  },

  // ===== 快递查询（Phase 4） =====

  /**
   * 获取快递公司列表（供发货弹窗下拉）
   * @returns {Promise<Object>} 快递公司列表
   */
  async getShippingCompanies() {
    return await request({ url: EXCHANGE_ENDPOINTS.EXCHANGE_SHIPPING_COMPANIES, method: 'GET' })
  },

  /**
   * 查询订单物流轨迹
   * @param {string} orderNo - 订单号
   * @returns {Promise<Object>} 物流轨迹
   */
  async getOrderTrack(orderNo) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ORDER_TRACK, { order_no: orderNo })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取市场概览统计（C2C + B2C 总览）
   * @returns {Promise<Object>} 市场概览数据（totals/asset_ranking/on_sale_summary）
   */
  async getMarketStatsOverview() {
    return await request({ url: EXCHANGE_ENDPOINTS.MARKET_STATS_OVERVIEW, method: 'GET' })
  }
}

export default ExchangeAPI
