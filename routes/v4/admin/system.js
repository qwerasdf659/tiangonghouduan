/**
 * 系统监控模块
 *
 * @description 系统状态监控、仪表板、公告管理、反馈管理相关路由
 * @version 4.0.0
 * @date 2025-09-29（扩展公告和反馈管理）
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 */

const express = require('express')
const router = express.Router()
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('./shared/middleware')

/**
 * GET /status - 获取系统状态
 *
 * @description 获取系统运行状态、数据库连接状态、Redis状态等
 * @route GET /api/v4/admin/status
 * @access Private (需要管理员权限)
 */
router.get(
  '/status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

      // 调用服务层方法获取系统状态（不再传入 models.sequelize）
      const statusInfo = await AdminSystemService.getSystemStatus(
        sharedComponents.lotteryEngine,
        sharedComponents.performanceMonitor
      )

      return res.apiSuccess(statusInfo, '系统状态获取成功')
    } catch (error) {
      sharedComponents.logger.error('系统状态获取失败', { error: error.message })
      return res.apiInternalError('系统状态获取失败', error.message, 'SYSTEM_STATUS_ERROR')
    }
  })
)

/**
 * GET /dashboard - 获取管理员仪表板数据
 *
 * @description 获取管理员仪表板展示数据，包括用户统计、抽奖统计、系统概览
 * @route GET /api/v4/admin/dashboard
 * @access Private (需要管理员权限)
 */
router.get(
  '/dashboard',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

      // 调用服务层方法获取仪表板数据（不再传入 models.sequelize）
      const dashboardData = await AdminSystemService.getDashboardData(
        sharedComponents.lotteryEngine,
        sharedComponents.performanceMonitor
      )

      return res.apiSuccess(dashboardData, '仪表板数据获取成功')
    } catch (error) {
      sharedComponents.logger.error('仪表板数据获取失败', { error: error.message })
      return res.apiInternalError('仪表板数据获取失败', error.message, 'DASHBOARD_ERROR')
    }
  })
)

/**
 * GET /management-status - 获取管理策略状态
 *
 * @description 获取抽奖管理策略的当前状态和配置
 * @route GET /api/v4/admin/management-status
 * @access Private (需要管理员权限)
 */
router.get(
  '/management-status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

      // 调用服务层方法获取管理策略状态
      const result = await AdminSystemService.getManagementStatus(
        sharedComponents.managementStrategy
      )

      if (result.success) {
        return res.apiSuccess(result.data, '管理状态获取成功')
      } else {
        return res.apiError(result.error || '管理状态获取失败', 'MANAGEMENT_STATUS_FAILED')
      }
    } catch (error) {
      sharedComponents.logger.error('管理状态获取失败', { error: error.message })
      return res.apiInternalError('管理状态获取失败', error.message, 'MANAGEMENT_STATUS_ERROR')
    }
  })
)

// ===================== 公告管理功能 =====================

/**
 * POST /announcements - 创建系统公告
 * @route POST /api/v4/admin/announcements
 * @access Private (需要管理员权限)
 */
router.post(
  '/announcements',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const {
        title,
        content,
        type = 'notice',
        priority = 'medium',
        target_groups = null,
        expires_at = null,
        internal_notes = null
      } = req.body

      // 验证必需参数
      if (!title || !content) {
        return res.apiError('标题和内容不能为空', 'INVALID_PARAMETERS')
      }

      // 获取公告服务
      const AnnouncementService = req.app.locals.services.getService('announcement')

      // 调用服务层方法创建公告
      const announcement = await AnnouncementService.createAnnouncement(
        {
          title: title.trim(),
          content: content.trim(),
          type,
          priority,
          target_groups,
          expires_at: expires_at ? new Date(expires_at) : null,
          internal_notes
        },
        req.user.user_id
      )

      sharedComponents.logger.info('管理员创建系统公告', {
        admin_id: req.user.user_id,
        announcement_id: announcement.announcement_id,
        title: announcement.title,
        type: announcement.type
      })

      return res.apiSuccess(
        {
          announcement
        },
        '公告创建成功'
      )
    } catch (error) {
      sharedComponents.logger.error('创建公告失败', { error: error.message })
      return res.apiInternalError('创建公告失败', error.message, 'ANNOUNCEMENT_CREATE_ERROR')
    }
  })
)

/**
 * GET /announcements - 获取所有公告
 * @route GET /api/v4/admin/announcements
 * @access Private (需要管理员权限)
 */
router.get(
  '/announcements',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { type = null, priority = null, is_active = null, limit = 20, offset = 0 } = req.query

      // 获取公告服务
      const AnnouncementService = req.app.locals.services.getService('announcement')

      // 调用服务层方法查询公告
      const announcements = await AnnouncementService.getAnnouncements({
        type,
        priority,
        activeOnly: is_active === 'true',
        filterExpired: false,
        limit,
        offset,
        dataLevel: 'full',
        includeCreator: true
      })

      const total = await AnnouncementService.getAnnouncementsCount({
        type,
        priority,
        activeOnly: is_active === 'true',
        filterExpired: false
      })

      return res.apiSuccess(
        {
          announcements,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        '获取公告列表成功'
      )
    } catch (error) {
      sharedComponents.logger.error('获取公告列表失败', { error: error.message })
      return res.apiInternalError('获取公告列表失败', error.message, 'ANNOUNCEMENT_LIST_ERROR')
    }
  })
)

/**
 * PUT /announcements/:id - 更新公告
 * @route PUT /api/v4/admin/announcements/:id
 * @access Private (需要管理员权限)
 */
router.put(
  '/announcements/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const updateData = req.body

      // 获取公告服务
      const AnnouncementService = req.app.locals.services.getService('announcement')

      // 调用服务层方法更新公告
      const announcement = await AnnouncementService.updateAnnouncement(id, updateData)

      if (!announcement) {
        return res.apiError('公告不存在', 'ANNOUNCEMENT_NOT_FOUND')
      }

      sharedComponents.logger.info('管理员更新系统公告', {
        admin_id: req.user.user_id,
        announcement_id: id,
        changes: Object.keys(updateData)
      })

      return res.apiSuccess(
        {
          announcement
        },
        '公告更新成功'
      )
    } catch (error) {
      sharedComponents.logger.error('更新公告失败', { error: error.message })
      return res.apiInternalError('更新公告失败', error.message, 'ANNOUNCEMENT_UPDATE_ERROR')
    }
  })
)

/**
 * DELETE /announcements/:id - 删除公告
 * @route DELETE /api/v4/admin/announcements/:id
 * @access Private (需要管理员权限)
 */
router.delete(
  '/announcements/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      // 获取公告服务
      const AnnouncementService = req.app.locals.services.getService('announcement')

      // 调用服务层方法删除公告
      const deleted = await AnnouncementService.deleteAnnouncement(id)

      if (!deleted) {
        return res.apiError('删除公告失败或公告不存在', 'ANNOUNCEMENT_DELETE_FAILED')
      }

      sharedComponents.logger.info('管理员删除系统公告', {
        admin_id: req.user.user_id,
        announcement_id: id
      })

      return res.apiSuccess({}, '公告删除成功')
    } catch (error) {
      sharedComponents.logger.error('删除公告失败', { error: error.message })
      return res.apiInternalError('删除公告失败', error.message, 'ANNOUNCEMENT_DELETE_ERROR')
    }
  })
)

// ===================== 反馈管理功能 =====================

/**
 * GET /feedbacks - 获取所有用户反馈
 * @route GET /api/v4/admin/feedbacks
 * @access Private (需要管理员权限)
 */
router.get(
  '/feedbacks',
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
 * POST /feedbacks/:id/reply - 回复用户反馈
 * @route POST /api/v4/admin/feedbacks/:id/reply
 * @access Private (需要管理员权限)
 */
router.post(
  '/feedbacks/:id/reply',
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
 * @route PUT /api/v4/admin/feedbacks/:id/status
 * @access Private (需要管理员权限)
 */
router.put(
  '/feedbacks/:id/status',
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
