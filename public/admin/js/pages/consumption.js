/**
 * 消费记录审核页面
 *
 * @file public/admin/js/pages/consumption.js
 * @description 消费记录列表、审核（通过/拒绝）、统计等功能
 * @version 1.0.0
 * @date 2026-01-09
 *
 * 依赖模块：
 * - /admin/js/admin-common.js  - Token管理、API请求、日期格式化
 * - /admin/js/common/toast.js  - Toast提示组件
 *
 * API端点：
 * - GET  /api/v4/shop/consumption/admin/records     - 获取消费记录列表
 * - POST /api/v4/shop/consumption/approve/:id       - 审核通过
 * - POST /api/v4/shop/consumption/reject/:id        - 审核拒绝
 */

// ==================== 全局变量 ====================

/** 当前页码 @type {number} */
let currentPage = 1

/** 当前操作的记录ID @type {number|null} */
let currentRecordId = null

/** 当前操作类型 @type {string|null} */
let currentAction = null

/** 每页显示数量 @type {number} */
const pageSize = 20

// ==================== 页面初始化 ====================

/**
 * 页面DOM加载完成后的初始化函数
 */
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 绑定事件监听器
  bindEventListeners()

  // 加载初始数据
  loadRecords()
})

/**
 * 绑定事件监听器
 */
function bindEventListeners() {
  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 搜索按钮
  document.getElementById('searchBtn').addEventListener('click', () => loadRecords())

  // 重置按钮
  document.getElementById('resetBtn').addEventListener('click', resetFilters)

  // 刷新按钮
  document.getElementById('refreshBtn').addEventListener('click', () => loadRecords(true))

  // 状态筛选器变化时重新加载
  document.getElementById('statusFilter').addEventListener('change', () => {
    currentPage = 1
    loadRecords()
  })

  // 搜索框回车触发搜索
  document.getElementById('searchInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      currentPage = 1
      loadRecords()
    }
  })

  // 备注提交按钮
  document.getElementById('remarkSubmitBtn').addEventListener('click', submitReview)

  // 事件委托：审核按钮（动态生成的元素）
  document.getElementById('recordsTableBody').addEventListener('click', e => {
    const reviewBtn = e.target.closest('.review-btn')
    if (reviewBtn) {
      const recordId = parseInt(reviewBtn.dataset.recordId)
      const action = reviewBtn.dataset.action
      reviewRecord(recordId, action)
    }
  })

  // 事件委托：分页按钮（动态生成的元素）
  document.getElementById('pagination').addEventListener('click', e => {
    e.preventDefault()
    const pageBtn = e.target.closest('.page-nav-btn')
    if (pageBtn && !pageBtn.closest('.disabled')) {
      const page = parseInt(pageBtn.dataset.page)
      if (!isNaN(page) && page > 0) {
        changePage(page)
      }
    }
  })
}

// ==================== 数据加载函数 ====================

/**
 * 加载消费记录列表
 * @param {boolean} silent - 是否静默刷新（不显示加载状态）
 */
async function loadRecords(silent = false) {
  if (!silent) {
    showLoading()
  }

  try {
    const status = document.getElementById('statusFilter').value
    const search = document.getElementById('searchInput').value.trim()

    // 构建查询参数
    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize,
      status: status
    })

    if (search) {
      params.append('search', search)
    }

    const response = await apiRequest(`/api/v4/shop/consumption/admin/records?${params.toString()}`)

    if (response && response.success) {
      renderRecords(response.data)
      updateStatistics(response.data)
    } else {
      showErrorToast(response?.message || '获取数据失败')
    }
  } catch (error) {
    console.error('加载记录失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

// ==================== 渲染函数 ====================

/**
 * 渲染记录列表
 * @param {Object} data - API返回的数据
 */
function renderRecords(data) {
  const tbody = document.getElementById('recordsTableBody')
  const records = data.records || data.list || []

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无数据</p>
        </td>
      </tr>
    `
    renderPagination(0, 0)
    return
  }

  tbody.innerHTML = records
    .map(
      record => `
    <tr>
      <td>${record.record_id}</td>
      <td>
        <div>${record.user_mobile || '-'}</div>
        <small class="text-muted">${record.user_nickname || '-'}</small>
      </td>
      <td class="fw-bold">¥${parseFloat(record.consumption_amount || 0).toFixed(2)}</td>
      <td class="text-primary">${record.points_to_award || 0}</td>
      <td>
        <div>${formatApiDate(record.created_at)}</div>
        <small class="text-muted">${record.age || '-'}</small>
      </td>
      <td>${renderStatusBadge(record.status)}</td>
      <td>
        <small class="text-muted">商家扫码</small>
      </td>
      <td class="table-actions">
        ${renderActions(record)}
      </td>
    </tr>
  `
    )
    .join('')

  // 渲染分页
  const pagination = data.pagination || {}
  const total = pagination.total || records.length
  renderPagination(total, currentPage)
}

/**
 * 格式化后端API返回的日期对象
 * @param {Object|string} dateValue - 日期值
 * @returns {string} 格式化后的日期字符串
 */
function formatApiDate(dateValue) {
  if (!dateValue) return '-'
  // 后端返回对象格式 { iso, beijing, timestamp, relative }
  if (typeof dateValue === 'object' && dateValue.beijing) {
    return dateValue.beijing
  }
  // 兼容字符串格式
  return formatDate(dateValue)
}

/**
 * 渲染状态徽章
 * @param {string} status - 状态
 * @returns {string} HTML字符串
 */
function renderStatusBadge(status) {
  const badges = {
    pending: '<span class="badge bg-warning text-dark"><i class="bi bi-clock"></i> 待审核</span>',
    approved: '<span class="badge bg-success"><i class="bi bi-check-circle"></i> 已通过</span>',
    rejected: '<span class="badge bg-danger"><i class="bi bi-x-circle"></i> 已拒绝</span>'
  }
  return badges[status] || '<span class="badge bg-secondary">未知</span>'
}

/**
 * 渲染操作按钮
 * @param {Object} record - 记录对象
 * @returns {string} HTML字符串
 */
function renderActions(record) {
  if (record.status === 'pending') {
    return `
      <button class="btn btn-sm btn-success me-1 review-btn" data-record-id="${record.record_id}" data-action="approve">
        <i class="bi bi-check-lg"></i> 通过
      </button>
      <button class="btn btn-sm btn-danger review-btn" data-record-id="${record.record_id}" data-action="reject">
        <i class="bi bi-x-lg"></i> 拒绝
      </button>
    `
  } else {
    const reviewTime = record.reviewed_at
      ? typeof record.reviewed_at === 'object'
        ? record.reviewed_at.beijing
        : formatDate(record.reviewed_at)
      : null
    const reviewInfo = reviewTime
      ? `<div><small class="text-muted">审核时间：${reviewTime}</small></div>`
      : ''
    const remark = record.admin_notes
      ? `<div><small class="text-muted">备注：${record.admin_notes}</small></div>`
      : ''
    const reviewer = record.reviewer_nickname
      ? `<div><small class="text-muted">审核员：${record.reviewer_nickname}</small></div>`
      : ''
    return `
      <small class="text-muted">已审核</small>
      ${reviewer}
      ${reviewInfo}
      ${remark}
    `
  }
}

/**
 * 渲染分页
 * @param {number} total - 总记录数
 * @param {number} current - 当前页码
 */
function renderPagination(total, current) {
  const pagination = document.getElementById('pagination')
  const totalPages = Math.ceil(total / pageSize)

  if (totalPages <= 1) {
    pagination.innerHTML = `
      <li class="page-item disabled">
        <span class="page-link">共 ${total} 条记录</span>
      </li>
    `
    return
  }

  let html = `
    <li class="page-item ${current === 1 ? 'disabled' : ''}">
      <a class="page-link page-nav-btn" href="#" data-page="${current - 1}">上一页</a>
    </li>
  `

  const maxPages = 7
  let startPage = Math.max(1, current - Math.floor(maxPages / 2))
  let endPage = Math.min(totalPages, startPage + maxPages - 1)

  if (endPage - startPage < maxPages - 1) {
    startPage = Math.max(1, endPage - maxPages + 1)
  }

  if (startPage > 1) {
    html += `<li class="page-item"><a class="page-link page-nav-btn" href="#" data-page="1">1</a></li>`
    if (startPage > 2) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `
      <li class="page-item ${i === current ? 'active' : ''}">
        <a class="page-link page-nav-btn" href="#" data-page="${i}">${i}</a>
      </li>
    `
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`
    }
    html += `<li class="page-item"><a class="page-link page-nav-btn" href="#" data-page="${totalPages}">${totalPages}</a></li>`
  }

  html += `
    <li class="page-item ${current === totalPages ? 'disabled' : ''}">
      <a class="page-link page-nav-btn" href="#" data-page="${current + 1}">下一页</a>
    </li>
  `

  pagination.innerHTML = html
}

/**
 * 更新统计信息
 * @param {Object} data - API返回的数据
 */
function updateStatistics(data) {
  if (data.statistics) {
    document.getElementById('pendingCount').textContent = formatNumber(data.statistics.pending || 0)
    document.getElementById('todayCount').textContent = formatNumber(data.statistics.today || 0)
    document.getElementById('approvedCount').textContent = formatNumber(
      data.statistics.approved || 0
    )
    document.getElementById('rejectedCount').textContent = formatNumber(
      data.statistics.rejected || 0
    )
  }
}

// ==================== 操作函数 ====================

/**
 * 切换页码
 * @param {number} page - 目标页码
 */
function changePage(page) {
  currentPage = page
  loadRecords()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/**
 * 重置筛选器
 */
function resetFilters() {
  document.getElementById('statusFilter').value = 'pending'
  document.getElementById('searchInput').value = ''
  currentPage = 1
  loadRecords()
}

/**
 * 审核记录
 * @param {number} recordId - 记录ID
 * @param {string} action - 操作类型（approve/reject）
 */
function reviewRecord(recordId, action) {
  currentRecordId = recordId
  currentAction = action

  const modal = new bootstrap.Modal(document.getElementById('remarkModal'))
  document.getElementById('remarkModalTitle').textContent =
    action === 'approve' ? '审核通过 - 备注' : '审核拒绝 - 备注'
  document.getElementById('remarkInput').value = ''
  document.getElementById('remarkInput').placeholder =
    action === 'approve' ? '请输入通过原因（可选）' : '请输入拒绝原因（建议填写）'

  modal.show()
}

/**
 * 提交审核
 */
async function submitReview() {
  const remark = document.getElementById('remarkInput').value.trim()

  if (currentAction === 'reject' && !remark) {
    showWarningToast('拒绝审核时建议填写拒绝原因')
    return
  }

  showLoading()

  try {
    const endpoint =
      currentAction === 'approve'
        ? `/api/v4/shop/consumption/approve/${currentRecordId}`
        : `/api/v4/shop/consumption/reject/${currentRecordId}`

    const response = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ admin_notes: remark })
    })

    if (response && response.success) {
      showSuccessToast(currentAction === 'approve' ? '记录已审核通过' : '记录已拒绝')

      // 关闭模态框
      bootstrap.Modal.getInstance(document.getElementById('remarkModal')).hide()

      // 重新加载数据
      loadRecords(true)
    } else {
      showErrorToast(response?.message || '操作失败')
    }
  } catch (error) {
    console.error('审核失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

// ==================== 工具函数 ====================

/**
 * 显示加载状态
 */
function showLoading() {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.classList.add('show')
  }
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.classList.remove('show')
  }
}
