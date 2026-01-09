/**
 * 图表可视化页面 - JavaScript逻辑
 * 
 * 从charts.html提取，遵循前端工程化最佳实践
 * 
 * 🔧 2026-01-09 更新：
 * - 适配后端 ReportingService.getChartsData() 返回的实际数据格式
 * - 后端返回数组格式，前端需要转换为 Chart.js 需要的 labels + datasets 格式
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

// ========== 数据转换工具函数 ==========

/**
 * 转换用户增长数据
 * 后端格式: [{date, count, cumulative}, ...]
 * Chart.js格式: {labels: [], new_users: [], cumulative: []}
 */
function transformUserGrowthData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { labels: [], new_users: [], cumulative: [] }
  }
  
  return {
    labels: data.map(item => item.date),
    new_users: data.map(item => item.count || 0),
    cumulative: data.map(item => item.cumulative || 0)
  }
}

/**
 * 转换用户类型数据
 * 后端格式: {regular: {count, percentage}, admin: {count, percentage}, merchant: {count, percentage}, total}
 * Chart.js格式: {normal: count, vip: count, admin: count}
 * 
 * 注意：后端没有VIP概念，使用merchant作为VIP展示
 */
function transformUserTypesData(data) {
  if (!data || typeof data !== 'object') {
    return { normal: 0, vip: 0, admin: 0 }
  }
  
  return {
    normal: data.regular?.count || 0,
    vip: data.merchant?.count || 0,  // 商家作为VIP展示
    admin: data.admin?.count || 0
  }
}

/**
 * 转换抽奖趋势数据
 * 后端格式: [{date, count, high_tier_count, high_tier_rate}, ...]
 * Chart.js格式: {labels: [], draws: [], wins: [], win_rate: []}
 * 
 * 注意：V4.0语义更新，后端使用 high_tier_count/high_tier_rate 替代 win_count/win_rate
 */
function transformLotteryTrendData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { labels: [], draws: [], wins: [], win_rate: [] }
  }
  
  return {
    labels: data.map(item => item.date),
    draws: data.map(item => item.count || 0),
    wins: data.map(item => item.high_tier_count || 0),
    win_rate: data.map(item => parseFloat(item.high_tier_rate) || 0)
  }
}

/**
 * 转换消费趋势数据
 * 后端格式: [{date, count, amount, avg_amount}, ...]
 * Chart.js格式: {labels: [], amounts: []}
 */
function transformConsumptionData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { labels: [], amounts: [] }
  }
  
  return {
    labels: data.map(item => item.date),
    amounts: data.map(item => parseFloat(item.amount) || 0)
  }
}

/**
 * 转换积分流水数据
 * 后端格式: [{date, earned, spent, balance_change}, ...]
 * Chart.js格式: {labels: [], issued: [], consumed: []}
 */
function transformPointsFlowData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { labels: [], issued: [], consumed: [] }
  }
  
  return {
    labels: data.map(item => item.date),
    issued: data.map(item => parseInt(item.earned) || 0),
    consumed: data.map(item => parseInt(item.spent) || 0)
  }
}

/**
 * 转换热门奖品数据
 * 后端格式: [{prize_name, count, percentage}, ...]
 * Chart.js格式: {labels: [], counts: []}
 */
function transformTopPrizesData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { labels: [], counts: [] }
  }
  
  return {
    labels: data.map(item => item.prize_name || '未知奖品'),
    counts: data.map(item => item.count || 0)
  }
}

/**
 * 转换活跃时段数据
 * 后端格式: [{hour, hour_label, activity_count}, ...]  (完整24小时)
 * Chart.js格式: {labels: [], values: []}
 * 
 * 雷达图只显示8个主要时段，需要从24小时数据中提取
 */
function transformActiveHoursData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    // 默认8个时段标签
    return {
      labels: ['0时', '3时', '6时', '9时', '12时', '15时', '18时', '21时'],
      values: [0, 0, 0, 0, 0, 0, 0, 0]
    }
  }
  
  // 如果后端返回的是完整24小时数据，提取8个主要时段
  if (data.length === 24) {
    const mainHours = [0, 3, 6, 9, 12, 15, 18, 21]
    return {
      labels: mainHours.map(h => `${h}时`),
      values: mainHours.map(h => {
        const hourData = data.find(item => item.hour === h)
        return hourData ? (hourData.activity_count || 0) : 0
      })
    }
  }
  
  // 直接使用后端数据
  return {
    labels: data.map(item => item.hour_label || `${item.hour}时`),
    values: data.map(item => item.activity_count || 0)
  }
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

      // 🔧 使用转换函数处理后端数据格式
      renderUserGrowthChart(transformUserGrowthData(data.user_growth))
      renderUserTypePieChart(transformUserTypesData(data.user_types))
      renderLotteryTrendChart(transformLotteryTrendData(data.lottery_trend))
      renderConsumptionChart(transformConsumptionData(data.consumption_trend))
      renderPointsFlowChart(transformPointsFlowData(data.points_flow))
      renderTopPrizesChart(transformTopPrizesData(data.top_prizes))
      renderActiveHoursChart(transformActiveHoursData(data.active_hours))
      
      console.log('✅ 图表数据加载成功', {
        days: days,
        metadata: data.metadata
      })
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
          label: '累计用户',
          data: data?.cumulative || [],
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.1)',
          tension: 0.4,
          fill: false,
          yAxisID: 'y1'
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
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: '新增用户' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          beginAtZero: true,
          title: { display: true, text: '累计用户' },
          grid: { drawOnChartArea: false }
        }
      }
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
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0)
              const value = context.raw
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0
              return `${context.label}: ${value} (${percentage}%)`
            }
          }
        }
      }
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
