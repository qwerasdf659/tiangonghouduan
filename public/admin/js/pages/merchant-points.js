/**
 * 商家积分审核页面逻辑
 * @file public/admin/js/pages/merchant-points.js
 * @description 审核商家提交的用户积分发放申请
 * @version 1.1.0
 * @date 2026-01-09
 *
 * 后端API端点（适配版）:
 * - GET  /api/v4/console/merchant-points - 获取申请列表
 * - GET  /api/v4/console/merchant-points/:audit_id - 获取详情
 * - POST /api/v4/console/merchant-points/:audit_id/approve - 审核通过
 * - POST /api/v4/console/merchant-points/:audit_id/reject - 审核拒绝
 * - GET  /api/v4/console/merchant-points/stats/pending - 待审核统计
 */

// ================================
// 商家积分审核 - 前端逻辑（适配后端API）
// ================================

// 全局变量
let currentPage = 1
const pageSize = 20
let selectedItems = new Set()
let currentAuditId = null

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 事件监听器
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('refreshBtn').addEventListener('click', loadData)
  document.getElementById('statusFilter').addEventListener('change', loadData)
  document.getElementById('timeRangeFilter').addEventListener('change', loadData)

  document.getElementById('headerCheckbox').addEventListener('change', toggleSelectAll)
  document.getElementById('batchApproveBtn').addEventListener('click', batchApprove)
  document.getElementById('batchRejectBtn').addEventListener('click', batchReject)
  document.getElementById('approveBtn').addEventListener('click', () => reviewSingle('approve'))
  document.getElementById('rejectBtn').addEventListener('click', () => reviewSingle('reject'))

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载数据
  loadData()
  // 加载待审核统计
  loadPendingStats()
})

/**
 * 加载待审核统计
 */
async function loadPendingStats() {
  try {
    // 后端API: GET /api/v4/console/merchant-points/stats/pending
    const response = await apiRequest('/api/v4/console/merchant-points/stats/pending')
    if (response && response.success) {
      document.getElementById('pendingCount').textContent = response.data.pending_count || 0
    }
  } catch (error) {
    console.error('加载待审核统计失败:', error)
  }
}

/**
 * 加载数据
 */
async function loadData() {
  showLoading(true)
  const tbody = document.getElementById('reviewTableBody')

  try {
    const status = document.getElementById('statusFilter').value
    const timeRange = document.getElementById('timeRangeFilter').value

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize
    })

    if (status) params.append('status', status)
    if (timeRange) params.append('time_range', timeRange)

    // 后端API: GET /api/v4/console/merchant-points
    const response = await apiRequest(`/api/v4/console/merchant-points?${params.toString()}`)

    if (response && response.success) {
      const { rows, count, pagination } = response.data

      // 更新统计（从列表数据计算）
      updateStatisticsFromList(rows || [])

      // 渲染表格
      renderTable(rows || [])

      // 渲染分页
      if (pagination) {
        renderPagination(pagination)
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5 text-muted">
            <i class="bi bi-inbox" style="font-size: 3rem;"></i>
            <p class="mt-2">暂无数据</p>
          </td>
        </tr>
      `
    }
  } catch (error) {
    console.error('加载数据失败:', error)
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  } finally {
    showLoading(false)
  }
}

/**
 * 从列表数据更新统计
 * @param {Array} rows - 申请列表
 */
function updateStatisticsFromList(rows) {
  const pending = rows.filter(r => r.status === 'pending').length
  const approved = rows.filter(r => r.status === 'approved').length
  const rejected = rows.filter(r => r.status === 'rejected').length
  const totalPoints = rows
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + (r.points || 0), 0)

  document.getElementById('approvedCount').textContent = approved
  document.getElementById('rejectedCount').textContent = rejected
  document.getElementById('totalPoints').textContent = totalPoints
}

/**
 * 渲染表格
 * @param {Array} applications - 申请列表
 */
function renderTable(applications) {
  const tbody = document.getElementById('reviewTableBody')

  if (!applications || applications.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无申请记录</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = applications
    .map(app => {
      const statusBadge =
        {
          pending: '<span class="badge bg-warning">待审核</span>',
          approved: '<span class="badge bg-success">已通过</span>',
          rejected: '<span class="badge bg-danger">已拒绝</span>',
          cancelled: '<span class="badge bg-secondary">已取消</span>'
        }[app.status] || '<span class="badge bg-secondary">未知</span>'

      const isChecked = selectedItems.has(app.audit_id)
      const isPending = app.status === 'pending'

      // 后端返回的字段名称可能不同，做兼容处理
      const auditId = app.audit_id || app.application_id || app.id
      const points = app.points || app.request_points || 0
      const userName = app.user_nickname || app.user_name || app.user_mobile || '-'
      const merchantName = app.merchant_name || '-'
      const consumptionAmount = app.consumption_amount || app.amount || 0
      const reviewerName = app.reviewer_name || app.auditor_name || '-'

      return `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input row-checkbox" 
                 data-id="${auditId}" 
                 ${isChecked ? 'checked' : ''}
                 ${!isPending ? 'disabled' : ''}
                 onchange="toggleRowSelection(${auditId})">
        </td>
        <td>${auditId}</td>
        <td>${merchantName}</td>
        <td>${userName}</td>
        <td class="text-warning"><strong>${points}</strong></td>
        <td>¥${parseFloat(consumptionAmount).toFixed(2)}</td>
        <td>${formatDate(app.created_at)}</td>
        <td>${statusBadge}</td>
        <td>${reviewerName}</td>
        <td>
          ${
            isPending
              ? `
            <button class="btn btn-sm btn-outline-primary" onclick="showReviewModal(${auditId})">
              <i class="bi bi-clipboard-check"></i> 审核
            </button>
          `
              : `
            <button class="btn btn-sm btn-outline-secondary" onclick="showDetail(${auditId})">
              <i class="bi bi-eye"></i> 详情
            </button>
          `
          }
        </td>
      </tr>
    `
    })
    .join('')

  updateBatchButtons()
}

/**
 * 切换行选择
 * @param {number} auditId - 审核ID
 */
function toggleRowSelection(auditId) {
  if (selectedItems.has(auditId)) {
    selectedItems.delete(auditId)
  } else {
    selectedItems.add(auditId)
  }
  updateBatchButtons()
}

/**
 * 切换全选
 */
function toggleSelectAll() {
  const isChecked = document.getElementById('headerCheckbox').checked
  const checkboxes = document.querySelectorAll('.row-checkbox:not(:disabled)')

  checkboxes.forEach(checkbox => {
    checkbox.checked = isChecked
    const auditId = parseInt(checkbox.dataset.id)
    if (isChecked) {
      selectedItems.add(auditId)
    } else {
      selectedItems.delete(auditId)
    }
  })

  updateBatchButtons()
}

/**
 * 更新批量操作按钮状态
 */
function updateBatchButtons() {
  const hasSelection = selectedItems.size > 0
  document.getElementById('batchApproveBtn').disabled = !hasSelection
  document.getElementById('batchRejectBtn').disabled = !hasSelection
}

/**
 * 显示审核模态框
 * @param {number} auditId - 审核ID
 */
async function showReviewModal(auditId) {
  currentAuditId = auditId

  try {
    // 后端API: GET /api/v4/console/merchant-points/:audit_id
    const response = await apiRequest(`/api/v4/console/merchant-points/${auditId}`)

    if (response && response.success) {
      const app = response.data

      document.getElementById('modalApplyId').textContent = app.audit_id || app.id
      document.getElementById('modalMerchant').textContent = app.merchant_name || '-'
      document.getElementById('modalUser').textContent =
        app.user_nickname || app.user_name || app.user_mobile || '-'
      document.getElementById('modalPoints').textContent = app.points || app.request_points || 0
      document.getElementById('modalAmount').textContent =
        '¥' + parseFloat(app.consumption_amount || app.amount || 0).toFixed(2)
      document.getElementById('modalRemark').textContent = app.remark || app.reason || '-'
      document.getElementById('reviewComment').value = ''

      new bootstrap.Modal(document.getElementById('reviewModal')).show()
    } else {
      showErrorToast(response?.message || '获取详情失败')
    }
  } catch (error) {
    console.error('获取申请详情失败:', error)
    showErrorToast('获取详情失败')
  }
}

/**
 * 审核单个申请
 * @param {string} action - 审核操作 (approve/reject)
 */
async function reviewSingle(action) {
  if (!currentAuditId) return

  const comment = document.getElementById('reviewComment').value.trim()

  // 如果是拒绝，检查是否填写了原因
  if (action === 'reject' && !comment) {
    showWarningToast('请填写拒绝原因')
    return
  }

  showLoading(true)

  try {
    // 后端API: POST /api/v4/console/merchant-points/:audit_id/approve 或 /reject
    const response = await apiRequest(
      `/api/v4/console/merchant-points/${currentAuditId}/${action}`,
      {
        method: 'POST',
        body: JSON.stringify({
          reason: comment
        })
      }
    )

    if (response && response.success) {
      showSuccessToast(action === 'approve' ? '审核通过' : '审核拒绝')
      bootstrap.Modal.getInstance(document.getElementById('reviewModal')).hide()
      loadData()
      loadPendingStats()
    } else {
      showErrorToast(response?.message || '审核失败')
    }
  } catch (error) {
    console.error('审核失败:', error)
    showErrorToast('审核失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 批量通过
 * 注意：后端不支持批量审核，这里改为逐个处理
 */
async function batchApprove() {
  if (selectedItems.size === 0) return

  if (!confirm(`确定要批量通过 ${selectedItems.size} 条申请吗？\n注意：将逐个处理每条申请`)) {
    return
  }

  showLoading(true)

  let successCount = 0
  let failCount = 0

  try {
    // 逐个调用审核通过API
    for (const auditId of selectedItems) {
      try {
        const response = await apiRequest(`/api/v4/console/merchant-points/${auditId}/approve`, {
          method: 'POST',
          body: JSON.stringify({ reason: '批量审核通过' })
        })

        if (response && response.success) {
          successCount++
        } else {
          failCount++
        }
      } catch (error) {
        failCount++
        console.error(`审核 ${auditId} 失败:`, error)
      }
    }

    if (successCount > 0) {
      showSuccessToast(
        `成功通过 ${successCount} 条申请${failCount > 0 ? `，${failCount} 条失败` : ''}`
      )
    } else {
      showErrorToast('批量操作失败')
    }

    selectedItems.clear()
    loadData()
    loadPendingStats()
  } catch (error) {
    console.error('批量操作失败:', error)
    showErrorToast('批量操作失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 批量拒绝
 * 注意：后端不支持批量审核，这里改为逐个处理
 */
async function batchReject() {
  if (selectedItems.size === 0) return

  const reason = prompt('请输入拒绝原因（必填）：')
  if (!reason || reason.trim() === '') {
    showWarningToast('拒绝原因不能为空')
    return
  }

  showLoading(true)

  let successCount = 0
  let failCount = 0

  try {
    // 逐个调用审核拒绝API
    for (const auditId of selectedItems) {
      try {
        const response = await apiRequest(`/api/v4/console/merchant-points/${auditId}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim() })
        })

        if (response && response.success) {
          successCount++
        } else {
          failCount++
        }
      } catch (error) {
        failCount++
        console.error(`审核 ${auditId} 失败:`, error)
      }
    }

    if (successCount > 0) {
      showSuccessToast(
        `成功拒绝 ${successCount} 条申请${failCount > 0 ? `，${failCount} 条失败` : ''}`
      )
    } else {
      showErrorToast('批量操作失败')
    }

    selectedItems.clear()
    loadData()
    loadPendingStats()
  } catch (error) {
    console.error('批量操作失败:', error)
    showErrorToast('批量操作失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 显示详情
 * @param {number} auditId - 审核ID
 */
function showDetail(auditId) {
  showReviewModal(auditId)
}

/**
 * 渲染分页
 * @param {Object} pagination - 分页信息
 */
function renderPagination(pagination) {
  const nav = document.getElementById('paginationNav')
  if (!pagination || pagination.total_pages <= 1) {
    nav.innerHTML = ''
    return
  }

  let html = '<ul class="pagination pagination-sm justify-content-center mb-0">'

  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage - 1}); return false;">上一页</a>
    </li>
  `

  for (let i = 1; i <= pagination.total_pages; i++) {
    if (i === 1 || i === pagination.total_pages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a>
        </li>
      `
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
    }
  }

  html += `
    <li class="page-item ${currentPage === pagination.total_pages ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage + 1}); return false;">下一页</a>
    </li>
  `

  html += '</ul>'
  nav.innerHTML = html
}

/**
 * 跳转到指定页
 * @param {number} page - 页码
 */
function goToPage(page) {
  currentPage = page
  loadData()
}

/**
 * 显示/隐藏加载状态
 * @param {boolean} show - 是否显示
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.classList.toggle('show', show)
  }
}
