/**
 * 管理员通知 API 路由模块 — 基于 admin_notifications 表
 *
 * 业务场景：
 * - 管理员通知中心（查看告警列表、详情、标记已读、删除等）
 * - 数据来源：admin_notifications 表（由 NotificationService.sendToAdmins() 写入）
 * - 支持按 notification_type、priority、is_read、source_type、keyword、时间范围筛选
 *
 * @module routes/v4/system/notifications
 */

const { asyncHandler } = require('../../../middleware/validation')
const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')

/**
 * GET /unread-count - 获取当前管理员的未读通知数量
 * @route GET /api/v4/system/notifications/unread-count
 * @access Private（管理员）
 *
 * 注意：固定路径必须在 /:id 参数路由之前注册
 */
router.get(
  '/unread-count',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const NotificationService = req.app.locals.services.getService('notification')
    const counts = await NotificationService.getAdminUnreadCounts(req.user.user_id)

    return res.apiSuccess(counts, '获取未读数量成功')
  })
)

/**
 * POST /read-all - 全部标记已读
 * @route POST /api/v4/system/notifications/read-all
 * @access Private（管理员）
 */
router.post(
  '/read-all',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const NotificationService = req.app.locals.services.getService('notification')
    const updatedCount = await NotificationService.markAllAdminNotificationsAsRead(req.user.user_id)

    return res.apiSuccess({ updated_count: updatedCount }, '全部标记已读成功')
  })
)

/**
 * POST /clear - 清空已读通知（物理删除所有已读）
 * @route POST /api/v4/system/notifications/clear
 * @access Private（管理员）
 */
router.post(
  '/clear',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const NotificationService = req.app.locals.services.getService('notification')
    const clearedCount = await NotificationService.clearReadAdminNotifications(req.user.user_id)

    return res.apiSuccess({ cleared_count: clearedCount }, '清空已读通知成功')
  })
)

/**
 * POST /send - 管理员手动发送公告
 * @route POST /api/v4/system/notifications/send
 * @access Private（管理员）
 * @body {string} title - 标题
 * @body {string} content - 内容
 * @body {string} [priority=normal] - 优先级
 */
router.post(
  '/send',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { title, content, priority = 'normal' } = req.body

    if (!title || !content) {
      return res.apiError('标题和内容不能为空', 'MISSING_REQUIRED_FIELDS', null, 400)
    }

    const NotificationService = req.app.locals.services.getService('notification')
    const result = await NotificationService.notifyAnnouncement(null, {
      title,
      content,
      announcement_type: 'admin_broadcast',
      sender_id: req.user.user_id,
      sender_name: req.user.nickname || '管理员',
      priority
    })

    return res.apiSuccess(
      {
        notification_count: result.persisted_count,
        broadcasted_count: result.broadcasted_count
      },
      '通知发送成功'
    )
  })
)

/**
 * GET / - 获取通知列表
 * @route GET /api/v4/system/notifications
 * @access Private（管理员）
 * @query {string} [notification_type] - 通知类型筛选（system/alert/reminder/task）
 * @query {string} [priority] - 优先级筛选（low/normal/high/urgent）
 * @query {string} [is_read] - 已读状态筛选（0=未读, 1=已读）
 * @query {string} [source_type] - 来源类型精确匹配
 * @query {string} [keyword] - 模糊搜索标题和内容
 * @query {string} [start_date] - 创建时间起始（ISO8601）
 * @query {string} [end_date] - 创建时间截止（ISO8601）
 * @query {number} [page_size=20] - 每页数量
 * @query {number} [offset=0] - 偏移量
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const NotificationService = req.app.locals.services.getService('notification')
    const result = await NotificationService.listAdminNotifications(req.user.user_id, req.query)

    return res.apiSuccess(result, '获取通知列表成功')
  })
)

/**
 * GET /:id - 获取通知详情
 * @route GET /api/v4/system/notifications/:id
 * @access Private（管理员）
 */
router.get(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const adminId = req.user.user_id
    const notificationId = parseInt(req.params.id)

    if (isNaN(notificationId)) {
      return res.apiError('通知ID格式无效', 'INVALID_NOTIFICATION_ID', null, 400)
    }

    const NotificationService = req.app.locals.services.getService('notification')
    const notification = await NotificationService.getAdminNotificationDetail(
      adminId,
      notificationId
    )

    if (!notification) {
      return res.apiError('通知不存在', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(notification, '获取通知详情成功')
  })
)

/**
 * POST /:id/read - 标记单条通知已读
 * @route POST /api/v4/system/notifications/:id/read
 * @access Private（管理员）
 */
router.post(
  '/:id/read',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const adminId = req.user.user_id
    const notificationId = parseInt(req.params.id)

    if (isNaN(notificationId)) {
      return res.apiError('通知ID格式无效', 'INVALID_NOTIFICATION_ID', null, 400)
    }

    const NotificationService = req.app.locals.services.getService('notification')
    const result = await NotificationService.markAdminNotificationAsRead(adminId, notificationId)

    if (!result) {
      return res.apiError('通知不存在', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(result, '标记已读成功')
  })
)

/**
 * DELETE /:id - 删除单条通知（物理删除）
 * @route DELETE /api/v4/system/notifications/:id
 * @access Private（管理员）
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const adminId = req.user.user_id
    const notificationId = parseInt(req.params.id)

    if (isNaN(notificationId)) {
      return res.apiError('通知ID格式无效', 'INVALID_NOTIFICATION_ID', null, 400)
    }

    const NotificationService = req.app.locals.services.getService('notification')
    const deleted = await NotificationService.deleteAdminNotification(adminId, notificationId)

    if (!deleted) {
      return res.apiError('通知不存在或无权删除', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess({ deleted: true }, '删除通知成功')
  })
)

module.exports = router
