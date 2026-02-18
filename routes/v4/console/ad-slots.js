/**
 * 管理后台 - 广告位管理模块
 *
 * 业务范围：
 * - 广告位列表查询（分页+筛选）
 * - 创建广告位
 * - 更新广告位
 * - 启用/禁用广告位
 * - 广告位统计数据
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 AdSlotService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 *
 * @see docs/广告系统升级方案.md
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('./shared/middleware')
const logger = require('../../../utils/logger').logger

/**
 * GET / - 获取所有广告位列表
 * @route GET /api/v4/console/ad-slots
 * @access Private (Admin)
 * @query {string} [slot_type] - 广告位类型筛选
 * @query {boolean} [is_active] - 是否启用筛选
 * @query {number} [page=1] - 页码
 * @query {number} [limit=20] - 每页数量
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { slot_type = null, is_active = null, page = 1, limit = 20 } = req.query
      const offset = (parseInt(page) - 1) * parseInt(limit)

      // 转换 is_active 字符串为布尔值
      let isActiveBool = null
      if (is_active !== null && is_active !== undefined) {
        isActiveBool = is_active === 'true' || is_active === '1'
      }

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const { slots, total } = await AdSlotService.getAdminSlotList({
        slot_type,
        is_active: isActiveBool,
        limit: parseInt(limit),
        offset
      })

      return res.apiSuccess(
        {
          slots,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            total_pages: Math.ceil(total / parseInt(limit))
          }
        },
        '获取广告位列表成功'
      )
    } catch (error) {
      logger.error('获取广告位列表失败', { error: error.message })
      return res.apiInternalError('获取广告位列表失败', error.message, 'AD_SLOT_LIST_ERROR')
    }
  })
)

/**
 * POST / - 创建广告位
 * @route POST /api/v4/console/ad-slots
 * @access Private (Admin)
 * @body {string} slot_name - 广告位名称
 * @body {string} slot_type - 广告位类型
 * @body {number} width - 宽度（像素）
 * @body {number} height - 高度（像素）
 * @body {string} [description] - 描述
 * @body {boolean} [is_active=true] - 是否启用
 */
router.post(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { slot_name, slot_type, width, height, description, is_active = true } = req.body

      if (!slot_name || !slot_type || !width || !height) {
        return res.apiBadRequest('缺少必需参数：slot_name, slot_type, width, height')
      }

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const slot = await AdSlotService.createSlot({
        slot_name,
        slot_type,
        width: parseInt(width),
        height: parseInt(height),
        description,
        is_active: is_active === true || is_active === 'true' || is_active === 1
      })

      logger.info('创建广告位成功', {
        slot_id: slot.ad_slot_id,
        admin_user_id: req.user.user_id
      })

      return res.apiSuccess(slot, '创建广告位成功')
    } catch (error) {
      logger.error('创建广告位失败', { error: error.message, admin_user_id: req.user.user_id })
      return res.apiInternalError('创建广告位失败', error.message, 'AD_SLOT_CREATE_ERROR')
    }
  })
)

/**
 * GET /statistics - 获取广告位统计数据
 * 注意：此路由必须定义在 /:id 之前，避免 "statistics" 被匹配为 :id 参数
 *
 * @route GET /api/v4/console/ad-slots/statistics
 * @access Private (Admin)
 */
router.get(
  '/statistics',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const statistics = await AdSlotService.getStatistics()

      return res.apiSuccess(statistics, '获取统计数据成功')
    } catch (error) {
      logger.error('获取广告位统计数据失败', { error: error.message })
      return res.apiInternalError('获取统计数据失败', error.message, 'AD_SLOT_STATISTICS_ERROR')
    }
  })
)

/**
 * PUT /:id - 更新广告位
 * @route PUT /api/v4/console/ad-slots/:id
 * @access Private (Admin)
 * @param {number} id - 广告位ID
 * @body {Object} updateData - 更新数据
 */
router.put(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const updateData = req.body

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const slot = await AdSlotService.updateSlot(id, updateData)

      if (!slot) {
        return res.apiError('广告位不存在', 'AD_SLOT_NOT_FOUND', null, 404)
      }

      logger.info('更新广告位成功', {
        slot_id: id,
        admin_user_id: req.user.user_id
      })

      return res.apiSuccess(slot, '更新广告位成功')
    } catch (error) {
      logger.error('更新广告位失败', {
        error: error.message,
        slot_id: req.params.id,
        admin_user_id: req.user.user_id
      })
      return res.apiInternalError('更新广告位失败', error.message, 'AD_SLOT_UPDATE_ERROR')
    }
  })
)

/**
 * PATCH /:id/toggle - 切换广告位启用状态
 * @route PATCH /api/v4/console/ad-slots/:id/toggle
 * @access Private (Admin)
 * @param {number} id - 广告位ID
 */
router.patch(
  '/:id/toggle',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const slot = await AdSlotService.toggleSlotStatus(id)

      if (!slot) {
        return res.apiError('广告位不存在', 'AD_SLOT_NOT_FOUND', null, 404)
      }

      logger.info('切换广告位状态成功', {
        slot_id: id,
        is_active: slot.is_active,
        admin_user_id: req.user.user_id
      })

      return res.apiSuccess(slot, `广告位已${slot.is_active ? '启用' : '禁用'}`)
    } catch (error) {
      logger.error('切换广告位状态失败', {
        error: error.message,
        slot_id: req.params.id,
        admin_user_id: req.user.user_id
      })
      return res.apiInternalError('切换广告位状态失败', error.message, 'AD_SLOT_TOGGLE_ERROR')
    }
  })
)

module.exports = router
