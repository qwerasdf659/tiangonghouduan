/**
 * 客服工作台 - Composable
 *
 * @file admin/src/modules/content/composables/customer-service.js
 * @description 从 customer-service.js 提取的客服工作台状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request, getToken } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { Alpine } from '../../../alpine/index.js'
import { io } from 'socket.io-client'

/**
 * 客服工作台状态
 * @returns {Object} 状态对象
 */
export function useCustomerServiceState() {
  return {
    welcomeText: '管理员',
    loadingOverlay: false,
    sessionsLoading: true,

    sessions: [],
    currentSessionId: null,
    messages: [],
    currentChatUser: { nickname: '', mobile: '', avatar: '' },
    selectedSession: null,

    submitting: false,
    searchKeyword: '',
    statusFilter: 'all',
    messageInput: '',

    user_info_data: null,
    transferTargetId: '',
    adminList: [],

    wsConnection: null,
    messagePollingInterval: null,

    /** @type {string|null} 上次数据更新时间（#2） */
    lastUpdateTime: null,

    quickReplies: [
      { text: '👋 欢迎语', content: '您好，有什么可以帮助您的吗？' },
      { text: '⏳ 查询中', content: '请稍等，我为您查询一下' },
      { text: '🙏 感谢反馈', content: '感谢您的反馈，我们会尽快处理' },
      { text: '😊 祝福语', content: '祝您使用愉快！' }
    ],

    defaultAvatar:
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+',

    responseStats: {
      avg_first_response_seconds: 0,
      avg_first_response_display: '--',
      avg_response_seconds: 0,
      avg_response_display: '--',
      today_sessions: 0,
      today_resolved: 0
    }
  }
}

/**
 * 客服工作台方法
 * @returns {Object} 方法对象
 */
export function useCustomerServiceMethods() {
  return {
    // ==================== WebSocket ====================

    initWebSocket() {
      try {
        const wsUrl = window.location.origin
        logger.info('🔌 正在连接WebSocket...', wsUrl)

        this.wsConnection = io(wsUrl, {
          auth: { token: getToken() },
          transports: ['websocket', 'polling'],
          path: '/socket.io'
        })

        this.wsConnection.on('connect', () => logger.info('WebSocket连接成功'))
        this.wsConnection.on('message', data => this.handleWebSocketMessage(data))
        this.wsConnection.on('new_message', data =>
          this.handleWebSocketMessage({ type: 'new_message', ...data })
        )
        this.wsConnection.on('session_update', data =>
          this.handleWebSocketMessage({ type: 'session_update', ...data })
        )
        this.wsConnection.on('error', error => logger.error('WebSocket错误:', error))
        this.wsConnection.on('disconnect', reason => logger.info('WebSocket连接已断开:', reason))
        this.wsConnection.on('connect_error', error => {
          logger.error('WebSocket连接失败:', error)
          this.startPolling()
        })
      } catch (error) {
        logger.error('WebSocket初始化失败:', error)
        this.startPolling()
      }
    },

    startPolling() {
      if (!this.messagePollingInterval) {
        this.messagePollingInterval = setInterval(() => {
          if (this.currentSessionId) {
            this.loadSessionMessages(this.currentSessionId, true)
          }
        }, 5000)
      }
    },

    handleWebSocketMessage(data) {
      switch (data.type) {
        case 'new_message':
          if (String(data.session_id) === String(this.currentSessionId)) {
            this.messages.push(data.message)
            this.$nextTick(() => this.scrollToBottom())
          }
          this.loadSessions(true)
          break
        case 'new_session':
          this.loadSessions(true)
          break
        case 'session_closed':
          if (String(data.session_id) === String(this.currentSessionId)) {
            this.showWarning('当前会话已被关闭')
            this.closeCurrentChat()
          }
          this.loadSessions(true)
          break
      }
    },

    // ==================== 会话管理 ====================

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
          /* 更新顶部工作状态栏指标 */
          if (typeof this.updateWorkStatus === 'function') {
            this.updateWorkStatus()
          }
        } else if (!silent) {
          this.showError(response?.message || '获取会话列表失败')
        }
      } catch (error) {
        logger.error('加载会话失败:', error)
        if (!silent) this.showError(error.message)
      } finally {
        if (!silent) this.sessionsLoading = false
      }
    },

    async openSession(sessionId) {
      if (String(sessionId) === String(this.currentSessionId)) return
      this.currentSessionId = sessionId
      this.loadingOverlay = true

      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSION_MESSAGES, {
            session_id: sessionId
          })
        })

        if (response && response.success) {
          const session = response.data.session
          this.selectedSession = session
          this.currentChatUser = {
            nickname: session.user?.nickname || '未命名用户',
            mobile: session.user?.mobile || '',
            avatar: session.user?.avatar_url || this.defaultAvatar
          }
          this.messages = response.data.messages || []
          this.$nextTick(() => this.scrollToBottom())
          this.markAsRead(sessionId)
          this.loadSessions(true)
        } else {
          this.showError(response?.message || '获取会话信息失败')
        }
      } catch (error) {
        logger.error('打开会话失败:', error)
        this.showError(error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    async loadSessionMessages(sessionId, silent = false) {
      if (!silent) this.loadingOverlay = true
      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSION_MESSAGES, {
            session_id: sessionId
          })
        })
        if (response && response.success) {
          this.messages = response.data.messages || []
          this.$nextTick(() => this.scrollToBottom())
        }
      } catch (error) {
        if (!silent) logger.error('加载消息失败:', error)
      } finally {
        if (!silent) this.loadingOverlay = false
      }
    },

    // ==================== 消息发送 ====================

    async sendMessage() {
      const content = this.messageInput.trim()
      if (!content) {
        this.showError('请输入消息内容')
        return
      }
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return
      }

      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SEND_MESSAGE, {
            session_id: this.currentSessionId
          }),
          method: 'POST',
          data: { content }
        })

        if (response && response.success) {
          this.messageInput = ''
          // 将管理员消息追加到本地消息列表（后端事务提交后会通过 WebSocket 推送给用户）
          this.messages.push({
            chat_message_id: response.data?.chat_message_id,
            sender_type: 'admin',
            content: content,
            message_type: 'text',
            created_at: response.data?.created_at || new Date().toISOString()
          })
          this.$nextTick(() => this.scrollToBottom())
        } else {
          this.showError(response?.message || '消息发送失败')
        }
      } catch (error) {
        logger.error('发送消息失败:', error)
        this.showError(error.message)
      }
    },

    insertQuickReply(text) {
      this.messageInput = text
    },

    // ==================== 会话操作 ====================

    async markAsRead(sessionId) {
      try {
        await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_MARK_READ, { session_id: sessionId }),
          method: 'POST'
        })
      } catch (error) {
        logger.error('标记已读失败:', error)
      }
    },

    transferSession() {
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return
      }
      this.showModal('transferModal')
    },

    async submitTransfer() {
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return
      }
      if (!this.transferTargetId) {
        this.showError('请选择接收客服')
        return
      }

      this.loadingOverlay = true
      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_TRANSFER, {
            session_id: this.currentSessionId
          }),
          method: 'POST',
          data: { target_admin_id: parseInt(this.transferTargetId) }
        })

        if (response && response.success) {
          this.showSuccess('会话已转接')
          this.hideModal('transferModal')
          this.closeCurrentChat()
          this.loadSessions()
        } else {
          this.showError(response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('转接失败:', error)
        this.showError(error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    async closeSession() {
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return
      }

      const result = await this.confirmAndExecute(
        '确认结束当前会话？',
        async () => {
          const response = await request({
            url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_CLOSE, {
              session_id: this.currentSessionId
            }),
            method: 'POST',
            data: { close_reason: '问题已解决' }
          })
          if (response && response.success) return response.data
          throw new Error(response?.message || '关闭会话失败')
        },
        { showSuccess: true, successMessage: '会话已关闭' }
      )

      if (result.success) {
        this.closeCurrentChat()
        this.loadSessions()
      }
    },

    closeCurrentChat() {
      this.currentSessionId = null
      this.selectedSession = null
      this.messages = []
      this.currentChatUser = { nickname: '', mobile: '', avatar: '' }
      this.messageInput = ''
    },

    /**
     * 请求用户满意度评价（通过WebSocket推送评分邀请给小程序端）
     * 后端 closeSession 时会自动发起，此按钮用于客服手动补发
     */
    async requestSatisfaction() {
      if (!this.currentSessionId) return
      try {
        if (this.wsConnection && this.wsConnection.connected) {
          this.wsConnection.emit('satisfaction_request', {
            session_id: this.currentSessionId
          })
          Alpine.store('notification').show('已向用户发送满意度评价邀请', 'success')
        } else {
          Alpine.store('notification').show('WebSocket未连接，无法发送评价邀请', 'warning')
        }
      } catch (error) {
        logger.error('发送满意度评价邀请失败:', error)
      }
    },

    // ==================== 用户信息 ====================

    async viewUserInfo() {
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return
      }
      this.loadingOverlay = true

      try {
        const session = this.sessions.find(
          s => String(s.customer_service_session_id) === String(this.currentSessionId)
        )
        if (!session) {
          this.showError('找不到会话信息')
          return
        }

        const userId = session.user?.user_id || session.user_id
        if (!userId) {
          this.showError('无法获取用户ID')
          return
        }

        const url = buildURL(USER_ENDPOINTS.DETAIL, { user_id: userId })
        const response = await request({ url })

        if (response && response.success) {
          this.user_info_data = response.data.user || response.data
          this.showModal('user_info_modal')
        } else {
          this.showError(response?.message || '获取用户信息失败')
        }
      } catch (error) {
        logger.error('获取用户信息失败:', error)
        this.showError(error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    async loadAdminList() {
      try {
        const response = await request({
          url: USER_ENDPOINTS.LIST,
          params: { role_filter: 'admin' }
        })
        if (response && response.success) {
          this.adminList = response.data.users || []
        }
      } catch (error) {
        logger.error('加载客服列表失败:', error)
      }
    },

    // ==================== 会话排序与优先级 ====================

    /**
     * 会话队列优先级排序
     * 排序规则：
     * 1. 状态分组：waiting > active > closed
     * 2. waiting 内按等待时长降序（等最久的排最前）
     * 3. active 内按未读消息数降序
     * 4. closed 按关闭时间降序
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
     * @returns {string} 等待时长标签样式
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

    // ==================== 辅助方法 ====================

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
      const badges = {
        waiting: 'bg-warning text-dark',
        active: 'bg-success',
        closed: 'bg-secondary'
      }
      return badges[status] || 'bg-secondary'
    },

    maskPhone(phone) {
      if (!phone || phone.length < 7) return phone || ''
      return phone.replace(/(\d{3})\d{4}(\d+)/, '$1****$2')
    },

    scrollToBottom() {
      const container = this.$refs.chatMessages || this.$refs.messageContainer
      if (container) container.scrollTop = container.scrollHeight
    },

    selectSession(session) {
      if (session && session.customer_service_session_id) {
        this.openSession(session.customer_service_session_id)
        /* 触发C区用户上下文面板加载（如果 composable 已混入） */
        if (typeof this.loadUserContext === 'function') {
          this.$nextTick(() => this.loadUserContext())
        }
      }
    },

    formatDate(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        return date.toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return dateStr
      }
    },

    // ==================== 响应时长统计 ====================

    async loadResponseStats() {
      try {
        const response = await request({
          url: CONTENT_ENDPOINTS.CUSTOMER_SERVICE_RESPONSE_STATS,
          params: { days: 1 }
        })

        if (response && response.success && response.data) {
          const data = response.data
          this.responseStats = {
            avg_first_response_seconds:
              data.summary?.avg_first_response_seconds || data.avg_first_response_seconds || 0,
            avg_first_response_display:
              data.summary?.avg_first_response_display ||
              data.avg_first_response_display ||
              this.formatSeconds(
                data.summary?.avg_first_response_seconds || data.avg_first_response_seconds
              ),
            avg_response_seconds:
              data.summary?.avg_response_seconds || data.avg_response_seconds || 0,
            avg_response_display:
              data.summary?.avg_response_display ||
              data.avg_response_display ||
              this.formatSeconds(data.summary?.avg_response_seconds || data.avg_response_seconds),
            today_sessions:
              data.summary?.total_sessions || data.today_sessions || data.total_sessions || 0,
            today_resolved:
              data.summary?.resolved_sessions || data.today_resolved || data.resolved_sessions || 0,
            compliance_rate: data.summary?.compliance_rate || null,
            distribution: data.distribution || null,
            trend: data.trend || null
          }
          logger.info('响应时长统计加载成功', this.responseStats)
        } else {
          logger.warn('响应时长统计API返回空数据，使用本地计算')
          this.calculateResponseStatsLocally()
        }
      } catch (error) {
        logger.warn('响应时长统计API调用失败，使用本地计算:', error.message)
        this.calculateResponseStatsLocally()
      }
    },

    calculateResponseStatsLocally() {
      const activeSessions = this.sessions.filter(s => s.status === 'active')
      const closedSessions = this.sessions.filter(s => s.status === 'closed')

      this.responseStats = {
        avg_first_response_seconds: 0,
        avg_first_response_display: '--',
        avg_response_seconds: 0,
        avg_response_display: '--',
        today_sessions: activeSessions.length + closedSessions.length,
        today_resolved: closedSessions.length
      }
    },

    formatSeconds(seconds) {
      if (!seconds || seconds <= 0) return '--'
      if (seconds < 60) return `${Math.round(seconds)}秒`
      if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`
      return `${Math.floor(seconds / 3600)}小时${Math.round((seconds % 3600) / 60)}分钟`
    }
  }
}
