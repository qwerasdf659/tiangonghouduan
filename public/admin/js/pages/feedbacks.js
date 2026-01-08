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
}

function handleSearch() {
  currentPage = 1
  loadFeedbacks()
}

async function loadFeedbacks() {
  try {
    showLoading(true)

    const status = document.getElementById('statusFilter').value
    const type = document.getElementById('typeFilter').value
    const userId = document.getElementById('userIdSearch').value.trim()

    const params = new URLSearchParams({ page: currentPage, page_size: pageSize })

    if (status) params.append('status', status)
    if (type) params.append('type', type)
    if (userId) params.append('user_id', userId)

    const response = await apiRequest(`/api/v4/console/system/feedbacks?${params}`)

    if (response && response.success) {
      const feedbacks = response.data.feedbacks || response.data.list || []
      renderFeedbacks(feedbacks)
      renderPagination(response.data.pagination)
      updateStats(feedbacks)
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
      const typeBadge = getTypeBadge(item.type || item.feedback_type)
      const id = item.feedback_id || item.id

      return `
      <tr>
        <td>${id}</td>
        <td>ID: ${item.user_id}</td>
        <td>${typeBadge}</td>
        <td>
          <div style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(item.content || '')}
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>${formatDate(item.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-info" onclick="viewFeedback(${id})">
            <i class="bi bi-eye"></i> 详情
          </button>
          <button class="btn btn-sm btn-outline-primary" onclick="openReplyModal(${id})">
            <i class="bi bi-reply"></i> 回复
          </button>
          <button class="btn btn-sm btn-outline-warning" onclick="openStatusModal(${id})">
            <i class="bi bi-arrow-repeat"></i> 状态
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

function updateStats(feedbacks) {
  const stats = {
    total: feedbacks.length,
    pending: feedbacks.filter(f => f.status === 'pending').length,
    processing: feedbacks.filter(f => f.status === 'processing').length,
    resolved: feedbacks.filter(f => f.status === 'resolved').length
  }

  document.getElementById('totalFeedbacks').textContent = stats.total
  document.getElementById('pendingFeedbacks').textContent = stats.pending
  document.getElementById('processingFeedbacks').textContent = stats.processing
  document.getElementById('resolvedFeedbacks').textContent = stats.resolved
}

async function viewFeedback(id) {
  try {
    showLoading(true)
    const response = await apiRequest(`/api/v4/console/system/feedbacks/${id}`)

    if (response && response.success) {
      const item = response.data.feedback || response.data

      document.getElementById('detailId').textContent = item.feedback_id || item.id
      document.getElementById('detailUserId').textContent = item.user_id
      document.getElementById('detailType').innerHTML = getTypeBadge(
        item.type || item.feedback_type
      )
      document.getElementById('detailStatus').innerHTML = getStatusBadge(item.status)
      document.getElementById('detailContent').textContent = item.content || '-'
      document.getElementById('detailCreatedAt').textContent = formatDate(item.created_at)
      document.getElementById('detailUpdatedAt').textContent = formatDate(item.updated_at)

      const imagesSection = document.getElementById('imagesSection')
      const imagesContainer = document.getElementById('detailImages')
      if (item.images && item.images.length > 0) {
        imagesSection.style.display = 'block'
        imagesContainer.innerHTML = item.images
          .map(
            img =>
              `<img src="${img}" class="img-thumbnail" style="max-width: 150px; cursor: pointer;" onclick="window.open('${img}', '_blank')">`
          )
          .join('')
      } else {
        imagesSection.style.display = 'none'
      }

      const replySection = document.getElementById('replySection')
      if (item.admin_reply) {
        replySection.style.display = 'block'
        document.getElementById('detailReply').textContent = item.admin_reply
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
    const response = await apiRequest(`/api/v4/console/system/feedbacks/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply: content })
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
        <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
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
  const map = {
    pending: '<span class="badge bg-warning">待处理</span>',
    processing: '<span class="badge bg-info">处理中</span>',
    resolved: '<span class="badge bg-success">已解决</span>',
    closed: '<span class="badge bg-secondary">已关闭</span>'
  }
  return map[status] || `<span class="badge bg-secondary">${status}</span>`
}

function getTypeBadge(type) {
  const map = {
    bug: '<span class="badge bg-danger">Bug报告</span>',
    suggestion: '<span class="badge bg-primary">功能建议</span>',
    complaint: '<span class="badge bg-warning">投诉</span>',
    question: '<span class="badge bg-info">咨询</span>',
    other: '<span class="badge bg-secondary">其他</span>'
  }
  return map[type] || `<span class="badge bg-secondary">${type}</span>`
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
