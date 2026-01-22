/**
 * 图表可视化页面 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/charts.js
 * @description 数据可视化图表（使用 ECharts）
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 */

function chartsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createDashboardMixin(),
    
    // ==================== 页面特有状态 ====================
    
    /** 筛选条件 */
    filters: {
      period: '30' // 默认30天
    },
    
    /** ECharts 实例 */
    charts: {
      userGrowth: null,
      activeUsers: null,
      lotteryStats: null,
      revenueStats: null
    },

    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 图表可视化页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }
      
      // 初始化图表
      this.$nextTick(() => {
        this.initCharts()
        this.loadAllCharts()
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
          this.resizeCharts()
        })
      })
    },

    // ==================== 图表初始化 ====================
    
    /**
     * 初始化所有图表实例
     */
    initCharts() {
      if (typeof echarts === 'undefined') {
        console.error('ECharts 库未加载')
        return
      }
      
      // 用户增长趋势图
      const userGrowthEl = document.getElementById('userGrowthChart')
      if (userGrowthEl) {
        this.charts.userGrowth = echarts.init(userGrowthEl)
      }
      
      // 活跃用户分布图
      const activeUsersEl = document.getElementById('activeUsersChart')
      if (activeUsersEl) {
        this.charts.activeUsers = echarts.init(activeUsersEl)
      }
      
      // 抽奖统计图
      const lotteryStatsEl = document.getElementById('lotteryStatsChart')
      if (lotteryStatsEl) {
        this.charts.lotteryStats = echarts.init(lotteryStatsEl)
      }
      
      // 收入统计图
      const revenueStatsEl = document.getElementById('revenueStatsChart')
      if (revenueStatsEl) {
        this.charts.revenueStats = echarts.init(revenueStatsEl)
      }
    },

    /**
     * 调整图表大小
     */
    resizeCharts() {
      Object.values(this.charts).forEach(chart => {
        if (chart) {
          chart.resize()
        }
      })
    },

    // ==================== 数据加载 ====================
    
    /**
     * 加载所有图表数据
     */
    async loadAllCharts() {
      await this.withLoading(async () => {
        await Promise.all([
          this.loadUserGrowthChart(),
          this.loadActiveUsersChart(),
          this.loadLotteryStatsChart(),
          this.loadRevenueStatsChart()
        ])
      }, '加载图表数据...')
    },

    /**
     * 加载用户增长趋势图数据
     */
    async loadUserGrowthChart() {
      try {
        const response = await apiRequest(
          `${API_ENDPOINTS.STATS.USER_GROWTH}?days=${this.filters.period}`
        )
        
        if (response && response.success && this.charts.userGrowth) {
          const data = response.data || {}
          this.renderUserGrowthChart(data)
        }
      } catch (error) {
        console.error('加载用户增长数据失败:', error)
      }
    },

    /**
     * 加载活跃用户分布图数据
     */
    async loadActiveUsersChart() {
      try {
        const response = await apiRequest(
          `${API_ENDPOINTS.STATS.ACTIVE_USERS}?days=${this.filters.period}`
        )
        
        if (response && response.success && this.charts.activeUsers) {
          const data = response.data || {}
          this.renderActiveUsersChart(data)
        }
      } catch (error) {
        console.error('加载活跃用户数据失败:', error)
      }
    },

    /**
     * 加载抽奖统计图数据
     */
    async loadLotteryStatsChart() {
      try {
        const response = await apiRequest(
          `${API_ENDPOINTS.STATS.LOTTERY}?days=${this.filters.period}`
        )
        
        if (response && response.success && this.charts.lotteryStats) {
          const data = response.data || {}
          this.renderLotteryStatsChart(data)
        }
      } catch (error) {
        console.error('加载抽奖统计数据失败:', error)
      }
    },

    /**
     * 加载收入统计图数据
     */
    async loadRevenueStatsChart() {
      try {
        const response = await apiRequest(
          `${API_ENDPOINTS.STATS.REVENUE}?days=${this.filters.period}`
        )
        
        if (response && response.success && this.charts.revenueStats) {
          const data = response.data || {}
          this.renderRevenueStatsChart(data)
        }
      } catch (error) {
        console.error('加载收入统计数据失败:', error)
      }
    },

    // ==================== 图表渲染 ====================
    
    /**
     * 渲染用户增长趋势图
     */
    renderUserGrowthChart(data) {
      const dates = data.dates || []
      const newUsers = data.new_users || []
      const totalUsers = data.total_users || []
      
      const option = {
        title: { text: '用户增长趋势', left: 'center' },
        tooltip: { trigger: 'axis' },
        legend: { data: ['新增用户', '累计用户'], bottom: 10 },
        xAxis: { type: 'category', data: dates },
        yAxis: [
          { type: 'value', name: '新增用户' },
          { type: 'value', name: '累计用户' }
        ],
        series: [
          {
            name: '新增用户',
            type: 'bar',
            data: newUsers,
            itemStyle: { color: '#5470c6' }
          },
          {
            name: '累计用户',
            type: 'line',
            yAxisIndex: 1,
            data: totalUsers,
            itemStyle: { color: '#91cc75' }
          }
        ]
      }
      
      this.charts.userGrowth.setOption(option)
    },

    /**
     * 渲染活跃用户分布图
     */
    renderActiveUsersChart(data) {
      const distribution = data.distribution || []
      
      const option = {
        title: { text: '活跃用户分布', left: 'center' },
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left' },
        series: [
          {
            name: '用户分布',
            type: 'pie',
            radius: '50%',
            data: distribution.map(item => ({
              name: item.name,
              value: item.count
            })),
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }
        ]
      }
      
      this.charts.activeUsers.setOption(option)
    },

    /**
     * 渲染抽奖统计图
     */
    renderLotteryStatsChart(data) {
      const dates = data.dates || []
      const lotteryCount = data.lottery_count || []
      const winCount = data.win_count || []
      
      const option = {
        title: { text: '抽奖统计', left: 'center' },
        tooltip: { trigger: 'axis' },
        legend: { data: ['抽奖次数', '中奖次数'], bottom: 10 },
        xAxis: { type: 'category', data: dates },
        yAxis: { type: 'value' },
        series: [
          {
            name: '抽奖次数',
            type: 'line',
            data: lotteryCount,
            smooth: true,
            itemStyle: { color: '#fac858' }
          },
          {
            name: '中奖次数',
            type: 'line',
            data: winCount,
            smooth: true,
            itemStyle: { color: '#ee6666' }
          }
        ]
      }
      
      this.charts.lotteryStats.setOption(option)
    },

    /**
     * 渲染收入统计图
     */
    renderRevenueStatsChart(data) {
      const dates = data.dates || []
      const revenue = data.revenue || []
      
      const option = {
        title: { text: '收入统计', left: 'center' },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const p = params[0]
            return `${p.name}<br/>收入: ¥${p.value.toLocaleString()}`
          }
        },
        xAxis: { type: 'category', data: dates },
        yAxis: {
          type: 'value',
          axisLabel: {
            formatter: (value) => {
              if (value >= 10000) return (value / 10000) + '万'
              return value
            }
          }
        },
        series: [
          {
            name: '收入',
            type: 'bar',
            data: revenue,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#83bff6' },
                { offset: 0.5, color: '#188df0' },
                { offset: 1, color: '#188df0' }
              ])
            }
          }
        ]
      }
      
      this.charts.revenueStats.setOption(option)
    },

    // ==================== 事件处理 ====================
    
    /**
     * 周期筛选变化
     */
    handlePeriodChange() {
      this.loadAllCharts()
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('chartsPage', chartsPage)
  console.log('✅ [ChartsPage] Alpine 组件已注册 (Mixin v3.0)')
})
