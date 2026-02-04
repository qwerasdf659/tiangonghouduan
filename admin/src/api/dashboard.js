/**
 * 运营仪表盘 API
 * @description 运营仪表盘数据查询
 * @version 1.0.0
 * @date 2026-02-01
 */

import { API_PREFIX, authHeaders, handleResponse } from './base.js'

// 仪表盘端点（以后端实际路由为准）
export const DASHBOARD_ENDPOINTS = {
  // 运营看板核心接口
  PENDING_SUMMARY: `${API_PREFIX}/console/dashboard/pending-summary`,
  BUSINESS_HEALTH: `${API_PREFIX}/console/dashboard/business-health`,  // 业务健康度评分
  TIME_COMPARISON: `${API_PREFIX}/console/dashboard/time-comparison`,  // 时间对比数据
  
  // 统计分析接口
  TODAY_STATS: `${API_PREFIX}/console/analytics/stats/today`,
  DECISIONS_ANALYTICS: `${API_PREFIX}/console/analytics/decisions/analytics`,
  
  // 告警和预算接口
  REALTIME_ALERTS: `${API_PREFIX}/console/lottery-realtime/alerts`,
  BUDGET_STATUS: `${API_PREFIX}/console/campaign-budget/batch-status`
}

/**
 * 运营仪表盘 API
 */
export const DashboardAPI = {
  /**
   * 获取待处理汇总
   * @returns {Promise<Object>} 待处理汇总数据
   */
  async getPendingSummary() {
    const response = await fetch(DASHBOARD_ENDPOINTS.PENDING_SUMMARY, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取今日统计
   * @returns {Promise<Object>} 今日统计数据
   */
  async getTodayStats() {
    const response = await fetch(DASHBOARD_ENDPOINTS.TODAY_STATS, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取决策分析（趋势数据）
   * @param {Object} params - 查询参数
   * @param {number} [params.days] - 天数，默认7天
   * @returns {Promise<Object>} 趋势数据
   */
  async getDecisionsAnalytics(params = {}) {
    const query = new URLSearchParams()
    if (params.days) query.append('days', params.days)

    const url = `${DASHBOARD_ENDPOINTS.DECISIONS_ANALYTICS}?${query.toString()}`
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取实时告警
   * @param {Object} params - 查询参数
   * @param {string} [params.status] - 状态: active
   * @param {number} [params.page_size] - 数量
   * @returns {Promise<Object>} 告警数据
   */
  async getRealtimeAlerts(params = {}) {
    const query = new URLSearchParams()
    if (params.status) query.append('status', params.status)
    if (params.page_size) query.append('page_size', params.page_size)

    const url = `${DASHBOARD_ENDPOINTS.REALTIME_ALERTS}?${query.toString()}`
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取预算状态
   * @returns {Promise<Object>} 预算状态数据
   */
  async getBudgetStatus() {
    const response = await fetch(DASHBOARD_ENDPOINTS.BUDGET_STATUS, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取业务健康度评分
   * @returns {Promise<Object>} 业务健康度数据
   * @description 对应后端 /api/v4/console/dashboard/business-health
   */
  async getBusinessHealth() {
    const response = await fetch(DASHBOARD_ENDPOINTS.BUSINESS_HEALTH, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取时间对比数据
   * @param {Object} params - 查询参数
   * @param {string} [params.dimension] - 统计维度（consumption/lottery/user）
   * @returns {Promise<Object>} 时间对比数据
   * @description 对应后端 /api/v4/console/dashboard/time-comparison
   */
  async getTimeComparison(params = {}) {
    const query = new URLSearchParams()
    if (params.dimension) query.append('dimension', params.dimension)

    const url = query.toString() 
      ? `${DASHBOARD_ENDPOINTS.TIME_COMPARISON}?${query.toString()}`
      : DASHBOARD_ENDPOINTS.TIME_COMPARISON
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  }
}

export default DashboardAPI
