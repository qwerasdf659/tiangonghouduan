/**
 * 消息中心页面模块
 * @description 管理系统通知消息的展示和操作
 * @version 1.0.0
 * @date 2026-02-01
 */

import Alpine from 'alpinejs'
import { logger } from '../utils/logger.js'
import { createPageMixin } from '../alpine/mixins/index.js'
import { request, buildURL } from '../api/base.js'

// API 端点
const MESSAGE_ENDPOINTS = {
  LIST: '/console/notifications',
  MARK_READ: id => `/console/notifications/${id}/read`,
  MARK_ALL_READ: '/console/notifications/read-all',
  DELETE: id => `/console/notifications/${id}`
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

    // 声音设置
    soundEnabled: true,

    // 选中的消息ID
    selectedIds: [],

    // 筛选条件
    filter: {
      type: '',
      status: '',
      time_range: '',
      keyword: ''
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

    async init() {
      logger.info('[MessageCenter] 初始化消息中心')

      // 加载声音设置
      this.soundEnabled = localStorage.getItem('notification_sound') !== 'false'

      // 监听筛选变化
      this.$watch('filter.type', () => this.loadMessages())

      // 加载消息列表
      await this.loadMessages()
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

        const result = await request({
          url: buildURL(MESSAGE_ENDPOINTS.LIST, params),
          method: 'GET'
        })

        if (result.data) {
          this.messages = result.data.items || result.data || []
          this.pagination.total = result.data.total || this.messages.length
          this.unreadCount =
            result.data.unread_count || this.messages.filter(m => !m.is_read).length
        }
      } catch (e) {
        logger.warn('[MessageCenter] loadMessages 失败:', e.message)
        // 模拟数据
        this.messages = this.generateMockMessages()
        this.pagination.total = this.messages.length + 50
        this.unreadCount = this.messages.filter(m => !m.is_read).length
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
      if (!confirm('确定要删除这条消息吗？')) return

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
      if (!confirm(`确定要删除选中的 ${this.selectedIds.length} 条消息吗？`)) return

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
    }
  }
}

// 注册组件
document.addEventListener('alpine:init', () => {
  Alpine.data('messageCenterPage', messageCenterPage)
  logger.debug('[MessageCenter] 组件已注册')
})

export { messageCenterPage }
