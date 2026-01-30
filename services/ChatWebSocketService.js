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

/**
 * ⚡ 引入统一日志系统（2025年01月21日新增）
 * 🕐 引入北京时间工具（2025年10月12日新增 - 时区统一）
 */
const wsLogger = require('../utils/logger').logger
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
  constructor() {
    this.io = null
    this.connectedUsers = new Map() // 存储用户连接 {userId: socketId}
    this.connectedAdmins = new Map() // 存储客服连接 {adminId: socketId}

    // ⚡ 连接数限制配置（2025年01月21日新增）
    this.MAX_TOTAL_CONNECTIONS = 5000 // 最大总连接数
    this.MAX_USER_CONNECTIONS = 4500 // 最大用户连接数
    this.MAX_ADMIN_CONNECTIONS = 500 // 最大客服连接数

    /*
     * ⚡ 服务启动日志ID（2025年11月08日新增 - 用于记录uptime运行时长）
     * 说明：记录当前服务启动日志的ID，用于停止时更新记录
     * 用途：提供uptime字段，用于服务稳定性监控和重启记录
     */
    this.currentStartupLogId = null // 当前启动日志ID（数据库记录）

    wsLogger.info('📦 ChatWebSocketService 实例已创建')
    wsLogger.info(
      `⚙️ 连接限制: 总${this.MAX_TOTAL_CONNECTIONS} | 用户${this.MAX_USER_CONNECTIONS} | 客服${this.MAX_ADMIN_CONNECTIONS}`
    )
  }

  /**
   * 初始化WebSocket服务
   * @param {Object} server - HTTP服务器实例
   * @returns {Promise<void>} 无返回值，初始化WebSocket服务并设置事件处理器
   */
  async initialize(server) {
    if (!server) {
      throw new Error('服务器实例不能为空')
    }

    const socketIO = require('socket.io')

    // 初始化Socket.IO
    this.io = socketIO(server, {
      cors: {
        origin: (origin, callback) => {
          // CORS白名单配置（P0安全修复）
          const allowedOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : ['http://localhost:3000', 'http://localhost:8080']

          // 微信小程序场景：无origin或servicewechat.com
          if (!origin || origin.includes('servicewechat.com') || origin.includes('weixin.qq.com')) {
            return callback(null, true)
          }

          // 白名单检查
          if (allowedOrigins.includes(origin)) {
            return callback(null, true)
          }

          wsLogger.warn('WebSocket连接被CORS拒绝', { origin })
          callback(new Error('Not allowed by CORS'))
        },
        methods: ['GET', 'POST'],
        credentials: true
      },
      path: '/socket.io',
      transports: ['websocket', 'polling'], // 支持WebSocket和轮询
      pingTimeout: 60000, // 60秒心跳超时
      pingInterval: 25000 // 25秒心跳间隔
    })

    /*
     * ⚡ 记录服务启动事件到数据库（2025年11月08日新增）
     * 说明：记录服务启动时间、服务器信息，用于uptime计算和服务监控
     * 用途：提供服务运行时长、重启历史、SLA统计
     */
    try {
      const { WebSocketStartupLog } = require('../models')

      const startupLog = await WebSocketStartupLog.recordStartup({
        ip: this.getServerIP(),
        hostname: require('os').hostname()
      })

      this.currentStartupLogId = startupLog.log_id

      wsLogger.info('WebSocket服务启动记录已保存', {
        logId: this.currentStartupLogId,
        startTime: startupLog.start_time,
        serverIP: startupLog.server_ip,
        hostname: startupLog.server_hostname
      })
    } catch (error) {
      wsLogger.error('保存启动记录失败', { error: error.message })
    }

    // 🔐 强制握手JWT鉴权（P0安全修复 - 2025年12月18日）
    const jwt = require('jsonwebtoken')
    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token

      if (!token) {
        wsLogger.warn('WebSocket握手失败：缺少token', {
          socket_id: socket.id,
          ip: socket.handshake.address
        })
        return next(new Error('Authentication required: missing token'))
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        socket.user = decoded // 将用户信息挂载到socket

        wsLogger.info('WebSocket握手鉴权成功', {
          user_id: decoded.user_id,
          role: decoded.role,
          role_level: decoded.role_level,
          socket_id: socket.id
        })

        next()
      } catch (error) {
        wsLogger.warn('WebSocket握手失败：token无效', {
          error: error.message,
          socket_id: socket.id
        })
        next(new Error('Authentication failed: invalid token'))
      }
    })

    this.setupEventHandlers()

    const startTimeStr = BeijingTimeHelper.now()
    wsLogger.info('✅ 聊天WebSocket服务已启动')
    wsLogger.info(`   启动时间: ${startTimeStr}`)
    wsLogger.info('   路径: /socket.io')
    wsLogger.info('   传输: WebSocket + Polling')
  }

  /**
   * 设置事件处理器
   * @returns {void} 无返回值，设置WebSocket连接和消息事件处理器
   */
  setupEventHandlers() {
    this.io.on('connection', socket => {
      // 从 JWT 自动注册用户身份，使用 role_level >= 100 判断管理员
      const userId = socket.user.user_id
      const isAdmin = socket.user.role_level >= 100

      if (isAdmin) {
        this.connectedAdmins.set(userId, socket.id)
        wsLogger.info('管理员已连接', { user_id: userId, socket_id: socket.id })
      } else {
        this.connectedUsers.set(userId, socket.id)
        wsLogger.info('用户已连接', { user_id: userId, socket_id: socket.id })
      }

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

      wsLogger.info(
        `🔌 客户端连接成功: ${socket.id} (${totalConnections + 1}/${this.MAX_TOTAL_CONNECTIONS})`
      )

      // 1. 用户注册连接

      // ⚠️ register_user已降级为能力声明（不可决定身份）
      socket.on('register_user', data => {
        /*
         * ❌ 禁止：决定身份、写入 connectedAdmins/connectedUsers
         * ✅ 允许：声明订阅偏好、加入房间等
         */
        const { preferences, rooms } = data

        if (preferences) {
          socket.preferences = preferences
        }

        if (rooms) {
          rooms.forEach(room => socket.join(room))
        }

        wsLogger.info('用户订阅偏好已更新', {
          user_id: socket.user.user_id,
          preferences,
          rooms
        })
      })

      // 2. 心跳检测（保持连接活跃）
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: BeijingTimeHelper.now() })
      })

      // 2.5 会话恢复请求（Task 7.3 - 2026-01-28新增）
      socket.on('reconnect_session', async data => {
        try {
          const result = await this.handleReconnection(socket, data)
          wsLogger.info('会话恢复请求处理完成', {
            user_id: socket.user?.user_id,
            success: result.success,
            offline_messages_count: result.offline_messages_count
          })
        } catch (error) {
          wsLogger.error('会话恢复请求处理失败', {
            user_id: socket.user?.user_id,
            error: error.message
          })
          socket.emit('session_restore_error', {
            error: 'SESSION_RESTORE_FAILED',
            message: error.message,
            timestamp: BeijingTimeHelper.now()
          })
        }
      })

      // 3. 断开连接
      socket.on('disconnect', reason => {
        wsLogger.info(`🔌 客户端断开: ${socket.id}, 原因: ${reason}`)

        // 清理用户连接记录
        for (const [userId, socketId] of this.connectedUsers.entries()) {
          if (socketId === socket.id) {
            this.connectedUsers.delete(userId)
            wsLogger.info(`👤 用户 ${userId} 已断开 (剩余: ${this.connectedUsers.size}个用户在线)`)
            break
          }
        }

        // 清理客服连接记录
        for (const [adminId, socketId] of this.connectedAdmins.entries()) {
          if (socketId === socket.id) {
            this.connectedAdmins.delete(adminId)
            wsLogger.info(
              `👨‍💼 客服 ${adminId} 已断开 (剩余: ${this.connectedAdmins.size}个客服在线)`
            )
            break
          }
        }
      })

      // 4. 错误处理
      socket.on('error', error => {
        wsLogger.error(`❌ WebSocket错误: ${socket.id}`, error.message)
      })
    })
  }

  /**
   * 推送新消息给指定用户
   * @param {Number} user_id - 接收用户ID
   * @param {Object} message - 消息对象
   * @returns {Boolean} 是否推送成功
   */
  pushMessageToUser(user_id, message) {
    const socketId = this.connectedUsers.get(user_id)
    if (socketId) {
      try {
        this.io.to(socketId).emit('new_message', message)
        wsLogger.info(`📤 消息已推送给用户 ${user_id}`)
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
    wsLogger.info(`⚠️ 用户 ${user_id} 不在线，无法推送`)
    return false
  }

  /**
   * 推送新消息给指定客服
   * @param {Number} admin_id - 接收客服ID
   * @param {Object} message - 消息对象
   * @returns {Boolean} 是否推送成功
   */
  pushMessageToAdmin(admin_id, message) {
    const socketId = this.connectedAdmins.get(admin_id)
    if (socketId) {
      try {
        this.io.to(socketId).emit('new_message', message)
        wsLogger.info(`📤 消息已推送给客服 ${admin_id}`)
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
    wsLogger.info(`⚠️ 客服 ${admin_id} 不在线，无法推送`)
    return false
  }

  /**
   * 广播消息给所有在线客服
   * @param {Object} message - 消息对象
   * @returns {Number} 成功推送的客服数量
   */
  broadcastToAllAdmins(message) {
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

    wsLogger.info(`📢 消息已广播给 ${successCount}/${this.connectedAdmins.size} 个在线客服`)
    return successCount
  }

  /**
   * 推送通知给指定管理员（专用于系统通知）
   * @param {Number} admin_id - 接收管理员ID
   * @param {Object} notification - 通知对象
   * @returns {Boolean} 是否推送成功
   */
  pushNotificationToAdmin(admin_id, notification) {
    const socketId = this.connectedAdmins.get(admin_id)
    if (socketId) {
      try {
        this.io.to(socketId).emit('notification', notification)
        wsLogger.info(`🔔 通知已推送给管理员 ${admin_id}`)
        return true
      } catch (error) {
        wsLogger.error('推送通知给管理员失败', {
          admin_id,
          notification_id: notification.notification_id || 'unknown',
          error: error.message,
          timestamp: BeijingTimeHelper.now()
        })
        return false
      }
    }
    wsLogger.info(`⚠️ 管理员 ${admin_id} 不在线，无法推送通知`)
    return false
  }

  /**
   * 广播通知给所有在线管理员（专用于系统通知）
   * @param {Object} notification - 通知对象
   * @returns {Number} 成功推送的管理员数量
   */
  broadcastNotificationToAllAdmins(notification) {
    let successCount = 0

    for (const [admin_id, socketId] of this.connectedAdmins.entries()) {
      try {
        this.io.to(socketId).emit('notification', notification)
        successCount++
      } catch (error) {
        wsLogger.error('广播通知给管理员失败', {
          admin_id,
          notification_id: notification.notification_id || 'unknown',
          error: error.message
        })
      }
    }

    wsLogger.info(`📢 通知已广播给 ${successCount}/${this.connectedAdmins.size} 个在线管理员`)
    return successCount
  }

  /**
   * 推送告警到所有在线管理员（P1修复 - 2026-01-30）
   *
   * 专用于系统告警推送，支持静默窗口控制
   *
   * @param {Object} alert - 告警对象
   * @param {number} alert.alert_id - 告警ID
   * @param {string} alert.alert_type - 告警类型（win_rate/budget/inventory/user/system）
   * @param {string} alert.severity - 严重程度（info/warning/danger）
   * @param {string} alert.message - 告警消息
   * @param {number} [alert.campaign_id] - 关联活动ID
   * @param {string} [alert.rule_code] - 规则代码
   * @param {Date|string} [alert.created_at] - 创建时间
   * @returns {number} 成功推送的管理员数量
   *
   * @example
   * // 推送告警示例
   * chatWebSocketService.pushAlertToAdmins({
   *   alert_id: 123,
   *   alert_type: 'inventory',
   *   severity: 'danger',
   *   message: '奖品"iPhone 15"库存不足，剩余5件',
   *   campaign_id: 1,
   *   rule_code: 'RULE_005'
   * })
   */
  pushAlertToAdmins(alert) {
    let successCount = 0

    // 构建告警推送数据
    const alertData = {
      alert_id: alert.alert_id,
      alert_type: alert.alert_type,
      severity: alert.severity,
      message: alert.message,
      campaign_id: alert.campaign_id || null,
      rule_code: alert.rule_code || null,
      created_at: alert.created_at || BeijingTimeHelper.now(),
      timestamp: BeijingTimeHelper.now()
    }

    // 遍历所有在线管理员推送
    for (const [admin_id, socketId] of this.connectedAdmins.entries()) {
      try {
        this.io.to(socketId).emit('new_alert', alertData)
        successCount++
      } catch (error) {
        wsLogger.error('推送告警给管理员失败', {
          admin_id,
          alert_id: alert.alert_id,
          error: error.message
        })
      }
    }

    wsLogger.info(`🚨 告警已推送给 ${successCount}/${this.connectedAdmins.size} 个在线管理员`, {
      alert_id: alert.alert_id,
      alert_type: alert.alert_type,
      severity: alert.severity
    })

    return successCount
  }

  /**
   * 推送未确认告警列表给新登录的管理员
   *
   * 管理员登录时调用，推送所有未处理的活跃告警
   *
   * @param {number} admin_id - 管理员ID
   * @returns {Promise<number>} 推送的告警数量
   */
  async pushPendingAlertsToAdmin(admin_id) {
    const socketId = this.connectedAdmins.get(admin_id)
    if (!socketId) {
      wsLogger.info(`⚠️ 管理员 ${admin_id} 不在线，无法推送待处理告警`)
      return 0
    }

    try {
      // 动态引入避免循环依赖
      const LotteryAlertService = require('./LotteryAlertService')

      // 获取所有活跃告警
      const result = await LotteryAlertService.getAlertList({
        status: 'active',
        page: 1,
        page_size: 100 // 最多推送100条
      })

      if (result.alerts && result.alerts.length > 0) {
        this.io.to(socketId).emit('pending_alerts', {
          alerts: result.alerts,
          total: result.total,
          timestamp: BeijingTimeHelper.now()
        })

        wsLogger.info(`📋 已推送 ${result.alerts.length} 条待处理告警给管理员 ${admin_id}`)
        return result.alerts.length
      }

      return 0
    } catch (error) {
      wsLogger.error('推送待处理告警失败', {
        admin_id,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 获取WebSocket服务状态（异步方法 - 从数据库查询uptime）
   *
   * @returns {Promise<Object>} 状态信息对象（符合API文档规范）
   * @property {string} status - 服务运行状态（"running"运行中 / "stopped"已停止）
   * @property {number} connections - 当前总连接数（用户+客服）
   * @property {number} uptime - 服务运行时长（小时数，保留2位小数）
   * @property {number} connected_users - 在线用户数
   * @property {number} connected_admins - 在线客服数
   * @property {string} timestamp - 查询时间戳（北京时间，格式：YYYY-MM-DD HH:mm:ss）
   *
   * @description
   * 功能：获取WebSocket服务实时状态信息
   * 用途：系统监控、管理后台展示、健康检查
   * 性能：数据库查询，响应时间10-50ms
   *
   * @example
   * // 示例返回值
   * {
   *   status: "running",       // 服务运行中
   *   connections: 150,        // 总连接数150个
   *   uptime: 12.5,           // 运行12.5小时
   *   connected_users: 145,    // 在线用户145人
   *   connected_admins: 5,     // 在线客服5人
   *   timestamp: "2025-11-08 20:30:00"  // 查询时间（北京时间）
   * }
   */
  async getStatus() {
    try {
      const { WebSocketStartupLog } = require('../models')
      const currentLog = await WebSocketStartupLog.getCurrentRunning()

      /*
       * 计算uptime运行时长（小时数）
       * ⚡ 关键修复：使用getDataValue()获取原始数据库值，而不是格式化后的get钩子值
       * 说明：get钩子会将start_time格式化为中文字符串，导致无法计算时间差
       */
      let uptimeHours = 0
      if (currentLog) {
        const rawStartTime = currentLog.getDataValue('start_time') // 获取原始DATETIME值
        const startTime = new Date(rawStartTime).getTime()
        const now = Date.now()
        uptimeHours = parseFloat(((now - startTime) / 1000 / 3600).toFixed(2))
      }

      return {
        /*
         * 字段1: status（服务运行状态）- 符合API文档规范
         * 说明：this.io不为null表示Socket.IO已初始化且正常运行
         * 可能值："running"（运行中）/ "stopped"（已停止）
         */
        status: this.io !== null ? 'running' : 'stopped',

        /*
         * 字段2: connections（总连接数）- 符合API文档规范
         * 说明：用户连接数 + 客服连接数 = 总连接数
         * 用途：负载评估、扩容决策、连接数监控
         */
        connections: this.connectedUsers.size + this.connectedAdmins.size,

        /*
         * 字段3: uptime（服务运行时长-小时数）⭐ 核心字段 ⭐
         * 说明：服务从启动到现在的运行时长，单位：小时
         * 用途：服务稳定性评估（uptime越长=服务越稳定）、重启记录、SLA统计
         * 示例：12.50表示运行12小时30分钟
         */
        uptime: uptimeHours,

        /*
         * 字段4: connected_users（在线用户数）
         * 说明：当前连接的普通用户数量（不包括客服）
         * 用途：用户活跃度统计、业务分析、负载评估
         */
        connected_users: this.connectedUsers.size,

        /*
         * 字段5: connected_admins（在线客服数）
         * 说明：当前连接的客服数量
         * 用途：客服排班、服务质量评估、工作负载分析
         */
        connected_admins: this.connectedAdmins.size,

        /*
         * 字段6: timestamp（查询时间戳）
         * 说明：当前查询时间，北京时间（UTC+8），格式：YYYY-MM-DD HH:mm:ss
         * 用途：时间记录、日志追踪、数据同步验证
         */
        timestamp: BeijingTimeHelper.now(),

        // 字段7: startup_log_id（启动日志ID）- 用于追溯和调试
        startup_log_id: this.currentStartupLogId
      }
    } catch (error) {
      wsLogger.error('获取服务状态失败', { error: error.message })

      // 降级处理：返回基本状态（不依赖数据库）
      return {
        status: this.io !== null ? 'running' : 'stopped',
        connections: this.connectedUsers.size + this.connectedAdmins.size,
        uptime: 0, // 数据库查询失败时返回0
        connected_users: this.connectedUsers.size,
        connected_admins: this.connectedAdmins.size,
        timestamp: BeijingTimeHelper.now(),
        startup_log_id: this.currentStartupLogId
      }
    }
  }

  /**
   * 获取在线用户列表
   * @returns {Array} 在线用户ID列表
   */
  getOnlineUsers() {
    return Array.from(this.connectedUsers.keys())
  }

  /**
   * 获取在线客服列表
   * @returns {Array} 在线客服ID列表
   */
  getOnlineAdmins() {
    return Array.from(this.connectedAdmins.keys())
  }

  /**
   * 检查用户是否在线
   * @param {Number} user_id - 用户ID
   * @returns {Boolean} 是否在线
   */
  isUserOnline(user_id) {
    return this.connectedUsers.has(user_id)
  }

  /**
   * 检查客服是否在线
   * @param {Number} admin_id - 客服ID
   * @returns {Boolean} 是否在线
   */
  isAdminOnline(admin_id) {
    return this.connectedAdmins.has(admin_id)
  }

  /**
   * 强制断开指定用户的连接
   * @param {Number} user_id - 用户ID
   * @param {String} user_type - 用户类型 'user' 或 'admin'
   * @returns {void} 无返回值，强制断开用户WebSocket连接
   */
  disconnectUser(user_id, user_type = 'user') {
    const map = user_type === 'user' ? this.connectedUsers : this.connectedAdmins
    const socketId = map.get(user_id)

    if (socketId) {
      const socket = this.io.sockets.sockets.get(socketId)
      if (socket) {
        socket.disconnect(true)
        map.delete(user_id)
        wsLogger.info(`🔌 已强制断开 ${user_type} ${user_id} 的连接`)
      }
    }
  }

  /**
   * 优雅停止WebSocket服务（记录停止事件）
   * @param {String} reason - 停止原因（如："正常停止"、"部署更新"、"服务崩溃"等）
   * @returns {Promise<void>} 无返回值
   *
   * @description
   * 功能：优雅停止WebSocket服务并记录停止事件到数据库
   * 流程：记录停止事件 → 断开所有连接 → 关闭Socket.IO → 清理资源
   * 用途：服务维护、部署更新、异常处理、审计追踪
   */
  async shutdown(reason = '正常停止') {
    wsLogger.info('WebSocket服务正在停止...', { reason })

    try {
      // 记录服务停止事件到数据库
      if (this.currentStartupLogId) {
        const { WebSocketStartupLog } = require('../models')
        await WebSocketStartupLog.recordStop(this.currentStartupLogId, {
          reason,
          peak_connections: this.connectedUsers.size + this.connectedAdmins.size,
          total_messages: 0 // 可以从统计中获取
        })

        wsLogger.info('WebSocket服务停止记录已保存', {
          logId: this.currentStartupLogId,
          reason
        })
      }

      // 断开所有连接
      if (this.io) {
        this.io.disconnectSockets(true)
        this.io.close()
      }

      // 清理资源
      this.io = null
      this.connectedUsers.clear()
      this.connectedAdmins.clear()

      wsLogger.info('WebSocket服务已停止')
    } catch (error) {
      wsLogger.error('停止服务失败', { error: error.message })
    }
  }

  /**
   * 通知会话关闭（推送给用户和管理员）
   * @param {Number} session_id - 会话ID
   * @param {Number} user_id - 用户ID
   * @param {Number} admin_id - 管理员ID（可能为null）
   * @param {Object} closeData - 关闭数据
   * @param {String} closeData.close_reason - 关闭原因
   * @param {Number} closeData.closed_by - 关闭操作人ID
   * @param {Date} closeData.closed_at - 关闭时间
   * @returns {Object} 通知结果 {notified_user, notified_admin, user_online, admin_online}
   *
   * 业务场景（Business Scenario）:
   * 1. 管理员关闭会话后，实时通知在线用户（避免用户继续发消息）
   * 2. 通知其他在线管理员会话状态变化（多客服协作场景）
   * 3. 广播给所有管理员，用于管理后台列表实时刷新
   *
   * 技术说明（Technical Notes）:
   * - WebSocket通知失败不影响关闭成功（非关键路径）
   * - 用户刷新页面会看到最新状态（系统消息）
   * - 离线用户上线后可查看系统消息
   */
  notifySessionClosed(session_id, user_id, admin_id, closeData) {
    const result = {
      notified_user: false,
      notified_admin: false,
      user_online: false,
      admin_online: false
    }

    // 检查WebSocket服务是否已初始化
    if (!this.io) {
      wsLogger.warn('WebSocket服务未初始化，无法发送通知')
      return result
    }

    // 1️⃣ 通知用户（如果在线）
    const userSocketId = this.connectedUsers.get(user_id)
    if (userSocketId) {
      const userSocket = this.io.sockets.sockets.get(userSocketId)
      if (userSocket) {
        userSocket.emit('session_closed', {
          session_id,
          status: 'closed',
          close_reason: closeData.close_reason,
          closed_at: closeData.closed_at,
          closed_by: closeData.closed_by,
          message: `会话已被客服关闭：${closeData.close_reason}`,
          timestamp: BeijingTimeHelper.now()
        })
        result.notified_user = true
        result.user_online = true
        wsLogger.info('通知用户会话关闭', {
          user_id,
          session_id,
          close_reason: closeData.close_reason
        })
      }
    }

    // 2️⃣ 通知管理员（如果在线且不是关闭人）
    if (admin_id && admin_id !== closeData.closed_by) {
      const adminSocketId = this.connectedAdmins.get(admin_id)
      if (adminSocketId) {
        const adminSocket = this.io.sockets.sockets.get(adminSocketId)
        if (adminSocket) {
          adminSocket.emit('session_closed', {
            session_id,
            status: 'closed',
            close_reason: closeData.close_reason,
            closed_at: closeData.closed_at,
            closed_by: closeData.closed_by,
            message: '会话已被其他客服关闭',
            timestamp: BeijingTimeHelper.now()
          })
          result.notified_admin = true
          result.admin_online = true
          wsLogger.info('通知管理员会话关闭', { admin_id, session_id })
        }
      }
    }

    // 3️⃣ 广播给所有在线管理员（用于管理后台列表刷新）
    this.connectedAdmins.forEach((socketId, adminUserId) => {
      if (adminUserId !== closeData.closed_by) {
        // 不通知关闭人自己
        const socket = this.io.sockets.sockets.get(socketId)
        if (socket) {
          socket.emit('session_list_update', {
            action: 'session_closed',
            session_id,
            timestamp: BeijingTimeHelper.now()
          })
        }
      }
    })

    return result
  }

  /**
   * 获取服务器IP地址（2025年11月08日新增）
   * @returns {String} 服务器IP地址
   */
  getServerIP() {
    try {
      const os = require('os')
      const interfaces = os.networkInterfaces()
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address
          }
        }
      }
      return '127.0.0.1'
    } catch (error) {
      return '127.0.0.1'
    }
  }

  /**
   * 获取单例实例（静态方法）
   * @returns {ChatWebSocketService} WebSocket服务实例
   */
  static getInstance() {
    return chatWebSocketServiceInstance
  }

  // ==================== 会话恢复功能（Task 7.3 - 2026-01-28新增）====================

  /**
   * 获取用户的离线消息（用于断线重连后的会话恢复）
   *
   * @description 用户断线重连后，获取其在离线期间收到的消息
   *
   * 业务场景：
   * - 用户网络断开后重新连接，需要获取离线期间的系统通知
   * - 用户从后台切回前台，需要同步最新消息
   * - 客户端重连时调用，确保消息不丢失
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项
   * @param {Date} [options.since] - 从什么时间开始获取（默认获取最近24小时）
   * @param {number} [options.limit=50] - 限制返回消息数量
   * @returns {Promise<Object>} 离线消息结果 {messages, count, sync_timestamp}
   *
   * @example
   * // 客户端重连后获取离线消息
   * const offlineMessages = await ChatWebSocketService.getOfflineMessages(userId, {
   *   since: lastSyncTime, // 上次同步时间
   *   limit: 100
   * })
   */
  async getOfflineMessages(user_id, options = {}) {
    const { limit = 50 } = options
    let { since } = options

    // 默认获取最近24小时的消息
    if (!since) {
      since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    }

    try {
      const { ChatMessage, CustomerServiceSession } = require('../models')

      // 1. 查找用户的聊天会话
      const sessions = await CustomerServiceSession.findAll({
        where: { user_id },
        attributes: ['session_id']
      })

      if (sessions.length === 0) {
        return {
          messages: [],
          count: 0,
          sync_timestamp: BeijingTimeHelper.now()
        }
      }

      const sessionIds = sessions.map(s => s.session_id)

      // 2. 查询离线期间的消息
      const messages = await ChatMessage.findAll({
        where: {
          session_id: { [require('sequelize').Op.in]: sessionIds },
          created_at: { [require('sequelize').Op.gte]: since },
          // 只获取系统消息或发给用户的消息
          [require('sequelize').Op.or]: [{ message_type: 'system' }, { sender_type: 'admin' }]
        },
        order: [['created_at', 'ASC']],
        limit
      })

      wsLogger.info('获取离线消息完成', {
        user_id,
        since: since.toISOString(),
        message_count: messages.length
      })

      return {
        messages: messages.map(msg => ({
          message_id: msg.message_id,
          session_id: msg.session_id,
          content: msg.content,
          message_type: msg.message_type,
          sender_type: msg.sender_type,
          metadata: msg.metadata,
          created_at: msg.created_at
        })),
        count: messages.length,
        sync_timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      wsLogger.error('获取离线消息失败', {
        user_id,
        error: error.message
      })

      return {
        messages: [],
        count: 0,
        sync_timestamp: BeijingTimeHelper.now(),
        error: error.message
      }
    }
  }

  /**
   * 处理客户端重连（会话恢复）
   *
   * @description 当客户端断线重连时，恢复其会话状态并推送离线消息
   *
   * 业务场景：
   * - 客户端网络恢复后重新建立WebSocket连接
   * - 移动端从后台切换到前台时重新连接
   * - 页面刷新后重新连接
   *
   * 恢复流程：
   * 1. 验证用户身份（已在握手阶段通过JWT完成）
   * 2. 恢复用户的连接映射
   * 3. 获取离线消息并推送
   * 4. 发送会话恢复成功通知
   *
   * @param {Object} socket - Socket.IO socket对象
   * @param {Object} options - 恢复选项
   * @param {Date} [options.last_sync_time] - 上次同步时间
   * @returns {Promise<Object>} 恢复结果 {success, offline_messages_count, sync_timestamp}
   *
   * @example
   * // 客户端发送重连请求
   * socket.emit('reconnect_session', { last_sync_time: '2026-01-28T10:00:00+08:00' })
   *
   * // 服务端处理
   * socket.on('reconnect_session', async (data) => {
   *   const result = await ChatWebSocketService.handleReconnection(socket, data)
   *   socket.emit('session_restored', result)
   * })
   */
  async handleReconnection(socket, options = {}) {
    const { last_sync_time } = options
    const userId = socket.user?.user_id
    const isAdmin = socket.user?.role_level >= 100

    if (!userId) {
      wsLogger.warn('会话恢复失败：用户未认证', { socket_id: socket.id })
      return {
        success: false,
        error: 'USER_NOT_AUTHENTICATED',
        message: '用户未认证，无法恢复会话'
      }
    }

    try {
      wsLogger.info('开始会话恢复', {
        user_id: userId,
        is_admin: isAdmin,
        last_sync_time: last_sync_time || 'not_provided'
      })

      // 1. 恢复连接映射（如果之前有断开的连接，更新为新的socket）
      if (isAdmin) {
        this.connectedAdmins.set(userId, socket.id)
        wsLogger.info('管理员连接映射已恢复', { user_id: userId, socket_id: socket.id })
      } else {
        this.connectedUsers.set(userId, socket.id)
        wsLogger.info('用户连接映射已恢复', { user_id: userId, socket_id: socket.id })
      }

      // 2. 获取离线消息
      let offlineMessages = { messages: [], count: 0 }
      if (!isAdmin) {
        // 只为普通用户获取离线消息
        const since = last_sync_time ? new Date(last_sync_time) : undefined
        offlineMessages = await this.getOfflineMessages(userId, { since })

        // 3. 推送离线消息
        if (offlineMessages.count > 0) {
          socket.emit('offline_messages', {
            messages: offlineMessages.messages,
            count: offlineMessages.count,
            sync_timestamp: offlineMessages.sync_timestamp
          })

          wsLogger.info('离线消息已推送', {
            user_id: userId,
            message_count: offlineMessages.count
          })
        }
      }

      // 4. 发送会话恢复成功通知
      const result = {
        success: true,
        user_id: userId,
        is_admin: isAdmin,
        offline_messages_count: offlineMessages.count,
        sync_timestamp: BeijingTimeHelper.now(),
        message: `会话恢复成功${offlineMessages.count > 0 ? `，已推送${offlineMessages.count}条离线消息` : ''}`
      }

      socket.emit('session_restored', result)

      wsLogger.info('会话恢复完成', {
        user_id: userId,
        offline_messages_count: offlineMessages.count
      })

      return result
    } catch (error) {
      wsLogger.error('会话恢复失败', {
        user_id: userId,
        error: error.message
      })

      return {
        success: false,
        error: 'SESSION_RESTORE_FAILED',
        message: `会话恢复失败: ${error.message}`
      }
    }
  }

  /**
   * 获取连接状态（用于客户端显示连接状态）
   *
   * @param {number} user_id - 用户ID
   * @param {string} user_type - 用户类型（user/admin）
   * @returns {Object} 连接状态 {connected, socket_id, last_activity}
   */
  getConnectionStatus(user_id, user_type = 'user') {
    const map = user_type === 'admin' ? this.connectedAdmins : this.connectedUsers
    const socketId = map.get(user_id)

    return {
      connected: !!socketId,
      socket_id: socketId || null,
      user_type,
      timestamp: BeijingTimeHelper.now()
    }
  }
}

// 创建单例实例
const chatWebSocketServiceInstance = new ChatWebSocketService()

// 导出单例实例
module.exports = chatWebSocketServiceInstance
