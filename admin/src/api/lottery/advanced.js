/**
 * 抽奖高级 API 模块
 *
 * @module api/lottery/advanced
 * @description 策略配置、配额管理、监控统计、预算管理相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-30
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const LOTTERY_ADVANCED_ENDPOINTS = {
  // 策略配置
  STRATEGY_LIST: `${API_PREFIX}/console/lottery-configs/strategies`,
  STRATEGY_DETAIL: `${API_PREFIX}/console/lottery-configs/strategies/:id`,
  STRATEGY_CREATE: `${API_PREFIX}/console/lottery-configs/strategies`,
  STRATEGY_UPDATE: `${API_PREFIX}/console/lottery-configs/strategies/:id`,
  STRATEGY_DELETE: `${API_PREFIX}/console/lottery-configs/strategies/:id`,

  // 矩阵配置
  MATRIX_LIST: `${API_PREFIX}/console/lottery-configs/matrix`,
  MATRIX_FULL: `${API_PREFIX}/console/lottery-configs/matrix/full`,
  MATRIX_DETAIL: `${API_PREFIX}/console/lottery-configs/matrix/:id`,
  MATRIX_CREATE: `${API_PREFIX}/console/lottery-configs/matrix`,
  MATRIX_UPDATE: `${API_PREFIX}/console/lottery-configs/matrix/:id`,
  MATRIX_HISTORY: `${API_PREFIX}/console/lottery-configs/matrix/history`,
  MATRIX_ROLLBACK: `${API_PREFIX}/console/lottery-configs/matrix/:id/rollback`,

  // 档位规则
  TIER_RULE_LIST: `${API_PREFIX}/console/lottery-tier-rules`,
  TIER_RULE_DETAIL: `${API_PREFIX}/console/lottery-tier-rules/:id`,
  TIER_RULE_CREATE: `${API_PREFIX}/console/lottery-tier-rules`,
  TIER_RULE_UPDATE: `${API_PREFIX}/console/lottery-tier-rules/:id`,
  TIER_RULE_DELETE: `${API_PREFIX}/console/lottery-tier-rules/:id`,

  // 抽奖干预管理
  INTERVENTION_LIST: `${API_PREFIX}/console/lottery-management/interventions`,
  INTERVENTION_DETAIL: `${API_PREFIX}/console/lottery-management/interventions/:id`,
  INTERVENTION_CANCEL: `${API_PREFIX}/console/lottery-management/interventions/:id/cancel`,

  // 策略统计
  STRATEGY_STATS_REALTIME: `${API_PREFIX}/console/lottery-strategy-stats/realtime/:campaign_id`,
  STRATEGY_STATS_HOURLY: `${API_PREFIX}/console/lottery-strategy-stats/hourly/:campaign_id`,
  STRATEGY_STATS_DAILY: `${API_PREFIX}/console/lottery-strategy-stats/daily/:campaign_id`,
  STRATEGY_STATS_TIER: `${API_PREFIX}/console/lottery-strategy-stats/tier-distribution/:campaign_id`,
  STRATEGY_STATS_EXPERIENCE: `${API_PREFIX}/console/lottery-strategy-stats/experience-triggers/:campaign_id`,
  STRATEGY_STATS_BUDGET: `${API_PREFIX}/console/lottery-strategy-stats/budget-consumption/:campaign_id`,

  // 抽奖配额
  QUOTA_RULE_LIST: `${API_PREFIX}/console/lottery-quota/rules`,
  QUOTA_RULE_DETAIL: `${API_PREFIX}/console/lottery-quota/rules/:id`,
  QUOTA_RULE_CREATE: `${API_PREFIX}/console/lottery-quota/rules`,
  QUOTA_RULE_DISABLE: `${API_PREFIX}/console/lottery-quota/rules/:id/disable`,
  QUOTA_USER_STATUS: `${API_PREFIX}/console/lottery-quota/users/:user_id/status`,
  QUOTA_USER_BONUS: `${API_PREFIX}/console/lottery-quota/users/:user_id/bonus`,
  QUOTA_USER_CHECK: `${API_PREFIX}/console/lottery-quota/users/:user_id/check`,
  QUOTA_STATISTICS: `${API_PREFIX}/console/lottery-quota/statistics`,

  // 概率调整和强制中奖
  PROBABILITY_ADJUST: `${API_PREFIX}/console/lottery-management/probability-adjust`,
  INTERVENTION_FORCE_WIN: `${API_PREFIX}/console/lottery-management/force-win`,

  // 活动定价
  PRICING_CONFIG_ALL: `${API_PREFIX}/console/lottery-management/pricing-configs`,
  PRICING_GET: `${API_PREFIX}/console/lottery-management/campaigns/:code/pricing`,
  PRICING_VERSIONS: `${API_PREFIX}/console/lottery-management/campaigns/:code/pricing/versions`,
  PRICING_CREATE: `${API_PREFIX}/console/lottery-management/campaigns/:code/pricing`,
  PRICING_ACTIVATE: `${API_PREFIX}/console/lottery-management/campaigns/:code/pricing/:version/activate`,
  PRICING_ARCHIVE: `${API_PREFIX}/console/lottery-management/campaigns/:code/pricing/:version/archive`,
  PRICING_ROLLBACK: `${API_PREFIX}/console/lottery-management/campaigns/:code/pricing/rollback`,
  PRICING_SCHEDULE: `${API_PREFIX}/console/lottery-management/campaigns/:code/pricing/:version/schedule`,

  // 抽奖实时监控（2026-01-31 路径更新: lottery-monitoring → lottery-realtime）
  MONITORING_STATS: `${API_PREFIX}/console/lottery-realtime/stats`,

  // 抽奖统计趋势（2026-01-31 路径更新: lottery-monitoring → lottery-statistics）
  MONITORING_HOURLY_LIST: `${API_PREFIX}/console/lottery-statistics/hourly`,
  MONITORING_HOURLY_DETAIL: `${API_PREFIX}/console/lottery-statistics/hourly/:id`,
  MONITORING_HOURLY_SUMMARY: `${API_PREFIX}/console/lottery-statistics/hourly/summary/:campaign_id`,

  // 用户分析（2026-01-31 路径更新: lottery-monitoring → lottery-user-analysis）
  MONITORING_USER_EXPERIENCE_LIST: `${API_PREFIX}/console/lottery-user-analysis/experience-states`,
  MONITORING_USER_EXPERIENCE_DETAIL: `${API_PREFIX}/console/lottery-user-analysis/experience-states/:user_id/:campaign_id`,
  MONITORING_USER_GLOBAL_LIST: `${API_PREFIX}/console/lottery-user-analysis/global-states`,
  MONITORING_USER_GLOBAL_DETAIL: `${API_PREFIX}/console/lottery-user-analysis/global-states/:user_id`,
  MONITORING_QUOTA_GRANT_LIST: `${API_PREFIX}/console/lottery-user-analysis/quota-grants`,
  MONITORING_QUOTA_GRANT_DETAIL: `${API_PREFIX}/console/lottery-user-analysis/quota-grants/:id`,
  MONITORING_USER_QUOTA_LIST: `${API_PREFIX}/console/lottery-user-analysis/quotas`,
  MONITORING_USER_QUOTA_DETAIL: `${API_PREFIX}/console/lottery-user-analysis/quotas/:user_id/:campaign_id`,
  MONITORING_USER_QUOTA_STATS: `${API_PREFIX}/console/lottery-user-analysis/quotas/stats/:campaign_id`,

  // 用户档案/活动分析/报表（2026-01-31 路径更新）
  MONITORING_USER_PROFILE: `${API_PREFIX}/console/lottery-user-analysis/profile/:user_id`,
  MONITORING_CAMPAIGN_ROI: `${API_PREFIX}/console/lottery-campaign-analysis/roi/:campaign_id`,
  ANALYTICS_DAILY_REPORT: `${API_PREFIX}/console/lottery-report/daily`,

  // 实时告警API（2026-01-31 路径更新: lottery-monitoring → lottery-realtime）
  REALTIME_ALERTS: `${API_PREFIX}/console/lottery-realtime/alerts`,
  REALTIME_ALERT_ACKNOWLEDGE: `${API_PREFIX}/console/lottery-realtime/alerts/:id/acknowledge`,
  REALTIME_ALERT_RESOLVE: `${API_PREFIX}/console/lottery-realtime/alerts/:id/resolve`,

  // 单次抽奖详情/异常用户/活动复盘/策略效果（2026-01-31 路径更新: lottery-monitoring → lottery-realtime/lottery-user-analysis）
  DRAW_DETAILS: `${API_PREFIX}/console/lottery-realtime/draw-details/:draw_id`,
  ABNORMAL_USERS: `${API_PREFIX}/console/lottery-user-analysis/abnormal`,
  CAMPAIGN_REPORT: `${API_PREFIX}/console/lottery-report/campaign/:campaign_id`,
  STRATEGY_EFFECTIVENESS: `${API_PREFIX}/console/lottery-campaign-analysis/strategy-effectiveness`,

  // 核销订单
  BUSINESS_RECORD_REDEMPTION_ORDER: `${API_PREFIX}/console/business-records/redemption-orders`,
  BUSINESS_RECORD_REDEMPTION_STATISTICS: `${API_PREFIX}/console/business-records/redemption-orders/statistics`,
  BUSINESS_RECORD_REDEMPTION_DETAIL: `${API_PREFIX}/console/business-records/redemption-orders/:order_id`,
  BUSINESS_RECORD_REDEMPTION_REDEEM: `${API_PREFIX}/console/business-records/redemption-orders/:order_id/redeem`,
  BUSINESS_RECORD_REDEMPTION_CANCEL: `${API_PREFIX}/console/business-records/redemption-orders/:order_id/cancel`,
  BUSINESS_RECORD_BATCH_EXPIRE: `${API_PREFIX}/console/business-records/redemption-orders/batch-expire`,
  BUSINESS_RECORD_EXPORT: `${API_PREFIX}/console/business-records/redemption-orders/export`,

  // 活动预算（后端使用 lottery_campaign_id 作为路由参数）
  CAMPAIGN_BUDGET_BATCH_STATUS: `${API_PREFIX}/console/campaign-budget/batch-status`,
  CAMPAIGN_BUDGET_DETAIL: `${API_PREFIX}/console/campaign-budget/campaigns/:lottery_campaign_id`,
  CAMPAIGN_BUDGET_UPDATE: `${API_PREFIX}/console/campaign-budget/campaigns/:lottery_campaign_id`,
  CAMPAIGN_BUDGET_STATUS: `${API_PREFIX}/console/campaign-budget/campaigns/:lottery_campaign_id/budget-status`,
  CAMPAIGN_BUDGET_POOL_ADD: `${API_PREFIX}/console/campaign-budget/campaigns/:lottery_campaign_id/pool/add`,
  CAMPAIGN_BUDGET_VALIDATE: `${API_PREFIX}/console/campaign-budget/campaigns/:lottery_campaign_id/validate`,
  CAMPAIGN_BUDGET_VALIDATE_LAUNCH: `${API_PREFIX}/console/campaign-budget/campaigns/:lottery_campaign_id/validate-for-launch`,
  CAMPAIGN_BUDGET_USER: `${API_PREFIX}/console/campaign-budget/users/:user_id`,

  // 批量操作API
  BATCH_QUOTA_GRANT: `${API_PREFIX}/console/batch-operations/quota-grant`,
  BATCH_PRESET_RULES: `${API_PREFIX}/console/batch-operations/preset-rules`,
  BATCH_REDEMPTION_VERIFY: `${API_PREFIX}/console/batch-operations/redemption-verify`,
  BATCH_CAMPAIGN_STATUS: `${API_PREFIX}/console/batch-operations/campaign-status`,
  BATCH_BUDGET_ADJUST: `${API_PREFIX}/console/batch-operations/budget-adjust`,
  BATCH_OPERATION_LOGS: `${API_PREFIX}/console/batch-operations/logs`,
  BATCH_OPERATION_LOG_DETAIL: `${API_PREFIX}/console/batch-operations/logs/:id`
}

// ========== API 调用方法 ==========

export const LotteryAdvancedAPI = {
  // ===== 策略配置 =====

  /**
   * 获取策略配置列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 策略列表
   */
  async getStrategyList(params = {}) {
    const url = LOTTERY_ADVANCED_ENDPOINTS.STRATEGY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取策略详情
   * @param {number} id - 策略 ID
   * @returns {Promise<Object>} 策略详情
   */
  async getStrategyDetail(id) {
    const url = buildURL(LOTTERY_ADVANCED_ENDPOINTS.STRATEGY_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建策略配置
   * @param {Object} data - 策略数据
   * @returns {Promise<Object>} 创建结果
   */
  async createStrategy(data) {
    return await request({ url: LOTTERY_ADVANCED_ENDPOINTS.STRATEGY_CREATE, method: 'POST', data })
  },

  /**
   * 更新策略配置
   * @param {number} id - 策略 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateStrategy(id, data) {
    const url = buildURL(LOTTERY_ADVANCED_ENDPOINTS.STRATEGY_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除策略配置
   * @param {number} id - 策略 ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteStrategy(id) {
    const url = buildURL(LOTTERY_ADVANCED_ENDPOINTS.STRATEGY_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 概率调整 =====

  /**
   * 调整中奖概率
   * @param {Object} data - 调整数据
   * @returns {Promise<Object>} 调整结果
   */
  async adjustProbability(data) {
    return await request({
      url: LOTTERY_ADVANCED_ENDPOINTS.PROBABILITY_ADJUST,
      method: 'POST',
      data
    })
  },

  // ===== 抽奖干预 =====

  /**
   * 获取干预列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 干预列表
   */
  async getInterventionList(params = {}) {
    const url = LOTTERY_ADVANCED_ENDPOINTS.INTERVENTION_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 强制中奖
   * @param {Object} data - 干预数据
   * @returns {Promise<Object>} 干预结果
   */
  async forceWin(data) {
    return await request({
      url: LOTTERY_ADVANCED_ENDPOINTS.INTERVENTION_FORCE_WIN,
      method: 'POST',
      data
    })
  },

  /**
   * 取消干预
   * @param {number} id - 干预 ID
   * @returns {Promise<Object>} 取消结果
   */
  async cancelIntervention(id) {
    const url = buildURL(LOTTERY_ADVANCED_ENDPOINTS.INTERVENTION_CANCEL, { id })
    return await request({ url, method: 'POST' })
  }
}

export default LotteryAdvancedAPI
