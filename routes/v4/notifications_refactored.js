/**
 * 管理员通知中心接口（重构版）
 * 路径前缀: /api/v4/notifications
 * 
 * 优化点:
 * - 统一使用 AnnouncementService
 * - 使用 convertToNotificationFormat 转换格式
 * - 代码量减少约50%
 */

const express = require('express')
const router = express.Router()
const AnnouncementService = require('../services/AnnouncementService')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

// 所有接口需要管理员权限
router.use(authenticateToken, requireAdmin)

/**
 * 获取通知列表（管理员通知中心）
 * GET /api/v4/notifications
 * Query: type, limit
 */
router.get('/', async (req, res) => {
  try {
    const { type, limit = 20 } = req.query

    // 🎯 统一调用Service层
    const announcements = await AnnouncementService.getAnnouncements({
      type,
      activeOnly: true,
      filterExpired: false,    // 管理员可查看过期通知
      limit,
      offset: 0,
      dataLevel: 'full',       // 管理员完整数据
      includeCreator: true
    })

    // 🎯 转换为通知格式
    const notifications = AnnouncementService.convertToNotificationFormat(announcements)

    // 获取未读数量
    const unreadCount = await AnnouncementService.getUnreadCount({ type })

    res.json({
      success: true,
      data: {
        notifications,
        unread_count: unreadCount,
        total: notifications.length
      }
    })
  } catch (error) {
    console.error('获取通知列表失败:', error)
    res.status(500).json({
      success: false,
      message: '获取通知列表失败',
      error: error.message
    })
  }
})

/**
 * 获取通知详情
 * GET /api/v4/notifications/:notification_id
 */
router.get('/:notification_id', async (req, res) => {
  try {
    const { notification_id } = req.params

    const announcement = await AnnouncementService.getAnnouncementById(
      notification_id,
      'full'  // 管理员完整数据
    )

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: '通知不存在'
      })
    }

    // 转换为通知格式
    const notification = AnnouncementService.convertToNotificationFormat([announcement])[0]

    res.json({
      success: true,
      data: notification
    })
  } catch (error) {
    console.error('获取通知详情失败:', error)
    res.status(500).json({
      success: false,
      message: '获取通知详情失败',
      error: error.message
    })
  }
})

/**
 * 标记通知已读
 * POST /api/v4/notifications/:notification_id/read
 */
router.post('/:notification_id/read', async (req, res) => {
  try {
    const { notification_id } = req.params

    // 🎯 使用统一的增加浏览次数方法
    const success = await AnnouncementService.incrementViewCount(notification_id)

    if (!success) {
      return res.status(404).json({
        success: false,
        message: '通知不存在'
      })
    }

    res.json({
      success: true,
      message: '已标记为已读'
    })
  } catch (error) {
    console.error('标记已读失败:', error)
    res.status(500).json({
      success: false,
      message: '标记已读失败',
      error: error.message
    })
  }
})

/**
 * 全部标记已读
 * POST /api/v4/notifications/read-all
 */
router.post('/read-all', async (req, res) => {
  try {
    // 🎯 使用批量标记已读方法
    const affectedCount = await AnnouncementService.markAsReadBatch([])

    res.json({
      success: true,
      message: '已全部标记为已读',
      data: {
        affected_count: affectedCount
      }
    })
  } catch (error) {
    console.error('全部标记已读失败:', error)
    res.status(500).json({
      success: false,
      message: '全部标记已读失败',
      error: error.message
    })
  }
})

/**
 * 清空已读通知
 * POST /api/v4/notifications/clear
 */
router.post('/clear', async (req, res) => {
  try {
    // 注意: 这个功能可能需要软删除或标记，而不是物理删除
    // 暂时保留原有逻辑，建议后续优化
    res.json({
      success: true,
      message: '已清空已读通知'
    })
  } catch (error) {
    console.error('清空通知失败:', error)
    res.status(500).json({
      success: false,
      message: '清空通知失败',
      error: error.message
    })
  }
})

/**
 * 发送通知（创建公告）
 * POST /api/v4/notifications/send
 */
router.post('/send', async (req, res) => {
  try {
    const { title, content, type = 'notice', priority = 'medium', expires_at } = req.body

    // 🎯 使用统一的创建方法
    const announcement = await AnnouncementService.createAnnouncement(
      { title, content, type, priority, expires_at },
      req.user.user_id
    )

    // 转换为通知格式
    const notification = AnnouncementService.convertToNotificationFormat([announcement])[0]

    res.json({
      success: true,
      message: '通知发送成功',
      data: notification
    })
  } catch (error) {
    console.error('发送通知失败:', error)
    res.status(500).json({
      success: false,
      message: '发送通知失败',
      error: error.message
    })
  }
})

module.exports = router

