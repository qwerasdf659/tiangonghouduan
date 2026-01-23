/**
 * 内容管理中心 - Alpine.js Mixin 重构版
 * 
 * @file public/admin/js/pages/content-management.js
 * @description 内容管理中心页面（Tab 导航整合多个子模块）
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * 
 * 重构说明：
 * - 使用 createPageMixin 组合 Mixin
 * - 整合内容管理相关的多个子模块
 * - 保留 Tab 导航和 URL 参数同步
 * 
 * 包含子模块：
 * - 公告管理 (announcements)
 * - 通知管理 (notifications)
 * - 弹窗横幅 (popup-banners)
 * - 图片资源 (image-resources)
 */

document.addEventListener('alpine:init', () => {
  console.log('[ContentManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 全局 Store: 当前页面状态
  Alpine.store('contentPage', 'announcements')

  // ==================== 导航组件 ====================
  Alpine.data('contentNavigation', () => ({
    ...createPageMixin(),

    /** 当前页面 */
    currentPage: 'announcements',

    /** 子页面配置 */
    subPages: [
      { id: 'announcements', title: '公告管理', icon: 'bi-megaphone' },
      { id: 'notifications', title: '通知管理', icon: 'bi-bell' },
      { id: 'popup-banners', title: '弹窗横幅', icon: 'bi-images' },
      { id: 'image-resources', title: '图片资源', icon: 'bi-file-image' }
    ],

    /**
     * 初始化
     */
    init() {
      console.log('✅ 内容管理导航初始化 (Mixin v3.0)')

      // 权限检查
      if (!this.checkAuth()) return

      // 从 URL 参数获取当前页面
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'announcements'
      Alpine.store('contentPage', this.currentPage)
    },

    /**
     * 切换页面
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('contentPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // ==================== 页面内容组件 ====================
  Alpine.data('contentPageContent', () => ({
    ...createPageMixin(),

    // ==================== 公告管理相关 ====================

    /** 公告列表 */
    announcements: [],

    /** 公告分页 */
    announcementPagination: { totalPages: 1, total: 0 },

    /** 公告筛选 */
    announcementFilters: { status: '', type: '', keyword: '' },

    /** 公告表单 */
    announcementForm: {
      title: '',
      type: 'notice',
      status: 'active',
      content: '',
      priority: 'medium',
      expiresAt: ''
    },

    /** 当前编辑的公告ID */
    editingAnnouncementId: null,

    // ==================== 通知管理相关 ====================

    /** 通知列表 */
    notifications: [],

    /** 通知统计 */
    notificationStats: { total: 0, unread: 0, today: 0, week: 0 },

    /** 通知筛选 */
    notificationFilters: { type: 'all', status: 'all' },

    /** 当前查看的通知 */
    currentNotification: null,

    /** 发送通知表单 */
    sendNotificationForm: { type: '', title: '', content: '', target: 'all' },

    // ==================== 弹窗横幅相关 ====================

    /** 弹窗列表 */
    banners: [],

    /** 弹窗统计 */
    bannerStats: { total: 0, active: 0, inactive: 0, home: 0 },

    /** 弹窗分页 */
    bannerPagination: { total: 0, totalPages: 1 },

    /** 弹窗筛选 */
    bannerFilters: { position: '', status: '', keyword: '' },

    /** 弹窗表单 */
    bannerForm: {
      banner_id: null,
      title: '',
      position: 'home',
      display_order: 0,
      is_active: true,
      link_type: 'none',
      link_url: '',
      start_time: '',
      end_time: ''
    },

    /** 弹窗图片上传状态 */
    selectedImageFile: null,
    imagePreview: null,
    imageFileName: '',
    isDragging: false,

    // ==================== 图片资源相关 ====================

    /** 图片列表 */
    images: [],

    /** 图片统计 */
    imageStats: { total: 0, totalSize: 0 },

    /** 图片筛选 */
    imageFilters: { type: '', keyword: '' },

    /** 选中的图片 */
    selectedImage: null,

    // ==================== 通用状态 ====================

    /** 保存中状态 */
    saving: false,

    /** 发送中状态 */
    sending: false,

    /** 编辑模式 */
    isEditMode: false,

    // ==================== 计算属性 ====================

    /**
     * 获取当前页面
     */
    get currentPage() {
      return Alpine.store('contentPage')
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化
     */
    init() {
      console.log('✅ 内容管理内容初始化 (Mixin v3.0)')

      // 初始加载数据
      this.loadPageData()

      // 监听页面切换
      this.$watch('$store.contentPage', () => this.loadPageData())
    },

    /**
     * 根据当前页面加载数据
     */
    async loadPageData() {
      const page = this.currentPage

      await this.withLoading(async () => {
        switch (page) {
          case 'announcements':
            await this.loadAnnouncements()
            break
          case 'notifications':
            await this.loadNotifications()
            break
          case 'popup-banners':
            await this.loadBanners()
            break
          case 'image-resources':
            await this.loadImages()
            break
        }
      }, { loadingText: '加载数据...' })
    },

    // ==================== 公告管理方法 ====================

    /**
     * 加载公告列表
     */
    async loadAnnouncements() {
      try {
        const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize
        })

        if (this.announcementFilters.status) params.append('status', this.announcementFilters.status)
        if (this.announcementFilters.type) params.append('type', this.announcementFilters.type)
        if (this.announcementFilters.keyword) params.append('keyword', this.announcementFilters.keyword)

        const response = await this.apiGet(
          `${API_ENDPOINTS.ANNOUNCEMENT?.LIST || '/api/v4/console/announcements'}?${params}`,
          {},
          { showLoading: false }
        )

        if (response && response.success) {
          this.announcements = response.data?.announcements || response.data?.list || []
          if (response.data?.pagination) {
            this.announcementPagination = {
              totalPages: response.data.pagination.total_pages || 1,
              total: response.data.pagination.total || 0
            }
          }
        }
      } catch (error) {
        console.error('[ContentManagement] 加载公告失败:', error)
        this.announcements = []
      }
    },

    /**
     * 打开添加公告模态框
     */
    openAddAnnouncementModal() {
      this.editingAnnouncementId = null
      this.announcementForm = {
        title: '',
        type: 'notice',
        status: 'active',
        content: '',
        priority: 'medium',
        expiresAt: ''
      }
      this.showModal('announcementModal')
    },

    /**
     * 保存公告
     */
    async saveAnnouncement() {
      if (!this.announcementForm.title.trim()) {
        this.showError('请输入公告标题')
        return
      }
      if (!this.announcementForm.content.trim()) {
        this.showError('请输入公告内容')
        return
      }

      this.saving = true

      try {
        const payload = {
          title: this.announcementForm.title.trim(),
          content: this.announcementForm.content.trim(),
          type: this.announcementForm.type,
          priority: this.announcementForm.priority,
          is_active: this.announcementForm.status === 'active',
          expires_at: this.announcementForm.expiresAt || null
        }

        let response
        if (this.editingAnnouncementId) {
          response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.ANNOUNCEMENT?.UPDATE || '/api/v4/console/announcements/:id', { id: this.editingAnnouncementId }),
            { method: 'PUT', body: JSON.stringify(payload) }
          )
        } else {
          response = await this.apiCall(
            API_ENDPOINTS.ANNOUNCEMENT?.CREATE || '/api/v4/console/announcements',
            { method: 'POST', body: JSON.stringify(payload) }
          )
        }

        if (response?.success) {
          this.showSuccess(this.editingAnnouncementId ? '更新成功' : '发布成功')
          this.hideModal('announcementModal')
          this.loadAnnouncements()
        }
      } catch (error) {
        console.error('保存公告失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 编辑公告
     */
    async editAnnouncement(item) {
      this.editingAnnouncementId = item.announcement_id || item.id
      this.announcementForm = {
        title: item.title || '',
        type: item.type || 'notice',
        status: item.is_active ? 'active' : 'inactive',
        content: item.content || '',
        priority: item.priority || 'medium',
        expiresAt: item.expires_at ? this.formatDateTimeLocal(item.expires_at) : ''
      }
      this.showModal('announcementModal')
    },

    /**
     * 删除公告
     */
    async deleteAnnouncement(item) {
      const id = item.announcement_id || item.id
      await this.confirmAndExecute(
        `确认删除公告「${item.title}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.ANNOUNCEMENT?.DELETE || '/api/v4/console/announcements/:id', { id }),
            { method: 'DELETE' }
          )
          if (response?.success) {
            this.loadAnnouncements()
          }
        },
        { successMessage: '公告已删除' }
      )
    },

    /**
     * 格式化日期为 datetime-local 格式
     */
    formatDateTimeLocal(dateStr) {
      if (!dateStr) return ''
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return ''
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}`
      } catch {
        return ''
      }
    },

    // ==================== 通知管理方法 ====================

    /**
     * 加载通知列表
     */
    async loadNotifications() {
      try {
        const params = new URLSearchParams()
        if (this.notificationFilters.type !== 'all') params.append('type', this.notificationFilters.type)
        if (this.notificationFilters.status !== 'all') params.append('status', this.notificationFilters.status)

        const response = await this.apiGet(
          `${API_ENDPOINTS.NOTIFICATION?.LIST || '/api/v4/console/notifications'}?${params}`,
          {},
          { showLoading: false }
        )

        if (response && response.success) {
          this.notifications = response.data?.notifications || []
          if (response.data?.statistics) {
            this.notificationStats = {
              total: response.data.statistics.total ?? 0,
              unread: response.data.statistics.unread ?? 0,
              today: response.data.statistics.today ?? 0,
              week: response.data.statistics.week ?? 0
            }
          }
        }
      } catch (error) {
        console.error('[ContentManagement] 加载通知失败:', error)
        this.notifications = []
      }
    },

    /**
     * 查看通知详情
     */
    async viewNotification(notif) {
      const id = notif.notification_id || notif.id

      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.NOTIFICATION?.READ || '/api/v4/console/notifications/:id', { id })
        )

        if (response?.success) {
          this.currentNotification = response.data?.notification || response.data
          this.showModal('notificationDetailModal')
        }
      } catch (error) {
        console.error('获取通知详情失败:', error)
      }
    },

    /**
     * 全部标记已读
     */
    async markAllNotificationsAsRead() {
      await this.confirmAndExecute(
        '确认将所有通知标记为已读？',
        async () => {
          const response = await this.apiCall(
            API_ENDPOINTS.NOTIFICATION?.READ_ALL || '/api/v4/console/notifications/read-all',
            { method: 'POST' }
          )
          if (response?.success) {
            this.loadNotifications()
          }
        },
        { successMessage: '所有通知已标记为已读' }
      )
    },

    /**
     * 发送通知
     */
    async sendNotification() {
      if (!this.sendNotificationForm.title.trim()) {
        this.showError('请输入通知标题')
        return
      }
      if (!this.sendNotificationForm.content.trim()) {
        this.showError('请输入通知内容')
        return
      }

      this.sending = true

      try {
        const payload = {
          type: this.sendNotificationForm.type || 'system',
          title: this.sendNotificationForm.title.trim(),
          content: this.sendNotificationForm.content.trim(),
          target: this.sendNotificationForm.target
        }

        const response = await this.apiCall(
          API_ENDPOINTS.NOTIFICATION?.SEND || '/api/v4/console/notifications/send',
          { method: 'POST', body: JSON.stringify(payload) }
        )

        if (response?.success) {
          this.showSuccess('通知发送成功')
          this.hideModal('sendNotificationModal')
          this.sendNotificationForm = { type: '', title: '', content: '', target: 'all' }
          this.loadNotifications()
        }
      } catch (error) {
        console.error('发送通知失败:', error)
        this.showError('发送失败: ' + error.message)
      } finally {
        this.sending = false
      }
    },

    // ==================== 弹窗横幅方法 ====================

    /**
     * 加载弹窗列表
     */
    async loadBanners() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.currentPage)
        params.append('page_size', this.pageSize)
        if (this.bannerFilters.position) params.append('position', this.bannerFilters.position)
        if (this.bannerFilters.status) params.append('is_active', this.bannerFilters.status)
        if (this.bannerFilters.keyword.trim()) params.append('keyword', this.bannerFilters.keyword.trim())

        const response = await this.apiGet(
          `${API_ENDPOINTS.POPUP_BANNER?.LIST || '/api/v4/console/popup-banners'}?${params.toString()}`,
          {},
          { showLoading: false }
        )

        if (response && response.success) {
          this.banners = response.data.banners || []
          this.bannerPagination = {
            total: response.data.pagination?.total || 0,
            totalPages: response.data.pagination?.total_pages || 1
          }
        }

        // 同时加载统计
        this.loadBannerStats()
      } catch (error) {
        console.error('[ContentManagement] 加载弹窗失败:', error)
        this.banners = []
      }
    },

    /**
     * 加载弹窗统计
     */
    async loadBannerStats() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.POPUP_BANNER?.STATS || '/api/v4/console/popup-banners/stats',
          {},
          { showError: false, showLoading: false }
        )

        if (response?.success) {
          const statsData = response.data?.statistics || response.data || {}
          this.bannerStats = {
            total: statsData.total ?? 0,
            active: statsData.active ?? 0,
            inactive: statsData.inactive ?? 0,
            home: statsData.by_position?.home ?? 0
          }
        }
      } catch (error) {
        console.error('[ContentManagement] 加载弹窗统计失败:', error)
      }
    },

    /**
     * 打开添加弹窗模态框
     */
    openAddBannerModal() {
      this.isEditMode = false
      this.bannerForm = {
        banner_id: null,
        title: '',
        position: 'home',
        display_order: 0,
        is_active: true,
        link_type: 'none',
        link_url: '',
        start_time: '',
        end_time: ''
      }
      this.selectedImageFile = null
      this.imagePreview = null
      this.imageFileName = ''
      this.showModal('bannerModal')
    },

    /**
     * 编辑弹窗横幅
     */
    async editBanner(banner) {
      this.isEditMode = true
      this.bannerForm = {
        banner_id: banner.banner_id,
        title: banner.title || '',
        position: banner.position || 'home',
        display_order: banner.display_order || 0,
        is_active: banner.is_active,
        link_type: banner.link_type || 'none',
        link_url: banner.link_url || '',
        start_time: banner.start_time ? this.formatDateTimeLocal(banner.start_time) : '',
        end_time: banner.end_time ? this.formatDateTimeLocal(banner.end_time) : ''
      }
      this.imagePreview = banner.image_url || null
      this.imageFileName = banner.image_url ? banner.image_url.split('/').pop() : ''
      this.selectedImageFile = null
      this.showModal('bannerModal')
    },

    /**
     * 切换弹窗状态
     */
    async toggleBanner(banner) {
      const newStatus = !banner.is_active
      await this.confirmAndExecute(
        `确认${newStatus ? '启用' : '禁用'}横幅「${banner.title}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.POPUP_BANNER?.TOGGLE || '/api/v4/console/popup-banners/:id/toggle', { id: banner.banner_id }),
            { method: 'PUT' }
          )
          if (response?.success) {
            this.loadBanners()
          }
        },
        { successMessage: `横幅已${newStatus ? '启用' : '禁用'}` }
      )
    },

    /**
     * 删除弹窗横幅
     */
    async deleteBanner(banner) {
      await this.confirmAndExecute(
        `确认删除横幅「${banner.title}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.POPUP_BANNER?.DELETE || '/api/v4/console/popup-banners/:id', { id: banner.banner_id }),
            { method: 'DELETE' }
          )
          if (response?.success) {
            this.loadBanners()
          }
        },
        { successMessage: '横幅已删除' }
      )
    },

    /**
     * 保存弹窗横幅
     */
    async saveBanner() {
      if (!this.bannerForm.title.trim()) {
        this.showError('请输入横幅标题')
        return
      }

      this.saving = true

      try {
        const formData = new FormData()
        formData.append('title', this.bannerForm.title.trim())
        formData.append('position', this.bannerForm.position)
        formData.append('display_order', this.bannerForm.display_order)
        formData.append('is_active', this.bannerForm.is_active)
        formData.append('link_type', this.bannerForm.link_type)
        formData.append('link_url', this.bannerForm.link_url || '')
        if (this.bannerForm.start_time) formData.append('start_time', this.bannerForm.start_time)
        if (this.bannerForm.end_time) formData.append('end_time', this.bannerForm.end_time)
        
        if (this.selectedImageFile) {
          formData.append('image', this.selectedImageFile)
        }

        let response
        if (this.isEditMode && this.bannerForm.banner_id) {
          response = await API.request(
            API.buildURL(API_ENDPOINTS.POPUP_BANNER?.UPDATE || '/api/v4/console/popup-banners/:id', { id: this.bannerForm.banner_id }),
            { method: 'PUT', body: formData }
          )
        } else {
          response = await API.request(
            API_ENDPOINTS.POPUP_BANNER?.CREATE || '/api/v4/console/popup-banners',
            { method: 'POST', body: formData }
          )
        }

        if (response?.success) {
          this.showSuccess(this.isEditMode ? '横幅更新成功' : '横幅添加成功')
          this.hideModal('bannerModal')
          this.loadBanners()
        }
      } catch (error) {
        console.error('保存横幅失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 处理图片选择
     */
    handleImageSelect(event) {
      const file = event.target.files?.[0]
      if (file) {
        this.processImageFile(file)
      }
    },

    /**
     * 处理图片拖放
     */
    handleImageDrop(event) {
      this.isDragging = false
      const file = event.dataTransfer?.files?.[0]
      if (file) {
        this.processImageFile(file)
      }
    },

    /**
     * 处理图片文件
     */
    processImageFile(file) {
      if (!file.type.startsWith('image/')) {
        this.showError('请选择图片文件')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        this.showError('图片大小不能超过 5MB')
        return
      }

      this.selectedImageFile = file
      this.imageFileName = file.name

      const reader = new FileReader()
      reader.onload = (e) => {
        this.imagePreview = e.target.result
      }
      reader.readAsDataURL(file)
    },

    /**
     * 清除图片
     */
    clearImage() {
      this.selectedImageFile = null
      this.imagePreview = null
      this.imageFileName = ''
    },

    // ==================== 图片资源方法 ====================

    /**
     * 加载图片列表
     */
    async loadImages() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.currentPage)
        params.append('page_size', this.pageSize)
        if (this.imageFilters.type) params.append('type', this.imageFilters.type)
        if (this.imageFilters.keyword.trim()) params.append('keyword', this.imageFilters.keyword.trim())

        const response = await this.apiGet(
          `${API_ENDPOINTS.IMAGE_RESOURCE?.LIST || '/api/v4/console/images'}?${params.toString()}`,
          {},
          { showLoading: false }
        )

        if (response && response.success) {
          this.images = response.data?.images || response.data?.list || []
          if (response.data?.statistics) {
            this.imageStats = {
              total: response.data.statistics.total ?? 0,
              totalSize: response.data.statistics.total_size ?? 0
            }
          }
        }
      } catch (error) {
        console.error('[ContentManagement] 加载图片失败:', error)
        this.images = []
      }
    },

    /**
     * 查看图片
     */
    viewImage(image) {
      this.selectedImage = image
      // 在新窗口中打开图片
      const imageUrl = image.url || image.image_url
      if (imageUrl) {
        window.open(imageUrl, '_blank')
      }
    },

    /**
     * 删除图片
     */
    async deleteImage(image) {
      const id = image.image_id || image.id
      const filename = image.filename || image.name || '未命名图片'
      
      await this.confirmAndExecute(
        `确认删除图片「${filename}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.IMAGE_RESOURCE?.DELETE || '/api/v4/console/images/:id', { id }),
            { method: 'DELETE' }
          )
          if (response?.success) {
            this.loadImages()
          }
        },
        { successMessage: '图片已删除' }
      )
    },

    // ==================== 工具方法 ====================

    /**
     * 获取公告状态徽章
     */
    getAnnouncementStatusBadge(isActive) {
      return isActive
        ? '<span class="badge bg-success">已发布</span>'
        : '<span class="badge bg-secondary">已下线</span>'
    },

    /**
     * 获取公告类型徽章
     */
    getAnnouncementTypeBadge(type) {
      const map = {
        system: '<span class="badge bg-primary">系统</span>',
        activity: '<span class="badge bg-success">活动</span>',
        maintenance: '<span class="badge bg-warning">维护</span>',
        notice: '<span class="badge bg-info">通知</span>'
      }
      return map[type] || `<span class="badge bg-secondary">${type || '-'}</span>`
    },

    /**
     * 获取通知图标
     */
    getNotificationIcon(type) {
      const icons = {
        system: '<i class="bi bi-info-circle-fill text-primary" style="font-size: 2rem;"></i>',
        user: '<i class="bi bi-person-fill text-success" style="font-size: 2rem;"></i>',
        order: '<i class="bi bi-cart-fill text-warning" style="font-size: 2rem;"></i>',
        alert: '<i class="bi bi-exclamation-triangle-fill text-danger" style="font-size: 2rem;"></i>'
      }
      return icons[type] || icons.system
    },

    /**
     * 获取弹窗位置文本
     */
    getBannerPositionText(position) {
      const texts = { home: '首页', profile: '个人中心' }
      return texts[position] || position
    },

    /**
     * 格式化日期（安全）
     */
    formatDateSafe(dateStr) {
      if (!dateStr) return '-'

      if (typeof dateStr === 'string' && dateStr.includes('年')) {
        return dateStr.replace(/星期[一二三四五六日]/, '').trim()
      }

      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return dateStr
      }
    },

    /**
     * 格式化相对时间
     */
    formatRelativeTime(dateStr) {
      if (!dateStr) return ''
      if (typeof formatRelativeTime === 'function') {
        return formatRelativeTime(dateStr)
      }
      return this.formatDateSafe(dateStr)
    },

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
      if (!bytes) return '0 B'
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }
  }))

  console.log('✅ [ContentManagementPage] Alpine 组件已注册 (Mixin v3.0)')
})

console.log('📦 [ContentManagement] 页面脚本已加载 (Mixin v3.0)')

