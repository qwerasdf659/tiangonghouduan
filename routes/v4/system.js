/**
 * 餐厅积分抽奖系统 V4.0 - 系统功能API路由
 * 包括系统公告、反馈系统、系统状态等功能
 */

const express = require('express')
const router = express.Router()
/*
 * 🔄 TR-005规范：已完成Service层迁移
 * - 公告接口：通过 AnnouncementService
 * - 反馈接口：通过 FeedbackService
 * - 系统状态：通过 ReportingService（P2-C架构重构：合并UserDashboardService）
 * - 会话创建：通过 CustomerServiceSessionService
 * 注：所有业务逻辑已通过Service层统一处理，路由层不直接操作models
 */
const DataSanitizer = require('../../services/DataSanitizer')
const { authenticateToken, optionalAuth } = require('../../middleware/auth')
const { handleServiceError } = require('../../middleware/validation')
const dataAccessControl = require('../../middleware/dataAccessControl')
const BeijingTimeHelper = require('../../utils/timeHelper')
const ChatRateLimitService = require('../../services/ChatRateLimitService')
// const { Op } = require('sequelize') // 未使用，已注释

/*
 * 🔄 TR-005规范+P2-F架构重构：已完成频率限制逻辑下沉到Service层
 * - 消息频率限制：通过 ChatRateLimitService.checkMessageRateLimit()
 * - 创建会话频率限制：通过 ChatRateLimitService.checkCreateSessionRateLimit()
 * - WebSocket推送重试：通过 ChatRateLimitService.pushMessageWithRetry()
 * 注：所有频率限制逻辑已迁移到 ChatRateLimitService，路由层不再包含业务逻辑
 */

/**
 * 🔴 注意：数据合理性验证函数已迁移到 CustomerServiceSessionService.validateStatistics()
 * 本注释保留用于代码历史追踪
 *
 * 迁移原因：P2-F架构重构 - 将复杂业务逻辑从路由层下沉到Service层
 * 迁移时间：2025年12月11日
 */
/**
 * @route GET /api/v4/system/announcements
 * @desc 获取系统公告列表
 * @access Public
 */
router.get('/announcements', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')

    const { type = null, priority = null, limit = 10, offset = 0 } = req.query
    const dataLevel = req.isAdmin ? 'full' : 'public'

    // ✅ 使用 AnnouncementService 统一查询逻辑
    const announcements = await AnnouncementService.getAnnouncements({
      type,
      priority,
      limit,
      offset,
      activeOnly: true,
      filterExpired: true,
      dataLevel,
      includeCreator: true
    })

    const total = await AnnouncementService.getAnnouncementsCount({
      type,
      priority,
      activeOnly: true,
      filterExpired: true
    })

    return res.apiSuccess(
      {
        announcements,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: announcements.length === parseInt(limit)
      },
      '获取系统公告成功'
    )
  } catch (error) {
    console.error('获取系统公告失败:', error)
    return handleServiceError(error, res, '获取系统公告失败')
  }
})

/**
 * @route GET /api/v4/system/announcements/home
 * @desc 获取首页公告（仅显示前5条重要公告）
 * @access Public
 */
router.get('/announcements/home', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')

    const dataLevel = req.isAdmin ? 'full' : 'public'

    // ✅ 使用 AnnouncementService 统一查询逻辑（不直接操作models）
    const announcements = await AnnouncementService.getAnnouncements({
      type: null, // 不限制类型（获取所有类型：system/activity/notice等）
      priority: null, // 不限制优先级（按优先级DESC排序）
      limit: 5, // 只显示前5条
      offset: 0,
      activeOnly: true, // 仅查询活跃公告
      filterExpired: true, // 过滤过期公告
      dataLevel, // 根据用户权限返回不同级别的数据
      includeCreator: true // 关联创建者信息
    })

    /*
     * 📈 更新公告查看次数
     * 业务场景：统计公告浏览量，用于运营数据分析（评估公告触达效果）
     * 优化方案：并行更新（Promise.allSettled）提升性能，单个失败不影响整体
     */
    await Promise.allSettled(
      announcements.map(announcement =>
        AnnouncementService.incrementViewCount(announcement.announcement_id)
      )
    )

    // 🎉 返回首页公告数据（数据脱敏已在Service层完成）
    return res.apiSuccess(
      {
        announcements
      },
      '获取首页公告成功'
    )
  } catch (error) {
    console.error('获取首页公告失败:', error)
    return handleServiceError(error, res, '获取首页公告失败')
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

    // 🔄 通过 ServiceManager 获取 FeedbackService（符合TR-005规范）
    const FeedbackService = req.app.locals.services.getService('feedback')

    // 获取用户信息
    const userInfo = {
      ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'],
      device: {
        userAgent: req.headers['user-agent'],
        platform: req.headers['x-platform'] || 'unknown'
      }
    }

    // ✅ 使用 FeedbackService 创建反馈
    const feedback = await FeedbackService.createFeedback({
      user_id: req.user.user_id,
      category,
      content,
      priority,
      attachments,
      user_ip: userInfo.ip,
      device_info: userInfo.device
    })

    // 返回脱敏后的数据
    const sanitizedFeedback = DataSanitizer.sanitizeFeedbacks([feedback], 'public')[0]

    return res.apiSuccess(
      {
        feedback: sanitizedFeedback
      },
      '反馈提交成功'
    )
  } catch (error) {
    console.error('提交反馈失败:', error)
    return handleServiceError(error, res, '提交反馈失败')
  }
})

/**
 * @route GET /api/v4/system/feedback/my
 * @desc 获取我的反馈列表（用户查看自己提交的反馈记录和回复状态）
 * @access Private（需要JWT认证，用户只能查询自己的数据）
 *
 * 业务场景（Business Scenarios）:
 * 1. 个人中心反馈列表展示 - User views feedback history in profile page
 * 2. 反馈进度追踪 - User tracks feedback status (pending → processing → replied → closed)
 * 3. 历史反馈查询 - User checks historical feedback records
 * 4. 回复通知查看 - User views admin replies after receiving notifications
 * 5. 状态筛选查询 - User filters feedback by specific status
 *
 * 查询参数（Query Parameters）:
 * @param {string} status - 反馈状态筛选（optional，可选值：pending/processing/replied/closed/all，默认all查询全部状态）
 *                          - pending: 待处理（用户刚提交，等待管理员查看）
 *                          - processing: 处理中（管理员已查看，正在调查处理）
 *                          - replied: 已回复（管理员已回复，等待用户确认）
 *                          - closed: 已关闭（问题已解决，流程结束）
 *                          - all: 全部状态（不筛选，返回所有反馈）
 * @param {number} limit - 每页数量（optional，范围1-50，默认10条，防止一次性加载过多数据影响性能）
 * @param {number} offset - 偏移量（optional，用于分页，默认0，表示从第一条开始，offset=10表示跳过前10条）
 *
 * 返回数据（Response Data）:
 * @returns {Object} data - 反馈列表数据对象
 * @returns {Array<Object>} data.feedbacks - 反馈记录数组（已脱敏处理，隐藏敏感信息如user_ip、device_info等）
 * @returns {number} data.total - 总记录数（用户的反馈总数量，非当前页数量，用于前端分页组件计算总页数）
 * @returns {Object} data.page - 分页元数据（Pagination metadata）
 *
 * 技术实现（Technical Implementation）:
 * 1. JWT认证 - authenticateToken中间件验证用户身份，确保只能查询自己的反馈
 * 2. 参数验证 - 验证status合法性，limit范围限制，offset非负整数检查
 * 3. Sequelize查询 - 使用findAndCountAll同时获取数据和总数，命中idx_feedbacks_user_status索引
 * 4. 数据脱敏 - DataSanitizer.sanitizeFeedbacks隐藏敏感字段（user_ip、device_info、internal_notes）
 * 5. 关联查询 - include管理员信息（admin），显示回复人昵称
 * 6. 错误处理 - 区分数据库错误、参数错误、认证错误，返回详细错误信息
 */
router.get('/feedback/my', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 FeedbackService（符合TR-005规范）
    const FeedbackService = req.app.locals.services.getService('feedback')

    const { status = null, limit = 10, offset = 0 } = req.query
    const user_id = req.user.user_id

    // 参数验证
    const valid_statuses = ['pending', 'processing', 'replied', 'closed', 'all']
    if (status && !valid_statuses.includes(status)) {
      return res.apiError(
        `status参数无效，必须是以下值之一：${valid_statuses.join(', ')}`,
        'INVALID_PARAMETER',
        { valid_values: valid_statuses },
        400
      )
    }

    const parsed_limit = parseInt(limit)
    const valid_limit = isNaN(parsed_limit) || parsed_limit < 1 ? 10 : Math.min(parsed_limit, 50)

    const parsed_offset = parseInt(offset)
    const valid_offset = isNaN(parsed_offset) || parsed_offset < 0 ? 0 : parsed_offset

    console.log('📊 [反馈列表查询]', {
      user_id,
      status: status || 'all',
      limit: valid_limit,
      offset: valid_offset,
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    })

    // ✅ 使用 FeedbackService 获取反馈列表
    const result = await FeedbackService.getFeedbackList({
      user_id,
      status: status && status !== 'all' ? status : null,
      limit: valid_limit,
      offset: valid_offset
    })

    // 数据脱敏处理
    const sanitized_data = DataSanitizer.sanitizeFeedbacks(result.feedbacks, 'public')

    return res.apiSuccess(
      {
        feedbacks: sanitized_data,
        total: result.total,
        page: {
          limit: valid_limit,
          offset: valid_offset,
          current_page: Math.floor(valid_offset / valid_limit) + 1,
          total_pages: Math.ceil(result.total / valid_limit)
        }
      },
      '获取反馈列表成功'
    )
  } catch (error) {
    console.error('❌ [获取反馈列表失败]', {
      user_id: req.user?.user_id,
      error_message: error.message,
      error_name: error.name,
      error_stack: error.stack,
      query_params: { status: req.query.status, limit: req.query.limit, offset: req.query.offset }
    })

    return handleServiceError(error, res, '获取反馈列表失败')
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

    // 🔄 通过 ServiceManager 获取 FeedbackService（符合TR-005规范）
    const FeedbackService = req.app.locals.services.getService('feedback')

    // ✅ 使用 FeedbackService 查询反馈详情（不直接操作models）
    const feedback = await FeedbackService.getFeedbackById(feedback_id)

    if (!feedback) {
      return res.apiError('反馈不存在', 'NOT_FOUND', null, 404)
    }

    // 权限验证：用户只能查看自己的反馈，管理员可以查看所有反馈
    const { getUserRoles } = require('../../middleware/auth')
    const userRoles = await getUserRoles(user_id)

    if (!userRoles.isAdmin && feedback.user_id !== user_id) {
      return res.apiError('无权限查看此反馈', 'FORBIDDEN', null, 403)
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

      // 处理信息（✅ 使用正确的字段名reply_content）
      reply_content: feedback.reply_content,
      admin_info: feedback.admin
        ? {
          admin_id: feedback.admin.user_id,
          admin_name: feedback.admin.nickname || '管理员'
        }
        : null,

      // 时间信息（✅ 仅使用存在的字段）
      created_at: feedback.created_at,
      replied_at: feedback.replied_at,

      // 处理进度（✅ 直接读取数据库字段）
      estimated_response_time: feedback.estimated_response_time,
      internal_notes: userRoles.isAdmin ? feedback.internal_notes : undefined
    }

    // 数据脱敏处理
    const sanitizedDetail = DataSanitizer.sanitizeFeedbacks(
      [feedbackDetail],
      userRoles.isAdmin ? 'full' : 'public'
    )[0]

    return res.apiSuccess(sanitizedDetail, '获取反馈详情成功')
  } catch (error) {
    console.error('获取反馈详情失败:', error)
    return handleServiceError(error, res, '获取反馈详情失败')
  }
})

/**
 * @route GET /api/v4/system/status
 * @desc 获取系统状态信息
 * @access Public
 */
router.get('/status', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    const dataLevel = req.isAdmin ? 'full' : 'public'

    // 系统基本状态
    const systemStatus = {
      server_time: BeijingTimeHelper.nowLocale(),
      status: 'running',
      version: '4.0.0'
    }

    /*
     * 管理员可见的详细统计信息（Admin-only Statistics）
     * ✅ P2-C架构重构：使用 ReportingService.getSystemStatus() 统一查询（符合TR-005规范）
     */
    if (dataLevel === 'full') {
      // 🔄 通过 ServiceManager 获取 ReportingService
      const ReportingService = req.app.locals.services.getService('reporting')

      // ✅ 使用 Service 查询系统状态统计（不直接操作models）
      const statistics = await ReportingService.getSystemOverview()

      // 添加统计数据到响应中（Add Statistics to Response）
      systemStatus.statistics = {
        total_users: statistics.total_users, // 用户总数（包含所有状态：active/inactive/banned）
        active_announcements: statistics.active_announcements, // 活跃公告数（is_active=true）
        pending_feedbacks: statistics.pending_feedbacks // 待处理反馈数（status='pending'）
      }
    }

    return res.apiSuccess(
      {
        system: systemStatus
      },
      '获取系统状态成功'
    )
  } catch (error) {
    console.error('获取系统状态失败:', error)
    return handleServiceError(error, res, '获取系统状态失败')
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
router.get('/business-config', optionalAuth, dataAccessControl, async (req, res) => {
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

    return res.apiSuccess(
      {
        config: publicConfig,
        version: '4.0.0',
        last_updated: '2025-10-21'
      },
      '获取业务配置成功'
    )
  } catch (error) {
    console.error('获取业务配置失败:', error)
    return handleServiceError(error, res, '获取业务配置失败')
  }
})

/**
 * @route POST /api/v4/system/chat/create
 * @desc 创建聊天会话（并发安全）
 * @access Private
 *
 * 实施方案：方案C - 悲观锁事务（基于《创建聊天会话API实施方案.md》文档）
 *
 * 并发控制策略：
 * 1. 频率限制：每10秒最多3次创建请求（防止恶意重复创建）
 * 2. 悲观锁：使用SELECT FOR UPDATE锁定用户的活跃会话查询
 * 3. 重试机制：遇到锁等待超时时自动重试（最多3次）
 *
 * 技术实现：
 * - Sequelize事务 + SELECT FOR UPDATE
 * - 内存限流器（避免引入Redis依赖）
 * - 指数退避重试（1秒 → 2秒 → 4秒）
 *
 * 业务场景：
 * - 正常创建：用户首次创建会话，立即返回新会话
 * - 已有会话：用户已有活跃会话，返回现有会话ID
 * - 并发创建：多个请求同时创建，只有一个成功，其他返回现有会话
 * - 频率限制：10秒内超过3次创建请求，返回429错误
 */
router.post('/chat/create', authenticateToken, async (req, res) => {
  const userId = req.user.user_id

  /*
   * 🔴 步骤1：频率限制检查（防止恶意重复创建）
   * ✅ 使用 ChatRateLimitService 统一管理频率限制（P2-F架构重构）
   */
  const rateLimitCheck = ChatRateLimitService.checkCreateSessionRateLimit(userId)
  if (!rateLimitCheck.allowed) {
    console.log(
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

  // ✅ 通过 ServiceManager 获取 CustomerServiceSessionService（符合TR-005规范）
  const CustomerServiceSessionService = req.app.locals.services.getService('customerServiceSession')

  try {
    // ✅ 使用 Service 层方法创建或获取会话（不直接操作models）
    const session = await CustomerServiceSessionService.getOrCreateSession(userId, {
      source: 'mobile',
      priority: 1
    })

    return res.apiSuccess(
      {
        session_id: session.session_id,
        status: session.status,
        source: session.source,
        created_at: session.created_at
      },
      session.is_new ? '聊天会话创建成功' : '使用现有会话'
    )
  } catch (error) {
    console.error(`❌ 用户${userId}创建会话失败:`, error)
    return handleServiceError(error, res, '创建聊天会话失败')
  }
})

/**
 * @route GET /api/v4/system/chat/sessions
 * @desc 获取用户聊天会话列表（基于《获取聊天会话列表API实施方案.md》完整实现）
 * @access Private
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认10，最大50）
 *
 * @returns {Object} 响应数据
 * @returns {Array} sessions - 会话列表（已脱敏）
 * @returns {Object} pagination - 分页信息
 *
 * @description
 * P0实现：数据脱敏 - 移除敏感字段，保护用户隐私
 * P1实现：未读消息计数 - 实时计算admin发送的未读消息数
 * P1实现：分页支持 - 支持page/limit参数，返回pagination对象
 * 性能优化：N+1查询优化 - 使用separate:false强制JOIN查询
 */
router.get('/chat/sessions', authenticateToken, async (req, res) => {
  try {
    // 获取分页参数（默认第1页，每页10条）
    const { page = 1, limit = 10 } = req.query

    // 🔄 通过 ServiceManager 获取 CustomerServiceSessionService（符合TR-005规范）
    const CustomerServiceSessionService =
      req.app.locals.services.getService('customerServiceSession')

    /*
     * ✅ 使用 CustomerServiceSessionService 获取会话列表
     * 参数说明：user_id（用户ID）、page（页码）、page_size（每页数量）、
     * include_last_message（包含最后一条消息）、calculate_unread（计算未读消息数）
     */
    const result = await CustomerServiceSessionService.getSessionList({
      user_id: req.user.user_id, // 用户数据隔离（只能查询自己的会话）
      page: parseInt(page),
      page_size: Math.min(parseInt(limit), 50), // 分页安全保护：最大50条记录
      include_last_message: true, // 包含最后一条消息
      calculate_unread: true, // 计算未读消息数
      sort_by: 'created_at', // 按创建时间排序
      sort_order: 'DESC' // 倒序排列（最新的会话在前）
    })

    // ✅ P1实现：返回分页信息（支持前端分页组件）
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
    console.error('获取会话列表失败:', error)
    return handleServiceError(error, res, '获取会话列表失败')
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

    // 🔄 通过 ServiceManager 获取 CustomerServiceSessionService（符合TR-005规范）
    const CustomerServiceSessionService =
      req.app.locals.services.getService('customerServiceSession')

    /*
     * ✅ 使用 CustomerServiceSessionService 获取会话消息
     * 参数说明：
     * - user_id：用户ID验证（只能查看自己的会话）
     * - page/limit：分页参数
     * - mark_as_read：自动标记管理员消息为已读
     * - include_all_fields：包含所有字段（metadata等）
     */
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
    console.error('获取聊天历史失败:', error)
    return handleServiceError(error, res, '获取聊天历史失败')
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
    const businessConfig = require('../../config/business.config')

    /*
     * ⚡ Step 1: 频率限制检查（Rate Limit Check）
     * ✅ 使用 ChatRateLimitService 统一管理频率限制（P2-F架构重构）
     * 基于文档第1617-1689行建议和config/business.config.js配置
     * 防止恶意刷屏攻击，保护系统稳定性
     */
    const userId = req.user.user_id
    const role_level = req.user.role_level || 0 // 获取用户角色等级
    const rateLimitCheck = ChatRateLimitService.checkMessageRateLimit(userId, role_level)

    if (!rateLimitCheck.allowed) {
      // 超过频率限制，返回429错误
      console.warn(
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

    // Step 2: 参数验证
    if (!session_id || !content) {
      return res.apiError('会话ID和消息内容不能为空', 'BAD_REQUEST', null, 400)
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

    /*
     * Step 2.5: 内容安全过滤（XSS防护 + 敏感词检测）
     * 基于config/business.config.js配置，确保消息内容安全
     */
    const sanitized_content = content.trim()

    // 敏感词过滤（从配置文件读取）
    const { content_filter: contentFilter } = businessConfig.chat
    if (contentFilter.enabled) {
      const hasSensitiveWord = contentFilter.sensitive_words.some(word =>
        sanitized_content.includes(word)
      )
      if (hasSensitiveWord && contentFilter.reject_on_match) {
        console.warn(`⚠️ 用户${userId}发送的消息包含敏感词，已拦截`)
        return res.apiError('消息包含敏感词，请修改后重新发送', 'CONTENT_VIOLATION', null, 400)
      }
    }

    // 🔄 通过 ServiceManager 获取服务（符合TR-005规范）
    const CustomerServiceSessionService =
      req.app.locals.services.getService('customerServiceSession')
    const ChatWebSocketService = req.app.locals.services.getService('chatWebSocket')

    /*
     * ✅ 使用 CustomerServiceSessionService 发送用户消息
     * 服务负责：验证会话权限、检查会话状态、创建消息、更新会话
     */
    const message = await CustomerServiceSessionService.sendUserMessage(session_id, {
      user_id: userId,
      content: sanitized_content,
      message_type
    })

    /*
     * ✅ 通过WebSocket实时推送消息给客服（带自动重试机制）
     * ✅ 使用 ChatRateLimitService 统一管理WebSocket推送重试（P2-F架构重构）
     * 基于文档第1697-1762行建议，添加自动重试提升实时性
     */
    try {
      // 构建消息数据（用于WebSocket推送）
      const messageData = {
        ...message,
        sender_name: req.user.nickname || '用户',
        timestamp: BeijingTimeHelper.timestamp()
      }

      /*
       * 使用带重试机制的推送函数（最多重试3次）
       * 传入session_admin_id而非整个session对象，避免直接访问模型
       */
      await ChatRateLimitService.pushMessageWithRetry(
        ChatWebSocketService,
        message.session_admin_id,
        messageData,
        3
      )
    } catch (wsError) {
      // WebSocket推送失败不影响消息发送（降级策略）
      console.error('WebSocket推送失败:', wsError.message)
      console.log('✅ 消息已保存到数据库，稍后可通过轮询获取')
    }

    return res.apiSuccess(
      {
        message_id: message.message_id,
        session_id: message.session_id,
        content: message.content,
        message_type: message.message_type,
        sent_at: message.created_at
      },
      '消息发送成功'
    )
  } catch (error) {
    console.error('发送消息失败:', error)
    return handleServiceError(error, res, '发送消息失败')
  }
})

/**
 * 🔧 构建安全的查询条件（兼容软删除字段）- 方案A步骤3
 * @param {Object} model - Sequelize模型
 * @param {number} user_id - 用户ID
 * @returns {Object} where条件对象
 *
 * 注意：PointsTransaction、ConsumptionRecord模型已添加defaultScope自动过滤is_deleted=0
 * 此函数保留user_id过滤，is_deleted过滤由defaultScope自动处理
 */
const _buildSafeWhereCondition = (model, user_id) => {
  /*
   * 仅返回user_id过滤条件
   * is_deleted过滤由模型的defaultScope自动处理
   */
  return { user_id }
}

/**
 * @route GET /api/v4/system/user/statistics/:user_id
 * @desc 获取用户个人统计数据
 * @access Private
 */
router.get('/user/statistics/:user_id', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const { user_id: rawUserId } = req.params

    // 🔥 方案A步骤1：类型转换和验证（P0 - 安全性和稳定性风险）
    const user_id = parseInt(rawUserId, 10)

    // 🔥 有效性检查
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('无效的用户ID格式，必须为正整数', 'INVALID_PARAMETER', null, 400)
    }

    // 🔥 范围检查（可选 - 防止枚举攻击）
    if (user_id > 1000000) {
      // 根据实际业务调整
      return res.apiError('用户ID超出有效范围', 'INVALID_PARAMETER', null, 400)
    }

    const currentUserId = req.user.user_id
    const isAdmin = req.isAdmin

    // 权限检查：只能查看自己的统计或管理员查看任何用户
    if (user_id !== currentUserId && !isAdmin) {
      return res.apiError('无权限查看其他用户统计', 'FORBIDDEN', null, 403)
    }

    // 🔄 通过 ServiceManager 获取 ReportingService（P2-C架构重构）
    const ReportingService = req.app.locals.services.getService('reporting')

    // ✅ 使用 ReportingService 获取用户统计数据
    const statistics = await ReportingService.getUserStatistics(user_id, isAdmin)

    return res.apiSuccess(
      {
        statistics
      },
      '获取用户统计成功'
    )
  } catch (error) {
    // 🔥 P1优化：详细错误日志记录（包含堆栈信息和请求上下文）
    console.error('获取用户统计失败:', {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      user_id: req.params.user_id,
      current_user_id: req.user?.user_id,
      is_admin: req.isAdmin,
      timestamp: BeijingTimeHelper.now()
    })

    return handleServiceError(error, res, '获取用户统计失败')
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
      return res.apiError('需要管理员权限', 'FORBIDDEN', null, 403)
    }

    // 🔄 通过 ServiceManager 获取 ReportingService（P2-C架构重构）
    const ReportingService = req.app.locals.services.getService('reporting')

    // ✅ 使用 ReportingService 获取系统概览
    const overview = await ReportingService.getSystemOverview()

    return res.apiSuccess(
      {
        overview
      },
      '获取系统概览成功'
    )
  } catch (error) {
    console.error('获取系统概览失败:', error)
    return handleServiceError(error, res, '获取系统概览失败')
  }
})

/**
 * 🧮 计算真实的平均响应时间（Calculate Real Average Response Time）
 *
 * 计算逻辑（Calculation Logic）:
 * - 响应时间 = 客服首条消息时间 - 用户首条消息时间
 * - 仅统计今日已响应的会话（排除waiting状态）
 * - 排除异常数据（响应时间>1小时的异常情况）
 *
 * @param {Date} startTime - 开始时间（今日00:00:00）
 * @param {Date} endTime - 结束时间（今日23:59:59）
 * @param {Model} CustomerServiceSession - 客服会话模型
 * @param {Model} ChatMessage - 聊天消息模型
 * @returns {Promise<number>} 平均响应时间（秒）- 无数据时返回60秒
 *
 * 业务价值（Business Value）:
 * - 真实反映客服响应速度（Real Response Speed）
 * - 支持客服绩效考核（Performance Evaluation）
 * - 监控服务质量变化（Service Quality Monitoring）
 * - 优化资源配置决策（Resource Allocation）
 *
 * 性能优化（Performance Optimization）:
 * - 仅查询今日会话（减少数据量）
 * - 使用Promise.all并行查询消息（提升查询效率）
 * - 异常数据过滤（排除响应时间>1小时的异常情况）
 *
 * 最后更新：2025-11-08
 */
module.exports = router
