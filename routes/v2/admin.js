/**
 * 餐厅积分抽奖系统 v2.0 - 管理员审核路由
 * 实现管理员审核和管理功能API
 * 创建时间：2025年01月28日
 */

const express = require('express')
const AdminReviewService = require('../../services/AdminReviewService')
const PermissionService = require('../../services/PermissionService')
const TransactionService = require('../../services/TransactionService')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化管理服务
const adminReviewService = new AdminReviewService()
const permissionService = new PermissionService()
const transactionService = new TransactionService()

/**
 * @route GET /api/v2/admin
 * @desc 获取管理员API信息
 * @access 管理员
 */
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  res.json(
    ApiResponse.success({
      module: 'admin',
      description: '管理员审核和管理API',
      version: '2.0.0',
      endpoints: {
        'GET /pending-reviews': '获取待审核项目列表（管理员）',
        'POST /review/:id/approve': '批准审核项目（管理员）',
        'POST /review/:id/reject': '拒绝审核项目（管理员）',
        'GET /user/:userId/permissions': '查看用户权限状态（管理员）',
        'POST /user/:userId/grant-permission': '授予用户权限（管理员）',
        'GET /transactions/all': '获取所有交易记录（管理员）',
        'GET /stats/overview': '获取系统概览统计（管理员）'
      },
      permissions: ['admin', 'super_admin'],
      reviewTypes: ['upload', 'exchange', 'trade', 'premium_access'],
      supportedActions: ['approve', 'reject', 'hold', 'escalate']
    })
  )
})

/**
 * @route GET /api/v2/admin/pending-reviews
 * @desc 获取待审核项目列表
 * @access 管理员
 */
router.get('/pending-reviews', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      type = 'all',
      status = 'pending',
      priority = 'all',
      page = 1,
      pageSize = 20,
      sortBy = 'newest',
      keyword = ''
    } = req.query

    console.log('📋 获取待审核项目:', {
      type,
      status,
      priority,
      page,
      pageSize,
      keyword
    })

    // 获取待审核项目列表
    const result = await adminReviewService.getPendingReviews({
      type,
      status,
      priority,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      sortBy,
      keyword
    })

    res.json(
      ApiResponse.success({
        ...result,
        message: '待审核项目获取成功'
      })
    )
  } catch (error) {
    console.error('❌ 获取待审核项目失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取待审核项目失败', error.message)
    )
  }
})

/**
 * @route POST /api/v2/admin/review/:id/approve
 * @desc 批准审核项目
 * @access 管理员
 */
router.post('/review/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const reviewId = req.params.id
    const adminUserId = req.user.userId
    const { reason = '', pointsAwarded = 0, bonusReward = null } = req.body

    console.log('✅ 批准审核项目:', {
      reviewId,
      adminUserId,
      pointsAwarded,
      bonusReward
    })

    // 执行批准操作
    const result = await adminReviewService.approveReview({
      reviewId,
      adminUserId,
      reason,
      pointsAwarded: parseInt(pointsAwarded),
      bonusReward
    })

    res.json(
      ApiResponse.success({
        ...result,
        message: '审核项目批准成功'
      })
    )
  } catch (error) {
    console.error('❌ 批准审核失败:', error.message)

    if (error.message.includes('不存在') || error.message.includes('未找到')) {
      return res.status(404).json(
        ApiResponse.error('审核项目不存在', error.message)
      )
    }

    if (error.message.includes('已处理')) {
      return res.status(409).json(
        ApiResponse.error('审核状态冲突', error.message)
      )
    }

    res.status(500).json(
      ApiResponse.error('批准失败', error.message)
    )
  }
})

/**
 * @route POST /api/v2/admin/review/:id/reject
 * @desc 拒绝审核项目
 * @access 管理员
 */
router.post('/review/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const reviewId = req.params.id
    const adminUserId = req.user.userId
    const { reason, violationType = 'other', severity = 'medium' } = req.body

    console.log('❌ 拒绝审核项目:', {
      reviewId,
      adminUserId,
      reason,
      violationType,
      severity
    })

    // 参数验证
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '拒绝原因不能为空')
      )
    }

    // 执行拒绝操作
    const result = await adminReviewService.rejectReview({
      reviewId,
      adminUserId,
      reason: reason.trim(),
      violationType,
      severity
    })

    res.json(
      ApiResponse.success({
        ...result,
        message: '审核项目已拒绝'
      })
    )
  } catch (error) {
    console.error('❌ 拒绝审核失败:', error.message)

    if (error.message.includes('不存在') || error.message.includes('未找到')) {
      return res.status(404).json(
        ApiResponse.error('审核项目不存在', error.message)
      )
    }

    if (error.message.includes('已处理')) {
      return res.status(409).json(
        ApiResponse.error('审核状态冲突', error.message)
      )
    }

    res.status(500).json(
      ApiResponse.error('拒绝失败', error.message)
    )
  }
})

/**
 * @route GET /api/v2/admin/user/:userId/permissions
 * @desc 查看用户权限状态
 * @access 管理员
 */
router.get('/user/:userId/permissions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)

    if (!userId || isNaN(userId)) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '无效的用户ID')
      )
    }

    // 获取用户权限状态
    const permissionStatus = await permissionService.checkPremiumSpaceStatus(userId)
    const permissionStats = await permissionService.getUserPermissionStats(userId)

    res.json(
      ApiResponse.success({
        userId,
        permissions: {
          premiumSpace: permissionStatus
        },
        stats: permissionStats,
        message: '用户权限状态获取成功'
      })
    )
  } catch (error) {
    console.error('❌ 获取用户权限状态失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取权限状态失败', error.message)
    )
  }
})

/**
 * @route POST /api/v2/admin/user/:userId/grant-permission
 * @desc 管理员授予用户权限
 * @access 管理员
 */
router.post('/user/:userId/grant-permission', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    const adminUserId = req.user.userId
    const {
      permissionType,
      duration = '24hours',
      reason = '管理员授权',
      skipPointsDeduction = false
    } = req.body

    if (!userId || isNaN(userId)) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '无效的用户ID')
      )
    }

    if (!permissionType) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '权限类型不能为空')
      )
    }

    console.log('🎁 管理员授权权限:', {
      userId,
      adminUserId,
      permissionType,
      duration,
      reason,
      skipPointsDeduction
    })

    // 目前主要支持臻选空间权限
    if (permissionType !== 'premium_space') {
      return res.status(400).json(
        ApiResponse.error('参数错误', '暂不支持此权限类型')
      )
    }

    // 如果跳过积分扣除，需要管理员确认
    let result
    if (skipPointsDeduction) {
      // TODO: 实现管理员免费授权逻辑
      return res.status(501).json(
        ApiResponse.error('功能暂未实现', '管理员免费授权功能正在开发中')
      )
    } else {
      // 按正常流程解锁（需要用户有足够积分）
      const unlockConfig = permissionService.getUnlockConfig(duration)
      result = await permissionService.unlockPremiumSpace(
        userId,
        duration,
        unlockConfig.cost
      )
    }

    res.json(
      ApiResponse.success({
        ...result,
        grantedBy: adminUserId,
        grantReason: reason,
        message: '权限授予成功'
      })
    )
  } catch (error) {
    console.error('❌ 授予权限失败:', error.message)

    if (error.message.includes('积分不足')) {
      return res.status(400).json(
        ApiResponse.error('用户积分不足', '用户当前积分不足以获得此权限')
      )
    }

    res.status(500).json(
      ApiResponse.error('授予权限失败', error.message)
    )
  }
})

/**
 * @route GET /api/v2/admin/transactions/all
 * @desc 获取所有用户交易记录（管理员）
 * @access 管理员
 */
router.get('/transactions/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      timeFilter = 'all',
      typeFilter = 'all',
      amountFilter = 'all',
      statusFilter = 'all',
      userId = '',
      keyword = ''
    } = req.query

    console.log('📊 管理员获取所有交易记录:', {
      page,
      pageSize,
      timeFilter,
      typeFilter,
      userId,
      keyword
    })

    // 获取所有交易记录
    const result = await transactionService.getAllTransactions({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      timeFilter,
      typeFilter,
      amountFilter,
      statusFilter,
      userId: userId ? parseInt(userId) : null,
      keyword
    })

    res.json(
      ApiResponse.success({
        ...result,
        message: '交易记录获取成功'
      })
    )
  } catch (error) {
    console.error('❌ 获取交易记录失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取交易记录失败', error.message)
    )
  }
})

/**
 * @route GET /api/v2/admin/stats/overview
 * @desc 获取系统概览统计
 * @access 管理员
 */
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = '7days' } = req.query

    console.log('📈 获取系统概览统计:', { period })

    // 获取系统统计数据
    const stats = await adminReviewService.getSystemOverviewStats(period)

    res.json(
      ApiResponse.success({
        ...stats,
        period,
        generatedAt: new Date().toISOString(),
        message: '系统统计数据获取成功'
      })
    )
  } catch (error) {
    console.error('❌ 获取系统统计失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取系统统计失败', error.message)
    )
  }
})

/**
 * @route POST /api/v2/admin/batch-action
 * @desc 批量处理审核项目
 * @access 管理员
 */
router.post('/batch-action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reviewIds, action, reason = '' } = req.body
    const adminUserId = req.user.userId

    if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '审核ID列表不能为空')
      )
    }

    if (!['approve', 'reject', 'hold'].includes(action)) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '无效的操作类型')
      )
    }

    // 限制批量处理数量
    if (reviewIds.length > 50) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '单次最多处理50个项目')
      )
    }

    console.log('🔄 批量处理审核项目:', {
      reviewIds,
      action,
      adminUserId,
      count: reviewIds.length
    })

    // 执行批量操作
    const result = await adminReviewService.batchProcessReviews({
      reviewIds,
      action,
      adminUserId,
      reason
    })

    res.json(
      ApiResponse.success({
        ...result,
        message: `批量${action === 'approve' ? '批准' : action === 'reject' ? '拒绝' : '暂停'}完成`
      })
    )
  } catch (error) {
    console.error('❌ 批量处理失败:', error.message)
    res.status(500).json(
      ApiResponse.error('批量处理失败', error.message)
    )
  }
})

/**
 * 聊天客服系统 - 管理员相关API
 * 添加时间：2025年08月12日
 */

// 引入聊天模型
const { CustomerSession, ChatMessage } = require('../../models')

/**
 * @route GET /api/v2/admin/chat/sessions
 * @desc 获取管理员聊天会话列表（兼容前端期望路径）
 * @access 管理员
 */
router.get('/chat/sessions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id || req.user.userId
    const { status = 'all', page = 1, pageSize = 10 } = req.query

    console.log('📋 管理员获取聊天会话列表:', {
      adminId,
      status,
      page,
      pageSize
    })

    // 构建查询条件
    const where = {}
    if (status === 'pending') {
      where.status = 'waiting'
    } else if (status === 'active') {
      where.status = ['assigned', 'active']
      where.admin_id = adminId
    } else if (status === 'waiting') {
      where.status = 'waiting'
    } else if (status === 'closed') {
      where.status = 'closed'
    } else if (status !== 'all') {
      where.status = status
    }

    // 分页参数
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    // 获取会话列表和用户信息
    const { User } = require('../../models')
    const sessions = await CustomerSession.findAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'avatar_url', 'mobile'],
          required: true
        },
        {
          model: User,
          as: 'admin',
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ],
      order: [['updated_at', 'DESC']],
      limit,
      offset
    })

    // 获取每个会话的最后一条消息和消息数量
    const sessionsWithDetails = await Promise.all(sessions.map(async session => {
      const [lastMessage, messageCount, unreadCount] = await Promise.all([
        // 获取最后一条消息
        ChatMessage.findOne({
          where: { session_id: session.session_id },
          include: [
            {
              model: User,
              as: 'sender',
              attributes: ['user_id', 'nickname']
            }
          ],
          order: [['created_at', 'DESC']]
        }),

        // 获取消息总数
        ChatMessage.count({
          where: { session_id: session.session_id }
        }),

        // 获取未读消息数（用户发送但管理员未读的）
        ChatMessage.count({
          where: {
            session_id: session.session_id,
            sender_type: 'user',
            status: ['sent', 'delivered']
          }
        })
      ])

      return {
        sessionId: session.session_id,
        userId: session.user_id,
        userInfo: {
          userId: session.user.user_id,
          nickname: session.user.nickname,
          avatar: session.user.avatar_url,
          mobile: session.user.mobile
        },
        adminId: session.admin_id,
        status: session.status,
        createdAt: session.created_at,
        lastMessageTime: session.last_message_at || session.updated_at,
        lastMessage: lastMessage
          ? {
            content: lastMessage.content,
            messageType: lastMessage.message_type,
            senderId: lastMessage.sender_id,
            senderType: lastMessage.sender_type,
            createdAt: lastMessage.created_at
          }
          : null,
        messageCount,
        unreadCount,
        isOnline: true // TODO: 实现实时在线状态检测
      }
    }))

    // 获取总数用于分页
    const totalCount = await CustomerSession.count({ where })
    const totalPages = Math.ceil(totalCount / limit)
    const hasMore = page < totalPages

    res.json(ApiResponse.success({
      sessions: sessionsWithDetails,
      totalCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        hasMore
      }
    }, '管理员会话列表获取成功'))
  } catch (error) {
    console.error('❌ 获取管理员聊天会话列表失败:', error)
    res.status(500).json(ApiResponse.error('获取会话列表失败', 'ADMIN_CHAT_SESSIONS_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/admin/chat/sessions/:sessionId/messages
 * @desc 获取管理员聊天消息历史
 * @access 管理员
 */
router.get('/chat/sessions/:sessionId/messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params
    const { page = 1, pageSize = 20 } = req.query
    const adminId = req.user.user_id || req.user.userId

    console.log('📨 管理员获取聊天消息历史:', {
      sessionId,
      adminId,
      page,
      pageSize
    })

    // 验证会话存在和权限
    const session = await CustomerSession.findOne({
      where: { session_id: sessionId }
    })

    if (!session) {
      return res.status(404).json(ApiResponse.notFound('会话不存在', 'SESSION_NOT_FOUND'))
    }

    // 分页参数
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    // 获取消息列表
    const { User } = require('../../models')
    const messages = await ChatMessage.findAll({
      where: { session_id: sessionId },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['user_id', 'nickname', 'avatar_url']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    })

    // 获取消息总数
    const totalCount = await ChatMessage.count({
      where: { session_id: sessionId }
    })

    // 格式化消息数据
    const formattedMessages = messages.map(msg => ({
      messageId: msg.message_id,
      sessionId: msg.session_id,
      senderId: msg.sender_id,
      senderType: msg.sender_type,
      content: msg.content,
      messageType: msg.message_type,
      status: msg.status,
      createdAt: msg.created_at,
      attachments: msg.attachments || [],
      sender: msg.sender
        ? {
          userId: msg.sender.user_id,
          nickname: msg.sender.nickname,
          avatar: msg.sender.avatar_url
        }
        : null
    }))

    res.json(ApiResponse.success({
      messages: formattedMessages,
      totalCount,
      pagination: {
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + messages.length < totalCount
      }
    }, '消息历史获取成功'))
  } catch (error) {
    console.error('❌ 获取聊天消息历史失败:', error)
    res.status(500).json(ApiResponse.error('获取消息历史失败', 'CHAT_MESSAGES_FAILED', error.message))
  }
})

/**
 * @route POST /api/v2/admin/chat/sessions/:sessionId/messages
 * @desc 管理员发送消息
 * @access 管理员
 */
router.post('/chat/sessions/:sessionId/messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params
    const { content, messageType = 'text' } = req.body
    const adminId = req.user.user_id || req.user.userId

    console.log('💬 管理员发送消息:', {
      sessionId,
      adminId,
      messageType,
      contentLength: content?.length
    })

    // 参数验证
    if (!content || content.trim().length === 0) {
      return res.status(400).json(ApiResponse.error('消息内容不能为空', 'CONTENT_REQUIRED'))
    }

    // 验证会话存在
    const session = await CustomerSession.findOne({
      where: { session_id: sessionId }
    })

    if (!session) {
      return res.status(404).json(ApiResponse.notFound('会话不存在', 'SESSION_NOT_FOUND'))
    }

    if (session.status === 'closed') {
      return res.status(400).json(ApiResponse.error('会话已关闭', 'SESSION_CLOSED'))
    }

    // 创建消息记录
    const { v4: uuidv4 } = require('uuid')
    const messageId = `msg_${Date.now()}_${uuidv4().substr(0, 8)}`

    const message = await ChatMessage.create({
      message_id: messageId,
      session_id: sessionId,
      sender_id: adminId,
      sender_type: 'admin',
      content: content.trim(),
      message_type: messageType,
      status: 'sent'
    })

    // 更新会话状态和最后消息时间
    await session.update({
      status: 'active',
      admin_id: adminId,
      last_message_at: new Date()
    })

    // 🔥 通过WebSocket发送消息给用户
    try {
      const WebSocketServiceSingleton = require('../../services/WebSocketServiceSingleton')
      const webSocketService = WebSocketServiceSingleton.getInstance()

      if (webSocketService) {
        webSocketService.sendToUser(session.user_id, {
          type: 'admin_message',
          data: {
            messageId: message.message_id,
            sessionId,
            senderId: adminId,
            senderType: 'admin',
            content: message.content,
            messageType: message.message_type,
            createdAt: message.created_at
          }
        })
      }
    } catch (wsError) {
      console.warn('WebSocket发送消息到用户失败:', wsError.message)
    }

    res.json(ApiResponse.success({
      messageId: message.message_id,
      status: message.status,
      timestamp: message.created_at
    }, '消息发送成功'))
  } catch (error) {
    console.error('❌ 管理员发送消息失败:', error)
    res.status(500).json(ApiResponse.error('发送消息失败', 'ADMIN_MESSAGE_SEND_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/admin/chat/stats/today
 * @desc 获取管理员今日聊天统计
 * @access 管理员
 */
router.get('/chat/stats/today', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id || req.user.userId

    console.log('📊 获取管理员今日聊天统计:', { adminId })

    // 获取今日时间范围
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // 并行获取统计数据
    const [
      totalSessions,
      completedSessions,
      activeSessions,
      waitingSessions,
      todayMessages,
      avgResponseTime
    ] = await Promise.all([
      // 今日总会话数
      CustomerSession.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: today,
            [require('sequelize').Op.lt]: tomorrow
          }
        }
      }),

      // 今日完成会话数
      CustomerSession.count({
        where: {
          status: 'closed',
          updated_at: {
            [require('sequelize').Op.gte]: today,
            [require('sequelize').Op.lt]: tomorrow
          }
        }
      }),

      // 当前活跃会话数
      CustomerSession.count({
        where: {
          status: ['assigned', 'active'],
          admin_id: adminId
        }
      }),

      // 当前等待会话数
      CustomerSession.count({
        where: { status: 'waiting' }
      }),

      // 今日消息数
      ChatMessage.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: today,
            [require('sequelize').Op.lt]: tomorrow
          }
        }
      }),

      // 平均响应时间（简化计算）
      '2分钟' // TODO: 实现真实的响应时间计算
    ])

    const stats = {
      totalSessions,
      completedSessions,
      activeSessions,
      waitingSessions,
      todayMessages,
      avgResponseTime,
      customerSatisfaction: 4.8, // TODO: 实现客户满意度统计
      responseRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0
    }

    res.json(ApiResponse.success({
      stats,
      date: today.toISOString().split('T')[0],
      adminId
    }, '今日统计获取成功'))
  } catch (error) {
    console.error('❌ 获取今日聊天统计失败:', error)
    res.status(500).json(ApiResponse.error('获取统计失败', 'CHAT_STATS_FAILED', error.message))
  }
})

module.exports = router
