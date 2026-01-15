/**
 * 数据统计报表页面 - JavaScript逻辑
 * 从statistics.html提取，遵循前端工程化最佳实践
 *
 * 2026-01-09 更新：适配后端 ReportingService.getChartsData() 返回的数据格式
 * 后端数据结构：
 *   - user_growth: [{date, count, cumulative}]
 *   - user_types: {regular: {count, percentage}, admin: {count, percentage}, merchant: {count, percentage}, total}
 *   - lottery_trend: [{date, count, high_tier_count, high_tier_rate}]
 *   - consumption_trend: [{date, count, amount, avg_amount}]
 *   - points_flow: [{date, earned, spent, balance_change}]
 *   - top_prizes: [{prize_name, count, percentage}]
 *   - active_hours: [{hour, hour_label, activity_count}]
 *   - metadata: {days, start_date, end_date, query_time_ms, generated_at}
 */

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('loadStatisticsBtn').addEventListener('click', () => loadStatistics())
  document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel)
  document.getElementById('exportPdfBtn').addEventListener('click', exportToPDF)

  document.getElementById('periodSelect').addEventListener('change', function () {
    const isCustom = this.value === 'custom'
    document.getElementById('customDateStart').style.display = isCustom ? 'block' : 'none'
    document.getElementById('customDateEnd').style.display = isCustom ? 'block' : 'none'
    if (!isCustom) loadStatistics()
  })

  loadStatistics()
})

/**
 * 将周期值转换为天数
 */
function periodToDays(period) {
  switch (period) {
    case 'today':
      return 1
    case 'yesterday':
      return 1
    case 'week':
      return 7
    case 'month':
      return 30
    default:
      return 7
  }
}

async function loadStatistics() {
  showLoading()

  try {
    const period = document.getElementById('periodSelect').value

    // 后端API使用 days 参数
    const days = periodToDays(period)
    const params = new URLSearchParams({ days })

    if (period === 'custom') {
      const startDate = document.getElementById('startDate').value
      const endDate = document.getElementById('endDate').value

      if (!startDate || !endDate) {
        alert('请选择开始和结束日期')
        hideLoading()
        return
      }

      params.append('start_date', startDate)
      params.append('end_date', endDate)
    }

    // 调用后端 /api/v4/system/statistics/charts API
    const response = await apiRequest(`/api/v4/system/statistics/charts?${params.toString()}`)

    if (response && response.success) {
      renderStatistics(response.data)
    } else {
      showError('加载失败', response?.message || '获取统计数据失败')
    }
  } catch (error) {
    console.error('加载统计失败:', error)
    showError('加载失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 渲染统计数据 - 适配后端 getChartsData() 返回格式
 */
function renderStatistics(data) {
  // ========== 1. 核心指标总览（从后端数据计算）==========

  // 总用户数：从 user_types.total 获取
  const totalUsers = data.user_types?.total || 0
  document.getElementById('totalUsers').textContent = formatNumber(totalUsers)

  // 总抽奖次数：从 lottery_trend 数组求和
  const totalDraws = (data.lottery_trend || []).reduce((sum, item) => sum + (item.count || 0), 0)
  document.getElementById('totalDraws').textContent = formatNumber(totalDraws)

  // 高档奖励率（原中奖率）：从 lottery_trend 计算
  const totalHighTier = (data.lottery_trend || []).reduce(
    (sum, item) => sum + (item.high_tier_count || 0),
    0
  )
  const highTierRate = totalDraws > 0 ? (totalHighTier / totalDraws) * 100 : 0
  document.getElementById('winRate').textContent = `${highTierRate.toFixed(2)}%`

  // 总消费金额：从 consumption_trend 数组求和
  const totalRevenue = (data.consumption_trend || []).reduce(
    (sum, item) => sum + parseFloat(item.amount || 0),
    0
  )
  document.getElementById('totalRevenue').textContent = `¥${totalRevenue.toFixed(2)}`

  // 计算趋势（基于最近和之前数据的对比）
  const userTrend = calculateGrowthTrend(data.user_growth)
  const drawTrend = calculateArrayTrend(data.lottery_trend, 'count')
  const highTierTrend = calculateArrayTrend(data.lottery_trend, 'high_tier_rate')
  const revenueTrend = calculateArrayTrend(data.consumption_trend, 'amount')

  renderTrend('userTrend', userTrend)
  renderTrend('drawTrend', drawTrend)
  renderTrend('winRateTrend', highTierTrend)
  renderTrend('revenueTrend', revenueTrend)

  // ========== 2. 用户数据统计（从 user_types 和 user_growth 获取）==========

  // 新增用户：从 user_growth 最新一天的 count
  const userGrowth = data.user_growth || []
  const recentNewUsers = userGrowth.length > 0 ? userGrowth[userGrowth.length - 1].count : 0
  const periodNewUsers = userGrowth.reduce((sum, item) => sum + (item.count || 0), 0)
  document.getElementById('newUsers').textContent = formatNumber(periodNewUsers)

  // 活跃用户：从 active_hours 统计总活跃数
  const activeCount = (data.active_hours || []).reduce(
    (sum, item) => sum + (item.activity_count || 0),
    0
  )
  document.getElementById('activeUsers').textContent = formatNumber(activeCount)

  // 管理员用户数
  const adminUsers = data.user_types?.admin?.count || 0
  document.getElementById('vipUsers').textContent = formatNumber(adminUsers)

  // 普通用户数（作为"封禁用户"的替代，显示普通用户）
  const regularUsers = data.user_types?.regular?.count || 0
  document.getElementById('bannedUsers').textContent = formatNumber(regularUsers)

  // ========== 3. 抽奖数据统计（从 lottery_trend 获取）==========

  document.getElementById('lotteryDraws').textContent = formatNumber(totalDraws)
  document.getElementById('lotteryWins').textContent = formatNumber(totalHighTier)
  document.getElementById('lotteryLosses').textContent = formatNumber(totalDraws - totalHighTier)
  document.getElementById('avgWinRate').textContent = `${highTierRate.toFixed(2)}%`

  // ========== 4. 消费数据统计（从 consumption_trend 获取）==========

  const consumptionTotal = totalRevenue
  const consumptionCount = (data.consumption_trend || []).reduce(
    (sum, item) => sum + (item.count || 0),
    0
  )

  document.getElementById('consumptionTotal').textContent = `¥${consumptionTotal.toFixed(2)}`
  document.getElementById('consumptionApproved').textContent = `¥${consumptionTotal.toFixed(2)}`
  document.getElementById('consumptionPending').textContent = `¥0.00`
  document.getElementById('consumptionRejected').textContent = `¥0.00`

  // ========== 5. 积分数据统计（从 points_flow 获取）==========

  const pointsData = data.points_flow || []
  const totalEarned = pointsData.reduce((sum, item) => sum + (item.earned || 0), 0)
  const totalSpent = pointsData.reduce((sum, item) => sum + (item.spent || 0), 0)
  const totalBalanceChange = pointsData.reduce((sum, item) => sum + (item.balance_change || 0), 0)

  document.getElementById('pointsIssued').textContent = formatNumber(totalEarned)
  document.getElementById('pointsConsumed').textContent = formatNumber(totalSpent)
  document.getElementById('pointsCurrent').textContent = formatNumber(totalBalanceChange)
  document.getElementById('pointsAverage').textContent =
    totalUsers > 0 ? formatNumber(Math.round(totalBalanceChange / totalUsers)) : '0'

  // ========== 6. 奖品发放统计（从 top_prizes 获取）==========

  if (data.top_prizes && Array.isArray(data.top_prizes)) {
    renderPrizeStats(data.top_prizes)
  } else {
    renderPrizeStats([])
  }

  // ========== 7. 活跃时段统计（从 active_hours 获取，替代客服统计）==========

  if (data.active_hours && Array.isArray(data.active_hours)) {
    renderActiveHoursStats(data.active_hours)
  } else {
    // 显示默认值
    document.getElementById('totalSessions').textContent = '-'
    document.getElementById('closedSessions').textContent = '-'
    document.getElementById('avgResponseTime').textContent = '-'
    document.getElementById('customerSatisfaction').textContent = '-'
  }
}

/**
 * 计算用户增长趋势
 */
function calculateGrowthTrend(userGrowth) {
  if (!userGrowth || userGrowth.length < 2) return 0

  const midPoint = Math.floor(userGrowth.length / 2)
  const recentSum = userGrowth.slice(midPoint).reduce((sum, item) => sum + (item.count || 0), 0)
  const previousSum = userGrowth
    .slice(0, midPoint)
    .reduce((sum, item) => sum + (item.count || 0), 0)

  if (previousSum === 0) return recentSum > 0 ? 100 : 0
  return ((recentSum - previousSum) / previousSum) * 100
}

/**
 * 计算数组数据的趋势
 */
function calculateArrayTrend(dataArray, field) {
  if (!dataArray || dataArray.length < 2) return 0

  const midPoint = Math.floor(dataArray.length / 2)
  const recentSum = dataArray
    .slice(midPoint)
    .reduce((sum, item) => sum + parseFloat(item[field] || 0), 0)
  const previousSum = dataArray
    .slice(0, midPoint)
    .reduce((sum, item) => sum + parseFloat(item[field] || 0), 0)

  if (previousSum === 0) return recentSum > 0 ? 100 : 0
  return ((recentSum - previousSum) / previousSum) * 100
}

function renderTrend(elementId, trend) {
  const element = document.getElementById(elementId)
  if (!element || trend === undefined || isNaN(trend)) return

  const isPositive = trend >= 0
  element.className = isPositive ? 'trend-up me-2' : 'trend-down me-2'
  element.innerHTML = `<i class="bi bi-arrow-${isPositive ? 'up' : 'down'}"></i> ${isPositive ? '+' : ''}${trend.toFixed(1)}%`
}

/**
 * 渲染奖品统计 - 适配后端 top_prizes 格式
 * 后端格式: [{prize_name, count, percentage}]
 */
function renderPrizeStats(prizes) {
  const tbody = document.getElementById('prizeStatsTable')

  if (!prizes || prizes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><i class="bi bi-inbox text-muted" style="font-size: 2rem;"></i><p class="mt-2 text-muted">暂无奖品数据</p></td></tr>`
    return
  }

  tbody.innerHTML = prizes
    .map(prize => {
      const percentage = parseFloat(prize.percentage || 0)
      return `
      <tr>
        <td>${escapeHtml(prize.prize_name || '未知奖品')}</td>
        <td><span class="badge bg-primary">抽奖</span></td>
        <td>${formatNumber(prize.count || 0)}</td>
        <td>${formatNumber(prize.count || 0)}</td>
        <td>
          <div class="d-flex align-items-center">
            <div class="progress flex-fill me-2" style="height: 20px;">
              <div class="progress-bar ${getProgressColor(percentage)}" style="width: ${Math.min(percentage, 100)}%" role="progressbar">${percentage.toFixed(1)}%</div>
            </div>
          </div>
        </td>
        <td class="text-muted">-</td>
      </tr>
    `
    })
    .join('')
}

/**
 * 渲染活跃时段统计 - 替代原客服统计
 * 后端格式: [{hour, hour_label, activity_count}]
 */
function renderActiveHoursStats(activeHours) {
  if (!activeHours || activeHours.length === 0) {
    document.getElementById('totalSessions').textContent = '0'
    document.getElementById('closedSessions').textContent = '0'
    document.getElementById('avgResponseTime').textContent = '-'
    document.getElementById('customerSatisfaction').textContent = '-'
    return
  }

  // 总活跃次数
  const totalActivity = activeHours.reduce((sum, item) => sum + (item.activity_count || 0), 0)

  // 找出最活跃的时段
  const sortedHours = [...activeHours].sort(
    (a, b) => (b.activity_count || 0) - (a.activity_count || 0)
  )
  const peakHour = sortedHours[0]

  // 计算活跃时段数（有活动的小时数）
  const activeHourCount = activeHours.filter(h => h.activity_count > 0).length

  document.getElementById('totalSessions').textContent = formatNumber(totalActivity)
  document.getElementById('closedSessions').textContent = formatNumber(activeHourCount)
  document.getElementById('avgResponseTime').textContent = peakHour ? peakHour.hour_label : '-'
  document.getElementById('customerSatisfaction').textContent =
    `${((activeHourCount / 24) * 100).toFixed(0)}%`
}

/**
 * HTML转义
 */
function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function getProgressColor(percentage) {
  if (percentage >= 80) return 'bg-success'
  if (percentage >= 50) return 'bg-info'
  if (percentage >= 30) return 'bg-warning'
  return 'bg-danger'
}

async function exportToExcel() {
  showLoading()

  try {
    const period = document.getElementById('periodSelect').value
    const days = periodToDays(period)
    const params = new URLSearchParams({ days, format: 'excel' })

    if (period === 'custom') {
      params.append('start_date', document.getElementById('startDate').value)
      params.append('end_date', document.getElementById('endDate').value)
    }

    const response = await fetch(`/api/v4/system/statistics/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })

    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `统计报表_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      showSuccess('导出成功', 'Excel文件已下载')
    } else {
      showError('导出失败', '无法生成Excel文件')
    }
  } catch (error) {
    console.error('导出Excel失败:', error)
    showError('导出失败', error.message)
  } finally {
    hideLoading()
  }
}

async function exportToPDF() {
  showLoading()

  try {
    const period = document.getElementById('periodSelect').value
    const days = periodToDays(period)
    const params = new URLSearchParams({ days, format: 'pdf' })

    if (period === 'custom') {
      params.append('start_date', document.getElementById('startDate').value)
      params.append('end_date', document.getElementById('endDate').value)
    }

    const response = await fetch(`/api/v4/system/statistics/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })

    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `统计报表_${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      showSuccess('导出成功', 'PDF文件已下载')
    } else {
      showError('导出失败', '无法生成PDF文件')
    }
  } catch (error) {
    console.error('导出PDF失败:', error)
    showError('导出失败', error.message)
  } finally {
    hideLoading()
  }
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.add('show')
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show')
}

function showSuccess(title, message) {
  alert(`✅ ${title}\n${message}`)
}

function showError(title, message) {
  alert(`❌ ${title}\n${message}`)
}
