/**
 * 固定汇率兑换 API 模块
 *
 * @module api/market/exchange-rate
 * @description 汇率兑换规则管理（管理后台）相关的 API 调用
 * @version 1.0.0
 * @date 2026-02-23
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const EXCHANGE_RATE_ENDPOINTS = {
  /** 汇率规则列表 */
  EXCHANGE_RATE_LIST: `${API_PREFIX}/console/exchange-rates`,
  /** 创建汇率规则 */
  EXCHANGE_RATE_CREATE: `${API_PREFIX}/console/exchange-rates`,
  /** 更新汇率规则 */
  EXCHANGE_RATE_UPDATE: `${API_PREFIX}/console/exchange-rates/:id`,
  /** 更新汇率规则状态 */
  EXCHANGE_RATE_STATUS: `${API_PREFIX}/console/exchange-rates/:id/status`
}

// ========== API 调用方法 ==========

export const ExchangeRateAPI = {
  /**
   * 获取汇率规则列表
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 筛选状态（active/paused/disabled）
   * @param {string} [params.from_asset_code] - 筛选源资产
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeRates(params = {}) {
    const url = EXCHANGE_RATE_ENDPOINTS.EXCHANGE_RATE_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建汇率规则
   * @param {Object} data - 规则数据
   * @returns {Promise<Object>} API 响应
   */
  async createExchangeRate(data) {
    return await request({
      url: EXCHANGE_RATE_ENDPOINTS.EXCHANGE_RATE_CREATE,
      method: 'POST',
      data
    })
  },

  /**
   * 更新汇率规则
   * @param {number} id - 规则ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} API 响应
   */
  async updateExchangeRate(id, data) {
    const url = buildURL(EXCHANGE_RATE_ENDPOINTS.EXCHANGE_RATE_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 更新汇率规则状态
   * @param {number} id - 规则ID
   * @param {string} status - 新状态（active/paused/disabled）
   * @returns {Promise<Object>} API 响应
   */
  async updateExchangeRateStatus(id, status) {
    const url = buildURL(EXCHANGE_RATE_ENDPOINTS.EXCHANGE_RATE_STATUS, { id })
    return await request({ url, method: 'PATCH', data: { status } })
  }
}
