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
  BUSINESS_HEALTH: `${API_PREFIX}/console/dashboard/business-health`,
  TIME_COMPARISON: `${API_PREFIX}/console/dashboard/time-comparison`,

  // 统计分析接口
  TODAY_STATS: `${API_PREFIX}/console/analytics/stats/today`,
  DECISIONS_ANALYTICS: `${API_PREFIX}/console/analytics/decisions/analytics`,

  // 告警和预算接口
  REALTIME_ALERTS: `${API_PREFIX}/console/lottery-realtime/alerts`,
  BUDGET_STATUS: `${API_PREFIX}/console/campaign-budget/batch-status`,

  // 平台收入管理（PlatformRevenueService）
  REVENUE_OVERVIEW: `${API_PREFIX}/console/dashboard/revenue/overview`,
  REVENUE_BY_SOURCE: `${API_PREFIX}/console/dashboard/revenue/by-source`,
  REVENUE_TREND: `${API_PREFIX}/console/dashboard/revenue/trend`,
  REVENUE_FEE_STATS: `${API_PREFIX}/console/dashboard/revenue/fee-stats`,

  // 市场健康看板（MarketHealthService）
  MARKET_HEALTH_SUMMARY: `${API_PREFIX}/console/dashboard/market-health`,
  MARKET_HEALTH_ORDER_TREND: `${API_PREFIX}/console/dashboard/market-health/order-trend`,
  MARKET_HEALTH_TOP_USERS: `${API_PREFIX}/console/dashboard/market-health/top-users`,

  /**
   * 跨域顶线：B2C 兑换 + C2C 市场 + 竞拍（一次请求）
   * 后端: GET /api/v4/console/dashboard/stats?days=7
   */
  PLATFORM_CROSS_STATS: `${API_PREFIX}/console/dashboard/stats`
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
  },

  // ===== 平台收入管理（PlatformRevenueService） =====

  /**
   * 获取平台收入概览
   * @returns {Promise<Object>} 收入概览（balances + total_income）
   */
  async getRevenueOverview() {
    return request({ url: DASHBOARD_ENDPOINTS.REVENUE_OVERVIEW })
  },

  /**
   * 获取收入来源分类
   * @returns {Promise<Object>} 来源分类数据
   */
  async getRevenueBySource() {
    return request({ url: DASHBOARD_ENDPOINTS.REVENUE_BY_SOURCE })
  },

  /**
   * 获取收入趋势
   * @param {Object} params - 查询参数
   * @param {string} [params.period='daily'] - 周期（daily/weekly/monthly）
   * @param {number} [params.days=7] - 天数
   * @returns {Promise<Object>} 趋势数据
   */
  async getRevenueTrend(params = {}) {
    return request({ url: DASHBOARD_ENDPOINTS.REVENUE_TREND, params })
  },

  /**
   * 获取手续费统计
   * @returns {Promise<Object>} 手续费率配置 + 30天手续费统计
   */
  async getRevenueFeeStats() {
    return request({ url: DASHBOARD_ENDPOINTS.REVENUE_FEE_STATS })
  },

  // ===== 市场健康看板（MarketHealthService） =====

  /**
   * 获取市场健康摘要
   * @returns {Promise<Object>} 订单状态趋势 + 平均结算时间 + Top买家/卖家
   */
  async getMarketHealthSummary() {
    return request({ url: DASHBOARD_ENDPOINTS.MARKET_HEALTH_SUMMARY })
  },

  /**
   * 获取市场订单趋势
   * @param {Object} params - 查询参数
   * @param {number} [params.days=7] - 天数
   * @returns {Promise<Object>} 订单趋势数据
   */
  async getMarketHealthOrderTrend(params = {}) {
    return request({ url: DASHBOARD_ENDPOINTS.MARKET_HEALTH_ORDER_TREND, params })
  },

  /**
   * 获取市场活跃用户排行
   * @param {Object} params - 查询参数
   * @param {number} [params.page_size=5] - 排行数量
   * @returns {Promise<Object>} Top买家/卖家排行
   */
  async getMarketHealthTopUsers(params = {}) {
    return request({ url: DASHBOARD_ENDPOINTS.MARKET_HEALTH_TOP_USERS, params })
  },

  /**
   * 跨域平台顶线（兑换 + 二级市场 + 竞拍）
   * @param {Object} [params={}] - { days?: number }
   */
  async getPlatformCrossStats(params = {}) {
    return request({ url: DASHBOARD_ENDPOINTS.PLATFORM_CROSS_STATS, params })
  }
}

export default DashboardAPI
