/**
 * 管理后台 - 反馈管理模块
 *
 * 业务范围：
 * - 获取用户反馈列表
 * - 回复用户反馈
 * - 更新反馈状态
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 *
 */

const express = require('express')
const router = express.Router()
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('../shared/middleware')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * GET /feedbacks - 获取所有用户反馈
 *
 * @description 获取用户反馈列表，支持分页和过滤
 * @route GET /api/v4/console/system/feedbacks
 * @access Private (需要管理员权限)
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const {
      status = null,
      category = null,
      priority = null,
      page_size = 20,
      offset = 0
    } = req.query

    // 获取反馈服务
    const FeedbackService = req.app.locals.services.getService('feedback')

    // 调用服务层方法查询反馈列表
    const result = await FeedbackService.getFeedbackList({
      status,
      category,
      priority,
      page_size,
      offset
    })

    return res.apiSuccess(result, '获取反馈列表成功')
  })
)

/**
 * GET /feedbacks/stats - 获取反馈统计数据
 *
 * @description 获取反馈按状态分类的统计数据
 * @route GET /api/v4/console/system/feedbacks/stats
 * @access Private (需要管理员权限)
 */
router.get(
  '/stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    // 通过 ServiceManager 获取 FeedbackService
    const FeedbackService = req.app.locals.services.getService('feedback')
    const stats = await FeedbackService.getStats()

    return res.apiSuccess(stats, '获取反馈统计成功')
  })
)

/**
 * PUT /feedbacks/batch-status - 批量更新反馈状态
 *
 * @description 运营批量更新多条反馈的处理状态（如一键关闭已处理反馈、批量标记处理中等）
 * @route PUT /api/v4/console/system/feedbacks/batch-status
 * @access Private (需要管理员权限)
 *
 * @body {Array<number>} feedback_ids - 反馈ID数组（必填，最多100条）
 * @body {string} status - 目标状态（必填，pending/processing/replied/closed）
 * @body {string} [internal_notes] - 内部备注（可选）
 *
 * @since 2026
 */
router.put(
  '/batch-status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { feedback_ids, status, internal_notes = null } = req.body

    // 参数校验
    if (!Array.isArray(feedback_ids) || feedback_ids.length === 0) {
      return res.apiError('feedback_ids 必须是非空数组', 'INVALID_PARAMETERS', null, 400)
    }

    if (!status) {
      return res.apiError('status 不能为空', 'INVALID_PARAMETERS', null, 400)
    }

    const validStatuses = ['pending', 'processing', 'replied', 'closed']
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的状态值: ${status}，有效值为: ${validStatuses.join(', ')}`,
        'INVALID_PARAMETERS',
        null,
        400
      )
    }

    const result = await TransactionManager.execute(async transaction => {
      const FeedbackService = req.app.locals.services.getService('feedback')
      return await FeedbackService.batchUpdateStatus(feedback_ids, status, internal_notes, {
        transaction
      })
    })

    sharedComponents.logger.info('管理员批量更新反馈状态', {
      admin_id: req.user.user_id,
      feedback_ids,
      target_status: status,
      updated_count: result.updated_count
    })

    return res.apiSuccess(result, `批量更新成功，共更新 ${result.updated_count} 条反馈`)
  })
)

/**
 * PUT /feedbacks/batch-reply - 批量回复反馈
 *
 * @description 运营批量对多条反馈统一回复相同内容（如批量回复"感谢反馈，已记录"）
 * @route PUT /api/v4/console/system/feedbacks/batch-reply
 * @access Private (需要管理员权限)
 *
 * @body {Array<number>} feedback_ids - 反馈ID数组（必填，最多100条）
 * @body {string} reply_content - 统一回复内容（必填）
 * @body {string} [internal_notes] - 内部备注（可选）
 *
 * @since 2026
 */
router.put(
  '/batch-reply',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { feedback_ids, reply_content, internal_notes = null } = req.body

    if (!Array.isArray(feedback_ids) || feedback_ids.length === 0) {
      return res.apiError('feedback_ids 必须是非空数组', 'INVALID_PARAMETERS', null, 400)
    }

    if (!reply_content || reply_content.trim().length === 0) {
      return res.apiError('reply_content 不能为空', 'INVALID_PARAMETERS', null, 400)
    }

    if (reply_content.trim().length > 3000) {
      return res.apiError('回复内容不能超过3000字符', 'INVALID_PARAMETERS', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      const FeedbackService = req.app.locals.services.getService('feedback')
      return await FeedbackService.batchReplyFeedback(
        feedback_ids,
        reply_content,
        req.user.user_id,
        internal_notes,
        { transaction }
      )
    })

    sharedComponents.logger.info('管理员批量回复反馈', {
      admin_id: req.user.user_id,
      feedback_ids,
      updated_count: result.updated_count
    })

    return res.apiSuccess(result, `批量回复成功，共回复 ${result.updated_count} 条反馈`)
  })
)

/**
 * GET /feedbacks/:id - 获取单个反馈详情
 *
 * @description 获取指定反馈的详细信息
 * @route GET /api/v4/console/system/feedbacks/:id
 * @access Private (需要管理员权限)
 */
router.get(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params

    // 获取反馈服务
    const FeedbackService = req.app.locals.services.getService('feedback')

    // 调用服务层方法获取反馈详情
    const feedback = await FeedbackService.getFeedbackById(id)

    if (!feedback) {
      return res.apiError('反馈不存在', 'FEEDBACK_NOT_FOUND', null, 404)
    }

    return res.apiSuccess({ feedback }, '获取反馈详情成功')
  })
)

/**
 * POST /feedbacks/:id/reply - 回复用户反馈
 *
 * @description 管理员回复用户提交的反馈
 * @route POST /api/v4/console/system/feedbacks/:id/reply
 * @access Private (需要管理员权限)
 */
router.post(
  '/:id/reply',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { reply_content, internal_notes = null } = req.body

    if (!reply_content || reply_content.trim().length === 0) {
      return res.apiError('回复内容不能为空', 'INVALID_PARAMETERS')
    }

    // 获取反馈服务
    const FeedbackService = req.app.locals.services.getService('feedback')

    // 调用服务层方法回复反馈
    const feedback = await FeedbackService.replyFeedback(
      id,
      reply_content,
      req.user.user_id,
      internal_notes
    )

    sharedComponents.logger.info('管理员回复用户反馈', {
      admin_id: req.user.user_id,
      feedback_id: id,
      user_id: feedback.user_id
    })

    return res.apiSuccess(
      {
        feedback
      },
      '反馈回复成功'
    )
  })
)

/**
 * PUT /feedbacks/:id/status - 更新反馈状态
 *
 * @description 更新反馈的处理状态
 * @route PUT /api/v4/console/system/feedbacks/:id/status
 * @access Private (需要管理员权限)
 */
router.put(
  '/:id/status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { status, internal_notes = null } = req.body

    // 获取反馈服务
    const FeedbackService = req.app.locals.services.getService('feedback')

    // 调用服务层方法更新反馈状态
    const feedback = await FeedbackService.updateFeedbackStatus(id, status, internal_notes)

    sharedComponents.logger.info('管理员更新反馈状态', {
      admin_id: req.user.user_id,
      feedback_id: id,
      new_status: status
    })

    return res.apiSuccess(
      {
        feedback
      },
      '反馈状态更新成功'
    )
  })
)

module.exports = router
