/**
 * 餐厅积分抽奖系统 V4.0 - 用户反馈API路由
 *
 * 功能：
 * - 提交用户反馈
 * - 获取我的反馈列表
 * - 获取反馈详情
 *
 * 路由前缀：/api/v4/system
 *
 * 创建时间：2025年12月22日
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
/*
 * P1-9：DataSanitizer 通过 ServiceManager 获取（snake_case key）
 * 在路由处理函数内通过 req.app.locals.services.getService('data_sanitizer') 获取
 */

/**
 * @route POST /api/v4/system/feedback
 * @desc 提交用户反馈
 * @access Private
 *
 * @body {string} category - 反馈类别（bug/feature/complaint/other）
 * @body {string} content - 反馈内容
 * @body {string} priority - 优先级（low/medium/high）
 * @body {Array} attachments - 附件列表（可选）
 *
 * @returns {Object} 创建的反馈记录（已脱敏）
 */
router.post('/feedback', authenticateToken, asyncHandler(async (req, res) => {
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

  /*
   * 返回脱敏后的数据
   * P1-9：通过 ServiceManager 获取 DataSanitizer（snake_case key）
   */
  const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
  const sanitizedFeedback = DataSanitizer.sanitizeFeedbacks([feedback], 'public')[0]

  return res.apiSuccess(
    {
      feedback: sanitizedFeedback
    },
    '反馈提交成功'
  )
}))

/**
 * @route GET /api/v4/system/feedback/my
 * @desc 获取我的反馈列表（用户查看自己提交的反馈记录和回复状态）
 * @access Private（需要JWT认证，用户只能查询自己的数据）
 *
 * @query {string} status - 反馈状态筛选（pending/processing/replied/closed/all，默认all）
 * @query {number} page_size - 每页数量（范围1-50，默认10）
 * @query {number} offset - 偏移量（默认0）
 *
 * @returns {Object} 反馈列表和分页信息
 */
router.get('/feedback/my', authenticateToken, asyncHandler(async (req, res) => {
  // 🔄 通过 ServiceManager 获取 FeedbackService（符合TR-005规范）
  const FeedbackService = req.app.locals.services.getService('feedback')

  const { status = null, page_size = 10, offset = 0 } = req.query
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

  const parsed_limit = parseInt(page_size)
  const valid_limit = isNaN(parsed_limit) || parsed_limit < 1 ? 10 : Math.min(parsed_limit, 50)

  const parsed_offset = parseInt(offset)
  const valid_offset = isNaN(parsed_offset) || parsed_offset < 0 ? 0 : parsed_offset

  logger.info('📊 [反馈列表查询]', {
    user_id,
    status: status || 'all',
    page_size: valid_limit,
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

  /*
   * 数据脱敏处理
   * P1-9：通过 ServiceManager 获取 DataSanitizer（snake_case key）
   */
  const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
  const sanitized_data = DataSanitizer.sanitizeFeedbacks(result.feedbacks, 'public')

  const current_page = Math.floor(valid_offset / valid_limit) + 1
  const total_pages = Math.ceil(result.total / valid_limit)

  return res.apiSuccess(
    {
      feedbacks: sanitized_data,
      total: result.total,
      page: {
        page_size: valid_limit,
        offset: valid_offset,
        current_page,
        /** 与 current_page 同值，兼容误用 data.page.page 表示页码的客户端 */
        page: current_page,
        total_pages
      }
    },
    '获取反馈列表成功'
  )
}))

/**
 * @route GET /api/v4/system/feedback/:id
 * @desc 获取单个反馈详情
 * @access Private
 *
 * @param {number} id - 反馈ID
 *
 * @returns {Object} 反馈详情（已脱敏）
 */
router.get('/feedback/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id: feedback_id } = req.params
  const user_id = req.user.user_id

  // 🔄 通过 ServiceManager 获取 FeedbackService（符合TR-005规范）
  const FeedbackService = req.app.locals.services.getService('feedback')

  // ✅ 使用 FeedbackService 查询反馈详情（不直接操作models）
  const feedback = await FeedbackService.getFeedbackById(feedback_id)

  if (!feedback) {
    return res.apiError('反馈不存在', 'NOT_FOUND', null, 404)
  }

  // 权限验证：用户只能查看自己的反馈，管理员（role_level >= 100）可以查看所有反馈
  const userRoles = await getUserRoles(user_id)
  const hasAdminAccess = userRoles.role_level >= 100

  if (!hasAdminAccess && feedback.user_id !== user_id) {
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
          mobile: hasAdminAccess ? feedback.user.mobile : '****',
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
    internal_notes: hasAdminAccess ? feedback.internal_notes : undefined
  }

  /*
   * 数据脱敏处理
   * P1-9：通过 ServiceManager 获取 DataSanitizer（snake_case key）
   */
  const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
  const sanitizedDetail = DataSanitizer.sanitizeFeedbacks(
    [feedbackDetail],
    hasAdminAccess ? 'full' : 'public'
  )[0]

  return res.apiSuccess(sanitizedDetail, '获取反馈详情成功')
}))

module.exports = router
