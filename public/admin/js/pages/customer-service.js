/**
 * 客服工作台页面 - Alpine.js 组件
 * 迁移自原生 JavaScript DOM 操作
 */

function customerServicePage() {
  return {
    // ========== 状态数据 ==========
    welcomeText: '管理员',
    loadingOverlay: false,
    sessionsLoading: true,
    
    // 会话相关
    allSessions: [],
    currentSessionId: null,
    currentMessages: [],
    currentChatUser: {
      nickname: '',
      mobile: '',
      avatar: ''
    },
    
    // 筛选
    searchKeyword: '',
    statusFilter: 'all',
    
    // 消息输入
    messageInput: '',
    
    // 模态框数据
    userInfoData: null,
    transferTargetId: '',
    adminList: [],
    
    // WebSocket
    wsConnection: null,
    messagePollingInterval: null,
    
    // 快捷回复配置
    quickReplies: [
      { text: '👋 欢迎语', content: '您好，有什么可以帮助您的吗？' },
      { text: '⏳ 查询中', content: '请稍等，我为您查询一下' },
      { text: '🙏 感谢反馈', content: '感谢您的反馈，我们会尽快处理' },
      { text: '😊 祝福语', content: '祝您使用愉快！' }
    ],
    
    // 默认头像
    defaultAvatar: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+',

    // ========== 初始化 ==========
    init() {
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

    // ========== WebSocket ==========
    initWebSocket() {
      try {
        // 检查Socket.IO库是否已加载
        if (typeof io === 'undefined') {
          console.warn('⚠️ Socket.IO库未加载，WebSocket功能不可用，使用轮询模式')
          this.startPolling()
          return
        }

        this.wsConnection = io({
          auth: { token: getToken() },
          transports: ['websocket', 'polling']
        })

        this.wsConnection.on('connect', () => console.log('✅ WebSocket连接成功'))
        this.wsConnection.on('message', data => this.handleWebSocketMessage(data))
        this.wsConnection.on('new_message', data => this.handleWebSocketMessage({ type: 'new_message', ...data }))
        this.wsConnection.on('session_update', data => this.handleWebSocketMessage({ type: 'session_update', ...data }))
        this.wsConnection.on('error', error => console.error('WebSocket错误:', error))
        this.wsConnection.on('disconnect', reason => console.log('WebSocket连接已断开:', reason))
        this.wsConnection.on('connect_error', error => {
          console.error('WebSocket连接失败:', error)
          this.startPolling()
        })
      } catch (error) {
        console.error('WebSocket初始化失败:', error)
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
            alert('当前会话已被关闭')
            this.closeCurrentChat()
          }
          this.loadSessions(true)
          break
      }
    },

    // ========== 会话管理 ==========
    async loadSessions(silent = false) {
      if (!silent) {
        this.sessionsLoading = true
      }

      try {
        const params = new URLSearchParams()
        if (this.statusFilter !== 'all') params.append('status', this.statusFilter)
        if (this.searchKeyword) params.append('search', this.searchKeyword)

        const response = await apiRequest(
          API_ENDPOINTS.CUSTOMER_SERVICE.SESSIONS + '?' + params.toString()
        )

        if (response && response.success) {
          this.allSessions = response.data.sessions || response.data.list || []
        } else if (!silent) {
          this.showError('加载失败', response?.message || '获取会话列表失败')
        }
      } catch (error) {
        console.error('加载会话失败:', error)
        if (!silent) this.showError('加载失败', error.message)
      } finally {
        if (!silent) {
          this.sessionsLoading = false
        }
      }
    },

    async openSession(sessionId) {
      if (String(sessionId) === String(this.currentSessionId)) return
      this.currentSessionId = sessionId
      this.loadingOverlay = true

      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.CUSTOMER_SERVICE.SESSION_MESSAGES, { session_id: sessionId })
        )
        
        if (response && response.success) {
          const session = response.data.session
          const messages = response.data.messages || []
          
          // 更新当前聊天用户信息
          this.currentChatUser = {
            nickname: session.user?.nickname || session.user_nickname || '未命名用户',
            mobile: session.user?.mobile || session.user_mobile || '',
            avatar: session.user?.avatar_url || session.user_avatar || this.defaultAvatar
          }

          this.currentMessages = messages
          this.$nextTick(() => this.scrollToBottom())
          this.markAsRead(sessionId)
          this.loadSessions(true)
        } else {
          this.showError('打开失败', response?.message || '获取会话信息失败')
        }
      } catch (error) {
        console.error('打开会话失败:', error)
        this.showError('打开失败', error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    async loadSessionMessages(sessionId, silent = false) {
      if (!silent) this.loadingOverlay = true
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.CUSTOMER_SERVICE.SESSION_MESSAGES, { session_id: sessionId })
        )
        if (response && response.success) {
          this.currentMessages = response.data.messages || []
          this.$nextTick(() => this.scrollToBottom())
        }
      } catch (error) {
        if (!silent) console.error('加载消息失败:', error)
      } finally {
        if (!silent) this.loadingOverlay = false
      }
    },

    // ========== 消息发送 ==========
    async sendMessage() {
      const content = this.messageInput.trim()
      if (!content) {
        this.showError('发送失败', '请输入消息内容')
        return
      }
      if (!this.currentSessionId) {
        this.showError('发送失败', '请先选择一个会话')
        return
      }

      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.CUSTOMER_SERVICE.SEND_MESSAGE, { session_id: this.currentSessionId }),
          {
            method: 'POST',
            body: JSON.stringify({ content: content })
          }
        )

        if (response && response.success) {
          this.messageInput = ''
          this.currentMessages.push({
            sender_type: 'admin',
            message_content: content,
            created_at: new Date().toISOString()
          })
          this.$nextTick(() => this.scrollToBottom())
          
          if (this.wsConnection && this.wsConnection.connected) {
            this.wsConnection.emit('send_message', { session_id: this.currentSessionId, content: content })
          }
        } else {
          this.showError('发送失败', response?.message || '消息发送失败')
        }
      } catch (error) {
        console.error('发送消息失败:', error)
        this.showError('发送失败', error.message)
      }
    },

    insertQuickReply(text) {
      this.messageInput = text
    },

    // ========== 会话操作 ==========
    async markAsRead(sessionId) {
      try {
        await apiRequest(API.buildURL(API_ENDPOINTS.CUSTOMER_SERVICE.MARK_READ, { session_id: sessionId }), {
          method: 'POST'
        })
      } catch (error) {
        console.error('标记已读失败:', error)
      }
    },

    transferSession() {
      if (!this.currentSessionId) {
        this.showError('操作失败', '请先选择一个会话')
        return
      }
      new bootstrap.Modal(this.$refs.transferModal).show()
    },

    async submitTransfer() {
      if (!this.currentSessionId) {
        this.showError('操作失败', '请先选择一个会话')
        return
      }

      if (!this.transferTargetId) {
        this.showError('转接失败', '请选择接收客服')
        return
      }

      this.loadingOverlay = true
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.CUSTOMER_SERVICE.TRANSFER, { session_id: this.currentSessionId }),
          {
            method: 'POST',
            body: JSON.stringify({ target_admin_id: parseInt(this.transferTargetId) })
          }
        )

        if (response && response.success) {
          this.showSuccess('转接成功', '会话已转接')
          bootstrap.Modal.getInstance(this.$refs.transferModal).hide()
          this.closeCurrentChat()
          this.loadSessions()
        } else {
          this.showError('转接失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('转接失败:', error)
        this.showError('转接失败', error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    async closeSession() {
      if (!this.currentSessionId) {
        this.showError('操作失败', '请先选择一个会话')
        return
      }

      if (!confirm('确认结束当前会话？')) return
      this.loadingOverlay = true

      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.CUSTOMER_SERVICE.CLOSE, { session_id: this.currentSessionId }),
          { method: 'POST', body: JSON.stringify({ close_reason: '问题已解决' }) }
        )
        
        if (response && response.success) {
          this.showSuccess('操作成功', '会话已关闭')
          this.closeCurrentChat()
          this.loadSessions()
        } else {
          this.showError('操作失败', response?.message || '关闭会话失败')
        }
      } catch (error) {
        console.error('关闭会话失败:', error)
        this.showError('操作失败', error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    closeCurrentChat() {
      this.currentSessionId = null
      this.currentMessages = []
      this.currentChatUser = { nickname: '', mobile: '', avatar: '' }
      this.messageInput = ''
    },

    // ========== 用户信息 ==========
    async viewUserInfo() {
      if (!this.currentSessionId) {
        this.showError('操作失败', '请先选择一个会话')
        return
      }
      this.loadingOverlay = true

      try {
        const session = this.allSessions.find(s => String(s.session_id) === String(this.currentSessionId))
        if (!session) return

        const userId = session.user?.user_id || session.user_id
        if (!userId) {
          this.showError('查看失败', '无法获取用户ID')
          return
        }

        const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER.DETAIL, { user_id: userId }))
        if (response && response.success) {
          this.userInfoData = response.data.user || response.data
          new bootstrap.Modal(this.$refs.userInfoModal).show()
        }
      } catch (error) {
        console.error('获取用户信息失败:', error)
        this.showError('查看失败', error.message)
      } finally {
        this.loadingOverlay = false
      }
    },

    async loadAdminList() {
      try {
        const response = await apiRequest(API_ENDPOINTS.USER.LIST + '?role_filter=admin')
        if (response && response.success) {
          this.adminList = response.data.users || []
        }
      } catch (error) {
        console.error('加载客服列表失败:', error)
      }
    },

    // ========== 辅助方法 ==========
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
    },

    getSessionStatusText(status) {
      const texts = { waiting: '待处理', active: '进行中', closed: '已关闭' }
      return texts[status] || '未知'
    },

    maskPhone(phone) {
      if (!phone || phone.length < 7) return phone || ''
      return phone.replace(/(\d{3})\d{4}(\d+)/, '$1****$2')
    },

    scrollToBottom() {
      const container = this.$refs.chatMessages
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    },

    // ========== 通用方法 ==========
    handleLogout() {
      logout()
    },

    showSuccess(title, message) {
      alert(`✅ ${title}\n${message}`)
    },

    showError(title, message) {
      alert(`❌ ${title}\n${message}`)
    }
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('customerServicePage', customerServicePage)
})
