/**
 * 兑换市场统计分析页面
 * 使用 ECharts 本地引用（符合规范要求）
 *
 * @description 显示兑换市场的订单和收入统计
 * @author Admin
 * @updated 2026-01-21 - 迁移至 ECharts
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
  initCharts()
  loadStatistics()
  bindEvents()

  // 监听窗口大小变化
  window.addEventListener('resize', function () {
    orderStatusChart && orderStatusChart.resize()
    revenueChart && revenueChart.resize()
  })
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
 * 初始化 ECharts 图表实例
 */
function initCharts() {
  orderStatusChart = echarts.init(document.getElementById('orderStatusChart'))
  revenueChart = echarts.init(document.getElementById('revenueChart'))
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

    const response = await fetch(API_ENDPOINTS.BUSINESS_RECORDS.EXCHANGE_STATS, {
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
// 图表渲染 (ECharts)
// ============================================

/**
 * 渲染订单状态分布图 (环形图)
 */
function renderOrderStatusChart(orders) {
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: function (params) {
        const total = orders.pending + orders.completed + orders.shipped + orders.cancelled
        const percentage = total > 0 ? Math.round((params.value / total) * 100) : 0
        return `${params.name}: ${params.value} (${percentage}%)`
      }
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      data: ['待处理', '已完成', '已发货', '已取消']
    },
    series: [
      {
        name: '订单状态',
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
        labelLine: {
          show: false
        },
        data: [
          {
            value: orders.pending,
            name: '待处理',
            itemStyle: { color: 'rgba(255, 193, 7, 0.8)' }
          },
          {
            value: orders.completed,
            name: '已完成',
            itemStyle: { color: 'rgba(13, 202, 240, 0.8)' }
          },
          {
            value: orders.shipped,
            name: '已发货',
            itemStyle: { color: 'rgba(25, 135, 84, 0.8)' }
          },
          {
            value: orders.cancelled,
            name: '已取消',
            itemStyle: { color: 'rgba(108, 117, 125, 0.8)' }
          }
        ]
      }
    ]
  }

  orderStatusChart.setOption(option)
}

/**
 * 渲染收入来源分布图 (柱状图)
 */
function renderRevenueChart(revenue) {
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: function (params) {
        const p = params[0]
        return `${p.name}: ${p.value.toLocaleString()}`
      }
    },
    legend: {
      show: false
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['虚拟价值', '积分']
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: function (value) {
          return value.toLocaleString()
        }
      }
    },
    series: [
      {
        name: '收入总额',
        type: 'bar',
        barWidth: '50%',
        data: [
          {
            value: revenue.total_virtual_value,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(13, 202, 240, 1)' },
                { offset: 1, color: 'rgba(13, 202, 240, 0.6)' }
              ])
            }
          },
          {
            value: revenue.total_points,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(13, 110, 253, 1)' },
                { offset: 1, color: 'rgba(13, 110, 253, 0.6)' }
              ])
            }
          }
        ]
      }
    ]
  }

  revenueChart.setOption(option)
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
