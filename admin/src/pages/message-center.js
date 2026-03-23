/**
 * 消息中心页面模块
 * @description 管理系统通知消息的展示和操作，支持 WebSocket 实时推送
 * @version 3.0.0
 * @date 2026-03-01
 *
 * 数据源：admin_notifications 表（由 NotificationService.sendToAdmins() 写入）
 * 字段对齐后端：admin_notification_id、notification_type、source_type、priority
 * 筛选参数完整发送到后端：notification_type、is_read、start_date/end_date、keyword
 */

import Alpine from 'alpinejs'
import { logger, $confirmDanger } from '../utils/index.js'
import { createPageMixin } from '../alpine/mixins/index.js'
import { request, buildURL } from '../api/base.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../api/system/admin.js'
import { io } from 'socket.io-client'

/**
 * notification_type → 图标映射（后端枚举：system/alert/reminder/task）
 */
const NOTIFICATION_TYPE_ICONS = {
  system: '📢',
  alert: '🚨',
  reminder: '🔔',
  task: '📋'
}

/**
 * notification_type → 中文标签映射
 */
const NOTIFICATION_TYPE_LABELS = {
  system: '系统通知',
  alert: '告警通知',
  reminder: '提醒通知',
  task: '任务通知'
}

/**
 * notification_type → 颜色样式映射
 */
const NOTIFICATION_TYPE_COLORS = {
  system: 'text-blue-500 bg-blue-50',
  alert: 'text-red-500 bg-red-50',
  reminder: 'text-yellow-500 bg-yellow-50',
  task: 'text-green-500 bg-green-50'
}

/**
 * notification_type → Badge 样式映射
 */
const NOTIFICATION_TYPE_BADGES = {
  system: 'bg-blue-100 text-blue-600',
  alert: 'bg-red-100 text-red-600',
  reminder: 'bg-yellow-100 text-yellow-600',
  task: 'bg-green-100 text-green-600'
}

/**
 * priority → 图标映射（后端枚举：low/normal/high/urgent）
 */
const PRIORITY_ICONS = {
  low: '🟢',
  normal: '🔵',
  high: '🟠',
  urgent: '🔴'
}

/**
 * priority → 中文标签映射
 */
const PRIORITY_LABELS = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急'
}

/**
 * source_type → 跳转页面映射
 */
const SOURCE_TYPE_URLS = {
  exchange_audit: '/admin/redemption-management.html',
  timeout_alert: '/admin/redemption-management.html',
  activity_status_change: '/admin/lottery-management.html',
  asset_reconciliation_alert: '/admin/finance-management.html',
  market_monitor_alert: '/admin/market-management.html',
  orphan_frozen_alert: '/admin/finance-management.html',
  orphan_frozen_error: '/admin/finance-management.html',
  reminder_alert: '/admin/pending-center.html',
  system_announcement: '/admin/message-center.html'
}

/**
 * 消息中心页面组件
 */
function messageCenterPage() {
  return {
    ...createPageMixin(),

    messages: [],
    unreadCount: 0,
    /** @type {string|null} 上次数据更新时间 */
    lastUpdateTime: null,
    soundEnabled: true,
    selectedIds: [],

    filter: {
      notification_type: '',
      status: '',
      time_range: '',
      keyword: ''
    },

    pagination: {
      page: 1,
      page_size: 20,
      total: 0
    },

    detailModal: false,
    currentMessage: null,

    /** @type {Object|null} Socket.IO 连接实例 */
    socket: null,
    wsConnected: false,
    wsReconnectAttempts: 0,
    maxReconnectAttempts: 5,
    audioContext: null,
    pollTimer: null,

    async init() {
      logger.info('[MessageCenter] 初始化消息中心')

      this.soundEnabled = localStorage.getItem('notification_sound') !== 'false'
      this.initAudio()

      await this.loadMessages()
      this.connectWebSocket()
      this.startPolling()
      this.requestNotificationPermission()
    },

    initAudio() {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
        logger.debug('[MessageCenter] 音频上下文已初始化')
      } catch (e) {
        logger.warn('[MessageCenter] 音频初始化失败:', e.message)
      }
    },

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
          this.socket.emit('register_admin', { token })
        })

        this.socket.on('notification', data => {
          this.handleNewNotification(data)
        })

        this.socket.on('badge_update', data => {
          if (data.unread_count !== undefined) {
            this.unreadCount = data.unread_count
          }
        })

        this.socket.on('new_message', data => {
          this.handleNewNotification({
            source_type: 'customer_service',
            notification_type: 'system',
            title: '新客服消息',
            content: data.content || '收到新消息',
            priority: 'normal',
            ...data
          })
        })

        this.socket.on('disconnect', reason => {
          logger.info('[MessageCenter] Socket.IO 连接断开:', reason)
          this.wsConnected = false
        })

        this.socket.on('connect_error', error => {
          logger.warn('[MessageCenter] Socket.IO 连接错误:', error.message)
          this.wsConnected = false
          this.wsReconnectAttempts++
        })
      } catch (e) {
        logger.warn('[MessageCenter] Socket.IO 连接失败:', e.message)
        this.wsConnected = false
      }
    },

    /**
     * 处理新通知 — 使用 admin_notification_id 去重
     */
    handleNewNotification(notification) {
      logger.debug('[MessageCenter] 收到新通知:', notification)

      const newMessage = {
        admin_notification_id: notification.admin_notification_id || `ws_${Date.now()}`,
        notification_type: notification.notification_type || 'system',
        source_type: notification.source_type || notification.type || '',
        title: notification.title || '新消息',
        content: notification.content || notification.message || '',
        is_read: false,
        created_at: notification.created_at || new Date().toISOString(),
        priority: notification.priority || 'normal',
        extra_data: notification.extra_data || notification.data || null
      }

      // 去重
      if (this.messages.some(m => m.admin_notification_id === newMessage.admin_notification_id)) {
        return
      }

      this.messages.unshift(newMessage)
      this.unreadCount++
      this.pagination.total++

      this.playNotificationSound()
      this.showBrowserNotification(newMessage)

      if (typeof this.showInfo === 'function') {
        this.showInfo(`收到新消息：${newMessage.title}`)
      }
    },

    requestNotificationPermission() {
      if (!('Notification' in window)) return
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          logger.debug('[MessageCenter] 浏览器通知权限:', permission)
        })
      }
    },

    showBrowserNotification(message) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      try {
        new Notification(message.title, {
          body: message.content,
          icon: '/admin/favicon.svg',
          tag: 'message-center-' + message.admin_notification_id
        })
      } catch (e) {
        logger.warn('[MessageCenter] 浏览器通知显示失败:', e.message)
      }
    },

    startPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
      }
      this.pollTimer = setInterval(() => {
        if (this.wsConnected) return
        this.loadMessages()
      }, 30000)
    },

    /**
     * 加载消息列表 — 补全筛选参数发送到后端
     * 响应格式：{ items: [...], total, unread_count }
     */
    async loadMessages() {
      this.loading = true
      try {
        const params = {
          page_size: this.pagination.page_size,
          offset: (this.pagination.page - 1) * this.pagination.page_size
        }

        if (this.filter.notification_type) params.notification_type = this.filter.notification_type
        if (this.filter.keyword) params.keyword = this.filter.keyword

        // status 筛选转换为 is_read 参数
        if (this.filter.status === 'unread') params.is_read = '0'
        else if (this.filter.status === 'read') params.is_read = '1'

        // time_range 转换为 start_date/end_date（上下界均发送到后端）
        if (this.filter.time_range) {
          const now = new Date()
          let startDate = null
          let endDate = null
          if (this.filter.time_range === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
          } else if (this.filter.time_range === 'week') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            endDate = now
          } else if (this.filter.time_range === 'month') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            endDate = now
          }
          if (startDate) params.start_date = startDate.toISOString()
          if (endDate) params.end_date = endDate.toISOString()
        }

        const result = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_LIST,
          method: 'GET',
          params
        })

        if (result.data) {
          this.messages = Array.isArray(result.data.items) ? result.data.items : []
          this.pagination.total = result.data.total ?? this.messages.length
          this.unreadCount =
            result.data.unread_count ?? this.messages.filter(m => !m.is_read).length
        } else {
          this.messages = []
          this.pagination.total = 0
          this.unreadCount = 0
        }

        this.lastUpdateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch (e) {
        logger.error('[MessageCenter] loadMessages 失败:', e.message)
        this.messages = []
        this.pagination.total = 0
        this.unreadCount = 0
        Alpine.store('notification')?.show?.('加载消息失败：' + e.message, 'error')
      } finally {
        this.loading = false
      }
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
      if (!message.is_read) {
        this.markAsRead(message)
      }
    },

    closeDetailModal() {
      this.detailModal = false
      this.currentMessage = null
    },

    /**
     * 标记已读 — 使用 admin_notification_id
     */
    async markAsRead(message) {
      if (message.is_read) return

      const notifId = message.admin_notification_id
      try {
        if (notifId && typeof notifId === 'number') {
          await request({
            url: buildURL(SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_READ, { id: notifId }),
            method: 'POST'
          })
        }
      } catch (e) {
        logger.warn('[MessageCenter] markAsRead 失败:', e.message)
      }

      message.is_read = true
      this.unreadCount = Math.max(0, this.unreadCount - 1)
    },

    async markAllAsRead() {
      try {
        await request({
          url: SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_READ_ALL,
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
        const message = this.messages.find(m => m.admin_notification_id === id)
        if (message && !message.is_read) {
          await this.markAsRead(message)
        }
      }
      this.selectedIds = []
    },

    /**
     * 删除消息 — 使用 admin_notification_id
     */
    async deleteMessage(message) {
      if (!(await $confirmDanger('确定要删除这条消息吗？'))) return

      const notifId = message.admin_notification_id
      try {
        if (notifId && typeof notifId === 'number') {
          await request({
            url: buildURL(SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_DELETE, { id: notifId }),
            method: 'DELETE'
          })
        }
      } catch (e) {
        logger.warn('[MessageCenter] deleteMessage 失败:', e.message)
      }

      this.messages = this.messages.filter(m => m.admin_notification_id !== notifId)
      this.pagination.total--
      if (!message.is_read) {
        this.unreadCount = Math.max(0, this.unreadCount - 1)
      }
    },

    async deleteSelected() {
      if (!(await $confirmDanger(`确定要删除选中的 ${this.selectedIds.length} 条消息吗？`))) return

      for (const id of this.selectedIds) {
        const message = this.messages.find(m => m.admin_notification_id === id)
        if (message) {
          try {
            if (typeof id === 'number') {
              await request({
                url: buildURL(SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_DELETE, { id }),
                method: 'DELETE'
              })
            }
          } catch (e) {
            logger.warn('[MessageCenter] deleteSelected 失败:', e.message)
          }
          if (!message.is_read) {
            this.unreadCount = Math.max(0, this.unreadCount - 1)
          }
        }
      }

      this.messages = this.messages.filter(m => !this.selectedIds.includes(m.admin_notification_id))
      this.pagination.total -= this.selectedIds.length
      this.selectedIds = []
    },

    /**
     * 跳转处理 — 基于 source_type
     */
    handleMessageAction(message) {
      const sourceType = message?.source_type || ''
      const url = SOURCE_TYPE_URLS[sourceType] || '/admin/pending-center.html'

      this.closeDetailModal()

      if (window.parent && window.parent !== window) {
        window.parent.dispatchEvent(
          new CustomEvent('open-tab', {
            detail: {
              id: sourceType || 'pending',
              title: this.getTypeLabel(message?.notification_type) || '待处理',
              icon: this.getTypeIcon(message?.notification_type) || '📋',
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

    /**
     * 获取 notification_type 图标
     */
    getTypeIcon(type) {
      return NOTIFICATION_TYPE_ICONS[type] || '📬'
    },

    /**
     * 获取 notification_type 中文标签
     */
    getTypeLabel(type) {
      return NOTIFICATION_TYPE_LABELS[type] || type || '消息'
    },

    /**
     * 获取 notification_type 颜色类名
     */
    getTypeColorClass(type) {
      return NOTIFICATION_TYPE_COLORS[type] || 'text-gray-500 bg-gray-50'
    },

    /**
     * 获取 notification_type Badge 类名
     */
    getTypeBadgeClass(type) {
      return NOTIFICATION_TYPE_BADGES[type] || 'bg-gray-100 text-gray-600'
    },

    /**
     * 获取 priority 图标
     */
    getPriorityIcon(priority) {
      return PRIORITY_ICONS[priority] || '🔵'
    },

    /**
     * 获取 priority 中文标签
     */
    getPriorityLabel(priority) {
      return PRIORITY_LABELS[priority] || priority || '普通'
    },

    formatTime(dateStr) {
      if (!dateStr) return '--'
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        return String(dateStr)
          .replace(/\d{4}年/, '')
          .replace(/星期./, '')
          .trim()
      }

      const now = new Date()
      const diff = now - date

      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
      if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'

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
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        return String(dateStr)
      }
      return date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    },

    destroy() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
        this.wsConnected = false
      }
      if (this.audioContext) {
        this.audioContext.close()
        this.audioContext = null
      }
      logger.debug('[MessageCenter] 组件资源已清理')
    },

    get connectionStatusText() {
      if (this.wsConnected) return '🟢 实时连接'
      if (this.wsReconnectAttempts > 0)
        return `🟡 重连中 (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})`
      return '🔴 离线'
    },

    get connectionStatusClass() {
      if (this.wsConnected) return 'text-green-600'
      if (this.wsReconnectAttempts > 0) return 'text-yellow-600'
      return 'text-red-600'
    },

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

document.addEventListener('alpine:init', () => {
  Alpine.data('messageCenterPage', messageCenterPage)
  logger.debug('[MessageCenter] 组件已注册')
})

export { messageCenterPage }
