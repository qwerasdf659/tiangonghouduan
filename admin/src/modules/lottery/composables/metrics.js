/**
 * 抽奖监控模块
 *
 * @file admin/src/modules/lottery/composables/metrics.js
 * @description 抽奖统计指标和用户状态监控
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'

/**
 * 抽奖监控状态
 * @returns {Object} 状态对象
 */
export function useMetricsState() {
  return {
    /** @type {Object} 抽奖指标 */
    lotteryMetrics: { totalDraws: 0, totalWins: 0, winRate: 0, totalUsers: 0 },
    /** @type {Array} 活动指标 */
    campaignMetrics: [],
    /** @type {Array} 小时指标 */
    hourlyMetrics: [],
    /** @type {Array} 用户体验状态 */
    userExperienceStates: [],
    /** @type {Array} 用户全局状态 */
    userGlobalStates: [],
    /** @type {Array} 用户配额 */
    userQuotas: [],
    /** @type {Object} 监控筛选条件 */
    monitoringFilters: { campaignId: '', userId: '', timeRange: '24h' }
  }
}

/**
 * 抽奖监控方法
 * @returns {Object} 方法对象
 */
export function useMetricsMethods() {
  return {
    /**
     * 加载抽奖监控指标
     */
    async loadLotteryMetrics() {
      try {
        const [metricsRes, campaignMetricsRes, hourlyRes, _statsRes] = await Promise.all([
          this.apiGet(
            LOTTERY_ENDPOINTS.MONITORING_HOURLY_LIST,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            LOTTERY_ENDPOINTS.STRATEGY_STATS_OVERVIEW,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            LOTTERY_ENDPOINTS.MONITORING_HOURLY_LIST,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            LOTTERY_ENDPOINTS.STRATEGY_STATS_TIER,
            {},
            { showLoading: false, showError: false }
          )
        ])

        if (metricsRes?.success) {
          const data = metricsRes.data || {}
          this.lotteryMetrics = {
            totalDraws: data.total_draws ?? data.totalDraws ?? 0,
            totalWins: data.total_wins ?? data.totalWins ?? 0,
            winRate: data.win_rate ? (data.win_rate * 100).toFixed(2) : data.winRate || 0,
            totalUsers: data.total_users ?? data.totalUsers ?? 0
          }
        }

        if (campaignMetricsRes?.success) {
          this.campaignMetrics = campaignMetricsRes.data?.metrics || campaignMetricsRes.data || []
        }

        if (hourlyRes?.success) {
          this.hourlyMetrics = hourlyRes.data?.metrics || hourlyRes.data?.list || []
        }
      } catch (error) {
        logger.error('加载抽奖指标失败:', error)
        this.lotteryMetrics = { totalDraws: 0, totalWins: 0, winRate: 0, totalUsers: 0 }
        this.campaignMetrics = []
        this.hourlyMetrics = []
      }
    },

    /**
     * 加载用户体验状态
     */
    async loadUserExperienceStates() {
      try {
        const params = new URLSearchParams()
        if (this.monitoringFilters.userId) {
          params.append('user_id', this.monitoringFilters.userId)
        }
        if (this.monitoringFilters.campaignId) {
          params.append('campaign_id', this.monitoringFilters.campaignId)
        }
        params.append('limit', 50)

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_USER_EXPERIENCE_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.userExperienceStates = response.data?.states || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载用户体验状态失败:', error)
        this.userExperienceStates = []
      }
    },

    /**
     * 加载用户全局状态
     */
    async loadUserGlobalStates() {
      try {
        const params = new URLSearchParams()
        if (this.monitoringFilters.userId) {
          params.append('user_id', this.monitoringFilters.userId)
        }
        params.append('limit', 50)

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_USER_GLOBAL_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.userGlobalStates = response.data?.states || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载用户全局状态失败:', error)
        this.userGlobalStates = []
      }
    },

    /**
     * 加载用户配额信息
     */
    async loadUserQuotaList() {
      try {
        const params = new URLSearchParams()
        if (this.monitoringFilters.userId) {
          params.append('user_id', this.monitoringFilters.userId)
        }
        params.append('limit', 50)

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_USER_QUOTAS_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.userQuotas = response.data?.quotas || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载用户配额失败:', error)
        this.userQuotas = []
      }
    },

    /**
     * 刷新监控数据
     */
    async refreshMonitoringData() {
      await Promise.all([
        this.loadLotteryMetrics(),
        this.loadUserExperienceStates(),
        this.loadUserGlobalStates(),
        this.loadUserQuotaList()
      ])
    },

    /**
     * 搜索用户监控数据
     */
    searchUserMonitoring() {
      this.loadUserExperienceStates()
      this.loadUserGlobalStates()
      this.loadUserQuotaList()
    },

    /**
     * 获取体验阶段文本
     * @param {string} phase - 体验阶段代码
     * @returns {string} 体验阶段文本
     */
    getExperiencePhaseText(phase) {
      const map = {
        newcomer: '新手期',
        growth: '成长期',
        mature: '成熟期',
        decline: '衰退期',
        churn_risk: '流失风险'
      }
      return map[phase] || phase || '-'
    },

    /**
     * 获取体验阶段样式
     * @param {string} phase - 体验阶段代码
     * @returns {string} CSS类名
     */
    getExperiencePhaseClass(phase) {
      const map = {
        newcomer: 'bg-info',
        growth: 'bg-success',
        mature: 'bg-primary',
        decline: 'bg-warning',
        churn_risk: 'bg-danger'
      }
      return map[phase] || 'bg-secondary'
    }
  }
}

export default { useMetricsState, useMetricsMethods }

