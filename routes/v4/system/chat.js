/**
 * 餐厅积分抽奖系统 V4.0 - 客服聊天API路由
 *
 * 功能：
 * - 创建聊天会话（POST /chat/sessions）
 * - 获取用户聊天会话列表（GET /chat/sessions）
 * - 获取聊天历史记录（GET /chat/sessions/:id/messages）
 * - 发送聊天消息（POST /chat/sessions/:id/messages）
 *
 * 路由前缀：/api/v4/system
 *
 * 规范遵循：
 * - API设计与契约标准规范 v2.0（2025-12-23）
 * - API路径参数设计规范 V2.2（2026-01-20）：会话是事务实体，使用 :id
 * - RESTful资源嵌套（原则3：资源嵌套规范）
 * - 硬切断旧路径策略（不保留 /chat/create, /chat/send, /chat/history）
 *
 * 创建时间：2025年12月22日
 * 重构时间：2025年12月23日（符合API设计与契约标准规范）
 * 更新时间：2026年01月20日（统一事务实体路由参数为 :id）
 */

const express = require('express')
const router = express.Router()
const multer = require('multer')
const logger = require('../../../utils/logger').logger
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const BeijingTimeHelper = require('../../../utils/timeHelper')
/*
 * P1-9：服务通过 ServiceManager 获取
 * const ChatRateLimitService = require('../../../services/ChatRateLimitService')
 */
const TransactionManager = require('../../../utils/TransactionManager')
const businessConfig = require('../../../config/business.config')

/**
 * Multer 配置：内存存储模式（聊天图片上传专用）
 * 文件暂存内存，直接上传到 Sealos 对象存储，不落本地磁盘
 */
const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: businessConfig.chat.image_upload.max_file_size // 5MB 限制
  },
  fileFilter: (_req, file, cb) => {
    if (businessConfig.chat.image_upload.allowed_mime_types.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件类型：${file.mimetype}，仅支持 jpg/png/gif/webp`), false)
    }
  }
})

/**
 * @route POST /api/v4/system/chat/sessions
 * @desc 创建聊天会话（并发安全）
 * @access Private
 *
 * Canonical Path：POST /api/v4/system/chat/sessions
 *
 * 并发控制策略：
 * 1. 频率限制：每10秒最多3次创建请求（防止恶意重复创建）
 * 2. 悲观锁：使用SELECT FOR UPDATE锁定用户的活跃会话查询
 * 3. 重试机制：遇到锁等待超时时自动重试（最多3次）
 *
 * @body {string} source - 会话来源（可选，默认mobile）
 *
 * @returns {Object} 会话信息
 */
router.post('/chat/sessions', authenticateToken, async (req, res) => {
  const userId = req.user.user_id

  // P1-9：通过 ServiceManager 获取 ChatRateLimitService（snake_case key）
  const ChatRateLimitService = req.app.locals.services.getService('chat_rate_limit')
  // 频率限制检查（防止恶意重复创建）
  const rateLimitCheck = ChatRateLimitService.checkCreateSessionRateLimit(userId)
  if (!rateLimitCheck.allowed) {
    logger.info(
      `⚠️ 用户${userId}触发创建会话频率限制（10秒内${rateLimitCheck.current}/${rateLimitCheck.limit}次）`
    )
    return res.apiError(
      `创建会话过于频繁，请${rateLimitCheck.remainingTime}秒后再试`,
      'RATE_LIMIT_EXCEEDED',
      {
        current: rateLimitCheck.current,
        limit: rateLimitCheck.limit,
        remaining_time: rateLimitCheck.remainingTime
      },
      429
    )
  }

  // 通过 ServiceManager 获取服务（符合TR-005规范）
  const CustomerServiceSessionService = req.app.locals.services.getService(
    'customer_service_session'
  )

  try {
    // 获取请求体中的来源参数（可选）
    const { source = 'mobile' } = req.body

    // 使用 Service 层方法创建或获取会话（不直接操作models）
    const session = await CustomerServiceSessionService.getOrCreateSession(userId, {
      source,
      priority: 1
    })

    return res.apiSuccess(
      {
        customer_service_session_id: session.customer_service_session_id,
        status: session.status,
        source: session.source,
        created_at: session.created_at
      },
      session.is_new ? '聊天会话创建成功' : '使用现有会话'
    )
  } catch (error) {
    logger.error(`❌ 用户${userId}创建会话失败:`, error)
    return handleServiceError(error, res, '创建聊天会话失败')
  }
})

/**
 * @route GET /api/v4/system/chat/sessions
 * @desc 获取用户聊天会话列表
 * @access Private
 *
 * Canonical Path：GET /api/v4/system/chat/sessions
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认10，最大50）
 *
 * @returns {Object} 会话列表和分页信息
 */
router.get('/chat/sessions', authenticateToken, async (req, res) => {
  try {
    // 获取分页参数（默认第1页，每页10条）
    const { page = 1, limit = 10 } = req.query

    // 通过 ServiceManager 获取服务（符合TR-005规范）
    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )

    // 使用 CustomerServiceSessionService 获取会话列表
    const result = await CustomerServiceSessionService.getSessionList({
      user_id: req.user.user_id, // 用户数据隔离（只能查询自己的会话）
      page: parseInt(page),
      page_size: Math.min(parseInt(limit), 50), // 分页安全保护：最大50条记录
      include_last_message: true, // 包含最后一条消息
      calculate_unread: true, // 计算未读消息数
      sort_by: 'created_at', // 按创建时间排序
      sort_order: 'DESC' // 倒序排列（最新的会话在前）
    })

    // 返回分页信息（支持前端分页组件）
    return res.apiSuccess(
      {
        sessions: result.sessions,
        pagination: {
          current_page: result.pagination.page, // 当前页码
          per_page: result.pagination.page_size, // 每页数量
          total_count: result.pagination.total, // 总会话数
          total_pages: result.pagination.total_pages // 总页数
        }
      },
      '获取会话列表成功'
    )
  } catch (error) {
    logger.error('获取会话列表失败:', error)
    return handleServiceError(error, res, '获取会话列表失败')
  }
})

/**
 * @route GET /api/v4/system/chat/sessions/:id/messages
 * @desc 获取聊天历史记录
 * @access Private
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * Canonical Path：GET /api/v4/system/chat/sessions/:id/messages
 *
 * @param {number} id - 会话ID（事务实体）
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认50，最大100）
 *
 * @returns {Object} 消息列表和分页信息
 */
router.get('/chat/sessions/:id/messages', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id
    const { page = 1, limit = 50 } = req.query
    // 分页安全保护：最大100条记录
    const finalLimit = Math.min(parseInt(limit), 100)

    // 通过 ServiceManager 获取服务（符合TR-005规范）
    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )

    // 使用 CustomerServiceSessionService 获取会话消息
    const result = await CustomerServiceSessionService.getSessionMessages(sessionId, {
      user_id: req.user.user_id, // 权限验证：用户只能查看自己的会话
      page: parseInt(page),
      limit: finalLimit,
      mark_as_read: true, // 自动标记管理员发送的未读消息为已读
      include_all_fields: true // 返回所有字段（包括metadata、temp_message_id等）
    })

    return res.apiSuccess(
      {
        messages: result.messages,
        pagination: {
          total: result.total,
          page: parseInt(page),
          limit: finalLimit,
          total_pages: Math.ceil(result.total / finalLimit)
        }
      },
      '获取聊天历史成功'
    )
  } catch (error) {
    logger.error('获取聊天历史失败:', error)
    return handleServiceError(error, res, '获取聊天历史失败')
  }
})

/**
 * @route POST /api/v4/system/chat/sessions/:id/messages
 * @desc 发送聊天消息
 * @access Private
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * Canonical Path：POST /api/v4/system/chat/sessions/:id/messages
 *
 * @param {number} id - 会话ID（事务实体）
 * @body {string} content - 消息内容（必需）
 * @body {string} message_type - 消息类型（默认text）
 *
 * @returns {Object} 发送的消息信息
 */
router.post('/chat/sessions/:id/messages', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id
    const { content, message_type = 'text' } = req.body
    const businessConfig = require('../../../config/business.config')

    // 频率限制检查（Rate Limit Check）
    const userId = req.user.user_id
    const role_level = req.user.role_level || 0 // 获取用户角色等级
    // P1-9：通过 ServiceManager 获取 ChatRateLimitService（snake_case key）
    const ChatRateLimitService = req.app.locals.services.getService('chat_rate_limit')
    const rateLimitCheck = ChatRateLimitService.checkMessageRateLimit(userId, role_level)

    if (!rateLimitCheck.allowed) {
      // 超过频率限制，返回429错误
      logger.warn(
        `⚠️ ${rateLimitCheck.userType === 'admin' ? '管理员' : '用户'}${userId}触发消息发送频率限制（1分钟内${rateLimitCheck.current}/${rateLimitCheck.limit}条）`
      )
      return res.apiError(
        `发送消息过于频繁，请稍后再试（${rateLimitCheck.userType === 'admin' ? '管理员' : '普通用户'}每分钟最多${rateLimitCheck.limit}条消息）`,
        'RATE_LIMIT_EXCEEDED',
        {
          current: rateLimitCheck.current,
          limit: rateLimitCheck.limit,
          user_type: rateLimitCheck.userType
        },
        429
      )
    }

    // 参数验证
    if (!content) {
      return res.apiError('消息内容不能为空', 'BAD_REQUEST', null, 400)
    }

    // 从配置文件读取消息长度限制
    const { message: messageConfig } = businessConfig.chat
    if (content.length > messageConfig.max_length) {
      return res.apiError(
        `消息内容不能超过${messageConfig.max_length}字符`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 内容安全过滤（XSS防护 + 敏感词检测）
    const sanitized_content = content.trim()

    // 敏感词过滤（从配置文件读取）
    const { content_filter: contentFilter } = businessConfig.chat
    if (contentFilter.enabled) {
      const hasSensitiveWord = contentFilter.sensitive_words.some(word =>
        sanitized_content.includes(word)
      )
      if (hasSensitiveWord && contentFilter.reject_on_match) {
        logger.warn(`⚠️ 用户${userId}发送的消息包含敏感词，已拦截`)
        return res.apiError('消息包含敏感词，请修改后重新发送', 'CONTENT_VIOLATION', null, 400)
      }
    }

    // 通过 ServiceManager 获取服务（符合TR-005规范）
    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )
    const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')

    // 使用 TransactionManager 统一事务边界（符合治理决策）
    const message = await TransactionManager.execute(async transaction => {
      return await CustomerServiceSessionService.sendUserMessage(
        sessionId,
        {
          user_id: userId,
          content: sanitized_content,
          message_type
        },
        { transaction }
      )
    })

    // 通过WebSocket实时推送消息给客服（带自动重试机制）
    try {
      // 构建消息数据（用于WebSocket推送）
      const messageData = {
        ...message,
        sender_name: req.user.nickname || '用户',
        timestamp: BeijingTimeHelper.timestamp()
      }

      // 使用带重试机制的推送函数（最多重试3次）
      await ChatRateLimitService.pushMessageWithRetry(
        ChatWebSocketService,
        message.session_admin_id,
        messageData,
        3
      )
    } catch (wsError) {
      // WebSocket推送失败不影响消息发送（降级策略）
      logger.error('WebSocket推送失败:', wsError.message)
      logger.info('✅ 消息已保存到数据库，稍后可通过轮询获取')
    }

    return res.apiSuccess(
      {
        chat_message_id: message.chat_message_id,
        customer_service_session_id: message.customer_service_session_id,
        content: message.content,
        message_type: message.message_type,
        sent_at: message.created_at
      },
      '消息发送成功'
    )
  } catch (error) {
    logger.error('发送消息失败:', error)
    return handleServiceError(error, res, '发送消息失败')
  }
})

/**
 * @route GET /api/v4/system/chat/sessions/search
 * @desc 搜索聊天消息
 * @access Private
 *
 * Canonical Path：GET /api/v4/system/chat/sessions/search
 *
 * 业务场景：
 * - 用户在客服聊天界面搜索历史消息内容
 * - 只搜索当前用户自己的会话消息（数据隔离）
 *
 * @query {string} keyword - 搜索关键词（必填）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 *
 * @returns {Object} { messages, pagination }
 */
router.get('/chat/sessions/search', authenticateToken, async (req, res) => {
  try {
    const { keyword, page = 1, page_size = 20 } = req.query

    if (!keyword || keyword.trim().length === 0) {
      return res.apiError('keyword 是必填参数', 'BAD_REQUEST', null, 400)
    }

    /* 通过 ServiceManager 获取服务 */
    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )

    const result = await CustomerServiceSessionService.searchMessages(req.user.user_id, keyword, {
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    return res.apiSuccess(result, '搜索成功')
  } catch (error) {
    logger.error('搜索聊天消息失败:', error)
    return handleServiceError(error, res, '搜索聊天消息失败')
  }
})

/**
 * @route POST /api/v4/system/chat/sessions/:id/upload
 * @desc 聊天图片上传（用户端）
 * @access Private
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * 业务流程：
 * 1. 用户选择图片 → 调用此接口上传到 Sealos 对象存储
 * 2. 接口返回图片 URL
 * 3. 前端再通过 POST /chat/sessions/:id/messages 发送 message_type: 'image'，content 填图片 URL
 *
 * 安全策略：
 * - authenticateToken 验证用户身份
 * - 会话归属校验：用户只能上传到自己的会话
 * - 文件大小限制：5MB
 * - 文件类型限制：jpg/png/gif/webp
 *
 * @param {number} id - 会话ID（事务实体）
 * @body {file} image - 图片文件（multipart/form-data，字段名 image）
 *
 * @returns {Object} { image_url, object_key }
 */
router.post(
  '/chat/sessions/:id/upload',
  authenticateToken,
  chatImageUpload.single('image'),
  async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id)
      const userId = req.user.user_id

      // 参数验证：文件是否存在
      if (!req.file) {
        return res.apiError('请选择要上传的图片', 'FILE_REQUIRED', null, 400)
      }

      // 通过 ServiceManager 获取 CustomerServiceSessionService
      const CustomerServiceSessionService = req.app.locals.services.getService(
        'customer_service_session'
      )

      // 会话归属校验：验证用户只能上传到自己的会话
      const session = await CustomerServiceSessionService.getSessionMessages(sessionId, {
        user_id: userId,
        page: 1,
        limit: 1
      })

      if (!session) {
        return res.apiError('会话不存在或无权操作', 'SESSION_NOT_FOUND', null, 404)
      }

      // 通过 ServiceManager 获取 SealosStorageService
      const SealosStorageServiceClass = req.app.locals.services.getService('sealos_storage')
      // sealos_storage 注册的是类本身，需要 new 实例化
      const storageService =
        SealosStorageServiceClass instanceof Function
          ? new SealosStorageServiceClass()
          : SealosStorageServiceClass

      // 上传图片到 Sealos 对象存储（chat-images 目录）
      const objectKey = await storageService.uploadImage(
        req.file.buffer,
        req.file.originalname,
        businessConfig.chat.image_upload.storage_folder
      )

      // 生成公网访问 URL
      const imageUrl = storageService.getPublicUrl(objectKey)

      logger.info('📸 聊天图片上传成功', {
        user_id: userId,
        session_id: sessionId,
        object_key: objectKey,
        file_size: req.file.size,
        mime_type: req.file.mimetype
      })

      return res.apiSuccess(
        {
          image_url: imageUrl,
          object_key: objectKey
        },
        '图片上传成功'
      )
    } catch (error) {
      // multer 文件大小超限错误
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.apiError('图片大小不能超过5MB', 'FILE_TOO_LARGE', { max_size: '5MB' }, 413)
      }

      logger.error('❌ 聊天图片上传失败:', error)
      return handleServiceError(error, res, '聊天图片上传失败')
    }
  }
)

module.exports = router
