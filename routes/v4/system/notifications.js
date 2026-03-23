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

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { AdminNotification, Op } = require('../../../models')
const logger = require('../../../utils/logger').logger

/**
 * GET /unread-count - 获取当前管理员的未读通知数量
 * @route GET /api/v4/system/notifications/unread-count
 * @access Private（管理员）
 *
 * 注意：固定路径必须在 /:id 参数路由之前注册
 */
router.get('/unread-count', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id

    const [unreadCount, urgentUnreadCount] = await Promise.all([
      AdminNotification.getUnreadCount(adminId),
      AdminNotification.getUrgentUnreadCount(adminId)
    ])

    return res.apiSuccess(
      {
        unread_count: unreadCount,
        urgent_unread_count: urgentUnreadCount
      },
      '获取未读数量成功'
    )
  } catch (error) {
    logger.error('[Notifications] 获取未读数量失败', { error: error.message })
    return res.apiInternalError('获取未读数量失败', error.message, 'UNREAD_COUNT_ERROR')
  }
})

/**
 * POST /read-all - 全部标记已读
 * @route POST /api/v4/system/notifications/read-all
 * @access Private（管理员）
 */
router.post('/read-all', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id
    const updatedCount = await AdminNotification.markAllAsRead(adminId)

    return res.apiSuccess({ updated_count: updatedCount }, '全部标记已读成功')
  } catch (error) {
    logger.error('[Notifications] 全部标记已读失败', { error: error.message })
    return res.apiInternalError('全部标记已读失败', error.message, 'MARK_ALL_READ_ERROR')
  }
})

/**
 * POST /clear - 清空已读通知（物理删除所有已读）
 * @route POST /api/v4/system/notifications/clear
 * @access Private（管理员）
 */
router.post('/clear', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id

    const clearedCount = await AdminNotification.destroy({
      where: { admin_id: adminId, is_read: true }
    })

    return res.apiSuccess({ cleared_count: clearedCount }, '清空已读通知成功')
  } catch (error) {
    logger.error('[Notifications] 清空通知失败', { error: error.message })
    return res.apiInternalError('清空通知失败', error.message, 'CLEAR_NOTIFICATIONS_ERROR')
  }
})

/**
 * POST /send - 管理员手动发送公告
 * @route POST /api/v4/system/notifications/send
 * @access Private（管理员）
 * @body {string} title - 标题
 * @body {string} content - 内容
 * @body {string} [priority=normal] - 优先级
 */
router.post('/send', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
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
  } catch (error) {
    logger.error('[Notifications] 发送通知失败', { error: error.message })
    return res.apiInternalError('发送通知失败', error.message, 'SEND_NOTIFICATION_ERROR')
  }
})

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
 * @query {number} [limit=20] - 每页数量
 * @query {number} [offset=0] - 偏移量
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id
    const {
      notification_type,
      priority,
      is_read,
      source_type,
      keyword,
      start_date,
      end_date,
      page_size = 20,
      offset = 0
    } = req.query

    const where = { admin_id: adminId }

    if (notification_type) {
      where.notification_type = notification_type
    }
    if (priority) {
      where.priority = priority
    }
    if (is_read !== undefined && is_read !== '') {
      where.is_read = is_read === '1' || is_read === 'true'
    }
    if (source_type) {
      where.source_type = source_type
    }

    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { content: { [Op.like]: `%${keyword}%` } }
      ]
    }

    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date)
    }

    const { count, rows } = await AdminNotification.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Math.min(parseInt(page_size) || 20, 100),
      offset: parseInt(offset) || 0
    })

    const unreadCount = await AdminNotification.getUnreadCount(adminId)

    return res.apiSuccess(
      {
        items: rows,
        total: count,
        unread_count: unreadCount
      },
      '获取通知列表成功'
    )
  } catch (error) {
    logger.error('[Notifications] 获取通知列表失败', { error: error.message })
    return res.apiInternalError('获取通知列表失败', error.message, 'NOTIFICATIONS_LIST_ERROR')
  }
})

/**
 * GET /:id - 获取通知详情
 * @route GET /api/v4/system/notifications/:id
 * @access Private（管理员）
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id
    const notificationId = parseInt(req.params.id)

    if (isNaN(notificationId)) {
      return res.apiError('通知ID格式无效', 'INVALID_NOTIFICATION_ID', null, 400)
    }

    const notification = await AdminNotification.findOne({
      where: { admin_notification_id: notificationId, admin_id: adminId }
    })

    if (!notification) {
      return res.apiError('通知不存在', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(notification, '获取通知详情成功')
  } catch (error) {
    logger.error('[Notifications] 获取通知详情失败', { error: error.message })
    return res.apiInternalError('获取通知详情失败', error.message, 'NOTIFICATION_DETAIL_ERROR')
  }
})

/**
 * POST /:id/read - 标记单条通知已读
 * @route POST /api/v4/system/notifications/:id/read
 * @access Private（管理员）
 */
router.post('/:id/read', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id
    const notificationId = parseInt(req.params.id)

    if (isNaN(notificationId)) {
      return res.apiError('通知ID格式无效', 'INVALID_NOTIFICATION_ID', null, 400)
    }

    const notification = await AdminNotification.findOne({
      where: { admin_notification_id: notificationId, admin_id: adminId }
    })

    if (!notification) {
      return res.apiError('通知不存在', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    await notification.markAsRead()

    return res.apiSuccess(
      {
        admin_notification_id: notification.admin_notification_id,
        is_read: notification.is_read,
        read_at: notification.read_at
      },
      '标记已读成功'
    )
  } catch (error) {
    logger.error('[Notifications] 标记已读失败', { error: error.message })
    return res.apiInternalError('标记已读失败', error.message, 'MARK_READ_ERROR')
  }
})

/**
 * DELETE /:id - 删除单条通知（物理删除）
 * @route DELETE /api/v4/system/notifications/:id
 * @access Private（管理员）
 */
router.delete('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const adminId = req.user.user_id
    const notificationId = parseInt(req.params.id)

    if (isNaN(notificationId)) {
      return res.apiError('通知ID格式无效', 'INVALID_NOTIFICATION_ID', null, 400)
    }

    const deleted = await AdminNotification.destroy({
      where: { admin_notification_id: notificationId, admin_id: adminId }
    })

    if (!deleted) {
      return res.apiError('通知不存在或无权删除', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess({ deleted: true }, '删除通知成功')
  } catch (error) {
    logger.error('[Notifications] 删除通知失败', { error: error.message })
    return res.apiInternalError('删除通知失败', error.message, 'DELETE_NOTIFICATION_ERROR')
  }
})

module.exports = router
