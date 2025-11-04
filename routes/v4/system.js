/**
 * 餐厅积分抽奖系统 V4.0 - 系统功能API路由
 * 包括系统公告、反馈系统、系统状态等功能
 */

const express = require('express')
const router = express.Router()
const { SystemAnnouncement, Feedback, User } = require('../../models')
const DataSanitizer = require('../../services/DataSanitizer')
const ApiResponse = require('../../utils/ApiResponse')
const { authenticateToken } = require('../../middleware/auth')
const dataAccessControl = require('../../middleware/dataAccessControl')
const BeijingTimeHelper = require('../../utils/timeHelper')
const { Op } = require('sequelize')

/**
 * @route GET /api/v4/system/announcements
 * @desc 获取系统公告列表
 * @access Public
 */
router.get('/announcements', dataAccessControl, async (req, res) => {
  try {
    const { type = null, priority = null, limit = 10, offset = 0 } = req.query

    const dataLevel = req.isAdmin ? 'full' : 'public'

    // 获取有效公告
    const whereClause = {
      is_active: true
    }

    // 添加过期时间过滤
    whereClause[require('sequelize').Op.or] = [
      { expires_at: null },
      { expires_at: { [require('sequelize').Op.gt]: BeijingTimeHelper.createBeijingTime() } }
    ]

    if (type && type !== 'all') whereClause.type = type
    if (priority && priority !== 'all') whereClause.priority = priority

    const announcements = await SystemAnnouncement.findAll({
      where: whereClause,
      order: [
        ['priority', 'DESC'], // 高优先级优先
        ['created_at', 'DESC'] // 新发布的优先
      ],
      limit: Math.min(parseInt(limit), 50), // 限制最大50条
      offset: parseInt(offset),
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    // 更新查看次数（仅对前10条公告）
    const viewedAnnouncements = announcements.slice(0, 10)
    for (const announcement of viewedAnnouncements) {
      await announcement.increment('view_count')
    }

    // 数据脱敏处理
    const sanitizedData = DataSanitizer.sanitizeAnnouncements(
      announcements.map(a => a.toJSON()),
      dataLevel
    )

    return ApiResponse.success(
      res,
      {
        announcements: sanitizedData,
        total: announcements.length,
        has_more: announcements.length === parseInt(limit)
      },
      '获取系统公告成功'
    )
  } catch (error) {
    console.error('获取系统公告失败:', error)
    return ApiResponse.error(res, '获取系统公告失败', 500)
  }
})

/**
 * @route GET /api/v4/system/announcements/home
 * @desc 获取首页公告（仅显示前5条重要公告）
 * @access Public
 */
router.get('/announcements/home', dataAccessControl, async (req, res) => {
  try {
    const dataLevel = req.isAdmin ? 'full' : 'public'

    const announcements = await SystemAnnouncement.findAll({
      where: {
        is_active: true,
        type: ['system', 'activity', 'notice'],
        [require('sequelize').Op.or]: [
          { expires_at: null },
          { expires_at: { [require('sequelize').Op.gt]: BeijingTimeHelper.createBeijingTime() } }
        ]
      },
      order: [
        ['priority', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: 5,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    // 更新查看次数
    for (const announcement of announcements) {
      await announcement.increment('view_count')
    }

    const sanitizedData = DataSanitizer.sanitizeAnnouncements(
      announcements.map(a => a.toJSON()),
      dataLevel
    )

    return ApiResponse.success(
      res,
      {
        announcements: sanitizedData
      },
      '获取首页公告成功'
    )
  } catch (error) {
    console.error('获取首页公告失败:', error)
    return ApiResponse.error(res, '获取首页公告失败', 500)
  }
})

/**
 * @route POST /api/v4/system/feedback
 * @desc 提交用户反馈
 * @access Private
 */
router.post('/feedback', authenticateToken, async (req, res) => {
  try {
    const { category = 'other', content, priority = 'medium', attachments = null } = req.body

    // 验证必需参数
    if (!content || content.trim().length === 0) {
      return ApiResponse.error(res, '反馈内容不能为空', 400)
    }

    if (content.length > 5000) {
      return ApiResponse.error(res, '反馈内容不能超过5000字符', 400)
    }

    // 获取用户信息
    const userInfo = {
      ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'],
      device: {
        userAgent: req.headers['user-agent'],
        platform: req.headers['x-platform'] || 'unknown'
      }
    }

    // 生成反馈ID
    const feedbackId = `fb_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random().toString(36).substr(2, 6)}`

    // 创建反馈记录
    const feedback = await Feedback.create({
      id: feedbackId,
      user_id: req.user.user_id,
      category,
      content: content.trim(),
      priority,
      attachments,
      user_ip: userInfo.ip,
      device_info: userInfo.device,
      estimated_response_time: calculateResponseTime(priority),
      created_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    // 返回脱敏后的数据
    const sanitizedFeedback = DataSanitizer.sanitizeFeedbacks([feedback.toJSON()], 'public')[0]

    return ApiResponse.success(
      res,
      {
        feedback: sanitizedFeedback
      },
      '反馈提交成功'
    )
  } catch (error) {
    console.error('提交反馈失败:', error)
    if (error.name === 'SequelizeValidationError') {
      return ApiResponse.error(res, error.errors[0].message, 400)
    }
    return ApiResponse.error(res, '提交反馈失败', 500)
  }
})

/**
 * @route GET /api/v4/system/feedback/my
 * @desc 获取我的反馈列表
 * @access Private
 */
router.get('/feedback/my', authenticateToken, async (req, res) => {
  try {
    const { status = null, limit = 10, offset = 0 } = req.query

    const whereClause = { user_id: req.user.user_id }
    if (status && status !== 'all') {
      whereClause.status = status
    }

    const feedbacks = await Feedback.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: Math.min(parseInt(limit), 50),
      offset: parseInt(offset),
      include: [
        {
          model: User,
          as: 'admin',
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ]
    })

    // 数据脱敏处理
    const sanitizedData = DataSanitizer.sanitizeFeedbacks(
      feedbacks.map(f => f.toJSON()),
      'public'
    )

    return ApiResponse.success(
      res,
      {
        feedbacks: sanitizedData,
        total: feedbacks.length
      },
      '获取反馈列表成功'
    )
  } catch (error) {
    console.error('获取反馈列表失败:', error)
    return ApiResponse.error(res, '获取反馈列表失败', 500)
  }
})

/**
 * @route GET /api/v4/system/feedback/:id
 * @desc 获取单个反馈详情
 * @access Private
 */
router.get('/feedback/:id', authenticateToken, async (req, res) => {
  try {
    const { id: feedback_id } = req.params
    const user_id = req.user.user_id

    // 查找反馈记录
    const feedback = await Feedback.findByPk(feedback_id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        },
        {
          model: User,
          as: 'admin',
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ]
    })

    if (!feedback) {
      return ApiResponse.error(res, '反馈不存在', 404)
    }

    // 权限验证：用户只能查看自己的反馈，管理员可以查看所有反馈
    const { getUserRoles } = require('../middleware/auth')
    const userRoles = await getUserRoles(user_id)

    if (!userRoles.isAdmin && feedback.user_id !== user_id) {
      return ApiResponse.error(res, '无权限查看此反馈', 403)
    }

    // 格式化反馈详情
    const feedbackDetail = {
      feedback_id: feedback.feedback_id,
      category: feedback.category,
      content: feedback.content,
      attachments: feedback.attachments || [],
      status: feedback.status,
      priority: feedback.priority,

      // 用户信息
      user_info: feedback.user
        ? {
          user_id: feedback.user.user_id,
          mobile: userRoles.isAdmin ? feedback.user.mobile : '****',
          nickname: feedback.user.nickname || '匿名用户'
        }
        : null,

      // 处理信息
      admin_reply: feedback.admin_reply,
      admin_info: feedback.admin
        ? {
          admin_id: feedback.admin.user_id,
          admin_name: feedback.admin.nickname || '管理员'
        }
        : null,

      // 时间信息
      created_at: feedback.created_at,
      replied_at: feedback.replied_at,
      resolved_at: feedback.resolved_at,

      // 处理进度
      estimated_response_time: feedback.calculateEstimatedResponseTime(feedback.priority),
      processing_notes: userRoles.isAdmin ? feedback.processing_notes : undefined
    }

    // 数据脱敏处理
    const sanitizedDetail = DataSanitizer.sanitizeFeedbacks(
      [feedbackDetail],
      userRoles.isAdmin ? 'full' : 'public'
    )[0]

    return ApiResponse.success(res, sanitizedDetail, '获取反馈详情成功')
  } catch (error) {
    console.error('获取反馈详情失败:', error)
    return ApiResponse.error(res, '获取反馈详情失败', 500)
  }
})

/**
 * @route GET /api/v4/system/status
 * @desc 获取系统状态信息
 * @access Public
 */
router.get('/status', dataAccessControl, async (req, res) => {
  try {
    const dataLevel = req.isAdmin ? 'full' : 'public'

    // 系统基本状态
    const systemStatus = {
      server_time: BeijingTimeHelper.nowLocale(),
      status: 'running',
      version: '4.0.0'
    }

    // 管理员可见的详细信息
    if (dataLevel === 'full') {
      const [totalUsers, totalAnnouncements, pendingFeedbacks] = await Promise.all([
        User.count(),
        SystemAnnouncement.count({ where: { is_active: true } }),
        Feedback.count({ where: { status: 'pending' } })
      ])

      systemStatus.statistics = {
        total_users: totalUsers,
        active_announcements: totalAnnouncements,
        pending_feedbacks: pendingFeedbacks
      }
    }

    return ApiResponse.success(
      res,
      {
        system: systemStatus
      },
      '获取系统状态成功'
    )
  } catch (error) {
    console.error('获取系统状态失败:', error)
    return ApiResponse.error(res, '获取系统状态失败', 500)
  }
})

/**
 * @route GET /api/v4/system/business-config
 * @desc 获取业务配置（前后端共享配置）
 * @access Public
 *
 * @description
 * 返回统一的业务配置，包括：
 * - 连抽定价配置（单抽/3连抽/5连抽/10连抽）
 * - 积分系统规则（上限/下限/验证规则）
 * - 用户系统配置（昵称规则/验证码有效期）
 * - 图片上传限制（文件大小/类型/数量）
 * - 分页配置（用户/管理员）
 */
router.get('/business-config', dataAccessControl, async (req, res) => {
  try {
    // 读取业务配置文件
    const businessConfig = require('../../config/business.config')

    // 根据用户角色返回不同级别的配置
    const dataLevel = req.isAdmin ? 'full' : 'public'

    // 公开配置（所有用户可见）
    const publicConfig = {
      lottery: {
        draw_pricing: businessConfig.lottery.draw_pricing, // 连抽定价配置（修正：使用下划线命名）
        daily_limit: businessConfig.lottery.daily_limit.all, // 每日抽奖上限（修正：使用下划线命名）
        free_draw_allowed: businessConfig.lottery.free_draw_allowed // 是否允许免费抽奖（修正：使用下划线命名）
      },
      points: {
        display_name: businessConfig.points.display_name, // 积分显示名称（修正：使用下划线命名）
        max_balance: businessConfig.points.max_balance, // 积分上限（修正：使用下划线命名）
        min_balance: businessConfig.points.min_balance // 积分下限（修正：使用下划线命名）
      },
      user: {
        nickname: {
          min_length: businessConfig.user.nickname.min_length, // 昵称最小长度（修正：使用下划线命名）
          max_length: businessConfig.user.nickname.max_length // 昵称最大长度（修正：使用下划线命名）
        },
        verification_code: {
          expiry_seconds: businessConfig.user.verification_code.expiry_seconds, // 验证码有效期（秒）（修正：使用下划线命名）
          resend_interval: businessConfig.user.verification_code.resend_interval // 重发间隔（秒）（修正：使用下划线命名）
        }
      },
      upload: {
        image: {
          max_size_mb: businessConfig.upload.image.max_size_mb, // 图片最大大小（MB）（修正：使用下划线命名）
          max_count: businessConfig.upload.image.max_count, // 单次最大上传数量（修正：使用下划线命名）
          allowed_types: businessConfig.upload.image.allowed_types // 允许的文件类型（修正：使用下划线命名）
        }
      },
      pagination: {
        user: businessConfig.pagination.user, // 普通用户分页配置（无需修改，已是正确格式）
        admin: dataLevel === 'full' ? businessConfig.pagination.admin : undefined // 管理员分页配置（仅管理员可见）（无需修改）
      }
    }

    // 管理员可见的完整配置
    if (dataLevel === 'full') {
      publicConfig.points.validation = businessConfig.points.validation // 积分验证规则（仅管理员可见）
      publicConfig.lottery.daily_limit_reset_time = businessConfig.lottery.daily_limit.reset_time // 每日限制重置时间（仅管理员可见）（修正：使用下划线命名）
    }

    return ApiResponse.success(
      res,
      {
        config: publicConfig,
        version: '4.0.0',
        last_updated: '2025-10-21'
      },
      '获取业务配置成功'
    )
  } catch (error) {
    console.error('获取业务配置失败:', error)
    return ApiResponse.error(res, '获取业务配置失败', 500)
  }
})

/**
 * @route POST /api/v4/system/chat/create
 * @desc 创建聊天会话
 * @access Private
 */
router.post('/chat/create', authenticateToken, async (req, res) => {
  try {
    const { CustomerServiceSession } = require('../../models')

    // 检查是否已有未关闭的会话（waiting/assigned/active状态）
    const existingSession = await CustomerServiceSession.findOne({
      where: {
        user_id: req.user.user_id,
        status: ['waiting', 'assigned', 'active']
      },
      order: [['created_at', 'DESC']]
    })

    if (existingSession) {
      return ApiResponse.success(
        res,
        {
          session_id: existingSession.session_id,
          status: existingSession.status,
          source: existingSession.source,
          created_at: existingSession.created_at
        },
        '使用现有会话'
      )
    }

    /*
     * 创建新会话，初始状态为waiting（等待客服接单）
     * session_id 现在是BIGINT AUTO_INCREMENT主键，不再手动赋值
     */
    const session = await CustomerServiceSession.create({
      user_id: req.user.user_id,
      status: 'waiting',
      source: 'mobile', // 默认来源为mobile
      priority: 1,
      created_at: BeijingTimeHelper.createBeijingTime()
    })

    return ApiResponse.success(
      res,
      {
        session_id: session.session_id,
        status: session.status,
        source: session.source,
        created_at: session.created_at
      },
      '聊天会话创建成功'
    )
  } catch (error) {
    console.error('创建聊天会话失败:', error)
    return ApiResponse.error(res, '创建聊天会话失败', 500)
  }
})

/**
 * @route GET /api/v4/system/chat/sessions
 * @desc 获取用户聊天会话列表
 * @access Private
 */
router.get('/chat/sessions', authenticateToken, async (req, res) => {
  try {
    const { CustomerServiceSession, ChatMessage } = require('../../models')

    const sessions = await CustomerServiceSession.findAll({
      where: { user_id: req.user.user_id },
      include: [
        {
          model: ChatMessage,
          as: 'messages',
          limit: 1,
          order: [['created_at', 'DESC']],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: 10
    })

    const sessionData = sessions.map(session => {
      const lastMessage = session.messages && session.messages[0]
      return {
        session_id: session.session_id,
        type: session.type,
        status: session.status,
        created_at: session.created_at,
        last_message: lastMessage
          ? {
            content: lastMessage.content,
            sender_type: lastMessage.sender_type,
            created_at: lastMessage.created_at
          }
          : null,
        unread_count: 0 // TODO: 实现未读消息计数
      }
    })

    return ApiResponse.success(
      res,
      {
        sessions: sessionData
      },
      '获取会话列表成功'
    )
  } catch (error) {
    console.error('获取会话列表失败:', error)
    return ApiResponse.error(res, '获取会话列表失败', 500)
  }
})

/**
 * @route GET /api/v4/system/chat/history/:sessionId
 * @desc 获取聊天历史记录
 * @access Private
 */
router.get('/chat/history/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params
    const { page = 1, limit = 50 } = req.query
    // 🎯 分页安全保护：最大100条记录（普通用户聊天历史）
    const finalLimit = Math.min(parseInt(limit), 100)
    const { ChatMessage, CustomerServiceSession } = require('../../models')

    // 验证会话权限
    const session = await CustomerServiceSession.findOne({
      where: {
        session_id: sessionId,
        user_id: req.user.user_id
      }
    })

    if (!session) {
      return ApiResponse.error(res, '会话不存在或无权限访问', 404)
    }

    const offset = (page - 1) * finalLimit

    const { count, rows: messages } = await ChatMessage.findAndCountAll({
      where: { session_id: sessionId },
      order: [['created_at', 'DESC']],
      limit: finalLimit,
      offset,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ]
    })

    return ApiResponse.success(
      res,
      {
        messages: messages.reverse().map(msg => msg.toJSON()),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      },
      '获取聊天历史成功'
    )
  } catch (error) {
    console.error('获取聊天历史失败:', error)
    return ApiResponse.error(res, '获取聊天历史失败', 500)
  }
})

/**
 * @route POST /api/v4/system/chat/send
 * @desc 发送聊天消息
 * @access Private
 */
router.post('/chat/send', authenticateToken, async (req, res) => {
  try {
    const { session_id, content, message_type = 'text' } = req.body
    const { ChatMessage, CustomerServiceSession } = require('../../models')

    // 验证参数
    if (!session_id || !content) {
      return ApiResponse.error(res, '会话ID和消息内容不能为空', 400)
    }

    if (content.length > 5000) {
      return ApiResponse.error(res, '消息内容不能超过5000字符', 400)
    }

    // 验证会话权限
    const session = await CustomerServiceSession.findOne({
      where: {
        session_id,
        user_id: req.user.user_id
      }
    })

    if (!session) {
      return ApiResponse.error(res, '会话不存在或无权限访问', 404)
    }

    // 允许waiting、assigned、active状态发送消息（排队中/已分配/处理中都可以发消息）
    if (!['waiting', 'assigned', 'active'].includes(session.status)) {
      return ApiResponse.error(res, '会话已关闭，无法发送消息', 400)
    }

    /*
     * 创建消息记录
     * message_id 现在是BIGINT AUTO_INCREMENT主键，不再手动赋值
     */
    const message = await ChatMessage.create({
      session_id,
      sender_id: req.user.user_id,
      sender_type: 'user',
      message_source: 'user_client', // 明确标记消息来源
      content: content.trim(),
      message_type,
      created_at: BeijingTimeHelper.createBeijingTime()
    })

    // 更新会话的最后活动时间
    await session.update({
      last_message_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    // ✅ 通过WebSocket实时推送消息给客服
    try {
      const ChatWebSocketService = require('../../services/ChatWebSocketService')

      // 构建消息数据
      const messageData = {
        message_id: message.message_id,
        session_id,
        sender_id: req.user.user_id,
        sender_type: 'user',
        sender_name: req.user.nickname || '用户',
        content: message.content,
        message_type: message.message_type,
        created_at: message.created_at,
        timestamp: BeijingTimeHelper.timestamp()
      }

      // 如果会话已分配客服，推送给该客服；否则广播给所有在线客服
      if (session.admin_id) {
        const pushed = ChatWebSocketService.pushMessageToAdmin(session.admin_id, messageData)
        if (!pushed) {
          console.log(`⚠️ 客服 ${session.admin_id} 不在线，消息已保存到数据库`)
        }
      } else {
        const count = ChatWebSocketService.broadcastToAllAdmins(messageData)
        if (count === 0) {
          console.log('⚠️ 当前无在线客服，消息已保存到数据库')
        }
      }
    } catch (wsError) {
      // WebSocket推送失败不影响消息发送
      console.error('WebSocket推送失败:', wsError.message)
      console.log('✅ 消息已保存到数据库，稍后可通过轮询获取')
    }

    return ApiResponse.success(
      res,
      {
        message_id: message.message_id, // 使用正确的字段名message_id
        session_id,
        content: message.content,
        message_type: message.message_type,
        sent_at: message.created_at
      },
      '消息发送成功'
    )
  } catch (error) {
    console.error('发送消息失败:', error)
    return ApiResponse.error(res, '发送消息失败', 500)
  }
})

/**
 * @route POST /api/v4/system/chat/admin-reply
 * @desc 管理员回复用户消息
 * @access Private (仅管理员)
 */
router.post('/chat/admin-reply', authenticateToken, async (req, res) => {
  try {
    const { session_id, content, message_type = 'text' } = req.body
    const { ChatMessage, CustomerServiceSession } = require('../../models')
    const BeijingTimeHelper = require('../../utils/timeHelper') // ✅ 修复：正确的路径

    // 验证管理员权限（基于role_level）
    if (!req.user || req.user.role_level < 100) {
      return res.apiForbidden('需要管理员权限')
    }

    // 验证参数
    if (!session_id || !content) {
      return res.apiBadRequest('会话ID和消息内容不能为空')
    }

    if (content.length > 5000) {
      return res.apiBadRequest('消息内容不能超过5000字符')
    }

    // 验证会话是否存在
    const session = await CustomerServiceSession.findOne({
      where: { session_id }
    })

    if (!session) {
      return res.apiNotFound('会话不存在')
    }

    // 检查会话状态（waiting、assigned、active都可以回复）
    if (!['waiting', 'assigned', 'active'].includes(session.status)) {
      return res.apiBadRequest('会话已关闭，无法发送消息')
    }

    // 检查管理员权限（如果会话已分配给其他管理员，需要超级管理员权限才能回复）
    if (session.admin_id && session.admin_id !== req.user.user_id) {
      if (req.user.role_level < 100) {
        return res.apiForbidden('此会话已分配给其他客服')
      }
    }

    // 如果会话未分配，自动分配给当前管理员
    if (!session.admin_id) {
      await session.update({
        admin_id: req.user.user_id,
        status: 'assigned',
        updated_at: BeijingTimeHelper.createBeijingTime()
      })
    }

    // 创建消息记录
    const message = await ChatMessage.create({
      session_id,
      sender_id: req.user.user_id,
      sender_type: 'admin',
      message_source: 'admin_client',
      content: content.trim(),
      message_type,
      created_at: BeijingTimeHelper.createBeijingTime()
    })

    // 更新会话的最后活动时间
    await session.update({
      last_message_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    // ✅ 通过WebSocket实时推送消息给用户
    try {
      const ChatWebSocketService = require('../../services/ChatWebSocketService')

      const messageData = {
        message_id: message.message_id,
        session_id,
        sender_id: req.user.user_id,
        sender_type: 'admin',
        sender_name: req.user.nickname || '客服',
        content: message.content,
        message_type: message.message_type,
        created_at: message.created_at
      }

      const pushed = ChatWebSocketService.pushMessageToUser(session.user_id, messageData)
      if (!pushed) {
        console.log(`⚠️ 用户 ${session.user_id} 不在线，消息已保存到数据库`)
      }
    } catch (wsError) {
      // WebSocket推送失败不影响消息发送
      console.error('WebSocket推送失败:', wsError.message)
      console.log('✅ 消息已保存到数据库')
    }

    // ✅ 使用中间件方法，代码更简洁
    const responseData = {
      message_id: message.message_id,
      session_id,
      content: message.content,
      message_type: message.message_type,
      sent_at: message.created_at
    }

    return res.apiSuccess(responseData, '消息发送成功')
  } catch (error) {
    console.error('管理员回复失败:', error)
    return res.apiInternalError('发送消息失败')
  }
})

/**
 * @route GET /api/v4/system/user/statistics/:user_id
 * @desc 获取用户个人统计数据
 * @access Private
 */
router.get('/user/statistics/:user_id', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const { user_id } = req.params
    const currentUserId = req.user.user_id
    const isAdmin = req.isAdmin

    // 权限检查：只能查看自己的统计或管理员查看任何用户
    if (parseInt(user_id) !== currentUserId && !isAdmin) {
      return ApiResponse.error(res, '无权限查看其他用户统计', 403)
    }

    const dataLevel = isAdmin ? 'full' : 'public'

    // 并行查询各种统计数据
    const [userInfo, lotteryStats, inventoryStats, pointsStats, exchangeStats, consumptionStats] =
      await Promise.all([
        // 基本用户信息
        User.findByPk(user_id, {
          attributes: ['user_id', 'nickname', 'created_at', 'updated_at']
        }),

        // 抽奖统计
        require('../models').LotteryDraw.findAll({
          where: { user_id },
          attributes: [
            [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_draws'],
            [
              require('sequelize').fn(
                'COUNT',
                require('sequelize').literal('CASE WHEN prize_won = true THEN 1 END')
              ),
              'winning_draws'
            ]
          ],
          raw: true
        }),

        // 库存统计
        require('../models').UserInventory.findAll({
          where: { user_id },
          attributes: [
            [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_items'],
            [
              require('sequelize').fn(
                'COUNT',
                require('sequelize').literal('CASE WHEN status = "available" THEN 1 END')
              ),
              'available_items'
            ]
          ],
          raw: true
        }),

        // 积分统计（过滤已删除记录）
        require('../models').PointsTransaction.findAll({
          where: {
            user_id,
            is_deleted: 0 // 统计时排除已删除的记录
          },
          attributes: [
            [
              require('sequelize').fn(
                'SUM',
                require('sequelize').literal(
                  'CASE WHEN transaction_type = "earn" THEN points ELSE 0 END'
                )
              ),
              'total_earned'
            ],
            [
              require('sequelize').fn(
                'SUM',
                require('sequelize').literal(
                  'CASE WHEN transaction_type = "consume" THEN points ELSE 0 END'
                )
              ),
              'total_consumed'
            ],
            [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_transactions']
          ],
          raw: true
        }),

        // 兑换统计（过滤已删除记录）
        require('../models').ExchangeRecords.findAll({
          where: {
            user_id,
            is_deleted: 0 // 统计时排除已删除的记录
          },
          attributes: [
            [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_exchanges'],
            [
              require('sequelize').fn('SUM', require('sequelize').col('total_points')),
              'total_points_spent'
            ] // ✅ 修复：使用正确的字段名total_points
          ],
          raw: true
        }),

        // 🔄 消费记录统计（新业务：商家扫码录入）（过滤已删除记录）
        require('../models').ConsumptionRecord
          ? require('../models').ConsumptionRecord.findAll({
            where: {
              user_id,
              is_deleted: 0 // 统计时排除已删除的记录
            },
            attributes: [
              [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_consumptions'],
              [require('sequelize').fn('SUM', require('sequelize').col('consumption_amount')), 'total_amount'],
              [require('sequelize').fn('SUM', require('sequelize').col('points_to_award')), 'total_points']
            ],
            raw: true
          })
          : Promise.resolve([{ total_consumptions: 0, total_amount: 0, total_points: 0 }]) // 向后兼容
      ])

    if (!userInfo) {
      return ApiResponse.error(res, '用户不存在', 404)
    }

    // 构建统计数据
    const statistics = {
      user_id: parseInt(user_id),
      account_created: userInfo.created_at,
      last_activity: userInfo.updated_at,

      // 抽奖统计
      lottery_count: parseInt(lotteryStats[0]?.total_draws || 0),
      lottery_wins: parseInt(lotteryStats[0]?.winning_draws || 0),
      lottery_win_rate:
        lotteryStats[0]?.total_draws > 0
          ? (((lotteryStats[0]?.winning_draws || 0) / lotteryStats[0]?.total_draws) * 100).toFixed(
            1
          ) + '%'
          : '0%',

      // 库存统计
      inventory_total: parseInt(inventoryStats[0]?.total_items || 0),
      inventory_available: parseInt(inventoryStats[0]?.available_items || 0),

      // 积分统计
      total_points_earned: parseInt(pointsStats[0]?.total_earned || 0),
      total_points_consumed: parseInt(pointsStats[0]?.total_consumed || 0),
      points_balance:
        parseInt(pointsStats[0]?.total_earned || 0) - parseInt(pointsStats[0]?.total_consumed || 0),
      transaction_count: parseInt(pointsStats[0]?.total_transactions || 0),

      // 兑换统计
      exchange_count: parseInt(exchangeStats[0]?.total_exchanges || 0),
      exchange_points_spent: parseInt(exchangeStats[0]?.total_points_spent || 0),

      // 🔄 消费记录统计（新业务：商家扫码录入）
      consumption_count: parseInt(consumptionStats[0]?.total_consumptions || 0), // 消费记录数
      consumption_amount: parseFloat(consumptionStats[0]?.total_amount || 0), // 总消费金额(元)
      consumption_points: parseInt(consumptionStats[0]?.total_points || 0), // 总奖励积分

      // 活跃度评分（简单算法）
      activity_score: Math.min(
        100,
        Math.floor(
          parseInt(lotteryStats[0]?.total_draws || 0) * 2 +
            parseInt(exchangeStats[0]?.total_exchanges || 0) * 3 +
            parseInt(consumptionStats[0]?.total_consumptions || 0) * 5 // 🔄 使用消费记录数
        )
      ),

      // 成就徽章（示例）
      achievements: []
    }

    // 添加成就徽章
    if (statistics.lottery_count >= 10) {
      statistics.achievements.push({ name: '抽奖达人', icon: '🎰', unlocked: true })
    }
    if (statistics.lottery_win_rate && parseFloat(statistics.lottery_win_rate) >= 30) {
      statistics.achievements.push({ name: '幸运之星', icon: '⭐', unlocked: true })
    }
    if (statistics.exchange_count >= 5) {
      statistics.achievements.push({ name: '兑换专家', icon: '🛒', unlocked: true })
    }
    // 🔄 消费记录相关成就（新业务：商家扫码录入）
    if (statistics.consumption_count >= 10) {
      statistics.achievements.push({ name: '消费达人', icon: '💳', unlocked: true })
    }
    if (statistics.consumption_amount >= 1000) {
      statistics.achievements.push({ name: '千元大客', icon: '💰', unlocked: true })
    }

    // 数据脱敏处理
    const sanitizedStatistics = DataSanitizer.sanitizeUserStatistics(statistics, dataLevel)

    return ApiResponse.success(
      res,
      {
        statistics: sanitizedStatistics
      },
      '获取用户统计成功'
    )
  } catch (error) {
    console.error('获取用户统计失败:', error)
    return ApiResponse.error(res, '获取用户统计失败', 500)
  }
})

/**
 * @route GET /api/v4/system/admin/overview
 * @desc 获取管理员系统概览
 * @access Admin Only
 */
router.get('/admin/overview', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return ApiResponse.error(res, '需要管理员权限', 403)
    }

    // 并行查询系统统计数据
    const [userStats, lotteryStats, pointsStats, systemHealth] = await Promise.all([
      // 用户统计
      User.findAll({
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_users'],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
            ),
            'new_users_today'
          ],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal(
                'CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END'
              )
            ),
            'active_users_24h'
          ]
        ],
        raw: true
      }),

      // 抽奖统计
      require('../models').LotteryDraw.findAll({
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_draws'],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
            ),
            'draws_today'
          ],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN prize_won = true THEN 1 END')
            ),
            'total_wins'
          ]
        ],
        raw: true
      }),

      // 积分统计（过滤已删除记录）
      require('../models').PointsTransaction.findAll({
        where: {
          is_deleted: 0 // 系统统计时排除已删除的记录
        },
        attributes: [
          [
            require('sequelize').fn(
              'SUM',
              require('sequelize').literal(
                'CASE WHEN transaction_type = "earn" THEN points ELSE 0 END'
              )
            ),
            'total_points_issued'
          ],
          [
            require('sequelize').fn(
              'SUM',
              require('sequelize').literal(
                'CASE WHEN transaction_type = "consume" THEN points ELSE 0 END'
              )
            ),
            'total_points_consumed'
          ],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
            ),
            'transactions_today'
          ]
        ],
        raw: true
      }),

      // 系统健康状态
      Promise.resolve({
        server_uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        node_version: process.version
      })
    ])

    const overview = {
      timestamp: BeijingTimeHelper.nowLocale(),

      // 用户数据
      users: {
        total: parseInt(userStats[0]?.total_users || 0),
        new_today: parseInt(userStats[0]?.new_users_today || 0),
        active_24h: parseInt(userStats[0]?.active_users_24h || 0)
      },

      // 抽奖数据
      lottery: {
        total_draws: parseInt(lotteryStats[0]?.total_draws || 0),
        draws_today: parseInt(lotteryStats[0]?.draws_today || 0),
        total_wins: parseInt(lotteryStats[0]?.total_wins || 0),
        win_rate:
          lotteryStats[0]?.total_draws > 0
            ? (((lotteryStats[0]?.total_wins || 0) / lotteryStats[0]?.total_draws) * 100).toFixed(
              1
            ) + '%'
            : '0%'
      },

      // 积分数据
      points: {
        total_issued: parseInt(pointsStats[0]?.total_points_issued || 0),
        total_consumed: parseInt(pointsStats[0]?.total_points_consumed || 0),
        transactions_today: parseInt(pointsStats[0]?.transactions_today || 0),
        circulation_rate:
          pointsStats[0]?.total_points_issued > 0
            ? (
              ((pointsStats[0]?.total_points_consumed || 0) /
                  pointsStats[0]?.total_points_issued) *
                100
            ).toFixed(1) + '%'
            : '0%'
      },

      // 系统状态
      system: {
        uptime_hours: Math.floor(systemHealth.server_uptime / 3600),
        memory_used_mb: Math.floor(systemHealth.memory_usage.used / 1024 / 1024),
        memory_total_mb: Math.floor(systemHealth.memory_usage.rss / 1024 / 1024),
        node_version: systemHealth.node_version,
        status: 'healthy'
      }
    }

    // 管理员看完整数据，无需脱敏
    const sanitizedOverview = DataSanitizer.sanitizeSystemOverview(overview, 'full')

    return ApiResponse.success(
      res,
      {
        overview: sanitizedOverview
      },
      '获取系统概览成功'
    )
  } catch (error) {
    console.error('获取系统概览失败:', error)
    return ApiResponse.error(res, '获取系统概览失败', 500)
  }
})

/**
 * @route GET /api/v4/system/admin/chat/sessions
 * @desc 管理员获取所有聊天会话列表
 * @access Private (管理员权限)
 */
router.get('/admin/chat/sessions', authenticateToken, async (req, res) => {
  try {
    const { getUserRoles } = require('../../middleware/auth')

    // 🛡️ 权限检查：只有管理员可以查看所有会话
    const userRoles = await getUserRoles(req.user.user_id)
    if (!userRoles.isAdmin) {
      return ApiResponse.error(res, '权限不足，仅管理员可访问', 403)
    }

    const { page = 1, limit = 20, status = 'all', type = 'all' } = req.query
    // 🎯 分页安全保护：最大100条记录（管理员权限）
    const finalLimit = Math.min(parseInt(limit), 100)
    const { CustomerServiceSession, ChatMessage, User } = require('../../models')

    // 构建查询条件
    const whereClause = {}
    if (status !== 'all') {
      whereClause.status = status
    }
    if (type !== 'all') {
      whereClause.type = type
    }

    // 获取聊天会话列表
    const { count, rows: sessions } = await CustomerServiceSession.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'mobile', 'display_name'],
          required: true
        },
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'mobile', 'display_name'],
          required: false
        },
        {
          model: ChatMessage,
          as: 'messages',
          limit: 1,
          order: [['created_at', 'DESC']],
          required: false,
          attributes: ['id', 'content', 'sender_type', 'created_at']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: finalLimit,
      offset: (parseInt(page) - 1) * finalLimit
    })

    // 使用DataSanitizer进行数据脱敏
    const DataSanitizer = require('../../services/DataSanitizer')
    const sanitizedSessions = DataSanitizer.sanitizeChatSessions
      ? DataSanitizer.sanitizeChatSessions(sessions, 'full')
      : sessions

    // 格式化响应数据
    const formattedSessions = sanitizedSessions.map(session => {
      const lastMessage = session.messages && session.messages[0]
      return {
        session_id: session.session_id,
        user_id: session.user_id,
        user_info: session.user
          ? {
            mobile: session.user.mobile,
            display_name: session.user.display_name
          }
          : null,
        admin_id: session.admin_id,
        admin_info: session.admin
          ? {
            mobile: session.admin.mobile,
            display_name: session.admin.display_name
          }
          : null,
        type: session.type,
        status: session.status,
        created_at: session.created_at,
        updated_at: session.updated_at,
        last_message: lastMessage
          ? {
            content:
                lastMessage.content.length > 50
                  ? lastMessage.content.substring(0, 50) + '...'
                  : lastMessage.content,
            sender_type: lastMessage.sender_type,
            created_at: lastMessage.created_at
          }
          : null,
        unread_count: 0 // TODO: 实现未读消息计数
      }
    })

    console.log(`管理员 ${req.user.user_id} 查看聊天会话列表`, {
      total: count,
      page: parseInt(page),
      status,
      type
    })

    return ApiResponse.success(
      res,
      {
        sessions: formattedSessions,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / parseInt(limit)),
          total_count: count,
          has_next: count > parseInt(page) * parseInt(limit)
        },
        filters: {
          status,
          type
        }
      },
      '管理员聊天会话列表获取成功'
    )
  } catch (error) {
    console.error('管理员获取聊天会话列表失败:', error)
    return ApiResponse.error(res, '获取聊天会话列表失败', 500)
  }
})

/**
 * @route PUT /api/v4/system/admin/chat/sessions/:sessionId/assign
 * @desc 管理员分配聊天会话给特定管理员
 * @access Private (管理员权限)
 */
router.put('/admin/chat/sessions/:sessionId/assign', authenticateToken, async (req, res) => {
  try {
    const { getUserRoles } = require('../../middleware/auth')

    // 🛡️ 权限检查：只有管理员可以分配会话
    const userRoles = await getUserRoles(req.user.user_id)
    if (!userRoles.isAdmin) {
      return ApiResponse.error(res, '权限不足，仅管理员可访问', 403)
    }

    const { sessionId } = req.params
    const { admin_id } = req.body
    const { CustomerServiceSession } = require('../../models')

    // 查找会话
    const session = await CustomerServiceSession.findOne({
      where: { session_id: sessionId }
    })

    if (!session) {
      return ApiResponse.error(res, '聊天会话不存在', 404)
    }

    // 更新会话分配
    await session.update({
      admin_id: admin_id || null,
      status: admin_id ? 'assigned' : 'waiting',
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    console.log(`管理员 ${req.user.user_id} 分配会话 ${sessionId} 给管理员 ${admin_id}`)

    return ApiResponse.success(
      res,
      {
        session_id: sessionId,
        admin_id,
        status: session.status
      },
      '会话分配成功'
    )
  } catch (error) {
    console.error('管理员分配聊天会话失败:', error)
    return ApiResponse.error(res, '分配聊天会话失败', 500)
  }
})

/**
 * @route PUT /api/v4/system/admin/chat/sessions/:sessionId/close
 * @desc 管理员关闭聊天会话
 * @access Private (管理员权限)
 */
router.put('/admin/chat/sessions/:sessionId/close', authenticateToken, async (req, res) => {
  try {
    const { getUserRoles } = require('../../middleware/auth')

    // 🛡️ 权限检查：只有管理员可以关闭会话
    const userRoles = await getUserRoles(req.user.user_id)
    if (!userRoles.isAdmin) {
      return ApiResponse.error(res, '权限不足，仅管理员可访问', 403)
    }

    const { sessionId } = req.params
    const { close_reason = '管理员关闭' } = req.body
    const { CustomerServiceSession, ChatMessage } = require('../../models')

    // 查找会话
    const session = await CustomerServiceSession.findOne({
      where: { session_id: sessionId }
    })

    if (!session) {
      return ApiResponse.error(res, '聊天会话不存在', 404)
    }

    if (session.status === 'closed') {
      return ApiResponse.error(res, '会话已关闭', 400)
    }

    // 关闭会话
    await session.update({
      status: 'closed',
      close_reason,
      closed_by: req.user.user_id,
      closed_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    // 添加系统消息记录会话关闭
    await ChatMessage.create({
      session_id: sessionId,
      sender_id: req.user.user_id,
      sender_type: 'system',
      content: `会话已被管理员关闭：${close_reason}`,
      message_type: 'system',
      created_at: BeijingTimeHelper.createBeijingTime()
    })

    console.log(`管理员 ${req.user.user_id} 关闭会话 ${sessionId}，原因：${close_reason}`)

    return ApiResponse.success(
      res,
      {
        session_id: sessionId,
        status: 'closed',
        closed_at: session.closed_at,
        close_reason
      },
      '会话关闭成功'
    )
  } catch (error) {
    console.error('管理员关闭聊天会话失败:', error)
    return ApiResponse.error(res, '关闭聊天会话失败', 500)
  }
})

/**
 * @route GET /api/v4/system/admin/chat/stats
 * @desc 管理员获取聊天系统统计数据
 * @access Private (管理员权限)
 */
router.get('/admin/chat/stats', authenticateToken, async (req, res) => {
  try {
    const { getUserRoles } = require('../../middleware/auth')

    // 🛡️ 权限检查：只有管理员可以查看统计
    const userRoles = await getUserRoles(req.user.user_id)
    if (!userRoles.isAdmin) {
      return ApiResponse.error(res, '权限不足，仅管理员可访问', 403)
    }

    const { CustomerServiceSession, ChatMessage } = require('../../models')
    const BeijingTimeHelper = require('../../utils/timeHelper')

    // 获取今日时间范围
    const todayStart = BeijingTimeHelper.getStartOfDay()
    const todayEnd = BeijingTimeHelper.getEndOfDay()

    // 并行获取统计数据
    const [
      totalSessions,
      activeSessions,
      todaySessions,
      todayMessages,
      avgResponseTime,
      sessionsByStatus
    ] = await Promise.all([
      // 总会话数
      CustomerServiceSession.count(),

      // 活跃会话数（waiting/assigned/active状态）
      CustomerServiceSession.count({
        where: { status: ['waiting', 'assigned', 'active'] }
      }),

      // 今日新会话
      CustomerServiceSession.count({
        where: {
          created_at: {
            [Op.gte]: todayStart,
            [Op.lte]: todayEnd
          }
        }
      }),

      // 今日消息数
      ChatMessage.count({
        where: {
          created_at: {
            [Op.gte]: todayStart,
            [Op.lte]: todayEnd
          }
        }
      }),

      // 平均响应时间（简化计算）
      60, // TODO: 实现真实的响应时间计算

      // 按状态分组统计
      CustomerServiceSession.findAll({
        attributes: ['status', [CustomerServiceSession.sequelize.fn('COUNT', '*'), 'count']],
        group: ['status'],
        raw: true
      })
    ])

    const statusStats = {}
    sessionsByStatus.forEach(item => {
      statusStats[item.status] = parseInt(item.count)
    })

    const chatStats = {
      timestamp: BeijingTimeHelper.getCurrentTime(),

      // 总体统计
      overall: {
        total_sessions: totalSessions,
        active_sessions: activeSessions,
        avg_response_time_seconds: avgResponseTime
      },

      // 今日统计
      today: {
        new_sessions: todaySessions,
        total_messages: todayMessages,
        avg_messages_per_session: todaySessions > 0 ? Math.round(todayMessages / todaySessions) : 0
      },

      // 按状态统计
      by_status: {
        waiting: statusStats.waiting || 0,
        assigned: statusStats.assigned || 0,
        active: statusStats.active || 0,
        closed: statusStats.closed || 0
      }
    }

    return ApiResponse.success(res, chatStats, '聊天系统统计数据获取成功')
  } catch (error) {
    console.error('获取聊天系统统计失败:', error)
    return ApiResponse.error(res, '获取聊天系统统计失败', 500)
  }
})

/**
 * @route GET /api/v4/system/chat/ws-status
 * @desc 获取WebSocket服务状态
 * @access Private
 */
router.get('/chat/ws-status', authenticateToken, (req, res) => {
  try {
    const ChatWebSocketService = require('../../services/ChatWebSocketService')

    // 获取WebSocket服务状态
    const status = ChatWebSocketService.getStatus()
    const onlineUsers = ChatWebSocketService.getOnlineUsers()
    const onlineAdmins = ChatWebSocketService.getOnlineAdmins()

    // ✅ 使用中间件方法，代码更简洁
    const responseData = {
      ...status,
      onlineUsers,
      onlineAdmins
    }

    return res.apiSuccess(responseData, 'WebSocket服务状态')
  } catch (error) {
    console.error('获取WebSocket状态失败:', error)
    return res.apiInternalError('获取WebSocket状态失败')
  }
})

/**
 * 计算反馈预计响应时间（工具函数）
 *
 * 业务场景：
 * - 用户提交反馈后，根据反馈优先级自动计算预计响应时间
 * - 前端显示预计响应时间，提升用户体验和满意度
 * - 运营团队根据优先级合理安排处理顺序，确保高优先级反馈及时响应
 *
 * 业务规则：
 * - high（高优先级）：4小时内响应，适用于紧急问题（如：系统故障、账户异常）
 * - medium（中优先级）：24小时内响应，适用于一般问题（如：功能咨询、体验反馈）
 * - low（低优先级）：72小时内响应，适用于建议类反馈（如：功能建议、优化建议）
 * - 未知优先级：默认72小时内响应，兜底处理
 *
 * 响应时间标准：
 * - 响应时间指管理员第一次回复的时间，不是问题解决时间
 * - 实际响应时间可能因人力资源、问题复杂度等因素有所调整
 * - 系统会记录实际响应时间，用于服务质量分析和改进
 *
 * @param {string} priority - 反馈优先级（high/medium/low）
 * @returns {string} 预计响应时间描述（如："4小时内"、"24小时内"、"72小时内"）
 *
 * @example
 * // 高优先级反馈
 * const responseTime = calculateResponseTime('high')
 * console.log(responseTime) // 输出: "4小时内"
 *
 * @example
 * // 中优先级反馈
 * const responseTime = calculateResponseTime('medium')
 * console.log(responseTime) // 输出: "24小时内"
 *
 * @example
 * // 未知优先级（兜底处理）
 * const responseTime = calculateResponseTime('unknown')
 * console.log(responseTime) // 输出: "72小时内"
 *
 * @description 根据反馈优先级返回预计响应时间描述，提升用户体验
 */
function calculateResponseTime (priority) {
  const responseTimeMap = {
    high: '4小时内',
    medium: '24小时内',
    low: '72小时内'
  }
  return responseTimeMap[priority] || '72小时内'
}

module.exports = router
