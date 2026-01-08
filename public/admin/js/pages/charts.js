/**
 * 图表可视化页面 - JavaScript逻辑
 * 从charts.html提取，遵循前端工程化最佳实践
 */

// ========== 全局变量 - 存储图表实例 ==========
let charts = {
  userGrowth: null,
  userTypePie: null,
  lotteryTrend: null,
  consumption: null,
  pointsFlow: null,
  topPrizes: null,
  activeHours: null
}

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('loadAllChartsBtn').addEventListener('click', () => loadAllCharts())

  if (!getToken() || !checkAdminPermission()) {
    return
  }

  loadAllCharts()
  document.getElementById('periodSelect').addEventListener('change', loadAllCharts)
})

async function loadAllCharts() {
  showLoading()

  try {
    const days = document.getElementById('periodSelect').value
    const response = await apiRequest(`/api/v4/system/statistics/charts?days=${days}`)

    if (response && response.success) {
      const data = response.data

      renderUserGrowthChart(data.user_growth)
      renderUserTypePieChart(data.user_types)
      renderLotteryTrendChart(data.lottery_trend)
      renderConsumptionChart(data.consumption_trend)
      renderPointsFlowChart(data.points_flow)
      renderTopPrizesChart(data.top_prizes)
      renderActiveHoursChart(data.active_hours)
    } else {
      showError('加载失败', response?.message || '获取图表数据失败')
    }
  } catch (error) {
    console.error('加载图表失败:', error)
    showError('加载失败', error.message)
  } finally {
    hideLoading()
  }
}

function renderUserGrowthChart(data) {
  const ctx = document.getElementById('userGrowthChart').getContext('2d')

  if (charts.userGrowth) {
    charts.userGrowth.destroy()
  }

  charts.userGrowth = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data?.labels || [],
      datasets: [
        {
          label: '新增用户',
          data: data?.new_users || [],
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: '活跃用户',
          data: data?.active_users || [],
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: { y: { beginAtZero: true } }
    }
  })
}

function renderUserTypePieChart(data) {
  const ctx = document.getElementById('userTypePieChart').getContext('2d')

  if (charts.userTypePie) {
    charts.userTypePie.destroy()
  }

  charts.userTypePie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['普通用户', 'VIP用户', '管理员'],
      datasets: [
        {
          data: [data?.normal || 0, data?.vip || 0, data?.admin || 0],
          backgroundColor: [
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(255, 99, 132, 0.8)'
          ],
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  })
}

function renderLotteryTrendChart(data) {
  const ctx = document.getElementById('lotteryTrendChart').getContext('2d')

  if (charts.lotteryTrend) {
    charts.lotteryTrend.destroy()
  }

  charts.lotteryTrend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data?.labels || [],
      datasets: [
        {
          label: '抽奖次数',
          data: data?.draws || [],
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          yAxisID: 'y'
        },
        {
          label: '中奖次数',
          data: data?.wins || [],
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          yAxisID: 'y'
        },
        {
          label: '中奖率(%)',
          data: data?.win_rate || [],
          type: 'line',
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          yAxisID: 'y1',
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: '次数' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: '中奖率(%)' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  })
}

function renderConsumptionChart(data) {
  const ctx = document.getElementById('consumptionChart').getContext('2d')

  if (charts.consumption) {
    charts.consumption.destroy()
  }

  charts.consumption = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data?.labels || [],
      datasets: [
        {
          label: '消费金额(元)',
          data: data?.amounts || [],
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return '¥' + value
            }
          }
        }
      }
    }
  })
}

function renderPointsFlowChart(data) {
  const ctx = document.getElementById('pointsFlowChart').getContext('2d')

  if (charts.pointsFlow) {
    charts.pointsFlow.destroy()
  }

  charts.pointsFlow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data?.labels || [],
      datasets: [
        {
          label: '发放积分',
          data: data?.issued || [],
          backgroundColor: 'rgba(75, 192, 192, 0.6)'
        },
        {
          label: '消耗积分',
          data: data?.consumed || [],
          backgroundColor: 'rgba(255, 159, 64, 0.6)'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true } }
    }
  })
}

function renderTopPrizesChart(data) {
  const ctx = document.getElementById('topPrizesChart').getContext('2d')

  if (charts.topPrizes) {
    charts.topPrizes.destroy()
  }

  charts.topPrizes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data?.labels || [],
      datasets: [
        {
          label: '发放次数',
          data: data?.counts || [],
          backgroundColor: [
            'rgba(255, 99, 132, 0.6)',
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 159, 64, 0.6)',
            'rgba(199, 199, 199, 0.6)',
            'rgba(83, 102, 255, 0.6)',
            'rgba(255, 99, 255, 0.6)',
            'rgba(99, 255, 132, 0.6)'
          ],
          borderWidth: 1
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  })
}

function renderActiveHoursChart(data) {
  const ctx = document.getElementById('activeHoursChart').getContext('2d')

  if (charts.activeHours) {
    charts.activeHours.destroy()
  }

  charts.activeHours = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: data?.labels || ['0时', '3时', '6时', '9时', '12时', '15时', '18时', '21时'],
      datasets: [
        {
          label: '活跃用户数',
          data: data?.values || [],
          fill: true,
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderColor: 'rgb(54, 162, 235)',
          pointBackgroundColor: 'rgb(54, 162, 235)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgb(54, 162, 235)'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { r: { beginAtZero: true } }
    }
  })
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.add('show')
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show')
}

function showError(title, message) {
  alert(`❌ ${title}\n${message}`)
}
