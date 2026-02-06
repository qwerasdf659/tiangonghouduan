// pages/admin/customer-service/customer-service.js - 管理员实时客服聊天页面
const app = getApp()
const { Wechat, API, Utils } = require('../../../utils/index')
const { showToast } = Wechat
const { checkAdmin } = Utils

/**
 * 管理员实时客服聊天页面 - 处理用户实时咨询
 * 功能：实时聊天、会话管理、快捷回复
 */
Page({
  data: {
    // 权限验证
    isAdmin: false,
    userInfo: null,

    // 实时聊天模式数据
    sessions: [],
    currentSessionId: null,
    currentSessionUserName: '',
    currentMessages: [],
    loadingSessions: false,
    inputContent: '',
    isTyping: false,

    // 布局控制
    // 聊天面板是否展开全屏显示
    chatExpanded: false,

    // 聊天工作台功能
    // 管理员状态: online, busy, offline
    adminStatus: 'online',
    wsConnected: false,
    reconnectCount: 0,
    scrollToBottom: false,
    showQuickReplies: false,

    // 清理资源
    cleanup: null,

    // WebSocket稳定性管理
    // 心跳定时器
    heartbeatInterval: null,
    // 心跳超时定时器
    heartbeatTimeout: null,
    // 最后心跳时间
    lastHeartbeatTime: null,
    // 连接质量: good, poor, lost
    connectionQuality: 'good',
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,

    // 调试相关
    showDebugPanel: false,
    debugLogs: [],

    // 按钮状态管理
    sendButtonEnabled: false,

    // 快捷回复模板
    quickReplies: [
      { id: 1, title: '欢迎', content: '您好！很高兴为您服务，请问有什么可以帮助您的吗？' },
      { id: 2, title: '稍等', content: '好的，请您稍等片刻，我来为您查询处理。' },
      { id: 3, title: '核实信息', content: '为了更好的为您处理，请提供您的订单号或联系方式。' },
      { id: 4, title: '感谢', content: '感谢您的耐心等待，如还有其他问题请随时联系我们。' },
      { id: 5, title: '结束', content: '本次服务到此结束，祝您生活愉快！如有问题请随时联系。' }
    ],

    // 今日工作统计
    todayStats: {
      totalSessions: 0,
      completedSessions: 0,
      avgResponseTime: '0分钟',
      customerSatisfaction: 0
    }
  },

  onLoad() {
    console.log('📊 管理员实时客服聊天页面加载')

    // 🔴 使用统一的管理员权限检查
    if (!checkAdmin()) {
      console.warn('⚠️ 管理员权限检查失败，已自动处理')
      return
    }

    this.initChatWorkspace()
    // 初始化按钮状态
    this.updateSendButtonState()
  },

  onShow() {
    console.log('📱 管理员客服页面显示')

    // 🔴 使用统一的管理员权限检查
    if (!checkAdmin()) {
      console.warn('⚠️ 管理员权限检查失败，已自动处理')
      return
    }

    // 页面显示时刷新会话列表
    this.refreshSessions()
  },

  // 页面卸载时清理资源
  onUnload() {
    console.log('📱 管理员客服页面卸载，清理资源')
    const appInstance = getApp()

    // 安全检查app对象和方法是否存在
    if (appInstance && typeof appInstance.unsubscribeWebSocketMessages === 'function') {
      // 取消WebSocket消息订阅
      appInstance.unsubscribeWebSocketMessages('admin_customer_service')
    } else {
      console.warn('⚠️ app对象或unsubscribeWebSocketMessages方法不可用')
    }

    // 清理本地状态
    this.setData({
      wsConnected: false,
      connectionQuality: 'lost'
    })
  },

  // 🔴 已删除 checkAdminPermission() 方法
  // 现在统一使用 checkAdmin() 从 auth-helper.js

  // 初始化聊天工作台
  async initChatWorkspace() {
    try {
      const userInfo = app.globalData.userInfo
      if (userInfo) {
        this.setData({
          adminInfo: {
            id: userInfo.userId,
            name: userInfo.nickname || '管理员',
            avatar: userInfo.avatarUrl
          }
        })
      }

      await this.connectWebSocket()
      await this.refreshSessions()
      await this.loadAdminTodayStats()
    } catch (error) {
      console.error('❌ 初始化聊天工作台失败:', error)
    }
  },

  // 📡 WebSocket连接管理
  async connectWebSocket() {
    const appInstance = getApp()

    // 安全检查app对象和方法是否存在
    if (!appInstance || typeof appInstance.subscribeWebSocketMessages !== 'function') {
      console.error('❌ app对象或WebSocket管理方法不可用')
      throw new Error('WebSocket管理系统未就绪')
    }

    // 使用统一WebSocket管理
    console.log('🔒 管理员端使用统一WebSocket连接')

    // 订阅WebSocket消息
    appInstance.subscribeWebSocketMessages('admin_customer_service', (eventName, data) => {
      this.handleUnifiedWebSocketMessage(eventName, data)
    })

    try {
      // 尝试连接统一WebSocket
      await appInstance.connectWebSocket()

      console.log('✅ 管理员端WebSocket连接成功')
      this.setData({
        wsConnected: true,
        reconnectCount: 0,
        reconnectAttempts: 0,
        connectionQuality: 'good',
        lastHeartbeatTime: Date.now()
      })

      // 注册为管理员
      this.registerAsAdmin()
    } catch (error) {
      console.error('❌ 管理员端WebSocket连接失败:', error)
      this.setData({
        wsConnected: false,
        connectionQuality: 'lost'
      })
      throw error
    }
  },

  // 注册为管理员
  registerAsAdmin() {
    if (!this.data.wsConnected) {
      return
    }

    const message = {
      type: 'admin_register',
      data: {
        adminId: this.data.userInfo?.userId,
        adminName: this.data.userInfo?.nickname || '管理员'
      }
    }

    wx.sendSocketMessage({
      data: JSON.stringify(message),
      success: () => {
        console.log('✅ 管理员注册成功')
      },
      fail: error => {
        console.error('❌ 管理员注册失败', error)
      }
    })
  },

  // 处理统一WebSocket消息
  handleUnifiedWebSocketMessage(eventName, data) {
    console.log('📢 管理员端收到统一WebSocket消息:', eventName, data)

    switch (eventName) {
    case 'websocket_connected':
      this.setData({
        wsConnected: true,
        connectionQuality: 'good',
        reconnectAttempts: 0
      })
      this.registerAsAdmin()
      break

    case 'websocket_error':
    case 'websocket_closed':
      this.setData({
        wsConnected: false,
        connectionQuality: 'lost'
      })
      break

    case 'websocket_max_reconnect_reached':
      this.setData({ connectionQuality: 'lost' })
      showToast('连接已断开，请刷新页面重试')
      break

    case 'new_user_message':
      this.handleNewUserMessage(data)
      break

    case 'session_started':
      this.handleSessionStarted(data)
      break

    case 'session_ended':
      this.handleSessionEnded(data)
      break

    default:
      console.log('🔧 管理员端未处理的消息类型:', eventName)
    }
  },

  // 处理新用户消息
  handleNewUserMessage(messageData) {
    console.log('👥 收到新用户消息', messageData)

    // 确保消息内容不为空且格式正确
    if (!messageData || !messageData.content) {
      console.warn('⚠️ 收到空消息或格式错误的消息', messageData)
      return
    }

    if (messageData.sessionId === this.data.currentSessionId) {
      // 用户消息对管理员来说不是自己的
      const isOwn = false

      // 简化日志：管理员端收到用户消息
      console.log('📢 [管理员收到用户消息]', {
        content: messageData.content?.substring(0, 30) + '...',
        senderType: 'user',
        position: '左边(用户)'
      })

      const newMessage = {
        id: messageData.messageId || `msg_${Date.now()}`,
        senderId: messageData.userId || messageData.senderId,
        senderType: 'user',
        // 确保content是字符串
        content: String(messageData.content || ''),
        messageType: messageData.messageType || 'text',
        createdAt: messageData.createdAt || new Date().toISOString(),
        isOwn,
        // 新增：保留调试信息
        _debugInfo: {
          messageSource: '实时WebSocket',
          expectedPosition: '左边(用户)',
          cssClass: 'user'
        }
      }

      this.setData({
        currentMessages: [...this.data.currentMessages, newMessage],
        scrollToBottom: true
      })
    }

    // 实时消息到达时也刷新会话列表，确保最新消息显示
    this.refreshSessions()
  },

  // 处理会话开始
  handleSessionStarted(sessionData) {
    console.log('🆕 新会话开始', sessionData)
    this.refreshSessions()
  },

  // 处理会话结束
  handleSessionEnded(sessionData) {
    console.log('🔚 会话结束:', sessionData)
    if (sessionData.sessionId === this.data.currentSessionId) {
      this.setData({
        currentSessionId: null,
        currentMessages: [],
        chatExpanded: false
      })
    }
    this.refreshSessions()
  },

  // 改进的重连机制
  handleReconnect() {
    if (this.data.reconnectAttempts < this.data.maxReconnectAttempts) {
      // 指数退避算法，最大30秒延迟
      const reconnectDelay = Math.min(Math.pow(2, this.data.reconnectAttempts) * 1000, 30000)

      console.log(
        `🔧 尝试重连WebSocket (${this.data.reconnectAttempts + 1}/${this.data.maxReconnectAttempts})`
      )
      console.log(`⏲ 重连延迟: ${reconnectDelay}ms`)

      this.setData({
        reconnectAttempts: this.data.reconnectAttempts + 1,
        connectionQuality: 'poor'
      })

      setTimeout(() => {
        this.connectWebSocket().catch(() => {
          console.log('⚠️ 重连失败，将继续尝试')
        })
      }, reconnectDelay)
    } else {
      console.log('❌ WebSocket重连失败，已达到最大重试次数')
      this.setData({ connectionQuality: 'lost' })
      showToast('连接已断开，请刷新页面重试')
    }
  },

  // WebSocket心跳机制
  startHeartbeat() {
    console.log('💓 启动WebSocket心跳机制')
    // 确保清理之前的定时器
    this.stopHeartbeat()

    // 每30秒发送一次心跳
    this.setData({
      heartbeatInterval: setInterval(() => {
        this.sendHeartbeat()
      }, 30000)
    })

    // 第一次立即发送心跳
    this.sendHeartbeat()
  },

  stopHeartbeat() {
    console.log('🛑 停止WebSocket心跳机制')
    if (this.data.heartbeatInterval) {
      clearInterval(this.data.heartbeatInterval)
      this.setData({ heartbeatInterval: null })
    }
    if (this.data.heartbeatTimeout) {
      clearTimeout(this.data.heartbeatTimeout)
      this.setData({ heartbeatTimeout: null })
    }
  },

  sendHeartbeat() {
    if (!this.data.wsConnected) {
      console.log('💔 WebSocket未连接，跳过心跳发送')
      return
    }

    const heartbeatData = {
      type: 'heartbeat',
      timestamp: Date.now(),
      clientId: this.data.userInfo?.userId || 'admin'
    }

    try {
      wx.sendSocketMessage({
        data: JSON.stringify(heartbeatData),
        success: () => {
          console.log('💓 心跳发送成功')
          this.setData({ lastHeartbeatTime: Date.now() })
          this.waitForHeartbeatResponse()
        },
        fail: error => {
          console.error('💔 心跳发送失败', error)
          this.setData({ connectionQuality: 'poor' })
        }
      })
    } catch (error) {
      console.error('💔 心跳发送异常', error)
      this.setData({ connectionQuality: 'poor' })
    }
  },

  waitForHeartbeatResponse() {
    // 设置10秒超时，如果没有收到响应则认为连接有问题
    this.setData({
      heartbeatTimeout: setTimeout(() => {
        console.log('💔 心跳响应超时，连接可能有问题')
        this.setData({ connectionQuality: 'poor' })

        // 如果连续3次心跳超时，主动断开重连
        const timeSinceLastHeartbeat = Date.now() - this.data.lastHeartbeatTime
        if (timeSinceLastHeartbeat > 90000) {
          // 90秒
          console.log('💔 连接质量太差，主动重连')
          wx.closeSocket()
        }
      }, 10000)
    })
  },

  handleHeartbeatResponse() {
    console.log('💚 收到心跳响应')
    this.setData({ connectionQuality: 'good' })
    if (this.data.heartbeatTimeout) {
      clearTimeout(this.data.heartbeatTimeout)
      this.setData({ heartbeatTimeout: null })
    }
  },

  // 刷新会话列表
  async refreshSessions() {
    try {
      this.setData({ loadingSessions: true })

      // 修复：管理员端应使用专用的管理员会话API
      const result = await API.getAdminChatSessions({
        status: 'active',
        page: 1,
        pageSize: 50
      })

      if (result.success) {
        // 关键修复：添加数据格式转换逻辑，确保前端显示正确
        const processedSessions = (result.data.sessions || []).map(session => {
          // 处理用户信息：确保userInfo是正确的对象格式
          const userInfo = session.userInfo || session.user || {}
          const processedUserInfo = {
            nickname:
              typeof userInfo === 'object'
                ? userInfo.nickname || userInfo.userName || userInfo.name || null
                : String(userInfo || ''),
            userId: userInfo.userId || session.userId || 'unknown'
          }

          // 处理最后消息：确保lastMessage是字符串
          let lastMessage = session.lastMessage || session.latestMessage || ''
          if (typeof lastMessage === 'object') {
            // 如果lastMessage是对象，提取content字段
            lastMessage = lastMessage.content || lastMessage.text || '[消息]'
          }
          lastMessage = String(lastMessage || '等待客服回复...')

          // 处理时间格式：确保时间显示正确
          let lastMessageTime =
            session.lastMessageTime || session.updatedAt || session.createdAt || ''
          if (lastMessageTime) {
            try {
              // 格式化时间显示
              const date = new Date(lastMessageTime)
              const now = new Date()
              const diffMs = now - date
              const diffMins = Math.floor(diffMs / (1000 * 60))

              if (diffMins < 1) {
                lastMessageTime = '刚刚'
              } else if (diffMins < 60) {
                lastMessageTime = `${diffMins}分钟前`
              } else if (diffMins < 1440) {
                lastMessageTime = `${Math.floor(diffMins / 60)}小时前`
              } else {
                lastMessageTime = date.toLocaleDateString()
              }
            } catch (_e) {
              lastMessageTime = '未知时间'
            }
          }

          // 处理未读计数：确保是数字
          const unreadCount = parseInt(session.unreadCount || session.unread || 0) || 0

          // 处理会话状态：标准化状态值
          let status = session.status || 'waiting'
          if (!['waiting', 'active', 'ended'].includes(status)) {
            status = 'waiting'
          }

          return {
            sessionId: session.sessionId || session.id,
            userId: session.userId,
            userInfo: processedUserInfo,
            lastMessage,
            lastMessageTime,
            unreadCount,
            status,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
          }
        })

        this.setData({
          sessions: processedSessions,
          loadingSessions: false
        })

        // 添加调试信息：输出处理后的数据
        console.log('✅ 会话列表刷新成功:', processedSessions.length)
        console.log('📊 [调试] 处理后的会话数据示例:', processedSessions[0])
      } else {
        throw new Error(result.message || '获取会话列表失败')
      }
    } catch (error) {
      console.error('❌ 刷新会话列表失败:', error)
      this.setData({ loadingSessions: false })

      // 添加用户友好的错误提示
      showToast('获取会话列表失败，请稍后重试')
    }
  },

  // 选择会话
  onSelectSession(e) {
    const sessionId = e.currentTarget.dataset.sessionId
    console.log('📋 [管理员] 选择会话:', sessionId)

    if (sessionId === this.data.currentSessionId) {
      this.setData({
        chatExpanded: !this.data.chatExpanded
      })
      return
    }

    const currentSession = this.data.sessions.find(s => s.sessionId === sessionId)
    const currentSessionUserName =
      currentSession && currentSession.userInfo
        ? currentSession.userInfo.nickname || '用户' + currentSession.userId
        : '用户'

    this.setData({
      currentSessionId: sessionId,
      currentSessionUserName,
      currentMessages: [],
      scrollToBottom: true,
      chatExpanded: true
    })

    // 更新按钮状态（会话改变时）
    this.updateSendButtonState()

    this.loadSessionMessages(sessionId)
  },

  // 关闭展开模式
  onCloseChatExpanded() {
    this.setData({
      chatExpanded: false
    })
  },

  // 📖 加载会话消息
  async loadSessionMessages(sessionId) {
    try {
      console.log('📖 [管理员] 加载会话消息:', sessionId)

      // 关键修复：管理员端使用专用的历史消息API
      const result = await API.getAdminChatHistory({
        sessionId,
        page: 1,
        pageSize: 50
      })

      if (result.success) {
        const messages = (result.data.messages || []).map(msg => {
          // 判断是否为管理员自己的消息：senderType为admin
          const isOwn = msg.senderType === 'admin'

          return {
            id: msg.messageId,
            senderId: msg.senderId,
            senderType: msg.senderType,
            content: msg.content,
            messageType: msg.messageType || 'text',
            createdAt: msg.createdAt,
            isOwn
          }
        })

        // 修复消息顺序：按时间排序，最新消息在最下面
        const sortedMessages = messages.sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime()
          const timeB = new Date(b.createdAt).getTime()
          // 升序排列：旧消息在前，新消息在后
          return timeA - timeB
        })

        // 调试信息：统计消息类型和时间范围
        console.log('📊 [客服消息统计]', {
          admin: sortedMessages.filter(m => m.senderType === 'admin').length,
          user: sortedMessages.filter(m => m.senderType === 'user').length,
          total: sortedMessages.length,
          时间范围: {
            最旧: sortedMessages[0]?.createdAt,
            最新: sortedMessages[sortedMessages.length - 1]?.createdAt
          }
        })

        this.setData({
          currentMessages: sortedMessages,
          scrollToBottom: true
        })

        console.log('✅ [管理员] 会话消息加载成功:', messages.length)
      }
    } catch (error) {
      console.error('❌ 加载会话消息失败:', error)
    }
  },

  // 📝 聊天输入框内容变化
  onChatInputChange(e) {
    const content = e.detail.value
    console.log('🔡 [INPUT-CHANGE] 输入内容变化:', JSON.stringify(content))
    console.log('🔡 [INPUT-CHANGE] 变化前inputContent:', JSON.stringify(this.data.inputContent))
    console.log('🔡 [INPUT-CHANGE] 事件时间:', new Date().toISOString())

    this.setData({
      inputContent: content
    })

    // 验证设置是否成功
    console.log('🔡 [INPUT-CHANGE] 设置后inputContent:', JSON.stringify(this.data.inputContent))

    // 立即更新按钮状态
    this.updateSendButtonState()

    if (content.trim()) {
      this.startTyping()
    } else {
      this.stopTyping()
    }
  },

  // 📝 聊天输入框获得焦点
  onChatInputFocus() {
    this.setData({ scrollToBottom: true })
  },

  // 📝 聊天输入框失去焦点
  onChatInputBlur() {
    // 可以在这里添加失去焦点的处理逻辑
  },

  // 📤 发送聊天消息
  async sendChatMessage() {
    console.log('🔡 [SEND-START] ========== 正常发送按钮被点击 ==========')
    console.log('🔡 [SEND-START] sendChatMessage函数被调用')
    console.log('🔡 [SEND-START] 函数执行时间:', new Date().toISOString())
    console.log('🔡 [SEND-START] 函数执行时inputContent:', JSON.stringify(this.data.inputContent))
    console.log(
      '🔡 [SEND-START] inputContent长度:',
      this.data.inputContent ? this.data.inputContent.length : 0
    )
    console.log('🔡 [SEND-START] inputContent类型:', typeof this.data.inputContent)
    console.log(
      '🔡 [SEND-START] inputContent.trim()结果:',
      JSON.stringify(this.data.inputContent ? this.data.inputContent.trim() : 'undefined')
    )
    console.log('🔡 [SEND-START] 当前currentSessionId:', JSON.stringify(this.data.currentSessionId))
    console.log('🔡 [SEND-START] 用户信息:', JSON.stringify(this.data.userInfo))
    console.log('🔡 [SEND-START] WebSocket连接状态:', this.data.wsConnected)
    console.log('🔡 [SEND-START] 当前会话列表数量:', this.data.sessions.length)
    console.log('🔡 [SEND-START] 当前消息列表数量:', this.data.currentMessages.length)

    // 立即保存输入内容（防止被异步清空）
    const originalInputContent = this.data.inputContent
    console.log('🔡 [SEND-START] 立即保存的输入内容:', JSON.stringify(originalInputContent))

    // 使用立即保存的内容，避免异步清空问题
    const content = originalInputContent ? originalInputContent.trim() : ''
    console.log('🔡 [SEND-START] 使用保存的内容:', JSON.stringify(originalInputContent))
    console.log('🔡 [SEND-START] 处理后的content:', JSON.stringify(content))
    console.log('🔡 [SEND-START] content是否为空:', !content)
    console.log('🔡 [SEND-START] content长度:', content.length)

    // 同时检查当前的inputContent是否被改变
    if (this.data.inputContent !== originalInputContent) {
      console.log('⚠️ [SEND-START] 检测到inputContent被异步修改')
      console.log('🔡 [SEND-START] 原始内容:', JSON.stringify(originalInputContent))
      console.log('🔡 [SEND-START] 当前内容:', JSON.stringify(this.data.inputContent))
    }

    if (!content) {
      console.log('❌ [SEND-START] 发送消息失败：内容为空')
      console.log('🔡 [SEND-START] 原始inputContent:', JSON.stringify(this.data.inputContent))
      console.log('🔡 [SEND-START] 保存的inputContent:', JSON.stringify(originalInputContent))
      wx.showToast({
        title: '请输入消息内容',
        icon: 'none'
      })
      return
    }

    if (!this.data.currentSessionId) {
      console.log('❌ [SEND-START] 发送消息失败：sessionId缺失')
      console.log('🔡 [SEND-START] 可用的会话列表:', JSON.stringify(this.data.sessions))
      wx.showToast({
        title: '请先选择一个聊天会话',
        icon: 'none'
      })
      return
    }

    console.log('✅ [SEND-START] 验证通过，开始发送消息流程')

    const tempMessage = {
      id: `temp_${Date.now()}`,
      senderId: this.data.userInfo?.userId,
      senderType: 'admin',
      content,
      messageType: 'text',
      status: 'sending',
      createdAt: new Date().toISOString(),
      isOwn: true
    }

    try {
      console.log('🔡 [DEBUG] 开始发送消息流程')
      console.log('🔡 [DEBUG] 消息内容:', JSON.stringify(content))
      console.log('🔡 [DEBUG] 会话ID:', JSON.stringify(this.data.currentSessionId))
      console.log('🔡 [DEBUG] 临时消息对象:', JSON.stringify(tempMessage))

      // 检查网络状态
      wx.getNetworkType({
        success: res => {
          console.log('🔡 [DEBUG] 网络类型:', res.networkType)
          console.log('🔡 [DEBUG] 网络可用:', res.networkType !== 'none')
        }
      })

      this.setData({ inputContent: '' })
      this.stopTyping()

      this.setData({
        currentMessages: [...this.data.currentMessages, tempMessage],
        scrollToBottom: true
      })

      console.log('🔡 [DEBUG] UI更新完成，开始API调用')
      console.log(
        '🔡 [DEBUG] API调用参数:',
        JSON.stringify({
          sessionId: this.data.currentSessionId,
          content,
          messageType: 'text',
          tempMessageId: tempMessage.id,
          senderType: 'admin'
        })
      )

      try {
        const startTime = Date.now()
        console.log('🔡 [DEBUG-NORMAL] API调用开始时间:', startTime)

        const apiParams = {
          sessionId: this.data.currentSessionId,
          content,
          messageType: 'text',
          tempMessageId: tempMessage.id,
          senderType: 'admin'
        }
        console.log('🔡 [DEBUG-NORMAL] API调用参数详情:', JSON.stringify(apiParams))

        const apiResult = await API.sendChatMessage(apiParams)

        const endTime = Date.now()
        console.log('🔡 [DEBUG-NORMAL] API调用结束时间:', endTime)
        console.log('🔡 [DEBUG-NORMAL] API调用耗时:', endTime - startTime + 'ms')
        console.log('🔡 [DEBUG-NORMAL] API调用完整响应:', JSON.stringify(apiResult))
        console.log('🔡 [DEBUG-NORMAL] API响应类型:', typeof apiResult)
        console.log('🔡 [DEBUG-NORMAL] API响应success字段:', apiResult?.success)
        console.log('🔡 [DEBUG-NORMAL] API响应data字段:', JSON.stringify(apiResult?.data))
        console.log('🔡 [DEBUG-NORMAL] API响应message字段:', apiResult?.message)

        if (apiResult && apiResult.success === true) {
          console.log('✅ [DEBUG-NORMAL] API消息发送成功')
          console.log('🔡 [DEBUG-NORMAL] 成功响应数据:', JSON.stringify(apiResult.data))

          const updatedMessages = this.data.currentMessages.map(msg =>
            msg.id === tempMessage.id
              ? {
                ...msg,
                status: 'sent',
                id: apiResult.data?.messageId || msg.id,
                serverResponse: apiResult.data
              }
              : msg
          )
          this.setData({ currentMessages: updatedMessages })
          console.log('🔡 [DEBUG-NORMAL] 消息状态更新完成')
          console.log('🔡 [DEBUG-NORMAL] 更新后的消息列表:', JSON.stringify(updatedMessages))
        } else {
          console.error('❌ [DEBUG-NORMAL] API消息发送失败')
          console.error('🔡 [DEBUG-NORMAL] 失败原因:', JSON.stringify(apiResult))
          console.error('🔡 [DEBUG-NORMAL] success字段值:', apiResult?.success)
          console.error('🔡 [DEBUG-NORMAL] 完整响应结构:', Object.keys(apiResult || {}))

          // 更新消息状态为失败
          const failedMessages = this.data.currentMessages.map(msg =>
            msg.id === tempMessage.id
              ? { ...msg, status: 'failed', error: apiResult?.message }
              : msg
          )
          this.setData({ currentMessages: failedMessages })

          throw new Error(apiResult?.message || 'API发送失败')
        }
      } catch (apiError) {
        console.error('❌ [DEBUG-NORMAL] API发送消息异常', apiError)
        console.error('🔡 [DEBUG-NORMAL] 异常类型:', apiError.constructor.name)
        console.error('🔡 [DEBUG-NORMAL] 异常消息:', apiError.message)
        console.error('🔡 [DEBUG-NORMAL] 异常堆栈:', apiError.stack)

        // 更新消息状态为失败
        const failedMessages = this.data.currentMessages.map(msg =>
          msg.id === tempMessage.id ? { ...msg, status: 'failed', error: apiError.message } : msg
        )
        this.setData({ currentMessages: failedMessages })

        wx.showToast({
          title: 'API调用失败: ' + (apiError.message || '未知错误'),
          icon: 'none',
          duration: 3000
        })
      }

      // WebSocket发送
      console.log('🔡 [DEBUG] 开始WebSocket发送流程')
      console.log('🔡 [DEBUG] WebSocket连接状态:', this.data.wsConnected)
      console.log(
        '🔡 [DEBUG] WebSocket实例状态:',
        wx.getSocketState ? wx.getSocketState() : '不支持状态查询'
      )

      // 修复：检查WebSocket连接状态
      if (!this.data.wsConnected) {
        console.log('⚠️ [DEBUG] WebSocket未连接，跳过实时发送')
        console.log('🔡 [DEBUG] 尝试重新连接WebSocket')
        this.connectWebSocket()
        return
      }

      if (this.data.wsConnected) {
        console.log('🔡 [DEBUG] WebSocket已连接，准备发送')

        const chatMessage = {
          type: 'admin_chat_message',
          data: {
            sessionId: this.data.currentSessionId,
            content,
            messageType: 'text',
            adminId: this.data.userInfo?.userId,
            // 配合后端v2.0.1：标识消息来源为管理员端
            messageSource: 'admin_client',
            senderType: 'admin'
          }
        }

        console.log('🔡 [DEBUG] WebSocket消息内容:', JSON.stringify(chatMessage))

        try {
          wx.sendSocketMessage({
            data: JSON.stringify(chatMessage),
            success: res => {
              console.log('✅ [DEBUG] WebSocket消息发送成功')
              console.log('🔡 [DEBUG] 发送成功响应:', JSON.stringify(res))
            },
            fail: err => {
              console.error('❌ [DEBUG] WebSocket发送失败')
              console.error('🔡 [DEBUG] 发送失败详情:', JSON.stringify(err))
            }
          })
        } catch (wsError) {
          console.error('❌ [DEBUG] WebSocket发送异常', wsError)
          console.error('🔡 [DEBUG] 异常详情:', {
            name: wsError.name,
            message: wsError.message,
            stack: wsError.stack
          })
        }
      } else {
        console.log('⚠️ [DEBUG] WebSocket未连接，跳过实时发送')
        console.log('🔡 [DEBUG] 尝试重新连接WebSocket')
        this.connectWebSocket()
      }
    } catch (error) {
      console.error('❌ [管理员] 发送聊天消息失败', error)

      const failedMessages = this.data.currentMessages.map(msg =>
        msg.id === tempMessage.id ? { ...msg, status: 'failed' } : msg
      )
      this.setData({ currentMessages: failedMessages })

      showToast('消息发送失败，请重试')
    }
  },

  // ⌨️ 开始输入状态
  startTyping() {
    if (!this.data.wsConnected || !this.data.currentSessionId) {
      return
    }

    if (!this.data.isTyping) {
      this.setData({ isTyping: true })

      const typingMessage = {
        type: 'admin_typing_start',
        data: {
          sessionId: this.data.currentSessionId,
          adminId: this.data.userInfo?.userId
        }
      }

      wx.sendSocketMessage({
        data: JSON.stringify(typingMessage)
      })
    }
  },

  // ⌨️ 停止输入状态
  stopTyping() {
    if (!this.data.wsConnected || !this.data.currentSessionId || !this.data.isTyping) {
      return
    }

    this.setData({ isTyping: false })

    const typingMessage = {
      type: 'admin_typing_stop',
      data: {
        sessionId: this.data.currentSessionId,
        adminId: this.data.userInfo?.userId
      }
    }

    wx.sendSocketMessage({
      data: JSON.stringify(typingMessage)
    })
  },

  // ⚡ 切换快捷回复
  toggleQuickReplies() {
    this.setData({
      showQuickReplies: !this.data.showQuickReplies
    })
  },

  // 🚀 快捷回复选择
  onQuickReplySelect(e) {
    const content = e.currentTarget.dataset.content
    this.setData({
      inputContent: content,
      showQuickReplies: false
    })
  },

  // 🔚 结束会话
  async onEndSession() {
    if (!this.data.currentSessionId) {
      showToast('请先选择一个会话')
      return
    }

    console.log('🔚 [管理员] 结束会话:', this.data.currentSessionId)

    try {
      const result = await API.endChatSession({
        sessionId: this.data.currentSessionId,
        endReason: 'admin_ended'
      })

      if (result.success) {
        this.setData({
          currentSessionId: null,
          currentMessages: [],
          chatExpanded: false
        })

        this.refreshSessions()
        showToast('会话已结束')
      } else {
        throw new Error(result.message || '结束会话失败')
      }
    } catch (error) {
      console.error('❌ 结束会话失败:', error)
      showToast('结束会话失败，请重试')
    }
  },

  // 📊 加载今日统计
  async loadAdminTodayStats() {
    try {
      const result = await API.getAdminTodayStats()

      if (result.success) {
        this.setData({
          todayStats: {
            totalSessions: result.data.totalSessions || 0,
            completedSessions: result.data.completedSessions || 0,
            avgResponseTime: result.data.avgResponseTime || '0分钟',
            customerSatisfaction: result.data.customerSatisfaction || 0
          }
        })
      }
    } catch (error) {
      console.error('❌ 加载今日统计失败:', error)
    }
  },

  // 🗑 清理资源
  cleanup() {
    this.stopTyping()

    if (this.data.wsConnected) {
      wx.closeSocket()
    }

    this.setData({
      wsConnected: false,
      currentSessionId: null,
      currentMessages: [],
      sessions: []
    })
  },

  // =================== 调试功能区域 ===================

  // 切换调试面板显示
  toggleDebugPanel() {
    this.setData({
      showDebugPanel: !this.data.showDebugPanel
    })
    console.log('🔡 [DEBUG] 调试面板状态:', this.data.showDebugPanel ? '显示' : '隐藏')
  },

  // 检查所有状态
  debugCheckStatus() {
    console.log('🔡 [DEBUG] ========== 全面状态检查 ==========')
    const statusInfo = {
      timestamp: new Date().toISOString(),
      userInfo: this.data.userInfo,
      isAdmin: this.data.isAdmin,
      currentSessionId: this.data.currentSessionId,
      currentSessionUserName: this.data.currentSessionUserName,
      sessionsCount: this.data.sessions.length,
      currentMessagesCount: this.data.currentMessages.length,
      wsConnected: this.data.wsConnected,
      adminStatus: this.data.adminStatus,
      inputContent: this.data.inputContent,
      chatExpanded: this.data.chatExpanded,
      reconnectCount: this.data.reconnectCount
    }

    console.log('🔡 [DEBUG] 当前状态详情:', JSON.stringify(statusInfo, null, 2))

    // 显示关键状态
    const statusText = `WebSocket: ${this.data.wsConnected ? '✅已连接' : '❌断开'}
当前会话: ${this.data.currentSessionId || '❌无'}
用户信息: ${this.data.userInfo ? '✅有' : '❌无'}
管理员权限: ${this.data.isAdmin ? '✅是' : '❌否'}
消息数量: ${this.data.currentMessages.length}
会话数量: ${this.data.sessions.length}`

    wx.showModal({
      title: '📊 状态检查结果',
      content: statusText,
      showCancel: false
    })
  },

  // 检查网络状态
  debugCheckNetwork() {
    console.log('🔡 [DEBUG] 开始网络状态检查')

    wx.getNetworkType({
      success: res => {
        console.log('🔡 [DEBUG] 网络类型:', res.networkType)

        // 测试网络连通性
        wx.request({
          url: 'https://www.baidu.com',
          timeout: 5000,
          success: () => {
            console.log('🔡 [DEBUG] 网络连通性测试成功')
            wx.showToast({
              title: `网络正常 ${res.networkType}`,
              icon: 'success',
              duration: 2000
            })
          },
          fail: testErr => {
            console.error('🔡 [DEBUG] 网络连通性测试失败', testErr)
            wx.showToast({
              title: `网络异常 ${res.networkType}`,
              icon: 'error',
              duration: 2000
            })
          }
        })
      },
      fail: err => {
        console.error('🔡 [DEBUG] 获取网络类型失败:', err)
        wx.showToast({
          title: '网络状态检查失败',
          icon: 'error'
        })
      }
    })
  },

  // 检查WebSocket状态
  debugCheckWebSocket() {
    console.log('🔡 [DEBUG] ========== WebSocket状态检查 ==========')
    console.log('🔡 [DEBUG] WebSocket连接状态:', this.data.wsConnected)
    console.log('🔡 [DEBUG] 重连次数:', this.data.reconnectCount)

    const wsStatus = wx.getSocketState ? wx.getSocketState() : '不支持状态查询'
    console.log('🔡 [DEBUG] WebSocket系统状态:', wsStatus)

    wx.showModal({
      title: '⚡WebSocket状态',
      content: `连接状态: ${this.data.wsConnected ? '✅已连接' : '❌未连接'}\n重连次数: ${this.data.reconnectCount}\n系统状态: ${wsStatus}`,
      showCancel: false
    })
  },

  // 测试API连接
  async debugTestAPI() {
    console.log('🔡 [DEBUG] 开始API连接测试')

    try {
      // 💡 loading由APIClient自动处理，无需手动showLoading

      // 测试基础API
      const testResult = await API.getUserInfo()
      console.log('🔡 [DEBUG] API测试结果:', testResult)

      // 💡 loading由APIClient自动处理，无需手动hideLoading
      wx.showToast({
        title: testResult.success ? '✅API连接正常' : '❌API连接异常',
        icon: testResult.success ? 'success' : 'error',
        duration: 2000
      })
    } catch (error) {
      console.error('🔡 [DEBUG] API测试失败:', error)
      // 💡 loading由APIClient自动处理，无需手动hideLoading
      wx.showToast({
        title: '❌API测试失败',
        icon: 'error',
        duration: 2000
      })
    }
  },

  // 发送测试消息
  async debugSendTestMessage() {
    console.log('🔡 [DEBUG-TEST] ========== 测试发送按钮被点击 ==========')

    if (!this.data.currentSessionId) {
      console.log('❌ [DEBUG-TEST] 测试发送失败：无会话ID')
      wx.showToast({
        title: '请先选择一个会话',
        icon: 'none'
      })
      return
    }

    console.log('🔡 [DEBUG-TEST] 开始发送测试消息')
    console.log('🔡 [DEBUG-TEST] 当前会话ID:', this.data.currentSessionId)

    const testContent = `[测试消息] ${new Date().toLocaleTimeString()}`
    console.log('🔡 [DEBUG-TEST] 测试消息内容:', testContent)

    try {
      console.log('🔡 [DEBUG-TEST] 调用API.sendChatMessage，参数：', {
        sessionId: this.data.currentSessionId,
        content: testContent,
        messageType: 'text',
        senderType: 'admin'
      })

      const apiResult = await API.sendChatMessage({
        sessionId: this.data.currentSessionId,
        content: testContent,
        messageType: 'text',
        senderType: 'admin'
      })

      console.log('🔡 [DEBUG-TEST] 测试消息发送结果:', apiResult)

      wx.showToast({
        title: apiResult.success ? '✅测试消息发送成功' : '❌测试消息发送失败',
        icon: apiResult.success ? 'success' : 'error',
        duration: 2000
      })
    } catch (error) {
      console.error('🔡 [DEBUG-TEST] 测试消息发送异常', error)
      wx.showToast({
        title: '❌测试消息发送异常',
        icon: 'error'
      })
    }
  },

  // 重新加载会话
  async debugLoadSessions() {
    console.log('🔡 [DEBUG] 重新加载会话列表')
    await this.loadChatSessions()
  },

  // 改进的手动重连WebSocket
  debugReconnectWebSocket() {
    console.log('🔡 [DEBUG] 手动重新连接WebSocket')

    // 先清理现有连接
    this.stopHeartbeat()
    if (this.data.wsConnected) {
      wx.closeSocket()
    }

    // 重置状态
    this.setData({
      wsConnected: false,
      reconnectAttempts: 0,
      connectionQuality: 'poor'
    })

    wx.showToast({
      title: '🔧 正在重连...',
      icon: 'loading',
      duration: 1000
    })

    // 延迟1秒后重连，给清理时间
    setTimeout(() => {
      this.connectWebSocket()
        .then(() => {
          wx.showToast({
            title: '✅ 重连成功',
            icon: 'success',
            duration: 2000
          })
        })
        .catch(error => {
          console.error('🔡 [DEBUG] 重连失败:', error)
          wx.showToast({
            title: '❌ 重连失败',
            icon: 'error',
            duration: 2000
          })
        })
    }, 1000)
  },

  // 发送测试WebSocket消息
  debugSendTestWS() {
    if (!this.data.wsConnected) {
      wx.showToast({
        title: 'WebSocket未连接',
        icon: 'none'
      })
      return
    }

    console.log('🔡 [DEBUG] 发送测试WebSocket消息')

    const testMessage = {
      type: 'ping',
      timestamp: Date.now(),
      data: { test: true }
    }

    try {
      wx.sendSocketMessage({
        data: JSON.stringify(testMessage),
        success: () => {
          console.log('🔡 [DEBUG] 测试WebSocket消息发送成功')
          wx.showToast({
            title: '✅WS测试消息发送成功',
            icon: 'success'
          })
        },
        fail: err => {
          console.error('🔡 [DEBUG] 测试WebSocket消息发送失败', err)
          wx.showToast({
            title: '❌WS测试消息发送失败',
            icon: 'error'
          })
        }
      })
    } catch (error) {
      console.error('🔡 [DEBUG] WebSocket发送异常', error)
      wx.showToast({
        title: '❌WS发送异常',
        icon: 'error'
      })
    }
  },

  // 手动发送心跳测试
  debugSendHeartbeat() {
    console.log('🔡 [DEBUG] 手动发送心跳测试')
    if (!this.data.wsConnected) {
      wx.showToast({
        title: '❌ WebSocket未连接',
        icon: 'none'
      })
      return
    }

    this.sendHeartbeat()
    wx.showToast({
      title: '💓 心跳发送完成',
      icon: 'success',
      duration: 1500
    })
  },

  // 断开WebSocket连接
  debugCloseWebSocket() {
    console.log('🔡 [DEBUG] 手动断开WebSocket连接')
    this.stopHeartbeat()
    if (this.websocket) {
      this.websocket.close()
    }
    wx.closeSocket()
    this.setData({
      wsConnected: false,
      connectionQuality: 'lost'
    })

    wx.showToast({
      title: '❌ WebSocket已断开',
      icon: 'none'
    })
  },

  // 显示当前数据
  debugShowCurrentData() {
    console.log('🔡 [DEBUG] ========== 当前页面数据 ==========')
    console.log('🔡 [DEBUG] 完整数据对象:', JSON.stringify(this.data, null, 2))

    // 显示关键数据摘要
    const dataText = `会话数量: ${this.data.sessions.length}
当前会话ID: ${this.data.currentSessionId || '无'}
消息数量: ${this.data.currentMessages.length}
用户信息: ${this.data.userInfo ? '已登录' : '未登录'}
WebSocket: ${this.data.wsConnected ? '已连接' : '未连接'}
输入内容: "${this.data.inputContent}"`

    wx.showModal({
      title: '📦 当前数据摘要',
      content: dataText,
      showCancel: false
    })
  },

  // 清空消息列表
  debugClearMessages() {
    console.log('🔡 [DEBUG] 清空当前消息列表')
    this.setData({
      currentMessages: []
    })

    wx.showToast({
      title: '🗑 消息列表已清空',
      icon: 'success'
    })
  },

  // 导出调试日志
  debugExportLogs() {
    console.log('🔡 [DEBUG] 准备导出调试日志')

    wx.showModal({
      title: '📋 调试日志导出',
      content: '请查看微信开发者工具的控制台获取详细日志信息。所有调试信息都已输出到控制台。',
      showCancel: false
    })
  },

  // 更新发送按钮状态
  updateSendButtonState() {
    const hasContent = this.data.inputContent && this.data.inputContent.trim()
    const hasSession = this.data.currentSessionId
    const shouldEnable = hasContent && hasSession

    console.log('🔡 [BUTTON-STATE] ========== 更新按钮状态 ==========')
    console.log('🔡 [BUTTON-STATE] inputContent:', JSON.stringify(this.data.inputContent))
    console.log('🔡 [BUTTON-STATE] inputContent.trim():', JSON.stringify(hasContent))
    console.log('🔡 [BUTTON-STATE] currentSessionId:', JSON.stringify(this.data.currentSessionId))
    console.log('🔡 [BUTTON-STATE] hasContent:', hasContent)
    console.log('🔡 [BUTTON-STATE] hasSession:', hasSession)
    console.log('🔡 [BUTTON-STATE] 按钮应该启用:', shouldEnable)
    console.log('🔡 [BUTTON-STATE] 当前按钮状态:', this.data.sendButtonEnabled)

    if (this.data.sendButtonEnabled !== shouldEnable) {
      console.log('🔡 [BUTTON-STATE] 按钮状态发生变化，更新中...')
      this.setData({
        sendButtonEnabled: shouldEnable
      })
      console.log('🔡 [BUTTON-STATE] 按钮状态已更新为:', shouldEnable)
    } else {
      console.log('🔡 [BUTTON-STATE] 按钮状态无变化')
    }
  },

  // 检查发送按钮状态
  debugCheckSendButton() {
    console.log('🔡 [DEBUG-BUTTON] ========== 检查发送按钮状态 ==========')
    console.log('🔡 [DEBUG-BUTTON] 原始inputContent:', JSON.stringify(this.data.inputContent))
    console.log('🔡 [DEBUG-BUTTON] inputContent类型:', typeof this.data.inputContent)
    console.log(
      '🔡 [DEBUG-BUTTON] inputContent长度:',
      this.data.inputContent ? this.data.inputContent.length : 'undefined'
    )
    console.log(
      '🔡 [DEBUG-BUTTON] inputContent.trim():',
      JSON.stringify(this.data.inputContent ? this.data.inputContent.trim() : 'undefined')
    )
    console.log('🔡 [DEBUG-BUTTON] !inputContent.trim()结果:', !this.data.inputContent?.trim())
    console.log('🔡 [DEBUG-BUTTON] currentSessionId:', JSON.stringify(this.data.currentSessionId))
    console.log('🔡 [DEBUG-BUTTON] !currentSessionId结果:', !this.data.currentSessionId)
    console.log('🔡 [DEBUG-BUTTON] sendButtonEnabled:', this.data.sendButtonEnabled)

    const isButtonDisabled = !this.data.inputContent?.trim() || !this.data.currentSessionId
    console.log('🔡 [DEBUG-BUTTON] 按钮是否被禁用:', isButtonDisabled)

    if (isButtonDisabled) {
      if (!this.data.inputContent?.trim()) {
        console.log('❌ [DEBUG-BUTTON] 按钮被禁用原因：输入内容为空')
      }
      if (!this.data.currentSessionId) {
        console.log('❌ [DEBUG-BUTTON] 按钮被禁用原因：会话ID为空')
      }
    } else {
      console.log('✅ [DEBUG-BUTTON] 按钮应该是可用的')
    }

    // 强制更新按钮状态
    this.updateSendButtonState()

    // 强制调用发送消息（绕过按钮禁用）
    console.log('🔡 [DEBUG-BUTTON] 尝试强制调用sendChatMessage')
    this.sendChatMessage()
  },

  // 发送WebSocket消息的独立方法
  sendWebSocketMessage(chatMessage) {
    if (!this.data.wsConnected) {
      console.log('❌ [DEBUG] WebSocket未连接，无法发送')
      return
    }

    try {
      wx.sendSocketMessage({
        data: JSON.stringify(chatMessage),
        success: res => {
          console.log('✅ [DEBUG] WebSocket消息发送成功')
          console.log('🔡 [DEBUG] 发送成功响应:', JSON.stringify(res))
        },
        fail: err => {
          console.error('❌ [DEBUG] WebSocket发送失败')
          console.error('🔡 [DEBUG] 发送失败详情:', JSON.stringify(err))

          // 如果发送失败，尝试重连
          console.log('🔡 [DEBUG] WebSocket发送失败，尝试重连')
          this.connectWebSocket()
        }
      })
    } catch (error) {
      console.error('❌ [DEBUG] WebSocket发送异常', error)
    }
  }

  // =================== 调试功能区域结束 ===================
})
