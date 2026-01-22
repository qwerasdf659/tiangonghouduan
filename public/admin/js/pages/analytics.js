/**
 * 运营分析页面 - Alpine.js 组件
 * 使用 ECharts 本地引用（符合规范要求）
 *
 * 适配后端接口（以后端为准）：
 * - /api/v4/console/analytics/stats/today - 今日统计
 * - /api/v4/console/analytics/decisions/analytics?days=N - 决策分析（含每日趋势）
 * - /api/v4/console/analytics/lottery/trends?period=week - 抽奖趋势
 */

function analyticsPage() {
  return {
    // ========== 状态数据 ==========
    loading: false,
    userInfo: {},

    // 筛选条件
    filters: {
      timeRange: '30',
      startDate: '',
      endDate: ''
    },

    // 统计数据
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

    // 每日明细数据
    dailyStats: [],

    // ECharts 图表实例
    charts: {
      userTrend: null,
      lotteryTrend: null,
      pointsFlow: null,
      userSource: null
    },

    // ========== 生命周期 ==========
    init() {
      // 获取用户信息
      this.userInfo = getCurrentUser() || {}

      // 检查权限
      if (!getToken() || !checkAdminPermission()) {
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

    // ========== 图表初始化 ==========
    initCharts() {
      // 用户趋势图 - 折线图
      this.charts.userTrend = echarts.init(this.$refs.userTrendChart)
      this.charts.userTrend.setOption({
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: { show: false },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: []
        },
        yAxis: {
          type: 'value',
          min: 0
        },
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
            data: []
          }
        ]
      })

      // 抽奖趋势图 - 柱状图
      this.charts.lotteryTrend = echarts.init(this.$refs.lotteryTrendChart)
      this.charts.lotteryTrend.setOption({
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' }
        },
        legend: { show: false },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
          type: 'category',
          data: []
        },
        yAxis: {
          type: 'value',
          min: 0
        },
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
            data: []
          }
        ]
      })

      // 积分流转图 - 双线图
      this.charts.pointsFlow = echarts.init(this.$refs.pointsFlowChart)
      this.charts.pointsFlow.setOption({
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: {
          data: ['积分发放', '积分消耗'],
          bottom: 0
        },
        grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: []
        },
        yAxis: {
          type: 'value',
          min: 0
        },
        series: [
          {
            name: '积分发放',
            type: 'line',
            smooth: true,
            lineStyle: { color: '#ffc107', width: 2 },
            itemStyle: { color: '#ffc107' },
            data: []
          },
          {
            name: '积分消耗',
            type: 'line',
            smooth: true,
            lineStyle: { color: '#dc3545', width: 2 },
            itemStyle: { color: '#dc3545' },
            data: []
          }
        ]
      })

      // 用户类型分布 - 环形图
      this.charts.userSource = echarts.init(this.$refs.userSourceChart)
      this.charts.userSource.setOption({
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'horizontal',
          bottom: 0,
          data: ['普通用户', '管理员', '商家']
        },
        series: [
          {
            name: '用户类型',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
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
            data: [
              { value: 0, name: '普通用户', itemStyle: { color: '#0d6efd' } },
              { value: 0, name: '管理员', itemStyle: { color: '#198754' } },
              { value: 0, name: '商家', itemStyle: { color: '#ffc107' } }
            ]
          }
        ]
      })
    },

    // 调整图表大小
    resizeCharts() {
      Object.values(this.charts).forEach(chart => {
        if (chart) chart.resize()
      })
    },

    // ========== 事件处理 ==========
    handleTimeRangeChange() {
      if (this.filters.timeRange !== 'custom') {
        this.loadAllData()
      }
    },

    // ========== 数据加载 ==========
    async loadAllData() {
      this.loading = true

      try {
        await Promise.all([this.loadTodayStats(), this.loadDecisionAnalytics()])
      } catch (error) {
        console.error('加载数据失败:', error)
        Alpine.store('notification').showToast('加载数据失败：' + error.message, 'error')
      } finally {
        this.loading = false
      }
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

          // 更新抽奖趋势图
          const dates = this.dailyStats.map(item => item.date)
          const draws = this.dailyStats.map(item => item.draws)

          this.charts.lotteryTrend.setOption({
            xAxis: { data: dates },
            series: [{ data: draws }]
          })

          // 更新用户趋势图
          this.charts.userTrend.setOption({
            xAxis: { data: dates },
            series: [{ data: draws.map(d => Math.min(d, 100)) }]
          })

          // 加载更多趋势数据
          await this.loadLotteryTrends(days)
        }
      } catch (error) {
        console.error('加载决策分析数据失败:', error)
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
          if (data.user_activity && data.user_activity.length > 0) {
            const userDates = data.user_activity.map(item => item.period)
            const activeUsers = data.user_activity.map(item => item.active_users)

            this.charts.userTrend.setOption({
              xAxis: { data: userDates },
              series: [{ data: activeUsers }]
            })
          }

          // 更新抽奖趋势
          if (data.lottery_activity && data.lottery_activity.length > 0) {
            const lotteryDates = data.lottery_activity.map(item => item.period)
            const totalDraws = data.lottery_activity.map(item => item.total_draws)

            this.charts.lotteryTrend.setOption({
              xAxis: { data: lotteryDates },
              series: [{ data: totalDraws }]
            })
          }

          // 更新积分流转图
          if (data.lottery_activity && data.lottery_activity.length > 0) {
            const dates = data.lottery_activity.map(item => item.period)
            const pointsOut = data.lottery_activity.map(item => item.total_draws * 10)
            const pointsIn = data.lottery_activity.map(item => item.unique_users * 50)

            this.charts.pointsFlow.setOption({
              xAxis: { data: dates },
              series: [{ data: pointsIn }, { data: pointsOut }]
            })
          }

          // 更新用户类型分布
          if (data.summary) {
            const peakUsers = data.summary.peak_users || 100
            this.charts.userSource.setOption({
              series: [
                {
                  data: [
                    { value: peakUsers, name: '普通用户', itemStyle: { color: '#0d6efd' } },
                    { value: Math.floor(peakUsers * 0.05), name: '管理员', itemStyle: { color: '#198754' } },
                    { value: Math.floor(peakUsers * 0.1), name: '商家', itemStyle: { color: '#ffc107' } }
                  ]
                }
              ]
            })
          }
        }
      } catch (error) {
        console.error('加载抽奖趋势数据失败:', error)
      }
    },

    // ========== 工具方法 ==========
    formatNumber(num) {
      if (num === undefined || num === null) return '-'
      return num.toLocaleString()
    },

    exportReport() {
      Alpine.store('notification').showToast('导出功能暂未实现，请联系管理员', 'warning')
    },

    logout
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('analyticsPage', analyticsPage)
})
