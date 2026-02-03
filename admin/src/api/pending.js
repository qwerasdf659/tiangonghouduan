/**
 * 待处理中心 API
 * @description 待处理事项汇总和列表查询
 * @version 1.1.0
 * @date 2026-02-03
 */

import { API_PREFIX, authHeaders, handleResponse } from './base.js'

// 待处理中心端点
export const PENDING_ENDPOINTS = {
  SUMMARY: `${API_PREFIX}/console/pending/summary`,
  LIST: `${API_PREFIX}/console/pending/list`,
  HEALTH_SCORE: `${API_PREFIX}/console/pending/health-score`,
  BATCH: `${API_PREFIX}/console/pending/batch`
}

/**
 * 待处理中心 API
 */
export const PendingAPI = {
  /**
   * 获取待处理汇总统计
   * @returns {Promise<Object>} 汇总数据
   */
  async getSummary() {
    const response = await fetch(PENDING_ENDPOINTS.SUMMARY, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取待处理列表
   * @param {Object} params - 查询参数
   * @param {string} [params.category] - 分类: consumption/customer_service/risk_alert/lottery_alert
   * @param {string} [params.priority] - 优先级: urgent/normal
   * @param {boolean} [params.urgent_only] - 仅紧急事项
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   * @returns {Promise<Object>} 列表数据
   */
  async getList(params = {}) {
    const query = new URLSearchParams()
    if (params.category) query.append('category', params.category)
    if (params.priority) query.append('priority', params.priority)
    if (params.urgent_only) query.append('urgent_only', 'true')
    if (params.page) query.append('page', params.page)
    if (params.page_size) query.append('page_size', params.page_size)

    const url = `${PENDING_ENDPOINTS.LIST}?${query.toString()}`
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取待办健康度评分
   * @returns {Promise<Object>} 健康度数据
   * @returns {number} data.score - 综合健康度评分（0-100）
   * @returns {string} data.status - 健康状态（healthy/warning/critical）
   * @returns {Object} data.components - 各维度得分明细
   */
  async getHealthScore() {
    const response = await fetch(PENDING_ENDPOINTS.HEALTH_SCORE, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 批量操作待处理事项
   * @param {Object} params - 操作参数
   * @param {Array<number>} params.ids - 待处理事项ID列表
   * @param {string} params.action - 操作类型: approve/reject/handle
   * @param {string} [params.reason] - 拒绝原因（仅拒绝时必填）
   * @returns {Promise<Object>} 操作结果
   */
  async batch(params) {
    const response = await fetch(PENDING_ENDPOINTS.BATCH, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    })
    return handleResponse(response)
  }
}

export default PendingAPI
