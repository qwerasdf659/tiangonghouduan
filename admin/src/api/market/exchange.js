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
  EXCHANGE_ITEM_DETAIL: `${API_PREFIX}/console/marketplace/exchange_market/items/:item_id`,
  EXCHANGE_ITEMS_SIMPLE: `${API_PREFIX}/console/marketplace/exchange_market/items`,

  // 兑换订单
  EXCHANGE_ORDERS: `${API_PREFIX}/console/marketplace/exchange_market/orders`,
  EXCHANGE_ORDER_DETAIL: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no`,
  EXCHANGE_ORDER_STATUS: `${API_PREFIX}/shop/exchange/orders/:order_no/status`,
  EXCHANGE_ORDERS_SIMPLE: `${API_PREFIX}/console/marketplace/exchange_market/orders`,
  EXCHANGE_STATS: `${API_PREFIX}/console/marketplace/exchange_market/statistics`,
  EXCHANGE_FULL_STATS: `${API_PREFIX}/console/marketplace/exchange_market/statistics`,
  EXCHANGE_TREND: `${API_PREFIX}/console/marketplace/exchange_market/statistics/trend`,
  EXCHANGE_ORDER_STATS: `${API_PREFIX}/console/marketplace/exchange_market/orders/stats`,
  EXCHANGE_ORDER_SHIP: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/ship`,
  EXCHANGE_ORDER_CANCEL: `${API_PREFIX}/console/marketplace/exchange_market/orders/:order_no/cancel`
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
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ITEM_DETAIL, { item_id: itemId })
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
   * 更新兑换订单状态
   * @param {string} orderNo - 订单号
   * @param {Object} data - 状态更新数据
   * @param {string} data.status - 新状态（pending/completed/shipped/cancelled）
   * @param {string} [data.remark] - 操作备注
   * @returns {Promise<Object>} API 响应
   */
  async updateExchangeOrderStatus(orderNo, data) {
    const url = buildURL(EXCHANGE_ENDPOINTS.EXCHANGE_ORDER_STATUS, { order_no: orderNo })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 获取兑换统计
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeStats() {
    return await request({ url: EXCHANGE_ENDPOINTS.EXCHANGE_STATS, method: 'GET' })
  }
}

export default ExchangeAPI

