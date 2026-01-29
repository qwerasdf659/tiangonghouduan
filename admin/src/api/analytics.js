/**
 * 数据分析 API 模块
 *
 * @module api/analytics
 * @description 数据统计、图表、报表相关的 API 调用
 * @version 1.0.0
 * @date 2026-01-23
 */

import { logger } from '../utils/logger.js'
import { API_PREFIX, request, buildURL, buildQueryString } from './base.js'

// ========== 类型定义 ==========

/**
 * 日期范围查询参数
 * @typedef {Object} DateRangeParams
 * @property {string} [start_date] - 开始日期 (YYYY-MM-DD)
 * @property {string} [end_date] - 结束日期 (YYYY-MM-DD)
 * @property {string} [period] - 时间周期 ('day'|'week'|'month')
 */

/**
 * 今日统计数据
 * @typedef {Object} TodayStats
 * @property {number} new_users - 今日新增用户
 * @property {number} active_users - 今日活跃用户
 * @property {number} lottery_count - 今日抽奖次数
 * @property {number} revenue - 今日收入
 */

/**
 * 财务概览数据
 * @typedef {Object} FinanceOverview
 * @property {number} total_revenue - 总收入
 * @property {number} today_revenue - 今日收入
 * @property {number} pending_settlement - 待结算金额
 * @property {number} completed_settlement - 已结算金额
 */

/**
 * 图表数据点
 * @typedef {Object} ChartDataPoint
 * @property {string} date - 日期
 * @property {number} value - 数值
 * @property {string} [label] - 标签
 */

// ========== API 端点 ==========

export const ANALYTICS_ENDPOINTS = {
  // 基础统计
  TODAY_STATS: `${API_PREFIX}/console/analytics/stats/today`,
  DECISIONS: `${API_PREFIX}/console/analytics/decisions/analytics`,
  LOTTERY_TRENDS: `${API_PREFIX}/console/analytics/lottery/trends`,
  DASHBOARD_TRENDS: `${API_PREFIX}/console/analytics/decisions/analytics`,

  // 图表数据
  CHARTS: `${API_PREFIX}/system/statistics/charts`,
  CHARTS_USER_GROWTH: `${API_PREFIX}/console/analytics/charts/user-growth`,
  CHARTS_REVENUE: `${API_PREFIX}/console/analytics/charts/revenue`,
  CHARTS_LOTTERY: `${API_PREFIX}/console/analytics/charts/lottery`,

  // 统计导出
  STATISTICS_EXPORT: `${API_PREFIX}/system/statistics/export`,

  // 财务管理
  FINANCE_OVERVIEW: `${API_PREFIX}/console/finance/overview`,
  FINANCE_TRANSACTIONS: `${API_PREFIX}/console/finance/transactions`,
  FINANCE_SETTLEMENTS: `${API_PREFIX}/console/finance/settlements`,
  FINANCE_REPORTS: `${API_PREFIX}/console/finance/reports`,

  // 活动预算
  CAMPAIGN_BUDGET_BATCH_STATUS: `${API_PREFIX}/console/campaign-budget/batch-status`,
  CAMPAIGN_BUDGET_DETAIL: `${API_PREFIX}/console/campaign-budget/campaigns/:campaign_id`,

  // 策略统计（与后端实际路由对齐，需要 campaign_id 参数）
  STRATEGY_STATS_REALTIME: `${API_PREFIX}/console/lottery-strategy-stats/realtime/:campaign_id`,
  STRATEGY_STATS_HOURLY: `${API_PREFIX}/console/lottery-strategy-stats/hourly/:campaign_id`,
  STRATEGY_STATS_DAILY: `${API_PREFIX}/console/lottery-strategy-stats/daily/:campaign_id`,
  STRATEGY_STATS_TIER_DISTRIBUTION:
    `${API_PREFIX}/console/lottery-strategy-stats/tier-distribution/:campaign_id`,
  STRATEGY_STATS_EXPERIENCE:
    `${API_PREFIX}/console/lottery-strategy-stats/experience-triggers/:campaign_id`,
  STRATEGY_STATS_BUDGET: `${API_PREFIX}/console/lottery-strategy-stats/budget-consumption/:campaign_id`,

  // 客服统计
  CUSTOMER_SERVICE_SESSIONS: `${API_PREFIX}/console/customer-service/sessions`,
  CUSTOMER_SERVICE_SESSION_MESSAGES:
    `${API_PREFIX}/console/customer-service/sessions/:session_id/messages`,
  CUSTOMER_SERVICE_SEND_MESSAGE: `${API_PREFIX}/console/customer-service/sessions/:session_id/messages`,
  CUSTOMER_SERVICE_CLOSE: `${API_PREFIX}/console/customer-service/sessions/:session_id/close`,
  CUSTOMER_SERVICE_MARK_READ: `${API_PREFIX}/console/customer-service/sessions/:session_id/mark-read`,
  CUSTOMER_SERVICE_TRANSFER: `${API_PREFIX}/console/customer-service/sessions/:session_id/transfer`
}

// ========== API 调用方法 ==========

export const AnalyticsAPI = {
  // ===== 基础统计 =====

  /**
   * 获取今日统计
   * @async
   * @returns {Promise<Object>} 今日统计数据 (新增用户、活跃用户、抽奖次数等)
   * @throws {Error} 网络请求失败或服务器错误
   *
   * @example
   * // 获取今日统计数据
   * const result = await AnalyticsAPI.getTodayStats()
   * logger.debug(result.data.new_users) // 今日新增用户
   * logger.debug(result.data.active_users) // 今日活跃用户
   */
  async getTodayStats() {
    return await request({ url: ANALYTICS_ENDPOINTS.TODAY_STATS, method: 'GET' })
  },

  /**
   * 获取决策分析数据
   * @async
   * @param {DateRangeParams} [params={}] - 查询参数
   * @param {string} [params.start_date] - 开始日期 (YYYY-MM-DD)
   * @param {string} [params.end_date] - 结束日期 (YYYY-MM-DD)
   * @returns {Promise<Object>} 决策分析数据
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取最近7天的决策分析
   * const result = await AnalyticsAPI.getDecisions({
   *   start_date: '2026-01-16',
   *   end_date: '2026-01-23'
   * })
   */
  async getDecisions(params = {}) {
    const url = ANALYTICS_ENDPOINTS.DECISIONS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取抽奖趋势
   * @async
   * @param {DateRangeParams} [params={}] - 查询参数
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {string} [params.period='day'] - 统计周期 ('day'|'week'|'month')
   * @returns {Promise<Object>} 抽奖趋势数据
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取按月统计的抽奖趋势
   * const result = await AnalyticsAPI.getLotteryTrends({
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-31',
   *   period: 'day'
   * })
   */
  async getLotteryTrends(params = {}) {
    const url = ANALYTICS_ENDPOINTS.LOTTERY_TRENDS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取仪表盘趋势数据
   * @async
   * @param {DateRangeParams} [params={}] - 查询参数
   * @returns {Promise<Object>} 仪表盘趋势数据
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取仪表盘趋势数据
   * const result = await AnalyticsAPI.getDashboardTrends({
   *   period: 'week'
   * })
   */
  async getDashboardTrends(params = {}) {
    const url = ANALYTICS_ENDPOINTS.DASHBOARD_TRENDS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 图表数据 =====

  /**
   * 获取图表数据
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.type] - 图表类型
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 图表数据
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取通用图表数据
   * const result = await AnalyticsAPI.getCharts({
   *   type: 'overview',
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-23'
   * })
   */
  async getCharts(params = {}) {
    const url = ANALYTICS_ENDPOINTS.CHARTS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户增长图表
   * @async
   * @param {DateRangeParams} [params={}] - 查询参数（日期范围等）
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 用户增长图表数据
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取用户增长趋势图
   * const result = await AnalyticsAPI.getUserGrowthChart({
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-23'
   * })
   */
  async getUserGrowthChart(params = {}) {
    const url = ANALYTICS_ENDPOINTS.CHARTS_USER_GROWTH + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取收入图表
   * @async
   * @param {DateRangeParams} [params={}] - 查询参数
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 收入图表数据
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取收入趋势图
   * const result = await AnalyticsAPI.getRevenueChart({
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-23'
   * })
   */
  async getRevenueChart(params = {}) {
    const url = ANALYTICS_ENDPOINTS.CHARTS_REVENUE + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取抽奖图表
   * @async
   * @param {DateRangeParams} [params={}] - 查询参数
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 抽奖图表数据
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取抽奖统计图表
   * const result = await AnalyticsAPI.getLotteryChart({
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-23'
   * })
   */
  async getLotteryChart(params = {}) {
    const url = ANALYTICS_ENDPOINTS.CHARTS_LOTTERY + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 统计导出 =====

  /**
   * 导出统计数据
   * @async
   * @param {Object} [params={}] - 导出参数
   * @param {string} [params.type] - 导出类型 ('user'|'lottery'|'finance')
   * @param {string} [params.format='xlsx'] - 导出格式 ('xlsx'|'csv')
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 导出文件下载链接
   * @throws {Error} 导出权限不足
   * @throws {Error} 数据量过大无法导出
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 导出用户统计为Excel
   * const result = await AnalyticsAPI.exportStatistics({
   *   type: 'user',
   *   format: 'xlsx',
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-23'
   * })
   */
  async exportStatistics(params = {}) {
    const url = ANALYTICS_ENDPOINTS.STATISTICS_EXPORT + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 财务管理 =====

  /**
   * 获取财务概览
   * @async
   * @returns {Promise<Object>} 财务概览数据 (总收入、今日收入、待结算等)
   * @throws {Error} 财务数据访问权限不足
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取财务概览
   * const result = await AnalyticsAPI.getFinanceOverview()
   * logger.debug(result.data.total_revenue) // 总收入
   * logger.debug(result.data.pending_settlement) // 待结算金额
   */
  async getFinanceOverview() {
    return await request({ url: ANALYTICS_ENDPOINTS.FINANCE_OVERVIEW, method: 'GET' })
  },

  /**
   * 获取财务交易列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.type] - 交易类型筛选
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 交易列表
   * @throws {Error} 财务数据访问权限不足
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取财务交易列表
   * const result = await AnalyticsAPI.getFinanceTransactions({
   *   page: 1,
   *   page_size: 20,
   *   start_date: '2026-01-01'
   * })
   */
  async getFinanceTransactions(params = {}) {
    const url = ANALYTICS_ENDPOINTS.FINANCE_TRANSACTIONS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取结算列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.status] - 状态筛选 ('pending'|'completed')
   * @returns {Promise<Object>} 结算列表
   * @throws {Error} 结算数据访问权限不足
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取待结算列表
   * const result = await AnalyticsAPI.getSettlements({
   *   status: 'pending',
   *   page: 1
   * })
   */
  async getSettlements(params = {}) {
    const url = ANALYTICS_ENDPOINTS.FINANCE_SETTLEMENTS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取财务报表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.type] - 报表类型 ('daily'|'weekly'|'monthly')
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 财务报表数据
   * @throws {Error} 报表访问权限不足
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取月度财务报表
   * const result = await AnalyticsAPI.getFinanceReports({
   *   type: 'monthly',
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-31'
   * })
   */
  async getFinanceReports(params = {}) {
    const url = ANALYTICS_ENDPOINTS.FINANCE_REPORTS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 活动预算 =====

  /**
   * 获取活动预算批量状态
   * @async
   * @returns {Promise<Object>} 所有活动的预算状态汇总
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取所有活动的预算状态
   * const result = await AnalyticsAPI.getCampaignBudgetBatchStatus()
   * logger.debug(result.data) // 活动预算状态列表
   */
  async getCampaignBudgetBatchStatus() {
    return await request({ url: ANALYTICS_ENDPOINTS.CAMPAIGN_BUDGET_BATCH_STATUS, method: 'GET' })
  },

  /**
   * 获取活动预算详情
   * @async
   * @param {string} campaignId - 活动 ID
   * @returns {Promise<Object>} 活动预算详细信息
   * @throws {Error} 活动不存在
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取指定活动的预算详情
   * const result = await AnalyticsAPI.getCampaignBudgetDetail('camp_12345')
   * logger.debug(result.data.budget) // 预算金额
   * logger.debug(result.data.spent) // 已使用金额
   */
  async getCampaignBudgetDetail(campaignId) {
    const url = buildURL(ANALYTICS_ENDPOINTS.CAMPAIGN_BUDGET_DETAIL, { campaign_id: campaignId })
    return await request({ url, method: 'GET' })
  }
}

export default AnalyticsAPI
