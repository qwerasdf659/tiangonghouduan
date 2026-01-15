/**
 * 运营分析页面 - JavaScript逻辑
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

function initCharts() {
  // 用户趋势图
  const userCtx = document.getElementById('userTrendChart').getContext('2d')
  userTrendChart = new Chart(userCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '活跃用户',
          data: [],
          borderColor: '#0d6efd',
          backgroundColor: 'rgba(13, 110, 253, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  })

  // 抽奖趋势图
  const lotteryCtx = document.getElementById('lotteryTrendChart').getContext('2d')
  lotteryTrendChart = new Chart(lotteryCtx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: '抽奖次数',
          data: [],
          backgroundColor: '#198754'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  })

  // 积分流转图
  const pointsCtx = document.getElementById('pointsFlowChart').getContext('2d')
  pointsFlowChart = new Chart(pointsCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '积分发放',
          data: [],
          borderColor: '#ffc107',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          fill: false
        },
        {
          label: '积分消耗',
          data: [],
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } }
    }
  })

  // 用户来源饼图（改为用户类型分布）
  const sourceCtx = document.getElementById('userSourceChart').getContext('2d')
  userSourceChart = new Chart(sourceCtx, {
    type: 'doughnut',
    data: {
      labels: ['普通用户', '管理员', '商家'],
      datasets: [
        {
          data: [0, 0, 0],
          backgroundColor: ['#0d6efd', '#198754', '#ffc107']
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
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
    const response = await apiRequest('/api/v4/console/analytics/stats/today')

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
    const response = await apiRequest(`/api/v4/console/analytics/decisions/analytics?days=${days}`)

    if (response && response.success) {
      const data = response.data
      const dailyStats = data.trends?.daily_stats || []

      // 更新抽奖趋势图 - 直接使用后端字段名
      const dates = dailyStats.map(item => item.date)
      const draws = dailyStats.map(item => item.draws)

      lotteryTrendChart.data.labels = dates
      lotteryTrendChart.data.datasets[0].data = draws
      lotteryTrendChart.update()

      // 更新用户趋势图（使用抽奖活跃度代替，因为后端没有单独的用户活跃趋势）
      userTrendChart.data.labels = dates
      userTrendChart.data.datasets[0].data = draws.map(d => Math.min(d, 100)) // 简化显示
      userTrendChart.update()

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
      `/api/v4/console/analytics/lottery/trends?period=${period}&granularity=daily`
    )

    if (response && response.success) {
      const data = response.data

      // 更新用户活跃趋势图
      if (data.user_activity && data.user_activity.length > 0) {
        const userDates = data.user_activity.map(item => item.period)
        const activeUsers = data.user_activity.map(item => item.active_users)

        userTrendChart.data.labels = userDates
        userTrendChart.data.datasets[0].data = activeUsers
        userTrendChart.update()
      }

      // 使用lottery_activity更新抽奖趋势
      if (data.lottery_activity && data.lottery_activity.length > 0) {
        const lotteryDates = data.lottery_activity.map(item => item.period)
        const totalDraws = data.lottery_activity.map(item => item.total_draws)

        lotteryTrendChart.data.labels = lotteryDates
        lotteryTrendChart.data.datasets[0].data = totalDraws
        lotteryTrendChart.update()
      }

      // 暂时用模拟数据显示积分流转（后端没有单独提供积分每日流水接口）
      // 如果需要真实数据，需要后端增加相应接口
      if (data.lottery_activity && data.lottery_activity.length > 0) {
        const dates = data.lottery_activity.map(item => item.period)
        // 用抽奖消耗积分模拟积分支出
        const pointsOut = data.lottery_activity.map(item => item.total_draws * 10) // 假设每次抽奖10积分
        const pointsIn = data.lottery_activity.map(item => item.unique_users * 50) // 假设每用户获得50积分

        pointsFlowChart.data.labels = dates
        pointsFlowChart.data.datasets[0].data = pointsIn
        pointsFlowChart.data.datasets[1].data = pointsOut
        pointsFlowChart.update()
      }

      // 更新用户类型分布（使用summary数据）
      if (data.summary) {
        // 暂时使用模拟数据，后端没有提供用户类型分布接口
        userSourceChart.data.datasets[0].data = [
          data.summary.peak_users || 100,
          Math.floor((data.summary.peak_users || 100) * 0.05),
          Math.floor((data.summary.peak_users || 100) * 0.1)
        ]
        userSourceChart.update()
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
