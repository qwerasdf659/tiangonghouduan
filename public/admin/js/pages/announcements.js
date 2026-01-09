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
 * 直接使用后端字段：id, title, content, type, priority, is_active, created_at, expires_at
 */
function renderAnnouncements(announcements) {
  const tbody = document.getElementById('announcementsTableBody')

  if (!announcements || announcements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">暂无数据</td></tr>'
    return
  }

  tbody.innerHTML = announcements
    .map(item => {
      const announcementId = item.announcement_id || item.id
      const statusBadge = getStatusBadge(item.is_active)
      const typeBadge = getTypeBadge(item.type)
      const priorityBadge = getPriorityBadge(item.priority)
      const createdAt = formatDateSafe(item.created_at)
      const expiresAt = item.expires_at ? formatDateSafe(item.expires_at) : '<span class="text-muted">永久</span>'

      return `
      <tr>
        <td>${announcementId}</td>
        <td>
          <div class="fw-bold">${escapeHtml(item.title)}</div>
          <small class="text-muted">${escapeHtml((item.content || '').substring(0, 50))}...</small>
        </td>
        <td>${typeBadge}</td>
        <td>${statusBadge}</td>
        <td>${priorityBadge}</td>
        <td>${createdAt}</td>
        <td>${expiresAt}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editAnnouncement(${announcementId})">
            <i class="bi bi-pencil"></i> 编辑
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteAnnouncement(${announcementId})">
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
  document.getElementById('announcementStatus').value = 'active'
  document.getElementById('announcementContent').value = ''
  document.getElementById('announcementPriority').value = 'medium'
  document.getElementById('expiresAt').value = ''
  announcementModal.show()
}

/**
 * 编辑公告 - 直接使用后端字段
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
      document.getElementById('announcementType').value = item.type || 'notice'
      document.getElementById('announcementStatus').value = item.is_active ? 'active' : 'inactive'
      document.getElementById('announcementContent').value = item.content || ''
      document.getElementById('announcementPriority').value = item.priority || 'medium'

      // 过期时间
      if (item.expires_at) {
        document.getElementById('expiresAt').value = formatDateTimeLocal(item.expires_at)
      } else {
        document.getElementById('expiresAt').value = ''
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
 * 提交表单 - 直接使用后端字段
 */
async function handleSubmit() {
  const title = document.getElementById('announcementTitle').value.trim()
  const type = document.getElementById('announcementType').value
  const status = document.getElementById('announcementStatus').value
  const content = document.getElementById('announcementContent').value.trim()
  const priority = document.getElementById('announcementPriority').value
  const expiresAt = document.getElementById('expiresAt').value

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

    // 直接使用后端字段
    const payload = {
      title,
      content,
      type,
      priority,
      is_active: status === 'active',
      expires_at: expiresAt || null
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

/**
 * 状态徽章 - 直接使用后端 is_active 布尔值
 */
function getStatusBadge(isActive) {
  if (isActive === true) {
    return '<span class="badge bg-success">已发布</span>'
  }
  return '<span class="badge bg-secondary">已下线</span>'
}

/**
 * 类型徽章 - 直接使用后端 type 字段
 * 后端类型: system, activity, maintenance, notice
 */
function getTypeBadge(type) {
  const map = {
    system: '<span class="badge bg-primary">系统</span>',
    activity: '<span class="badge bg-success">活动</span>',
    maintenance: '<span class="badge bg-warning">维护</span>',
    notice: '<span class="badge bg-info">通知</span>'
  }
  return map[type] || `<span class="badge bg-secondary">${type || '-'}</span>`
}

/**
 * 优先级徽章 - 直接使用后端 priority 字段
 * 后端优先级: high, medium, low
 */
function getPriorityBadge(priority) {
  const map = {
    high: '<span class="badge bg-danger">高</span>',
    medium: '<span class="badge bg-warning">中</span>',
    low: '<span class="badge bg-secondary">低</span>'
  }
  return map[priority] || `<span class="badge bg-secondary">${priority || '-'}</span>`
}

/**
 * 安全的日期格式化函数
 * 处理后端返回的中文格式日期（如 "2026年1月9日星期五 08:25:48"）
 * @param {string} dateStr - 日期字符串
 * @returns {string} 格式化后的日期显示
 */
function formatDateSafe(dateStr) {
  if (!dateStr) return '-'
  
  // 如果已经是中文格式（包含"年"），直接返回（去掉星期几）
  if (typeof dateStr === 'string' && dateStr.includes('年')) {
    // 移除星期几的信息，使显示更简洁
    return dateStr.replace(/星期[一二三四五六日]/, '').trim()
  }
  
  // 尝试标准日期解析
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
      return dateStr // 解析失败，返回原始字符串
    }
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateStr
  }
}

function formatDateTimeLocal(dateStr) {
  if (!dateStr) return ''
  
  // 处理中文格式日期
  if (typeof dateStr === 'string' && dateStr.includes('年')) {
    // 解析中文日期格式：2026年1月9日星期五 08:25:48
    const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日.*?(\d{1,2}):(\d{1,2})/)
    if (match) {
      const [, year, month, day, hour, minute] = match
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }
    return ''
  }
  
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 16)
  } catch (e) {
    return ''
  }
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
