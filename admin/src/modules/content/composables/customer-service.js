/**
 * 客服工作台 - Composable
 *
 * @file admin/src/modules/content/composables/customer-service.js
 * @description 从 customer-service.js 提取的客服工作台状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request, getToken, API_PREFIX } from '../../../api/base.js'
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

    /** @type {string} 图片预览弹窗当前图片 URL */
    previewImageUrl: '',
    /** @type {string} 图片预览弹窗当前图片 alt */
    previewImageAlt: '',
    /** @type {boolean} 聊天图片上传中 */
    image_uploading: false,

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
      avg_response_seconds: 0,
      avg_response_display: '--',
      max_response_seconds: 0,
      max_response_display: '--',
      within_1min_rate: 0,
      within_1min_display: '--',
      today_sessions: 0
    },
    // 7 日响应趋势数据（[{date, avg_seconds, within_1min_rate, session_count}]，升序），供折线渲染
    responseTrend7d: []
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
          // R11：后端 cluster 为 websocket-only，客户端禁用 polling 回退以对齐（避免多 worker 握手粘连失败）
          transports: ['websocket'],
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
      const ok = await this._sendMessageContent(content, 'text')
      if (ok) this.messageInput = ''
    },

    /**
     * 发送图片消息：先上传到对象存储（复用管理端媒体上传接口），再以 image 类型发送
     * @param {Event} event - file input change 事件
     */
    async sendImageMessage(event) {
      const file = event?.target?.files?.[0]
      if (!file) return
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        event.target.value = ''
        return
      }

      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowed.includes(file.type)) {
        this.showError('仅支持 JPG/PNG/GIF/WEBP 格式')
        event.target.value = ''
        return
      }
      if (file.size > 20 * 1024 * 1024) {
        this.showError('图片过大，不能超过 20MB')
        event.target.value = ''
        return
      }

      this.image_uploading = true
      try {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('folder', 'chat-images')

        const uploadRes = await request({
          url: `${API_PREFIX}/console/media/upload`,
          method: 'POST',
          data: formData
        })

        event.target.value = ''
        if (!uploadRes?.success || !uploadRes.data?.public_url) {
          this.showError(uploadRes?.message || '图片上传失败')
          return
        }

        // 富消息契约：图片 content 为占位 [图片]，真实 URL 进 metadata.image_url（与后端一致）
        await this._sendMessageContent('[图片]', 'image', {
          image_url: uploadRes.data.public_url
        })
      } catch (error) {
        logger.error('发送图片失败:', error)
        this.showError(error.message || '图片上传失败')
        event.target.value = ''
      } finally {
        this.image_uploading = false
      }
    },

    /**
     * 发送消息内核（文本/图片/文件/位置共用）
     * @param {string} content - 可读内容（文本正文 / 图片占位[图片] / 文件名 / 地址）
     * @param {('text'|'image'|'file'|'location')} message_type - 消息类型
     * @param {Object|null} [metadata] - 富消息结构化负载（image→image_url；file→file_url/file_name/file_size；location→坐标/地址）
     * @returns {Promise<boolean>} 是否发送成功
     */
    async _sendMessageContent(content, message_type, metadata = null) {
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return false
      }

      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SEND_MESSAGE, {
            session_id: this.currentSessionId
          }),
          method: 'POST',
          data: { content, message_type, metadata }
        })

        if (response && response.success) {
          this.messages.push({
            chat_message_id: response.data?.chat_message_id,
            sender_type: 'admin',
            message_source: 'admin_client',
            // 后端归一化后回传的 content/metadata 优先（如 file 的 content=真实文件名）
            content: response.data?.content ?? content,
            message_type,
            metadata: response.data?.metadata ?? metadata,
            created_at: response.data?.created_at || new Date().toISOString()
          })
          this.$nextTick(() => this.scrollToBottom())
          return true
        }
        this.showError(response?.message || '消息发送失败')
        return false
      } catch (error) {
        logger.error('发送消息失败:', error)
        this.showError(error.message)
        return false
      }
    },

    /**
     * 打开图片预览弹窗（聊天图片点击放大，右键可另存下载，不开新窗口）
     * @param {string} url - 图片 URL
     * @param {string} [alt] - 图片描述
     */
    openImagePreview(url, alt) {
      if (!url) return
      this.previewImageUrl = url
      this.previewImageAlt = alt || ''
      this.showModal('imagePreviewModal')
    },

    /** 关闭图片预览弹窗 */
    closeImagePreview() {
      this.hideModal('imagePreviewModal')
      this.previewImageUrl = ''
      this.previewImageAlt = ''
    },

    /**
     * 下载图片（fetch 成 blob 再触发下载，规避跨域对象存储图右键另存受限的问题）
     * @param {string} [url] - 指定下载的图片 URL；不传则下载当前灯箱预览的图片
     */
    async downloadPreviewImage(url) {
      const targetUrl = url || this.previewImageUrl
      if (!targetUrl) return
      try {
        const res = await fetch(targetUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()

        // 从 URL 提取文件名，缺失则用时间戳兜底
        const urlName = targetUrl.split('?')[0].split('/').pop()
        const fileName = urlName && urlName.includes('.') ? urlName : `chat-image-${Date.now()}.jpg`

        const objectUrl = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(objectUrl)
      } catch (error) {
        logger.error('下载图片失败:', error)
        this.showError('图片下载失败，请重试')
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
     * 获取消息预览文本（截断版，供会话卡片标题区使用）
     * @param {Object} session - 会话对象
     * @returns {string} 截断后的消息预览
     */
    getMessagePreview(session) {
      const text = this.getSessionLastMessage(session)
      if (text === '暂无消息') return text
      return text.length > 30 ? text.substring(0, 30) + '...' : text
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
    /**
     * 获取会话最后一条消息的预览文案（按 message_type 渲染，唯一真相源）
     *
     * 业务规则（与后端富消息建模对齐，B/富消息定稿 2026-06-25）：
     * - 系统消息（message_source==='system'）→ content 原文（系统提示）
     * - image    → [图片]（不暴露原始 URL，URL 在 metadata.image_url）
     * - file     → [文件] 文件名（content 即真实文件名；metadata.file_name 兜底）
     * - location → [位置] 地址（content 即可读地址；metadata.address/name 兜底）
     * - text     → 文本原文
     *
     * 数据来源兼容：会话列表接口下发 last_message；用户历史接口下发 last_message_preview，
     * 两者字段同名（message_type/message_source/content/metadata），此处统一消费。
     *
     * @param {Object} session - 会话对象
     * @returns {string} 预览文案
     */
    getSessionLastMessage(session) {
      const msg = session.last_message || session.last_message_preview
      if (!msg || typeof msg !== 'object') return '暂无消息'

      // 系统消息统一由 message_source 判定（message_type 不再含 system）
      if (msg.message_source === 'system') {
        return typeof msg.content === 'string' && msg.content ? msg.content : '系统消息'
      }

      const meta = msg.metadata || {}
      switch (msg.message_type) {
        case 'image':
          return '[图片]'
        case 'file':
          return `[文件] ${msg.content || meta.file_name || ''}`.trim()
        case 'location':
          return `[位置] ${msg.content || meta.address || meta.name || ''}`.trim()
        default:
          return typeof msg.content === 'string' && msg.content ? msg.content : '暂无消息'
      }
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
          params: { days: 7 }
        })

        if (response && response.success && response.data) {
          const today = response.data.today || {}
          this.responseStats = {
            avg_response_seconds: today.avg_response_seconds || 0,
            avg_response_display: this.formatSeconds(today.avg_response_seconds),
            max_response_seconds: today.max_response_seconds || 0,
            max_response_display: this.formatSeconds(today.max_response_seconds),
            within_1min_rate: today.within_1min_rate || 0,
            within_1min_display:
              today.within_1min_rate > 0 ? Math.round(today.within_1min_rate * 100) + '%' : '--',
            today_sessions: today.session_count || 0
          }
          // 7 日趋势：以前被丢弃，现保留供「客服响应趋势」折线渲染（升序，便于按时间轴展示）
          this.responseTrend7d = Array.isArray(response.data.trend_7d)
            ? [...response.data.trend_7d].sort((a, b) => (a.date < b.date ? -1 : 1))
            : []
          logger.info('响应时长统计加载成功', this.responseStats)
        } else {
          this.showError(response?.message || '响应时长统计加载失败')
        }
      } catch (error) {
        logger.error('响应时长统计API调用失败:', error)
        this.showError(error.message)
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
