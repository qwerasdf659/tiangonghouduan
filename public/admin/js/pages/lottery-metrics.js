/**
 * 抽奖监控页面 - Alpine.js 组件
 * 从内联脚本提取并迁移
 */

function lotteryMetricsPage() {
  return {
    // ========== 状态数据 ==========
    welcomeText: '管理员',
    loadingOverlay: false,
    lastUpdate: '实时更新',
    
    // 筛选条件
    campaignId: '',
    timeRange: 'today',
    startDate: '',
    endDate: '',
    showCustomDateRange: false,
    
    // 活动列表
    campaigns: [],
    
    // 核心指标
    metrics: {
      totalDraws: '-',
      totalWins: '-',
      winRate: '-',
      totalValue: '-',
      drawsTrend: null,
      winsTrend: null,
      rateTrend: null,
      valueTrend: null
    },
    
    // 实时记录
    realtimeRecords: [],
    
    // 奖品统计
    prizeStats: [],
    
    // ECharts 实例
    trendChart: null,
    prizeDistChart: null,
    
    // 定时器
    refreshTimer: null,

    // ========== 初始化 ==========
    init() {
      // 获取用户信息
      const userInfo = getCurrentUser()
      if (userInfo && userInfo.nickname) {
        this.welcomeText = userInfo.nickname
      }
      
      // 初始化图表
      this.$nextTick(() => {
        this.initCharts()
        this.loadCampaigns()
        this.loadMetrics()
        
        // 自动刷新（每30秒）
        this.refreshTimer = setInterval(() => {
          this.loadMetrics()
          this.updateLastTime()
        }, 30000)
      })
      
      // 窗口大小变化时重新调整图表
      window.addEventListener('resize', () => {
        if (this.trendChart) this.trendChart.resize()
        if (this.prizeDistChart) this.prizeDistChart.resize()
      })
    },

    // ========== 图表初始化 ==========
    initCharts() {
      const trendChartDom = document.getElementById('trendChart')
      const prizeDistChartDom = document.getElementById('prizeDistChart')
      
      if (trendChartDom && typeof echarts !== 'undefined') {
        this.trendChart = echarts.init(trendChartDom)
      }
      if (prizeDistChartDom && typeof echarts !== 'undefined') {
        this.prizeDistChart = echarts.init(prizeDistChartDom)
      }
    },

    // ========== 数据加载 ==========
    async loadCampaigns() {
      try {
        const response = await apiRequest(API_ENDPOINTS.CAMPAIGN.LIST)
        if (response && response.success) {
          this.campaigns = response.data.campaigns || response.data || []
        }
      } catch (error) {
        console.error('加载活动失败:', error)
      }
    },

    async loadMetrics() {
      this.loadingOverlay = true
      try {
        const params = new URLSearchParams()
        if (this.campaignId) params.append('campaign_id', this.campaignId)
        params.append('time_range', this.timeRange)

        if (this.timeRange === 'custom') {
          params.append('start_date', this.startDate)
          params.append('end_date', this.endDate)
        }

        const url = API_ENDPOINTS.LOTTERY_MONITORING.STATS + '?' + params.toString()
        const response = await apiRequest(url)

        if (response && response.success) {
          const data = response.data
          this.updateMetricCards(data.summary || data)
          this.updateTrendChart(data.trend || [])
          this.updatePrizeDistChart(data.prize_distribution || [])
          this.realtimeRecords = data.recent_draws || []
          this.prizeStats = data.prize_stats || []
        } else {
          // 使用模拟数据
          this.updateWithMockData()
        }
      } catch (error) {
        console.error('加载监控数据失败:', error)
        this.updateWithMockData()
      } finally {
        this.loadingOverlay = false
        this.updateLastTime()
      }
    },

    updateWithMockData() {
      this.updateMetricCards({
        total_draws: 1234,
        total_wins: 456,
        win_rate: 36.9,
        total_value: 12580,
        draws_trend: 12.5,
        wins_trend: 8.2,
        rate_trend: -2.1,
        value_trend: 15.6
      })

      this.updateTrendChart([
        { time: '00:00', draws: 45, wins: 15 },
        { time: '04:00', draws: 23, wins: 8 },
        { time: '08:00', draws: 89, wins: 32 },
        { time: '12:00', draws: 156, wins: 58 },
        { time: '16:00', draws: 234, wins: 89 },
        { time: '20:00', draws: 312, wins: 118 },
        { time: '24:00', draws: 375, wins: 136 }
      ])

      this.updatePrizeDistChart([
        { name: '一等奖', value: 5 },
        { name: '二等奖', value: 25 },
        { name: '三等奖', value: 80 },
        { name: '参与奖', value: 346 },
        { name: '谢谢参与', value: 778 }
      ])

      this.realtimeRecords = [
        { time: '刚刚', user: '用户***1234', campaign: '新春抽奖', result: '二等奖', is_win: true },
        { time: '1分钟前', user: '用户***5678', campaign: '新春抽奖', result: '谢谢参与', is_win: false },
        { time: '2分钟前', user: '用户***9012', campaign: '会员福利', result: '三等奖', is_win: true }
      ]

      this.prizeStats = [
        { name: '一等奖-iPhone', issued: 5, stock: 95, rate: 5 },
        { name: '二等奖-耳机', issued: 25, stock: 175, rate: 12.5 },
        { name: '三等奖-优惠券', issued: 80, stock: 420, rate: 16 }
      ]
    },

    // ========== 更新方法 ==========
    updateMetricCards(data) {
      this.metrics.totalDraws = this.formatNumber(data.total_draws || 0)
      this.metrics.totalWins = this.formatNumber(data.total_wins || 0)
      const winRate = parseFloat(data.win_rate) || 0
      this.metrics.winRate = winRate.toFixed(1) + '%'
      this.metrics.totalValue = '¥' + this.formatNumber(data.total_value || 0)

      this.metrics.drawsTrend = data.draws_trend
      this.metrics.winsTrend = data.wins_trend
      this.metrics.rateTrend = data.rate_trend
      this.metrics.valueTrend = data.value_trend
    },

    updateTrendChart(data) {
      if (!this.trendChart) return
      
      const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['抽奖次数', '中奖次数'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
        xAxis: {
          type: 'category',
          data: data.map(d => d.time || d.hour || d.date)
        },
        yAxis: { type: 'value' },
        series: [
          {
            name: '抽奖次数',
            type: 'line',
            smooth: true,
            data: data.map(d => d.draws || d.draw_count || 0),
            areaStyle: { opacity: 0.3 },
            itemStyle: { color: '#0d6efd' }
          },
          {
            name: '中奖次数',
            type: 'line',
            smooth: true,
            data: data.map(d => d.wins || d.win_count || 0),
            areaStyle: { opacity: 0.3 },
            itemStyle: { color: '#198754' }
          }
        ]
      }
      this.trendChart.setOption(option)
    },

    updatePrizeDistChart(data) {
      if (!this.prizeDistChart) return
      
      const option = {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
          data: data.map(d => ({
            name: d.name || d.prize_name,
            value: d.value || d.count
          }))
        }]
      }
      this.prizeDistChart.setOption(option)
    },

    // ========== 辅助方法 ==========
    onTimeRangeChange() {
      this.showCustomDateRange = this.timeRange === 'custom'
    },

    getTrendHtml(value) {
      if (value === undefined || value === null) {
        return '-'
      }
      const numValue = parseFloat(value) || 0
      const isUp = numValue >= 0
      const className = isUp ? 'trend-up' : 'trend-down'
      const icon = isUp ? 'up' : 'down'
      return `<span class="${className}"><i class="bi bi-arrow-${icon}"></i> ${Math.abs(numValue).toFixed(1)}%</span> <span class="text-muted">较昨日</span>`
    },

    getRecordTime(record) {
      return record.time || this.formatTime(record.created_at)
    },

    getRecordUser(record) {
      return record.user || record.user_name || '-'
    },

    getRecordCampaign(record) {
      return record.campaign || record.campaign_name || '-'
    },

    getRecordResult(record) {
      return record.result || record.prize_name || '谢谢参与'
    },

    getPrizeName(prize) {
      return prize.name || prize.prize_name || '-'
    },

    getPrizeIssued(prize) {
      return prize.issued || prize.issued_count || 0
    },

    getPrizeStock(prize) {
      return prize.stock || prize.remaining || 0
    },

    getPrizeRate(prize) {
      return prize.rate || 0
    },

    getProgressBarClass(rate) {
      if (rate >= 80) return 'bg-danger'
      if (rate >= 50) return 'bg-warning'
      return 'bg-success'
    },

    updateLastTime() {
      this.lastUpdate = '更新于 ' + new Date().toLocaleTimeString('zh-CN')
    },

    formatNumber(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    },

    formatTime(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      return date.toLocaleTimeString('zh-CN')
    },

    // ========== 通用方法 ==========
    handleLogout() {
      logout()
    },

    // 页面销毁时清理定时器
    destroy() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer)
      }
      if (this.trendChart) {
        this.trendChart.dispose()
      }
      if (this.prizeDistChart) {
        this.prizeDistChart.dispose()
      }
    }
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('lotteryMetricsPage', lotteryMetricsPage)
})



