/**
 * 实时提醒中心组件
 * @description 右上角实时提醒图标+下拉列表+声音提醒+Socket.IO集成
 * @version 2.0.0
 * @date 2026-03-01
 * @updated 2026-03-01 - 数据源切换到 admin_notifications 表，字段对齐后端
 */

import { logger } from '../../utils/logger.js'
import { request, buildURL } from '../../api/base.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../api/system/admin.js'
import { io } from 'socket.io-client'

/**
 * source_type → 图标映射（对应后端 sendToAdmins 的 type 参数）
 */
const SOURCE_TYPE_ICONS = {
  exchange_audit: '📋',
  timeout_alert: '⏰',
  system_announcement: '📢',
  activity_status_change: '🎰',
  asset_reconciliation_alert: '📊',
  business_record_reconciliation_alert: '📊',
  market_monitor_alert: '📈',
  orphan_frozen_alert: '🧊',
  orphan_frozen_error: '❌',
  reminder_alert: '🔔',
  customer_service: '💬'
}

/**
 * source_type → 跳转页面映射
 */
const SOURCE_TYPE_URLS = {
  exchange_audit: '/admin/redemption-management.html',
  timeout_alert: '/admin/redemption-management.html',
  activity_status_change: '/admin/lottery-management.html',
  asset_reconciliation_alert: '/admin/finance-management.html',
  business_record_reconciliation_alert: '/admin/finance-management.html',
  market_monitor_alert: '/admin/market-management.html',
  orphan_frozen_alert: '/admin/finance-management.html',
  orphan_frozen_error: '/admin/finance-management.html',
  reminder_alert: '/admin/pending-center.html',
  customer_service: '/admin/customer-service.html',
  system_announcement: '/admin/message-center.html'
}

/**
 * source_type → Tab 标题映射
 */
const SOURCE_TYPE_TITLES = {
  exchange_audit: '兑换审核',
  timeout_alert: '超时告警',
  activity_status_change: '活动状态',
  asset_reconciliation_alert: '资产对账',
  business_record_reconciliation_alert: '业务对账',
  market_monitor_alert: '市场监控',
  orphan_frozen_alert: '孤儿冻结',
  orphan_frozen_error: '检测异常',
  reminder_alert: '提醒通知',
  customer_service: '客服会话',
  system_announcement: '系统公告'
}

/**
 * source_type → 颜色样式映射
 */
const SOURCE_TYPE_COLORS = {
  exchange_audit: 'text-orange-500 bg-orange-50',
  timeout_alert: 'text-red-500 bg-red-50',
  activity_status_change: 'text-yellow-500 bg-yellow-50',
  asset_reconciliation_alert: 'text-red-500 bg-red-50',
  business_record_reconciliation_alert: 'text-red-500 bg-red-50',
  market_monitor_alert: 'text-blue-500 bg-blue-50',
  orphan_frozen_alert: 'text-purple-500 bg-purple-50',
  orphan_frozen_error: 'text-red-500 bg-red-50',
  reminder_alert: 'text-blue-500 bg-blue-50',
  customer_service: 'text-blue-500 bg-blue-50',
  system_announcement: 'text-green-500 bg-green-50'
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
 * priority → 颜色样式映射（用于通知项右侧优先级标签）
 */
const PRIORITY_COLORS = {
  low: 'text-green-600 bg-green-50',
  normal: 'text-blue-600 bg-blue-50',
  high: 'text-orange-600 bg-orange-50',
  urgent: 'text-red-600 bg-red-50'
}

/**
 * 创建通知中心组件
 * @returns {Object} Alpine 组件对象
 */
export function notificationCenter() {
  return {
    isOpen: false,
    loading: false,
    notifications: [],
    unreadCount: 0,
    soundEnabled: true,
    audioContext: null,
    notificationSound: null,
    socket: null,
    wsConnected: false,
    wsReconnectAttempts: 0,
    maxReconnectAttempts: 5,
    pollTimer: null,

    async init() {
      logger.debug('[NotificationCenter] 初始化实时提醒中心')
      this.soundEnabled = localStorage.getItem('notification_sound') !== 'false'
      this.initAudio()
      await this.loadNotifications()
      this.connectWebSocket()
      this.startPolling()

      document.addEventListener('click', e => {
        if (!e.target.closest('.notification-center')) {
          this.isOpen = false
        }
      })
    },

    initAudio() {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
        logger.debug('[NotificationCenter] 音频上下文已初始化')
      } catch (e) {
        logger.warn('[NotificationCenter] 音频初始化失败:', e.message)
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

        logger.debug('[NotificationCenter] 播放提示音')
      } catch (e) {
        logger.warn('[NotificationCenter] 播放提示音失败:', e.message)
      }
    },

    toggleSound() {
      this.soundEnabled = !this.soundEnabled
      localStorage.setItem('notification_sound', this.soundEnabled)
      if (this.soundEnabled) {
        this.playNotificationSound()
      }
    },

    toggleDropdown() {
      this.isOpen = !this.isOpen
      if (this.isOpen) {
        this.loadNotifications()
      }
    },

    closeDropdown() {
      this.isOpen = false
    },

    /**
     * 加载通知列表
     * 响应格式：{ items: [...], total, unread_count }
     */
    async loadNotifications() {
      this.loading = true
      try {
        const result = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_LIST,
          params: { page_size: 20 }
        })
        if (result.data) {
          const oldUnreadCount = this.unreadCount
          this.notifications = Array.isArray(result.data.items) ? result.data.items : []
          this.unreadCount =
            result.data.unread_count ?? this.notifications.filter(n => !n.is_read).length

          if (this.unreadCount > oldUnreadCount && oldUnreadCount > 0) {
            this.playNotificationSound()
          }
        }
      } catch (e) {
        logger.warn('[NotificationCenter] 加载通知失败:', e.message)
        this.notifications = []
        this.unreadCount = 0
      } finally {
        this.loading = false
      }
    },

    /**
     * 标记为已读（使用 admin_notification_id）
     */
    async markAsRead(notification) {
      if (notification.is_read) return

      const notifId = notification.admin_notification_id
      try {
        if (notifId) {
          await request({
            url: buildURL(SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_READ, { id: notifId }),
            method: 'POST'
          })
        }
      } catch (e) {
        logger.warn('[NotificationCenter] 标记已读失败:', e.message)
      }

      notification.is_read = true
      this.unreadCount = Math.max(0, this.unreadCount - 1)
    },

    async markAllAsRead() {
      try {
        await request({
          url: SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_READ_ALL,
          method: 'POST'
        })
      } catch (e) {
        logger.warn('[NotificationCenter] 全部标记已读失败:', e.message)
      }

      this.notifications.forEach(n => (n.is_read = true))
      this.unreadCount = 0
    },

    /**
     * 处理通知点击 — 基于 source_type 跳转
     */
    handleNotificationClick(notification) {
      this.markAsRead(notification)

      const sourceType = notification.source_type || ''
      const url = SOURCE_TYPE_URLS[sourceType] || '/admin/message-center.html'

      this.isOpen = false

      window.dispatchEvent(
        new CustomEvent('open-tab', {
          detail: {
            id: sourceType || 'notification',
            title: SOURCE_TYPE_TITLES[sourceType] || '消息通知',
            icon: SOURCE_TYPE_ICONS[sourceType] || '📬',
            url: url
          }
        })
      )
    },

    viewAllNotifications() {
      this.isOpen = false
      window.dispatchEvent(
        new CustomEvent('open-tab', {
          detail: {
            id: 'message-center',
            title: '消息中心',
            icon: '📬',
            url: '/admin/message-center.html'
          }
        })
      )
    },

    connectWebSocket() {
      if (this.socket && this.wsConnected) return

      try {
        const token = localStorage.getItem('admin_token')
        if (!token) {
          logger.warn('[NotificationCenter] 未登录，跳过 Socket.IO 连接')
          return
        }

        const socketUrl = window.location.origin
        logger.debug('[NotificationCenter] 连接 Socket.IO:', socketUrl)

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
          logger.info('[NotificationCenter] Socket.IO 连接成功')
          this.wsConnected = true
          this.wsReconnectAttempts = 0
          this.socket.emit('register_admin', { token })
        })

        this.socket.on('notification', data => {
          this.handleWebSocketMessage({ type: 'notification', payload: data })
        })

        this.socket.on('badge_update', data => {
          this.handleWebSocketMessage({ type: 'badge_update', payload: data })
        })

        this.socket.on('new_message', data => {
          this.handleWebSocketMessage({
            type: 'notification',
            payload: {
              source_type: 'customer_service',
              title: '新客服消息',
              content: data.content || '收到新消息',
              ...data
            }
          })
        })

        this.socket.on('disconnect', reason => {
          logger.info('[NotificationCenter] Socket.IO 连接断开:', reason)
          this.wsConnected = false
        })

        this.socket.on('connect_error', error => {
          logger.warn('[NotificationCenter] Socket.IO 连接错误:', error.message)
          this.wsConnected = false
          this.wsReconnectAttempts++
        })
      } catch (e) {
        logger.warn('[NotificationCenter] Socket.IO 连接失败:', e.message)
        this.wsConnected = false
      }
    },

    /**
     * 处理 WebSocket 消息 — 使用 admin_notification_id 去重
     */
    handleWebSocketMessage(data) {
      logger.debug('[NotificationCenter] 收到 WebSocket 消息:', data)

      if (data.type === 'notification') {
        const payload = data.payload

        // 使用 admin_notification_id 去重
        const notifId = payload.admin_notification_id
        if (notifId && this.notifications.some(n => n.admin_notification_id === notifId)) {
          logger.debug('[NotificationCenter] 忽略重复通知:', notifId)
          return
        }

        // 确保有唯一标识用于 Alpine x-for :key
        if (!payload.admin_notification_id) {
          payload.admin_notification_id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        }

        this.notifications.unshift(payload)
        this.unreadCount++
        this.playNotificationSound()
        this.showBrowserNotification(payload)
      } else if (data.type === 'badge_update') {
        this.unreadCount = data.payload.unread_count || 0
      }
    },

    showBrowserNotification(notification) {
      if (!('Notification' in window)) return

      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.content || notification.message,
          icon: '/admin/favicon.svg',
          tag: 'admin-notification-' + (notification.admin_notification_id || Date.now())
        })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            this.showBrowserNotification(notification)
          }
        })
      }
    },

    scheduleReconnect() {
      if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
        logger.warn('[NotificationCenter] Socket.IO 重连次数已达上限，将使用轮询降级')
        return
      }
      logger.debug(
        `[NotificationCenter] Socket.IO 将自动重连 (已尝试${this.wsReconnectAttempts}次)`
      )
    },

    startPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
      }
      this.pollTimer = setInterval(() => {
        if (this.wsConnected) return
        this.loadNotifications()
      }, 30000)
    },

    /**
     * 获取通知图标 — 基于 source_type
     */
    getNotificationIcon(sourceType) {
      return SOURCE_TYPE_ICONS[sourceType] || '📬'
    },

    /**
     * 获取通知标题 — 基于 source_type
     */
    getNotificationTitle(sourceType) {
      return SOURCE_TYPE_TITLES[sourceType] || '消息通知'
    },

    /**
     * 获取通知类型颜色类名 — 基于 source_type
     */
    getNotificationColorClass(sourceType) {
      return SOURCE_TYPE_COLORS[sourceType] || 'text-gray-500 bg-gray-50'
    },

    /**
     * 获取 priority 图标（后端枚举：low/normal/high/urgent）
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

    /**
     * 获取 priority 颜色类名
     */
    getPriorityColorClass(priority) {
      return PRIORITY_COLORS[priority] || 'text-blue-600 bg-blue-50'
    },

    /**
     * 判断是否为高优先级通知（high/urgent）
     */
    isHighPriority(priority) {
      return priority === 'high' || priority === 'urgent'
    },

    formatTime(dateStr) {
      if (!dateStr) return '--'
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return String(dateStr)
      const now = new Date()
      const diff = now - date

      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'

      return date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    },

    destroy() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
      }
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
      }
      if (this.audioContext) {
        this.audioContext.close()
      }
    }
  }
}

export default notificationCenter
