/**
 * 通知API路由模块 (Notifications API Routes)
 *
 * @description 通知功能API - 基于SystemAnnouncement实现
 * @module routes/v4/notifications
 * @requires express
 * @requires ../models - SystemAnnouncement模型
 * @requires ../middleware/auth - 身份认证中间件
 *
 * 设计说明：
 * - 本模块不创建新表，复用SystemAnnouncement表
 * - 提供符合前端期望的/api/v4/notifications路径
 * - 简化实现，专注管理员通知查看功能
 *
 * @author Restaurant Points System
 * @date 2025-11-23
 */

const express = require('express')
const router = express.Router()
// 🔄 TR-005规范：删除遗留的 models 直接引用，改为通过 ServiceManager 获取 Service
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const { Op } = require('sequelize')

/**
 * GET /api/v4/notifications - 获取通知列表
 *
 * @route GET /api/v4/notifications
 * @group Notifications - 通知管理
 * @security JWT
 * @param {string} type.query - 通知类型（可选）
 * @param {string} status.query - 已读状态（可选）
 * @param {number} limit.query - 返回数量（默认50）
 *
 * @returns {Object} 200 - 通知列表
 * @returns {Object} 401 - 未授权
 * @returns {Object} 500 - 服务器错误
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')

    const { type, limit = 50 } = req.query

    // ✅ 使用 AnnouncementService 统一查询逻辑
    const announcements = await AnnouncementService.getAnnouncements({
      type,
      limit,
      activeOnly: true,
      filterExpired: false,
      dataLevel: 'full',
      includeCreator: false
    })

    // ✅ 使用 AnnouncementService 方法转换为通知格式
    const notifications = AnnouncementService.convertToNotificationFormat(announcements)

    // ✅ 使用 AnnouncementService 获取未读数量
    const unread_count = await AnnouncementService.getUnreadCount({ type })

    return res.apiSuccess({
      notifications,
      total: notifications.length,
      unread: unread_count
    }, '获取通知列表成功')
  } catch (error) {
    console.error('[Notifications] ❌ 获取通知列表失败:', error)
    return res.apiInternalError('获取通知列表失败', error.message, 'NOTIFICATIONS_LIST_ERROR')
  }
})

/**
 * GET /api/v4/notifications/:notification_id - 获取通知详情
 *
 * @route GET /api/v4/notifications/:notification_id
 * @group Notifications - 通知管理
 * @security JWT
 * @param {number} notification_id.path - 通知ID
 *
 * @returns {Object} 200 - 通知详情
 * @returns {Object} 404 - 通知不存在
 * @returns {Object} 500 - 服务器错误
 */
router.get('/:notification_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { notification_id } = req.params

    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')
    const announcement = await AnnouncementService.getAnnouncementById(notification_id, 'full')

    if (!announcement) {
      return res.apiError('通知不存在', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    // 增加浏览次数（异步，不影响返回）
    AnnouncementService.incrementViewCount(notification_id).catch(err => {
      console.error(`⚠️ 更新view_count失败（ID:${notification_id}):`, err.message)
    })

    // 转换为通知格式
    const notification = {
      notification_id: announcement.announcement_id,
      id: announcement.announcement_id,
      type: announcement.type,
      title: announcement.title,
      content: announcement.content,
      is_read: true, // 查看详情后标记为已读
      created_at: announcement.created_at,
      priority: announcement.priority,
      expires_at: announcement.expires_at,
      view_count: announcement.view_count + 1
    }

    return res.apiSuccess({ notification }, '获取通知详情成功')
  } catch (error) {
    console.error('[Notifications] ❌ 获取通知详情失败:', error)
    return res.apiInternalError('获取通知详情失败', error.message, 'NOTIFICATION_DETAIL_ERROR')
  }
})

/**
 * POST /api/v4/notifications/:notification_id/read - 标记通知为已读
 *
 * @route POST /api/v4/notifications/:notification_id/read
 * @group Notifications - 通知管理
 * @security JWT
 *
 * @returns {Object} 200 - 标记成功
 * @returns {Object} 404 - 通知不存在
 */
router.post('/:notification_id/read', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { notification_id } = req.params

    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')
    const announcement = await AnnouncementService.getAnnouncementById(notification_id, 'full')

    if (!announcement) {
      return res.apiError('通知不存在', 'NOTIFICATION_NOT_FOUND', null, 404)
    }

    // 增加浏览次数
    await AnnouncementService.incrementViewCount(notification_id)

    return res.apiSuccess({
      notification_id,
      is_read: true
    }, '标记已读成功')
  } catch (error) {
    console.error('[Notifications] ❌ 标记已读失败:', error)
    return res.apiInternalError('标记已读失败', error.message, 'MARK_READ_ERROR')
  }
})

/**
 * POST /api/v4/notifications/read-all - 全部标记为已读
 *
 * @route POST /api/v4/notifications/read-all
 * @group Notifications - 通知管理
 * @security JWT
 *
 * @description 将所有活跃公告的view_count设置为1（视为已读）
 * @returns {Object} 200 - 操作成功
 */
router.post('/read-all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')

    // 使用 AnnouncementService 批量标记已读
    const updated_count = await AnnouncementService.markAsReadBatch([])

    console.log(`[Notifications] ✅ 全部标记已读: ${updated_count}条公告`)

    return res.apiSuccess({
      updated_count
    }, `成功标记${updated_count}条通知为已读`)
  } catch (error) {
    console.error('[Notifications] ❌ 全部标记已读失败:', error)
    return res.apiInternalError('全部标记已读失败', error.message, 'MARK_ALL_READ_ERROR')
  }
})

/**
 * POST /api/v4/notifications/clear - 清空已读通知
 *
 * @route POST /api/v4/notifications/clear
 * @group Notifications - 通知管理
 * @security JWT
 *
 * @description 将已读的公告标记为不活跃
 * @returns {Object} 200 - 操作成功
 */
router.post('/clear', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')

    // 获取所有已读的活跃公告ID
    const announcements = await AnnouncementService.getAnnouncements({
      activeOnly: true,
      filterExpired: false,
      limit: 1000,
      dataLevel: 'full',
      includeCreator: false
    })

    // 筛选出已读的公告（view_count > 0）
    const readAnnouncementIds = announcements
      .filter(ann => ann.view_count > 0)
      .map(ann => ann.announcement_id)

    // ✅ 使用 AnnouncementService 批量停用公告
    const cleared_count = await AnnouncementService.deactivateBatch(readAnnouncementIds)

    console.log(`[Notifications] ✅ 清空通知: ${cleared_count}条公告设为不活跃`)

    return res.apiSuccess({
      cleared_count
    }, cleared_count > 0 ? `成功清空${cleared_count}条已读通知` : '没有需要清空的已读通知')
  } catch (error) {
    console.error('[Notifications] ❌ 清空通知失败:', error)
    return res.apiInternalError('清空通知失败', error.message, 'CLEAR_NOTIFICATIONS_ERROR')
  }
})

/**
 * POST /api/v4/notifications/send - 发送系统通知
 *
 * @route POST /api/v4/notifications/send
 * @group Notifications - 通知管理
 * @security JWT
 * @param {string} type - 通知类型
 * @param {string} title - 通知标题
 * @param {string} content - 通知内容
 * @param {string} target - 目标用户（all/user/admin）
 *
 * @returns {Object} 200 - 发送成功
 * @returns {Object} 400 - 参数错误
 */
router.post('/send', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type, title, content, target = 'all' } = req.body

    // 参数验证
    if (!title || !content) {
      return res.apiError('标题和内容不能为空', 'MISSING_REQUIRED_FIELDS', null, 400)
    }

    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')

    // 映射前端类型到后端类型
    const typeMapping = {
      system: 'system',
      user: 'notice',
      order: 'notice',
      alert: 'maintenance'
    }
    const announcement_type = typeMapping[type] || 'notice'

    // 使用 AnnouncementService 创建公告
    const announcement = await AnnouncementService.createAnnouncement({
      title,
      content,
      type: announcement_type,
      priority: type === 'alert' ? 'high' : 'medium',
      target_groups: target,
      internal_notes: `通过通知中心发送，管理员ID: ${req.user.user_id}`
    }, req.user.user_id)

    console.log(`[Notifications] ✅ 发送通知成功: ${announcement.announcement_id} - ${title}`)

    return res.apiSuccess({
      notification_id: announcement.announcement_id,
      title,
      content,
      type: announcement_type,
      created_at: announcement.created_at
    }, '通知发送成功')
  } catch (error) {
    console.error('[Notifications] ❌ 发送通知失败:', error)
    return res.apiInternalError('发送通知失败', error.message, 'SEND_NOTIFICATION_ERROR')
  }
})

module.exports = router
