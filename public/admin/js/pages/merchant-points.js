/**
 * 商家积分审核页面逻辑
 * @file public/admin/js/pages/merchant-points.js
 * @description 审核商家提交的用户积分发放申请
 * @version 2.1.0
 * @date 2026-01-09
 *
 * 后端API端点:
 * - GET  /api/v4/console/merchant-points - 获取申请列表
 * - GET  /api/v4/console/merchant-points/:audit_id - 获取详情
 * - POST /api/v4/console/merchant-points/:audit_id/approve - 审核通过
 * - POST /api/v4/console/merchant-points/:audit_id/reject - 审核拒绝
 * - GET  /api/v4/console/merchant-points/stats/pending - 待审核统计
 *
 * 后端返回字段（以后端为准）:
 * - audit_id: 审核记录ID
 * - user_id: 申请用户ID
 * - applicant: { user_id, nickname, mobile } - 申请人信息
 * - points_amount: 申请积分数量
 * - description: 申请描述
 * - status: 审核状态 (pending/approved/rejected/cancelled)
 * - priority: 优先级
 * - auditor: { user_id, nickname, mobile } - 审核员信息
 * - audit_reason: 审核意见/拒绝原因
 * - submitted_at: 提交时间
 * - audited_at: 审核时间
 * - created_at: 创建时间
 * 
 * CSP兼容：使用事件委托代替内联事件处理器
 */

// ================================
// 商家积分审核 - 前端逻辑（直接使用后端字段名）
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
  document.getElementById('statusFilter').addEventListener('change', function() {
    currentPage = 1
    loadData()
  })
  document.getElementById('timeRangeFilter').addEventListener('change', function() {
    currentPage = 1
    loadData()
  })
  document.getElementById('priorityFilter').addEventListener('change', function() {
    currentPage = 1
    loadData()
  })

  document.getElementById('headerCheckbox').addEventListener('change', toggleSelectAll)
  document.getElementById('batchApproveBtn').addEventListener('click', batchApprove)
  document.getElementById('batchRejectBtn').addEventListener('click', batchReject)
  document.getElementById('approveBtn').addEventListener('click', function() {
    reviewSingle('approve')
  })
  document.getElementById('rejectBtn').addEventListener('click', function() {
    reviewSingle('reject')
  })

  // 事件委托：处理表格内的点击事件（CSP兼容）
  document.getElementById('reviewTableBody').addEventListener('click', handleTableClick)
  document.getElementById('reviewTableBody').addEventListener('change', handleTableChange)
  
  // 事件委托：处理分页点击事件（CSP兼容）
  document.getElementById('paginationNav').addEventListener('click', handlePaginationClick)

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
 * 处理表格内的点击事件（事件委托）
 * @param {Event} event 
 */
function handleTableClick(event) {
  const target = event.target.closest('button')
  if (!target) return

  const auditId = parseInt(target.dataset.auditId)
  if (!auditId) return

  if (target.classList.contains('btn-review')) {
    showReviewModal(auditId)
  } else if (target.classList.contains('btn-detail')) {
    showDetail(auditId)
  }
}

/**
 * 处理表格内的change事件（事件委托）
 * @param {Event} event 
 */
function handleTableChange(event) {
  const target = event.target
  if (!target.classList.contains('row-checkbox')) return

  const auditId = parseInt(target.dataset.id)
  if (!auditId) return

  toggleRowSelection(auditId)
}

/**
 * 处理分页点击事件（事件委托）
 * @param {Event} event 
 */
function handlePaginationClick(event) {
  event.preventDefault()
  const target = event.target.closest('a')
  if (!target) return
  if (target.parentElement.classList.contains('disabled')) return

  const page = parseInt(target.dataset.page)
  if (page && page > 0) {
    goToPage(page)
  }
}

/**
 * 加载待审核统计
 */
async function loadPendingStats() {
  try {
    const response = await apiRequest('/api/v4/console/merchant-points/stats/pending')
    if (response && response.success) {
      // 更新所有统计卡片
      document.getElementById('pendingCount').textContent = response.data.pending_count || 0
      document.getElementById('approvedCount').textContent = response.data.approved_count || 0
      document.getElementById('rejectedCount').textContent = response.data.rejected_count || 0
      document.getElementById('totalPoints').textContent = response.data.today_points || 0
    }
  } catch (error) {
    console.error('加载统计失败:', error)
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
    const priority = document.getElementById('priorityFilter').value

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize
    })

    if (status) params.append('status', status)
    if (timeRange) params.append('time_range', timeRange)
    if (priority) params.append('priority', priority)

    const response = await apiRequest(`/api/v4/console/merchant-points?${params.toString()}`)

    if (response && response.success) {
      const { rows, count, pagination } = response.data

      // 渲染表格
      renderTable(rows || [])
      
      // 重新加载统计数据（从stats API获取准确统计）
      loadPendingStats()

      // 渲染分页
      if (pagination) {
        renderPagination(pagination)
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-5 text-muted">
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
        <td colspan="9" class="text-center py-5 text-danger">
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
  // 使用后端字段名 status 和 points_amount
  const pending = rows.filter(r => r.status === 'pending').length
  const approved = rows.filter(r => r.status === 'approved').length
  const rejected = rows.filter(r => r.status === 'rejected').length
  const totalPoints = rows
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + (r.points_amount || 0), 0)

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
        <td colspan="9" class="text-center py-5 text-muted">
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

      // 直接使用后端字段名，不做复杂映射
      const auditId = app.audit_id
      const pointsAmount = app.points_amount || 0
      
      // 申请人信息：使用 applicant 对象
      const applicantName = app.applicant 
        ? (app.applicant.nickname || app.applicant.mobile || `用户${app.applicant.user_id}`)
        : `用户${app.user_id}`
      
      // 审核员信息：使用 auditor 对象
      const auditorName = app.auditor 
        ? (app.auditor.nickname || app.auditor.mobile || `管理员${app.auditor.user_id}`)
        : '-'
      
      // 申请描述
      const description = app.description || '-'
      
      // 提交时间
      const submittedAt = app.submitted_at || app.created_at

      // 使用 data-* 属性代替内联事件（CSP兼容）
      return `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input row-checkbox" 
                 data-id="${auditId}" 
                 ${isChecked ? 'checked' : ''}
                 ${!isPending ? 'disabled' : ''}>
        </td>
        <td>${auditId}</td>
        <td>${applicantName}</td>
        <td class="text-warning"><strong>${pointsAmount}</strong></td>
        <td title="${description}">${description.length > 20 ? description.substring(0, 20) + '...' : description}</td>
        <td>${formatDate(submittedAt)}</td>
        <td>${statusBadge}</td>
        <td>${auditorName}</td>
        <td>
          ${
            isPending
              ? `
            <button class="btn btn-sm btn-outline-primary btn-review" data-audit-id="${auditId}">
              <i class="bi bi-clipboard-check"></i> 审核
            </button>
          `
              : `
            <button class="btn btn-sm btn-outline-secondary btn-detail" data-audit-id="${auditId}">
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
    const response = await apiRequest(`/api/v4/console/merchant-points/${auditId}`)

    if (response && response.success) {
      const app = response.data

      // 直接使用后端字段名
      document.getElementById('modalApplyId').textContent = app.audit_id
      
      // 申请人信息
      const applicantName = app.applicant 
        ? (app.applicant.nickname || app.applicant.mobile || `用户${app.applicant.user_id}`)
        : `用户${app.user_id}`
      document.getElementById('modalUser').textContent = applicantName
      
      // 积分数量
      document.getElementById('modalPoints').textContent = app.points_amount || 0
      
      // 申请描述
      document.getElementById('modalRemark').textContent = app.description || '-'
      
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
 */
async function batchApprove() {
  if (selectedItems.size === 0) return

  if (!confirm(`确定要批量通过 ${selectedItems.size} 条申请吗？`)) {
    return
  }

  showLoading(true)

  let successCount = 0
  let failCount = 0

  try {
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
 * 渲染分页（使用 data-* 属性代替内联事件，CSP兼容）
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
      <a class="page-link" href="#" data-page="${currentPage - 1}">上一页</a>
    </li>
  `

  for (let i = 1; i <= pagination.total_pages; i++) {
    if (i === 1 || i === pagination.total_pages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>
      `
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
    }
  }

  html += `
    <li class="page-item ${currentPage === pagination.total_pages ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage + 1}">下一页</a>
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
