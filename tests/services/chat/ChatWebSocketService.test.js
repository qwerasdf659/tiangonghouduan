/**
 * 餐厅积分抽奖系统 V4.5 - ChatWebSocketService 单元测试
 *
 * 测试范围（P1-7 ChatWebSocketService 测试）：
 * - WebSocket 连接管理（用户/管理员连接）
 * - 消息推送功能（点对点、广播）
 * - 房间管理和会话恢复
 * - 断线重连机制
 * - 连接数限制和安全控制
 *
 * 测试用例数量：18 cases
 * 预计工时：1.5天
 *
 * 创建时间：2026-01-28
 * 关联文档：docs/测试审计标准.md（P1-7 节）
 *
 * 特殊说明：
 * - 需要 mock Socket.IO（WebSocket 无法在 Jest 中直接测试）
 * - 使用 Map 模拟 connectedUsers/connectedAdmins
 * - 测试重点是业务逻辑，而非 Socket.IO 协议实现
 */

/* BeijingTimeHelper 用于后续时间相关测试场景扩展 */
// const BeijingTimeHelper = require('../../../utils/timeHelper')

// Mock Socket.IO
jest.mock('socket.io', () => {
  return jest.fn(() => ({
    on: jest.fn(),
    use: jest.fn(),
    to: jest.fn(() => ({
      emit: jest.fn()
    })),
    sockets: {
      sockets: new Map()
    },
    disconnectSockets: jest.fn(),
    close: jest.fn()
  }))
})

// Mock 数据库模型
jest.mock('../../../models', () => ({
  WebSocketStartupLog: {
    recordStartup: jest.fn(() => Promise.resolve({ log_id: 1, start_time: new Date() })),
    getCurrentRunning: jest.fn(() =>
      Promise.resolve({ log_id: 1, getDataValue: () => new Date() })
    ),
    recordStop: jest.fn(() => Promise.resolve())
  },
  ChatMessage: {
    findAll: jest.fn(() => Promise.resolve([]))
  },
  CustomerServiceSession: {
    findAll: jest.fn(() => Promise.resolve([]))
  }
}))

// Mock JWT
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({
    user_id: 1,
    role: 'user',
    role_level: 0
  }))
}))

// 测试超时时间
jest.setTimeout(30000)

describe('ChatWebSocketService - 聊天WebSocket服务', () => {
  let chatWebSocketService

  // 测试前准备
  beforeAll(async () => {
    // 清除模块缓存，确保获取新的实例
    jest.resetModules()

    // 动态加载服务（避免模块缓存问题）
    chatWebSocketService = require('../../../services/ChatWebSocketService')

    console.log('✅ ChatWebSocketService 测试初始化完成')
  })

  // 每个测试前重置服务状态
  beforeEach(() => {
    // 清空连接记录
    if (chatWebSocketService.connectedUsers) {
      chatWebSocketService.connectedUsers.clear()
    }
    if (chatWebSocketService.connectedAdmins) {
      chatWebSocketService.connectedAdmins.clear()
    }
  })

  // 测试后清理
  afterAll(async () => {
    // 如果有 io 实例，清理它
    if (chatWebSocketService.io) {
      chatWebSocketService.io = null
    }
  })

  // ==================== 1. 服务实例测试 ====================

  describe('服务实例创建', () => {
    it('应创建单例实例', () => {
      /**
       * 测试场景：获取服务实例
       * 预期结果：返回有效的服务实例
       */
      expect(chatWebSocketService).toBeDefined()
      expect(chatWebSocketService.connectedUsers).toBeInstanceOf(Map)
      expect(chatWebSocketService.connectedAdmins).toBeInstanceOf(Map)
    })

    it('应有正确的连接限制配置', () => {
      /**
       * 测试场景：检查连接限制配置
       * 预期结果：配置值正确
       */
      expect(chatWebSocketService.MAX_TOTAL_CONNECTIONS).toBe(5000)
      expect(chatWebSocketService.MAX_USER_CONNECTIONS).toBe(4500)
      expect(chatWebSocketService.MAX_ADMIN_CONNECTIONS).toBe(500)
    })
  })

  // ==================== 2. 连接管理测试 ====================

  describe('连接管理', () => {
    it('getOnlineUsers 应返回在线用户列表', () => {
      /**
       * 测试场景：获取在线用户列表
       * 预期结果：返回所有在线用户的 ID 数组
       */
      // 模拟用户连接
      chatWebSocketService.connectedUsers.set(1, 'socket_1')
      chatWebSocketService.connectedUsers.set(2, 'socket_2')
      chatWebSocketService.connectedUsers.set(3, 'socket_3')

      const onlineUsers = chatWebSocketService.getOnlineUsers()

      expect(Array.isArray(onlineUsers)).toBe(true)
      expect(onlineUsers).toHaveLength(3)
      expect(onlineUsers).toContain(1)
      expect(onlineUsers).toContain(2)
      expect(onlineUsers).toContain(3)
    })

    it('getOnlineAdmins 应返回在线客服列表', () => {
      /**
       * 测试场景：获取在线客服列表
       * 预期结果：返回所有在线客服的 ID 数组
       */
      // 模拟客服连接
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')
      chatWebSocketService.connectedAdmins.set(102, 'socket_102')

      const onlineAdmins = chatWebSocketService.getOnlineAdmins()

      expect(Array.isArray(onlineAdmins)).toBe(true)
      expect(onlineAdmins).toHaveLength(2)
      expect(onlineAdmins).toContain(101)
      expect(onlineAdmins).toContain(102)
    })

    it('isUserOnline 应正确判断用户在线状态', () => {
      /**
       * 测试场景：检查用户是否在线
       * 预期结果：在线返回 true，离线返回 false
       */
      chatWebSocketService.connectedUsers.set(1, 'socket_1')

      expect(chatWebSocketService.isUserOnline(1)).toBe(true)
      expect(chatWebSocketService.isUserOnline(999)).toBe(false)
    })

    it('isAdminOnline 应正确判断客服在线状态', () => {
      /**
       * 测试场景：检查客服是否在线
       * 预期结果：在线返回 true，离线返回 false
       */
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')

      expect(chatWebSocketService.isAdminOnline(101)).toBe(true)
      expect(chatWebSocketService.isAdminOnline(999)).toBe(false)
    })
  })

  // ==================== 3. 消息推送测试 ====================

  describe('消息推送功能', () => {
    let mockEmit

    beforeEach(() => {
      // 创建 mock emit 函数
      mockEmit = jest.fn()

      // 模拟 Socket.IO 实例
      chatWebSocketService.io = {
        to: jest.fn(() => ({
          emit: mockEmit
        })),
        sockets: {
          sockets: new Map()
        }
      }
    })

    it('pushMessageToUser 应成功推送消息给在线用户', () => {
      /**
       * 测试场景：向在线用户推送消息
       * 预期结果：返回 true，调用 emit
       */
      chatWebSocketService.connectedUsers.set(1, 'socket_1')

      const message = {
        message_id: 1,
        content: '测试消息',
        sender_type: 'admin'
      }

      const result = chatWebSocketService.pushMessageToUser(1, message)

      expect(result).toBe(true)
      expect(chatWebSocketService.io.to).toHaveBeenCalledWith('socket_1')
      expect(mockEmit).toHaveBeenCalledWith('new_message', message)
    })

    it('pushMessageToUser 对离线用户应返回 false', () => {
      /**
       * 测试场景：向离线用户推送消息
       * 预期结果：返回 false（用户不在线）
       */
      const message = { content: '测试消息' }

      const result = chatWebSocketService.pushMessageToUser(999, message)

      expect(result).toBe(false)
    })

    it('pushMessageToAdmin 应成功推送消息给在线客服', () => {
      /**
       * 测试场景：向在线客服推送消息
       * 预期结果：返回 true，调用 emit
       */
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')

      const message = {
        message_id: 2,
        content: '用户咨询',
        sender_type: 'user'
      }

      const result = chatWebSocketService.pushMessageToAdmin(101, message)

      expect(result).toBe(true)
      expect(chatWebSocketService.io.to).toHaveBeenCalledWith('socket_101')
      expect(mockEmit).toHaveBeenCalledWith('new_message', message)
    })

    it('pushMessageToAdmin 对离线客服应返回 false', () => {
      /**
       * 测试场景：向离线客服推送消息
       * 预期结果：返回 false（客服不在线）
       */
      const message = { content: '用户咨询' }

      const result = chatWebSocketService.pushMessageToAdmin(999, message)

      expect(result).toBe(false)
    })

    it('broadcastToAllAdmins 应向所有在线客服广播消息', () => {
      /**
       * 测试场景：广播消息给所有在线客服
       * 预期结果：返回成功推送的客服数量
       */
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')
      chatWebSocketService.connectedAdmins.set(102, 'socket_102')
      chatWebSocketService.connectedAdmins.set(103, 'socket_103')

      const message = {
        type: 'system_alert',
        content: '系统通知'
      }

      const successCount = chatWebSocketService.broadcastToAllAdmins(message)

      expect(successCount).toBe(3)
      expect(mockEmit).toHaveBeenCalledTimes(3)
    })
  })

  // ==================== 4. 通知推送测试 ====================

  describe('通知推送功能', () => {
    let mockEmit

    beforeEach(() => {
      mockEmit = jest.fn()
      chatWebSocketService.io = {
        to: jest.fn(() => ({
          emit: mockEmit
        })),
        sockets: {
          sockets: new Map()
        }
      }
    })

    it('pushNotificationToAdmin 应成功推送通知给在线管理员', () => {
      /**
       * 测试场景：向在线管理员推送通知
       * 预期结果：返回 true，emit 类型为 notification
       */
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')

      const notification = {
        notification_id: 1,
        type: 'new_session',
        title: '新会话提醒'
      }

      const result = chatWebSocketService.pushNotificationToAdmin(101, notification)

      expect(result).toBe(true)
      expect(mockEmit).toHaveBeenCalledWith('notification', notification)
    })

    it('broadcastNotificationToAllAdmins 应向所有管理员广播通知', () => {
      /**
       * 测试场景：广播通知给所有在线管理员
       * 预期结果：返回成功推送的管理员数量
       */
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')
      chatWebSocketService.connectedAdmins.set(102, 'socket_102')

      const notification = {
        type: 'system_update',
        title: '系统更新通知'
      }

      const successCount = chatWebSocketService.broadcastNotificationToAllAdmins(notification)

      expect(successCount).toBe(2)
    })
  })

  // ==================== 5. 服务状态测试 ====================

  describe('服务状态查询', () => {
    it('getStatus 应返回正确的服务状态信息', async () => {
      /**
       * 测试场景：获取服务状态
       * 预期结果：返回包含连接数、运行时间等信息的对象
       */
      // 模拟连接
      chatWebSocketService.connectedUsers.set(1, 'socket_1')
      chatWebSocketService.connectedUsers.set(2, 'socket_2')
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')

      // 模拟 io 实例
      chatWebSocketService.io = { on: jest.fn() }

      const status = await chatWebSocketService.getStatus()

      expect(status).toBeDefined()
      expect(status.status).toBe('running')
      expect(status.connections).toBe(3)
      expect(status.connected_users).toBe(2)
      expect(status.connected_admins).toBe(1)
      expect(typeof status.uptime).toBe('number')
      expect(status.timestamp).toBeDefined()
    })

    it('getStatus 当服务未初始化时应返回 stopped 状态', async () => {
      /**
       * 测试场景：服务未初始化时获取状态
       * 预期结果：status 为 stopped
       */
      chatWebSocketService.io = null

      const status = await chatWebSocketService.getStatus()

      expect(status.status).toBe('stopped')
    })
  })

  // ==================== 6. 连接断开测试 ====================

  describe('连接断开功能', () => {
    it('disconnectUser 应断开用户连接', () => {
      /**
       * 测试场景：强制断开用户连接
       * 预期结果：用户从 connectedUsers 中移除
       */
      chatWebSocketService.connectedUsers.set(1, 'socket_1')

      // Mock socket 实例
      const mockDisconnect = jest.fn()
      chatWebSocketService.io = {
        sockets: {
          sockets: new Map([['socket_1', { disconnect: mockDisconnect }]])
        }
      }

      chatWebSocketService.disconnectUser(1, 'user')

      expect(chatWebSocketService.connectedUsers.has(1)).toBe(false)
      expect(mockDisconnect).toHaveBeenCalledWith(true)
    })

    it('disconnectUser 应断开管理员连接', () => {
      /**
       * 测试场景：强制断开管理员连接
       * 预期结果：管理员从 connectedAdmins 中移除
       */
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')

      const mockDisconnect = jest.fn()
      chatWebSocketService.io = {
        sockets: {
          sockets: new Map([['socket_101', { disconnect: mockDisconnect }]])
        }
      }

      chatWebSocketService.disconnectUser(101, 'admin')

      expect(chatWebSocketService.connectedAdmins.has(101)).toBe(false)
      expect(mockDisconnect).toHaveBeenCalledWith(true)
    })
  })

  // ==================== 7. 会话关闭通知测试 ====================

  describe('会话关闭通知', () => {
    it('notifySessionClosed 应通知用户和管理员', () => {
      /**
       * 测试场景：会话关闭时通知相关人员
       * 预期结果：返回通知结果对象
       */
      // Mock socket 实例
      const mockUserEmit = jest.fn()
      const mockAdminEmit = jest.fn()

      chatWebSocketService.connectedUsers.set(1, 'socket_1')
      chatWebSocketService.connectedAdmins.set(101, 'socket_101')

      chatWebSocketService.io = {
        sockets: {
          sockets: new Map([
            ['socket_1', { emit: mockUserEmit }],
            ['socket_101', { emit: mockAdminEmit }]
          ])
        }
      }

      const closeData = {
        close_reason: '问题已解决',
        closed_by: 102, // 不同的管理员关闭
        closed_at: new Date()
      }

      const result = chatWebSocketService.notifySessionClosed(1, 1, 101, closeData)

      expect(result).toBeDefined()
      expect(result.notified_user).toBe(true)
      expect(result.user_online).toBe(true)
      expect(result.notified_admin).toBe(true)
      expect(result.admin_online).toBe(true)
    })

    it('notifySessionClosed 当 WebSocket 未初始化时应返回失败结果', () => {
      /**
       * 测试场景：WebSocket 服务未初始化时通知
       * 预期结果：返回所有字段为 false 的结果
       */
      chatWebSocketService.io = null

      const result = chatWebSocketService.notifySessionClosed(1, 1, 101, {
        close_reason: '测试',
        closed_by: 101,
        closed_at: new Date()
      })

      expect(result.notified_user).toBe(false)
      expect(result.notified_admin).toBe(false)
    })
  })

  // ==================== 8. 会话恢复测试 ====================

  describe('会话恢复功能', () => {
    it('getConnectionStatus 应返回正确的连接状态', () => {
      /**
       * 测试场景：获取用户连接状态
       * 预期结果：返回包含连接信息的对象
       */
      chatWebSocketService.connectedUsers.set(1, 'socket_1')

      const status = chatWebSocketService.getConnectionStatus(1, 'user')

      expect(status.connected).toBe(true)
      expect(status.socket_id).toBe('socket_1')
      expect(status.user_type).toBe('user')
      expect(status.timestamp).toBeDefined()
    })

    it('getConnectionStatus 对离线用户应返回 connected: false', () => {
      /**
       * 测试场景：获取离线用户的连接状态
       * 预期结果：connected 为 false
       */
      const status = chatWebSocketService.getConnectionStatus(999, 'user')

      expect(status.connected).toBe(false)
      expect(status.socket_id).toBeNull()
    })

    it('handleReconnection 应恢复用户会话', async () => {
      /**
       * 测试场景：用户断线重连后恢复会话
       * 预期结果：会话恢复成功，推送离线消息
       */
      const mockSocket = {
        id: 'socket_new_1',
        user: { user_id: 1, role_level: 0 },
        emit: jest.fn()
      }

      const result = await chatWebSocketService.handleReconnection(mockSocket, {
        last_sync_time: new Date(Date.now() - 3600000).toISOString()
      })

      expect(result.success).toBe(true)
      expect(result.user_id).toBe(1)
      expect(result.is_admin).toBe(false)
      // 用户连接映射应该已恢复
      expect(chatWebSocketService.connectedUsers.get(1)).toBe('socket_new_1')
    })

    it('handleReconnection 对未认证用户应返回错误', async () => {
      /**
       * 测试场景：未认证用户尝试恢复会话
       * 预期结果：返回 USER_NOT_AUTHENTICATED 错误
       */
      const mockSocket = {
        id: 'socket_unknown',
        user: null, // 未认证
        emit: jest.fn()
      }

      const result = await chatWebSocketService.handleReconnection(mockSocket, {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('USER_NOT_AUTHENTICATED')
    })

    it('getOfflineMessages 应返回离线消息', async () => {
      /**
       * 测试场景：获取用户的离线消息
       * 预期结果：返回消息列表
       */
      // Mock CustomerServiceSession 返回会话
      const { CustomerServiceSession, ChatMessage } = require('../../../models')
      CustomerServiceSession.findAll.mockResolvedValueOnce([{ session_id: 1 }])
      ChatMessage.findAll.mockResolvedValueOnce([
        {
          message_id: 1,
          session_id: 1,
          content: '离线消息1',
          message_type: 'text',
          sender_type: 'admin',
          metadata: null,
          created_at: new Date()
        }
      ])

      const result = await chatWebSocketService.getOfflineMessages(1, {
        since: new Date(Date.now() - 3600000),
        limit: 50
      })

      expect(result).toBeDefined()
      expect(result.count).toBe(1)
      expect(result.messages).toHaveLength(1)
      expect(result.sync_timestamp).toBeDefined()
    })
  })

  // ==================== 9. 初始化测试 ====================

  describe('服务初始化', () => {
    it('initialize 没有服务器实例时应抛出错误', async () => {
      /**
       * 测试场景：初始化时不传入服务器实例
       * 预期结果：抛出错误
       */
      await expect(chatWebSocketService.initialize(null)).rejects.toThrow('服务器实例不能为空')
    })
  })
})
