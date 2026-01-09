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
 * 创建时间：2025-12-22
 */

const express = require('express')
const router = express.Router()
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('../shared/middleware')

/**
 * GET /feedbacks - 获取所有用户反馈
 *
 * @description 获取用户反馈列表，支持分页和过滤
 * @route GET /api/v4/console/feedbacks
 * @access Private (需要管理员权限)
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { status = null, category = null, priority = null, limit = 20, offset = 0 } = req.query

      // 获取反馈服务
      const FeedbackService = req.app.locals.services.getService('feedback')

      // 调用服务层方法查询反馈列表
      const result = await FeedbackService.getFeedbackList({
        status,
        category,
        priority,
        limit,
        offset
      })

      return res.apiSuccess(result, '获取反馈列表成功')
    } catch (error) {
      sharedComponents.logger.error('获取反馈列表失败', { error: error.message })
      return res.apiInternalError('获取反馈列表失败', error.message, 'FEEDBACK_LIST_ERROR')
    }
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
    try {
      const models = require('../../../../models')

      // 并行查询各状态数量
      const [total, pending, processing, replied, closed] = await Promise.all([
        models.Feedback.count(),
        models.Feedback.count({ where: { status: 'pending' } }),
        models.Feedback.count({ where: { status: 'processing' } }),
        models.Feedback.count({ where: { status: 'replied' } }),
        models.Feedback.count({ where: { status: 'closed' } })
      ])

      return res.apiSuccess({
        total,
        pending,
        processing,
        replied,
        closed,
        resolved: replied + closed // 已解决 = 已回复 + 已关闭
      }, '获取反馈统计成功')
    } catch (error) {
      sharedComponents.logger.error('获取反馈统计失败', { error: error.message })
      return res.apiInternalError('获取反馈统计失败', error.message, 'FEEDBACK_STATS_ERROR')
    }
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
    try {
      const { id } = req.params

      // 获取反馈服务
      const FeedbackService = req.app.locals.services.getService('feedback')

      // 调用服务层方法获取反馈详情
      const feedback = await FeedbackService.getFeedbackById(id)

      if (!feedback) {
        return res.apiError('反馈不存在', 'FEEDBACK_NOT_FOUND', null, 404)
      }

      return res.apiSuccess({ feedback }, '获取反馈详情成功')
    } catch (error) {
      sharedComponents.logger.error('获取反馈详情失败', { error: error.message })
      return res.apiInternalError('获取反馈详情失败', error.message, 'FEEDBACK_DETAIL_ERROR')
    }
  })
)

/**
 * POST /feedbacks/:id/reply - 回复用户反馈
 *
 * @description 管理员回复用户提交的反馈
 * @route POST /api/v4/console/feedbacks/:id/reply
 * @access Private (需要管理员权限)
 */
router.post(
  '/:id/reply',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
      sharedComponents.logger.error('回复反馈失败', { error: error.message })

      // 处理业务错误
      if (error.message.includes('反馈不存在')) {
        return res.apiError(error.message, 'FEEDBACK_NOT_FOUND')
      }
      if (error.message.includes('回复内容不能为空')) {
        return res.apiError(error.message, 'INVALID_PARAMETERS')
      }

      return res.apiInternalError('回复反馈失败', error.message, 'FEEDBACK_REPLY_ERROR')
    }
  })
)

/**
 * PUT /feedbacks/:id/status - 更新反馈状态
 *
 * @description 更新反馈的处理状态
 * @route PUT /api/v4/console/feedbacks/:id/status
 * @access Private (需要管理员权限)
 */
router.put(
  '/:id/status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
      sharedComponents.logger.error('更新反馈状态失败', { error: error.message })

      // 处理业务错误
      if (error.message.includes('反馈不存在')) {
        return res.apiError(error.message, 'FEEDBACK_NOT_FOUND')
      }

      return res.apiInternalError('更新反馈状态失败', error.message, 'FEEDBACK_STATUS_ERROR')
    }
  })
)

module.exports = router
