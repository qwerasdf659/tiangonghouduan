/**
 * 数据统计报表页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/analytics/pages/statistics.js
 * @description 综合统计报表页面，提供用户、抽奖、消费、积分等多维度统计分析
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module StatisticsPage
 *
 * @requires Alpine.js - 响应式框架
 * @requires ECharts - 图表库
 * @requires createPageMixin - 页面基础功能混入
 * @requires SYSTEM_ENDPOINTS - 系统管理API端点配置
 *
 * 功能模块：
 * 1. 核心指标 - 总用户、抽奖次数、中奖率、消费金额
 * 2. 用户统计 - 新增用户、活跃用户、用户类型分布
 * 3. 抽奖统计 - 抽奖次数、中奖分布
 * 4. 消费统计 - 消费总额、状态分布
 * 5. 积分统计 - 积分发放、消耗、余额
 * 6. 趋势图表 - ECharts折线图和饼图
 * 7. 数据导出 - Excel/PDF格式报表导出
 *
 * 后端API：
 * - GET /api/v4/console/system/charts (获取统计图表数据)
 * - GET /api/v4/console/system/statistics/export (导出报表)
 */


// ES Module 导入
import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system.js'
import { request, getToken } from '../../../api/base.js'
import { loadECharts } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
/**
 * @typedef {Object} StatisticsFilters
 * @property {string} period - 时间周期 ('today'|'yesterday'|'week'|'month'|'custom')
 * @property {string} startDate - 自定义开始日期
 * @property {string} endDate - 自定义结束日期
 */

/**
 * @typedef {Object} CoreStats
 * @property {number} totalUsers - 总用户数
 * @property {number} totalDraws - 总抽奖次数
 * @property {number} winRate - 中奖率
 * @property {number} totalRevenue - 总消费金额
 * @property {number} userTrend - 用户增长趋势百分比
 * @property {number} drawTrend - 抽奖趋势百分比
 * @property {number} winRateTrend - 中奖率趋势百分比
 * @property {number} revenueTrend - 收入趋势百分比
 */

/**
 * 创建统计报表页面组件
 *
 * @description 数据统计报表页面，展示核心业务指标和可视化图表
 * @returns {Object} Alpine.js组件配置对象
 *
 * @example
 * // HTML中使用
 * <div x-data="statisticsPage()">
 *   <span x-text="formatNumber(stats.totalUsers)"></span>
 * </div>
 */
function statisticsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== 页面特有状态 ====================

    /**
     * 导出中状态标志
     * @type {boolean}
     */
    exporting: false,

    /**
     * 筛选条件
     * @type {StatisticsFilters}
     */
    filters: {
      period: 'week',
      startDate: '',
      endDate: ''
    },

    /**
     * 核心统计指标
     * @type {CoreStats}
     */
    stats: {
      totalUsers: 0,
      totalDraws: 0,
      winRate: 0,
      totalRevenue: 0,
      userTrend: 0,
      drawTrend: 0,
      winRateTrend: 0,
      revenueTrend: 0
    },

    /** 用户统计 */
    userStats: {
      newUsers: 0,
      activeUsers: 0,
      adminUsers: 0,
      regularUsers: 0
    },

    /** 抽奖统计 */
    lotteryStats: {
      totalDraws: 0,
      highTierWins: 0,
      regularWins: 0,
      winRate: 0
    },

    /** 消费统计 */
    consumptionStats: {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0
    },

    /** 积分统计 */
    pointsStats: {
      issued: 0,
      consumed: 0,
      current: 0,
      average: 0
    },

    /** 奖品统计 */
    prizeStats: [],

    /** 活跃时段统计 */
    activeHoursStats: {
      totalActivity: 0,
      activeHourCount: 0,
      peakHour: '-',
      coverageRate: '-'
    },

    /** ECharts 图表实例 */
    _charts: {
      trend: null,
      userType: null
    },

    /** ECharts 核心模块引用 */
    _echarts: null,

    // ==================== 生命周期 ====================

    /**
     * 组件初始化
     * @async
     * @description 初始化统计报表页面：验证登录、加载ECharts、初始化图表
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('数据统计报表页面初始化 (ES Module v3.1)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 动态加载 ECharts（懒加载优化）
      try {
        this._echarts = await loadECharts()
        logger.info('[Statistics] ECharts 加载完成', { hasEcharts: !!this._echarts })
      } catch (error) {
        logger.error('[Statistics] ECharts 加载失败:', error)
        this.showError('图表组件加载失败，部分功能可能不可用')
      }

      // 初始化图表
      this.$nextTick(() => {
        this.initCharts()
        this.loadStatistics()
      })

      // 监听窗口大小变化
      window.addEventListener('resize', () => {
        this._charts.trend?.resize()
        this._charts.userType?.resize()
      })
    },

    // ==================== 图表初始化 ====================

    /**
     * 初始化ECharts图表实例
     * @description 创建趋势图和用户类型分布图
     * @returns {void}
     */
    initCharts() {
      const trendContainer = this.$refs.trendChart
      const userTypeContainer = this.$refs.userTypeChart
      const echarts = this._echarts

      logger.info('[Statistics] 初始化图表', {
        hasTrendContainer: !!trendContainer,
        hasUserTypeContainer: !!userTypeContainer,
        hasEcharts: !!echarts
      })

      if (trendContainer && echarts) {
        this._charts.trend = echarts.init(trendContainer)
        this._charts.trend.setOption(this.getTrendChartOption([], [], [], []))
        logger.info('[Statistics] 趋势图初始化完成')
      }

      if (userTypeContainer && echarts) {
        this._charts.userType = echarts.init(userTypeContainer)
        this._charts.userType.setOption(this.getUserTypeChartOption([]))
        logger.info('[Statistics] 用户类型图初始化完成')
      }
    },

    /**
     * 获取趋势图ECharts配置
     * @param {Array<string>} dates - 日期数组
     * @param {Array<number>} users - 用户数据
     * @param {Array<number>} draws - 抽奖数据
     * @param {Array<number>} revenue - 消费金额数据
     * @returns {Object} ECharts配置对象
     */
    getTrendChartOption(dates, users, draws, revenue) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { data: ['新增用户', '抽奖次数', '消费金额'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: dates },
        yAxis: [
          { type: 'value', name: '次数', position: 'left' },
          { type: 'value', name: '金额(元)', position: 'right' }
        ],
        series: [
          {
            name: '新增用户',
            type: 'line',
            data: users,
            smooth: true,
            itemStyle: { color: '#5470c6' },
            areaStyle: { opacity: 0.3 }
          },
          {
            name: '抽奖次数',
            type: 'line',
            data: draws,
            smooth: true,
            itemStyle: { color: '#91cc75' }
          },
          {
            name: '消费金额',
            type: 'line',
            yAxisIndex: 1,
            data: revenue,
            smooth: true,
            itemStyle: { color: '#fac858' }
          }
        ]
      }
    },

    /**
     * 获取用户类型饼图ECharts配置
     * @param {Array<Object>} data - 用户类型数据
     * @returns {Object} ECharts饼图配置对象
     */
    getUserTypeChartOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [
          {
            name: '用户类型',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
            label: {
              show: true,
              position: 'outside',
              formatter: '{b}\n{c} ({d}%)',
              fontSize: 12,
              color: '#333'
            },
            emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
            labelLine: {
              show: true,
              length: 10,
              length2: 15
            },
            data: data
          }
        ]
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 处理时间周期变更
     * @description 当用户选择新的周期时重新加载统计数据
     * @returns {void}
     */
    onPeriodChange() {
      if (this.filters.period !== 'custom') {
        this.loadStatistics()
      }
    },

    /**
     * 将时间周期转换为天数
     * @param {string} period - 周期标识
     * @returns {number} 对应的天数
     */
    periodToDays(period) {
      const map = { today: 1, yesterday: 1, week: 7, month: 30 }
      return map[period] || 7
    },

    /**
     * 加载统计数据
     * @async
     * @description 从API获取统计图表数据并更新页面
     * @returns {Promise<void>}
     */
    async loadStatistics() {
      const result = await this.withLoading(async () => {
        const days = this.periodToDays(this.filters.period)
        const params = new URLSearchParams({ days })

        if (this.filters.period === 'custom') {
          if (!this.filters.startDate || !this.filters.endDate) {
            throw new Error('请选择开始和结束日期')
          }
          params.append('start_date', this.filters.startDate)
          params.append('end_date', this.filters.endDate)
        }

        const response = await request({ url: `${SYSTEM_ENDPOINTS.CHARTS}?${params.toString()}` })

        if (response && response.success) {
          return response.data
        }
        throw new Error(response?.message || '获取统计数据失败')
      })

      if (result.success) {
        this.renderStatistics(result.data)
      }
    },

    /**
     * 渲染统计数据
     * @param {Object} data - API返回的统计图表数据（后端 /api/v4/statistics/charts 格式）
     * @description 处理API数据并更新页面各项指标
     * 
     * 后端数据格式:
     * {
     *   user_growth: [{ date, count, cumulative }],
     *   user_types: { regular: { count, percentage }, admin: {...}, merchant: {...}, total },
     *   lottery_trend: [{ date, count, high_tier_count, high_tier_rate }],
     *   consumption_trend: [{ date, count, amount, avg_amount }],
     *   points_flow: [{ date, earned, spent, balance_change }],
     *   top_prizes: [{ prize_name, count, percentage }],
     *   active_hours: [{ hour, activity_count }]
     * }
     * @returns {void}
     */
    renderStatistics(data) {
      // 后端 /api/v4/statistics/charts 返回的数据结构
      const userGrowth = data.user_growth || []
      const userTypes = data.user_types || {}
      const lotteryTrend = data.lottery_trend || []
      const consumptionTrend = data.consumption_trend || []
      const pointsFlow = data.points_flow || []
      const topPrizes = data.top_prizes || []
      const activeHours = data.active_hours || []

      // 1. 核心指标 - 从趋势数据汇总
      const totalNewUsers = userGrowth.reduce((sum, item) => sum + (item.count || 0), 0)
      const lastUserRecord = userGrowth.length > 0 ? userGrowth[userGrowth.length - 1] : {}
      this.stats.totalUsers = lastUserRecord.cumulative || userTypes.total || 0
      
      const totalDraws = lotteryTrend.reduce((sum, item) => sum + (item.count || 0), 0)
      this.stats.totalDraws = totalDraws

      // 计算总体高档奖励率
      const totalHighTierWins = lotteryTrend.reduce((sum, item) => sum + (item.high_tier_count || 0), 0)
      this.stats.winRate = totalDraws > 0 ? ((totalHighTierWins / totalDraws) * 100).toFixed(2) : 0

      const totalRevenue = consumptionTrend.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0)
      this.stats.totalRevenue = totalRevenue

      // 趋势计算（比较前后半段数据）
      this.stats.userTrend = this.calculateGrowthTrend(userGrowth)
      this.stats.drawTrend = this.calculateArrayTrend(lotteryTrend, 'count')
      this.stats.winRateTrend = 0 // 暂不计算
      this.stats.revenueTrend = this.calculateArrayTrend(consumptionTrend, 'amount')

      // 2. 用户统计 - 使用后端用户类型数据
      this.userStats.newUsers = totalNewUsers
      this.userStats.activeUsers = userTypes.regular?.count || 0
      this.userStats.adminUsers = userTypes.admin?.count || 0
      this.userStats.regularUsers = userTypes.regular?.count || 0

      // 3. 抽奖统计 - 使用后端趋势数据
      this.lotteryStats.totalDraws = totalDraws
      this.lotteryStats.highTierWins = totalHighTierWins
      this.lotteryStats.regularWins = totalDraws - totalHighTierWins
      this.lotteryStats.winRate = parseFloat(this.stats.winRate) || 0

      // 4. 消费统计
      const totalConsumptionCount = consumptionTrend.reduce((sum, item) => sum + (item.count || 0), 0)
      this.consumptionStats.total = totalRevenue
      this.consumptionStats.approved = totalRevenue
      this.consumptionStats.pending = 0
      this.consumptionStats.rejected = 0

      // 5. 积分统计
      const totalEarned = pointsFlow.reduce((sum, item) => sum + (item.earned || 0), 0)
      const totalSpent = pointsFlow.reduce((sum, item) => sum + (item.spent || 0), 0)
      this.pointsStats.issued = totalEarned
      this.pointsStats.consumed = totalSpent
      this.pointsStats.current = totalEarned - totalSpent
      this.pointsStats.average = userTypes.total > 0 ? Math.round((totalEarned - totalSpent) / userTypes.total) : 0

      // 6. 奖品统计
      this.prizeStats = topPrizes.map(prize => ({
        name: prize.prize_name,
        count: prize.count,
        percentage: prize.percentage
      }))

      // 7. 活跃时段统计
      this.renderActiveHoursStats(activeHours)

      // 8. 渲染图表
      this.renderTrendChart(data)
      this.renderUserTypeChart(userTypes)

      logger.info('统计图表数据已渲染', {
        totalUsers: this.stats.totalUsers,
        totalDraws: this.stats.totalDraws,
        totalRevenue: this.stats.totalRevenue,
        prizeCount: this.prizeStats.length
      })
    },

    /**
     * 渲染趋势折线图
     * @param {Object} data - 包含用户增长、抽奖趋势、消费趋势的数据
     * @returns {void}
     */
    renderTrendChart(data) {
      if (!this._charts.trend) return

      const userGrowth = data.user_growth || []
      const lotteryTrend = data.lottery_trend || []
      const consumptionTrend = data.consumption_trend || []

      const dates = userGrowth.map(item => item.date)
      const users = userGrowth.map(item => item.count || 0)

      const drawsMap = new Map(lotteryTrend.map(item => [item.date, item.count || 0]))
      const draws = dates.map(date => drawsMap.get(date) || 0)

      const revenueMap = new Map(
        consumptionTrend.map(item => [item.date, parseFloat(item.amount) || 0])
      )
      const revenue = dates.map(date => revenueMap.get(date) || 0)

      this._charts.trend.setOption(this.getTrendChartOption(dates, users, draws, revenue))
    },

    /**
     * 渲染用户类型饼图
     * @param {Object} userTypes - 用户类型分布数据
     * @returns {void}
     */
    renderUserTypeChart(userTypes) {
      if (!this._charts.userType || !userTypes) return

      const data = [
        { value: userTypes.regular?.count || 0, name: '普通用户', itemStyle: { color: '#5470c6' } },
        { value: userTypes.admin?.count || 0, name: '管理员', itemStyle: { color: '#91cc75' } },
        { value: userTypes.merchant?.count || 0, name: '商户', itemStyle: { color: '#fac858' } }
      ].filter(item => item.value > 0)

      this._charts.userType.setOption(this.getUserTypeChartOption(data))
    },

    /**
     * 渲染活跃时段统计
     * @param {Array<Object>} activeHours - 活跃时段数据数组
     * @returns {void}
     */
    renderActiveHoursStats(activeHours) {
      if (!activeHours || activeHours.length === 0) {
        this.activeHoursStats = {
          totalActivity: 0,
          activeHourCount: 0,
          peakHour: '-',
          coverageRate: '-'
        }
        return
      }

      const totalActivity = activeHours.reduce((sum, item) => sum + (item.activity_count || 0), 0)
      const sortedHours = [...activeHours].sort(
        (a, b) => (b.activity_count || 0) - (a.activity_count || 0)
      )
      const peakHour = sortedHours[0]
      const activeHourCount = activeHours.filter(h => h.activity_count > 0).length

      this.activeHoursStats = {
        totalActivity,
        activeHourCount,
        peakHour: peakHour ? peakHour.hour_label : '-',
        coverageRate: `${((activeHourCount / 24) * 100).toFixed(0)}%`
      }
    },

    // ==================== 计算方法 ====================

    /**
     * 计算用户增长趋势
     * @param {Array<Object>} userGrowth - 用户增长数据数组
     * @returns {number} 趋势百分比
     */
    calculateGrowthTrend(userGrowth) {
      if (!userGrowth || userGrowth.length < 2) return 0

      const midPoint = Math.floor(userGrowth.length / 2)
      const recentSum = userGrowth.slice(midPoint).reduce((sum, item) => sum + (item.count || 0), 0)
      const previousSum = userGrowth
        .slice(0, midPoint)
        .reduce((sum, item) => sum + (item.count || 0), 0)

      if (previousSum === 0) return recentSum > 0 ? 100 : 0
      return ((recentSum - previousSum) / previousSum) * 100
    },

    /**
     * 计算数据数组趋势
     * @param {Array<Object>} dataArray - 数据数组
     * @param {string} field - 计算字段名
     * @returns {number} 趋势百分比
     */
    calculateArrayTrend(dataArray, field) {
      if (!dataArray || dataArray.length < 2) return 0

      const midPoint = Math.floor(dataArray.length / 2)
      const recentSum = dataArray
        .slice(midPoint)
        .reduce((sum, item) => sum + parseFloat(item[field] || 0), 0)
      const previousSum = dataArray
        .slice(0, midPoint)
        .reduce((sum, item) => sum + parseFloat(item[field] || 0), 0)

      if (previousSum === 0) return recentSum > 0 ? 100 : 0
      return ((recentSum - previousSum) / previousSum) * 100
    },

    /**
     * 根据百分比获取进度条颜色类名
     * @param {number} percentage - 百分比值
     * @returns {string} Bootstrap颜色类名
     */
    getProgressColor(percentage) {
      if (percentage >= 80) return 'bg-success'
      if (percentage >= 50) return 'bg-info'
      if (percentage >= 30) return 'bg-warning'
      return 'bg-danger'
    },

    // ==================== 导出方法 ====================

    /**
     * 导出报表（简化版 - 直接导出Excel）
     * @async
     * @description 导出按钮点击时调用
     * @returns {Promise<void>}
     */
    async exportReport() {
      return this.exportToExcel()
    },

    /**
     * 导出Excel格式报表
     * @async
     * @description 从API下载Excel格式的统计报表
     * @returns {Promise<void>}
     */
    async exportToExcel() {
      this.exporting = true

      try {
        const days = this.periodToDays(this.filters.period)
        const params = new URLSearchParams({ days, format: 'excel' })

        if (this.filters.period === 'custom') {
          params.append('start_date', this.filters.startDate)
          params.append('end_date', this.filters.endDate)
        }

        const response = await fetch(
          `${SYSTEM_ENDPOINTS.STATISTICS_EXPORT}?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${getToken()}` }
          }
        )

        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `统计报表_${new Date().toISOString().split('T')[0]}.xlsx`
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
          this.showSuccess('Excel文件已下载')
        } else {
          this.showError('无法生成Excel文件')
        }
      } catch (error) {
        logger.error('导出Excel失败:', error)
        this.showError(`导出失败: ${error.message}`)
      } finally {
        this.exporting = false
      }
    },

    /**
     * 导出PDF格式报表
     * @async
     * @description 从API下载PDF格式的统计报表
     * @returns {Promise<void>}
     */
    async exportToPDF() {
      this.exporting = true

      try {
        const days = this.periodToDays(this.filters.period)
        const params = new URLSearchParams({ days, format: 'pdf' })

        if (this.filters.period === 'custom') {
          params.append('start_date', this.filters.startDate)
          params.append('end_date', this.filters.endDate)
        }

        const response = await fetch(
          `${SYSTEM_ENDPOINTS.STATISTICS_EXPORT}?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${getToken()}` }
          }
        )

        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `统计报表_${new Date().toISOString().split('T')[0]}.pdf`
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
          this.showSuccess('PDF文件已下载')
        } else {
          this.showError('无法生成PDF文件')
        }
      } catch (error) {
        logger.error('导出PDF失败:', error)
        this.showError(`导出失败: ${error.message}`)
      } finally {
        this.exporting = false
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化数字为千分位
     * @param {number|null|undefined} value - 数字
     * @returns {string} 格式化后的字符串
     */
    formatNumber(value) {
      if (value === undefined || value === null) return '-'
      return Number(value).toLocaleString()
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('statisticsPage', statisticsPage)
  logger.info('[StatisticsPage] Alpine 组件已注册 (Mixin v3.0)')
})
