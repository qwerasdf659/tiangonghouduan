/**
 * 管理后台 - 公告管理模块
 *
 * 业务范围：
 * - 创建系统公告
 * - 查询公告列表
 * - 更新公告
 * - 删除公告
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
 * POST /announcements - 创建系统公告
 *
 * @description 管理员创建系统公告
 * @route POST /api/v4/admin/announcements
 * @access Private (需要管理员权限)
 */
router.post(
  '/',
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
 *
 * @description 获取公告列表，支持分页和过滤
 * @route GET /api/v4/admin/announcements
 * @access Private (需要管理员权限)
 */
router.get(
  '/',
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
 *
 * @description 更新指定公告的信息
 * @route PUT /api/v4/admin/announcements/:id
 * @access Private (需要管理员权限)
 */
router.put(
  '/:id',
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
 *
 * @description 删除指定公告
 * @route DELETE /api/v4/admin/announcements/:id
 * @access Private (需要管理员权限)
 */
router.delete(
  '/:id',
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

module.exports = router
