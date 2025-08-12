/**
 * 聊天客服系统API路由
 * 实现用户端和管理员端聊天功能
 * 创建时间：2025年01月28日
 */

const express = require('express')
const { v4: uuidv4 } = require('uuid')
const router = express.Router()

// 中间件和工具
const { authenticateToken } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')

// 模型
const { sequelize, CustomerSession, ChatMessage, AdminStatus, User } = require('../../models')

// 🔥 启用WebSocket服务集成 (使用单例模式)
const WebSocketServiceSingleton = require('../../services/WebSocketServiceSingleton')
const getWebSocketService = () => WebSocketServiceSingleton.getInstance()

/**
 * 用户端API接口
 */

// POST /api/v2/chat/session - 创建聊天会话
router.post('/session', authenticateToken, async (req, res) => {
  try {
    const { source = 'mobile' } = req.body
    const userId = req.user.user_id

    // 检查用户是否已有活跃会话
    const existingSession = await CustomerSession.findOne({
      where: {
        user_id: userId,
        status: ['waiting', 'assigned', 'active']
      },
      order: [['created_at', 'DESC']]
    })

    if (existingSession) {
      // 返回现有会话
      return res.json(ApiResponse.success({
        sessionId: existingSession.session_id,
        status: existingSession.status,
        estimatedWaitTime: '2分钟',
        queuePosition: 1
      }, '会话已存在'))
    }

    // 创建新会话
    const sessionId = `session_${Date.now()}_${uuidv4().substr(0, 8)}`
    const session = await CustomerSession.create({
      session_id: sessionId,
      user_id: userId,
      status: 'waiting',
      source,
      priority: 1
    })

    // 🔥 自动分配可用管理员
    try {
      const availableAdmin = await AdminStatus.findOne({
        where: {
          status: 'online',
          current_sessions: { [sequelize.Op.lt]: sequelize.col('max_sessions') }
        },
        order: [['current_sessions', 'ASC']],
        include: [{ model: User, as: 'admin', attributes: ['user_id', 'nickname'] }]
      })

      if (availableAdmin) {
        await session.update({
          admin_id: availableAdmin.admin_id,
          status: 'assigned'
        })
        console.log(`✅ 会话 ${sessionId} 自动分配给管理员 ${availableAdmin.admin_id}`)
      } else {
        console.log(`⚠️ 暂无可用管理员，会话 ${sessionId} 保持等待状态`)
      }
    } catch (assignError) {
      console.warn('自动分配管理员失败:', assignError.message)
    }

    // 🔥 通过WebSocket通知管理员有新会话
    try {
      if (session.admin_id) {
        // 通知指定管理员
        getWebSocketService().sendToUser(session.admin_id, {
          type: 'new_session',
          data: {
            sessionId: session.session_id,
            userId,
            status: session.status,
            createdAt: session.created_at
          }
        })
      } else {
        // 广播给所有在线管理员
        getWebSocketService().broadcastToAdmins({
          type: 'new_session',
          data: {
            sessionId: session.session_id,
            userId,
            status: session.status,
            createdAt: session.created_at
          }
        })
      }
    } catch (wsError) {
      console.warn('WebSocket通知失败:', wsError.message)
    }

    res.json(ApiResponse.success({
      sessionId: session.session_id,
      status: session.status,
      estimatedWaitTime: '2分钟',
      queuePosition: 3
    }, '会话创建成功'))
  } catch (error) {
    console.error('创建聊天会话失败:', error)
    res.status(500).json(ApiResponse.error('创建会话失败', 'SESSION_CREATE_FAILED'))
  }
})

// GET /api/v2/chat/history - 获取聊天历史
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { sessionId, pageSize = 20, beforeMessageId } = req.query
    const userId = req.user.user_id

    // 验证会话归属
    const session = await CustomerSession.findOne({
      where: {
        session_id: sessionId,
        user_id: userId
      }
    })

    if (!session) {
      return res.status(404).json(ApiResponse.notFound('会话不存在'))
    }

    // 构建查询条件
    const where = { session_id: sessionId }
    if (beforeMessageId) {
      where.id = { $lt: beforeMessageId }
    }

    // 获取消息列表
    const messages = await ChatMessage.findAll({
      where,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['user_id', 'nickname', 'avatar_url']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(pageSize)
    })

    // 获取总数
    const totalCount = await ChatMessage.count({
      where: { session_id: sessionId }
    })

    const hasMore = messages.length === parseInt(pageSize)

    res.json(ApiResponse.success({
      messages: messages.map(msg => ({
        messageId: msg.message_id,
        senderId: msg.sender_id,
        senderType: msg.sender_type,
        content: msg.content,
        messageType: msg.message_type,
        status: msg.status,
        createdAt: msg.created_at,
        sender: msg.sender
          ? {
            userId: msg.sender.user_id,
            nickname: msg.sender.nickname,
            avatar: msg.sender.avatar_url
          }
          : null
      })),
      hasMore,
      totalCount
    }))
  } catch (error) {
    console.error('获取聊天历史失败:', error)
    res.status(500).json(ApiResponse.error('获取聊天历史失败', 'CHAT_HISTORY_FAILED'))
  }
})

// POST /api/v2/chat/message - 发送消息
router.post('/message', authenticateToken, async (req, res) => {
  try {
    const { sessionId, content, messageType = 'text', tempMessageId } = req.body
    const userId = req.user.user_id

    // 验证会话状态
    const session = await CustomerSession.findOne({
      where: {
        session_id: sessionId,
        user_id: userId
      }
    })

    if (!session) {
      return res.status(404).json(ApiResponse.notFound('会话不存在'))
    }

    if (session.status === 'closed') {
      return res.status(400).json(ApiResponse.error('会话已关闭', 'SESSION_CLOSED'))
    }

    // 创建消息
    const messageId = `msg_${Date.now()}_${uuidv4().substr(0, 8)}`
    const message = await ChatMessage.create({
      message_id: messageId,
      session_id: sessionId,
      sender_id: userId,
      sender_type: 'user',
      content,
      message_type: messageType,
      temp_message_id: tempMessageId,
      status: 'sent'
    })

    // 更新会话最后消息时间
    await session.update({
      last_message_at: new Date(),
      status: session.status === 'waiting' ? 'waiting' : 'active'
    })

    // 🔥 通过WebSocket发送消息给管理员
    try {
      if (session.admin_id) {
        getWebSocketService().sendToUser(session.admin_id, {
          type: 'new_message',
          data: {
            messageId: message.message_id,
            sessionId,
            senderId: userId,
            senderType: 'user',
            content,
            messageType,
            createdAt: message.created_at
          }
        })
      }
    } catch (wsError) {
      console.warn('WebSocket发送消息失败:', wsError.message)
    }

    res.json(ApiResponse.success({
      messageId: message.message_id,
      tempMessageId: message.temp_message_id,
      status: message.status,
      createdAt: message.created_at
    }, '消息发送成功'))
  } catch (error) {
    console.error('发送消息失败:', error)
    res.status(500).json(ApiResponse.error('发送消息失败', 'MESSAGE_SEND_FAILED'))
  }
})

// POST /api/v2/chat/upload/image - 上传聊天图片
router.post('/upload/image', authenticateToken, async (req, res) => {
  try {
    const { sessionId: _sessionId, tempMessageId: _tempMessageId } = req.body
    const _userId = req.user.user_id

    // TODO: 实现图片上传逻辑
    // 1. 验证会话权限
    // 2. 处理图片上传到Sealos存储
    // 3. 生成缩略图
    // 4. 创建图片消息记录

    res.status(501).json(ApiResponse.error('图片上传功能暂未实现', 'NOT_IMPLEMENTED'))
  } catch (error) {
    console.error('上传聊天图片失败:', error)
    res.status(500).json(ApiResponse.error('上传图片失败', 'IMAGE_UPLOAD_FAILED'))
  }
})

// GET /api/v2/chat/sessions - 获取用户会话列表
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { status } = req.query

    const where = { user_id: userId }
    if (status) {
      where.status = status
    }

    const sessions = await CustomerSession.findAll({
      where,
      include: [
        {
          model: User,
          as: 'admin',
          attributes: ['user_id', 'nickname', 'avatar_url']
        }
      ],
      order: [['updated_at', 'DESC']],
      limit: 20
    })

    res.json(ApiResponse.success({
      sessions: sessions.map(session => ({
        sessionId: session.session_id,
        status: session.status,
        createdAt: session.created_at,
        lastMessageAt: session.last_message_at,
        admin: session.admin
          ? {
            userId: session.admin.user_id,
            nickname: session.admin.nickname,
            avatar: session.admin.avatar_url
          }
          : null
      }))
    }))
  } catch (error) {
    console.error('获取会话列表失败:', error)
    res.status(500).json(ApiResponse.error('获取会话列表失败', 'SESSION_LIST_FAILED'))
  }
})

// POST /api/v2/chat/session/close - 关闭会话
router.post('/session/close', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body
    const userId = req.user.user_id

    const session = await CustomerSession.findOne({
      where: {
        session_id: sessionId,
        user_id: userId
      }
    })

    if (!session) {
      return res.status(404).json(ApiResponse.notFound('会话不存在'))
    }

    await session.update({
      status: 'closed',
      closed_at: new Date()
    })

    // 🔥 通知管理员会话关闭
    try {
      getWebSocketService().notifySessionClosed(session)
    } catch (wsError) {
      console.warn('WebSocket通知会话关闭失败:', wsError.message)
    }

    res.json(ApiResponse.success(null, '会话关闭成功'))
  } catch (error) {
    console.error('关闭会话失败:', error)
    res.status(500).json(ApiResponse.error('关闭会话失败', 'SESSION_CLOSE_FAILED'))
  }
})

/**
 * 管理员端API接口
 */

// GET /api/v2/admin/chat/sessions - 获取管理员会话列表
router.get('/admin/sessions', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { status = 'all', page = 1, pageSize = 10 } = req.query

    // 验证管理员权限
    if (!req.user.is_admin) {
      return res.status(403).json(ApiResponse.forbidden('需要管理员权限'))
    }

    // 构建查询条件
    const where = {}
    if (status === 'assigned') {
      where.admin_id = adminId
      where.status = ['assigned', 'active']
    } else if (status === 'waiting') {
      where.status = 'waiting'
    } else if (status !== 'all') {
      where.status = status
    }

    const sessions = await CustomerSession.findAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'avatar_url', 'mobile']
        }
      ],
      order: [['updated_at', 'DESC']],
      limit: parseInt(pageSize),
      offset: (parseInt(page) - 1) * parseInt(pageSize)
    })

    // 获取未读消息数
    const sessionsWithUnread = await Promise.all(sessions.map(async session => {
      const unreadCount = await ChatMessage.count({
        where: {
          session_id: session.session_id,
          sender_type: 'user',
          status: ['sent', 'delivered']
        }
      })

      return {
        sessionId: session.session_id,
        userId: session.user_id,
        userInfo: {
          nickname: session.user.nickname,
          avatar: session.user.avatar_url,
          mobile: session.user.mobile
        },
        status: session.status,
        unreadCount,
        lastMessage: null, // TODO: 获取最后一条消息
        createdAt: session.created_at
      }
    }))

    const totalCount = await CustomerSession.count({ where })

    res.json(ApiResponse.success({
      sessions: sessionsWithUnread,
      totalCount,
      unreadTotal: sessionsWithUnread.reduce((sum, s) => sum + s.unreadCount, 0)
    }))
  } catch (error) {
    console.error('获取管理员会话列表失败:', error)
    res.status(500).json(ApiResponse.error('获取会话列表失败', 'ADMIN_SESSION_LIST_FAILED'))
  }
})

// POST /api/v2/admin/chat/status - 更新管理员状态
router.post('/admin/status', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { status } = req.body

    // 验证管理员权限
    if (!req.user.is_admin) {
      return res.status(403).json(ApiResponse.forbidden('需要管理员权限'))
    }

    // 验证状态值
    if (!['online', 'busy', 'offline'].includes(status)) {
      return res.status(400).json(ApiResponse.error('无效的状态值', 'INVALID_STATUS'))
    }

    // 更新或创建管理员状态
    const [adminStatus] = await AdminStatus.findOrCreate({
      where: { admin_id: adminId },
      defaults: {
        admin_id: adminId,
        status,
        current_sessions: 0,
        max_sessions: 5,
        last_active_at: new Date()
      }
    })

    if (adminStatus.status !== status) {
      await adminStatus.update({
        status,
        last_active_at: new Date()
      })
    }

    res.json(ApiResponse.success({
      adminId,
      status: adminStatus.status,
      currentSessions: adminStatus.current_sessions,
      maxSessions: adminStatus.max_sessions,
      updatedAt: adminStatus.updated_at
    }, '状态更新成功'))
  } catch (error) {
    console.error('更新管理员状态失败:', error)
    res.status(500).json(ApiResponse.error('状态更新失败', 'ADMIN_STATUS_UPDATE_FAILED'))
  }
})

// GET /api/v2/admin/chat/stats/today - 获取今日统计
router.get('/admin/stats/today', authenticateToken, async (req, res) => {
  try {
    const _adminId = req.user.user_id

    // 验证管理员权限
    if (!req.user.is_admin) {
      return res.status(403).json(ApiResponse.forbidden('需要管理员权限'))
    }

    // 获取今日时间范围
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // TODO: 实现详细的统计逻辑
    const stats = {
      totalSessions: 0,
      completedSessions: 0,
      avgResponseTime: '0分钟',
      customerSatisfaction: 5.0,
      currentActive: 0,
      hourlyStats: []
    }

    res.json(ApiResponse.success({ stats }))
  } catch (error) {
    console.error('获取今日统计失败:', error)
    res.status(500).json(ApiResponse.error('获取统计失败', 'ADMIN_STATS_FAILED'))
  }
})

module.exports = router
