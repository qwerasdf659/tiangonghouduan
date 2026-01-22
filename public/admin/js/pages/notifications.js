/**
 * 系统通知中心页面 - Alpine.js 版本
 * @file public/admin/js/pages/notifications.js
 */

function notificationsPage() {
  return {
    // ========== 状态 ==========
    userInfo: null,
    loading: false,
    globalLoading: false,
    sending: false,
    
    notifications: [],
    currentNotification: null,
    wsConnection: null,
    
    // 统计数据
    stats: {
      total: null,
      unread: null,
      today: null,
      week: null
    },
    
    // 筛选条件
    filters: {
      type: 'all',
      status: 'all'
    },
    
    // 发送表单
    sendForm: {
      type: '',
      title: '',
      content: '',
      target: 'all'
    },
    
    // Bootstrap 模态框实例
    detailModalInstance: null,
    sendModalInstance: null,

    // ========== 初始化 ==========
    init() {
      console.log('[NotificationsPage] 初始化')
      
      // 检查登录
      const token = getToken()
      if (!token) {
        window.location.href = '/admin/login.html'
        return
      }
      
      // 获取用户信息
      this.userInfo = getCurrentUser()
      
      // 初始化模态框
      this.$nextTick(() => {
        this.detailModalInstance = new bootstrap.Modal(this.$refs.detailModal)
        this.sendModalInstance = new bootstrap.Modal(this.$refs.sendModal)
      })
      
      // 加载数据
      this.loadNotifications()
      
      // 初始化 WebSocket
      this.initWebSocket()
      
      // 定时刷新
      setInterval(() => this.loadNotifications(true), 30000)
    },

    // ========== WebSocket ==========
    initWebSocket() {
      try {
        if (typeof io === 'undefined') {
          console.warn('Socket.IO 客户端未加载')
          return
        }

        this.wsConnection = io({
          auth: { token: getToken() }
        })

        this.wsConnection.on('connect', () => {
          console.log('✅ Socket.IO 连接成功')
          this.wsConnection.emit('auth', { token: getToken(), role: 'admin' })
        })

        this.wsConnection.on('notification', (data) => {
          console.log('📬 收到新通知:', data)
          this.loadNotifications(true)
        })

        this.wsConnection.on('connect_error', (error) => {
          console.error('Socket.IO 连接错误:', error)
        })
      } catch (error) {
        console.error('Socket.IO 初始化失败:', error)
      }
    },

    // ========== 数据加载 ==========
    async loadNotifications(silent = false) {
      if (!silent) this.loading = true

      try {
        const params = new URLSearchParams()
        if (this.filters.type !== 'all') params.append('type', this.filters.type)
        if (this.filters.status !== 'all') params.append('status', this.filters.status)

        const response = await apiRequest(`${API_ENDPOINTS.NOTIFICATION.LIST}?${params}`)

        if (response?.success) {
          this.notifications = response.data?.notifications || []
          
          // 更新统计
          if (response.data?.statistics) {
            this.stats = {
              total: response.data.statistics.total ?? 0,
              unread: response.data.statistics.unread ?? 0,
              today: response.data.statistics.today ?? 0,
              week: response.data.statistics.week ?? 0
            }
          }
        }
      } catch (error) {
        console.error('加载通知失败:', error)
        if (!silent) alert('❌ 加载失败: ' + error.message)
      } finally {
        if (!silent) this.loading = false
      }
    },

    // ========== 查看通知 ==========
    async viewNotification(notif) {
      this.globalLoading = true

      try {
        const id = notif.notification_id || notif.id
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.NOTIFICATION.READ, { id }))

        if (response?.success) {
          this.currentNotification = response.data?.notification || response.data

          // 标记为已读
          if (!notif.is_read) {
            await this.markAsRead(id)
            this.loadNotifications(true)
          }

          this.detailModalInstance.show()
        } else {
          alert('❌ 获取失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        console.error('查看通知失败:', error)
        alert('❌ 获取失败: ' + error.message)
      } finally {
        this.globalLoading = false
      }
    },

    // ========== 标记已读 ==========
    async markAsRead(id) {
      try {
        await apiRequest(API.buildURL(API_ENDPOINTS.NOTIFICATION.READ, { id }), { method: 'POST' })
      } catch (error) {
        console.error('标记已读失败:', error)
      }
    },

    // ========== 全部已读 ==========
    async markAllAsRead() {
      if (!confirm('确认将所有通知标记为已读？')) return

      this.globalLoading = true

      try {
        const response = await apiRequest(API_ENDPOINTS.NOTIFICATION.READ_ALL, { method: 'POST' })

        if (response?.success) {
          alert('✅ 所有通知已标记为已读')
          this.loadNotifications()
        } else {
          alert('❌ 操作失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        console.error('标记已读失败:', error)
        alert('❌ 操作失败: ' + error.message)
      } finally {
        this.globalLoading = false
      }
    },

    // ========== 清空所有 ==========
    async clearAll() {
      if (!confirm('确认清空所有通知？此操作不可恢复！')) return

      this.globalLoading = true

      try {
        const response = await apiRequest(API_ENDPOINTS.NOTIFICATION.CLEAR, { method: 'POST' })

        if (response?.success) {
          alert('✅ 所有通知已清空')
          this.loadNotifications()
        } else {
          alert('❌ 操作失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        console.error('清空失败:', error)
        alert('❌ 操作失败: ' + error.message)
      } finally {
        this.globalLoading = false
      }
    },

    // ========== 发送通知 ==========
    openSendModal() {
      this.sendForm = { type: '', title: '', content: '', target: 'all' }
      this.sendModalInstance.show()
    },

    async sendNotification() {
      if (!this.sendForm.type) {
        alert('❌ 请选择通知类型')
        return
      }
      if (!this.sendForm.title.trim()) {
        alert('❌ 请输入通知标题')
        return
      }
      if (!this.sendForm.content.trim()) {
        alert('❌ 请输入通知内容')
        return
      }

      this.sending = true

      try {
        const response = await apiRequest(API_ENDPOINTS.NOTIFICATION.SEND, {
          method: 'POST',
          body: JSON.stringify(this.sendForm)
        })

        if (response?.success) {
          alert('✅ 通知已发送')
          this.sendModalInstance.hide()
          this.loadNotifications()
        } else {
          alert('❌ 发送失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        console.error('发送通知失败:', error)
        alert('❌ 发送失败: ' + error.message)
      } finally {
        this.sending = false
      }
    },

    // ========== 工具方法 ==========
    getNotificationIcon(type) {
      const icons = {
        system: '<i class="bi bi-info-circle-fill text-primary" style="font-size: 2rem;"></i>',
        user: '<i class="bi bi-person-fill text-success" style="font-size: 2rem;"></i>',
        order: '<i class="bi bi-cart-fill text-warning" style="font-size: 2rem;"></i>',
        alert: '<i class="bi bi-exclamation-triangle-fill text-danger" style="font-size: 2rem;"></i>'
      }
      return icons[type] || icons.system
    },

    getTypeBadgeClass(type) {
      const classes = {
        system: 'bg-primary',
        user: 'bg-success',
        order: 'bg-warning text-dark',
        alert: 'bg-danger'
      }
      return classes[type] || 'bg-secondary'
    },

    getTypeText(type) {
      const texts = {
        system: '系统通知',
        user: '用户动态',
        order: '订单消息',
        alert: '警告提醒'
      }
      return texts[type] || '未知'
    },

    formatRelativeTime(dateStr) {
      if (!dateStr) return ''
      if (typeof formatRelativeTime === 'function') {
        return formatRelativeTime(dateStr)
      }
      return this.formatDate(dateStr)
    },

    formatDate(dateStr) {
      if (!dateStr) return '-'
      if (typeof formatDate === 'function') {
        return formatDate(dateStr)
      }
      try {
        return new Date(dateStr).toLocaleString('zh-CN')
      } catch {
        return dateStr
      }
    },

    logout() {
      if (this.wsConnection?.connected) {
        this.wsConnection.disconnect()
      }
      if (typeof logout === 'function') {
        logout()
      }
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('notificationsPage', notificationsPage)
  console.log('✅ [NotificationsPage] Alpine 组件已注册')
})

console.log('📦 通知中心页面 (Alpine.js) 已加载')
