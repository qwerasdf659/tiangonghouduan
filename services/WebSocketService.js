/**
 * 餐厅积分抽奖系统 v3.0 - WebSocket实时通信服务
 * 实现WebSocket连接管理和消息推送功能
 */

const WebSocket = require('ws')
const jwt = require('jsonwebtoken')
const { User } = require('../models')

class WebSocketService {
  constructor () {
    this.connections = new Map() // 存储用户连接：userId -> Set<WebSocket>
    this.messageQueue = new Map() // 离线消息队列：userId -> Array<Message>
    this.heartbeatInterval = 90000 // 90秒心跳间隔
    this.heartbeatTimeouts = new Map() // 心跳超时管理
    this.statistics = {
      totalConnections: 0,
      currentConnections: 0,
      messagesSent: 0,
      messagesQueued: 0,
      heartbeatsReceived: 0
    }
    this.startTime = Date.now()
  }

  /**
   * 初始化WebSocket服务器
   * @param {Object} server - HTTP服务器实例
   * @param {Object} options - WebSocket配置选项
   */
  initialize (server, options = {}) {
    try {
      const wsOptions = {
        server,
        path: '/ws',
        clientTracking: true,
        maxPayload: 16 * 1024, // 16KB最大消息大小
        perMessageDeflate: false, // 禁用压缩以提高性能
        ...options
      }

      this.wss = new WebSocket.Server(wsOptions)

      this.wss.on('connection', (ws, req) => {
        // 异步处理连接，避免阻塞
        setImmediate(() => {
          this.handleConnection(ws, req)
        })
      })

      this.wss.on('error', error => {
        console.error('❌ WebSocket服务器错误:', error.message)
        // 记录错误但不中断服务
      })

      // 优化：使用更长的清理间隔，减少系统负载
      this.cleanupIntervalId = setInterval(() => {
        this.cleanupConnections()
      }, 60000) // 改为60秒清理一次

      console.log(`✅ WebSocket服务器启动成功，路径: ${wsOptions.path}`)
      return this.wss
    } catch (error) {
      console.error('❌ WebSocket服务器初始化失败:', error.message)
      throw error
    }
  }

  /**
   * 处理新的WebSocket连接
   * @param {WebSocket} ws - WebSocket连接实例
   * @param {Object} req - HTTP请求对象
   */
  async handleConnection (ws, req) {
    try {
      // 从URL参数中获取Token
      const url = new URL(req.url, `http://${req.headers.host}`)
      const token = url.searchParams.get('token')

      if (!token) {
        ws.close(1008, 'Missing authentication token')
        return
      }

      // 验证JWT Token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findByPk(decoded.user_id)

      if (!user) {
        ws.close(1008, 'Invalid user')
        return
      }

      // 设置连接属性
      ws.userId = user.user_id
      ws.userInfo = {
        id: user.user_id,
        nickname: user.nickname,
        isAdmin: user.is_admin,
        mobile: user.mobile
      }
      ws.isAlive = true
      ws.connectedAt = new Date()

      // 存储连接
      this.addConnection(user.user_id, ws)

      // 发送连接确认消息
      this.sendToConnection(ws, {
        type: 'connection_established',
        data: {
          userId: user.user_id,
          serverTime: new Date().toISOString(),
          queuedMessages: this.messageQueue.get(user.user_id)?.length || 0,
          connectionId: this.generateConnectionId(ws)
        }
      })

      // 发送离线消息
      this.sendOfflineMessages(user.user_id)

      // 设置心跳机制
      this.setupHeartbeat(ws)

      // 监听消息
      ws.on('message', data => {
        this.handleMessage(ws, data)
      })

      // 监听连接关闭
      ws.on('close', (code, reason) => {
        this.handleDisconnection(ws, code, reason)
      })

      // 监听连接错误
      ws.on('error', error => {
        console.error(`❌ WebSocket连接错误 (用户${user.user_id}):`, error.message)
      })

      this.statistics.totalConnections++
      this.statistics.currentConnections++

      console.log(`✅ 用户${user.user_id}(${user.nickname})建立WebSocket连接`)
    } catch (error) {
      console.error('❌ WebSocket连接处理失败:', error.message)
      ws.close(1011, 'Internal server error')
    }
  }

  /**
   * 处理收到的消息
   * @param {WebSocket} ws - WebSocket连接
   * @param {Buffer} data - 消息数据
   */
  handleMessage (ws, data) {
    try {
      const message = JSON.parse(data.toString())

      switch (message.type) {
      case 'heartbeat':
        this.handleHeartbeat(ws, message.data)
        break

      case 'subscribe':
        // TODO: 实现订阅功能
        break

      case 'unsubscribe':
        // TODO: 实现取消订阅功能
        break

        // 🔥 新增：聊天客服系统消息处理
      case 'subscribe_session':
      case 'chat_message':
      case 'typing_start':
      case 'typing_stop':
      case 'mark_read':
        this.handleChatMessage(ws, message)
        break

      default:
        console.warn(`⚠️ 未知消息类型: ${message.type}`)
      }
    } catch (error) {
      console.error('❌ 处理WebSocket消息失败:', error.message)
    }
  }

  /**
   * 处理心跳消息
   * @param {WebSocket} ws - WebSocket连接
   * @param {Object} data - 心跳数据
   */
  handleHeartbeat (ws, _data) {
    ws.isAlive = true
    this.statistics.heartbeatsReceived++

    // 清除心跳超时
    const timeoutId = this.heartbeatTimeouts.get(ws)
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    // 发送心跳响应
    this.sendToConnection(ws, {
      type: 'heartbeat_response',
      data: {
        serverTime: new Date().toISOString(),
        connectionStatus: 'active',
        messageQueueCount: this.messageQueue.get(ws.userId)?.length || 0,
        serverLoad: this.getServerLoad()
      }
    })

    // 设置新的心跳超时
    this.setupHeartbeatTimeout(ws)
  }

  /**
   * 设置心跳机制
   * @param {WebSocket} ws - WebSocket连接
   */
  setupHeartbeat (ws) {
    this.setupHeartbeatTimeout(ws)
  }

  /**
   * 设置心跳超时
   * @param {WebSocket} ws - WebSocket连接
   */
  setupHeartbeatTimeout (ws) {
    const timeoutId = setTimeout(() => {
      if (!ws.isAlive) {
        console.log(`⚠️ 用户${ws.userId}心跳超时，关闭连接`)
        ws.terminate()
        return
      }
      ws.isAlive = false
    }, this.heartbeatInterval + 3000) // 心跳间隔 + 3秒容错

    this.heartbeatTimeouts.set(ws, timeoutId)
  }

  /**
   * 处理连接断开
   * @param {WebSocket} ws - WebSocket连接
   * @param {number} code - 关闭代码
   * @param {string} reason - 关闭原因
   */
  handleDisconnection (ws, code, reason) {
    if (ws.userId) {
      this.removeConnection(ws.userId, ws)
      console.log(`🔌 用户${ws.userId}断开WebSocket连接，代码:${code}，原因:${reason}`)
    }

    // 清理心跳超时
    const timeoutId = this.heartbeatTimeouts.get(ws)
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.heartbeatTimeouts.delete(ws)
    }

    this.statistics.currentConnections--
  }

  /**
   * 添加用户连接
   * @param {number} userId - 用户ID
   * @param {WebSocket} ws - WebSocket连接
   */
  addConnection (userId, ws) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set())
    }
    this.connections.get(userId).add(ws)
  }

  /**
   * 移除用户连接
   * @param {number} userId - 用户ID
   * @param {WebSocket} ws - WebSocket连接
   */
  removeConnection (userId, ws) {
    const userConnections = this.connections.get(userId)
    if (userConnections) {
      userConnections.delete(ws)
      if (userConnections.size === 0) {
        this.connections.delete(userId)
      }
    }
  }

  /**
   * 向特定用户发送消息
   * @param {number} userId - 用户ID
   * @param {Object} message - 消息对象
   * @returns {boolean} 是否发送成功
   */
  sendToUser (userId, message) {
    const userConnections = this.connections.get(userId)

    if (!userConnections || userConnections.size === 0) {
      // 用户不在线，添加到离线消息队列
      this.addToOfflineQueue(userId, message)
      return false
    }

    let sent = false
    for (const ws of userConnections) {
      if (this.sendToConnection(ws, message)) {
        sent = true
      }
    }

    return sent
  }

  /**
   * 向特定连接发送消息
   * @param {WebSocket} ws - WebSocket连接
   * @param {Object} message - 消息对象
   * @returns {boolean} 是否发送成功
   */
  sendToConnection (ws, message) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            ...message,
            timestamp: new Date().toISOString(),
            messageId: this.generateMessageId()
          })
        )
        this.statistics.messagesSent++
        return true
      }
    } catch (error) {
      console.error('❌ 发送WebSocket消息失败:', error.message)
    }
    return false
  }

  /**
   * 广播消息给所有在线用户
   * @param {Object} message - 消息对象
   * @param {Function} filter - 过滤函数（可选）
   * @returns {Object} 发送统计
   */
  broadcast (message, filter = null) {
    let successCount = 0
    let failedCount = 0

    for (const [userId, userConnections] of this.connections) {
      if (filter && !filter(userId)) {
        continue
      }

      for (const ws of userConnections) {
        if (this.sendToConnection(ws, message)) {
          successCount++
        } else {
          failedCount++
        }
      }
    }

    return {
      total: successCount + failedCount,
      success: successCount,
      failed: failedCount
    }
  }

  /**
   * 向管理员广播消息
   * @param {Object} message - 消息对象
   * @returns {Object} 发送统计
   */
  broadcastToAdmins (message) {
    return this.broadcast(message, userId => {
      const userConnections = this.connections.get(userId)
      if (userConnections) {
        for (const ws of userConnections) {
          if (ws.userInfo?.isAdmin) {
            return true
          }
        }
      }
      return false
    })
  }

  /**
   * 添加离线消息到队列
   * @param {number} userId - 用户ID
   * @param {Object} message - 消息对象
   */
  addToOfflineQueue (userId, message) {
    if (!this.messageQueue.has(userId)) {
      this.messageQueue.set(userId, [])
    }

    const userQueue = this.messageQueue.get(userId)
    userQueue.push({
      ...message,
      queuedAt: new Date().toISOString(),
      messageId: this.generateMessageId()
    })

    // 限制队列长度，防止内存泄漏
    if (userQueue.length > 100) {
      userQueue.shift() // 移除最旧的消息
    }

    this.statistics.messagesQueued++
  }

  /**
   * 发送离线消息
   * @param {number} userId - 用户ID
   * @returns {number} 发送的消息数量
   */
  sendOfflineMessages (userId) {
    const userQueue = this.messageQueue.get(userId)
    if (!userQueue || userQueue.length === 0) {
      return 0
    }

    let sentCount = 0
    const messages = [...userQueue] // 复制数组避免修改原数组时的问题

    for (const message of messages) {
      if (this.sendToUser(userId, message)) {
        sentCount++
      }
    }

    // 清空队列
    this.messageQueue.set(userId, [])

    if (sentCount > 0) {
      console.log(`📨 向用户${userId}发送${sentCount}条离线消息`)
    }

    return sentCount
  }

  /**
   * 清理断开的连接
   */
  cleanupConnections () {
    let cleanedCount = 0

    for (const [userId, userConnections] of this.connections) {
      const validConnections = new Set()

      for (const ws of userConnections) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          validConnections.add(ws)
        } else {
          cleanedCount++
        }
      }

      if (validConnections.size > 0) {
        this.connections.set(userId, validConnections)
      } else {
        this.connections.delete(userId)
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 清理了${cleanedCount}个断开的WebSocket连接`)
      this.statistics.currentConnections = this.getCurrentConnectionCount()
    }
  }

  /**
   * 获取当前连接数
   * @returns {number} 当前连接数
   */
  getCurrentConnectionCount () {
    let count = 0
    for (const userConnections of this.connections.values()) {
      count += userConnections.size
    }
    return count
  }

  /**
   * 获取在线用户数
   * @returns {number} 在线用户数
   */
  getOnlineUserCount () {
    return this.connections.size
  }

  /**
   * 获取服务器负载状态
   * @returns {string} 负载状态
   */
  getServerLoad () {
    const connectionCount = this.getCurrentConnectionCount()

    if (connectionCount < 100) return 'low'
    if (connectionCount < 500) return 'normal'
    if (connectionCount < 1000) return 'high'
    return 'critical'
  }

  /**
   * 获取服务状态
   * @returns {Object} 服务状态信息
   */
  getStatus () {
    return {
      status: 'running',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      connections: {
        current: this.getCurrentConnectionCount(),
        users: this.getOnlineUserCount(),
        total: this.statistics.totalConnections
      },
      messages: {
        sent: this.statistics.messagesSent,
        queued: this.statistics.messagesQueued,
        queueSize: Array.from(this.messageQueue.values()).reduce(
          (sum, queue) => sum + queue.length,
          0
        )
      },
      heartbeats: this.statistics.heartbeatsReceived,
      serverLoad: this.getServerLoad(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    }
  }

  /**
   * 生成连接ID
   * @param {WebSocket} ws - WebSocket连接
   * @returns {string} 连接ID
   */
  generateConnectionId (ws) {
    return `conn_${ws.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 生成消息ID
   * @returns {string} 消息ID
   */
  generateMessageId () {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 聊天功能扩展 - 通知管理员有新会话
   * @param {Object} session - 会话信息
   */
  notifyNewSession (session) {
    const message = {
      type: 'new_session',
      data: {
        sessionId: session.session_id,
        userId: session.user_id,
        userInfo: session.user
          ? {
            userId: session.user.user_id,
            nickname: session.user.nickname,
            avatar: session.user.avatar_url,
            mobile: session.user.mobile
          }
          : null,
        priority: session.priority,
        source: session.source,
        createdAt: session.created_at
      }
    }

    return this.broadcastToAdmins(message)
  }

  /**
   * 通知会话关闭
   * @param {Object} session - 会话信息
   */
  notifySessionClosed (session) {
    const message = {
      type: 'session_closed',
      data: {
        sessionId: session.session_id,
        userId: session.user_id,
        adminId: session.admin_id,
        status: session.status,
        closedAt: session.closed_at || new Date().toISOString(),
        satisfactionScore: session.satisfaction_score
      }
    }

    // 通知用户会话已关闭
    this.sendToUser(session.user_id, message)

    // 通知分配的管理员会话已关闭
    if (session.admin_id) {
      this.sendToUser(session.admin_id, message)
    }

    return true
  }

  /**
   * 发送聊天消息给指定会话的所有参与者
   * @param {string} sessionId - 会话ID
   * @param {Object} message - 消息信息
   * @param {number} excludeUserId - 排除的用户ID（通常是发送者）
   */
  sendChatMessage (sessionId, message, excludeUserId = null) {
    const chatMessage = {
      type: 'new_message',
      data: {
        sessionId,
        messageId: message.message_id,
        senderId: message.sender_id,
        senderType: message.sender_type,
        content: message.content,
        messageType: message.message_type,
        createdAt: message.created_at,
        metadata: message.metadata
      }
    }

    // 发送给参与会话的用户（如果不是发送者）
    if (message.sender_type === 'admin' || excludeUserId !== message.sender_id) {
      // TODO: 根据session获取用户ID列表
      // 这里简化处理，实际需要根据session获取参与用户
      this.sendToUser(message.sender_id, chatMessage)
    }

    return true
  }

  /**
   * 发送用户输入状态给管理员
   * @param {string} sessionId - 会话ID
   * @param {number} userId - 用户ID
   * @param {boolean} isTyping - 是否正在输入
   */
  sendTypingStatus (sessionId, userId, isTyping) {
    const message = {
      type: 'user_typing',
      data: {
        sessionId,
        userId,
        typing: isTyping
      }
    }

    this.broadcastToAdmins(message)
  }

  /**
   * 发送管理员输入状态给用户
   * @param {string} sessionId - 会话ID
   * @param {number} adminId - 管理员ID
   * @param {boolean} isTyping - 是否正在输入
   * @param {number} targetUserId - 目标用户ID
   */
  sendAdminTypingStatus (sessionId, adminId, isTyping, targetUserId) {
    const message = {
      type: 'admin_typing',
      data: {
        sessionId,
        adminId,
        typing: isTyping,
        adminName: '客服' // TODO: 获取管理员昵称
      }
    }

    this.sendToUser(targetUserId, message)
  }

  /**
   * 通知会话状态变更
   * @param {Object} session - 会话信息
   * @param {string} oldStatus - 旧状态
   */
  notifySessionStatusChange (session, oldStatus) {
    const message = {
      type: 'session_status',
      data: {
        sessionId: session.session_id,
        status: session.status,
        oldStatus,
        adminInfo: session.admin
          ? {
            adminId: session.admin.user_id,
            name: session.admin.nickname,
            avatar: session.admin.avatar_url
          }
          : null
      }
    }

    // 通知用户
    this.sendToUser(session.user_id, message)

    // 通知管理员
    if (session.admin_id) {
      this.sendToUser(session.admin_id, message)
    }
  }

  /**
   * 处理聊天相关的WebSocket消息
   * @param {WebSocket} ws - WebSocket连接
   * @param {Object} message - 消息对象
   */
  async handleChatMessage (ws, message) {
    try {
      switch (message.type) {
      case 'subscribe_session':
        // 订阅会话消息
        this.subscribeToSession(ws, message.data.sessionId)
        break

      case 'chat_message':
        // 转发聊天消息
        await this.forwardChatMessage(ws, message.data)
        break

      case 'typing_start':
      case 'typing_stop':
        // 处理输入状态
        await this.handleTyping(ws, message.type, message.data)
        break

      case 'mark_read':
        // 标记消息已读
        await this.handleMarkRead(ws, message.data)
        break

      default:
        console.warn(`⚠️ 未知聊天消息类型: ${message.type}`)
      }
    } catch (error) {
      console.error('❌ 处理聊天WebSocket消息失败:', error.message)
    }
  }

  /**
   * 订阅会话消息
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} sessionId - 会话ID
   */
  subscribeToSession (ws, sessionId) {
    if (!ws.subscribedSessions) {
      ws.subscribedSessions = new Set()
    }
    ws.subscribedSessions.add(sessionId)

    this.sendToConnection(ws, {
      type: 'session_subscribed',
      data: { sessionId }
    })
  }

  /**
   * 转发聊天消息
   * @param {WebSocket} ws - 发送者WebSocket连接
   * @param {Object} data - 消息数据
   */
  async forwardChatMessage (ws, data) {
    try {
      const { sessionId, content, messageType = 'text', tempMessageId } = data

      if (!sessionId || !content) {
        console.warn('⚠️ 聊天消息数据不完整:', data)
        return
      }

      // 获取会话信息
      const { CustomerSession, ChatMessage, User } = require('../models')
      const session = await CustomerSession.findOne({
        where: { session_id: sessionId },
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'avatar_url'] },
          { model: User, as: 'admin', attributes: ['user_id', 'nickname', 'avatar_url'] }
        ]
      })

      if (!session) {
        console.warn('⚠️ 会话不存在:', sessionId)
        this.sendToConnection(ws, {
          type: 'error',
          data: { message: '会话不存在', tempMessageId }
        })
        return
      }

      // 验证用户权限（用户只能在自己的会话中发消息，管理员只能在分配的会话中发消息）
      const isUser = session.user_id === ws.userId
      const isAssignedAdmin = session.admin_id === ws.userId && ws.userInfo?.isAdmin

      if (!isUser && !isAssignedAdmin) {
        console.warn('⚠️ 用户无权限访问会话:', { sessionId, userId: ws.userId })
        this.sendToConnection(ws, {
          type: 'error',
          data: { message: '无权限访问此会话', tempMessageId }
        })
        return
      }

      // 创建消息记录
      const messageId = `msg_${Date.now()}_${require('uuid').v4().substr(0, 8)}`
      const senderType = ws.userInfo?.isAdmin ? 'admin' : 'user'

      const message = await ChatMessage.create({
        message_id: messageId,
        session_id: sessionId,
        sender_id: ws.userId,
        sender_type: senderType,
        content,
        message_type: messageType,
        temp_message_id: tempMessageId,
        status: 'sent'
      })

      // 更新会话最后消息时间
      await session.update({
        last_message_at: new Date(),
        status: session.status === 'waiting' ? 'active' : session.status
      })

      // 构建转发消息
      const forwardMessage = {
        type: 'new_message',
        data: {
          sessionId,
          messageId: message.message_id,
          senderId: ws.userId,
          senderType,
          content,
          messageType,
          tempMessageId,
          createdAt: message.created_at,
          sender: {
            userId: ws.userId,
            nickname: ws.userInfo?.nickname,
            isAdmin: ws.userInfo?.isAdmin
          }
        }
      }

      // 发送确认消息给发送者
      this.sendToConnection(ws, {
        type: 'message_sent',
        data: {
          messageId: message.message_id,
          tempMessageId,
          status: 'sent',
          createdAt: message.created_at
        }
      })

      // 转发消息给会话中的其他参与者
      let forwarded = false

      // 如果发送者是用户，转发给分配的管理员
      if (senderType === 'user' && session.admin_id) {
        if (this.sendToUser(session.admin_id, forwardMessage)) {
          forwarded = true
        }
      } else if (senderType === 'admin' && session.user_id) {
        // 如果发送者是管理员，转发给用户
        if (this.sendToUser(session.user_id, forwardMessage)) {
          forwarded = true
        }
      }

      if (forwarded) {
        console.log(
          `📨 聊天消息转发成功: ${sessionId} - ${senderType} -> ${content.substring(0, 50)}...`
        )
      } else {
        console.log(`📨 聊天消息已发送，但接收者不在线: ${sessionId}`)
      }
    } catch (error) {
      console.error('❌ 转发聊天消息失败:', error.message)
      this.sendToConnection(ws, {
        type: 'error',
        data: {
          message: '发送消息失败',
          tempMessageId: data.tempMessageId,
          error: error.message
        }
      })
    }
  }

  /**
   * 处理输入状态
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} type - 消息类型 (typing_start/typing_stop)
   * @param {Object} data - 消息数据
   */
  async handleTyping (ws, type, data) {
    try {
      const { sessionId } = data
      const isTyping = type === 'typing_start'

      if (!sessionId) {
        console.warn('⚠️ 输入状态消息缺少sessionId:', data)
        return
      }

      // 获取会话信息
      const { CustomerSession } = require('../models')
      const session = await CustomerSession.findOne({
        where: { session_id: sessionId }
      })

      if (!session) {
        console.warn('⚠️ 会话不存在:', sessionId)
        return
      }

      // 验证用户权限
      const isUser = session.user_id === ws.userId
      const isAssignedAdmin = session.admin_id === ws.userId && ws.userInfo?.isAdmin

      if (!isUser && !isAssignedAdmin) {
        console.warn('⚠️ 用户无权限访问会话:', { sessionId, userId: ws.userId })
        return
      }

      // 构建输入状态消息
      const typingMessage = {
        type: 'user_typing',
        data: {
          sessionId,
          userId: ws.userId,
          typing: isTyping,
          senderType: ws.userInfo?.isAdmin ? 'admin' : 'user',
          timestamp: new Date().toISOString()
        }
      }

      // 转发输入状态给会话中的其他参与者
      const senderType = ws.userInfo?.isAdmin ? 'admin' : 'user'
      let forwarded = false

      // 如果发送者是用户，转发给分配的管理员
      if (senderType === 'user' && session.admin_id) {
        if (this.sendToUser(session.admin_id, typingMessage)) {
          forwarded = true
        }
      } else if (senderType === 'admin' && session.user_id) {
        // 如果发送者是管理员，转发给用户
        if (this.sendToUser(session.user_id, typingMessage)) {
          forwarded = true
        }
      }

      if (forwarded) {
        console.log(
          `⌨️ 输入状态转发: 用户${ws.userId} ${isTyping ? '开始' : '停止'}输入 - 会话${sessionId}`
        )
      }
    } catch (error) {
      console.error('❌ 处理输入状态失败:', error.message)
    }
  }

  /**
   * 处理消息已读标记
   * @param {WebSocket} ws - WebSocket连接
   * @param {Object} data - 消息数据
   */
  async handleMarkRead (ws, data) {
    try {
      const { sessionId, messageId, allMessages = false } = data

      if (!sessionId) {
        console.warn('⚠️ 已读标记消息缺少sessionId:', data)
        return
      }

      // 获取会话信息
      const { CustomerSession, ChatMessage } = require('../models')
      const session = await CustomerSession.findOne({
        where: { session_id: sessionId }
      })

      if (!session) {
        console.warn('⚠️ 会话不存在:', sessionId)
        return
      }

      // 验证用户权限
      const isUser = session.user_id === ws.userId
      const isAssignedAdmin = session.admin_id === ws.userId && ws.userInfo?.isAdmin

      if (!isUser && !isAssignedAdmin) {
        console.warn('⚠️ 用户无权限访问会话:', { sessionId, userId: ws.userId })
        return
      }

      const receiverType = ws.userInfo?.isAdmin ? 'admin' : 'user'
      const senderTypeToMarkRead = receiverType === 'admin' ? 'user' : 'admin'

      let updatedCount = 0

      if (allMessages) {
        // 标记会话中所有未读消息为已读
        const [affected] = await ChatMessage.update(
          { status: 'read' },
          {
            where: {
              session_id: sessionId,
              sender_type: senderTypeToMarkRead, // 只标记对方发送的消息
              status: ['sent', 'delivered']
            }
          }
        )
        updatedCount = affected
      } else if (messageId) {
        // 标记特定消息为已读
        const [affected] = await ChatMessage.update(
          { status: 'read' },
          {
            where: {
              message_id: messageId,
              session_id: sessionId,
              sender_type: senderTypeToMarkRead,
              status: ['sent', 'delivered']
            }
          }
        )
        updatedCount = affected
      }

      if (updatedCount > 0) {
        // 通知发送者消息已被阅读
        const readNotification = {
          type: 'message_read',
          data: {
            sessionId,
            messageId: allMessages ? null : messageId,
            allMessages,
            readById: ws.userId,
            readByType: receiverType,
            readAt: new Date().toISOString(),
            updatedCount
          }
        }

        // 通知会话中的其他参与者
        let notified = false

        if (receiverType === 'user' && session.admin_id) {
          // 用户读了管理员的消息，通知管理员
          if (this.sendToUser(session.admin_id, readNotification)) {
            notified = true
          }
        } else if (receiverType === 'admin' && session.user_id) {
          // 管理员读了用户的消息，通知用户
          if (this.sendToUser(session.user_id, readNotification)) {
            notified = true
          }
        }

        console.log(
          `👀 消息已读标记完成: 用户${ws.userId} 标记了${updatedCount}条消息 - 会话${sessionId}`
        )

        if (notified) {
          console.log(`📬 已读通知已发送: 会话${sessionId}`)
        }
      }
    } catch (error) {
      console.error('❌ 处理消息已读标记失败:', error.message)
    }
  }

  /**
   * 关闭WebSocket服务
   */
  close () {
    if (this.wss) {
      // 关闭所有连接
      this.wss.clients.forEach(ws => {
        ws.close(1001, 'Server shutting down')
      })

      // 关闭服务器
      this.wss.close(() => {
        console.log('🔌 WebSocket服务器已关闭')
      })
    }

    // 清理定时器
    for (const timeoutId of this.heartbeatTimeouts.values()) {
      clearTimeout(timeoutId)
    }
    this.heartbeatTimeouts.clear()

    // 清理清理间隔定时器
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
    }
  }
}

module.exports = WebSocketService
