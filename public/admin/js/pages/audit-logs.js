/**
 * 审计日志页面 - JavaScript逻辑
 * 从audit-logs.html提取，遵循前端工程化最佳实践
 */

// ========== 全局变量 ==========
let currentPage = 1
const pageSize = 30

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  checkAuth()
  initDateFilters()
  loadAuditLogs()
  loadStatistics()
  bindEvents()
})

function checkAuth() {
  const token = getToken()
  if (!token) {
    window.location.href = '/admin/login.html'
    return false
  }
  checkAdminPermission()
  return true
}

function initDateFilters() {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 7)

  document.getElementById('endDateFilter').value = today.toISOString().split('T')[0]
  document.getElementById('startDateFilter').value = weekAgo.toISOString().split('T')[0]
}

function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('searchBtn').addEventListener('click', handleSearch)
}

function handleSearch() {
  currentPage = 1
  loadAuditLogs()
}

async function loadAuditLogs() {
  try {
    showLoading(true)

    const operationType = document.getElementById('operationTypeFilter').value
    const targetType = document.getElementById('targetTypeFilter').value
    const operatorId = document.getElementById('operatorIdFilter').value.trim()
    const startDate = document.getElementById('startDateFilter').value
    const endDate = document.getElementById('endDateFilter').value

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize
    })

    if (operationType) params.append('operation_type', operationType)
    if (targetType) params.append('target_type', targetType)
    if (operatorId) params.append('operator_id', operatorId)
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)

    const response = await apiRequest(`${API_ENDPOINTS.AUDIT_LOGS.LIST}?${params}`)

    if (response && response.success) {
      renderLogs(response.data.logs || response.data.list || [])
      renderPagination(response.data.pagination)
    } else {
      showError(response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载审计日志失败', error)
    showError('加载失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

async function loadStatistics() {
  try {
    const response = await apiRequest(API_ENDPOINTS.AUDIT_LOGS.STATISTICS)

    if (response && response.success) {
      // 后端直接返回统计数据在 response.data 中
      // 字段：today_count, week_count, success_count, failed_count, total
      const stats = response.data || {}
      document.getElementById('todayLogs').textContent = stats.today_count || 0
      document.getElementById('weekLogs').textContent = stats.week_count || 0
      document.getElementById('successLogs').textContent = stats.success_count || 0
      document.getElementById('failedLogs').textContent = stats.failed_count || 0
    }
  } catch (error) {
    console.error('加载统计数据失败', error)
    // 失败时显示占位符
    document.getElementById('todayLogs').textContent = '-'
    document.getElementById('weekLogs').textContent = '-'
    document.getElementById('successLogs').textContent = '-'
    document.getElementById('failedLogs').textContent = '-'
  }
}

function renderLogs(logs) {
  const tbody = document.getElementById('logsTableBody')

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">暂无数据</td></tr>'
    return
  }

  tbody.innerHTML = logs
    .map(log => {
      const id = log.log_id || log.id
      // 优先使用后端返回的中文名称字段
      const operationBadge = getOperationTypeBadge(log.operation_type, log.operation_type_display)
      const resultBadge = getResultBadge(log.result || log.status, log.result_display)
      // 目标类型使用后端返回的中文名称
      const targetTypeText = log.target_type_display || log.target_type || '-'

      return `
      <tr>
        <td><small>${id}</small></td>
        <td>${operationBadge}</td>
        <td>
          <small class="text-muted">${targetTypeText}</small>
          ${log.target_id ? `<br><code>${log.target_id}</code>` : ''}
        </td>
        <td>
          <div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <small>${escapeHtml(log.description || log.action_description || '-')}</small>
          </div>
        </td>
        <td><small>ID: ${log.operator_id || '-'}</small></td>
        <td><small class="text-muted">${log.ip_address || '-'}</small></td>
        <td>${resultBadge}</td>
        <td><small>${formatDate(log.created_at)}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-info" onclick="viewLogDetail(${id})">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

async function viewLogDetail(id) {
  try {
    showLoading(true)
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.AUDIT_LOGS.DETAIL, { id }))

    if (response && response.success) {
      const log = response.data.log || response.data

      document.getElementById('detailLogId').textContent = log.log_id || log.id
      document.getElementById('detailCreatedAt').textContent = formatDate(log.created_at)
      // 优先使用后端返回的中文名称字段
      document.getElementById('detailOperationType').innerHTML = getOperationTypeBadge(
        log.operation_type, log.operation_type_display
      )
      document.getElementById('detailResult').innerHTML = getResultBadge(log.result || log.status, log.result_display)
      document.getElementById('detailTargetType').textContent = log.target_type_display || log.target_type || '-'
      document.getElementById('detailTargetId').textContent = log.target_id || '-'
      document.getElementById('detailOperatorId').textContent = log.operator_id || '-'
      document.getElementById('detailIpAddress').textContent = log.ip_address || '-'
      document.getElementById('detailDescription').textContent =
        log.description || log.action_description || '-'

      const changes = log.changes || log.before_data || log.after_data
      document.getElementById('detailChanges').textContent = changes
        ? JSON.stringify(changes, null, 2)
        : '无变更记录'

      const errorSection = document.getElementById('errorSection')
      if (log.error_message) {
        errorSection.style.display = 'block'
        document.getElementById('detailErrorMessage').textContent = log.error_message
      } else {
        errorSection.style.display = 'none'
      }

      new bootstrap.Modal(document.getElementById('logDetailModal')).show()
    } else {
      showError(response?.message || '获取详情失败')
    }
  } catch (error) {
    console.error('获取日志详情失败', error)
    showError('获取失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

function renderPagination(pagination) {
  const paginationEl = document.getElementById('pagination')
  if (!pagination || pagination.total_pages <= 1) {
    paginationEl.innerHTML = ''
    return
  }

  let html = ''
  const maxPages = Math.min(pagination.total_pages, 10)
  for (let i = 1; i <= maxPages; i++) {
    html += `
      <li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
      </li>
    `
  }
  if (pagination.total_pages > 10) {
    html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
  }
  paginationEl.innerHTML = html
}

function changePage(page) {
  currentPage = page
  loadAuditLogs()
}

/**
 * 获取操作类型徽章
 * @param {string} type - 操作类型英文标识
 * @param {string} displayName - 后端返回的中文显示名称（优先使用）
 */
function getOperationTypeBadge(type, displayName) {
  // 颜色映射（根据操作类型分类）
  const colorMap = {
    // 用户相关 - 绿色系
    user_create: 'bg-success',
    user_update: 'bg-info',
    user_delete: 'bg-danger',
    user_status_change: 'bg-warning',
    user_ban: 'bg-danger',
    user_unban: 'bg-success',
    // 积分资产相关 - 黄色/橙色系
    points_adjust: 'bg-warning',
    asset_adjustment: 'bg-warning',
    asset_orphan_cleanup: 'bg-secondary',
    // 商品奖品相关 - 蓝色系
    prize_config: 'bg-primary',
    prize_create: 'bg-primary',
    prize_update: 'bg-info',
    product_create: 'bg-primary',
    product_update: 'bg-info',
    // 系统配置 - 深色
    system_config: 'bg-dark',
    system_update: 'bg-dark',
    // 登录相关 - 灰色
    session_login: 'bg-secondary',
    login_success: 'bg-success',
    login_failed: 'bg-danger',
    // 审核相关
    exchange_audit: 'bg-info',
    consumption_audit: 'bg-info',
    // 市场交易
    market_listing_create: 'bg-primary',
    market_trade_complete: 'bg-success'
  }

  const typeKey = (type || '').toLowerCase()
  const badgeColor = colorMap[typeKey] || 'bg-secondary'
  
  // 优先使用后端返回的中文名称，否则使用原始类型
  const text = displayName || type || '-'
  
  return `<span class="badge ${badgeColor}">${text}</span>`
}

/**
 * 获取结果徽章
 * @param {string} result - 结果状态英文标识
 * @param {string} displayName - 后端返回的中文显示名称（优先使用）
 */
function getResultBadge(result, displayName) {
  // 颜色映射
  const colorMap = {
    success: 'bg-success',
    completed: 'bg-success',
    failed: 'bg-danger',
    error: 'bg-danger',
    pending: 'bg-warning',
    processing: 'bg-info'
  }

  const resultKey = (result || '').toLowerCase()
  const badgeColor = colorMap[resultKey] || 'bg-secondary'
  
  // 优先使用后端返回的中文名称，否则使用原始结果
  const text = displayName || result || '-'
  
  return `<span class="badge ${badgeColor}">${text}</span>`
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'
}

function showSuccess(message) {
  alert(message)
}

function showError(message) {
  alert(message)
}
