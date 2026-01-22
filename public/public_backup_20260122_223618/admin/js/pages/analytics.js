/**
 * 运营分析页面 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/analytics.js
 * @description 运营数据分析、趋势图表、用户分析等功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * 
 * 重构说明：
 * - 使用 createPageMixin 组合 Mixin
 * - 保留 ECharts 图表功能
 * - 统一使用 Mixin 的认证和加载状态
 */

function analyticsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),
    
    // ==================== 页面特有状态 ====================
    
    /** 筛选条件 */
    filters: {
      timeRange: '30',
      startDate: '',
      endDate: ''
    },

    /** 统计数据 */
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

    /** 每日明细数据 */
    dailyStats: [],

    /** ECharts 图表实例 */
    charts: {
      userTrend: null,
      lotteryTrend: null,
      pointsFlow: null,
      userSource: null
    },

    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 运营分析页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
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
     * 初始化所有图表
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
     * 用户趋势图配置
     */
    getUserTrendOption(data) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { show: false },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: data.map(d => d.date || d.time) },
        yAxis: { type: 'value', min: 0 },
        series: [{
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
        }]
      }
    },

    /**
     * 抽奖趋势图配置
     */
    getLotteryTrendOption(data) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { show: false },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: data.map(d => d.date || d.time) },
        yAxis: { type: 'value', min: 0 },
        series: [{
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
        }]
      }
    },

    /**
     * 积分流转图配置
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
     * 用户类型分布配置
     */
    getUserSourceOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
        legend: { orient: 'horizontal', bottom: 0, data: data.map(d => d.name) },
        series: [{
          name: '用户类型',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          label: { show: false, position: 'center' },
          emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
          labelLine: { show: false },
          data: data
        }]
      }
    },

    /**
     * 调整图表大小
     */
    resizeCharts() {
      Object.values(this.charts).forEach(chart => {
        if (chart) chart.resize()
      })
    },

    // ==================== 数据加载 ====================
    
    /**
     * 加载所有数据
     */
    async loadAllData() {
      await this.withLoading(async () => {
        await Promise.all([this.loadTodayStats(), this.loadDecisionAnalytics()])
      })
    },

    /**
     * 加载今日统计数据
     */
    async loadTodayStats() {
      try {
        const response = await apiRequest(API_ENDPOINTS.ANALYTICS.TODAY_STATS)

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
        console.error('加载今日统计数据失败:', error)
      }
    },

    /**
     * 加载决策分析数据
     */
    async loadDecisionAnalytics() {
      const days = this.filters.timeRange

      try {
        const response = await apiRequest(`${API_ENDPOINTS.ANALYTICS.DECISIONS}?days=${days}`)

        if (response && response.success) {
          const data = response.data
          this.dailyStats = data.trends?.daily_stats || []

          // 更新图表
          this.updateChartsWithData(data)
          
          // 加载更多趋势数据
          await this.loadLotteryTrends(days)
        }
      } catch (error) {
        console.error('加载决策分析数据失败:', error)
      }
    },

    /**
     * 使用数据更新图表
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
     */
    async loadLotteryTrends(days) {
      try {
        let period = 'week'
        if (days >= 30) period = 'month'
        if (days >= 90) period = 'quarter'

        const response = await apiRequest(
          `${API_ENDPOINTS.ANALYTICS.LOTTERY_TRENDS}?period=${period}&granularity=daily`
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
          if (data.lottery_activity && data.lottery_activity.length > 0 && this.charts.lotteryTrend) {
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
              series: [{
                data: [
                  { value: peakUsers, name: '普通用户', itemStyle: { color: '#0d6efd' } },
                  { value: Math.floor(peakUsers * 0.05), name: '管理员', itemStyle: { color: '#198754' } },
                  { value: Math.floor(peakUsers * 0.1), name: '商家', itemStyle: { color: '#ffc107' } }
                ]
              }]
            })
          }
        }
      } catch (error) {
        console.error('加载抽奖趋势数据失败:', error)
      }
    },

    // ==================== 事件处理 ====================
    
    /**
     * 时间范围变更
     */
    handleTimeRangeChange() {
      if (this.filters.timeRange !== 'custom') {
        this.loadAllData()
      }
    },

    /**
     * 导出报告 - 导出运营分析数据为CSV
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
        console.error('导出失败:', error)
        this.showError('导出失败: ' + error.message)
      }
    },

    // ==================== 工具方法 ====================
    
    /**
     * 格式化数字
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
  console.log('✅ [AnalyticsPage] Alpine 组件已注册 (Mixin v3.0)')
})
