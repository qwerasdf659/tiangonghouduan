/**
 * 仪表盘页面 - JavaScript逻辑
 * 使用 ECharts 本地引用（符合规范要求）
 *
 * 依赖：
 * - /admin/js/lib/echarts.min.js (ECharts图表库)
 * - /admin/js/admin-common.js (apiRequest, getToken, getCurrentUser, formatNumber, handleApiError, logout, checkAdminPermission)
 */

// ========== 图表实例 ==========
let lotteryTrendChart = null
let todayDistributionChart = null

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  displayUserInfo()

  // 退出登录按钮
  const logoutBtn = document.getElementById('logoutBtn')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout)
  }

  // 检查权限并加载数据
  if (getToken() && checkAdminPermission()) {
    initCharts()
    loadDashboardData()
    loadTrendData()
    // 每分钟刷新一次数据
    setInterval(() => {
      loadDashboardData()
      loadTrendData()
    }, 60000)
  }

  // 监听窗口大小变化
  window.addEventListener('resize', function () {
    lotteryTrendChart && lotteryTrendChart.resize()
    todayDistributionChart && todayDistributionChart.resize()
  })
})

/**
 * 初始化 ECharts 图表实例
 */
function initCharts() {
  // 抽奖趋势图
  const trendContainer = document.getElementById('lotteryTrendChart')
  if (trendContainer) {
    lotteryTrendChart = echarts.init(trendContainer)
    lotteryTrendChart.setOption({
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
  const distContainer = document.getElementById('todayDistributionChart')
  if (distContainer) {
    todayDistributionChart = echarts.init(distContainer)
    todayDistributionChart.setOption({
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
}

/**
 * 显示用户信息
 */
function displayUserInfo() {
  const userInfo = getCurrentUser()
  const welcomeText = document.getElementById('welcomeText')

  if (userInfo && userInfo.nickname && welcomeText) {
    welcomeText.textContent = `欢迎，${userInfo.nickname}`
  }
}

/**
 * 加载仪表盘数据
 * 使用现有管理API：/api/v4/console/system/dashboard
 */
async function loadDashboardData() {
  try {
    const response = await apiRequest(API_ENDPOINTS.SYSTEM.DASHBOARD)

    if (response && response.success && response.data) {
      const data = response.data

      // 适配后端V4数据结构 - 总用户数据
      if (data.overview) {
        updateElementText('totalUsers', formatNumber(data.overview.total_users || 0))
      }

      // 适配后端V4.0数据结构 - 今日数据
      if (data.today) {
        updateElementText('todayNewUsers', data.today.new_users || 0)
        updateElementText('todayDraws', formatNumber(data.today.lottery_draws || 0))
        updateElementText(
          'todayWins',
          formatNumber(data.today.high_tier_wins || data.today.wins || 0)
        )
        updateElementText('winRate', (data.today.high_tier_rate || data.today.win_rate || 0) + '%')
        updateElementText('points', formatNumber(data.today.points_consumed || 0))

        // 更新今日分布饼图
        if (todayDistributionChart) {
          todayDistributionChart.setOption({
            series: [
              {
                data: [
                  {
                    value: data.today.lottery_draws || 0,
                    name: '抽奖',
                    itemStyle: { color: '#0d6efd' }
                  },
                  {
                    value: data.today.high_tier_wins || data.today.wins || 0,
                    name: '中奖',
                    itemStyle: { color: '#198754' }
                  },
                  {
                    value: Math.floor((data.today.points_consumed || 0) / 10),
                    name: '积分消耗',
                    itemStyle: { color: '#ffc107' }
                  }
                ]
              }
            ]
          })
        }
      }

      // 适配后端V4数据结构 - 客服会话数据
      if (data.customer_service) {
        updateElementText('sessions', formatNumber(data.customer_service.today_sessions || 0))
        updateElementText('messages', formatNumber(data.customer_service.today_messages || 0))
      }

      console.log('✅ 仪表盘数据加载成功')
    } else {
      console.warn('⚠️ 仪表盘API返回数据格式异常:', response)
    }
  } catch (error) {
    console.error('❌ 加载仪表盘数据失败:', error)
    handleApiError(error, '加载仪表盘数据')
  }
}

/**
 * 加载趋势数据（7日抽奖趋势）
 */
async function loadTrendData() {
  try {
    const response = await apiRequest(`${API_ENDPOINTS.SYSTEM.DASHBOARD_TRENDS}?days=7`)

    if (response && response.success && response.data) {
      const dailyStats = response.data.trends?.daily_stats || []

      if (dailyStats.length > 0 && lotteryTrendChart) {
        const dates = dailyStats.map(item => item.date)
        const draws = dailyStats.map(item => item.draws || 0)
        const wins = dailyStats.map(item => item.high_tier_wins || 0)

        lotteryTrendChart.setOption({
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

/**
 * 安全更新DOM元素文本
 * @param {string} elementId - 元素ID
 * @param {string|number} text - 要显示的文本
 */
function updateElementText(elementId, text) {
  const element = document.getElementById(elementId)
  if (element) {
    element.textContent = text
  }
}
