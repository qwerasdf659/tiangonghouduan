/**
 * WebSocket 连接管理器（ConnectionManager）
 *
 * 职责（从 ChatWebSocketService 拆分，2026-07-11 技术债务方案 7.4-3）：
 * - Socket.IO 服务初始化（CORS 白名单、Redis Adapter、启动日志）
 * - 握手 JWT 鉴权 + 会话有效性检查
 * - 连接注册/断开清理（connectedUsers / connectedAdmins 在线视图维护）
 * - 心跳检测（ping/pong）
 * - 断线重连会话恢复（reconnect_session）
 * - 房间管理（user:{id} / admin:{id} / users / admins / device:{id}:{device_id}）
 * - 强制下线（disconnectUser）与优雅停机（shutdown）
 * - 服务状态查询（getStatus / 在线列表 / 在线判断）
 *
 * 设计说明：
 * - 本模块不独立注册服务键，仅由 ChatWebSocketService Facade 持有并委托调用
 * - io 实例与连接 Map 由 Facade 单一持有，本模块通过 this.service 动态引用（不自行 new）
 * - 纯搬移拆分：所有方法逻辑与拆分前 ChatWebSocketService 完全一致
 */

const BusinessError = require('../../utils/BusinessError')
const wsLogger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')
const socketIO = require('socket.io')
const { WebSocketStartupLog, AuthenticationSession, User } = require('../../models')
const jwt = require('jsonwebtoken')
const os = require('os')

/**
 * WebSocket 连接管理器类
 * @class ConnectionManager
 */
class ConnectionManager {
  /**
   * 构造函数
   * @param {Object} service - ChatWebSocketService Facade 实例（单一持有 io 与连接 Map）
   */
  constructor(service) {
    /**
     * Facade 引用：io / connectedUsers / connectedAdmins / MAX_* / currentStartupLogId
     * 均通过 this.service 动态读取，保证与 Facade（及测试注入的 mock io）保持单一数据源
     */
    this.service = service
  }

  /**
   * 初始化WebSocket服务
   * @param {Object} server - HTTP服务器实例
   * @returns {Promise<void>} 无返回值，初始化WebSocket服务并设置事件处理器
   */
  async initialize(server) {
    if (!server) {
      throw new BusinessError('服务器实例不能为空', 'CUSTOMER_SERVICE_NOT_ALLOWED', 400)
    }

    // 初始化Socket.IO（io 实例挂在 Facade 上，全局单一份）
    this.service.io = socketIO(server, {
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
      /*
       * R11（cluster sticky 规避，2026-05-30）：强制 websocket-only，禁用 polling。
       * 原因：polling 握手由多个 HTTP 请求组成，PM2 cluster 默认轮询分发会把
       * 同一会话的请求打到不同 worker，导致 "Session ID unknown" 握手失败、反复重连。
       * WebSocket 是单条 TCP 长连接，天然不需要 sticky session；
       * 微信小程序(wx.connectSocket) 与管理后台浏览器均原生支持纯 WebSocket。
       */
      transports: ['websocket'],
      pingTimeout: 60000, // 60秒心跳超时
      pingInterval: 25000 // 25秒心跳间隔
    })

    /*
     * R3（cluster 跨进程消息广播，2026-05-30）：接入 Socket.IO Redis Adapter。
     * 作用：cluster 多 worker 下，io.to(room).emit() 通过 Redis pub/sub 自动跨进程转发，
     *       使连在 worker-A 的用户能收到 worker-B 发起的房间广播。
     * 复用：UnifiedRedisClient 已建好的 pubClient/subClient（零新增连接）。
     * 降级：适配器接入失败不阻断服务启动（单进程下本就无需适配器）。
     */
    try {
      const { createAdapter } = require('@socket.io/redis-adapter')
      const { getRedisClient } = require('../../utils/UnifiedRedisClient')
      const redisClient = getRedisClient()
      const pubClient = redisClient.getPubClient()
      const subClient = redisClient.getSubClient()
      this.service.io.adapter(createAdapter(pubClient, subClient))
      wsLogger.info('✅ Socket.IO Redis Adapter 已接入（cluster 跨进程广播就绪）')
    } catch (adapterError) {
      wsLogger.error('Socket.IO Redis Adapter 接入失败（单进程可忽略）', {
        error: adapterError.message
      })
    }

    /*
     * ⚡ 记录服务启动事件到数据库（2025年11月08日新增）
     * 说明：记录服务启动时间、服务器信息，用于uptime计算和服务监控
     * 用途：提供服务运行时长、重启历史、SLA统计
     */
    try {
      const startupLog = await WebSocketStartupLog.recordStartup({
        ip: this.getServerIP(),
        hostname: require('os').hostname()
      })

      this.service.currentStartupLogId = startupLog.websocket_startup_log_id

      wsLogger.info('WebSocket服务启动记录已保存', {
        logId: this.service.currentStartupLogId,
        startTime: startupLog.start_time,
        serverIP: startupLog.server_ip,
        hostname: startupLog.server_hostname
      })
    } catch (error) {
      wsLogger.error('保存启动记录失败', { error: error.message })
    }

    // 🔐 强制握手JWT鉴权 + 会话有效性检查（与REST API认证逻辑一致）
    this.service.io.use(async (socket, next) => {
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

        /**
         * 会话有效性检查（与 middleware/auth.js authenticateToken 保持一致）
         * 防止已失效会话通过WebSocket绕过认证
         *
         */
        if (decoded.session_token) {
          const session = await AuthenticationSession.findValidByToken(decoded.session_token)
          if (!session) {
            const rawSession = await AuthenticationSession.findOne({
              where: { session_token: decoded.session_token }
            })
            const reason = rawSession
              ? rawSession.is_active
                ? 'session_expired'
                : 'session_replaced'
              : 'session_not_found'
            wsLogger.warn('WebSocket握手失败：会话已失效', {
              user_id: decoded.user_id,
              socket_id: socket.id,
              reason
            })
            return next(new Error(`Authentication failed: ${reason}`))
          }

          /**
           * 将会话的 user_type 挂到 socket 上，用于连接路由（connectedUsers / connectedAdmins）。
           * user_type 按登录上下文确定（用户端=user，管理后台=admin），
           * 确保 disconnectUser 与 session 的 user_type 一致。
           */
          // eslint-disable-next-line require-atomic-updates
          socket.session_user_type = session.user_type
          /*
           * 设备级多会话：记录 socket 的 device_id（来自 JWT），用于"按设备精准下线"。
           * 与 session.device_id 对齐；缺失（legacy）时为 null。
           */
          // eslint-disable-next-line require-atomic-updates
          socket.device_id = decoded.device_id || session.device_id || null
        } else {
          wsLogger.warn('WebSocket握手失败：Token缺少session_token', {
            user_id: decoded.user_id,
            socket_id: socket.id
          })
          return next(new Error('Authentication failed: missing session_token'))
        }

        /*
         * 用户信息以数据库为准（与 middleware/auth.js authenticateToken 一致），不再裸用 JWT payload。
         * B1 精简后 token 仅含 user_id 等最小字段；WS 业务只用 user_id，这里查库同时校验用户仍存在且 active，
         * 拿到不存在/被禁用用户即拒绝握手（防止已删/禁用账号凭旧 token 连入）。
         */
        const dbUser = await User.findOne({
          where: { user_id: decoded.user_id, status: 'active' },
          attributes: ['user_id', 'user_uuid', 'nickname', 'status']
        })
        if (!dbUser) {
          wsLogger.warn('WebSocket握手失败：用户不存在或已被禁用', {
            user_id: decoded.user_id,
            socket_id: socket.id
          })
          return next(new Error('Authentication failed: user not found or inactive'))
        }

        // eslint-disable-next-line require-atomic-updates
        socket.user = {
          user_id: dbUser.user_id,
          user_uuid: dbUser.user_uuid,
          nickname: dbUser.nickname,
          status: dbUser.status
        }

        wsLogger.info('WebSocket握手鉴权成功', {
          user_id: dbUser.user_id,
          session_user_type: socket.session_user_type,
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
    wsLogger.info('   传输: WebSocket（cluster 安全，已禁用 polling）')
  }

  /**
   * 设置事件处理器
   * @returns {void} 无返回值，设置WebSocket连接和消息事件处理器
   */
  setupEventHandlers() {
    this.service.io.on('connection', socket => {
      const userId = socket.user.user_id
      // 连接上下文用会话身份（session_user_type），不再依赖 JWT 里的 role_level（B1 已移出 Token）
      const sessionUserType = socket.session_user_type || 'user'
      /**
       * 连接路由基于会话的 user_type（登录上下文）而非 role_level：
       *   user_type='admin' → connectedAdmins（管理后台 WebSocket）
       *   user_type='user'  → connectedUsers（用户端/小程序 WebSocket）
       * 这样同一管理员可在小程序(connectedUsers) + 管理后台(connectedAdmins) 同时在线。
       */
      const isAdminSession = socket.session_user_type === 'admin'

      if (isAdminSession) {
        this.service.connectedAdmins.set(userId, socket.id)
        /*
         * R6（cluster 跨进程推送，2026-05-30）：加入身份房间。
         * admin:{id} 用于定向推送，admins 用于广播给所有管理员。
         * 配合 Redis Adapter，io.to(room).emit() 可跨 worker 送达。
         */
        socket.join(`admin:${userId}`)
        socket.join('admins')
        // 设备级多会话：加入设备房间，支持"按设备精准下线"（踢单设备不误伤同账号其他设备）
        if (socket.device_id) {
          socket.join(`device:${userId}:${socket.device_id}`)
        }
        wsLogger.info('管理员已连接', {
          user_id: userId,
          socket_id: socket.id,
          session_user_type: socket.session_user_type
        })
      } else {
        this.service.connectedUsers.set(userId, socket.id)
        // R6：加入 user:{id}（定向）与 users（广播）房间，支持跨 worker 推送
        socket.join(`user:${userId}`)
        socket.join('users')
        // 设备级多会话：加入设备房间，支持"按设备精准下线"
        if (socket.device_id) {
          socket.join(`device:${userId}:${socket.device_id}`)
        }
        wsLogger.info('用户已连接', {
          user_id: userId,
          socket_id: socket.id,
          session_user_type: socket.session_user_type
        })
      }

      // ⚡ 连接数检查（2025年01月21日新增）
      const totalConnections = this.service.connectedUsers.size + this.service.connectedAdmins.size

      if (totalConnections >= this.service.MAX_TOTAL_CONNECTIONS) {
        wsLogger.error('连接已满，拒绝新连接', {
          current: totalConnections,
          max: this.service.MAX_TOTAL_CONNECTIONS,
          socketId: socket.id
        })

        socket.emit('connection_rejected', {
          reason: 'MAX_CONNECTIONS_REACHED',
          message: '服务器连接已满，请稍后重试',
          current: totalConnections,
          max: this.service.MAX_TOTAL_CONNECTIONS,
          timestamp: BeijingTimeHelper.now()
        })
        socket.disconnect(true)
        return
      }

      wsLogger.info(
        `🔌 客户端连接成功: ${socket.id} (${totalConnections + 1}/${this.service.MAX_TOTAL_CONNECTIONS})`
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

      socket.emit('connection_established', {
        user_id: userId,
        session_user_type: sessionUserType,
        socket_id: socket.id,
        server_time: BeijingTimeHelper.now(),
        timestamp: Date.now()
      })

      // 2. 心跳检测（保持连接活跃）
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: BeijingTimeHelper.now() })
      })

      /**
       * 2.1 用户通过WebSocket发送聊天消息
       * 消息处理逻辑已拆分至 ChatHandler（services/ws/ChatHandler.js），此处仅做事件路由
       */
      socket.on('send_message', async data => {
        await this.service.chatHandler.handleSendMessage(socket, data)
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
        for (const [userId, socketId] of this.service.connectedUsers.entries()) {
          if (socketId === socket.id) {
            this.service.connectedUsers.delete(userId)
            wsLogger.info(
              `👤 用户 ${userId} 已断开 (剩余: ${this.service.connectedUsers.size}个用户在线)`
            )
            break
          }
        }

        // 清理客服连接记录
        for (const [adminId, socketId] of this.service.connectedAdmins.entries()) {
          if (socketId === socket.id) {
            this.service.connectedAdmins.delete(adminId)
            wsLogger.info(
              `👨‍💼 客服 ${adminId} 已断开 (剩余: ${this.service.connectedAdmins.size}个客服在线)`
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
   */
  async getStatus() {
    try {
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
        // 字段1: status（服务运行状态）- io不为null表示Socket.IO已初始化且正常运行
        status: this.service.io !== null ? 'running' : 'stopped',

        // 字段2: connections（总连接数）= 用户连接数 + 客服连接数
        connections: this.service.connectedUsers.size + this.service.connectedAdmins.size,

        /*
         * 字段3: uptime（服务运行时长-小时数）⭐ 核心字段 ⭐
         * 用途：服务稳定性评估（uptime越长=服务越稳定）、重启记录、SLA统计
         */
        uptime: uptimeHours,

        // 字段4: connected_users（在线用户数，不包括客服）
        connected_users: this.service.connectedUsers.size,

        // 字段5: connected_admins（在线客服数）
        connected_admins: this.service.connectedAdmins.size,

        // 字段6: timestamp（查询时间戳，北京时间 YYYY-MM-DD HH:mm:ss）
        timestamp: BeijingTimeHelper.now(),

        // 字段7: startup_log_id（启动日志ID）- 用于追溯和调试
        startup_log_id: this.service.currentStartupLogId
      }
    } catch (error) {
      wsLogger.error('获取服务状态失败', { error: error.message })

      // 降级处理：返回基本状态（不依赖数据库）
      return {
        status: this.service.io !== null ? 'running' : 'stopped',
        connections: this.service.connectedUsers.size + this.service.connectedAdmins.size,
        uptime: 0, // 数据库查询失败时返回0
        connected_users: this.service.connectedUsers.size,
        connected_admins: this.service.connectedAdmins.size,
        timestamp: BeijingTimeHelper.now(),
        startup_log_id: this.service.currentStartupLogId
      }
    }
  }

  /**
   * 获取在线用户列表
   * @returns {Array} 在线用户ID列表
   */
  getOnlineUsers() {
    return Array.from(this.service.connectedUsers.keys())
  }

  /**
   * 获取在线客服列表
   * @returns {Array} 在线客服ID列表
   */
  getOnlineAdmins() {
    return Array.from(this.service.connectedAdmins.keys())
  }

  /**
   * 检查用户是否在线
   * @param {Number} user_id - 用户ID
   * @returns {Boolean} 是否在线
   */
  isUserOnline(user_id) {
    return this.service.connectedUsers.has(user_id)
  }

  /**
   * 检查客服是否在线
   * @param {Number} admin_id - 客服ID
   * @returns {Boolean} 是否在线
   */
  isAdminOnline(admin_id) {
    return this.service.connectedAdmins.has(admin_id)
  }

  /**
   * 强制断开指定用户的连接（会话被替换时调用）
   *
   * @param {Number} user_id - 用户ID
   * @param {String} user_type - 会话类型 'user'（用户端）或 'admin'（管理后台）
   * @param {Object} [options] - 可选参数
   * @param {String} [options.reason='session_replaced'] - 断连原因
   * @param {String} [options.replaced_by_platform] - 替换登录的平台
   * @returns {void} 无返回值，强制断开用户WebSocket连接
   */
  disconnectUser(user_id, user_type = 'user', options = {}) {
    const { reason = 'session_replaced', replaced_by_platform = null, device_id = null } = options
    if (!this.service.io) return

    /*
     * 设备级多会话：
     * - 传入 device_id → 仅断开该设备房间（device:{user_id}:{device_id}），不误伤同账号其他设备
     * - 不传 device_id → 按 user_type 房间断开该用户全部连接（兼容批量撤销/封禁场景）
     */
    const room = device_id
      ? `device:${user_id}:${device_id}`
      : user_type === 'user'
        ? `user:${user_id}`
        : `admin:${user_id}`

    /*
     * R6（cluster 跨进程强制下线）：
     * - 先向房间 emit session_replaced（Redis Adapter 跨 worker 送达，用户可能连在其他 worker）
     * - 再用 io.in(room).disconnectSockets(true) 跨进程断开该房间在任意 worker 上的连接
     * - 本进程连接映射由各 socket 的 'disconnect' 事件处理器自动清理（无需手动 delete）
     */
    this.service.io.to(room).emit('session_replaced', {
      reason,
      replaced_by_platform,
      device_id,
      message: '您的账号登录状态已变更'
    })
    this.service.io.in(room).disconnectSockets(true)

    wsLogger.info(`🔌 已强制断开 ${user_type} ${user_id} 的连接`, {
      reason,
      replaced_by_platform,
      device_id: device_id || '(全部设备)'
    })
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
      if (this.service.currentStartupLogId) {
        await WebSocketStartupLog.recordStop(this.service.currentStartupLogId, {
          reason,
          peak_connections: this.service.connectedUsers.size + this.service.connectedAdmins.size,
          total_messages: 0 // 可以从统计中获取
        })

        wsLogger.info('WebSocket服务停止记录已保存', {
          logId: this.service.currentStartupLogId,
          reason
        })
      }

      // 断开所有连接
      if (this.service.io) {
        this.service.io.disconnectSockets(true)
        this.service.io.close()
      }

      // 清理资源
      this.service.io = null
      this.service.connectedUsers.clear()
      this.service.connectedAdmins.clear()

      wsLogger.info('WebSocket服务已停止')
    } catch (error) {
      wsLogger.error('停止服务失败', { error: error.message })
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
   * 3. 获取离线消息并推送（离线消息查询委托 ChatHandler.getOfflineMessages）
   * 4. 发送会话恢复成功通知
   *
   * @param {Object} socket - Socket.IO socket对象
   * @param {Object} options - 恢复选项
   * @param {Date} [options.last_sync_time] - 上次同步时间
   * @returns {Promise<Object>} 恢复结果 {success, offline_messages_count, sync_timestamp}
   */
  async handleReconnection(socket, options = {}) {
    const { last_sync_time } = options
    const userId = socket.user?.user_id
    const isAdminSession = socket.session_user_type === 'admin'

    if (!userId) {
      wsLogger.warn('会话恢复失败：用户未认证', { socket_id: socket.id })
      return {
        success: false,
        error: 'USER_NOT_AUTHENTICATED',
        message: '用户未认证，无法恢复会话'
      }
    }

    const sessionUserType = socket.session_user_type || 'user'

    try {
      wsLogger.info('开始会话恢复', {
        user_id: userId,
        session_user_type: sessionUserType,
        last_sync_time: last_sync_time || 'not_provided'
      })

      if (isAdminSession) {
        this.service.connectedAdmins.set(userId, socket.id)
        // R6：重连时同样加入身份房间，保证跨 worker 推送可达
        socket.join(`admin:${userId}`)
        socket.join('admins')
        wsLogger.info('管理员连接映射已恢复', { user_id: userId, socket_id: socket.id })
      } else {
        this.service.connectedUsers.set(userId, socket.id)
        socket.join(`user:${userId}`)
        socket.join('users')
        wsLogger.info('用户连接映射已恢复', { user_id: userId, socket_id: socket.id })
      }

      let offlineMessages = { messages: [], count: 0 }
      if (!isAdminSession) {
        // 只为普通用户获取离线消息
        const since = last_sync_time ? new Date(last_sync_time) : undefined
        offlineMessages = await this.service.getOfflineMessages(userId, { since })

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

      const result = {
        success: true,
        user_id: userId,
        session_user_type: sessionUserType,
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
    const map = user_type === 'admin' ? this.service.connectedAdmins : this.service.connectedUsers
    const socketId = map.get(user_id)

    return {
      connected: !!socketId,
      socket_id: socketId || null,
      user_type,
      timestamp: BeijingTimeHelper.now()
    }
  }

  /**
   * 获取服务器IP地址（2025年11月08日新增）
   * @returns {String} 服务器IP地址
   */
  getServerIP() {
    try {
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
}

module.exports = ConnectionManager
