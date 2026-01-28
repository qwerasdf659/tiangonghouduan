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
import { loadECharts } from '../../../utils/echarts-lazy.js'

/**
 * 抽奖监控状态
 * @returns {Object} 状态对象
 */
export function useMetricsState() {
  return {
    /** @type {Object} 抽奖指标 - 适配后端返回字段 */
    lotteryMetrics: {
      totalDraws: 0, // 后端: summary.total_draws
      totalWins: 0, // 后端: summary.total_wins
      winRate: 0, // 后端: summary.win_rate
      totalValue: 0 // 后端: summary.total_value（奖品价值）
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
    showDailyReportModal: false
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
        console.log(
          '📊 [Metrics] 调用API:',
          LOTTERY_ENDPOINTS.MONITORING_STATS,
          '时间范围:',
          timeRange
        )
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
            totalValue: summary.total_value ?? 0 // 后端返回的是奖品总价值，非用户数
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
          Alpine.store('notification').success(
            `指标数据已刷新，共 ${this.lotteryMetrics.totalDraws} 次抽奖`
          )
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
    },

    // ========== Phase 2: 监控页图表增强方法 ==========

    /**
     * 加载24小时趋势数据
     * 从 hourlyMetrics 中提取最近24小时的数据
     */
    async load24hTrend() {
      try {
        this.chartLoading = true
        // 使用已有的 hourlyMetrics 数据，取最近24条
        const trend = this.hourlyMetrics || []
        // 按时间排序并取最近24条
        this.hourlyTrend24h = trend
          .sort((a, b) => new Date(a.hour || a.hour_start) - new Date(b.hour || b.hour_start))
          .slice(-24)
          .map(item => ({
            hour: item.hour || item.hour_start,
            draws: item.total_draws || item.draws || 0,
            wins: item.total_wins || item.wins || 0,
            users: item.unique_users || item.users || 0
          }))
        logger.info('24小时趋势数据加载完成', { count: this.hourlyTrend24h.length })
      } catch (error) {
        logger.error('加载24小时趋势失败:', error)
        this.hourlyTrend24h = []
      } finally {
        this.chartLoading = false
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
        if (this.lotteryMetrics.winRate > 50) {
          alerts.push({
            level: 'warning',
            time: now.toISOString(),
            message: `中奖率偏高：当前 ${this.lotteryMetrics.winRate}%，建议检查概率配置`
          })
        }

        // 2. 检查是否有大量未中奖
        const emptyCount = this.prizeDistribution.find(p => 
          p.name === 'empty' || p.name === '未中奖' || p.name === '谢谢参与'
        )?.value || 0
        const emptyRate = this.lotteryMetrics.totalDraws > 0 
          ? (emptyCount / this.lotteryMetrics.totalDraws * 100) 
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
      await this.$nextTick?.() || await new Promise(resolve => setTimeout(resolve, 100))

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
     */
    updateTrendChart() {
      if (!this.monitoringCharts.trendChart) return

      const hours = this.hourlyTrend24h.map(item => {
        const date = new Date(item.hour)
        return date.getHours() + ':00'
      })
      const draws = this.hourlyTrend24h.map(item => item.draws)
      const wins = this.hourlyTrend24h.map(item => item.wins)

      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: {
          data: ['抽奖次数', '中奖次数'],
          bottom: 0
        },
        grid: {
          left: '3%',
          right: '4%',
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
        yAxis: {
          type: 'value',
          splitLine: {
            lineStyle: { type: 'dashed' }
          }
        },
        series: [
          {
            name: '抽奖次数',
            type: 'line',
            smooth: true,
            data: draws,
            itemStyle: { color: '#3B82F6' },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
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
            data: wins,
            itemStyle: { color: '#10B981' },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
                  { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
                ]
              }
            }
          }
        ]
      }

      this.monitoringCharts.trendChart.setOption(option)
      logger.info('趋势图表已更新')
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
      try {
        // 先加载基础指标
        await this.loadLotteryMetrics()
        
        // 然后处理图表数据
        await this.load24hTrend()
        this.calculateTierDistribution()
        await this.loadActiveAlerts()

        // 更新图表
        this.updateTrendChart()
        this.updateTierChart()

        logger.info('增强监控数据加载完成')
      } catch (error) {
        logger.error('加载增强监控数据失败:', error)
      } finally {
        this.chartLoading = false
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
    }
  }
}

export default { useMetricsState, useMetricsMethods }
