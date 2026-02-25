/**
 * 用户通知路由 — 通知系统独立化（方案B）
 *
 * 路径前缀：/api/v4/user/notifications
 * 认证方式：authenticateToken（通过 req.user.user_id 隔离数据）
 *
 * 职责：
 * - 获取用户通知列表（分页、按类型筛选、按已读状态筛选）
 * - 获取未读通知数量（铃铛角标数据源）
 * - 批量标记已读（全部已读按钮）
 * - 单条标记已读（点击通知时触发）
 *
 * 架构说明：
 * - 读写操作均通过 NotificationService（经 ServiceManager 获取），路由层不直接访问 models
 * - NotificationService 为静态类，注册键: 'notification'
 *
 * 创建时间：2026年02月24日
 * @see docs/通知系统独立化-方案B实施文档.md
 */

'use strict'

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger

/**
 * GET /api/v4/user/notifications
 * @desc 获取当前用户的通知列表（分页）
 * @access Private（authenticateToken）
 *
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（最大50）
 * @query {string} [type] - 按通知类型筛选（如 listing_created, purchase_completed）
 * @query {string} [is_read] - 按已读状态筛选（0=未读，1=已读）
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.user_id
    const NotificationService = req.app.locals.services.getService('notification')

    const result = await NotificationService.getNotifications(userId, {
      page: req.query.page,
      pageSize: req.query.page_size,
      type: req.query.type,
      isRead: req.query.is_read
    })

    return res.apiSuccess(result, '获取通知列表成功')
  } catch (error) {
    logger.error('[用户通知] 获取列表失败', {
      user_id: req.user?.user_id,
      error: error.message,
      stack: error.stack
    })
    return res.apiInternalError('获取通知列表失败')
  }
})

/**
 * GET /api/v4/user/notifications/unread-count
 * @desc 获取当前用户的未读通知数量（铃铛角标数据源）
 * @access Private（authenticateToken）
 */
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.user_id
    const NotificationService = req.app.locals.services.getService('notification')

    const unreadCount = await NotificationService.getUnreadCount(userId)

    return res.apiSuccess({ unread_count: unreadCount }, '获取未读数量成功')
  } catch (error) {
    logger.error('[用户通知] 获取未读数量失败', {
      user_id: req.user?.user_id,
      error: error.message
    })
    return res.apiInternalError('获取未读数量失败')
  }
})

/**
 * POST /api/v4/user/notifications/mark-read
 * @desc 批量标记通知为已读
 * @access Private（authenticateToken）
 *
 * @body {number[]} [notification_ids] - 通知ID列表（空数组或不传则全部标记已读）
 */
router.post('/mark-read', async (req, res) => {
  try {
    const userId = req.user.user_id
    const { notification_ids } = req.body || {}
    const NotificationService = req.app.locals.services.getService('notification')

    const markedCount = await NotificationService.markBatchAsRead(userId, notification_ids)

    logger.info('[用户通知] 批量标记已读', {
      user_id: userId,
      requested_ids: notification_ids || 'all',
      marked_count: markedCount
    })

    return res.apiSuccess({ marked_count: markedCount }, '标记已读成功')
  } catch (error) {
    logger.error('[用户通知] 批量标记已读失败', {
      user_id: req.user?.user_id,
      error: error.message
    })
    return res.apiInternalError('标记已读失败')
  }
})

/**
 * POST /api/v4/user/notifications/:id/read
 * @desc 单条标记通知为已读（用户点击某条通知时调用）
 * @access Private（authenticateToken）
 *
 * @param {number} id - 通知ID
 */
router.post('/:id/read', async (req, res) => {
  try {
    const userId = req.user.user_id
    const notificationId = parseInt(req.params.id)

    if (!notificationId || isNaN(notificationId)) {
      return res.apiBadRequest('通知ID无效')
    }

    const NotificationService = req.app.locals.services.getService('notification')
    const result = await NotificationService.markSingleAsRead(userId, notificationId)

    if (!result) {
      return res.apiNotFound('通知不存在')
    }

    if (result.already_read) {
      return res.apiSuccess(
        {
          notification_id: result.notification_id,
          is_read: result.is_read,
          read_at: result.read_at
        },
        '通知已经是已读状态'
      )
    }

    logger.info('[用户通知] 单条标记已读', {
      user_id: userId,
      notification_id: notificationId
    })

    return res.apiSuccess(
      {
        notification_id: result.notification_id,
        is_read: result.is_read,
        read_at: result.read_at
      },
      '标记已读成功'
    )
  } catch (error) {
    logger.error('[用户通知] 单条标记已读失败', {
      user_id: req.user?.user_id,
      notification_id: req.params.id,
      error: error.message
    })
    return res.apiInternalError('标记已读失败')
  }
})

module.exports = router
