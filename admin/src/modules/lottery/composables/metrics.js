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
    /** @type {Object} 抽奖指标 - 适配后端返回字段 */
    lotteryMetrics: { 
      totalDraws: 0,      // 后端: summary.total_draws
      totalWins: 0,       // 后端: summary.total_wins
      winRate: 0,         // 后端: summary.win_rate
      totalValue: 0       // 后端: summary.total_value（奖品价值）
    },
    /** @type {Array} 奖品分布 - 后端: prize_distribution */
    prizeDistribution: [],
    /** @type {Array} 最近抽奖记录 - 后端: recent_draws */
    recentDraws: [],
    /** @type {Array} 奖品统计 - 后端: prize_stats */
    prizeStats: [],
    /** @type {Array} 小时指标 - 后端: trend */
    hourlyMetrics: [],
    /** @type {Array} 用户体验状态 */
    userExperienceStates: [],
    /** @type {Array} 用户全局状态 */
    userGlobalStates: [],
    /** @type {Array} 用户配额 */
    userQuotas: [],
    /** @type {Object} 监控筛选条件 */
    monitoringFilters: { campaignId: '', userId: '', timeRange: 'month' },
    /** @type {boolean} 是否正在刷新指标数据 */
    refreshingMetrics: false
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
     * 使用后端综合统计接口 /stats 获取完整指标
     * 后端返回结构: { summary, trend, prize_distribution, recent_draws, prize_stats }
     */
    async loadLotteryMetrics() {
      console.log('📊 [Metrics] loadLotteryMetrics 开始执行...')
      try {
        // 调用综合统计接口，获取完整的监控数据
        // 使用 time_range: 'month' 统计最近30天数据
        const timeRange = this.monitoringFilters?.timeRange || 'month'
        console.log('📊 [Metrics] 调用API:', LOTTERY_ENDPOINTS.MONITORING_STATS, '时间范围:', timeRange)
        const statsRes = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_STATS}?time_range=${timeRange}`,
          {},
          { showLoading: false, showError: false }
        )
        console.log('📊 [Metrics] API响应:', statsRes)

        if (statsRes?.success) {
          const data = statsRes.data || {}
          console.log('📊 [Metrics] 解析数据:', {
            summary: data.summary,
            prizeDistributionLength: (data.prize_distribution || []).length,
            recentDrawsLength: (data.recent_draws || []).length
          })
          
          // 从 summary 字段提取汇总统计（适配后端实际返回字段）
          const summary = data.summary || {}
          this.lotteryMetrics = {
            totalDraws: summary.total_draws ?? 0,
            totalWins: summary.total_wins ?? 0,
            winRate: summary.win_rate ?? 0,
            totalValue: summary.total_value ?? 0  // 后端返回的是奖品总价值，非用户数
          }
          // 从 trend 字段提取小时趋势数据
          this.hourlyMetrics = data.trend || []
          // prize_distribution 按奖品类型分布
          this.prizeDistribution = data.prize_distribution || []
          // recent_draws 最近抽奖记录
          this.recentDraws = data.recent_draws || []
          // prize_stats 奖品统计
          this.prizeStats = data.prize_stats || []
          
          console.log('📊 [Metrics] 状态已更新:', {
            lotteryMetrics: this.lotteryMetrics,
            prizeDistribution: this.prizeDistribution,
            recentDraws: this.recentDraws.length
          })
          logger.info('抽奖指标加载成功:', {
            totalDraws: this.lotteryMetrics.totalDraws,
            prizeDistributionCount: this.prizeDistribution.length
          })
        } else {
          console.warn('📊 [Metrics] API返回失败:', statsRes?.message)
          logger.warn('加载抽奖指标接口返回失败:', statsRes?.message)
          this._resetMetricsState()
        }
      } catch (error) {
        console.error('📊 [Metrics] 加载失败:', error)
        logger.error('加载抽奖指标失败:', error)
        this._resetMetricsState()
      }
    },
    
    /**
     * 重置指标状态
     * @private
     */
    _resetMetricsState() {
      this.lotteryMetrics = { totalDraws: 0, totalWins: 0, winRate: 0, totalValue: 0 }
      this.prizeDistribution = []
      this.recentDraws = []
      this.prizeStats = []
      this.hourlyMetrics = []
    },

    /**
     * 刷新指标数据（带视觉反馈）
     */
    async refreshMetricsWithFeedback() {
      this.refreshingMetrics = true
      try {
        await this.loadLotteryMetrics()
        // 使用 Alpine.store 显示成功通知
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').success(`指标数据已刷新，共 ${this.lotteryMetrics.totalDraws} 次抽奖`)
        }
        console.log('✅ 指标数据已刷新')
      } catch (error) {
        // 使用 Alpine.store 显示错误通知
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').error('刷新失败: ' + error.message)
        }
        console.error('❌ 刷新失败:', error)
      } finally {
        this.refreshingMetrics = false
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

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_USER_EXPERIENCE_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        if (data) {
          this.userExperienceStates = data.states || data.list || []
        }
      } catch (error) {
        logger.error('加载用户体验状态失败:', error)
        this.userExperienceStates = []
      }
    },

    /**
     * 加载用户全局状态
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadUserGlobalStates() {
      try {
        const params = new URLSearchParams()
        if (this.monitoringFilters.userId) {
          params.append('user_id', this.monitoringFilters.userId)
        }
        params.append('limit', 50)

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_USER_GLOBAL_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        if (data) {
          this.userGlobalStates = data.states || data.list || []
        }
      } catch (error) {
        logger.error('加载用户全局状态失败:', error)
        this.userGlobalStates = []
      }
    },

    /**
     * 加载用户配额信息
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadUserQuotaList() {
      try {
        const params = new URLSearchParams()
        if (this.monitoringFilters.userId) {
          params.append('user_id', this.monitoringFilters.userId)
        }
        params.append('limit', 50)

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_USER_QUOTAS_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        if (data) {
          this.userQuotas = data.quotas || data.list || []
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

