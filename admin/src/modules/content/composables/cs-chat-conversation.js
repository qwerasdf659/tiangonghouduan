/**
 * 客服工作台 - 聊天对话管理
 *
 * @file admin/src/modules/content/composables/cs-chat-conversation.js
 * @description 从 customer-service.js 提取的聊天对话逻辑：打开会话、发送消息、关闭/转接
 * @version 1.0.0
 * @date 2026-02-23
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'
import { USER_ENDPOINTS } from '../../../api/user.js'

/**
 * 聊天对话状态
 * @returns {Object} 状态对象
 */
export function useCsChatConversationState() {
  return {
    /** @type {number|null} 当前选中的会话 ID */
    currentSessionId: null,
    /** @type {Object|null} 当前选中的会话对象 */
    selectedSession: null,
    /** @type {Array} 当前会话的消息列表 */
    messages: [],
    /** @type {Object} 当前聊天用户信息 */
    currentChatUser: { nickname: '', mobile: '', avatar: '' },
    /** @type {string} 消息输入内容 */
    messageInput: '',
    /** @type {boolean} 消息发送中 */
    submitting: false,
    /** @type {boolean} 加载遮罩 */
    loadingOverlay: false,
    /** @type {string} 转接目标客服 ID */
    transferTargetId: '',
    /** @type {Array} 管理员（客服）列表 */
    adminList: [],
    /** @type {Object|null} 用户详情（查看用户信息弹窗） */
    user_info_data: null,
    /** @type {Array} 快捷回复列表 */
    quickReplies: [
      { text: '欢迎语', content: '您好，有什么可以帮助您的吗？' },
      { text: '查询中', content: '请稍等，我为您查询一下' },
      { text: '已处理', content: '您反馈的问题已处理完毕，请查看' },
      { text: '感谢', content: '感谢您的反馈，祝您生活愉快！' }
    ]
  }
}

/**
 * 聊天对话方法
 * @returns {Object} 方法对象
 */
export function useCsChatConversationMethods() {
  return {
    /**
     * 打开/切换会话（加载消息、标记已读）
     * @param {number} sessionId - 会话 ID
     */
    async openSession(sessionId) {
      if (String(sessionId) === String(this.currentSessionId)) return
      this.currentSessionId = sessionId
      this.loadingOverlay = true

      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSION_MESSAGES, { session_id: sessionId })
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
        logger.error('[Chat] 打开会话失败:', error)
        this.showError(error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    /**
     * 加载指定会话的消息列表
     * @param {number} sessionId - 会话 ID
     * @param {boolean} [silent=false] - 静默加载
     */
    async loadSessionMessages(sessionId, silent = false) {
      if (!silent) this.loadingOverlay = true
      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSION_MESSAGES, { session_id: sessionId })
        })
        if (response && response.success) {
          this.messages = response.data.messages || []
          this.$nextTick(() => this.scrollToBottom())
        }
      } catch (error) {
        if (!silent) logger.error('[Chat] 加载消息失败:', error)
      } finally {
        if (!silent) this.loadingOverlay = false
      }
    },

    /**
     * 发送消息
     */
    async sendMessage() {
      const content = this.messageInput.trim()
      if (!content) { this.showError('请输入消息内容'); return }
      if (!this.currentSessionId) { this.showError('请先选择一个会话'); return }

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
        logger.error('[Chat] 发送消息失败:', error)
        this.showError(error.message)
      }
    },

    /** 插入快捷回复 */
    insertQuickReply(text) {
      this.messageInput = text
    },

    /** 标记会话已读 */
    async markAsRead(sessionId) {
      try {
        await request({
          url: buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_MARK_READ, { session_id: sessionId }),
          method: 'POST'
        })
      } catch (error) {
        logger.error('[Chat] 标记已读失败:', error)
      }
    },

    /** 打开转接弹窗 */
    transferSession() {
      if (!this.currentSessionId) { this.showError('请先选择一个会话'); return }
      this.showModal('transferModal')
    },

    /** 提交转接 */
    async submitTransfer() {
      if (!this.currentSessionId) { this.showError('请先选择一个会话'); return }
      if (!this.transferTargetId) { this.showError('请选择接收客服'); return }

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
        logger.error('[Chat] 转接失败:', error)
        this.showError(error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    /** 关闭会话 */
    async closeSession() {
      if (!this.currentSessionId) { this.showError('请先选择一个会话'); return }

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

    /** 清空当前聊天状态 */
    closeCurrentChat() {
      this.currentSessionId = null
      this.selectedSession = null
      this.messages = []
      this.currentChatUser = { nickname: '', mobile: '', avatar: '' }
      this.messageInput = ''
    },

    /** 选中会话（触发 openSession + 用户上下文加载） */
    selectSession(session) {
      if (session && session.customer_service_session_id) {
        this.openSession(session.customer_service_session_id)
        if (typeof this.loadUserContext === 'function') {
          this.$nextTick(() => this.loadUserContext())
        }
      }
    },

    /** 查看当前会话用户详情 */
    async viewUserInfo() {
      if (!this.currentSessionId) { this.showError('请先选择一个会话'); return }
      this.loadingOverlay = true

      try {
        const session = this.sessions.find(
          s => String(s.customer_service_session_id) === String(this.currentSessionId)
        )
        if (!session) { this.showError('找不到会话信息'); return }

        const userId = session.user?.user_id || session.user_id
        if (!userId) { this.showError('无法获取用户ID'); return }

        const url = buildURL(USER_ENDPOINTS.DETAIL, { user_id: userId })
        const response = await request({ url })

        if (response && response.success) {
          this.user_info_data = response.data.user || response.data
          this.showModal('user_info_modal')
        } else {
          this.showError(response?.message || '获取用户信息失败')
        }
      } catch (error) {
        logger.error('[Chat] 获取用户信息失败:', error)
        this.showError(error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    /** 加载管理员列表（转接用） */
    async loadAdminList() {
      try {
        const response = await request({ url: USER_ENDPOINTS.LIST, params: { role_filter: 'admin' } })
        if (response && response.success) {
          this.adminList = response.data.users || []
        }
      } catch (error) {
        logger.error('[Chat] 加载客服列表失败:', error)
      }
    },

    /** 手机号脱敏 */
    maskPhone(phone) {
      if (!phone || phone.length < 7) return phone || ''
      return phone.replace(/(\d{3})\d{4}(\d+)/, '$1****$2')
    },

    /** 滚动到消息底部 */
    scrollToBottom() {
      const container = this.$refs.chatMessages || this.$refs.messageContainer
      if (container) container.scrollTop = container.scrollHeight
    },

    /** 日期格式化 */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        })
      } catch {
        return dateStr
      }
    }
  }
}
