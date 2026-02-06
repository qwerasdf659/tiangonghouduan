/**
 * 抽奖监控模块
 *
 * @file admin/src/modules/lottery/composables/metrics.js
 * @description 抽奖统计指标和用户状态监控
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { API_PREFIX } from '../../../api/base.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'

/**
 * 抽奖监控状态
 * @returns {Object} 状态对象
 */
export function useMetricsState() {
  return {
    /** @type {Object} 抽奖指标 - 直接使用后端字段名 */
    lotteryMetrics: {
      total_draws: 0,
      total_wins: 0,
      win_rate: 0,
      total_value: 0
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
    monitoringFilters: { campaign_id: '', user_id: '', time_range: 'month' },
    /** @type {boolean} 是否正在刷新指标数据 */
    refreshingMetrics: false,

    // ========== Phase 2: 监控页图表增强 ==========
    /** @type {Array} 24小时趋势数据 - 用于折线图 */
    hourlyTrend24h: [],
    /** @type {Array} 档位分布数据 - 用于饼图 */
    tierDistribution: [],
    /** @type {Array} 活跃告警列表 */
    activeAlerts: [],
    /** @type {Object} 预算进度数据 */
    budgetProgress: {
      total: 0,
      used: 0,
      remaining: 0,
      percentage: 0
    },
    /** @type {boolean} 图表加载状态 */
    chartLoading: false,
    /** @type {Object} ECharts 实例引用 */
    monitoringCharts: {
      trendChart: null,
      tierChart: null
    },

    // ========== P2新增: 运营日报状态 ==========
    /** @type {Object|null} 当前日报数据 */
    dailyReportData: null,
    /** @type {string} 日报日期（YYYY-MM-DD） */
    dailyReportDate: '',
    /** @type {boolean} 日报加载状态 */
    loadingDailyReport: false,
    /** @type {boolean} 显示日报模态框 */
    showDailyReportModal: false,

    // ========== P1新增: 单次抽奖详情状态 ==========
    /** @type {Object|null} 当前抽奖详情数据 */
    drawDetails: null,
    /** @type {boolean} 抽奖详情加载状态 */
    loadingDrawDetails: false,
    /** @type {boolean} 显示抽奖详情弹窗 */
    showDrawDetailsModal: false,
    /** @type {string} 当前查看的抽奖ID */
    currentDrawId: '',

    // ========== P3-4: 抽奖时段热力图 ==========
    /** @type {Array} 抽奖时段热力图数据 (7天 x 24小时矩阵) */
    lotteryHeatmap: [],
    /** @type {Array} 热力图天标签 */
    heatmapDayLabels: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    /** @type {Array} 热力图小时标签 */
    heatmapHourLabels: [],
    /** @type {Object|null} 热力图峰值信息 */
    heatmapPeak: null,
    /** @type {boolean} 热力图加载状态 */
    loadingHeatmap: false,
    /** @type {Object|null} ECharts热力图实例 */
    lotteryHeatmapChart: null
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
     * 并行调用多个后端 API 获取完整指标数据：
     * - /console/lottery-realtime/stats → total_draws, unique_users, win_rate, empty_rate
     * - /console/lottery/stats → total_draws, total_wins, win_rate, total_prize_value
     * - /console/lottery/trend → 趋势数据
     * - /console/lottery/prize-distribution → 奖品分布数据
     */
    async loadLotteryMetrics() {
      logger.debug('📊 [Metrics] loadLotteryMetrics 开始执行...')
      try {
        const timeRange = this.monitoringFilters?.time_range || 'month'
        // 将 time_range 转换为 range 参数格式
        const rangeMap = { today: '1d', yesterday: '1d', week: '7d', month: '30d' }
        const range = rangeMap[timeRange] || '30d'

        logger.debug('📊 [Metrics] 并行调用多个API, 时间范围:', timeRange)

        // 并行调用后端 API
        const [realtimeRes, statsRes, trendRes, distributionRes] = await Promise.allSettled([
          this.apiGet(
            `${LOTTERY_ENDPOINTS.MONITORING_STATS}?time_range=${timeRange}`,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            `${API_PREFIX}/console/lottery/stats?range=${range}`,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            `${API_PREFIX}/console/lottery/trend?range=${range}`,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            `${API_PREFIX}/console/lottery/prize-distribution?range=${range}`,
            {},
            { showLoading: false, showError: false }
          )
        ])

        // 1. 解析 lottery/stats → 核心指标卡片（total_draws, total_wins, win_rate, total_prize_value）
        if (statsRes.status === 'fulfilled' && statsRes.value?.success) {
          const data = statsRes.value.data || {}
          this.lotteryMetrics = {
            total_draws: data.total_draws ?? 0,
            total_wins: data.total_wins ?? 0,
            win_rate: data.win_rate ?? 0,
            total_value: data.total_prize_value ?? 0
          }
          logger.info('📊 [Metrics] lottery/stats 成功:', this.lotteryMetrics)
        } else if (realtimeRes.status === 'fulfilled' && realtimeRes.value?.success) {
          // 降级：从 realtime/stats 取部分数据（缺少 total_wins 和 total_value）
          const data = realtimeRes.value.data || {}
          this.lotteryMetrics = {
            total_draws: data.total_draws ?? 0,
            total_wins: 0,
            win_rate: data.win_rate ?? 0,
            total_value: 0
          }
          logger.warn('📊 [Metrics] 降级使用 realtime/stats:', this.lotteryMetrics)
        } else {
          logger.error('📊 [Metrics] 所有统计API失败')
          this._resetMetricsState()
        }

        // 2. 解析 lottery/trend → 小时趋势数据
        if (trendRes.status === 'fulfilled' && trendRes.value?.success) {
          this.hourlyMetrics = trendRes.value.data?.trend || []
          logger.info('📊 [Metrics] trend 成功:', this.hourlyMetrics.length, '条')
        } else {
          this.hourlyMetrics = []
          logger.warn('📊 [Metrics] trend API 失败')
        }

        // 3. 解析 lottery/prize-distribution → 奖品分布
        if (distributionRes.status === 'fulfilled' && distributionRes.value?.success) {
          const rawDist = distributionRes.value.data?.distribution || []
          // 转换为前端格式: { name, value }
          this.prizeDistribution = rawDist.map(item => ({
            name: item.tier_name || item.tier || 'unknown',
            value: item.count || 0
          }))
          logger.info('📊 [Metrics] prize-distribution 成功:', this.prizeDistribution.length, '条')
        } else {
          this.prizeDistribution = []
          logger.warn('📊 [Metrics] prize-distribution API 失败')
        }

        // 其他保持空
        this.recentDraws = []
        this.prizeStats = []

        logger.info('📊 [Metrics] 全部指标加载完成:', {
          total_draws: this.lotteryMetrics.total_draws,
          total_wins: this.lotteryMetrics.total_wins,
          win_rate: this.lotteryMetrics.win_rate,
          trendCount: this.hourlyMetrics.length,
          distributionCount: this.prizeDistribution.length
        })
      } catch (error) {
        logger.error('📊 [Metrics] 加载失败:', error)
        this._resetMetricsState()
      }
    },

    /**
     * 重置指标状态
     * @private
     */
    _resetMetricsState() {
      this.lotteryMetrics = { total_draws: 0, total_wins: 0, win_rate: 0, total_value: 0 }
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
          Alpine.store('notification').success(
            `指标数据已刷新，共 ${this.lotteryMetrics.total_draws} 次抽奖`
          )
        }
        logger.debug('✅ 指标数据已刷新')
      } catch (error) {
        // 使用 Alpine.store 显示错误通知
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').error('刷新失败: ' + error.message)
        }
        logger.error('❌ 刷新失败:', error)
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
        if (this.monitoringFilters.user_id) {
          params.append('user_id', this.monitoringFilters.user_id)
        }
        if (this.monitoringFilters.campaign_id) {
          params.append('campaign_id', this.monitoringFilters.campaign_id)
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
        if (this.monitoringFilters.user_id) {
          params.append('user_id', this.monitoringFilters.user_id)
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
        if (this.monitoringFilters.user_id) {
          params.append('user_id', this.monitoringFilters.user_id)
        }
        params.append('limit', 50)

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_USER_QUOTA_LIST}?${params}`,
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
    // ✅ 已删除 getExperiencePhaseText 映射函数 - 改用后端 _display 字段（P2 中文化）

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
    },

    // ========== Phase 2: 监控页图表增强方法 ==========

    /**
     * 加载趋势数据
     * 后端 /console/lottery/trend 返回格式:
     *   { date, draws, wins, win_rate }
     * 转换为图表需要的格式: { hour, draws, wins, users }
     * 注意: 不修改 chartLoading，由调用方 loadEnhancedMetrics 统一管理
     */
    async load24hTrend() {
      try {
        const trend = this.hourlyMetrics || []
        // 后端趋势数据按日期排序
        this.hourlyTrend24h = trend
          .sort((a, b) => new Date(a.date || a.hour || a.hour_start) - new Date(b.date || b.hour || b.hour_start))
          .slice(-24)
          .map(item => ({
            // 后端 trend API 使用 date 字段, 统计 API 使用 hour 字段
            hour: item.date || item.hour || item.hour_start,
            draws: item.draws || item.total_draws || 0,
            wins: item.wins || item.total_wins || 0,
            users: item.unique_users || item.users || 0
          }))
        logger.info('趋势数据加载完成', { count: this.hourlyTrend24h.length })
      } catch (error) {
        logger.error('加载趋势失败:', error)
        this.hourlyTrend24h = []
      }
    },

    /**
     * 计算档位分布数据
     * 从 prizeDistribution 或 prizeStats 中提取
     */
    calculateTierDistribution() {
      // 优先使用 prizeDistribution，否则从 prizeStats 计算
      if (this.prizeDistribution && this.prizeDistribution.length > 0) {
        this.tierDistribution = this.prizeDistribution.map(item => ({
          name: item.name || item.tier || 'unknown',
          value: item.value || item.count || 0
        }))
      } else if (this.prizeStats && this.prizeStats.length > 0) {
        // 按奖品类型聚合
        const tierMap = {}
        this.prizeStats.forEach(prize => {
          const tier = prize.prize_tier || prize.tier || 'other'
          tierMap[tier] = (tierMap[tier] || 0) + (prize.won_count || 0)
        })
        this.tierDistribution = Object.entries(tierMap).map(([name, value]) => ({
          name: this.getTierDisplayName(name),
          value
        }))
      } else {
        // 使用默认数据结构
        this.tierDistribution = [
          { name: '高档奖品', value: 0 },
          { name: '中档奖品', value: 0 },
          { name: '低档奖品', value: 0 },
          { name: '未中奖', value: 0 }
        ]
      }
      logger.info('档位分布计算完成', { tiers: this.tierDistribution.length })
    },

    /**
     * 获取档位显示名称
     * @param {string} tier - 档位代码
     * @returns {string} 显示名称
     */
    getTierDisplayName(tier) {
      const map = {
        high: '高档奖品',
        mid: '中档奖品',
        low: '低档奖品',
        fallback: '保底奖品',
        empty: '未中奖',
        other: '其他'
      }
      return map[tier] || tier
    },

    /**
     * 加载活跃告警
     * 基于监控数据生成告警信息
     */
    async loadActiveAlerts() {
      try {
        const alerts = []
        const now = new Date()

        // 基于现有数据生成告警
        // 1. 检查中奖率是否异常
        if (this.lotteryMetrics.win_rate > 50) {
          alerts.push({
            level: 'warning',
            time: now.toISOString(),
            message: `中奖率偏高：当前 ${this.lotteryMetrics.win_rate}%，建议检查概率配置`
          })
        }

        // 2. 检查是否有大量未中奖
        const emptyCount =
          this.prizeDistribution.find(
            p => p.name === 'empty' || p.name === '未中奖' || p.name === '谢谢参与'
          )?.value || 0
        const emptyRate =
          this.lotteryMetrics.total_draws > 0
            ? (emptyCount / this.lotteryMetrics.total_draws) * 100
            : 0
        if (emptyRate > 70) {
          alerts.push({
            level: 'info',
            time: now.toISOString(),
            message: `空奖率较高：${emptyRate.toFixed(1)}%，用户体验可能受影响`
          })
        }

        // 3. 检查预算使用情况
        if (this.budgetProgress.percentage > 80) {
          alerts.push({
            level: 'warning',
            time: now.toISOString(),
            message: `预算消耗预警：已使用 ${this.budgetProgress.percentage}%`
          })
        }
        if (this.budgetProgress.percentage > 95) {
          alerts.push({
            level: 'error',
            time: now.toISOString(),
            message: `预算即将耗尽：已使用 ${this.budgetProgress.percentage}%，请及时补充`
          })
        }

        // 4. 系统正常运行提示
        if (alerts.length === 0) {
          alerts.push({
            level: 'success',
            time: now.toISOString(),
            message: '系统运行正常，各项指标在预期范围内'
          })
        }

        this.activeAlerts = alerts.slice(0, 5) // 最多显示5条告警
        logger.info('活跃告警加载完成', { count: this.activeAlerts.length })
      } catch (error) {
        logger.error('加载活跃告警失败:', error)
        this.activeAlerts = []
      }
    },

    /**
     * 初始化监控图表
     * 需要在 DOM 就绪后调用
     */
    async initMonitoringCharts() {
      // 延迟执行确保 DOM 已渲染
      ;(await this.$nextTick?.()) || (await new Promise(resolve => setTimeout(resolve, 100)))

      try {
        // 使用懒加载方式加载 ECharts
        const echarts = await loadECharts()
        if (!echarts) {
          logger.warn('ECharts 加载失败，无法初始化图表')
          return
        }

        // 初始化趋势图
        const trendContainer = document.getElementById('trend-chart-24h')
        if (trendContainer) {
          if (this.monitoringCharts.trendChart) {
            this.monitoringCharts.trendChart.dispose()
          }
          this.monitoringCharts.trendChart = echarts.init(trendContainer)
          this.updateTrendChart()
        }

        // 初始化档位饼图
        const tierContainer = document.getElementById('tier-distribution-chart')
        if (tierContainer) {
          if (this.monitoringCharts.tierChart) {
            this.monitoringCharts.tierChart.dispose()
          }
          this.monitoringCharts.tierChart = echarts.init(tierContainer)
          this.updateTierChart()
        }

        // 窗口大小变化时重绘图表
        window.addEventListener('resize', () => {
          this.monitoringCharts.trendChart?.resize()
          this.monitoringCharts.tierChart?.resize()
        })

        logger.info('监控图表初始化完成')
      } catch (error) {
        logger.error('初始化监控图表失败:', error)
      }
    },

    /**
     * 更新24小时趋势折线图
     * P1-11: 增加中奖率趋势线（使用右侧Y轴百分比）
     */
    updateTrendChart() {
      if (!this.monitoringCharts.trendChart) return

      const hours = this.hourlyTrend24h.map(item => {
        const dateStr = item.hour || ''
        // 如果是日期格式 (YYYY-MM-DD), 显示 MM-DD
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return dateStr.substring(5) // "01-30"
        }
        // 如果是时间格式, 显示小时
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
          return date.getHours() + ':00'
        }
        return dateStr
      })
      const draws = this.hourlyTrend24h.map(item => item.draws)
      const wins = this.hourlyTrend24h.map(item => item.wins)
      // P1-11: 计算每小时中奖率
      const winRates = this.hourlyTrend24h.map(item => {
        if (!item.draws || item.draws === 0) return 0
        return parseFloat(((item.wins / item.draws) * 100).toFixed(2))
      })

      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: params => {
            let result = `<strong>${params[0].axisValue}</strong><br/>`
            params.forEach(p => {
              const unit = p.seriesName === '中奖率' ? '%' : '次'
              result += `${p.marker} ${p.seriesName}: ${p.value}${unit}<br/>`
            })
            return result
          }
        },
        legend: {
          data: ['抽奖次数', '中奖次数', '中奖率'],
          bottom: 0
        },
        grid: {
          left: '3%',
          right: '8%',
          bottom: '15%',
          top: '10%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: hours,
          axisLabel: {
            rotate: 45,
            fontSize: 10
          }
        },
        yAxis: [
          {
            type: 'value',
            name: '次数',
            position: 'left',
            splitLine: {
              lineStyle: { type: 'dashed' }
            }
          },
          {
            // P1-11: 右侧Y轴显示中奖率百分比
            type: 'value',
            name: '中奖率(%)',
            position: 'right',
            min: 0,
            max: 100,
            axisLabel: {
              formatter: '{value}%'
            },
            splitLine: { show: false }
          }
        ],
        series: [
          {
            name: '抽奖次数',
            type: 'line',
            smooth: true,
            yAxisIndex: 0,
            data: draws,
            itemStyle: { color: '#3B82F6' },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                  { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
                ]
              }
            }
          },
          {
            name: '中奖次数',
            type: 'line',
            smooth: true,
            yAxisIndex: 0,
            data: wins,
            itemStyle: { color: '#10B981' },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
                  { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
                ]
              }
            }
          },
          {
            // P1-11: 中奖率趋势线
            name: '中奖率',
            type: 'line',
            smooth: true,
            yAxisIndex: 1,
            data: winRates,
            itemStyle: { color: '#F59E0B' },
            lineStyle: {
              width: 2,
              type: 'dashed'
            },
            symbol: 'circle',
            symbolSize: 6
          }
        ]
      }

      this.monitoringCharts.trendChart.setOption(option)
      logger.info('趋势图表已更新（含中奖率）')
    },

    /**
     * 更新档位分布饼图
     */
    updateTierChart() {
      if (!this.monitoringCharts.tierChart) return

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          right: '5%',
          top: 'center',
          itemWidth: 10,
          itemHeight: 10
        },
        series: [
          {
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['35%', '50%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 4,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: false,
              position: 'center'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 16,
                fontWeight: 'bold'
              }
            },
            labelLine: { show: false },
            data: this.tierDistribution.map((item, index) => ({
              ...item,
              itemStyle: {
                color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 5]
              }
            }))
          }
        ]
      }

      this.monitoringCharts.tierChart.setOption(option)
      logger.info('档位饼图已更新')
    },

    /**
     * 加载增强监控数据（包含图表数据）
     */
    async loadEnhancedMetrics() {
      this.chartLoading = true
      this.refreshingMetrics = true
      try {
        // 先加载基础指标（并行调用多个后端API）
        await this.loadLotteryMetrics()

        // 然后处理图表数据
        await this.load24hTrend()
        this.calculateTierDistribution()
        await this.loadActiveAlerts()

        // 更新图表
        this.updateTrendChart()
        this.updateTierChart()

        logger.info('增强监控数据加载完成', {
          total_draws: this.lotteryMetrics.total_draws,
          trend_count: this.hourlyTrend24h.length,
          tier_count: this.tierDistribution.length
        })

        // 显示刷新成功通知
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').success(
            `数据已刷新：${this.lotteryMetrics.total_draws} 次抽奖，中奖率 ${this.lotteryMetrics.win_rate}%`
          )
        }
      } catch (error) {
        logger.error('加载增强监控数据失败:', error)
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').error('刷新失败: ' + (error.message || '未知错误'))
        }
      } finally {
        this.chartLoading = false
        this.refreshingMetrics = false
      }
    },

    /**
     * 获取告警级别样式
     * @param {string} level - 告警级别
     * @returns {string} CSS 类名
     */
    getAlertLevelClass(level) {
      const map = {
        error: 'bg-red-100 border-red-500 text-red-700',
        warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
        info: 'bg-blue-100 border-blue-500 text-blue-700',
        success: 'bg-green-100 border-green-500 text-green-700'
      }
      return map[level] || map.info
    },

    /**
     * 获取告警级别图标
     * @param {string} level - 告警级别
     * @returns {string} 图标
     */
    getAlertLevelIcon(level) {
      const map = {
        error: '🔴',
        warning: '🟡',
        info: '🔵',
        success: '🟢'
      }
      return map[level] || '🔵'
    },

    // ========== P2新增: 运营日报方法 ==========

    /**
     * 加载运营日报
     * @param {string} date - 日期 (YYYY-MM-DD，默认昨天)
     */
    async loadDailyReport(date = null) {
      try {
        this.loadingDailyReport = true

        // 默认昨天
        if (!date) {
          const yesterday = new Date()
          yesterday.setDate(yesterday.getDate() - 1)
          date = yesterday.toISOString().split('T')[0]
        }

        this.dailyReportDate = date
        logger.info('[Metrics] 加载运营日报', { date })

        const params = new URLSearchParams({ report_date: date })

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.ANALYTICS_DAILY_REPORT}?${params}`,
          {},
          { showLoading: false }
        )

        const data = response?.success ? response.data : response

        if (data) {
          this.dailyReportData = data
          logger.info('[Metrics] 日报加载成功', {
            date: data.report_date,
            total_draws: data.summary?.total_draws
          })
        }
      } catch (error) {
        logger.error('[Metrics] 加载日报失败:', error)
        this.showError('加载日报失败: ' + (error.message || '未知错误'))
      } finally {
        this.loadingDailyReport = false
      }
    },

    /**
     * 打开日报模态框
     * @param {string} date - 日期
     */
    async openDailyReportModal(date = null) {
      await this.loadDailyReport(date)
      this.showDailyReportModal = true
    },

    /**
     * 关闭日报模态框
     */
    closeDailyReportModal() {
      this.showDailyReportModal = false
    },

    /**
     * 切换日报日期（前一天/后一天）
     * @param {number} offset - 偏移天数 (-1 表示前一天, 1 表示后一天)
     */
    async changeDailyReportDate(offset) {
      if (!this.dailyReportDate) return

      const currentDate = new Date(this.dailyReportDate)
      currentDate.setDate(currentDate.getDate() + offset)

      // 不允许查看未来日期
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (currentDate >= today) {
        this.showError('不能查看今天或未来的日报')
        return
      }

      const newDate = currentDate.toISOString().split('T')[0]
      await this.loadDailyReport(newDate)
    },

    /**
     * 格式化日报变化率（显示正负号和颜色）
     * @param {number} value - 变化百分比
     * @returns {string} 格式化后的字符串
     */
    formatReportChange(value) {
      if (value === null || value === undefined) return '-'
      const sign = value >= 0 ? '+' : ''
      return `${sign}${value.toFixed(1)}%`
    },

    /**
     * 获取变化率颜色类
     * @param {number} value - 变化百分比
     * @param {boolean} inverse - 是否反转（成本等指标上涨为负面）
     * @returns {string} CSS 类名
     */
    getChangeColorClass(value, inverse = false) {
      if (value === null || value === undefined) return 'text-gray-500'
      const positive = inverse ? value < 0 : value > 0
      const negative = inverse ? value > 0 : value < 0
      if (positive) return 'text-green-600'
      if (negative) return 'text-red-600'
      return 'text-gray-500'
    },

    // ========== P1新增: 单次抽奖详情方法 ==========

    /**
     * 打开抽奖详情弹窗
     * @param {string} drawId - 抽奖记录ID
     */
    async openDrawDetailsModal(drawId) {
      if (!drawId) {
        logger.warn('[Metrics] 无效的抽奖ID')
        return
      }

      this.currentDrawId = drawId
      this.showDrawDetailsModal = true
      await this.loadDrawDetails(drawId)
    },

    /**
     * 加载单次抽奖详情
     * @param {string} drawId - 抽奖记录ID
     */
    async loadDrawDetails(drawId) {
      logger.info('[Metrics] 加载抽奖详情', { draw_id: drawId })
      this.loadingDrawDetails = true
      this.drawDetails = null

      try {
        const url = LOTTERY_ENDPOINTS.DRAW_DETAILS.replace(':draw_id', drawId)
        const response = await this.apiGet(url, {}, { showLoading: false, showError: true })

        if (response?.success) {
          this.drawDetails = response.data
          logger.info('[Metrics] 抽奖详情加载成功', {
            draw_id: drawId,
            pipeline_stages: this.drawDetails?.pipeline_execution?.length || 0
          })
        } else {
          logger.warn('[Metrics] 抽奖详情加载失败:', response?.message)
          this.drawDetails = null
        }
      } catch (error) {
        logger.error('[Metrics] 加载抽奖详情失败:', error)
        this.drawDetails = null
      } finally {
        this.loadingDrawDetails = false
      }
    },

    /**
     * 关闭抽奖详情弹窗
     */
    closeDrawDetailsModal() {
      this.showDrawDetailsModal = false
      this.drawDetails = null
      this.currentDrawId = ''
    },

    /**
     * 获取Pipeline阶段状态样式
     * @param {string} status - 阶段状态（completed/skipped/failed）
     * @returns {string} CSS 类名
     */
    getPipelineStageStyle(status) {
      const styles = {
        completed: 'bg-green-100 border-green-500 text-green-700',
        skipped: 'bg-gray-100 border-gray-500 text-gray-500',
        failed: 'bg-red-100 border-red-500 text-red-700',
        running: 'bg-blue-100 border-blue-500 text-blue-700'
      }
      return styles[status] || styles.completed
    },

    /**
     * 获取Pipeline阶段图标
     * @param {string} status - 阶段状态
     * @returns {string} 图标
     */
    getPipelineStageIcon(status) {
      const icons = {
        completed: '✅',
        skipped: '⏭️',
        failed: '❌',
        running: '🔄'
      }
      return icons[status] || '❓'
    },

    /**
     * 格式化Pipeline阶段名称
     * @param {string} stage - 阶段标识
     * @returns {string} 中文名称
     */
    formatPipelineStageName(stage) {
      const stageNames = {
        init: '初始化',
        validation: '参数校验',
        quota_check: '配额检查',
        budget_check: '预算检查',
        strategy_load: '策略加载',
        random_generate: '随机数生成',
        tier_select: '档位选择',
        prize_pick: '奖品抽取',
        pity_check: 'Pity保底检查',
        state_update: '状态更新',
        result_save: '结果保存'
      }
      return stageNames[stage] || stage
    },

    /**
     * 格式化毫秒时间
     * @param {number} ms - 毫秒数
     * @returns {string} 格式化后的字符串
     */
    formatDuration(ms) {
      if (ms === null || ms === undefined) return '-'
      if (ms < 1) return '<1ms'
      if (ms < 1000) return `${ms}ms`
      return `${(ms / 1000).toFixed(2)}s`
    },

    /**
     * 格式化北京时间
     * @param {string} isoString - ISO时间字符串
     * @returns {string} 格式化后的时间
     */
    formatBeijingTime(isoString) {
      if (!isoString) return '-'
      try {
        const date = new Date(isoString)
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      } catch {
        return isoString
      }
    },

    // ========== P3-4: 抽奖时段热力图方法 ==========

    /**
     * 加载抽奖时段热力图数据
     * 使用用户活跃热力图API（基于LotteryDraw统计）
     * @param {number} [days=7] - 统计天数
     */
    async loadLotteryHeatmap(days = 7) {
      logger.info('[Metrics] 加载抽奖时段热力图', { days })
      this.loadingHeatmap = true

      try {
        // 调用 activity-heatmap API（该API基于LotteryDraw统计）
        const response = await this.apiGet(
          `${API_PREFIX}/console/users/activity-heatmap?days=${days}`,
          {},
          { showLoading: false }
        )

        if (response?.success && response.data) {
          const data = response.data
          this.lotteryHeatmap = data.heatmap || []
          this.heatmapDayLabels = data.day_labels || ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
          this.heatmapHourLabels = data.hour_labels || Array.from({ length: 24 }, (_, i) => `${i}:00`)
          this.heatmapPeak = data.peak || null

          logger.info('[Metrics] 热力图数据加载成功', {
            days,
            peak: this.heatmapPeak,
            total_draws: data.statistics?.total_draws || 0
          })

          // 渲染热力图
          await this.renderLotteryHeatmap()
        } else {
          logger.warn('[Metrics] 热力图数据为空或失败')
          this.lotteryHeatmap = []
        }
      } catch (error) {
        logger.error('[Metrics] 加载抽奖时段热力图失败:', error)
        this.lotteryHeatmap = []
      } finally {
        this.loadingHeatmap = false
      }
    },

    /**
     * 渲染抽奖时段热力图
     * 使用ECharts绘制7天×24小时的热力图
     */
    async renderLotteryHeatmap() {
      const container = document.getElementById('lottery-heatmap-chart')
      if (!container) {
        logger.warn('[Metrics] 热力图容器未找到: lottery-heatmap-chart')
        return
      }

      if (!this.lotteryHeatmap?.length) {
        logger.warn('[Metrics] 热力图数据为空，跳过渲染')
        return
      }

      try {
        const echarts = await loadECharts()

        // 销毁旧实例
        if (this.lotteryHeatmapChart) {
          this.lotteryHeatmapChart.dispose()
        }

        this.lotteryHeatmapChart = echarts.init(container)

        // 格式化热力图数据: [hourIndex, dayIndex, value]
        const heatmapData = []
        this.lotteryHeatmap.forEach((dayData, dayIndex) => {
          if (Array.isArray(dayData)) {
            dayData.forEach((value, hourIndex) => {
              heatmapData.push([hourIndex, dayIndex, value || 0])
            })
          }
        })

        // 计算最大值用于颜色映射
        const maxValue = Math.max(...heatmapData.map(d => d[2]), 1)

        const option = {
          tooltip: {
            position: 'top',
            formatter: (params) => {
              const dayName = this.heatmapDayLabels[params.data[1]] || ''
              const hour = params.data[0]
              const value = params.data[2]
              return `${dayName} ${hour}:00-${hour + 1}:00<br/>抽奖次数: <strong>${value}</strong>`
            }
          },
          grid: {
            left: '60',
            right: '40',
            top: '30',
            bottom: '50',
            containLabel: false
          },
          xAxis: {
            type: 'category',
            data: Array.from({ length: 24 }, (_, i) => i),
            splitArea: { show: true },
            axisLabel: {
              formatter: (val) => `${val}时`
            }
          },
          yAxis: {
            type: 'category',
            data: this.heatmapDayLabels,
            splitArea: { show: true }
          },
          visualMap: {
            min: 0,
            max: maxValue,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '0',
            inRange: {
              color: ['#f0f9ff', '#bae6fd', '#38bdf8', '#0284c7', '#0c4a6e']
            }
          },
          series: [
            {
              name: '抽奖次数',
              type: 'heatmap',
              data: heatmapData,
              label: { show: false },
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
              }
            }
          ]
        }

        this.lotteryHeatmapChart.setOption(option)
        logger.info('[Metrics] 抽奖时段热力图渲染完成')

        // 响应式调整
        window.addEventListener('resize', () => {
          this.lotteryHeatmapChart?.resize()
        })
      } catch (error) {
        logger.error('[Metrics] 渲染抽奖时段热力图失败:', error)
      }
    },

    /**
     * 获取热力图单元格颜色
     * @param {number} value - 抽奖次数
     * @param {number} maxValue - 最大值
     * @returns {string} CSS背景色类
     */
    getHeatmapCellColor(value, maxValue) {
      if (!value || value === 0) return 'bg-gray-100'
      const ratio = value / maxValue
      if (ratio >= 0.8) return 'bg-blue-900 text-white'
      if (ratio >= 0.6) return 'bg-blue-700 text-white'
      if (ratio >= 0.4) return 'bg-blue-500 text-white'
      if (ratio >= 0.2) return 'bg-blue-300'
      return 'bg-blue-100'
    }
  }
}

export default { useMetricsState, useMetricsMethods }
