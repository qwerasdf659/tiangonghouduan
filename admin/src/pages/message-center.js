/**
 * 消息中心页面模块 - P1-4 增强版
 * @description 管理系统通知消息的展示和操作，支持 WebSocket 实时推送
 * @version 2.0.0
 * @date 2026-02-04
 *
 * P1-4 增强内容：
 * 1. WebSocket 实时推送新消息
 * 2. 未读数量实时更新
 * 3. 更多筛选项（来源筛选）
 * 4. 浏览器通知支持
 */

import Alpine from 'alpinejs'
import { logger, $confirmDanger } from '../utils/index.js'
import { createPageMixin } from '../alpine/mixins/index.js'
import { request, buildURL, API_PREFIX } from '../api/base.js'
import { io } from 'socket.io-client'

// API 端点 - 使用 system 域，添加 API_PREFIX 前缀
const MESSAGE_ENDPOINTS = {
  LIST: `${API_PREFIX}/system/notifications`,
  MARK_READ: (id) => `${API_PREFIX}/system/notifications/${id}/read`,
  MARK_ALL_READ: `${API_PREFIX}/system/notifications/read-all`,
  DELETE: (id) => `${API_PREFIX}/system/notifications/${id}`
}

/**
 * 消息中心页面组件
 */
function messageCenterPage() {
  return {
    ...createPageMixin(),

    // 消息列表
    messages: [],

    // 未读数量
    unreadCount: 0,

    /** @type {string|null} 上次数据更新时间（#2） */
    lastUpdateTime: null,

    // 声音设置
    soundEnabled: true,

    // 选中的消息ID
    selectedIds: [],

    // 筛选条件（P1-4 增强：添加来源筛选）
    filter: {
      type: '',
      status: '',
      time_range: '',
      keyword: '',
      source: '' // P1-4: 新增来源筛选
    },

    // 分页
    pagination: {
      page: 1,
      page_size: 20,
      total: 0
    },

    // 详情模态框
    detailModal: false,
    currentMessage: null,

    // ========== P1-4 WebSocket 实时推送 ==========
    /** @type {Object|null} Socket.IO 连接实例 */
    socket: null,
    /** @type {boolean} WebSocket 连接状态 */
    wsConnected: false,
    /** @type {number} 重连尝试次数 */
    wsReconnectAttempts: 0,
    /** @type {number} 最大重连次数 */
    maxReconnectAttempts: 5,
    /** @type {Object|null} 音频上下文 */
    audioContext: null,
    /** @type {number|null} 轮询定时器 */
    pollTimer: null,

    // 可用的消息来源列表
    availableSources: ['系统', '抽奖模块', '客服系统', '风控系统', '财务系统', '用户管理'],

    async init() {
      logger.info('[MessageCenter] 初始化消息中心 (P1-4 WebSocket 增强版)')

      // 加载声音设置
      this.soundEnabled = localStorage.getItem('notification_sound') !== 'false'

      // 初始化音频上下文
      this.initAudio()

      // 监听筛选变化
      this.$watch('filter.type', () => this.loadMessages())
      this.$watch('filter.source', () => this.loadMessages()) // P1-4: 监听来源筛选

      // 加载消息列表
      await this.loadMessages()

      // P1-4: 建立 WebSocket 连接
      this.connectWebSocket()

      // P1-4: 启动轮询作为降级方案
      this.startPolling()

      // P1-4: 请求浏览器通知权限
      this.requestNotificationPermission()
    },

    // ========== P1-4 音频初始化 ==========
    initAudio() {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
        logger.debug('[MessageCenter] 音频上下文已初始化')
      } catch (e) {
        logger.warn('[MessageCenter] 音频初始化失败:', e.message)
      }
    },

    // ========== P1-4 播放通知提示音 ==========
    playNotificationSound() {
      if (!this.soundEnabled || !this.audioContext) return

      try {
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume()
        }

        const oscillator = this.audioContext.createOscillator()
        const gainNode = this.audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(this.audioContext.destination)

        oscillator.frequency.value = 800
        oscillator.type = 'sine'

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime)
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.05)
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3)

        oscillator.start(this.audioContext.currentTime)
        oscillator.stop(this.audioContext.currentTime + 0.3)

        logger.debug('[MessageCenter] 播放提示音')
      } catch (e) {
        logger.warn('[MessageCenter] 播放提示音失败:', e.message)
      }
    },

    // ========== P1-4 WebSocket 连接管理 ==========
    connectWebSocket() {
      if (this.socket && this.wsConnected) return

      try {
        const token = localStorage.getItem('admin_token')
        if (!token) {
          logger.warn('[MessageCenter] 未登录，跳过 WebSocket 连接')
          return
        }

        const socketUrl = window.location.origin
        logger.debug('[MessageCenter] 连接 Socket.IO:', socketUrl)

        this.socket = io(socketUrl, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 30000
        })

        this.socket.on('connect', () => {
          logger.info('[MessageCenter] Socket.IO 连接成功')
          this.wsConnected = true
          this.wsReconnectAttempts = 0

          // 注册为管理员客户端
          this.socket.emit('register_admin', { token })
        })

        // 监听通知消息
        this.socket.on('notification', (data) => {
          this.handleNewNotification(data)
        })

        // 监听徽章更新
        this.socket.on('badge_update', (data) => {
          if (data.unread_count !== undefined) {
            this.unreadCount = data.unread_count
          }
        })

        // 监听新消息（客服消息也作为通知）
        this.socket.on('new_message', (data) => {
          this.handleNewNotification({
            type: 'info',
            title: '新客服消息',
            message: data.content || '收到新消息',
            source: '客服系统',
            ...data
          })
        })

        this.socket.on('disconnect', (reason) => {
          logger.info('[MessageCenter] Socket.IO 连接断开:', reason)
          this.wsConnected = false
        })

        this.socket.on('connect_error', (error) => {
          logger.warn('[MessageCenter] Socket.IO 连接错误:', error.message)
          this.wsConnected = false
          this.wsReconnectAttempts++
        })
      } catch (e) {
        logger.warn('[MessageCenter] Socket.IO 连接失败:', e.message)
        this.wsConnected = false
      }
    },

    // ========== P1-4 处理新通知 ==========
    handleNewNotification(notification) {
      logger.debug('[MessageCenter] 收到新通知:', notification)

      // 构造完整的消息对象
      const newMessage = {
        id: notification.id || Date.now(),
        type: notification.type || 'info',
        title: notification.title || '新消息',
        message: notification.message || '',
        is_read: false,
        created_at: notification.created_at || new Date().toISOString(),
        source: notification.source || '系统'
      }

      // 添加到列表顶部
      this.messages.unshift(newMessage)
      this.unreadCount++
      this.pagination.total++

      // 播放提示音
      this.playNotificationSound()

      // 显示浏览器通知
      this.showBrowserNotification(newMessage)

      // 显示 Toast 提示
      if (typeof this.showSuccess === 'function') {
        this.showInfo?.(`收到新消息：${newMessage.title}`)
      }
    },

    // ========== P1-4 浏览器通知 ==========
    requestNotificationPermission() {
      if (!('Notification' in window)) return

      if (Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          logger.debug('[MessageCenter] 浏览器通知权限:', permission)
        })
      }
    },

    showBrowserNotification(message) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return

      try {
        new Notification(message.title, {
          body: message.message,
          icon: '/admin/favicon.svg',
          tag: 'message-center-' + message.id
        })
      } catch (e) {
        logger.warn('[MessageCenter] 浏览器通知显示失败:', e.message)
      }
    },

    // ========== P1-4 轮询降级方案 ==========
    startPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
      }

      // 每 30 秒轮询一次
      this.pollTimer = setInterval(() => {
        if (this.wsConnected) return // WebSocket 连接正常则跳过轮询
        this.loadMessages()
      }, 30000)
    },

    async loadMessages() {
      this.loading = true
      try {
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size
        }

        if (this.filter.type) params.type = this.filter.type
        if (this.filter.status) params.status = this.filter.status
        if (this.filter.time_range) params.time_range = this.filter.time_range
        if (this.filter.keyword) params.keyword = this.filter.keyword
        if (this.filter.source) params.source = this.filter.source // P1-4: 来源筛选

        const result = await request({
          url: buildURL(MESSAGE_ENDPOINTS.LIST, params),
          method: 'GET'
        })

        if (result.data) {
          this.messages = result.data.items || result.data || []
          this.pagination.total = result.data.total || this.messages.length
          this.unreadCount =
            result.data.unread_count || this.messages.filter((m) => !m.is_read).length
        }
      } catch (e) {
        logger.warn('[MessageCenter] loadMessages 失败:', e.message)
        // 模拟数据
        this.messages = this.generateMockMessages()

        // P1-4: 应用来源筛选到模拟数据
        if (this.filter.source) {
          this.messages = this.messages.filter((m) => m.source === this.filter.source)
        }

        this.pagination.total = this.messages.length + 50
        this.unreadCount = this.messages.filter((m) => !m.is_read).length
        // #2 更新上次刷新时间
        this.lastUpdateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } finally {
        this.loading = false
      }
    },

    generateMockMessages() {
      const types = ['alert', 'warning', 'info', 'success']
      const titles = {
        alert: ['新的消耗审核', '客服会话请求', '风控告警'],
        warning: ['预算告警', '库存不足', '中奖率异常'],
        info: ['系统通知', '活动上线', '数据报表'],
        success: ['审核通过', '任务完成', '发放成功']
      }

      const messages = []
      for (let i = 0; i < 20; i++) {
        const type = types[Math.floor(Math.random() * types.length)]
        const titleList = titles[type]

        messages.push({
          id: i + 1,
          type: type,
          title: titleList[Math.floor(Math.random() * titleList.length)] + ' #' + (1000 + i),
          message: '这是一条系统通知消息的详细内容，描述了事件的具体情况和需要处理的事项。',
          is_read: Math.random() > 0.4,
          created_at: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
          source: ['系统', '抽奖模块', '客服系统', '风控系统'][Math.floor(Math.random() * 4)]
        })
      }

      return messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    },

    async refreshMessages() {
      this.pagination.page = 1
      await this.loadMessages()
    },

    changePage(page) {
      const maxPage = Math.ceil(this.pagination.total / this.pagination.page_size)
      if (page < 1 || page > maxPage) return
      this.pagination.page = page
      this.loadMessages()
    },

    getPageNumbers() {
      const total = Math.ceil(this.pagination.total / this.pagination.page_size)
      const current = this.pagination.page
      const pages = []

      if (total <= 7) {
        for (let i = 1; i <= total; i++) pages.push(i)
      } else {
        pages.push(1)
        if (current > 3) pages.push('...')
        for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
          pages.push(i)
        }
        if (current < total - 2) pages.push('...')
        pages.push(total)
      }

      return pages
    },

    viewMessage(message) {
      this.currentMessage = message
      this.detailModal = true

      // 标记为已读
      if (!message.is_read) {
        this.markAsRead(message)
      }
    },

    closeDetailModal() {
      this.detailModal = false
      this.currentMessage = null
    },

    async markAsRead(message) {
      if (message.is_read) return

      try {
        await request({
          url: MESSAGE_ENDPOINTS.MARK_READ(message.id),
          method: 'POST'
        })
      } catch (e) {
        logger.warn('[MessageCenter] markAsRead 失败:', e.message)
      }

      message.is_read = true
      this.unreadCount = Math.max(0, this.unreadCount - 1)
    },

    async markAllAsRead() {
      try {
        await request({
          url: MESSAGE_ENDPOINTS.MARK_ALL_READ,
          method: 'POST'
        })
      } catch (e) {
        logger.warn('[MessageCenter] markAllAsRead 失败:', e.message)
      }

      this.messages.forEach(m => (m.is_read = true))
      this.unreadCount = 0
    },

    async markSelectedAsRead() {
      for (const id of this.selectedIds) {
        const message = this.messages.find(m => m.id === id)
        if (message && !message.is_read) {
          await this.markAsRead(message)
        }
      }
      this.selectedIds = []
    },

    async deleteMessage(message) {
      if (!(await $confirmDanger('确定要删除这条消息吗？'))) return

      try {
        await request({
          url: MESSAGE_ENDPOINTS.DELETE(message.id),
          method: 'DELETE'
        })
      } catch (e) {
        logger.warn('[MessageCenter] deleteMessage 失败:', e.message)
      }

      this.messages = this.messages.filter(m => m.id !== message.id)
      this.pagination.total--
      if (!message.is_read) {
        this.unreadCount = Math.max(0, this.unreadCount - 1)
      }
    },

    async deleteSelected() {
      if (!(await $confirmDanger(`确定要删除选中的 ${this.selectedIds.length} 条消息吗？`))) return

      for (const id of this.selectedIds) {
        const message = this.messages.find(m => m.id === id)
        if (message) {
          try {
            await request({
              url: MESSAGE_ENDPOINTS.DELETE(id),
              method: 'DELETE'
            })
          } catch (e) {
            logger.warn('[MessageCenter] deleteSelected 失败:', e.message)
          }

          if (!message.is_read) {
            this.unreadCount = Math.max(0, this.unreadCount - 1)
          }
        }
      }

      this.messages = this.messages.filter(m => !this.selectedIds.includes(m.id))
      this.pagination.total -= this.selectedIds.length
      this.selectedIds = []
    },

    handleMessageAction(message) {
      const urlMap = {
        alert: '/admin/pending-center.html',
        warning: '/admin/lottery-alerts.html',
        info: '/admin/system-settings.html',
        success: '/admin/statistics.html'
      }

      const url = urlMap[message?.type] || '/admin/pending-center.html'

      this.closeDetailModal()

      // 通知父窗口打开Tab
      if (window.parent && window.parent !== window) {
        window.parent.dispatchEvent(
          new CustomEvent('open-tab', {
            detail: {
              id: message?.type || 'pending',
              title: this.getTypeLabel(message?.type) || '待处理',
              icon: this.getTypeIcon(message?.type) || '📋',
              url: url
            }
          })
        )
      } else {
        window.location.href = url
      }
    },

    toggleSound() {
      this.soundEnabled = !this.soundEnabled
      localStorage.setItem('notification_sound', this.soundEnabled)
    },

    getTypeIcon(type) {
      const icons = {
        alert: '🔔',
        warning: '⚠️',
        info: 'ℹ️',
        success: '✅'
      }
      return icons[type] || '📬'
    },

    getTypeLabel(type) {
      const labels = {
        alert: '告警',
        warning: '预警',
        info: '通知',
        success: '成功'
      }
      return labels[type] || '消息'
    },

    getTypeColorClass(type) {
      const colors = {
        alert: 'text-red-500 bg-red-50',
        warning: 'text-yellow-500 bg-yellow-50',
        info: 'text-blue-500 bg-blue-50',
        success: 'text-green-500 bg-green-50'
      }
      return colors[type] || 'text-gray-500 bg-gray-50'
    },

    getTypeBadgeClass(type) {
      const classes = {
        alert: 'bg-red-100 text-red-600',
        warning: 'bg-yellow-100 text-yellow-600',
        info: 'bg-blue-100 text-blue-600',
        success: 'bg-green-100 text-green-600'
      }
      return classes[type] || 'bg-gray-100 text-gray-600'
    },

    formatTime(dateStr) {
      if (!dateStr) return '--'
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date

      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
      if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'

      // 强制北京时区
      return date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    },

    formatFullTime(dateStr) {
      if (!dateStr) return '--'
      // 强制北京时区
      return new Date(dateStr).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    },

    // ========== P1-4 组件销毁清理 ==========
    destroy() {
      // 清理轮询定时器
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }

      // 关闭 WebSocket 连接
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
        this.wsConnected = false
      }

      // 关闭音频上下文
      if (this.audioContext) {
        this.audioContext.close()
        this.audioContext = null
      }

      logger.debug('[MessageCenter] 组件资源已清理')
    },

    // ========== P1-4 WebSocket 连接状态显示 ==========
    get connectionStatusText() {
      if (this.wsConnected) return '🟢 实时连接'
      if (this.wsReconnectAttempts > 0) return `🟡 重连中 (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})`
      return '🔴 离线'
    },

    get connectionStatusClass() {
      if (this.wsConnected) return 'text-green-600'
      if (this.wsReconnectAttempts > 0) return 'text-yellow-600'
      return 'text-red-600'
    },

    // P1-4: 手动重连
    reconnectWebSocket() {
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
      }
      this.wsReconnectAttempts = 0
      this.connectWebSocket()
    }
  }
}

// 注册组件
document.addEventListener('alpine:init', () => {
  Alpine.data('messageCenterPage', messageCenterPage)
  logger.debug('[MessageCenter] 组件已注册')
})

export { messageCenterPage }
