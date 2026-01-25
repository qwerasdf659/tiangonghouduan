/**
 * 客服工作台页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/content/pages/customer-service.js
 * @description 客服工作台页面，提供会话管理、消息收发、WebSocket实时通信功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module CustomerServicePage
 *
 * @requires Alpine.js - 响应式框架
 * @requires Socket.IO - WebSocket库
 * @requires createPageMixin - 页面基础功能混入
 * @requires CONTENT_ENDPOINTS - 内容模块API端点配置
 * @requires USER_ENDPOINTS - 用户模块API端点配置
 *
 * 功能模块：
 * 1. 会话管理 - 会话列表、筛选、搜索
 * 2. 消息收发 - 文本消息、快捷回复
 * 3. WebSocket - 实时消息推送、轮询降级
 * 4. 会话操作 - 接入、关闭、转接
 * 5. 用户信息 - 查看用户详情
 *
 * 后端API：
 * - GET /api/v4/console/customer-service/sessions (会话列表)
 * - GET /api/v4/console/customer-service/sessions/:id/messages (消息记录)
 * - POST /api/v4/console/customer-service/sessions/:id/messages (发送消息)
 * - POST /api/v4/console/customer-service/sessions/:id/close (关闭会话)
 * - POST /api/v4/console/customer-service/sessions/:id/transfer (转接会话)
 */


import { logger } from '../../../utils/logger.js'
import { buildURL, request } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { io } from 'socket.io-client'

/**
 * API请求封装
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @returns {Promise<Object>} 响应数据
 */
async function apiRequest(url, options = {}) {
  const method = options.method || 'GET'
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  }
  
  const token = localStorage.getItem('admin_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const fetchOptions = { method, headers }
  if (options.body) {
    fetchOptions.body = options.body
  }
  
  const response = await fetch(url, fetchOptions)
  return await response.json()
}

/**
 * 获取当前用户信息
 * @returns {Object|null} 用户信息
 */
function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('admin_user')
    return userStr ? JSON.parse(userStr) : null
  } catch {
    return null
  }
}

/**
 * 获取认证Token
 * @returns {string|null} Token
 */
function getToken() {
  return localStorage.getItem('admin_token')
}
/**
 * @typedef {Object} ChatSession
 * @property {number} session_id - 会话ID
 * @property {number} user_id - 用户ID
 * @property {string} user_nickname - 用户昵称
 * @property {string} status - 会话状态 ('pending'|'active'|'closed')
 * @property {number} unread_count - 未读消息数
 * @property {string} last_message - 最后一条消息
 * @property {string} created_at - 创建时间
 */

/**
 * @typedef {Object} ChatMessage
 * @property {number} message_id - 消息ID
 * @property {string} sender_type - 发送者类型 ('user'|'admin')
 * @property {string} message_content - 消息内容
 * @property {string} created_at - 发送时间
 */

/**
 * 创建客服工作台页面组件
 *
 * @description 客服工作台，提供实时客服聊天功能
 * @returns {Object} Alpine.js组件配置对象
 *
 * @example
 * // HTML中使用
 * <div x-data="customerServicePage()">
 *   <div class="chat-container">...</div>
 * </div>
 */
function customerServicePage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== 页面特有状态 ====================

    /** 欢迎文本 */
    welcomeText: '管理员',

    /** 加载状态 */
    loadingOverlay: false,
    sessionsLoading: true,

    /** 会话相关 */
    allSessions: [],
    currentSessionId: null,
    currentMessages: [],
    currentChatUser: {
      nickname: '',
      mobile: '',
      avatar: ''
    },
    
    /** 当前选中的会话对象 (用于模板访问) */
    selectedSession: null,
    
    /** HTML模板兼容：sessions 和 messages 别名 */
    get sessions() {
      return this.allSessions
    },
    get messages() {
      return this.currentMessages
    },
    
    /** 提交状态 */
    submitting: false,

    /** 筛选 */
    searchKeyword: '',
    statusFilter: 'all',

    /** 消息输入 */
    messageInput: '',

    /** 模态框数据 */
    userInfoData: null,
    transferTargetId: '',
    adminList: [],

    /** WebSocket */
    wsConnection: null,
    messagePollingInterval: null,

    /** 快捷回复配置 */
    quickReplies: [
      { text: '👋 欢迎语', content: '您好，有什么可以帮助您的吗？' },
      { text: '⏳ 查询中', content: '请稍等，我为您查询一下' },
      { text: '🙏 感谢反馈', content: '感谢您的反馈，我们会尽快处理' },
      { text: '😊 祝福语', content: '祝您使用愉快！' }
    ],

    /** 默认头像 */
    defaultAvatar:
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+',

    // ==================== 生命周期 ====================

    /**
     * 初始化客服工作台
     * @description 验证登录、初始化WebSocket、加载会话列表
     * @returns {void}
     */
    init() {
      logger.info('客服工作台页面初始化 (Mixin v3.0)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 获取用户信息
      const userInfo = getCurrentUser()
      if (userInfo && userInfo.nickname) {
        this.welcomeText = userInfo.nickname
      }

      // 加载数据
      this.loadSessions()
      this.loadAdminList()
      this.initWebSocket()

      // 定期轮询刷新会话列表
      setInterval(() => this.loadSessions(true), 30000)

      // 页面卸载时关闭WebSocket
      window.addEventListener('beforeunload', () => {
        if (this.wsConnection) {
          this.wsConnection.disconnect()
        }
      })
    },

    // ==================== WebSocket ====================

    /**
     * 初始化WebSocket连接
     * @description 建立WebSocket连接，如失败则降级为轮询模式
     * @returns {void}
     */
    initWebSocket() {
      try {
        // 使用导入的 socket.io-client
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

    /**
     * 启动消息轮询
     * @description WebSocket不可用时启动轮询获取新消息
     * @returns {void}
     */
    startPolling() {
      if (!this.messagePollingInterval) {
        this.messagePollingInterval = setInterval(() => {
          if (this.currentSessionId) {
            this.loadSessionMessages(this.currentSessionId, true)
          }
        }, 5000)
      }
    },

    /**
     * 处理WebSocket消息
     * @param {Object} data - WebSocket消息数据
     * @param {string} data.type - 消息类型
     * @returns {void}
     */
    handleWebSocketMessage(data) {
      switch (data.type) {
        case 'new_message':
          if (String(data.session_id) === String(this.currentSessionId)) {
            this.currentMessages.push(data.message)
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

    /**
     * 加载会话列表
     * @async
     * @param {boolean} [silent=false] - 是否静默加载（不显示loading）
     * @returns {Promise<void>}
     */
    async loadSessions(silent = false) {
      if (!silent) {
        this.sessionsLoading = true
      }

      try {
        const params = new URLSearchParams()
        if (this.statusFilter !== 'all') params.append('status', this.statusFilter)
        if (this.searchKeyword) params.append('search', this.searchKeyword)

        const response = await apiRequest(
          CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSIONS + '?' + params.toString()
        )

        if (response && response.success) {
          this.allSessions = response.data.sessions || response.data.list || []
        } else if (!silent) {
          this.showError(response?.message || '获取会话列表失败')
        }
      } catch (error) {
        logger.error('加载会话失败:', error)
        if (!silent) this.showError(error.message)
      } finally {
        if (!silent) {
          this.sessionsLoading = false
        }
      }
    },

    /**
     * 打开会话
     * @async
     * @param {number|string} sessionId - 会话ID
     * @description 加载会话详情和消息记录
     * @returns {Promise<void>}
     */
    async openSession(sessionId) {
      if (String(sessionId) === String(this.currentSessionId)) return
      this.currentSessionId = sessionId
      this.loadingOverlay = true

      try {
        const response = await apiRequest(
          buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSION_MESSAGES, { session_id: sessionId })
        )

        if (response && response.success) {
          const session = response.data.session
          const messages = response.data.messages || []

          // 更新选中会话（直接使用后端返回的嵌套结构）
          this.selectedSession = session
          
          // 更新当前聊天用户信息（使用后端返回的 user 嵌套对象）
          this.currentChatUser = {
            nickname: session.user?.nickname || '未命名用户',
            mobile: session.user?.mobile || '',
            avatar: session.user?.avatar_url || this.defaultAvatar
          }

          this.currentMessages = messages
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

    /**
     * 加载会话消息
     * @async
     * @param {number|string} sessionId - 会话ID
     * @param {boolean} [silent=false] - 是否静默加载
     * @returns {Promise<void>}
     */
    async loadSessionMessages(sessionId, silent = false) {
      if (!silent) this.loadingOverlay = true
      try {
        const response = await apiRequest(
          buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSION_MESSAGES, { session_id: sessionId })
        )
        if (response && response.success) {
          this.currentMessages = response.data.messages || []
          this.$nextTick(() => this.scrollToBottom())
        }
      } catch (error) {
        if (!silent) logger.error('加载消息失败:', error)
      } finally {
        if (!silent) this.loadingOverlay = false
      }
    },

    // ==================== 消息发送 ====================

    /**
     * 发送消息
     * @async
     * @description 发送文本消息到当前会话
     * @returns {Promise<void>}
     */
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
        const response = await apiRequest(
          buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SEND_MESSAGE, {
            session_id: this.currentSessionId
          }),
          {
            method: 'POST',
            body: JSON.stringify({ content: content })
          }
        )

        if (response && response.success) {
          this.messageInput = ''
          // 使用后端字段名 content（不是 message_content）
          this.currentMessages.push({
            sender_type: 'admin',
            content: content,
            created_at: new Date().toISOString()
          })
          this.$nextTick(() => this.scrollToBottom())

          if (this.wsConnection && this.wsConnection.connected) {
            this.wsConnection.emit('send_message', {
              session_id: this.currentSessionId,
              content: content
            })
          }
        } else {
          this.showError(response?.message || '消息发送失败')
        }
      } catch (error) {
        logger.error('发送消息失败:', error)
        this.showError(error.message)
      }
    },

    /**
     * 插入快捷回复
     * @param {string} text - 快捷回复内容
     * @returns {void}
     */
    insertQuickReply(text) {
      this.messageInput = text
    },

    // ==================== 会话操作 ====================

    /**
     * 标记会话已读
     * @async
     * @param {number|string} sessionId - 会话ID
     * @returns {Promise<void>}
     */
    async markAsRead(sessionId) {
      try {
        await apiRequest(
          buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_MARK_READ, { session_id: sessionId }),
          {
            method: 'POST'
          }
        )
      } catch (error) {
        logger.error('标记已读失败:', error)
      }
    },

    /**
     * 转接会话
     */
    transferSession() {
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return
      }
      this.showModal('transferModal')
    },

    /**
     * 提交转接
     */
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
        const response = await apiRequest(
          buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_TRANSFER, {
            session_id: this.currentSessionId
          }),
          {
            method: 'POST',
            body: JSON.stringify({ target_admin_id: parseInt(this.transferTargetId) })
          }
        )

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

    /**
     * 关闭会话
     */
    async closeSession() {
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return
      }

      const result = await this.confirmAndExecute(
        '确认结束当前会话？',
        async () => {
          const response = await apiRequest(
            buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_CLOSE, {
              session_id: this.currentSessionId
            }),
            { method: 'POST', body: JSON.stringify({ close_reason: '问题已解决' }) }
          )

          if (response && response.success) {
            return response.data
          }
          throw new Error(response?.message || '关闭会话失败')
        },
        { showSuccess: true, successMessage: '会话已关闭' }
      )

      if (result.success) {
        this.closeCurrentChat()
        this.loadSessions()
      }
    },

    /**
     * 关闭当前聊天
     */
    closeCurrentChat() {
      this.currentSessionId = null
      this.selectedSession = null
      this.currentMessages = []
      this.currentChatUser = { nickname: '', mobile: '', avatar: '' }
      this.messageInput = ''
    },

    // ==================== 用户信息 ====================

    /**
     * 查看用户信息
     */
    async viewUserInfo() {
      if (!this.currentSessionId) {
        this.showError('请先选择一个会话')
        return
      }
      this.loadingOverlay = true

      try {
        const session = this.allSessions.find(
          s => String(s.session_id) === String(this.currentSessionId)
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
        const response = await apiRequest(url)
        
        if (response && response.success) {
          this.userInfoData = response.data.user || response.data
          this.showModal('userInfoModal')
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

    /**
     * 加载管理员列表
     */
    async loadAdminList() {
      try {
        const response = await apiRequest(USER_ENDPOINTS.LIST + '?role_filter=admin')
        if (response && response.success) {
          this.adminList = response.data.users || []
        }
      } catch (error) {
        logger.error('加载客服列表失败:', error)
      }
    },

    // ==================== 辅助方法 ====================

    /**
     * 获取会话用户昵称
     */
    getSessionUserNickname(session) {
      return session.user?.nickname || session.user_nickname || '未命名用户'
    },

    /**
     * 获取会话用户手机号
     */
    getSessionUserMobile(session) {
      return session.user?.mobile || session.user_mobile || ''
    },

    /**
     * 获取会话用户头像
     */
    getSessionUserAvatar(session) {
      return session.user?.avatar_url || session.user_avatar || this.defaultAvatar
    },

    /**
     * 获取会话最后消息
     */
    getSessionLastMessage(session) {
      const lastMessage = session.last_message?.content || session.last_message || '暂无消息'
      return typeof lastMessage === 'string' ? lastMessage : '暂无消息'
    },

    /**
     * 获取会话状态徽章
     */
    getSessionStatusBadge(status) {
      const badges = {
        waiting: 'bg-warning text-dark',
        active: 'bg-success',
        closed: 'bg-secondary'
      }
      return badges[status] || 'bg-secondary'
    },

    /**
     * 获取会话状态文本
     */
    getSessionStatusText(status) {
      const texts = { waiting: '待处理', active: '进行中', closed: '已关闭' }
      return texts[status] || '未知'
    },

    /**
     * 掩码手机号
     */
    maskPhone(phone) {
      if (!phone || phone.length < 7) return phone || ''
      return phone.replace(/(\d{3})\d{4}(\d+)/, '$1****$2')
    },

    /**
     * 滚动到底部
     */
    scrollToBottom() {
      const container = this.$refs.chatMessages || this.$refs.messageContainer
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    },

    // ==================== HTML模板兼容方法 ====================

    /**
     * 选择会话（HTML模板别名）
     * @param {Object} session - 会话对象
     */
    selectSession(session) {
      if (session && session.session_id) {
        this.openSession(session.session_id)
      }
    },

    /**
     * 格式化日期（HTML模板需要）
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的日期
     */
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

    /**
     * 查看用户资料（HTML模板别名）
     */
    viewUserProfile() {
      this.viewUserInfo()
    },

    /**
     * 确认转接（HTML模板需要）
     */
    async confirmTransfer() {
      await this.submitTransfer()
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('customerServicePage', customerServicePage)
  // 添加别名（HTML 使用 customerService()）
  Alpine.data('customerService', customerServicePage)
  logger.info('[CustomerServicePage] Alpine 组件已注册 (Mixin v3.0)')
})
