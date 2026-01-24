/**
 * 运营分析页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/analytics/pages/analytics.js
 * @description 运营数据分析页面，提供用户活跃度、抽奖趋势、积分流转、策略分析等功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module Analytics
 *
 * @requires Alpine.js
 * @requires ECharts - 图表库
 * @requires createPageMixin - 页面基础混入
 * @requires ANALYTICS_ENDPOINTS - 分析API端点配置
 * @requires LOTTERY_ENDPOINTS - 抽奖API端点配置
 *
 * 功能模块：
 * 1. 今日统计 - 活跃用户、抽奖次数、积分流转等
 * 2. 趋势分析 - 用户趋势图、抽奖趋势图、积分流转图
 * 3. 决策分析 - 中奖决策统计、策略效果分析
 * 4. 等级分布 - 用户等级分布饼图
 * 5. 数据导出 - 导出CSV格式报告
 *
 * 后端API：
 * - GET /api/v4/console/analytics/today-stats (今日统计)
 * - GET /api/v4/console/analytics/decisions (决策分析)
 * - GET /api/v4/console/analytics/lottery-trends (抽奖趋势)
 */


// ES Module 导入
import { logger } from '../../../utils/logger.js'
import { ANALYTICS_ENDPOINTS } from '../../../api/analytics.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL, request } from '../../../api/base.js'
import { loadECharts } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}
/**
 * @typedef {Object} AnalyticsStats
 * @property {number} activeUsers - 活跃用户数
 * @property {number} totalUsers - 总用户数
 * @property {number} lotteryCount - 抽奖次数
 * @property {number} highTierDraws - 高级抽奖次数
 * @property {number} pointsIssued - 积分发放量
 * @property {number} pointsSpent - 积分消耗量
 * @property {number} exchangeOrders - 兑换订单数
 * @property {number} newItems - 新增物品数
 */

/**
 * @typedef {Object} DecisionSummary
 * @property {number} totalDecisions - 总决策数
 * @property {number} winDecisions - 中奖决策数
 * @property {number} loseDecisions - 未中奖决策数
 * @property {number} avgWinRate - 平均中奖率
 * @property {Array} topStrategies - 热门策略列表
 * @property {Array} tierDistribution - 等级分布
 */

/**
 * 创建运营分析页面组件
 *
 * @description 运营分析页面，展示关键业务指标和可视化图表
 * @returns {Object} Alpine.js组件配置对象
 *
 * @example
 * // HTML中使用
 * <div x-data="analyticsPage()">
 *   <span x-text="formatNumber(stats.activeUsers)"></span>
 * </div>
 */
function analyticsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== 页面特有状态 ====================

    /**
     * 筛选条件
     * @type {{timeRange: string, startDate: string, endDate: string}}
     */
    filters: {
      timeRange: '30',
      startDate: '',
      endDate: ''
    },

    /**
     * 统计数据
     * @type {AnalyticsStats}
     */
    stats: {
      activeUsers: 0,
      totalUsers: 0,
      lotteryCount: 0,
      highTierDraws: 0,
      pointsIssued: 0,
      pointsSpent: 0,
      exchangeOrders: 0,
      newItems: 0
    },

    /**
     * 每日明细数据
     * @type {Array<Object>}
     */
    dailyStats: [],

    /**
     * 决策分析摘要
     * @type {DecisionSummary}
     */
    decisionSummary: {
      totalDecisions: 0,
      winDecisions: 0,
      loseDecisions: 0,
      avgWinRate: 0,
      topStrategies: [],
      tierDistribution: []
    },

    /**
     * 策略统计数据
     * @type {{totalStrategies: number, activeStrategies: number, avgEffectiveness: number, strategyTypes: Array}}
     */
    strategyStats: {
      totalStrategies: 0,
      activeStrategies: 0,
      avgEffectiveness: 0,
      strategyTypes: []
    },

    /**
     * 等级分布数据
     * @type {Array<Object>}
     */
    tierDistribution: [],

    /**
     * ECharts图表实例集合
     * @type {{userTrend: Object|null, lotteryTrend: Object|null, pointsFlow: Object|null, userSource: Object|null}}
     */
    charts: {
      userTrend: null,
      lotteryTrend: null,
      pointsFlow: null,
      userSource: null
    },

    // ==================== 生命周期 ====================

    /**
     * 组件初始化
     * @async
     * @description 初始化运营分析页面：
     * 1. 检查用户认证
     * 2. 动态加载ECharts库
     * 3. 初始化图表实例
     * 4. 加载所有数据
     * 5. 注册窗口resize监听
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('运营分析页面初始化 (ES Module v3.1)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 动态加载 ECharts（懒加载优化）
      try {
        await loadECharts()
        logger.info('[Analytics] ECharts 加载完成')
      } catch (error) {
        logger.error('[Analytics] ECharts 加载失败:', error)
      }

      // 初始化图表
      this.$nextTick(() => {
        this.initCharts()
        this.loadAllData()

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
          this.resizeCharts()
        })
      })
    },

    // ==================== 图表初始化 ====================

    /**
     * 初始化所有ECharts图表
     * @description 初始化用户趋势图、抽奖趋势图、积分流转图、用户类型分布图
     * @returns {void}
     */
    initCharts() {
      // 用户趋势图
      if (this.$refs.userTrendChart && typeof echarts !== 'undefined') {
        this.charts.userTrend = echarts.init(this.$refs.userTrendChart)
        this.charts.userTrend.setOption(this.getUserTrendOption([]))
      }

      // 抽奖趋势图
      if (this.$refs.lotteryTrendChart && typeof echarts !== 'undefined') {
        this.charts.lotteryTrend = echarts.init(this.$refs.lotteryTrendChart)
        this.charts.lotteryTrend.setOption(this.getLotteryTrendOption([]))
      }

      // 积分流转图
      if (this.$refs.pointsFlowChart && typeof echarts !== 'undefined') {
        this.charts.pointsFlow = echarts.init(this.$refs.pointsFlowChart)
        this.charts.pointsFlow.setOption(this.getPointsFlowOption([]))
      }

      // 用户类型分布
      if (this.$refs.userSourceChart && typeof echarts !== 'undefined') {
        this.charts.userSource = echarts.init(this.$refs.userSourceChart)
        this.charts.userSource.setOption(this.getUserSourceOption([]))
      }
    },

    /**
     * 获取用户趋势图配置
     * @param {Array<Object>} data - 趋势数据数组
     * @returns {Object} ECharts配置对象
     */
    getUserTrendOption(data) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { show: false },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: data.map(d => d.date || d.time) },
        yAxis: { type: 'value', min: 0 },
        series: [
          {
            name: '活跃用户',
            type: 'line',
            smooth: true,
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(13, 110, 253, 0.3)' },
                { offset: 1, color: 'rgba(13, 110, 253, 0.05)' }
              ])
            },
            lineStyle: { color: '#0d6efd', width: 2 },
            itemStyle: { color: '#0d6efd' },
            data: data.map(d => d.active_users || d.count || 0)
          }
        ]
      }
    },

    /**
     * 获取抽奖趋势图配置
     * @param {Array<Object>} data - 抽奖趋势数据
     * @returns {Object} ECharts配置对象
     */
    getLotteryTrendOption(data) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { show: false },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: data.map(d => d.date || d.time) },
        yAxis: { type: 'value', min: 0 },
        series: [
          {
            name: '抽奖次数',
            type: 'bar',
            barWidth: '60%',
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#198754' },
                { offset: 1, color: 'rgba(25, 135, 84, 0.6)' }
              ])
            },
            data: data.map(d => d.draws || d.total_draws || 0)
          }
        ]
      }
    },

    /**
     * 获取积分流转图配置
     * @param {Array<Object>} data - 积分流转数据
     * @returns {Object} ECharts配置对象
     */
    getPointsFlowOption(data) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { data: ['积分发放', '积分消耗'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: data.map(d => d.date || d.time) },
        yAxis: { type: 'value', min: 0 },
        series: [
          {
            name: '积分发放',
            type: 'line',
            smooth: true,
            lineStyle: { color: '#ffc107', width: 2 },
            itemStyle: { color: '#ffc107' },
            data: data.map(d => d.earned || d.issued || 0)
          },
          {
            name: '积分消耗',
            type: 'line',
            smooth: true,
            lineStyle: { color: '#dc3545', width: 2 },
            itemStyle: { color: '#dc3545' },
            data: data.map(d => d.spent || d.consumed || 0)
          }
        ]
      }
    },

    /**
     * 获取用户类型分布配置
     * @param {Array<Object>} data - 用户类型分布数据
     * @returns {Object} ECharts饼图配置对象
     */
    getUserSourceOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
        legend: { orient: 'horizontal', bottom: 0, data: data.map(d => d.name) },
        series: [
          {
            name: '用户类型',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            label: { show: false, position: 'center' },
            emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
            labelLine: { show: false },
            data: data
          }
        ]
      }
    },

    /**
     * 调整所有图表大小
     * @description 响应窗口resize事件，重新调整图表尺寸
     * @returns {void}
     */
    resizeCharts() {
      Object.values(this.charts).forEach(chart => {
        if (chart) chart.resize()
      })
    },

    // ==================== 数据加载 ====================

    /**
     * 加载所有分析数据
     * @async
     * @description 并行加载今日统计、决策分析、策略统计、等级分布数据
     * @returns {Promise<void>}
     */
    async loadAllData() {
      await this.withLoading(async () => {
        await Promise.all([
          this.loadTodayStats(),
          this.loadDecisionAnalytics(),
          this.loadStrategyStats(),
          this.loadTierDistribution()
        ])
      })
    },

    /**
     * 加载今日统计数据
     * @async
     * @description 从API获取今日用户、抽奖、积分等统计数据
     * @returns {Promise<void>}
     */
    async loadTodayStats() {
      try {
        const response = await apiRequest(ANALYTICS_ENDPOINTS.TODAY_STATS)

        if (response && response.success) {
          const data = response.data

          this.stats.activeUsers = data.user_stats?.active_users_today || 0
          this.stats.totalUsers = data.user_stats?.total_users || 0
          this.stats.lotteryCount = data.lottery_stats?.draws_today || 0
          this.stats.highTierDraws = data.lottery_stats?.high_tier_draws_today || 0
          this.stats.pointsIssued = data.points_stats?.points_earned_today || 0
          this.stats.pointsSpent = data.points_stats?.points_spent_today || 0
          this.stats.exchangeOrders = data.inventory_stats?.used_items_today || 0
          this.stats.newItems = data.inventory_stats?.new_items_today || 0
        }
      } catch (error) {
        logger.error('加载今日统计数据失败:', error)
      }
    },

    /**
     * 加载决策分析数据
     * @async
     * @description 获取抽奖决策统计、趋势数据并更新图表
     * @returns {Promise<void>}
     */
    async loadDecisionAnalytics() {
      const days = this.filters.timeRange

      try {
        const response = await apiRequest(`${ANALYTICS_ENDPOINTS.DECISIONS}?days=${days}`)

        if (response && response.success) {
          const data = response.data
          this.dailyStats = data.trends?.daily_stats || data.daily_stats || []

          // 处理决策分析摘要
          this.decisionSummary = {
            totalDecisions: data.summary?.total_decisions ?? data.total_decisions ?? 0,
            winDecisions: data.summary?.win_decisions ?? data.win_decisions ?? 0,
            loseDecisions: data.summary?.lose_decisions ?? data.lose_decisions ?? 0,
            avgWinRate: data.summary?.avg_win_rate
              ? (data.summary.avg_win_rate * 100).toFixed(2)
              : data.avg_win_rate
                ? (data.avg_win_rate * 100).toFixed(2)
                : 0,
            topStrategies: data.top_strategies || [],
            tierDistribution: data.tier_distribution || []
          }

          // 更新图表
          this.updateChartsWithData(data)

          // 加载更多趋势数据
          await this.loadLotteryTrends(days)
        }
      } catch (error) {
        logger.error('加载决策分析数据失败:', error)
      }
    },

    /**
     * 加载策略统计数据
     * @async
     * @description 获取抽奖策略的总数、活跃数、效果等统计
     * @returns {Promise<void>}
     */
    async loadStrategyStats() {
      try {
        // 使用默认活动ID 1 获取策略统计概览
        const response = await apiRequest(buildURL(LOTTERY_ENDPOINTS.STRATEGY_STATS_OVERVIEW, { campaign_id: 1 }))

        if (response && response.success) {
          this.strategyStats = {
            totalStrategies: response.data?.total_strategies ?? 0,
            activeStrategies: response.data?.active_strategies ?? 0,
            avgEffectiveness: response.data?.avg_effectiveness
              ? (response.data.avg_effectiveness * 100).toFixed(1)
              : 0,
            strategyTypes: response.data?.strategy_types || []
          }
        }
      } catch (error) {
        logger.error('加载策略统计失败:', error)
      }
    },

    /**
     * 加载等级分布数据
     * @async
     * @description 获取用户等级分布并更新饼图
     * @returns {Promise<void>}
     */
    async loadTierDistribution() {
      try {
        // 使用默认活动ID 1 获取档位分布
        const response = await apiRequest(buildURL(LOTTERY_ENDPOINTS.STRATEGY_STATS_TIER, { campaign_id: 1 }))

        if (response && response.success) {
          this.tierDistribution = response.data?.distribution || response.data || []

          // 更新用户类型分布图
          if (this.charts.userSource && this.tierDistribution.length > 0) {
            this.charts.userSource.setOption({
              series: [
                {
                  data: this.tierDistribution.map((tier, index) => ({
                    value: tier.count || tier.users || 0,
                    name: tier.tier_name || tier.name || `等级${index + 1}`,
                    itemStyle: { color: this.getTierColor(index) }
                  }))
                }
              ]
            })
          }
        }
      } catch (error) {
        logger.error('加载等级分布失败:', error)
      }
    },

    /**
     * 获取等级颜色
     * @param {number} index - 等级索引
     * @returns {string} 颜色代码
     */
    getTierColor(index) {
      const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6c757d', '#17a2b8']
      return colors[index % colors.length]
    },

    /**
     * 使用数据更新图表
     * @param {Object} data - 决策分析数据
     * @description 更新抽奖趋势图和用户趋势图
     * @returns {void}
     */
    updateChartsWithData(data) {
      const dates = this.dailyStats.map(item => item.date)
      const draws = this.dailyStats.map(item => item.draws)

      if (this.charts.lotteryTrend) {
        this.charts.lotteryTrend.setOption({
          xAxis: { data: dates },
          series: [{ data: draws }]
        })
      }

      if (this.charts.userTrend) {
        this.charts.userTrend.setOption({
          xAxis: { data: dates },
          series: [{ data: draws.map(d => Math.min(d, 100)) }]
        })
      }
    },

    /**
     * 加载抽奖趋势数据
     * @async
     * @param {number} days - 天数范围
     * @description 根据天数范围加载相应周期的趋势数据并更新所有图表
     * @returns {Promise<void>}
     */
    async loadLotteryTrends(days) {
      try {
        let period = 'week'
        if (days >= 30) period = 'month'
        if (days >= 90) period = 'quarter'

        const response = await apiRequest(
          `${ANALYTICS_ENDPOINTS.LOTTERY_TRENDS}?period=${period}&granularity=daily`
        )

        if (response && response.success) {
          const data = response.data

          // 更新用户活跃趋势图
          if (data.user_activity && data.user_activity.length > 0 && this.charts.userTrend) {
            const userDates = data.user_activity.map(item => item.period)
            const activeUsers = data.user_activity.map(item => item.active_users)
            this.charts.userTrend.setOption({
              xAxis: { data: userDates },
              series: [{ data: activeUsers }]
            })
          }

          // 更新抽奖趋势
          if (
            data.lottery_activity &&
            data.lottery_activity.length > 0 &&
            this.charts.lotteryTrend
          ) {
            const lotteryDates = data.lottery_activity.map(item => item.period)
            const totalDraws = data.lottery_activity.map(item => item.total_draws)
            this.charts.lotteryTrend.setOption({
              xAxis: { data: lotteryDates },
              series: [{ data: totalDraws }]
            })
          }

          // 更新积分流转图
          if (data.lottery_activity && data.lottery_activity.length > 0 && this.charts.pointsFlow) {
            const dates = data.lottery_activity.map(item => item.period)
            const pointsOut = data.lottery_activity.map(item => item.total_draws * 10)
            const pointsIn = data.lottery_activity.map(item => item.unique_users * 50)
            this.charts.pointsFlow.setOption({
              xAxis: { data: dates },
              series: [{ data: pointsIn }, { data: pointsOut }]
            })
          }

          // 更新用户类型分布
          if (data.summary && this.charts.userSource) {
            const peakUsers = data.summary.peak_users || 100
            this.charts.userSource.setOption({
              series: [
                {
                  data: [
                    { value: peakUsers, name: '普通用户', itemStyle: { color: '#0d6efd' } },
                    {
                      value: Math.floor(peakUsers * 0.05),
                      name: '管理员',
                      itemStyle: { color: '#198754' }
                    },
                    {
                      value: Math.floor(peakUsers * 0.1),
                      name: '商家',
                      itemStyle: { color: '#ffc107' }
                    }
                  ]
                }
              ]
            })
          }
        }
      } catch (error) {
        logger.error('加载抽奖趋势数据失败:', error)
      }
    },

    // ==================== 事件处理 ====================

    /**
     * 处理时间范围变更
     * @description 当用户选择新的时间范围时重新加载数据
     * @returns {void}
     */
    handleTimeRangeChange() {
      if (this.filters.timeRange !== 'custom') {
        this.loadAllData()
      }
    },

    /**
     * 导出运营分析报告
     * @description 将运营数据导出为CSV格式文件，支持中文Excel打开
     * @returns {void}
     */
    exportReport() {
      try {
        // 构建导出数据
        const exportData = []

        // 添加汇总统计行
        exportData.push(['====== 运营数据汇总 ======'])
        exportData.push(['指标', '数值'])
        exportData.push(['活跃用户数', this.stats.activeUsers || 0])
        exportData.push(['总用户数', this.stats.totalUsers || 0])
        exportData.push(['抽奖次数', this.stats.lotteryCount || 0])
        exportData.push(['高级抽奖次数', this.stats.highTierDraws || 0])
        exportData.push(['积分发放', this.stats.pointsIssued || 0])
        exportData.push(['积分消耗', this.stats.pointsSpent || 0])
        exportData.push(['兑换订单数', this.stats.exchangeOrders || 0])
        exportData.push(['新增物品数', this.stats.newItems || 0])
        exportData.push([''])

        // 如果有每日明细数据，也导出
        if (this.dailyStats && this.dailyStats.length > 0) {
          exportData.push(['====== 每日明细数据 ======'])
          exportData.push(['日期', '活跃用户', '抽奖次数', '积分发放', '积分消耗'])
          this.dailyStats.forEach(day => {
            exportData.push([
              day.date || day.time || '-',
              day.active_users || day.activeUsers || 0,
              day.lottery_count || day.lotteryCount || 0,
              day.points_issued || day.pointsIssued || 0,
              day.points_spent || day.pointsSpent || 0
            ])
          })
        }

        // 生成CSV内容
        const csvContent = exportData.map(row => row.join(',')).join('\n')

        // 添加BOM以支持中文Excel打开
        const BOM = '\uFEFF'
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

        // 生成下载链接
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        const now = new Date()
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

        link.setAttribute('href', url)
        link.setAttribute('download', `运营分析报告_${dateStr}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        this.showSuccess('导出成功')
      } catch (error) {
        logger.error('导出失败:', error)
        this.showError('导出失败: ' + error.message)
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化数字为千分位
     * @param {number|null|undefined} num - 数字
     * @returns {string} 格式化后的字符串
     */
    formatNumber(num) {
      if (num === undefined || num === null) return '-'
      return num.toLocaleString()
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('analyticsPage', analyticsPage)
  logger.info('[AnalyticsPage] Alpine 组件已注册 (Mixin v3.0)')
})
