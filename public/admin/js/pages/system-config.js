/**
 * 系统配置中心 - 整合页面 JavaScript
 * 整合了：公告管理、系统通知、弹窗Banner、图片资源
 */

document.addEventListener('DOMContentLoaded', function () {
  // 权限检查
  checkAdminPermission()

  // 显示欢迎信息
  const currentUser = getCurrentUser()
  if (currentUser) {
    document.getElementById('welcomeText').textContent =
      `欢迎，${currentUser.nickname || currentUser.mobile || '管理员'}`
  }

  // 退出按钮
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // Tab切换处理
  const tabs = document.querySelectorAll('#systemConfigTabs button')
  tabs.forEach(tab => {
    tab.addEventListener('shown.bs.tab', function (e) {
      const tabId = e.target.id
      switch (tabId) {
        case 'announcements-tab':
          announcementsModule.loadData()
          break
        case 'notifications-tab':
          notificationsModule.loadData()
          break
        case 'banners-tab':
          bannersModule.loadData()
          break
        case 'images-tab':
          imagesModule.loadData()
          break
      }
    })
  })

  // 初始化各模块
  announcementsModule.init()
  notificationsModule.init()
  bannersModule.init()
  imagesModule.init()

  // 初始加载公告
  announcementsModule.loadData()
})

// ==================== 公告管理模块 ====================
const announcementsModule = {
  currentPage: 1,
  pageSize: 10,
  announcements: [],

  init() {
    document
      .getElementById('addAnnouncementBtn')
      .addEventListener('click', () => this.showAddModal())
    document.getElementById('announcementSearchBtn').addEventListener('click', () => {
      this.currentPage = 1
      this.loadData()
    })
    document
      .getElementById('submitAnnouncementBtn')
      .addEventListener('click', () => this.submitAnnouncement())

    document.getElementById('announcementStatusFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })
    document.getElementById('announcementTypeFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })
  },

  async loadData() {
    showLoading(true)
    try {
      const params = new URLSearchParams()
      // 后端使用 limit/offset 分页
      params.append('limit', this.pageSize)
      params.append('offset', (this.currentPage - 1) * this.pageSize)

      const status = document.getElementById('announcementStatusFilter').value
      const type = document.getElementById('announcementTypeFilter').value
      const keyword = document.getElementById('announcementKeywordSearch').value.trim()

      // 后端字段：is_active (布尔值), type, priority
      if (status === 'active') params.append('is_active', 'true')
      if (status === 'inactive') params.append('is_active', 'false')
      if (type) params.append('type', type)
      if (keyword) params.append('keyword', keyword)

      // 使用API_ENDPOINTS集中管理
      const response = await apiRequest(API_ENDPOINTS.ANNOUNCEMENT.LIST + '?' + params.toString())

      if (response && response.success) {
        // 后端返回字段：announcements (数组), total, limit, offset
        this.announcements = response.data.announcements || []
        this.renderTable(this.announcements)
        // 计算分页信息
        const total = response.data.total || 0
        const totalPages = Math.ceil(total / this.pageSize)
        this.renderPagination({ total, total_pages: totalPages, current_page: this.currentPage })
      } else {
        showErrorToast(response?.message || '加载公告失败')
        this.renderEmptyTable()
      }
    } catch (error) {
      console.error('加载公告失败:', error)
      showErrorToast(error.message || '网络错误')
      this.renderEmptyTable()
    } finally {
      showLoading(false)
    }
  },

  renderTable(items) {
    const tbody = document.getElementById('announcementsTableBody')

    if (!items || items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5">
            <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
            <p class="mt-2 text-muted">暂无公告数据</p>
          </td>
        </tr>
      `
      return
    }

    // 后端字段名：announcement_id, title, type, is_active, priority, created_at, expires_at
    tbody.innerHTML = items
      .map(
        item => `
      <tr>
        <td>${item.announcement_id}</td>
        <td><strong>${item.title}</strong></td>
        <td><span class="badge bg-info">${this.getTypeName(item.type)}</span></td>
        <td><span class="badge ${this.getStatusBadgeClass(item.is_active)}">${this.getStatusName(item.is_active)}</span></td>
        <td><span class="badge ${this.getPriorityBadgeClass(item.priority)}">${this.getPriorityName(item.priority)}</span></td>
        <td><small>${this.formatDate(item.created_at)}</small></td>
        <td><small>${item.expires_at ? this.formatDate(item.expires_at) : '永久有效'}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="announcementsModule.editAnnouncement(${item.announcement_id})">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="announcementsModule.deleteAnnouncement(${item.announcement_id})">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `
      )
      .join('')
  },

  renderEmptyTable() {
    document.getElementById('announcementsTableBody').innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败</p>
        </td>
      </tr>
    `
  },

  renderPagination(pagination) {
    const container = document.getElementById('announcementsPagination')
    if (!pagination || pagination.total_pages <= 1) {
      container.innerHTML = ''
      return
    }

    let html = ''
    html += `<li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="announcementsModule.changePage(${this.currentPage - 1})">上一页</a>
             </li>`

    for (let i = 1; i <= pagination.total_pages; i++) {
      html += `<li class="page-item ${this.currentPage === i ? 'active' : ''}">
                 <a class="page-link" href="#" onclick="announcementsModule.changePage(${i})">${i}</a>
               </li>`
    }

    html += `<li class="page-item ${this.currentPage === pagination.total_pages ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="announcementsModule.changePage(${this.currentPage + 1})">下一页</a>
             </li>`

    container.innerHTML = html
  },

  changePage(page) {
    if (page < 1) return
    this.currentPage = page
    this.loadData()
  },

  showAddModal() {
    document.getElementById('announcementModalTitle').innerHTML =
      '<i class="bi bi-megaphone"></i> 发布新公告'
    document.getElementById('announcementId').value = ''
    document.getElementById('announcementTitle').value = ''
    document.getElementById('announcementType').value = 'notice'
    document.getElementById('announcementStatus').value = 'draft'
    document.getElementById('announcementContent').value = ''
    document.getElementById('announcementPriority').value = 'medium'
    document.getElementById('announcementExpiresAt').value = ''
    new bootstrap.Modal(document.getElementById('announcementModal')).show()
  },

  editAnnouncement(id) {
    // 后端使用 announcement_id 字段
    const item = this.announcements.find(a => a.announcement_id === id)
    if (!item) return

    document.getElementById('announcementModalTitle').innerHTML =
      '<i class="bi bi-pencil"></i> 编辑公告'
    document.getElementById('announcementId').value = item.announcement_id
    document.getElementById('announcementTitle').value = item.title
    document.getElementById('announcementType').value = item.type
    // 后端使用 is_active (布尔值)，转换为前端状态
    document.getElementById('announcementStatus').value = item.is_active ? 'active' : 'inactive'
    document.getElementById('announcementContent').value = item.content
    document.getElementById('announcementPriority').value = item.priority || 'medium'
    document.getElementById('announcementExpiresAt').value = item.expires_at
      ? item.expires_at.substring(0, 16)
      : ''
    new bootstrap.Modal(document.getElementById('announcementModal')).show()
  },

  async submitAnnouncement() {
    const id = document.getElementById('announcementId').value
    const title = document.getElementById('announcementTitle').value.trim()
    const type = document.getElementById('announcementType').value
    const status = document.getElementById('announcementStatus').value
    const content = document.getElementById('announcementContent').value.trim()
    const priority = document.getElementById('announcementPriority').value
    const expiresAt = document.getElementById('announcementExpiresAt').value

    if (!title || !content) {
      showErrorToast('请填写标题和内容')
      return
    }

    showLoading(true)
    try {
      // 使用API_ENDPOINTS集中管理
      const url = id
        ? API.buildURL(API_ENDPOINTS.ANNOUNCEMENT.UPDATE, { id })
        : API_ENDPOINTS.ANNOUNCEMENT.CREATE
      const method = id ? 'PUT' : 'POST'

      // 后端字段：is_active (布尔值)，将前端status转换
      const is_active = status === 'active'

      const response = await apiRequest(url, {
        method,
        body: JSON.stringify({
          title,
          type,
          is_active,
          content,
          priority,
          expires_at: expiresAt || null
        })
      })

      if (response && response.success) {
        showSuccessToast(id ? '更新成功' : '创建成功')
        bootstrap.Modal.getInstance(document.getElementById('announcementModal')).hide()
        this.loadData()
      } else {
        showErrorToast(response?.message || '操作失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  async deleteAnnouncement(id) {
    if (!confirm('确定要删除此公告吗？')) return

    showLoading(true)
    try {
      // 使用API_ENDPOINTS集中管理
      const response = await apiRequest(API.buildURL(API_ENDPOINTS.ANNOUNCEMENT.DELETE, { id }), {
        method: 'DELETE'
      })

      if (response && response.success) {
        showSuccessToast('删除成功')
        this.loadData()
      } else {
        showErrorToast(response?.message || '删除失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  getTypeName(type) {
    const types = { system: '系统公告', notice: '通知', activity: '活动', maintenance: '维护' }
    return types[type] || type
  },

  // 后端使用 is_active (布尔值)
  getStatusName(is_active) {
    return is_active ? '已发布' : '已下线'
  },

  getStatusBadgeClass(is_active) {
    return is_active ? 'bg-success' : 'bg-warning'
  },

  getPriorityName(priority) {
    const priorities = { low: '低', medium: '中', high: '高' }
    return priorities[priority] || priority
  },

  getPriorityBadgeClass(priority) {
    const classes = { low: 'bg-secondary', medium: 'bg-info', high: 'bg-danger' }
    return classes[priority] || 'bg-secondary'
  },

  formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }
}

// ==================== 系统通知模块 ====================
const notificationsModule = {
  notifications: [],

  init() {
    document.getElementById('loadNotificationsBtn').addEventListener('click', () => this.loadData())
    document
      .getElementById('markAllAsReadBtn')
      .addEventListener('click', () => this.markAllAsRead())
    document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAll())
    document
      .getElementById('sendNotificationBtn')
      .addEventListener('click', () => this.showSendModal())
    document
      .getElementById('confirmSendNotificationBtn')
      .addEventListener('click', () => this.sendNotification())

    document
      .getElementById('notificationTypeFilter')
      .addEventListener('change', () => this.loadData())
    document
      .getElementById('notificationStatusFilter')
      .addEventListener('change', () => this.loadData())
  },

  async loadData() {
    showLoading(true)
    try {
      const params = new URLSearchParams()
      const type = document.getElementById('notificationTypeFilter').value
      const status = document.getElementById('notificationStatusFilter').value

      if (type && type !== 'all') params.append('type', type)
      if (status && status !== 'all') params.append('status', status)

      // 使用API_ENDPOINTS集中管理
      const response = await apiRequest(API_ENDPOINTS.NOTIFICATION.LIST + '?' + params.toString())

      if (response && response.success) {
        // 后端返回字段：notifications (不是 items), statistics (不是 stats)
        this.notifications = response.data.notifications || []
        this.renderStats(response.data.statistics || {})
        this.renderList(this.notifications)
      } else {
        showErrorToast(response?.message || '加载通知失败')
        this.renderEmptyList()
      }
    } catch (error) {
      console.error('加载通知失败:', error)
      showErrorToast(error.message || '网络错误')
      this.renderEmptyList()
    } finally {
      showLoading(false)
    }
  },

  renderStats(stats) {
    document.getElementById('totalNotifications').textContent =
      stats.total || this.notifications.length || '-'
    document.getElementById('unreadNotifications').textContent = stats.unread || '-'
    document.getElementById('todayNotifications').textContent = stats.today || '-'
    document.getElementById('weekNotifications').textContent = stats.week || '-'
  },

  renderList(items) {
    const container = document.getElementById('notificationsList')

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无通知</p>
        </div>
      `
      return
    }

    // 后端字段：notification_id (或 id), type, title, content, is_read, created_at
    container.innerHTML = items
      .map(
        item => `
      <div class="notification-item p-3 border-bottom ${item.is_read ? '' : 'unread'}" onclick="notificationsModule.markAsRead(${item.notification_id || item.id})">
        <div class="d-flex justify-content-between">
          <div>
            <span class="badge bg-${this.getTypeBadgeColor(item.type)} me-2">${this.getTypeName(item.type)}</span>
            <strong>${item.title}</strong>
          </div>
          <small class="text-muted">${this.formatDate(item.created_at)}</small>
        </div>
        <p class="mb-0 mt-2 text-muted small">${item.content}</p>
      </div>
    `
      )
      .join('')
  },

  renderEmptyList() {
    document.getElementById('notificationsList').innerHTML = `
      <div class="text-center py-5 text-danger">
        <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
        <p class="mt-2">加载失败</p>
      </div>
    `
  },

  async markAsRead(id) {
    try {
      // 使用API_ENDPOINTS集中管理
      await apiRequest(API.buildURL(API_ENDPOINTS.NOTIFICATION.READ, { id }), { method: 'PUT' })
      this.loadData()
    } catch (error) {
      console.error('标记已读失败:', error)
    }
  },

  async markAllAsRead() {
    showLoading(true)
    try {
      const response = await apiRequest(API_ENDPOINTS.NOTIFICATION.READ_ALL, { method: 'PUT' })
      if (response && response.success) {
        showSuccessToast('已全部标记为已读')
        this.loadData()
      } else {
        showErrorToast(response?.message || '操作失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  async clearAll() {
    if (!confirm('确定要清空所有通知吗？')) return

    showLoading(true)
    try {
      const response = await apiRequest(API_ENDPOINTS.NOTIFICATION.CLEAR, { method: 'DELETE' })
      if (response && response.success) {
        showSuccessToast('已清空所有通知')
        this.loadData()
      } else {
        showErrorToast(response?.message || '操作失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  showSendModal() {
    document.getElementById('sendNotificationForm').reset()
    new bootstrap.Modal(document.getElementById('sendNotificationModal')).show()
  },

  async sendNotification() {
    const type = document.getElementById('notificationType').value
    const title = document.getElementById('notificationTitle').value.trim()
    const content = document.getElementById('notificationContent').value.trim()
    const target = document.getElementById('notificationTarget').value

    if (!type || !title || !content) {
      showErrorToast('请填写完整信息')
      return
    }

    showLoading(true)
    try {
      // 使用API_ENDPOINTS集中管理
      const response = await apiRequest(API_ENDPOINTS.NOTIFICATION.SEND, {
        method: 'POST',
        body: JSON.stringify({ type, title, content, target })
      })

      if (response && response.success) {
        showSuccessToast('发送成功')
        bootstrap.Modal.getInstance(document.getElementById('sendNotificationModal')).hide()
        this.loadData()
      } else {
        showErrorToast(response?.message || '发送失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  getTypeName(type) {
    const types = { system: '系统通知', user: '用户动态', order: '订单消息', alert: '警告提醒' }
    return types[type] || type
  },

  getTypeBadgeColor(type) {
    const colors = { system: 'primary', user: 'info', order: 'success', alert: 'danger' }
    return colors[type] || 'secondary'
  },

  formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }
}

// ==================== 弹窗Banner模块 ====================
const bannersModule = {
  currentPage: 1,
  pageSize: 12,
  banners: [],

  init() {
    document.getElementById('addBannerBtn').addEventListener('click', () => this.showAddModal())
    document.getElementById('bannerSearchBtn').addEventListener('click', () => {
      this.currentPage = 1
      this.loadData()
    })
    document.getElementById('bannerRefreshBtn').addEventListener('click', () => this.loadData())
    document.getElementById('saveBannerBtn').addEventListener('click', () => this.saveBanner())

    document.getElementById('bannerLinkType').addEventListener('change', e => {
      document.getElementById('bannerLinkUrlSection').style.display =
        e.target.value !== 'none' ? 'block' : 'none'
    })

    // 图片上传区域
    const uploadZone = document.getElementById('bannerUploadZone')
    const imageInput = document.getElementById('bannerImageInput')

    uploadZone.addEventListener('click', () => imageInput.click())
    uploadZone.addEventListener('dragover', e => {
      e.preventDefault()
      uploadZone.classList.add('dragover')
    })
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'))
    uploadZone.addEventListener('drop', e => {
      e.preventDefault()
      uploadZone.classList.remove('dragover')
      const files = e.dataTransfer.files
      if (files.length > 0) this.handleImageSelect(files[0])
    })
    imageInput.addEventListener('change', e => {
      if (e.target.files.length > 0) this.handleImageSelect(e.target.files[0])
    })
  },

  async loadData() {
    showLoading(true)
    try {
      const params = new URLSearchParams()
      // 后端使用 page/limit 分页
      params.append('page', this.currentPage)
      params.append('limit', this.pageSize)

      const position = document.getElementById('bannerFilterPosition').value
      const status = document.getElementById('bannerFilterStatus').value
      const keyword = document.getElementById('bannerFilterKeyword').value.trim()

      if (position) params.append('position', position)
      if (status) params.append('is_active', status)
      if (keyword) params.append('keyword', keyword)

      // 使用API_ENDPOINTS集中管理
      const response = await apiRequest(API_ENDPOINTS.POPUP_BANNER.LIST + '?' + params.toString())

      if (response && response.success) {
        // 后端返回字段：banners, pagination
        this.banners = response.data.banners || []
        // 加载统计信息
        this.loadStats()
        this.renderGrid(this.banners)
        this.renderPagination(response.data.pagination)
      } else {
        showErrorToast(response?.message || '加载弹窗失败')
        this.renderEmptyGrid()
      }
    } catch (error) {
      console.error('加载弹窗失败:', error)
      showErrorToast(error.message || '网络错误')
      this.renderEmptyGrid()
    } finally {
      showLoading(false)
    }
  },

  async loadStats() {
    try {
      const response = await apiRequest(API_ENDPOINTS.POPUP_BANNER.STATS)
      if (response && response.success && response.data) {
        // 后端返回格式：{ statistics: { total, active, inactive, by_position: { home, profile } } }
        this.renderStats(response.data.statistics || response.data)
      } else {
        // API 调用失败，从列表数据计算统计
        console.warn('弹窗统计API返回失败，从列表数据计算')
        this.renderStatsFromList()
      }
    } catch (error) {
      console.error('加载弹窗统计失败:', error)
      // API 调用异常，从列表数据计算统计
      this.renderStatsFromList()
    }
  },

  renderStats(stats) {
    // 防护：确保 stats 是有效对象
    if (!stats || typeof stats !== 'object') {
      console.warn('renderStats: 无效的统计数据，使用列表数据计算')
      this.renderStatsFromList()
      return
    }
    
    // 使用 ?? 运算符确保 0 值正确显示（|| 会把 0 当作 falsy 值）
    document.getElementById('bannerStatTotal').textContent = stats.total ?? 0
    document.getElementById('bannerStatActive').textContent = stats.active ?? 0
    document.getElementById('bannerStatInactive').textContent = stats.inactive ?? 0
    // 后端返回 by_position.home，而非直接的 home 字段
    document.getElementById('bannerStatHome').textContent = stats.by_position?.home ?? stats.home ?? 0
  },

  // 从列表数据计算统计（作为 API 失败时的后备方案）
  renderStatsFromList() {
    const banners = this.banners || []
    const total = banners.length
    const active = banners.filter(b => b.is_active === true).length
    const inactive = total - active
    const home = banners.filter(b => b.position === 'home').length
    
    document.getElementById('bannerStatTotal').textContent = total
    document.getElementById('bannerStatActive').textContent = active
    document.getElementById('bannerStatInactive').textContent = inactive
    document.getElementById('bannerStatHome').textContent = home
  },

  renderGrid(items) {
    const container = document.getElementById('bannersList')

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="col-12 text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无弹窗数据</p>
        </div>
      `
      return
    }

    // 后端字段：banner_id, title, image_url, is_active, display_order, position
    container.innerHTML = items
      .map(
        item => `
      <div class="col-md-3">
        <div class="card banner-card">
          <div class="position-relative">
            <img src="${item.image_url || '/admin/images/placeholder.png'}" class="banner-preview" alt="${item.title}"
                 onerror="this.src='/admin/images/placeholder.png'">
            <span class="badge ${item.is_active ? 'bg-success' : 'bg-secondary'} position-absolute top-0 end-0 m-2">
              ${item.is_active ? '已启用' : '已禁用'}
            </span>
            <span class="badge bg-dark position-absolute top-0 start-0 m-2">${item.display_order || 0}</span>
          </div>
          <div class="card-body">
            <h6 class="card-title text-truncate">${item.title}</h6>
            <p class="card-text small text-muted">
              位置: ${item.position === 'home' ? '首页' : '个人中心'}
            </p>
            <div class="btn-group btn-group-sm w-100">
              <button class="btn btn-outline-primary" onclick="bannersModule.editBanner(${item.banner_id})">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-outline-${item.is_active ? 'warning' : 'success'}" onclick="bannersModule.toggleActive(${item.banner_id}, ${item.is_active})">
                <i class="bi ${item.is_active ? 'bi-pause' : 'bi-play'}"></i>
              </button>
              <button class="btn btn-outline-danger" onclick="bannersModule.deleteBanner(${item.banner_id})">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `
      )
      .join('')
  },

  renderEmptyGrid() {
    document.getElementById('bannersList').innerHTML = `
      <div class="col-12 text-center py-5 text-danger">
        <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
        <p class="mt-2">加载失败</p>
      </div>
    `
  },

  renderPagination(pagination) {
    const container = document.getElementById('bannersPagination')
    if (!pagination || pagination.total_pages <= 1) {
      container.innerHTML = ''
      return
    }

    let html = ''
    for (let i = 1; i <= pagination.total_pages; i++) {
      html += `<li class="page-item ${this.currentPage === i ? 'active' : ''}">
                 <a class="page-link" href="#" onclick="bannersModule.changePage(${i})">${i}</a>
               </li>`
    }
    container.innerHTML = html
  },

  changePage(page) {
    if (page < 1) return
    this.currentPage = page
    this.loadData()
  },

  showAddModal() {
    document.getElementById('bannerModalTitle').innerHTML =
      '<i class="bi bi-plus-circle"></i> 新建弹窗'
    document.getElementById('bannerForm').reset()
    document.getElementById('bannerId').value = ''
    document.getElementById('bannerLinkUrlSection').style.display = 'none'
    document.getElementById('bannerUploadZone').innerHTML = `
      <i class="bi bi-cloud-arrow-up text-muted" style="font-size: 3rem;"></i>
      <p class="mb-1 text-muted">点击或拖拽上传图片</p>
      <p class="small text-muted mb-0">支持 JPG、PNG、GIF、WebP，最大 5MB</p>
    `
    this.selectedImage = null
    new bootstrap.Modal(document.getElementById('bannerModal')).show()
  },

  editBanner(id) {
    const item = this.banners.find(b => b.id === id)
    if (!item) return

    document.getElementById('bannerModalTitle').innerHTML = '<i class="bi bi-pencil"></i> 编辑弹窗'
    document.getElementById('bannerId').value = item.id
    document.getElementById('bannerTitle').value = item.title
    document.getElementById('bannerPosition').value = item.position
    document.getElementById('bannerOrder').value = item.sort_order || 0
    document.getElementById('bannerActive').checked = item.is_active
    document.getElementById('bannerLinkType').value = item.link_type || 'none'
    document.getElementById('bannerLinkUrl').value = item.link_url || ''
    document.getElementById('bannerLinkUrlSection').style.display =
      item.link_type !== 'none' ? 'block' : 'none'

    if (item.image_url) {
      document.getElementById('bannerUploadZone').innerHTML = `
        <img src="${item.image_url}" style="max-width: 100%; max-height: 150px; border-radius: 8px;">
        <p class="mt-2 mb-0 small text-muted">点击更换图片</p>
      `
    }

    this.selectedImage = null
    new bootstrap.Modal(document.getElementById('bannerModal')).show()
  },

  handleImageSelect(file) {
    if (!file.type.startsWith('image/')) {
      showErrorToast('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showErrorToast('图片大小不能超过5MB')
      return
    }

    this.selectedImage = file
    const reader = new FileReader()
    reader.onload = e => {
      document.getElementById('bannerUploadZone').innerHTML = `
        <img src="${e.target.result}" style="max-width: 100%; max-height: 150px; border-radius: 8px;">
        <p class="mt-2 mb-0 small text-muted">点击更换图片</p>
      `
    }
    reader.readAsDataURL(file)
  },

  async saveBanner() {
    const id = document.getElementById('bannerId').value
    const title = document.getElementById('bannerTitle').value.trim()
    const position = document.getElementById('bannerPosition').value
    const sortOrder = parseInt(document.getElementById('bannerOrder').value) || 0
    const isActive = document.getElementById('bannerActive').checked
    const linkType = document.getElementById('bannerLinkType').value
    const linkUrl = document.getElementById('bannerLinkUrl').value.trim()

    if (!title) {
      showErrorToast('请填写弹窗标题')
      return
    }

    showLoading(true)
    try {
      let imageUrl = null

      // 如果有选择新图片，先上传
      if (this.selectedImage) {
        const formData = new FormData()
        formData.append('image', this.selectedImage)
        formData.append('business_type', 'banner')

        const uploadResponse = await fetch(API_ENDPOINTS.IMAGE.UPLOAD, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: formData
        })

        const uploadResult = await uploadResponse.json()
        if (!uploadResult.success) {
          showErrorToast('图片上传失败')
          return
        }
        imageUrl = uploadResult.data.public_url
      }

      const url = id ? API.buildURL(API_ENDPOINTS.POPUP_BANNER.UPDATE, { id }) : API_ENDPOINTS.POPUP_BANNER.CREATE
      const method = id ? 'PUT' : 'POST'

      // 后端字段：display_order (不是 sort_order)
      const data = {
        title,
        position,
        display_order: sortOrder,
        is_active: isActive,
        link_type: linkType,
        link_url: linkType !== 'none' ? linkUrl : null
      }

      if (imageUrl) data.image_url = imageUrl

      const response = await apiRequest(url, {
        method,
        body: JSON.stringify(data)
      })

      if (response && response.success) {
        showSuccessToast(id ? '更新成功' : '创建成功')
        bootstrap.Modal.getInstance(document.getElementById('bannerModal')).hide()
        this.loadData()
      } else {
        showErrorToast(response?.message || '操作失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  async toggleActive(id, isActive) {
    showLoading(true)
    try {
      // 使用API_ENDPOINTS集中管理
      const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.TOGGLE, { id }), {
        method: 'PATCH'
      })

      if (response && response.success) {
        showSuccessToast(isActive ? '已禁用' : '已启用')
        this.loadData()
      } else {
        showErrorToast(response?.message || '操作失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  async deleteBanner(id) {
    if (!confirm('确定要删除此弹窗吗？')) return

    showLoading(true)
    try {
      const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.DELETE, { id }), { method: 'DELETE' })

      if (response && response.success) {
        showSuccessToast('删除成功')
        this.loadData()
      } else {
        showErrorToast(response?.message || '删除失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  }
}

// ==================== 图片资源模块 ====================
const imagesModule = {
  currentPage: 1,
  pageSize: 24,
  images: [],
  selectedFiles: [],

  init() {
    document.getElementById('imageRefreshBtn').addEventListener('click', () => this.loadData())
    document
      .getElementById('imageUploadBtn')
      .addEventListener('click', () => this.showUploadModal())
    document.getElementById('submitUploadBtn').addEventListener('click', () => this.submitUpload())

    document.getElementById('imageTypeFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })
    document.getElementById('imageStatusFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })

    // 图片上传区域
    const uploadZone = document.getElementById('imageUploadZone')
    const fileInput = document.getElementById('imageFileInput')

    uploadZone.addEventListener('click', () => fileInput.click())
    uploadZone.addEventListener('dragover', e => {
      e.preventDefault()
      uploadZone.classList.add('dragover')
    })
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'))
    uploadZone.addEventListener('drop', e => {
      e.preventDefault()
      uploadZone.classList.remove('dragover')
      this.handleFilesSelect(e.dataTransfer.files)
    })
    fileInput.addEventListener('change', e => this.handleFilesSelect(e.target.files))
  },

  async loadData() {
    showLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', this.currentPage)
      params.append('page_size', this.pageSize)

      const type = document.getElementById('imageTypeFilter').value
      const status = document.getElementById('imageStatusFilter').value

      if (type) params.append('business_type', type)
      if (status) params.append('status', status)

      const response = await apiRequest(API_ENDPOINTS.IMAGE.LIST + '?' + params.toString())

      if (response && response.success) {
        // 后端返回字段：images (不是 items), statistics (不是 stats)
        this.images = response.data.images || []
        this.renderStats(response.data.statistics || {})
        this.renderGrid(this.images)
        this.renderPagination(response.data.pagination)
      } else {
        showErrorToast(response?.message || '加载图片失败')
        this.renderEmptyGrid()
      }
    } catch (error) {
      console.error('加载图片失败:', error)
      showErrorToast(error.message || '网络错误')
      this.renderEmptyGrid()
    } finally {
      showLoading(false)
    }
  },

  renderStats(stats) {
    // 后端字段：total, total_size (字节), weekly_uploads, orphan_count
    document.getElementById('imageTotalImages').textContent = stats.total || this.images.length || 0
    // 转换字节为MB显示
    const totalSizeMB = stats.total_size
      ? (stats.total_size / 1024 / 1024).toFixed(2) + ' MB'
      : '0 MB'
    document.getElementById('imageTotalSize').textContent = totalSizeMB
    document.getElementById('imageWeeklyUploads').textContent = stats.weekly_uploads || 0
    document.getElementById('imageOrphanImages').textContent = stats.orphan_count || 0
  },

  renderGrid(items) {
    const container = document.getElementById('imagesContainer')

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="col-12 text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无图片</p>
        </div>
      `
      return
    }

    // 后端字段：image_id, url, original_filename, file_size
    container.innerHTML = items
      .map(
        item => `
      <div class="col-md-2 col-sm-4">
        <div class="card image-card" onclick="imagesModule.showDetail(${item.image_id})">
          <img src="${item.url}" class="image-preview" alt="${item.original_filename}"
               onerror="this.src='/admin/images/placeholder.png'">
          <div class="card-body p-2">
            <p class="card-text small text-truncate mb-0">${item.original_filename}</p>
            <small class="text-muted">${this.formatFileSize(item.file_size)}</small>
          </div>
        </div>
      </div>
    `
      )
      .join('')
  },

  formatFileSize(bytes) {
    if (!bytes) return '-'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  },

  renderEmptyGrid() {
    document.getElementById('imagesContainer').innerHTML = `
      <div class="col-12 text-center py-5 text-danger">
        <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
        <p class="mt-2">加载失败</p>
      </div>
    `
  },

  renderPagination(pagination) {
    const container = document.getElementById('imagesPagination')
    if (!pagination || pagination.total_pages <= 1) {
      container.innerHTML = ''
      return
    }

    let html = ''
    for (let i = 1; i <= Math.min(pagination.total_pages, 10); i++) {
      html += `<li class="page-item ${this.currentPage === i ? 'active' : ''}">
                 <a class="page-link" href="#" onclick="imagesModule.changePage(${i})">${i}</a>
               </li>`
    }
    container.innerHTML = html
  },

  changePage(page) {
    if (page < 1) return
    this.currentPage = page
    this.loadData()
  },

  showUploadModal() {
    this.selectedFiles = []
    document.getElementById('uploadPreviewContainer').style.display = 'none'
    document.getElementById('uploadPreviewList').innerHTML = ''
    document.getElementById('submitUploadBtn').disabled = true
    new bootstrap.Modal(document.getElementById('uploadModal')).show()
  },

  handleFilesSelect(files) {
    this.selectedFiles = Array.from(files).filter(file => {
      if (!file.type.startsWith('image/')) {
        showErrorToast(`${file.name} 不是图片文件`)
        return false
      }
      if (file.size > 5 * 1024 * 1024) {
        showErrorToast(`${file.name} 超过5MB限制`)
        return false
      }
      return true
    })

    if (this.selectedFiles.length === 0) return

    const previewContainer = document.getElementById('uploadPreviewContainer')
    const previewList = document.getElementById('uploadPreviewList')

    previewContainer.style.display = 'block'
    previewList.innerHTML = this.selectedFiles
      .map((file, index) => {
        const url = URL.createObjectURL(file)
        return `
        <div class="col-3">
          <div class="card">
            <img src="${url}" class="card-img-top" style="height: 80px; object-fit: cover;">
            <div class="card-body p-1">
              <small class="text-truncate d-block">${file.name}</small>
            </div>
          </div>
        </div>
      `
      })
      .join('')

    document.getElementById('submitUploadBtn').disabled = false
  },

  async submitUpload() {
    if (this.selectedFiles.length === 0) return

    showLoading(true)
    try {
      const businessType = document.getElementById('uploadImageType').value
      let successCount = 0

      for (const file of this.selectedFiles) {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', businessType)

        const response = await fetch(API_ENDPOINTS.IMAGE.UPLOAD, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: formData
        })

        const result = await response.json()
        if (result.success) successCount++
      }

      showSuccessToast(`成功上传 ${successCount}/${this.selectedFiles.length} 张图片`)
      bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide()
      this.loadData()
    } catch (error) {
      showErrorToast(error.message || '上传失败')
    } finally {
      showLoading(false)
    }
  },

  showDetail(id) {
    // 后端使用 image_id 字段
    const item = this.images.find(i => i.image_id === id)
    if (!item) return

    alert(
      `图片详情:\n文件名: ${item.original_filename}\n大小: ${this.formatFileSize(item.file_size)}\n类型: ${item.business_type}\nURL: ${item.url}`
    )
  }
}

// ==================== 公共函数 ====================
function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'
}

function showSuccessToast(message) {
  const toast = document.getElementById('successToast')
  document.getElementById('successToastBody').textContent = message
  new bootstrap.Toast(toast).show()
}

function showErrorToast(message) {
  const toast = document.getElementById('errorToast')
  document.getElementById('errorToastBody').textContent = message
  new bootstrap.Toast(toast).show()
}
