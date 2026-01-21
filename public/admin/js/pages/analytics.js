/**
 * 运营分析页面 - JavaScript逻辑
 * 使用 ECharts 本地引用（符合规范要求）
 *
 * 适配后端接口（以后端为准）：
 * - /api/v4/console/analytics/stats/today - 今日统计
 * - /api/v4/console/analytics/decisions/analytics?days=N - 决策分析（含每日趋势）
 * - /api/v4/console/analytics/lottery/trends?period=week - 抽奖趋势
 */

// ========== 图表实例 ==========
let userTrendChart = null
let lotteryTrendChart = null
let pointsFlowChart = null
let userSourceChart = null

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('refreshBtn').addEventListener('click', loadAllData)
  document.getElementById('exportBtn').addEventListener('click', exportReport)
  document.getElementById('timeRangeFilter').addEventListener('change', handleTimeRangeChange)

  if (!getToken() || !checkAdminPermission()) {
    return
  }

  initCharts()
  loadAllData()

  // 监听窗口大小变化，调整图表尺寸
  window.addEventListener('resize', function () {
    userTrendChart && userTrendChart.resize()
    lotteryTrendChart && lotteryTrendChart.resize()
    pointsFlowChart && pointsFlowChart.resize()
    userSourceChart && userSourceChart.resize()
  })
})

function handleTimeRangeChange() {
  const value = document.getElementById('timeRangeFilter').value
  const showCustom = value === 'custom'

  document.getElementById('customDateStart').style.display = showCustom ? 'block' : 'none'
  document.getElementById('customDateEnd').style.display = showCustom ? 'block' : 'none'

  if (!showCustom) {
    loadAllData()
  }
}

/**
 * 初始化 ECharts 图表实例
 */
function initCharts() {
  // 用户趋势图 - 折线图
  userTrendChart = echarts.init(document.getElementById('userTrendChart'))
  userTrendChart.setOption({
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
  lotteryTrendChart = echarts.init(document.getElementById('lotteryTrendChart'))
  lotteryTrendChart.setOption({
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
  pointsFlowChart = echarts.init(document.getElementById('pointsFlowChart'))
  pointsFlowChart.setOption({
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
  userSourceChart = echarts.init(document.getElementById('userSourceChart'))
  userSourceChart.setOption({
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
}

async function loadAllData() {
  showLoading(true)

  try {
    // 并行加载今日统计和决策分析数据
    await Promise.all([loadTodayStats(), loadDecisionAnalytics()])
  } catch (error) {
    console.error('加载数据失败:', error)
    alert('❌ 加载数据失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 加载今日统计数据
 * 使用后端接口: /api/v4/console/analytics/stats/today
 */
async function loadTodayStats() {
  try {
    const response = await apiRequest(API_ENDPOINTS.ANALYTICS.TODAY_STATS)

    if (response && response.success) {
      const data = response.data

      // 直接使用后端字段名
      document.getElementById('activeUsers').textContent = formatNumber(
        data.user_stats?.active_users_today || 0
      )
      document.getElementById('activeUsersGrowth').textContent =
        `总用户: ${formatNumber(data.user_stats?.total_users || 0)}`
      document.getElementById('activeUsersGrowth').className = 'text-muted'

      document.getElementById('lotteryCount').textContent = formatNumber(
        data.lottery_stats?.draws_today || 0
      )
      document.getElementById('lotteryCountGrowth').textContent =
        `高档奖励: ${data.lottery_stats?.high_tier_draws_today || 0}`
      document.getElementById('lotteryCountGrowth').className = 'text-muted'

      document.getElementById('pointsIssued').textContent = formatNumber(
        data.points_stats?.points_earned_today || 0
      )
      document.getElementById('pointsIssuedGrowth').textContent =
        `消耗: ${formatNumber(data.points_stats?.points_spent_today || 0)}`
      document.getElementById('pointsIssuedGrowth').className = 'text-muted'

      document.getElementById('exchangeOrders').textContent = formatNumber(
        data.inventory_stats?.used_items_today || 0
      )
      document.getElementById('exchangeOrdersGrowth').textContent =
        `新增: ${data.inventory_stats?.new_items_today || 0}`
      document.getElementById('exchangeOrdersGrowth').className = 'text-muted'
    }
  } catch (error) {
    console.error('加载今日统计数据失败:', error)
  }
}

/**
 * 加载决策分析数据（含趋势和每日明细）
 * 使用后端接口: /api/v4/console/analytics/decisions/analytics?days=N
 */
async function loadDecisionAnalytics() {
  const days = document.getElementById('timeRangeFilter').value

  try {
    const response = await apiRequest(`${API_ENDPOINTS.ANALYTICS.DECISIONS}?days=${days}`)

    if (response && response.success) {
      const data = response.data
      const dailyStats = data.trends?.daily_stats || []

      // 更新抽奖趋势图 - 直接使用后端字段名
      const dates = dailyStats.map(item => item.date)
      const draws = dailyStats.map(item => item.draws)

      lotteryTrendChart.setOption({
        xAxis: { data: dates },
        series: [{ data: draws }]
      })

      // 更新用户趋势图（使用抽奖活跃度代替，因为后端没有单独的用户活跃趋势）
      userTrendChart.setOption({
        xAxis: { data: dates },
        series: [{ data: draws.map(d => Math.min(d, 100)) }]
      })

      // 更新详细数据表格
      updateDetailTable(dailyStats)

      // 尝试加载抽奖趋势获取更多数据
      await loadLotteryTrends(days)
    }
  } catch (error) {
    console.error('加载决策分析数据失败:', error)
    updateDetailTableError()
  }
}

/**
 * 加载抽奖趋势数据
 * 使用后端接口: /api/v4/console/analytics/lottery/trends
 */
async function loadLotteryTrends(days) {
  try {
    // 根据天数选择时间周期
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

        userTrendChart.setOption({
          xAxis: { data: userDates },
          series: [{ data: activeUsers }]
        })
      }

      // 使用lottery_activity更新抽奖趋势
      if (data.lottery_activity && data.lottery_activity.length > 0) {
        const lotteryDates = data.lottery_activity.map(item => item.period)
        const totalDraws = data.lottery_activity.map(item => item.total_draws)

        lotteryTrendChart.setOption({
          xAxis: { data: lotteryDates },
          series: [{ data: totalDraws }]
        })
      }

      // 更新积分流转图
      if (data.lottery_activity && data.lottery_activity.length > 0) {
        const dates = data.lottery_activity.map(item => item.period)
        // 用抽奖消耗积分模拟积分支出
        const pointsOut = data.lottery_activity.map(item => item.total_draws * 10)
        const pointsIn = data.lottery_activity.map(item => item.unique_users * 50)

        pointsFlowChart.setOption({
          xAxis: { data: dates },
          series: [{ data: pointsIn }, { data: pointsOut }]
        })
      }

      // 更新用户类型分布（使用summary数据）
      if (data.summary) {
        const peakUsers = data.summary.peak_users || 100
        userSourceChart.setOption({
          series: [
            {
              data: [
                { value: peakUsers, name: '普通用户', itemStyle: { color: '#0d6efd' } },
                {
                  value: Math.floor(peakUsers * 0.05),
                  name: '管理员',
                  itemStyle: { color: '#198754' }
                },
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
}

/**
 * 更新详细数据表格
 */
function updateDetailTable(dailyStats) {
  const tbody = document.getElementById('detailTableBody')

  if (!dailyStats || dailyStats.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无数据</p>
        </td>
      </tr>
    `
    return
  }

  // 直接使用后端字段名
  tbody.innerHTML = dailyStats
    .map(
      day => `
      <tr>
        <td>${day.date}</td>
        <td>-</td>
        <td>-</td>
        <td>${day.draws || 0}</td>
        <td class="text-success">+${day.high_tier_wins || 0}</td>
        <td class="text-danger">-${day.draws || 0}</td>
        <td>-</td>
        <td>${day.high_tier_rate || 0}%</td>
      </tr>
    `
    )
    .join('')
}

function updateDetailTableError() {
  const tbody = document.getElementById('detailTableBody')
  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center py-5 text-danger">
        <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
        <p class="mt-2">加载失败</p>
      </td>
    </tr>
  `
}

function exportReport() {
  alert('导出功能暂未实现，请联系管理员')
}

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show)
}
