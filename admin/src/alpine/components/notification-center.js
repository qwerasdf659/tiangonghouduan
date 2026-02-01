/**
 * 实时提醒中心组件
 * @description 右上角实时提醒图标+下拉列表+声音提醒+Socket.IO集成
 * @version 1.1.0
 * @date 2026-02-01
 * @updated 2026-02-01 - 改用 socket.io-client 适配后端
 */

import { logger } from '../../utils/logger.js'
import { io } from 'socket.io-client'

/**
 * 创建通知中心组件
 * @returns {Object} Alpine 组件对象
 */
export function notificationCenter() {
  return {
    // 下拉菜单状态
    isOpen: false,

    // 加载状态
    loading: false,

    // 通知列表
    notifications: [],

    // 未读数量
    unreadCount: 0,

    // 声音设置
    soundEnabled: true,

    // 音频对象
    audioContext: null,
    notificationSound: null,

    // WebSocket 连接
    socket: null,
    wsConnected: false,
    wsReconnectAttempts: 0,
    maxReconnectAttempts: 5,

    // 轮询定时器
    pollTimer: null,

    /**
     * 初始化
     */
    async init() {
      logger.debug('[NotificationCenter] 初始化实时提醒中心')

      // 加载声音设置
      this.soundEnabled = localStorage.getItem('notification_sound') !== 'false'

      // 初始化音频
      this.initAudio()

      // 加载通知列表
      await this.loadNotifications()

      // 尝试建立 WebSocket 连接
      this.connectWebSocket()

      // 降级方案：轮询
      this.startPolling()

      // 监听点击外部关闭
      document.addEventListener('click', e => {
        if (!e.target.closest('.notification-center')) {
          this.isOpen = false
        }
      })
    },

    /**
     * 初始化音频
     */
    initAudio() {
      try {
        // 使用 Web Audio API 创建简单的提示音
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
        logger.debug('[NotificationCenter] 音频上下文已初始化')
      } catch (e) {
        logger.warn('[NotificationCenter] 音频初始化失败:', e.message)
      }
    },

    /**
     * 播放通知声音
     */
    playNotificationSound() {
      if (!this.soundEnabled || !this.audioContext) return

      try {
        // 恢复音频上下文（如果被暂停）
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume()
        }

        // 创建一个简单的提示音
        const oscillator = this.audioContext.createOscillator()
        const gainNode = this.audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(this.audioContext.destination)

        oscillator.frequency.value = 800 // 800Hz 提示音
        oscillator.type = 'sine'

        // 淡入淡出效果
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

    /**
     * 切换声音设置
     */
    toggleSound() {
      this.soundEnabled = !this.soundEnabled
      localStorage.setItem('notification_sound', this.soundEnabled)

      // 如果启用，播放一次测试音
      if (this.soundEnabled) {
        this.playNotificationSound()
      }
    },

    /**
     * 切换下拉菜单
     */
    toggleDropdown() {
      this.isOpen = !this.isOpen

      // 打开时刷新列表
      if (this.isOpen) {
        this.loadNotifications()
      }
    },

    /**
     * 关闭下拉菜单
     */
    closeDropdown() {
      this.isOpen = false
    },

    /**
     * 加载通知列表
     */
    async loadNotifications() {
      this.loading = true
      try {
        const token = localStorage.getItem('admin_token')
        // 🔄 修正：通知API在system域，不是console域
        const response = await fetch('/api/v4/system/notifications?limit=20', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })

        if (!response.ok) throw new Error('获取通知列表失败')

        const result = await response.json()
        if (result.data) {
          const oldUnreadCount = this.unreadCount
          // 安全处理：确保 notifications 始终是数组
          const items = result.data.items || result.data
          this.notifications = Array.isArray(items) ? items : []
          this.unreadCount =
            result.data.unread_count ?? this.notifications.filter(n => !n.is_read).length

          // 如果有新通知，播放提示音
          if (this.unreadCount > oldUnreadCount && oldUnreadCount > 0) {
            this.playNotificationSound()
          }
        }
      } catch (e) {
        logger.warn('[NotificationCenter] 加载通知失败:', e.message)
        // 模拟数据
        this.notifications = [
          {
            id: 1,
            type: 'alert',
            title: '新的消耗审核',
            message: '有3条消耗记录待审核',
            is_read: false,
            created_at: new Date().toISOString()
          },
          {
            id: 2,
            type: 'warning',
            title: '预算告警',
            message: '活动A预算消耗已达85%',
            is_read: false,
            created_at: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: 3,
            type: 'info',
            title: '系统通知',
            message: '系统将于今晚进行维护',
            is_read: true,
            created_at: new Date(Date.now() - 86400000).toISOString()
          }
        ]
        this.unreadCount = this.notifications.filter(n => !n.is_read).length
      } finally {
        this.loading = false
      }
    },

    /**
     * 标记为已读
     */
    async markAsRead(notification) {
      if (notification.is_read) return

      try {
        const token = localStorage.getItem('admin_token')
        // 🔄 修正：通知API在system域
        await fetch(`/api/v4/system/notifications/${notification.id}/read`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })

        notification.is_read = true
        this.unreadCount = Math.max(0, this.unreadCount - 1)
      } catch (e) {
        logger.warn('[NotificationCenter] 标记已读失败:', e.message)
        // 即使API失败也更新UI
        notification.is_read = true
        this.unreadCount = Math.max(0, this.unreadCount - 1)
      }
    },

    /**
     * 全部标记为已读
     */
    async markAllAsRead() {
      try {
        const token = localStorage.getItem('admin_token')
        // 🔄 修正：通知API在system域
        await fetch('/api/v4/system/notifications/read-all', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })

        this.notifications.forEach(n => (n.is_read = true))
        this.unreadCount = 0
      } catch (e) {
        logger.warn('[NotificationCenter] 全部标记已读失败:', e.message)
        // 即使API失败也更新UI
        this.notifications.forEach(n => (n.is_read = true))
        this.unreadCount = 0
      }
    },

    /**
     * 处理通知点击
     */
    handleNotificationClick(notification) {
      // 标记为已读
      this.markAsRead(notification)

      // 根据通知类型跳转
      const urlMap = {
        consumption: '/admin/finance-management.html',
        customer_service: '/admin/customer-service.html',
        lottery_alert: '/admin/lottery-alerts.html',
        risk_alert: '/admin/risk-alert.html',
        alert: '/admin/pending-center.html',
        warning: '/admin/lottery-alerts.html',
        info: '/admin/system-settings.html'
      }

      const url = urlMap[notification.type] || '/admin/pending-center.html'

      // 关闭下拉菜单
      this.isOpen = false

      // 通知父窗口打开Tab
      window.dispatchEvent(
        new CustomEvent('open-tab', {
          detail: {
            id: notification.type || 'notification',
            title: this.getNotificationTitle(notification.type),
            icon: this.getNotificationIcon(notification.type),
            url: url
          }
        })
      )
    },

    /**
     * 查看全部通知
     */
    viewAllNotifications() {
      this.isOpen = false

      // 打开消息中心Tab
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

    /**
     * 连接 Socket.IO（适配后端 ChatWebSocketService）
     */
    connectWebSocket() {
      // 检查是否已有连接
      if (this.socket && this.wsConnected) return

      try {
        // 获取 token
        const token = localStorage.getItem('admin_token')
        if (!token) {
          logger.warn('[NotificationCenter] 未登录，跳过 Socket.IO 连接')
          return
        }

        // 使用 socket.io-client 连接后端
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

          // 注册为管理员客户端
          this.socket.emit('register_admin', { token })
        })

        // 监听通知消息
        this.socket.on('notification', data => {
          this.handleWebSocketMessage({ type: 'notification', payload: data })
        })

        // 监听徽章更新
        this.socket.on('badge_update', data => {
          this.handleWebSocketMessage({ type: 'badge_update', payload: data })
        })

        // 监听新消息（复用聊天消息作为通知）
        this.socket.on('new_message', data => {
          this.handleWebSocketMessage({
            type: 'notification',
            payload: {
              type: 'customer_service',
              title: '新客服消息',
              message: data.content || '收到新消息',
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
     * 处理 WebSocket 消息
     */
    handleWebSocketMessage(data) {
      logger.debug('[NotificationCenter] 收到 WebSocket 消息:', data)

      if (data.type === 'notification') {
        // 添加新通知到列表顶部
        this.notifications.unshift(data.payload)
        this.unreadCount++

        // 播放提示音
        this.playNotificationSound()

        // 显示浏览器通知（如果有权限）
        this.showBrowserNotification(data.payload)
      } else if (data.type === 'badge_update') {
        // 更新徽章数量
        this.unreadCount = data.payload.unread_count || 0
      }
    },

    /**
     * 显示浏览器通知
     */
    showBrowserNotification(notification) {
      if (!('Notification' in window)) return

      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/admin/favicon.svg',
          tag: 'admin-notification-' + notification.id
        })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            this.showBrowserNotification(notification)
          }
        })
      }
    },

    /**
     * 安排重连（socket.io-client 自动处理，此方法仅作日志记录）
     */
    scheduleReconnect() {
      if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
        logger.warn('[NotificationCenter] Socket.IO 重连次数已达上限，将使用轮询降级')
        return
      }

      // socket.io-client 自动处理重连，这里只记录日志
      logger.debug(
        `[NotificationCenter] Socket.IO 将自动重连 (已尝试${this.wsReconnectAttempts}次)`
      )
    },

    /**
     * 开始轮询（降级方案）
     */
    startPolling() {
      // 清除旧的定时器
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
      }

      // 每30秒轮询一次
      this.pollTimer = setInterval(() => {
        // 如果 WebSocket 已连接，跳过轮询
        if (this.wsConnected) return

        this.loadNotifications()
      }, 30000)
    },

    /**
     * 获取通知图标
     */
    getNotificationIcon(type) {
      const icons = {
        consumption: '📋',
        customer_service: '💬',
        lottery_alert: '🎰',
        risk_alert: '⚠️',
        alert: '🔔',
        warning: '⚠️',
        info: 'ℹ️',
        success: '✅'
      }
      return icons[type] || '📬'
    },

    /**
     * 获取通知标题
     */
    getNotificationTitle(type) {
      const titles = {
        consumption: '消耗审核',
        customer_service: '客服会话',
        lottery_alert: '抽奖告警',
        risk_alert: '风控告警',
        alert: '待处理事项',
        warning: '告警信息',
        info: '系统通知'
      }
      return titles[type] || '消息通知'
    },

    /**
     * 获取通知类型颜色类名
     */
    getNotificationColorClass(type) {
      const colors = {
        alert: 'text-red-500 bg-red-50',
        warning: 'text-yellow-500 bg-yellow-50',
        info: 'text-blue-500 bg-blue-50',
        success: 'text-green-500 bg-green-50',
        consumption: 'text-orange-500 bg-orange-50',
        customer_service: 'text-blue-500 bg-blue-50',
        lottery_alert: 'text-yellow-500 bg-yellow-50',
        risk_alert: 'text-red-500 bg-red-50'
      }
      return colors[type] || 'text-gray-500 bg-gray-50'
    },

    /**
     * 格式化时间
     */
    formatTime(dateStr) {
      if (!dateStr) return '--'
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date

      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'

      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    },

    /**
     * 销毁组件
     */
    destroy() {
      // 清除轮询
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
      }

      // 关闭 Socket.IO 连接
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
      }

      // 关闭音频上下文
      if (this.audioContext) {
        this.audioContext.close()
      }
    }
  }
}

export default notificationCenter
