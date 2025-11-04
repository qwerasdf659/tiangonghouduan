/**
 * 聊天WebSocket服务 - 简化版
 * 功能：实时推送聊天消息
 * 创建时间：2025年10月10日
 * 最后更新：2025年01月21日 - 添加连接限制和日志优化
 *
 * 设计原则：
 * 1. 代码简单易懂 - 新人5分钟上手
 * 2. 维护成本低 - 独立模块，不依赖其他服务
 * 3. 性能优秀 - 支持5000+并发连接
 * 4. 向后兼容 - 不影响现有REST API
 */

// ⚡ 引入统一日志系统（2025年01月21日新增）
const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const wsLogger = Logger.create('WebSocket')
// 🕐 引入北京时间工具（2025年10月12日新增 - 时区统一）
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 聊天WebSocket服务类
 * 职责：管理实时聊天WebSocket连接和消息推送
 * 特点：简单易懂、维护成本低、支持5000+并发连接
 * @class ChatWebSocketService
 */
class ChatWebSocketService {
  /**
   * 构造函数 - 初始化连接管理和限制配置
   * @constructor
   */
  constructor () {
    this.io = null
    this.connectedUsers = new Map() // 存储用户连接 {userId: socketId}
    this.connectedAdmins = new Map() // 存储客服连接 {adminId: socketId}

    // ⚡ 连接数限制配置（2025年01月21日新增）
    this.MAX_TOTAL_CONNECTIONS = 5000 // 最大总连接数
    this.MAX_USER_CONNECTIONS = 4500 // 最大用户连接数
    this.MAX_ADMIN_CONNECTIONS = 500 // 最大客服连接数

    console.log('📦 ChatWebSocketService 实例已创建')
    console.log(`⚙️ 连接限制: 总${this.MAX_TOTAL_CONNECTIONS} | 用户${this.MAX_USER_CONNECTIONS} | 客服${this.MAX_ADMIN_CONNECTIONS}`)
  }

  /**
   * 初始化WebSocket服务
   * @param {Object} server - HTTP服务器实例
   * @returns {void} 无返回值，初始化WebSocket服务并设置事件处理器
   */
  initialize (server) {
    if (!server) {
      throw new Error('服务器实例不能为空')
    }

    const socketIO = require('socket.io')

    // 初始化Socket.IO
    this.io = socketIO(server, {
      cors: {
        origin: '*', // 生产环境建议配置具体域名
        methods: ['GET', 'POST'],
        credentials: true
      },
      path: '/socket.io',
      transports: ['websocket', 'polling'], // 支持WebSocket和轮询
      pingTimeout: 60000, // 60秒心跳超时
      pingInterval: 25000 // 25秒心跳间隔
    })

    this.setupEventHandlers()
    console.log('✅ 聊天WebSocket服务已启动')
    console.log('   路径: /socket.io')
    console.log('   传输: WebSocket + Polling')
  }

  /**
   * 设置事件处理器
   * @returns {void} 无返回值，设置WebSocket连接和消息事件处理器
   */
  setupEventHandlers () {
    this.io.on('connection', (socket) => {
      // ⚡ 连接数检查（2025年01月21日新增）
      const totalConnections = this.connectedUsers.size + this.connectedAdmins.size

      if (totalConnections >= this.MAX_TOTAL_CONNECTIONS) {
        wsLogger.error('连接已满，拒绝新连接', {
          current: totalConnections,
          max: this.MAX_TOTAL_CONNECTIONS,
          socketId: socket.id
        })

        socket.emit('connection_rejected', {
          reason: 'MAX_CONNECTIONS_REACHED',
          message: '服务器连接已满，请稍后重试',
          current: totalConnections,
          max: this.MAX_TOTAL_CONNECTIONS,
          timestamp: BeijingTimeHelper.now()
        })
        socket.disconnect(true)
        return
      }

      console.log(`🔌 客户端连接成功: ${socket.id} (${totalConnections + 1}/${this.MAX_TOTAL_CONNECTIONS})`)

      // 1. 用户注册连接
      socket.on('register_user', (data) => {
        try {
          const { user_id, user_type } = data // user_type: 'user' 或 'admin'

          if (!user_id || !user_type) {
            wsLogger.error('用户注册失败', { reason: '缺少user_id或user_type', socketId: socket.id })
            return
          }

          // ⚡ 用户类型连接数检查（2025年01月21日新增）
          if (user_type === 'user' && this.connectedUsers.size >= this.MAX_USER_CONNECTIONS) {
            wsLogger.error('用户连接已满', {
              current: this.connectedUsers.size,
              max: this.MAX_USER_CONNECTIONS,
              user_id
            })

            socket.emit('register_failed', {
              reason: 'MAX_USER_CONNECTIONS_REACHED',
              message: '用户连接数已满，请稍后重试',
              timestamp: BeijingTimeHelper.now()
            })
            socket.disconnect(true)
            return
          }

          if (user_type === 'admin' && this.connectedAdmins.size >= this.MAX_ADMIN_CONNECTIONS) {
            wsLogger.error('客服连接已满', {
              current: this.connectedAdmins.size,
              max: this.MAX_ADMIN_CONNECTIONS,
              admin_id: user_id
            })

            socket.emit('register_failed', {
              reason: 'MAX_ADMIN_CONNECTIONS_REACHED',
              message: '客服连接数已满，请稍后重试',
              timestamp: BeijingTimeHelper.now()
            })
            socket.disconnect(true)
            return
          }

          if (user_type === 'user') {
            // 如果用户已有连接，先断开旧连接
            const oldSocketId = this.connectedUsers.get(user_id)
            if (oldSocketId && oldSocketId !== socket.id) {
              const oldSocket = this.io.sockets.sockets.get(oldSocketId)
              if (oldSocket) {
                oldSocket.disconnect(true)
                console.log(`🔄 断开用户 ${user_id} 的旧连接`)
              }
            }

            this.connectedUsers.set(user_id, socket.id)
            console.log(`👤 用户 ${user_id} 已连接 (总计: ${this.connectedUsers.size}个用户在线)`)

            // 通知用户连接成功
            socket.emit('register_success', {
              user_id,
              user_type: 'user',
              timestamp: BeijingTimeHelper.now()
            })
          } else if (user_type === 'admin') {
            // 如果客服已有连接，先断开旧连接
            const oldSocketId = this.connectedAdmins.get(user_id)
            if (oldSocketId && oldSocketId !== socket.id) {
              const oldSocket = this.io.sockets.sockets.get(oldSocketId)
              if (oldSocket) {
                oldSocket.disconnect(true)
                console.log(`🔄 断开客服 ${user_id} 的旧连接`)
              }
            }

            this.connectedAdmins.set(user_id, socket.id)
            console.log(`👨‍💼 客服 ${user_id} 已连接 (总计: ${this.connectedAdmins.size}个客服在线)`)

            // 通知客服连接成功
            socket.emit('register_success', {
              user_id,
              user_type: 'admin',
              timestamp: BeijingTimeHelper.now()
            })
          } else {
            console.error(`❌ 未知的用户类型: ${user_type}`)
          }
        } catch (error) {
          console.error('❌ 注册用户时出错:', error.message)
        }
      })

      // 2. 心跳检测（保持连接活跃）
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: BeijingTimeHelper.now() })
      })

      // 3. 断开连接
      socket.on('disconnect', (reason) => {
        console.log(`🔌 客户端断开: ${socket.id}, 原因: ${reason}`)

        // 清理用户连接记录
        for (const [userId, socketId] of this.connectedUsers.entries()) {
          if (socketId === socket.id) {
            this.connectedUsers.delete(userId)
            console.log(`👤 用户 ${userId} 已断开 (剩余: ${this.connectedUsers.size}个用户在线)`)
            break
          }
        }

        // 清理客服连接记录
        for (const [adminId, socketId] of this.connectedAdmins.entries()) {
          if (socketId === socket.id) {
            this.connectedAdmins.delete(adminId)
            console.log(`👨‍💼 客服 ${adminId} 已断开 (剩余: ${this.connectedAdmins.size}个客服在线)`)
            break
          }
        }
      })

      // 4. 错误处理
      socket.on('error', (error) => {
        console.error(`❌ WebSocket错误: ${socket.id}`, error.message)
      })
    })
  }

  /**
   * 推送新消息给指定用户
   * @param {Number} user_id - 接收用户ID
   * @param {Object} message - 消息对象
   * @returns {Boolean} 是否推送成功
   */
  pushMessageToUser (user_id, message) {
    const socketId = this.connectedUsers.get(user_id)
    if (socketId) {
      try {
        this.io.to(socketId).emit('new_message', message)
        console.log(`📤 消息已推送给用户 ${user_id}`)
        return true
      } catch (error) {
        wsLogger.error('推送消息给用户失败', {
          user_id,
          message_id: message.message_id || 'unknown',
          error: error.message,
          timestamp: BeijingTimeHelper.now()
        })
        return false
      }
    }
    console.log(`⚠️ 用户 ${user_id} 不在线，无法推送`)
    return false
  }

  /**
   * 推送新消息给指定客服
   * @param {Number} admin_id - 接收客服ID
   * @param {Object} message - 消息对象
   * @returns {Boolean} 是否推送成功
   */
  pushMessageToAdmin (admin_id, message) {
    const socketId = this.connectedAdmins.get(admin_id)
    if (socketId) {
      try {
        this.io.to(socketId).emit('new_message', message)
        console.log(`📤 消息已推送给客服 ${admin_id}`)
        return true
      } catch (error) {
        wsLogger.error('推送消息给客服失败', {
          admin_id,
          message_id: message.message_id || 'unknown',
          error: error.message,
          timestamp: BeijingTimeHelper.now()
        })
        return false
      }
    }
    console.log(`⚠️ 客服 ${admin_id} 不在线，无法推送`)
    return false
  }

  /**
   * 广播消息给所有在线客服
   * @param {Object} message - 消息对象
   * @returns {Number} 成功推送的客服数量
   */
  broadcastToAllAdmins (message) {
    let successCount = 0

    for (const [admin_id, socketId] of this.connectedAdmins.entries()) {
      try {
        this.io.to(socketId).emit('new_message', message)
        successCount++
      } catch (error) {
        wsLogger.error('广播消息给客服失败', {
          admin_id,
          message_id: message.message_id || 'unknown',
          error: error.message
        })
      }
    }

    console.log(`📢 消息已广播给 ${successCount}/${this.connectedAdmins.size} 个在线客服`)
    return successCount
  }

  /**
   * 获取WebSocket服务状态
   * @returns {Object} 状态信息
   */
  getStatus () {
    return {
      isRunning: this.io !== null,
      connectedUsers: this.connectedUsers.size,
      connectedAdmins: this.connectedAdmins.size,
      totalConnections: this.connectedUsers.size + this.connectedAdmins.size,
      timestamp: BeijingTimeHelper.now()
    }
  }

  /**
   * 获取在线用户列表
   * @returns {Array} 在线用户ID列表
   */
  getOnlineUsers () {
    return Array.from(this.connectedUsers.keys())
  }

  /**
   * 获取在线客服列表
   * @returns {Array} 在线客服ID列表
   */
  getOnlineAdmins () {
    return Array.from(this.connectedAdmins.keys())
  }

  /**
   * 检查用户是否在线
   * @param {Number} user_id - 用户ID
   * @returns {Boolean} 是否在线
   */
  isUserOnline (user_id) {
    return this.connectedUsers.has(user_id)
  }

  /**
   * 检查客服是否在线
   * @param {Number} admin_id - 客服ID
   * @returns {Boolean} 是否在线
   */
  isAdminOnline (admin_id) {
    return this.connectedAdmins.has(admin_id)
  }

  /**
   * 强制断开指定用户的连接
   * @param {Number} user_id - 用户ID
   * @param {String} user_type - 用户类型 'user' 或 'admin'
   * @returns {void} 无返回值，强制断开用户WebSocket连接
   */
  disconnectUser (user_id, user_type = 'user') {
    const map = user_type === 'user' ? this.connectedUsers : this.connectedAdmins
    const socketId = map.get(user_id)

    if (socketId) {
      const socket = this.io.sockets.sockets.get(socketId)
      if (socket) {
        socket.disconnect(true)
        map.delete(user_id)
        console.log(`🔌 已强制断开 ${user_type} ${user_id} 的连接`)
      }
    }
  }
}

// 导出单例
module.exports = new ChatWebSocketService()
