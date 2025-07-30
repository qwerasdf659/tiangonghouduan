/**
 * 餐厅积分抽奖系统 v2.0 - WebSocket实时通信服务
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
    const wsOptions = {
      server,
      path: '/ws',
      clientTracking: true,
      maxPayload: 16 * 1024, // 16KB最大消息大小
      ...options
    }

    this.wss = new WebSocket.Server(wsOptions)

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req)
    })

    this.wss.on('error', error => {
      console.error('❌ WebSocket服务器错误:', error.message)
    })

    // 定期清理断开的连接
    setInterval(() => {
      this.cleanupConnections()
    }, 30000) // 30秒清理一次

    console.log(`✅ WebSocket服务器启动成功，路径: ${wsOptions.path}`)
    return this.wss
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
      const user = await User.findByPk(decoded.userId)

      if (!user) {
        ws.close(1008, 'Invalid user')
        return
      }

      // 设置连接属性
      ws.userId = user.id
      ws.userInfo = {
        id: user.id,
        nickname: user.nickname,
        isAdmin: user.is_admin,
        phone: user.phone
      }
      ws.isAlive = true
      ws.connectedAt = new Date()

      // 存储连接
      this.addConnection(user.id, ws)

      // 发送连接确认消息
      this.sendToConnection(ws, {
        type: 'connection_established',
        data: {
          userId: user.id,
          serverTime: new Date().toISOString(),
          queuedMessages: this.messageQueue.get(user.id)?.length || 0,
          connectionId: this.generateConnectionId(ws)
        }
      })

      // 发送离线消息
      this.sendOfflineMessages(user.id)

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
        console.error(`❌ WebSocket连接错误 (用户${user.id}):`, error.message)
      })

      this.statistics.totalConnections++
      this.statistics.currentConnections++

      console.log(`✅ 用户${user.id}(${user.nickname})建立WebSocket连接`)
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
  }
}

module.exports = WebSocketService
