/**
 * B2C 兑换市场 API 模块
 *
 * @module api/market/exchange
 * @description 兑换市场商品管理、兑换订单管理相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-30
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const EXCHANGE_ENDPOINTS = {
  // 兑换市场物品
  EXCHANGE_ITEMS: `${API_PREFIX}/console/marketplace/exchange_market/items`,
  EXCHANGE_ITEM_DETAIL: `${API_PREFIX}/console/marketplace/exchange_market/items/:exchange_item_id`,
  EXCHANGE_ITEM_SIMPLE: `${API_PREFIX}/console/marketplace/exchange_market/items`,

  // 兑换订单
  EXCHANGE_ORDERS: `${API_PREFIX}/console/marketplace/exchange_market/orders`,
  EXCHANGE_ORDER_DETAIL: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no`,
  EXCHANGE_ORDER_SIMPLE: `${API_PREFIX}/console/marketplace/exchange_market/orders`,
  EXCHANGE_STATS: `${API_PREFIX}/console/marketplace/exchange_market/statistics`,
  EXCHANGE_FULL_STATS: `${API_PREFIX}/console/marketplace/exchange_market/statistics`,
  EXCHANGE_TREND: `${API_PREFIX}/console/marketplace/exchange_market/statistics/trend`,
  EXCHANGE_ORDER_STATS: `${API_PREFIX}/console/marketplace/exchange_market/orders/stats`,
  EXCHANGE_ORDER_APPROVE: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/approve`,
  EXCHANGE_ORDER_SHIP: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/ship`,
  EXCHANGE_ORDER_REJECT: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/reject`,
  EXCHANGE_ORDER_REFUND: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/refund`,
  EXCHANGE_ORDER_COMPLETE: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/complete`,

  // SKU 子资源（Phase 2 — SPU/SKU 全量模式）
  EXCHANGE_ITEM_SKUS: `${API_PREFIX}/console/marketplace/exchange_market/items/:exchange_item_id/skus`,
  EXCHANGE_ITEM_SKU_DETAIL: `${API_PREFIX}/console/marketplace/exchange_market/items/:exchange_item_id/skus/:sku_id`,

  // 排序管理（Phase 3 — 排序增强）
  EXCHANGE_ITEM_PIN: `${API_PREFIX}/console/marketplace/exchange_market/items/:exchange_item_id/pin`,
  EXCHANGE_ITEM_RECOMMEND: `${API_PREFIX}/console/marketplace/exchange_market/items/:exchange_item_id/recommend`,
  EXCHANGE_ITEMS_BATCH_SORT: `${API_PREFIX}/console/marketplace/exchange_market/items/batch-sort`,

  // 快递查询（Phase 4 — 快递双通道对接）
  EXCHANGE_SHIPPING_COMPANIES: `${API_PREFIX}/console/marketplace/exchange_market/shipping-companies`,
  EXCHANGE_ORDER_TRACK: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/track`
}

// ========== API 调用方法 ==========

export const ExchangeAPI = {
  // ===== 兑换市场物品 =====

  /**
   * 获取兑换市场物品列表
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status='all'] - 商品状态（active/inactive/all）
   * @param {string} [params.keyword] - 商品名称关键词搜索
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeItems(params = {}) {
    const url = EXCHANGE_ENDPOINTS.EXCHANGE_ITEMS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换物品详情
   * @param {number} itemId - 物品 ID
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeItemDetail(itemId) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ITEM_DETAIL, { exchange_item_id: itemId })
    return await request({ url, method: 'GET' })
  },

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

  /**
   * 获取兑换统计
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeStats() {
    return await request({ url: EXCHANGE_ENDPOINTS.EXCHANGE_STATS, method: 'GET' })
  },

  // ===== SKU 管理（Phase 2） =====

  /**
   * 获取商品的所有 SKU 列表
   * @param {number} itemId - 商品 ID
   * @returns {Promise<Object>} SKU 列表
   */
  async getItemSkus(itemId) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ITEM_SKUS, { exchange_item_id: itemId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建 SKU
   * @param {number} itemId - 商品 ID
   * @param {Object} skuData - SKU 数据（spec_values, cost_amount, stock 等）
   * @returns {Promise<Object>} 创建结果
   */
  async createItemSku(itemId, skuData) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ITEM_SKUS, { exchange_item_id: itemId })
    return await request({ url, method: 'POST', data: skuData })
  },

  /**
   * 更新 SKU
   * @param {number} itemId - 商品 ID
   * @param {number} skuId - SKU ID
   * @param {Object} updateData - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateItemSku(itemId, skuId, updateData) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ITEM_SKU_DETAIL, { exchange_item_id: itemId, sku_id: skuId })
    return await request({ url, method: 'PUT', data: updateData })
  },

  /**
   * 删除 SKU（不允许删除最后一个）
   * @param {number} itemId - 商品 ID
   * @param {number} skuId - SKU ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteItemSku(itemId, skuId) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ITEM_SKU_DETAIL, { exchange_item_id: itemId, sku_id: skuId })
    return await request({ url, method: 'DELETE' })
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
    return await request({ url: EXCHANGE_ENDPOINTS.EXCHANGE_ITEMS_BATCH_SORT, method: 'PUT', data: { items } })
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
  }
}

export default ExchangeAPI
