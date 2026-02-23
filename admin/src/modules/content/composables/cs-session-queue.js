/**
 * 客服工作台 - 会话队列管理
 *
 * @file admin/src/modules/content/composables/cs-session-queue.js
 * @description 从 customer-service.js 提取的会话列表加载、排序、筛选逻辑
 * @version 1.0.0
 * @date 2026-02-23
 */

import { logger } from '../../../utils/logger.js'
import { request } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 会话队列状态
 * @returns {Object} 状态对象
 */
export function useCsSessionQueueState() {
  return {
    /** @type {Array} 会话列表 */
    sessions: [],
    /** @type {boolean} 会话加载中 */
    sessionsLoading: true,
    /** @type {string} 关键词搜索 */
    searchKeyword: '',
    /** @type {string} 状态筛选（all / mine / waiting / active / closed） */
    statusFilter: 'all',
    /** @type {string|null} 上次数据更新时间 */
    lastUpdateTime: null
  }
}

/**
 * 会话队列方法
 * @returns {Object} 方法对象
 */
export function useCsSessionQueueMethods() {
  return {
    /**
     * 加载会话列表
     * @param {boolean} [silent=false] - 静默加载（不显示 loading）
     */
    async loadSessions(silent = false) {
      if (!silent) this.sessionsLoading = true

      try {
        const paramsObj = {}
        if (this.statusFilter === 'mine') {
          paramsObj.assigned_to = 'me'
        } else if (this.statusFilter !== 'all') {
          paramsObj.status = this.statusFilter
        }
        if (this.searchKeyword) paramsObj.search = this.searchKeyword

        const response = await request({
          url: CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSIONS,
          params: paramsObj
        })

        if (response && response.success) {
          const rawSessions = response.data.sessions || response.data.list || []
          this.sessions = this._sortSessionsByPriority(rawSessions)
          this.lastUpdateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          if (typeof this.updateWorkStatus === 'function') {
            this.updateWorkStatus()
          }
        } else if (!silent) {
          this.showError(response?.message || '获取会话列表失败')
        }
      } catch (error) {
        logger.error('[SessionQueue] 加载会话失败:', error)
        if (!silent) this.showError(error.message)
      } finally {
        if (!silent) this.sessionsLoading = false
      }
    },

    /**
     * 会话队列优先级排序
     *
     * 排序规则：
     * 1. 状态分组：waiting > active > closed
     * 2. waiting 内按等待时长降序（等最久的排最前）
     * 3. active 内按未读消息数降序
     * 4. closed 按关闭时间降序
     *
     * @param {Array} sessions - 原始会话列表
     * @returns {Array} 排序后的会话列表
     */
    _sortSessionsByPriority(sessions) {
      const STATUS_ORDER = { waiting: 0, active: 1, closed: 2 }

      return [...sessions].sort((a, b) => {
        const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
        if (statusDiff !== 0) return statusDiff

        if (a.status === 'waiting') {
          return new Date(a.created_at) - new Date(b.created_at)
        }
        if (a.status === 'active') {
          return (b.unread_count || 0) - (a.unread_count || 0)
        }
        return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
      })
    },

    /**
     * 获取会话的等待时长标签
     * @param {Object} session - 会话对象
     * @returns {string} 标签文本（SLA超时/紧急/较久/空串）
     */
    getSessionWaitLabel(session) {
      if (session.status !== 'waiting') return ''
      const minutes = Math.floor((Date.now() - new Date(session.created_at).getTime()) / 60000)
      if (minutes > 30) return 'SLA超时'
      if (minutes > 15) return '紧急'
      if (minutes > 5) return '较久'
      return ''
    },

    /**
     * 获取消息预览文本
     * @param {Object} session - 会话对象
     * @returns {string} 截断后的消息预览
     */
    getMessagePreview(session) {
      const msg = session.last_message?.content || session.last_message || ''
      const text = typeof msg === 'string' ? msg : ''
      return text.length > 30 ? text.substring(0, 30) + '...' : text || '暂无消息'
    },

    // ==================== 会话显示辅助方法 ====================

    getSessionUserNickname(session) {
      return session.user?.nickname || session.user_nickname || '未命名用户'
    },
    getSessionUserMobile(session) {
      return session.user?.mobile || session.user_mobile || ''
    },
    getSessionUserAvatar(session) {
      return session.user?.avatar_url || session.user_avatar || this.defaultAvatar
    },
    getSessionLastMessage(session) {
      const lastMessage = session.last_message?.content || session.last_message || '暂无消息'
      return typeof lastMessage === 'string' ? lastMessage : '暂无消息'
    },
    getSessionStatusBadge(status) {
      const badges = { waiting: 'bg-warning text-dark', active: 'bg-success', closed: 'bg-secondary' }
      return badges[status] || 'bg-secondary'
    }
  }
}
