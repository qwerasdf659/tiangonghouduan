/**
 * 数据统计报表页面 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/statistics.js
 * @description 综合统计报表、趋势分析、数据导出等功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * 
 * 重构说明：
 * - 使用 createPageMixin 组合 Mixin
 * - 保留 ECharts 图表功能
 * - 统一使用 showSuccess/showError 替代 alert
 */

function statisticsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),
    
    // ==================== 页面特有状态 ====================
    
    /** 导出状态 */
    exporting: false,
    
    /** 筛选条件 */
    filters: {
      period: 'week',
      startDate: '',
      endDate: ''
    },
    
    /** 核心统计指标 */
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
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 数据统计报表页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
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
     * 初始化 ECharts
     */
    initCharts() {
      const trendContainer = this.$refs.trendChart
      const userTypeContainer = this.$refs.userTypeChart

      if (trendContainer && typeof echarts !== 'undefined') {
        this._charts.trend = echarts.init(trendContainer)
        this._charts.trend.setOption(this.getTrendChartOption([], [], [], []))
      }

      if (userTypeContainer && typeof echarts !== 'undefined') {
        this._charts.userType = echarts.init(userTypeContainer)
        this._charts.userType.setOption(this.getUserTypeChartOption([]))
      }
    },

    /**
     * 趋势图配置
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
          { name: '新增用户', type: 'line', data: users, smooth: true, itemStyle: { color: '#5470c6' }, areaStyle: { opacity: 0.3 } },
          { name: '抽奖次数', type: 'line', data: draws, smooth: true, itemStyle: { color: '#91cc75' } },
          { name: '消费金额', type: 'line', yAxisIndex: 1, data: revenue, smooth: true, itemStyle: { color: '#fac858' } }
        ]
      }
    },

    /**
     * 用户类型饼图配置
     */
    getUserTypeChartOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [{
          name: '用户类型',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
          label: { show: false, position: 'center' },
          emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
          labelLine: { show: false },
          data: data
        }]
      }
    },
    
    // ==================== 数据加载 ====================
    
    /**
     * 周期变更处理
     */
    onPeriodChange() {
      if (this.filters.period !== 'custom') {
        this.loadStatistics()
      }
    },
    
    /**
     * 周期转换为天数
     */
    periodToDays(period) {
      const map = { today: 1, yesterday: 1, week: 7, month: 30 }
      return map[period] || 7
    },
    
    /**
     * 加载统计数据
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

        const response = await apiRequest(`${API_ENDPOINTS.SYSTEM.CHARTS}?${params.toString()}`)

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
     */
    renderStatistics(data) {
      // 1. 核心指标
      this.stats.totalUsers = data.user_types?.total || 0
      this.stats.totalDraws = (data.lottery_trend || []).reduce((sum, item) => sum + (item.count || 0), 0)
      
      const totalHighTier = (data.lottery_trend || []).reduce((sum, item) => sum + (item.high_tier_count || 0), 0)
      this.stats.winRate = this.stats.totalDraws > 0 ? (totalHighTier / this.stats.totalDraws) * 100 : 0
      
      this.stats.totalRevenue = (data.consumption_trend || []).reduce((sum, item) => sum + parseFloat(item.amount || 0), 0)
      
      // 计算趋势
      this.stats.userTrend = this.calculateGrowthTrend(data.user_growth)
      this.stats.drawTrend = this.calculateArrayTrend(data.lottery_trend, 'count')
      this.stats.winRateTrend = this.calculateArrayTrend(data.lottery_trend, 'high_tier_rate')
      this.stats.revenueTrend = this.calculateArrayTrend(data.consumption_trend, 'amount')

      // 2. 用户统计
      const userGrowth = data.user_growth || []
      this.userStats.newUsers = userGrowth.reduce((sum, item) => sum + (item.count || 0), 0)
      this.userStats.activeUsers = (data.active_hours || []).reduce((sum, item) => sum + (item.activity_count || 0), 0)
      this.userStats.adminUsers = data.user_types?.admin?.count || 0
      this.userStats.regularUsers = data.user_types?.regular?.count || 0
      
      // 3. 抽奖统计
      this.lotteryStats.totalDraws = this.stats.totalDraws
      this.lotteryStats.highTierWins = totalHighTier
      this.lotteryStats.regularWins = this.stats.totalDraws - totalHighTier
      this.lotteryStats.winRate = this.stats.winRate
      
      // 4. 消费统计
      this.consumptionStats.total = this.stats.totalRevenue
      this.consumptionStats.approved = this.stats.totalRevenue
      this.consumptionStats.pending = 0
      this.consumptionStats.rejected = 0
      
      // 5. 积分统计
      const pointsData = data.points_flow || []
      this.pointsStats.issued = pointsData.reduce((sum, item) => sum + (item.earned || 0), 0)
      this.pointsStats.consumed = pointsData.reduce((sum, item) => sum + (item.spent || 0), 0)
      this.pointsStats.current = pointsData.reduce((sum, item) => sum + (item.balance_change || 0), 0)
      this.pointsStats.average = this.stats.totalUsers > 0 ? Math.round(this.pointsStats.current / this.stats.totalUsers) : 0
      
      // 6. 奖品统计
      this.prizeStats = (data.top_prizes || []).map(prize => ({
        prize_name: prize.prize_name || '未知奖品',
        count: prize.count || 0,
        percentage: parseFloat(prize.percentage || 0)
      }))
      
      // 7. 活跃时段统计
      this.renderActiveHoursStats(data.active_hours || [])

      // 8. 更新图表
      this.renderTrendChart(data)
      this.renderUserTypeChart(data.user_types)
    },

    /**
     * 渲染趋势图
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

      const revenueMap = new Map(consumptionTrend.map(item => [item.date, parseFloat(item.amount) || 0]))
      const revenue = dates.map(date => revenueMap.get(date) || 0)

      this._charts.trend.setOption(this.getTrendChartOption(dates, users, draws, revenue))
    },

    /**
     * 渲染用户类型饼图
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
      const sortedHours = [...activeHours].sort((a, b) => (b.activity_count || 0) - (a.activity_count || 0))
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
     */
    calculateGrowthTrend(userGrowth) {
      if (!userGrowth || userGrowth.length < 2) return 0

      const midPoint = Math.floor(userGrowth.length / 2)
      const recentSum = userGrowth.slice(midPoint).reduce((sum, item) => sum + (item.count || 0), 0)
      const previousSum = userGrowth.slice(0, midPoint).reduce((sum, item) => sum + (item.count || 0), 0)

      if (previousSum === 0) return recentSum > 0 ? 100 : 0
      return ((recentSum - previousSum) / previousSum) * 100
    },

    /**
     * 计算数组趋势
     */
    calculateArrayTrend(dataArray, field) {
      if (!dataArray || dataArray.length < 2) return 0

      const midPoint = Math.floor(dataArray.length / 2)
      const recentSum = dataArray.slice(midPoint).reduce((sum, item) => sum + parseFloat(item[field] || 0), 0)
      const previousSum = dataArray.slice(0, midPoint).reduce((sum, item) => sum + parseFloat(item[field] || 0), 0)

      if (previousSum === 0) return recentSum > 0 ? 100 : 0
      return ((recentSum - previousSum) / previousSum) * 100
    },
    
    /**
     * 获取进度条颜色
     */
    getProgressColor(percentage) {
      if (percentage >= 80) return 'bg-success'
      if (percentage >= 50) return 'bg-info'
      if (percentage >= 30) return 'bg-warning'
      return 'bg-danger'
    },

    // ==================== 导出方法 ====================
    
    /**
     * 导出 Excel
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

        const response = await fetch(`${API_ENDPOINTS.SYSTEM.STATISTICS_EXPORT}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        })

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
        console.error('导出Excel失败:', error)
        this.showError(`导出失败: ${error.message}`)
      } finally {
        this.exporting = false
      }
    },

    /**
     * 导出 PDF
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

        const response = await fetch(`${API_ENDPOINTS.SYSTEM.STATISTICS_EXPORT}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        })

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
        console.error('导出PDF失败:', error)
        this.showError(`导出失败: ${error.message}`)
      } finally {
        this.exporting = false
      }
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 格式化数字
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
  console.log('✅ [StatisticsPage] Alpine 组件已注册 (Mixin v3.0)')
})
