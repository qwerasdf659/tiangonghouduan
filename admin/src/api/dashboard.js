/**
 * 运营仪表盘 API
 * @description 运营仪表盘数据查询
 * @version 1.1.0
 * @date 2026-02-01
 * @updated 2026-02-06 - 统一使用 request() 替代原生 fetch
 */

import { API_PREFIX, request } from './base.js'

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
    return request({ url: DASHBOARD_ENDPOINTS.PENDING_SUMMARY })
  },

  /**
   * 获取今日统计
   * @returns {Promise<Object>} 今日统计数据
   */
  async getTodayStats() {
    return request({ url: DASHBOARD_ENDPOINTS.TODAY_STATS })
  },

  /**
   * 获取决策分析（趋势数据）
   * @param {Object} params - 查询参数
   * @param {number} [params.days] - 天数，默认7天
   * @returns {Promise<Object>} 趋势数据
   */
  async getDecisionsAnalytics(params = {}) {
    return request({ url: DASHBOARD_ENDPOINTS.DECISIONS_ANALYTICS, params })
  },

  /**
   * 获取实时告警
   * @param {Object} params - 查询参数
   * @param {string} [params.status] - 状态: active
   * @param {number} [params.page_size] - 数量
   * @returns {Promise<Object>} 告警数据
   */
  async getRealtimeAlerts(params = {}) {
    return request({ url: DASHBOARD_ENDPOINTS.REALTIME_ALERTS, params })
  },

  /**
   * 获取预算状态
   * @returns {Promise<Object>} 预算状态数据
   */
  async getBudgetStatus() {
    return request({ url: DASHBOARD_ENDPOINTS.BUDGET_STATUS })
  },

  /**
   * 获取业务健康度评分
   * @returns {Promise<Object>} 业务健康度数据
   */
  async getBusinessHealth() {
    return request({ url: DASHBOARD_ENDPOINTS.BUSINESS_HEALTH })
  },

  /**
   * 获取时间对比数据
   * @param {Object} params - 查询参数
   * @param {string} [params.dimension] - 统计维度（consumption/lottery/user）
   * @returns {Promise<Object>} 时间对比数据
   */
  async getTimeComparison(params = {}) {
    return request({ url: DASHBOARD_ENDPOINTS.TIME_COMPARISON, params })
  }
}

export default DashboardAPI
