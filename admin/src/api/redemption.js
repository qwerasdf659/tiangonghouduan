/**
 * 兑换核销管理 API
 * @description 兑换核销订单的查询、核销、取消、批量操作
 * @version 1.0.0
 * @date 2026-02-17
 *
 * 后端路由：/api/v4/console/business-records/redemption-orders
 */

import { API_PREFIX, request } from './base.js'

/** 兑换核销端点（直接反映后端路由） */
export const REDEMPTION_ENDPOINTS = {
  /** 核销订单列表 */
  LIST: `${API_PREFIX}/console/business-records/redemption-orders`,
  /** 核销订单统计 */
  STATISTICS: `${API_PREFIX}/console/business-records/redemption-orders/statistics`,
  /** 核销订单导出 */
  EXPORT: `${API_PREFIX}/console/business-records/redemption-orders/export`,
  /** 批量核销 */
  BATCH_REDEEM: `${API_PREFIX}/console/business-records/redemption-orders/batch-redeem`,
  /** 批量取消 */
  BATCH_CANCEL: `${API_PREFIX}/console/business-records/redemption-orders/batch-cancel`,
  /** 批量过期处理 */
  BATCH_EXPIRE: `${API_PREFIX}/console/business-records/redemption-orders/batch-expire`
}

/**
 * 兑换核销 API
 */
export const RedemptionAPI = {
  /**
   * 获取核销订单列表
   * @param {Object} params - 查询参数
   * @param {string} [params.status] - 状态: pending/fulfilled/cancelled/expired
   * @param {string} [params.mobile] - 用户手机号（模糊搜索）
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   * @returns {Promise<Object>} 列表数据
   */
  async getList(params = {}) {
    return request({ url: REDEMPTION_ENDPOINTS.LIST, params })
  },

  /**
   * 获取核销订单统计
   * @returns {Promise<Object>} 统计数据（各状态数量）
   */
  async getStatistics() {
    return request({ url: REDEMPTION_ENDPOINTS.STATISTICS })
  },

  /**
   * 获取核销订单详情
   * @param {string} orderId - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  async getDetail(orderId) {
    return request({ url: `${REDEMPTION_ENDPOINTS.LIST}/${orderId}` })
  },

  /**
   * 管理员直接核销订单
   * @param {string} orderId - 订单ID
   * @param {Object} data - 核销数据
   * @param {number} [data.store_id] - 核销门店ID
   * @param {string} [data.remark] - 备注
   * @returns {Promise<Object>} 核销结果
   */
  async redeem(orderId, data = {}) {
    return request({
      url: `${REDEMPTION_ENDPOINTS.LIST}/${orderId}/redeem`,
      method: 'POST',
      data
    })
  },

  /**
   * 管理员取消订单
   * @param {string} orderId - 订单ID
   * @param {Object} data - 取消数据
   * @param {string} [data.reason] - 取消原因
   * @returns {Promise<Object>} 取消结果
   */
  async cancel(orderId, data = {}) {
    return request({
      url: `${REDEMPTION_ENDPOINTS.LIST}/${orderId}/cancel`,
      method: 'POST',
      data
    })
  },

  /**
   * 批量核销订单（仅处理 pending 状态）
   * @param {string[]} orderIds - 订单ID数组
   * @param {Object} [data] - 核销附加数据
   * @param {number} [data.store_id] - 核销门店ID
   * @param {string} [data.remark] - 备注
   * @returns {Promise<Object>} 批量操作结果
   */
  async batchRedeem(orderIds, data = {}) {
    return request({
      url: REDEMPTION_ENDPOINTS.BATCH_REDEEM,
      method: 'POST',
      data: { order_ids: orderIds, ...data }
    })
  },

  /**
   * 批量取消订单（仅处理 pending 状态）
   * @param {string[]} orderIds - 订单ID数组
   * @param {Object} [data] - 取消附加数据
   * @param {string} [data.reason] - 取消原因
   * @returns {Promise<Object>} 批量操作结果
   */
  async batchCancel(orderIds, data = {}) {
    return request({
      url: REDEMPTION_ENDPOINTS.BATCH_CANCEL,
      method: 'POST',
      data: { order_ids: orderIds, ...data }
    })
  },

  /**
   * 批量将订单设为过期
   * @param {string[]} orderIds - 订单ID数组
   * @returns {Promise<Object>} 批量操作结果
   */
  async batchExpire(orderIds) {
    return request({
      url: REDEMPTION_ENDPOINTS.BATCH_EXPIRE,
      method: 'POST',
      data: { order_ids: orderIds }
    })
  },

  /**
   * 导出核销订单（返回下载链接）
   * @param {Object} params - 筛选参数
   * @param {string} [params.status] - 状态筛选
   * @returns {string} 导出URL
   */
  getExportUrl(params = {}) {
    const queryString = new URLSearchParams(params).toString()
    return `${REDEMPTION_ENDPOINTS.EXPORT}${queryString ? '?' + queryString : ''}`
  }
}

export default RedemptionAPI
