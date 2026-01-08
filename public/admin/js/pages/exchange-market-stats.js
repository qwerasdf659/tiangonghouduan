/**
 * 兑换市场统计分析页面
 * @description 显示兑换市场的订单和收入统计
 * @author Admin
 * @created 2026-01-09
 */

// ============================================
// 全局变量
// ============================================

let orderStatusChart = null
let revenueChart = null

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  checkAuth()
  loadStatistics()
  bindEvents()
})

/**
 * 检查认证
 */
function checkAuth() {
  if (!getToken()) {
    window.location.href = '/admin/login.html'
    return
  }

  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }
}

/**
 * 绑定事件
 */
function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('refreshBtn').addEventListener('click', loadStatistics)
}

// ============================================
// 统计数据加载
// ============================================

/**
 * 加载统计数据
 */
async function loadStatistics() {
  try {
    showLoading(true)
    const token = getToken()

    const response = await fetch('/api/v4/shop/exchange/statistics', {
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await response.json()

    if (data.success) {
      renderStatistics(data.data)
    } else {
      showError(data.message || '加载统计数据失败')
    }
  } catch (error) {
    console.error('加载统计数据失败', error)
    showError('加载失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染统计数据
 */
function renderStatistics(stats) {
  // 订单统计
  document.getElementById('totalOrders').textContent = stats.orders.total
  document.getElementById('pendingOrders').textContent = stats.orders.pending
  document.getElementById('completedOrders').textContent = stats.orders.completed
  document.getElementById('shippedOrders').textContent = stats.orders.shipped
  document.getElementById('cancelledOrders').textContent = stats.orders.cancelled

  // 完成率
  const completionRate =
    stats.orders.total > 0
      ? Math.round(((stats.orders.completed + stats.orders.shipped) / stats.orders.total) * 100)
      : 0
  document.getElementById('completionRate').textContent = completionRate + '%'

  // 收入统计
  document.getElementById('totalVirtualValue').textContent =
    stats.revenue.total_virtual_value.toFixed(2)
  document.getElementById('totalPoints').textContent = stats.revenue.total_points

  // 商品库存统计
  const activeItems = stats.items.find(item => item.status === 'active')
  const inactiveItems = stats.items.find(item => item.status === 'inactive')

  document.getElementById('activeItemCount').textContent = activeItems ? activeItems.count : 0
  document.getElementById('activeItemStock').textContent = activeItems ? activeItems.total_stock : 0
  document.getElementById('inactiveItemCount').textContent = inactiveItems ? inactiveItems.count : 0
  document.getElementById('inactiveItemStock').textContent = inactiveItems
    ? inactiveItems.total_stock
    : 0

  // 渲染图表
  renderOrderStatusChart(stats.orders)
  renderRevenueChart(stats.revenue)
}

// ============================================
// 图表渲染
// ============================================

/**
 * 渲染订单状态分布图
 */
function renderOrderStatusChart(orders) {
  const ctx = document.getElementById('orderStatusChart')

  if (orderStatusChart) {
    orderStatusChart.destroy()
  }

  orderStatusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['待处理', '已完成', '已发货', '已取消'],
      datasets: [
        {
          data: [orders.pending, orders.completed, orders.shipped, orders.cancelled],
          backgroundColor: [
            'rgba(255, 193, 7, 0.8)', // warning
            'rgba(13, 202, 240, 0.8)', // info
            'rgba(25, 135, 84, 0.8)', // success
            'rgba(108, 117, 125, 0.8)' // secondary
          ],
          borderColor: [
            'rgba(255, 193, 7, 1)',
            'rgba(13, 202, 240, 1)',
            'rgba(25, 135, 84, 1)',
            'rgba(108, 117, 125, 1)'
          ],
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || ''
              const value = context.parsed || 0
              const total = context.dataset.data.reduce((a, b) => a + b, 0)
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0
              return `${label}: ${value} (${percentage}%)`
            }
          }
        }
      }
    }
  })
}

/**
 * 渲染收入来源分布图
 */
function renderRevenueChart(revenue) {
  const ctx = document.getElementById('revenueChart')

  if (revenueChart) {
    revenueChart.destroy()
  }

  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['虚拟价值', '积分'],
      datasets: [
        {
          label: '收入总额',
          data: [revenue.total_virtual_value, revenue.total_points],
          backgroundColor: [
            'rgba(13, 202, 240, 0.8)', // info
            'rgba(13, 110, 253, 0.8)' // primary
          ],
          borderColor: ['rgba(13, 202, 240, 1)', 'rgba(13, 110, 253, 1)'],
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return value.toLocaleString()
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const value = context.parsed.y || 0
              return `收入: ${value.toLocaleString()}`
            }
          }
        }
      }
    }
  })
}

// ============================================
// 工具函数
// ============================================

/**
 * 显示加载状态
 */
function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'
}

/**
 * 显示成功消息
 */
function showSuccess(message) {
  alert(message)
}

/**
 * 显示错误消息
 */
function showError(message) {
  alert(message)
}
