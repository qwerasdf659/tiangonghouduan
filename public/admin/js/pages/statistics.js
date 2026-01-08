/**
 * 数据统计报表页面 - JavaScript逻辑
 * 从statistics.html提取，遵循前端工程化最佳实践
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

async function loadStatistics() {
  showLoading()

  try {
    const period = document.getElementById('periodSelect').value
    const params = new URLSearchParams({ period })

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

    const response = await apiRequest(`/api/v4/system/statistics/report?${params.toString()}`)

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

function renderStatistics(data) {
  if (data.overview) {
    document.getElementById('totalUsers').textContent = formatNumber(data.overview.total_users || 0)
    document.getElementById('totalDraws').textContent = formatNumber(data.overview.total_draws || 0)
    document.getElementById('winRate').textContent = `${(data.overview.win_rate || 0).toFixed(2)}%`
    document.getElementById('totalRevenue').textContent =
      `¥${(data.overview.total_revenue || 0).toFixed(2)}`

    renderTrend('userTrend', data.overview.user_trend)
    renderTrend('drawTrend', data.overview.draw_trend)
    renderTrend('winRateTrend', data.overview.win_rate_trend)
    renderTrend('revenueTrend', data.overview.revenue_trend)
  }

  if (data.users) {
    document.getElementById('newUsers').textContent = formatNumber(data.users.new_users || 0)
    document.getElementById('activeUsers').textContent = formatNumber(data.users.active_users || 0)
    document.getElementById('vipUsers').textContent = formatNumber(data.users.vip_users || 0)
    document.getElementById('bannedUsers').textContent = formatNumber(data.users.banned_users || 0)
  }

  if (data.lottery) {
    document.getElementById('lotteryDraws').textContent = formatNumber(
      data.lottery.total_draws || 0
    )
    document.getElementById('lotteryWins').textContent = formatNumber(data.lottery.wins || 0)
    document.getElementById('lotteryLosses').textContent = formatNumber(data.lottery.losses || 0)
    document.getElementById('avgWinRate').textContent =
      `${(data.lottery.avg_win_rate || 0).toFixed(2)}%`
  }

  if (data.consumption) {
    document.getElementById('consumptionTotal').textContent =
      `¥${(data.consumption.total || 0).toFixed(2)}`
    document.getElementById('consumptionApproved').textContent =
      `¥${(data.consumption.approved || 0).toFixed(2)}`
    document.getElementById('consumptionPending').textContent =
      `¥${(data.consumption.pending || 0).toFixed(2)}`
    document.getElementById('consumptionRejected').textContent =
      `¥${(data.consumption.rejected || 0).toFixed(2)}`
  }

  if (data.points) {
    document.getElementById('pointsIssued').textContent = formatNumber(data.points.issued || 0)
    document.getElementById('pointsConsumed').textContent = formatNumber(data.points.consumed || 0)
    document.getElementById('pointsCurrent').textContent = formatNumber(data.points.current || 0)
    document.getElementById('pointsAverage').textContent = formatNumber(data.points.average || 0)
  }

  if (data.prizes && Array.isArray(data.prizes)) {
    renderPrizeStats(data.prizes)
  }

  if (data.customer_service) {
    document.getElementById('totalSessions').textContent = formatNumber(
      data.customer_service.total_sessions || 0
    )
    document.getElementById('closedSessions').textContent = formatNumber(
      data.customer_service.closed_sessions || 0
    )
    document.getElementById('avgResponseTime').textContent =
      `${data.customer_service.avg_response_time || 0}分钟`
    document.getElementById('customerSatisfaction').textContent =
      `${(data.customer_service.satisfaction || 0).toFixed(1)}分`
  }
}

function renderTrend(elementId, trend) {
  const element = document.getElementById(elementId)
  if (!element || trend === undefined) return

  const isPositive = trend >= 0
  element.className = isPositive ? 'trend-up me-2' : 'trend-down me-2'
  element.innerHTML = `<i class="bi bi-arrow-${isPositive ? 'up' : 'down'}"></i> ${isPositive ? '+' : ''}${trend.toFixed(1)}%`
}

function renderPrizeStats(prizes) {
  const tbody = document.getElementById('prizeStatsTable')

  if (prizes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><i class="bi bi-inbox text-muted" style="font-size: 2rem;"></i><p class="mt-2 text-muted">暂无数据</p></td></tr>`
    return
  }

  tbody.innerHTML = prizes
    .map(prize => {
      const claimRate = prize.issued > 0 ? (prize.claimed / prize.issued) * 100 : 0
      return `
      <tr>
        <td>${prize.prize_name}</td>
        <td>${getPrizeTypeLabel(prize.prize_type)}</td>
        <td>${formatNumber(prize.issued || 0)}</td>
        <td>${formatNumber(prize.claimed || 0)}</td>
        <td>
          <div class="d-flex align-items-center">
            <div class="progress flex-fill me-2" style="height: 20px;">
              <div class="progress-bar ${getProgressColor(claimRate)}" style="width: ${claimRate}%" role="progressbar">${claimRate.toFixed(1)}%</div>
            </div>
          </div>
        </td>
        <td class="text-primary fw-bold">¥${((prize.prize_value || 0) * (prize.issued || 0)).toFixed(2)}</td>
      </tr>
    `
    })
    .join('')
}

function getPrizeTypeLabel(type) {
  const labels = {
    physical: '<span class="badge bg-primary">实物</span>',
    virtual: '<span class="badge bg-info">虚拟</span>',
    points: '<span class="badge bg-success">积分</span>',
    coupon: '<span class="badge bg-warning text-dark">优惠券</span>'
  }
  return labels[type] || '<span class="badge bg-secondary">未知</span>'
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
    const params = new URLSearchParams({ period, format: 'excel' })

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
    const params = new URLSearchParams({ period, format: 'pdf' })

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
