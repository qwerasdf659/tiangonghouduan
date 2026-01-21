/**
 * 图表可视化页面 - JavaScript逻辑
 * 使用 ECharts 本地引用（符合规范要求）
 *
 * 🔧 2026-01-21 更新：
 * - 从 Chart.js 迁移到 ECharts（本地引用）
 * - 适配后端 ReportingService.getChartsData() 返回的实际数据格式
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
 */
function transformUserTypesData(data) {
  if (!data || typeof data !== 'object') {
    return { normal: 0, vip: 0, admin: 0 }
  }

  return {
    normal: data.regular?.count || 0,
    vip: data.merchant?.count || 0,
    admin: data.admin?.count || 0
  }
}

/**
 * 转换抽奖趋势数据
 * 后端格式: [{date, count, high_tier_count, high_tier_rate}, ...]
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
 * 后端格式: [{hour, hour_label, activity_count}, ...]
 */
function transformActiveHoursData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      labels: ['0时', '3时', '6时', '9时', '12时', '15时', '18时', '21时'],
      values: [0, 0, 0, 0, 0, 0, 0, 0]
    }
  }

  if (data.length === 24) {
    const mainHours = [0, 3, 6, 9, 12, 15, 18, 21]
    return {
      labels: mainHours.map(h => `${h}时`),
      values: mainHours.map(h => {
        const hourData = data.find(item => item.hour === h)
        return hourData ? hourData.activity_count || 0 : 0
      })
    }
  }

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

  initCharts()
  loadAllCharts()
  document.getElementById('periodSelect').addEventListener('change', loadAllCharts)

  // 监听窗口大小变化
  window.addEventListener('resize', function () {
    Object.values(charts).forEach(chart => {
      if (chart) chart.resize()
    })
  })
})

/**
 * 初始化所有 ECharts 图表实例
 */
function initCharts() {
  // 用户增长趋势图
  charts.userGrowth = echarts.init(document.getElementById('userGrowthChart'))

  // 用户类型饼图
  charts.userTypePie = echarts.init(document.getElementById('userTypePieChart'))

  // 抽奖趋势图
  charts.lotteryTrend = echarts.init(document.getElementById('lotteryTrendChart'))

  // 消费金额趋势图
  charts.consumption = echarts.init(document.getElementById('consumptionChart'))

  // 积分流动趋势图
  charts.pointsFlow = echarts.init(document.getElementById('pointsFlowChart'))

  // 热门奖品图
  charts.topPrizes = echarts.init(document.getElementById('topPrizesChart'))

  // 活跃时段图
  charts.activeHours = echarts.init(document.getElementById('activeHoursChart'))
}

async function loadAllCharts() {
  showLoading()

  try {
    const days = document.getElementById('periodSelect').value
    const response = await apiRequest(`${API_ENDPOINTS.SYSTEM.CHARTS}?days=${days}`)

    if (response && response.success) {
      const data = response.data

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
  charts.userGrowth.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['新增用户', '累计用户'],
      bottom: 0
    },
    grid: { left: '3%', right: '12%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.labels || []
    },
    yAxis: [
      {
        type: 'value',
        name: '新增用户',
        position: 'left',
        axisLine: { lineStyle: { color: 'rgb(75, 192, 192)' } }
      },
      {
        type: 'value',
        name: '累计用户',
        position: 'right',
        axisLine: { lineStyle: { color: 'rgb(255, 159, 64)' } }
      }
    ],
    series: [
      {
        name: '新增用户',
        type: 'line',
        smooth: true,
        areaStyle: { color: 'rgba(75, 192, 192, 0.2)' },
        lineStyle: { color: 'rgb(75, 192, 192)' },
        itemStyle: { color: 'rgb(75, 192, 192)' },
        data: data.new_users || []
      },
      {
        name: '累计用户',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        lineStyle: { color: 'rgb(255, 159, 64)' },
        itemStyle: { color: 'rgb(255, 159, 64)' },
        data: data.cumulative || []
      }
    ]
  })
}

function renderUserTypePieChart(data) {
  charts.userTypePie.setOption({
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      data: ['普通用户', 'VIP用户', '管理员']
    },
    series: [
      {
        name: '用户类型',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' }
        },
        labelLine: { show: false },
        data: [
          {
            value: data.normal || 0,
            name: '普通用户',
            itemStyle: { color: 'rgba(54, 162, 235, 0.8)' }
          },
          { value: data.vip || 0, name: 'VIP用户', itemStyle: { color: 'rgba(255, 206, 86, 0.8)' } },
          { value: data.admin || 0, name: '管理员', itemStyle: { color: 'rgba(255, 99, 132, 0.8)' } }
        ]
      }
    ]
  })
}

function renderLotteryTrendChart(data) {
  charts.lotteryTrend.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['抽奖次数', '中奖次数', '中奖率(%)'],
      bottom: 0
    },
    grid: { left: '3%', right: '10%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.labels || []
    },
    yAxis: [
      {
        type: 'value',
        name: '次数',
        position: 'left'
      },
      {
        type: 'value',
        name: '中奖率(%)',
        position: 'right',
        axisLabel: { formatter: '{value}%' }
      }
    ],
    series: [
      {
        name: '抽奖次数',
        type: 'bar',
        itemStyle: { color: 'rgba(54, 162, 235, 0.6)' },
        data: data.draws || []
      },
      {
        name: '中奖次数',
        type: 'bar',
        itemStyle: { color: 'rgba(75, 192, 192, 0.6)' },
        data: data.wins || []
      },
      {
        name: '中奖率(%)',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        lineStyle: { color: 'rgb(255, 99, 132)' },
        itemStyle: { color: 'rgb(255, 99, 132)' },
        areaStyle: { color: 'rgba(255, 99, 132, 0.1)' },
        data: data.win_rate || []
      }
    ]
  })
}

function renderConsumptionChart(data) {
  charts.consumption.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: function (params) {
        const p = params[0]
        return `${p.axisValue}<br/>${p.seriesName}: ¥${p.value}`
      }
    },
    legend: { show: false },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.labels || []
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '¥{value}' }
    },
    series: [
      {
        name: '消费金额(元)',
        type: 'line',
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 99, 132, 0.3)' },
            { offset: 1, color: 'rgba(255, 99, 132, 0.05)' }
          ])
        },
        lineStyle: { color: 'rgb(255, 99, 132)' },
        itemStyle: { color: 'rgb(255, 99, 132)' },
        data: data.amounts || []
      }
    ]
  })
}

function renderPointsFlowChart(data) {
  charts.pointsFlow.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['发放积分', '消耗积分'],
      bottom: 0
    },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.labels || []
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '发放积分',
        type: 'bar',
        itemStyle: { color: 'rgba(75, 192, 192, 0.6)' },
        data: data.issued || []
      },
      {
        name: '消耗积分',
        type: 'bar',
        itemStyle: { color: 'rgba(255, 159, 64, 0.6)' },
        data: data.consumed || []
      }
    ]
  })
}

function renderTopPrizesChart(data) {
  const colors = [
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
  ]

  charts.topPrizes.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: { show: false },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'value'
    },
    yAxis: {
      type: 'category',
      data: data.labels || [],
      inverse: true
    },
    series: [
      {
        name: '发放次数',
        type: 'bar',
        data: (data.counts || []).map((value, index) => ({
          value: value,
          itemStyle: { color: colors[index % colors.length] }
        }))
      }
    ]
  })
}

function renderActiveHoursChart(data) {
  charts.activeHours.setOption({
    tooltip: {
      trigger: 'item'
    },
    legend: {
      data: ['活跃用户数'],
      bottom: 0
    },
    radar: {
      indicator: (data.labels || []).map(label => ({
        name: label,
        max: Math.max(...(data.values || [0]), 100)
      }))
    },
    series: [
      {
        name: '活跃时段',
        type: 'radar',
        data: [
          {
            value: data.values || [],
            name: '活跃用户数',
            areaStyle: { color: 'rgba(54, 162, 235, 0.2)' },
            lineStyle: { color: 'rgb(54, 162, 235)' },
            itemStyle: { color: 'rgb(54, 162, 235)' }
          }
        ]
      }
    ]
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
