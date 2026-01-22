/**
 * 仪表盘页面 - Alpine.js CSP 版本
 * 使用 ECharts 本地引用（符合规范要求）
 * 
 * 注意：使用 Alpine.data() 注册组件以兼容 CSP 策略
 */

function dashboardPage() {
  return {
    // ========== 状态 ==========
    userInfo: null,
    refreshInterval: null,
    
    // 统计数据
    stats: {
      totalUsers: 0,
      todayNewUsers: 0,
      todayDraws: 0,
      todayWins: 0,
      winRate: 0,
      pointsConsumed: 0,
      sessions: 0,
      messages: 0
    },
    
    // ECharts 实例
    trendChart: null,
    distributionChart: null,
    
    // ========== 初始化 ==========
    init() {
      // 获取当前用户信息
      this.userInfo = this.getCurrentUser()
      
      // 权限验证
      if (!this.getToken() || !this.checkAdminPermission()) {
        return
      }
      
      // 初始化图表
      this.$nextTick(() => {
        this.initCharts()
        this.loadDashboardData()
        this.loadTrendData()
        
        // 每分钟刷新一次数据
        this.refreshInterval = setInterval(() => {
          this.loadDashboardData()
          this.loadTrendData()
        }, 60000)
      })
      
      // 监听窗口大小变化
      window.addEventListener('resize', () => {
        this.trendChart?.resize()
        this.distributionChart?.resize()
      })
    },
    
    // ========== 辅助方法 ==========
    getToken() {
      return localStorage.getItem('admin_token')
    },
    
    getCurrentUser() {
      try {
        const userStr = localStorage.getItem('admin_user')
        return userStr ? JSON.parse(userStr) : null
      } catch {
        return null
      }
    },
    
    checkAdminPermission() {
      const user = this.userInfo
      if (!user) {
        window.location.href = '/admin/login.html'
        return false
      }
      if (user.role_level >= 100) return true
      if (user.roles?.some(role => role.role_level >= 100)) return true
      
      alert('权限不足，请使用管理员账号登录')
      window.location.href = '/admin/login.html'
      return false
    },
    
    logout() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval)
      }
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login.html'
    },
    
    formatNumber(num) {
      if (num === null || num === undefined || num === '-') return '-'
      return Number(num).toLocaleString()
    },
    
    // ========== API 请求封装 ==========
    async apiRequest(url) {
      const token = this.getToken()
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      return await response.json()
    },
    
    // ========== 初始化 ECharts 图表 ==========
    initCharts() {
      // 抽奖趋势图
      const trendContainer = this.$refs.trendChart || document.getElementById('lotteryTrendChart')
      if (trendContainer && typeof echarts !== 'undefined') {
        this.trendChart = echarts.init(trendContainer)
        this.trendChart.setOption({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
          },
          legend: {
            data: ['抽奖次数', '中奖次数'],
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
              name: '抽奖次数',
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
            },
            {
              name: '中奖次数',
              type: 'line',
              smooth: true,
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(25, 135, 84, 0.3)' },
                  { offset: 1, color: 'rgba(25, 135, 84, 0.05)' }
                ])
              },
              lineStyle: { color: '#198754', width: 2 },
              itemStyle: { color: '#198754' },
              data: []
            }
          ]
        })
      }
      
      // 今日数据分布饼图
      const distContainer = this.$refs.distributionChart || document.getElementById('todayDistributionChart')
      if (distContainer && typeof echarts !== 'undefined') {
        this.distributionChart = echarts.init(distContainer)
        this.distributionChart.setOption({
          tooltip: {
            trigger: 'item',
            formatter: '{a} <br/>{b}: {c} ({d}%)'
          },
          legend: {
            orient: 'horizontal',
            bottom: 0,
            data: ['抽奖', '中奖', '积分消耗']
          },
          series: [
            {
              name: '今日数据',
              type: 'pie',
              radius: ['35%', '65%'],
              avoidLabelOverlap: false,
              label: { show: false, position: 'center' },
              emphasis: {
                label: { show: true, fontSize: 14, fontWeight: 'bold' }
              },
              labelLine: { show: false },
              data: [
                { value: 0, name: '抽奖', itemStyle: { color: '#0d6efd' } },
                { value: 0, name: '中奖', itemStyle: { color: '#198754' } },
                { value: 0, name: '积分消耗', itemStyle: { color: '#ffc107' } }
              ]
            }
          ]
        })
      }
    },
    
    // ========== 加载仪表盘数据 ==========
    async loadDashboardData() {
      try {
        const response = await this.apiRequest(API_ENDPOINTS.SYSTEM.DASHBOARD)
        
        if (response?.success && response.data) {
          const data = response.data
          
          // 适配后端V4数据结构 - 总用户数据
          if (data.overview) {
            this.stats.totalUsers = data.overview.total_users || 0
          }
          
          // 适配后端V4.0数据结构 - 今日数据
          if (data.today) {
            this.stats.todayNewUsers = data.today.new_users || 0
            this.stats.todayDraws = data.today.lottery_draws || 0
            this.stats.todayWins = data.today.high_tier_wins || data.today.wins || 0
            this.stats.winRate = data.today.high_tier_rate || data.today.win_rate || 0
            this.stats.pointsConsumed = data.today.points_consumed || 0
            
            // 更新今日分布饼图
            if (this.distributionChart) {
              this.distributionChart.setOption({
                series: [{
                  data: [
                    { value: data.today.lottery_draws || 0, name: '抽奖', itemStyle: { color: '#0d6efd' } },
                    { value: data.today.high_tier_wins || data.today.wins || 0, name: '中奖', itemStyle: { color: '#198754' } },
                    { value: Math.floor((data.today.points_consumed || 0) / 10), name: '积分消耗', itemStyle: { color: '#ffc107' } }
                  ]
                }]
              })
            }
          }
          
          // 适配后端V4数据结构 - 客服会话数据
          if (data.customer_service) {
            this.stats.sessions = data.customer_service.today_sessions || 0
            this.stats.messages = data.customer_service.today_messages || 0
          }
          
          console.log('✅ 仪表盘数据加载成功')
        } else {
          console.warn('⚠️ 仪表盘API返回数据格式异常:', response)
        }
      } catch (error) {
        console.error('❌ 加载仪表盘数据失败:', error)
      }
    },
    
    // ========== 加载趋势数据（7日抽奖趋势）==========
    async loadTrendData() {
      try {
        const response = await this.apiRequest(`${API_ENDPOINTS.SYSTEM.DASHBOARD_TRENDS}?days=7`)
        
        if (response?.success && response.data) {
          const dailyStats = response.data.trends?.daily_stats || []
          
          if (dailyStats.length > 0 && this.trendChart) {
            const dates = dailyStats.map(item => item.date)
            const draws = dailyStats.map(item => item.draws || 0)
            const wins = dailyStats.map(item => item.high_tier_wins || 0)
            
            this.trendChart.setOption({
              xAxis: { data: dates },
              series: [{ data: draws }, { data: wins }]
            })
            
            console.log('✅ 趋势数据加载成功')
          }
        }
      } catch (error) {
        console.error('❌ 加载趋势数据失败:', error)
        // 趋势数据加载失败不影响主要功能，只记录日志
      }
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('dashboardPage', dashboardPage)
  console.log('✅ [DashboardPage] Alpine 组件已注册')
})
