/**
 * 运营分析页面 - JavaScript逻辑
 * 从analytics.html提取，遵循前端工程化最佳实践
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

  // 用户来源饼图
  const sourceCtx = document.getElementById('userSourceChart').getContext('2d')
  userSourceChart = new Chart(sourceCtx, {
    type: 'doughnut',
    data: {
      labels: ['微信小程序', 'Web端', 'App', '其他'],
      datasets: [
        {
          data: [0, 0, 0, 0],
          backgroundColor: ['#0d6efd', '#198754', '#ffc107', '#6c757d']
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
    await Promise.all([loadSummaryData(), loadTrendData(), loadDetailData()])
  } catch (error) {
    console.error('加载数据失败:', error)
    alert('❌ 加载数据失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

async function loadSummaryData() {
  const days = document.getElementById('timeRangeFilter').value

  try {
    const response = await apiRequest(`/api/v4/console/analytics/summary?days=${days}`)

    if (response && response.success) {
      const { current, previous } = response.data

      document.getElementById('activeUsers').textContent = formatNumber(current.active_users || 0)
      updateGrowth('activeUsersGrowth', current.active_users, previous?.active_users)

      document.getElementById('lotteryCount').textContent = formatNumber(current.lottery_count || 0)
      updateGrowth('lotteryCountGrowth', current.lottery_count, previous?.lottery_count)

      document.getElementById('pointsIssued').textContent = formatNumber(current.points_issued || 0)
      updateGrowth('pointsIssuedGrowth', current.points_issued, previous?.points_issued)

      document.getElementById('exchangeOrders').textContent = formatNumber(
        current.exchange_orders || 0
      )
      updateGrowth('exchangeOrdersGrowth', current.exchange_orders, previous?.exchange_orders)
    }
  } catch (error) {
    console.error('加载汇总数据失败:', error)
  }
}

function updateGrowth(elementId, current, previous) {
  const element = document.getElementById(elementId)
  if (!previous || previous === 0) {
    element.textContent = '暂无对比数据'
    element.className = 'text-muted'
    return
  }

  const growth = (((current - previous) / previous) * 100).toFixed(1)
  const isUp = growth >= 0

  element.textContent = `${isUp ? '↑' : '↓'} ${Math.abs(growth)}%`
  element.className = isUp ? 'text-success' : 'text-danger'
}

async function loadTrendData() {
  const days = document.getElementById('timeRangeFilter').value

  try {
    const response = await apiRequest(`/api/v4/console/analytics/trends?days=${days}`)

    if (response && response.success) {
      const { dates, users, lottery, points_in, points_out, sources } = response.data

      userTrendChart.data.labels = dates || []
      userTrendChart.data.datasets[0].data = users || []
      userTrendChart.update()

      lotteryTrendChart.data.labels = dates || []
      lotteryTrendChart.data.datasets[0].data = lottery || []
      lotteryTrendChart.update()

      pointsFlowChart.data.labels = dates || []
      pointsFlowChart.data.datasets[0].data = points_in || []
      pointsFlowChart.data.datasets[1].data = points_out || []
      pointsFlowChart.update()

      if (sources) {
        userSourceChart.data.labels = Object.keys(sources)
        userSourceChart.data.datasets[0].data = Object.values(sources)
        userSourceChart.update()
      }
    }
  } catch (error) {
    console.error('加载趋势数据失败:', error)
  }
}

async function loadDetailData() {
  const days = document.getElementById('timeRangeFilter').value
  const tbody = document.getElementById('detailTableBody')

  try {
    const response = await apiRequest(`/api/v4/console/analytics/daily?days=${days}`)

    if (response && response.success) {
      const dailyData = response.data.daily || []

      if (dailyData.length === 0) {
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

      tbody.innerHTML = dailyData
        .map(
          day => `
        <tr>
          <td>${day.date}</td>
          <td>${day.new_users || 0}</td>
          <td>${day.active_users || 0}</td>
          <td>${day.lottery_count || 0}</td>
          <td class="text-success">+${day.points_issued || 0}</td>
          <td class="text-danger">-${day.points_consumed || 0}</td>
          <td>${day.exchange_orders || 0}</td>
          <td>¥${(day.transaction_amount || 0).toFixed(2)}</td>
        </tr>
      `
        )
        .join('')
    }
  } catch (error) {
    console.error('加载详细数据失败:', error)
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败</p>
        </td>
      </tr>
    `
  }
}

function exportReport() {
  const days = document.getElementById('timeRangeFilter').value
  window.open(`/api/v4/console/analytics/export?days=${days}&token=${getToken()}`)
}

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show)
}
