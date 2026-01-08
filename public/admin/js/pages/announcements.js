/**
 * 公告管理页面 - JavaScript逻辑
 * 从announcements.html提取，遵循前端工程化最佳实践
 *
 * 依赖：
 * - /admin/js/admin-common.js (apiRequest, getToken, checkAdminPermission, logout, formatDate)
 * - Bootstrap 5
 */

// ========== 全局变量 ==========
let currentPage = 1
const pageSize = 20
let editingId = null
let announcementModal = null

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  checkAuth()
  announcementModal = new bootstrap.Modal(document.getElementById('announcementModal'))
  loadAnnouncements()
  bindEvents()
})

/**
 * 权限检查
 */
function checkAuth() {
  const token = getToken()
  if (!token) {
    window.location.href = '/admin/login.html'
    return false
  }
  checkAdminPermission()
  return true
}

/**
 * 绑定事件
 */
function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('searchBtn').addEventListener('click', handleSearch)
  document.getElementById('addAnnouncementBtn').addEventListener('click', openAddModal)
  document.getElementById('submitAnnouncementBtn').addEventListener('click', handleSubmit)
}

/**
 * 处理搜索
 */
function handleSearch() {
  currentPage = 1
  loadAnnouncements()
}

/**
 * 加载公告列表
 */
async function loadAnnouncements() {
  try {
    showLoading(true)

    const status = document.getElementById('statusFilter').value
    const type = document.getElementById('typeFilter').value
    const keyword = document.getElementById('keywordSearch').value.trim()

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize
    })

    if (status) params.append('status', status)
    if (type) params.append('type', type)
    if (keyword) params.append('keyword', keyword)

    const response = await apiRequest(`/api/v4/console/system/announcements?${params}`)

    if (response && response.success) {
      renderAnnouncements(response.data.announcements || response.data.list || [])
      renderPagination(response.data.pagination)
    } else {
      showError(response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载公告列表失败', error)
    showError('加载失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染公告列表
 */
function renderAnnouncements(announcements) {
  const tbody = document.getElementById('announcementsTableBody')

  if (!announcements || announcements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">暂无数据</td></tr>'
    return
  }

  tbody.innerHTML = announcements
    .map(item => {
      const statusBadge = getStatusBadge(item.status)
      const typeBadge = getTypeBadge(item.type || item.announcement_type)

      return `
      <tr>
        <td>${item.announcement_id || item.id}</td>
        <td>
          <div class="fw-bold">${escapeHtml(item.title)}</div>
          <small class="text-muted">${escapeHtml((item.content || '').substring(0, 50))}...</small>
        </td>
        <td>${typeBadge}</td>
        <td>${statusBadge}</td>
        <td>${item.sort_order || 0}</td>
        <td>${formatDate(item.start_time || item.created_at)}</td>
        <td>${item.end_time ? formatDate(item.end_time) : '<span class="text-muted">永久</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editAnnouncement(${item.announcement_id || item.id})">
            <i class="bi bi-pencil"></i> 编辑
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteAnnouncement(${item.announcement_id || item.id})">
            <i class="bi bi-trash"></i> 删除
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

/**
 * 打开新增模态框
 */
function openAddModal() {
  editingId = null
  document.getElementById('modalTitle').innerHTML = '<i class="bi bi-megaphone"></i> 发布新公告'
  document.getElementById('announcementId').value = ''
  document.getElementById('announcementTitle').value = ''
  document.getElementById('announcementType').value = 'notice'
  document.getElementById('announcementStatus').value = 'draft'
  document.getElementById('announcementContent').value = ''
  document.getElementById('announcementSort').value = '0'
  document.getElementById('startTime').value = ''
  document.getElementById('endTime').value = ''
  announcementModal.show()
}

/**
 * 编辑公告
 */
async function editAnnouncement(id) {
  try {
    showLoading(true)
    const response = await apiRequest(`/api/v4/console/system/announcements/${id}`)

    if (response && response.success) {
      const item = response.data.announcement || response.data
      editingId = id
      document.getElementById('modalTitle').innerHTML = '<i class="bi bi-pencil"></i> 编辑公告'
      document.getElementById('announcementId').value = id
      document.getElementById('announcementTitle').value = item.title || ''
      document.getElementById('announcementType').value =
        item.type || item.announcement_type || 'notice'
      document.getElementById('announcementStatus').value = item.status || 'draft'
      document.getElementById('announcementContent').value = item.content || ''
      document.getElementById('announcementSort').value = item.sort_order || 0

      if (item.start_time) {
        document.getElementById('startTime').value = formatDateTimeLocal(item.start_time)
      }
      if (item.end_time) {
        document.getElementById('endTime').value = formatDateTimeLocal(item.end_time)
      }

      announcementModal.show()
    } else {
      showError(response?.message || '获取公告详情失败')
    }
  } catch (error) {
    console.error('获取公告详情失败', error)
    showError('获取失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 提交表单
 */
async function handleSubmit() {
  const title = document.getElementById('announcementTitle').value.trim()
  const type = document.getElementById('announcementType').value
  const status = document.getElementById('announcementStatus').value
  const content = document.getElementById('announcementContent').value.trim()
  const sortOrder = parseInt(document.getElementById('announcementSort').value) || 0
  const startTime = document.getElementById('startTime').value
  const endTime = document.getElementById('endTime').value

  if (!title) {
    showError('请输入公告标题')
    return
  }
  if (!content) {
    showError('请输入公告内容')
    return
  }

  try {
    showLoading(true)

    const payload = {
      title,
      type,
      status,
      content,
      sort_order: sortOrder,
      start_time: startTime || null,
      end_time: endTime || null
    }

    let response
    if (editingId) {
      response = await apiRequest(`/api/v4/console/system/announcements/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      })
    } else {
      response = await apiRequest('/api/v4/console/system/announcements', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    }

    if (response && response.success) {
      showSuccess(editingId ? '更新成功' : '发布成功')
      announcementModal.hide()
      loadAnnouncements()
    } else {
      showError(response?.message || '操作失败')
    }
  } catch (error) {
    console.error('保存公告失败', error)
    showError('保存失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 删除公告
 */
async function deleteAnnouncement(id) {
  if (!confirm('确定要删除这条公告吗？此操作不可恢复。')) {
    return
  }

  try {
    showLoading(true)
    const response = await apiRequest(`/api/v4/console/system/announcements/${id}`, {
      method: 'DELETE'
    })

    if (response && response.success) {
      showSuccess('删除成功')
      loadAnnouncements()
    } else {
      showError(response?.message || '删除失败')
    }
  } catch (error) {
    console.error('删除公告失败', error)
    showError('删除失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染分页
 */
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

/**
 * 切换页码
 */
function changePage(page) {
  currentPage = page
  loadAnnouncements()
}

// ========== 工具函数 ==========

function getStatusBadge(status) {
  const map = {
    active: '<span class="badge bg-success">已发布</span>',
    inactive: '<span class="badge bg-secondary">已下线</span>',
    draft: '<span class="badge bg-warning">草稿</span>'
  }
  return map[status] || `<span class="badge bg-secondary">${status}</span>`
}

function getTypeBadge(type) {
  const map = {
    notice: '<span class="badge bg-info">通知</span>',
    activity: '<span class="badge bg-success">活动</span>',
    update: '<span class="badge bg-primary">更新</span>',
    warning: '<span class="badge bg-danger">警告</span>'
  }
  return map[type] || `<span class="badge bg-secondary">${type}</span>`
}

function formatDateTimeLocal(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toISOString().slice(0, 16)
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.style.display = show ? 'flex' : 'none'
  }
}

function showSuccess(message) {
  alert('✅ ' + message)
}

function showError(message) {
  alert('❌ ' + message)
}
