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
      const operationBadge = getOperationTypeBadge(log.operation_type)
      const resultBadge = getResultBadge(log.result || log.status)

      return `
      <tr>
        <td><small>${id}</small></td>
        <td>${operationBadge}</td>
        <td>
          <small class="text-muted">${log.target_type || '-'}</small>
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
      document.getElementById('detailOperationType').innerHTML = getOperationTypeBadge(
        log.operation_type
      )
      document.getElementById('detailResult').innerHTML = getResultBadge(log.result || log.status)
      document.getElementById('detailTargetType').textContent = log.target_type || '-'
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

function getOperationTypeBadge(type) {
  const typeMap = {
    USER_CREATE: '<span class="badge bg-success">用户创建</span>',
    USER_UPDATE: '<span class="badge bg-info">用户更新</span>',
    USER_DELETE: '<span class="badge bg-danger">用户删除</span>',
    POINTS_ADJUST: '<span class="badge bg-warning">积分调整</span>',
    PRIZE_CONFIG: '<span class="badge bg-primary">奖品配置</span>',
    ORDER_UPDATE: '<span class="badge bg-info">订单更新</span>',
    SYSTEM_CONFIG: '<span class="badge bg-dark">系统配置</span>',
    LOGIN: '<span class="badge bg-secondary">登录操作</span>'
  }
  return typeMap[type] || `<span class="badge bg-secondary">${type || '-'}</span>`
}

function getResultBadge(result) {
  const resultMap = {
    success: '<span class="badge bg-success">成功</span>',
    SUCCESS: '<span class="badge bg-success">成功</span>',
    failed: '<span class="badge bg-danger">失败</span>',
    FAILED: '<span class="badge bg-danger">失败</span>',
    error: '<span class="badge bg-danger">错误</span>',
    ERROR: '<span class="badge bg-danger">错误</span>'
  }
  return resultMap[result] || `<span class="badge bg-secondary">${result || '-'}</span>`
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
