/**
 * 用户反馈管理页面 - JavaScript逻辑
 * 从feedbacks.html提取，遵循前端工程化最佳实践
 */

// ========== 全局变量 ==========
let currentPage = 1
const pageSize = 20

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  checkAuth()
  loadFeedbacks()
  loadStats() // 加载统计数据
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

function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('searchBtn').addEventListener('click', handleSearch)
  document.getElementById('submitReplyBtn').addEventListener('click', handleReply)
  document.getElementById('submitStatusBtn').addEventListener('click', handleUpdateStatus)

  // 使用事件委托处理表格按钮点击（避免CSP内联脚本限制）
  document.getElementById('feedbacksTableBody').addEventListener('click', function (e) {
    const btn = e.target.closest('button')
    if (!btn) return

    const feedbackId = btn.dataset.id
    if (!feedbackId) return

    if (btn.classList.contains('btn-view')) {
      viewFeedback(feedbackId)
    } else if (btn.classList.contains('btn-reply')) {
      openReplyModal(feedbackId)
    } else if (btn.classList.contains('btn-status')) {
      openStatusModal(feedbackId)
    }
  })

  // 使用事件委托处理分页点击
  document.getElementById('pagination').addEventListener('click', function (e) {
    const link = e.target.closest('a')
    if (!link) return
    e.preventDefault()
    const page = parseInt(link.dataset.page)
    if (page) changePage(page)
  })
}

function handleSearch() {
  currentPage = 1
  loadFeedbacks()
}

async function loadFeedbacks() {
  try {
    showLoading(true)

    const status = document.getElementById('statusFilter').value
    const category = document.getElementById('typeFilter').value // 后端使用category字段
    const userId = document.getElementById('userIdSearch').value.trim()

    // 后端使用limit/offset分页，转换参数
    const params = new URLSearchParams({
      limit: pageSize,
      offset: (currentPage - 1) * pageSize
    })

    if (status) params.append('status', status)
    if (category) params.append('category', category) // 后端使用category字段
    if (userId) params.append('user_id', userId)

    const response = await apiRequest(`/api/v4/console/system/feedbacks?${params}`)

    if (response && response.success) {
      const feedbacks = response.data.feedbacks || response.data.list || []
      const total = response.data.total || feedbacks.length
      renderFeedbacks(feedbacks)
      // 构造分页信息
      const pagination = {
        total: total,
        total_pages: Math.ceil(total / pageSize),
        current_page: currentPage
      }
      renderPagination(pagination)
      updateStats(response.data) // 传递整个data对象用于统计
    } else {
      showError(response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载反馈列表失败', error)
    showError('加载失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

function renderFeedbacks(feedbacks) {
  const tbody = document.getElementById('feedbacksTableBody')

  if (!feedbacks || feedbacks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">暂无数据</td></tr>'
    return
  }

  tbody.innerHTML = feedbacks
    .map(item => {
      const statusBadge = getStatusBadge(item.status)
      // 后端使用category字段（技术修正）
      const categoryBadge = getCategoryBadge(item.category)
      const id = item.feedback_id || item.id
      // 后端关联查询返回user对象
      const userDisplay = item.user
        ? `${item.user.nickname || '用户'} (ID: ${item.user_id})`
        : `ID: ${item.user_id}`

      return `
      <tr>
        <td>${id}</td>
        <td>${escapeHtml(userDisplay)}</td>
        <td>${categoryBadge}</td>
        <td>
          <div style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(item.content || '')}
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>${formatDate(item.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-info btn-view" data-id="${id}">
            <i class="bi bi-eye"></i> 详情
          </button>
          <button class="btn btn-sm btn-outline-primary btn-reply" data-id="${id}">
            <i class="bi bi-reply"></i> 回复
          </button>
          <button class="btn btn-sm btn-outline-warning btn-status" data-id="${id}">
            <i class="bi bi-arrow-repeat"></i> 状态
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

// 从列表数据更新统计（通过遍历全部数据）
async function loadStats() {
  try {
    // 获取全部反馈数据（不分页）来统计
    const response = await apiRequest('/api/v4/console/system/feedbacks?limit=1000&offset=0')
    if (response && response.success) {
      const feedbacks = response.data.feedbacks || []
      const stats = {
        total: response.data.total || feedbacks.length,
        pending: feedbacks.filter(f => f.status === 'pending').length,
        processing: feedbacks.filter(f => f.status === 'processing').length,
        resolved: feedbacks.filter(f => f.status === 'replied' || f.status === 'closed').length
      }
      document.getElementById('totalFeedbacks').textContent = stats.total
      document.getElementById('pendingFeedbacks').textContent = stats.pending
      document.getElementById('processingFeedbacks').textContent = stats.processing
      document.getElementById('resolvedFeedbacks').textContent = stats.resolved
    }
  } catch (error) {
    console.error('加载统计数据失败', error)
  }
}

// 备用：从列表数据更新统计
function updateStats(data) {
  // 优先使用后端返回的total
  const total = data.total || 0
  document.getElementById('totalFeedbacks').textContent = total
}

async function viewFeedback(id) {
  try {
    showLoading(true)
    const response = await apiRequest(`/api/v4/console/system/feedbacks/${id}`)

    if (response && response.success) {
      const item = response.data.feedback || response.data

      document.getElementById('detailId').textContent = item.feedback_id || item.id
      // 后端关联查询返回user对象
      const userDisplay = item.user
        ? `${item.user.nickname || '用户'} (ID: ${item.user_id})`
        : item.user_id
      document.getElementById('detailUserId').textContent = userDisplay
      // 后端使用category字段（技术修正）
      document.getElementById('detailType').innerHTML = getCategoryBadge(item.category)
      document.getElementById('detailStatus').innerHTML = getStatusBadge(item.status)
      document.getElementById('detailContent').textContent = item.content || '-'
      document.getElementById('detailCreatedAt').textContent = formatDate(item.created_at)
      document.getElementById('detailUpdatedAt').textContent = formatDate(item.updated_at)

      // 后端使用attachments字段存储附件（技术修正）
      const imagesSection = document.getElementById('imagesSection')
      const imagesContainer = document.getElementById('detailImages')
      const attachments = item.attachments || []
      if (attachments && attachments.length > 0) {
        imagesSection.style.display = 'block'
        imagesContainer.innerHTML = attachments
          .map(
            img =>
              `<img src="${img}" class="img-thumbnail" style="max-width: 150px; cursor: pointer;" onclick="window.open('${img}', '_blank')">`
          )
          .join('')
      } else {
        imagesSection.style.display = 'none'
      }

      // 后端使用reply_content字段存储回复内容（技术修正）
      const replySection = document.getElementById('replySection')
      if (item.reply_content) {
        replySection.style.display = 'block'
        document.getElementById('detailReply').textContent = item.reply_content
      } else {
        replySection.style.display = 'none'
      }

      new bootstrap.Modal(document.getElementById('feedbackDetailModal')).show()
    } else {
      showError(response?.message || '获取详情失败')
    }
  } catch (error) {
    console.error('获取反馈详情失败', error)
    showError('获取失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

function openReplyModal(id) {
  document.getElementById('replyFeedbackId').value = id
  document.getElementById('replyContent').value = ''
  new bootstrap.Modal(document.getElementById('replyModal')).show()
}

async function handleReply() {
  const id = document.getElementById('replyFeedbackId').value
  const content = document.getElementById('replyContent').value.trim()

  if (!content) {
    showError('请输入回复内容')
    return
  }

  try {
    showLoading(true)
    // 后端使用reply_content参数（技术修正）
    const response = await apiRequest(`/api/v4/console/system/feedbacks/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply_content: content })
    })

    if (response && response.success) {
      showSuccess('回复成功')
      bootstrap.Modal.getInstance(document.getElementById('replyModal')).hide()
      loadFeedbacks()
    } else {
      showError(response?.message || '回复失败')
    }
  } catch (error) {
    console.error('回复反馈失败', error)
    showError('回复失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

function openStatusModal(id) {
  document.getElementById('updateFeedbackId').value = id
  document.getElementById('newStatus').value = ''
  new bootstrap.Modal(document.getElementById('updateStatusModal')).show()
}

async function handleUpdateStatus() {
  const id = document.getElementById('updateFeedbackId').value
  const status = document.getElementById('newStatus').value

  if (!status) {
    showError('请选择新状态')
    return
  }

  try {
    showLoading(true)
    const response = await apiRequest(`/api/v4/console/system/feedbacks/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    })

    if (response && response.success) {
      showSuccess('状态更新成功')
      bootstrap.Modal.getInstance(document.getElementById('updateStatusModal')).hide()
      loadFeedbacks()
    } else {
      showError(response?.message || '更新失败')
    }
  } catch (error) {
    console.error('更新状态失败', error)
    showError('更新失败，请稍后重试')
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
  for (let i = 1; i <= pagination.total_pages; i++) {
    html += `
      <li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>
    `
  }
  paginationEl.innerHTML = html
}

function changePage(page) {
  currentPage = page
  loadFeedbacks()
}

function getStatusBadge(status) {
  // 后端状态枚举: pending, processing, replied, closed（技术修正）
  const map = {
    pending: '<span class="badge bg-warning">待处理</span>',
    processing: '<span class="badge bg-info">处理中</span>',
    replied: '<span class="badge bg-success">已回复</span>',
    closed: '<span class="badge bg-secondary">已关闭</span>'
  }
  return map[status] || `<span class="badge bg-secondary">${status || '未知'}</span>`
}

// 后端使用category字段，枚举值: technical, feature, bug, complaint, suggestion, other（技术修正）
function getCategoryBadge(category) {
  const map = {
    technical: '<span class="badge bg-purple" style="background-color:#6f42c1">技术问题</span>',
    feature: '<span class="badge bg-primary">功能建议</span>',
    bug: '<span class="badge bg-danger">Bug报告</span>',
    complaint: '<span class="badge bg-warning text-dark">投诉</span>',
    suggestion: '<span class="badge bg-info">建议</span>',
    other: '<span class="badge bg-secondary">其他</span>'
  }
  return map[category] || `<span class="badge bg-secondary">${category || '未知'}</span>`
}

// 保留旧函数名作为别名，兼容可能的外部调用
function getTypeBadge(type) {
  return getCategoryBadge(type)
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
  alert('✅ ' + message)
}

function showError(message) {
  alert('❌ ' + message)
}
