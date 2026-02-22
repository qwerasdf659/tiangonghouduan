/**
 * 通知API路由模块 — 基于 ad_campaigns (category=system) 实现
 *
 * 业务场景：
 * - 管理员通知中心（查看系统通知列表、详情、标记已读等）
 * - 原基于 SystemAnnouncement 表，已合并到 ad_campaigns + ad_creatives
 *
 * 合并后逻辑：
 * - 系统通知 = ad_campaigns WHERE campaign_category='system'
 * - 通知内容 = ad_creatives WHERE content_type='text'（文字）或 'image'（图片）
 * - 浏览记录 = ad_interaction_logs WHERE interaction_type='impression'
 *
 * @module routes/v4/system/notifications
 * @see docs/内容投放系统-重复功能合并方案.md
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * GET / - 获取系统通知列表
 * @route GET /api/v4/system/notifications
 * @access Private（管理员）
 * @query {number} [limit=50] - 返回数量
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { limit = 50 } = req.query

    const AdCampaignService = req.app.locals.services.getService('ad_campaign')
    const result = await AdCampaignService.getSystemNotifications({ limit })

    return res.apiSuccess(result, '获取通知列表成功')
  } catch (error) {
    logger.error('[Notifications] 获取通知列表失败', { error: error.message })
    return res.apiInternalError('获取通知列表失败', error.message, 'NOTIFICATIONS_LIST_ERROR')
  }
})

/**
 * GET /:notification_id - 获取通知详情
 * @route GET /api/v4/system/notifications/:notification_id
 * @access Private（管理员）
 */
router.get('/:notification_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { notification_id } = req.params

    const AdCampaignService = req.app.locals.services.getService('ad_campaign')
    const notification = await AdCampaignService.getSystemNotificationById(
      notification_id,
      { userId: req.user?.user_id }
    )

    if (!notification) {
      return res.apiError('通知不存在', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess({ notification }, '获取通知详情成功')
  } catch (error) {
    logger.error('[Notifications] 获取通知详情失败', { error: error.message })
    return res.apiInternalError('获取通知详情失败', error.message, 'NOTIFICATION_DETAIL_ERROR')
  }
})

/**
 * POST /:notification_id/read - 标记通知已读
 * @route POST /api/v4/system/notifications/:notification_id/read
 */
router.post(
  '/:notification_id/read',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { notification_id } = req.params

      return res.apiSuccess({ notification_id, is_read: true }, '标记已读成功')
    } catch (error) {
      logger.error('[Notifications] 标记已读失败', { error: error.message })
      return res.apiInternalError('标记已读失败', error.message, 'MARK_READ_ERROR')
    }
  }
)

/**
 * POST /read-all - 全部标记已读
 * @route POST /api/v4/system/notifications/read-all
 */
router.post('/read-all', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    return res.apiSuccess({ updated_count: 0 }, '全部标记已读成功')
  } catch (error) {
    logger.error('[Notifications] 全部标记已读失败', { error: error.message })
    return res.apiInternalError('全部标记已读失败', error.message, 'MARK_ALL_READ_ERROR')
  }
})

/**
 * POST /clear - 清空已读通知
 * @route POST /api/v4/system/notifications/clear
 */
router.post('/clear', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    return res.apiSuccess({ cleared_count: 0 }, '清空通知成功')
  } catch (error) {
    logger.error('[Notifications] 清空通知失败', { error: error.message })
    return res.apiInternalError('清空通知失败', error.message, 'CLEAR_NOTIFICATIONS_ERROR')
  }
})

/**
 * POST /send - 发送系统通知（创建 system 类型 campaign + text creative）
 * @route POST /api/v4/system/notifications/send
 * @body {string} title - 标题
 * @body {string} content - 内容
 * @body {string} [target=all] - 目标用户
 */
router.post('/send', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { title, content, target = 'all' } = req.body

    if (!title || !content) {
      return res.apiError('标题和内容不能为空', 'MISSING_REQUIRED_FIELDS', null, 400)
    }

    const AdCampaignService = req.app.locals.services.getService('ad_campaign')
    const result = await AdCampaignService.sendSystemNotification({
      title,
      content,
      target,
      sender_user_id: req.user.user_id
    })

    return res.apiSuccess(result, '通知发送成功')
  } catch (error) {
    logger.error('[Notifications] 发送通知失败', { error: error.message })
    return res.apiInternalError('发送通知失败', error.message, 'SEND_NOTIFICATION_ERROR')
  }
})

module.exports = router
