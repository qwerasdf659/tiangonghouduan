/**
 * 管理后台 - 广告位管理模块
 *
 * 业务范围：
 * - 广告位列表查询（分页+筛选）
 * - 广告位详情
 * - 创建广告位
 * - 更新广告位（白名单字段过滤）
 * - 启用/禁用广告位
 * - 广告位统计数据
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 AdSlotService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 * - 写操作字段白名单过滤，防止字段注入
 *
 * @see docs/广告系统升级方案.md Phase 3
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('./shared/middleware')
const logger = require('../../../utils/logger').logger

/** 广告位类型枚举 */
const VALID_SLOT_TYPES = ['popup', 'carousel']

/** 创建/更新时允许设置的字段白名单 */
const ALLOWED_CREATE_FIELDS = [
  'slot_key',
  'slot_name',
  'slot_type',
  'position',
  'max_display_count',
  'daily_price_diamond',
  'min_bid_diamond',
  'min_budget_diamond',
  'is_active',
  'description'
]

const ALLOWED_UPDATE_FIELDS = [
  'slot_name',
  'position',
  'max_display_count',
  'daily_price_diamond',
  'min_bid_diamond',
  'min_budget_diamond',
  'is_active',
  'description'
]

/**
 * GET / - 获取所有广告位列表
 * @route GET /api/v4/console/ad-slots
 * @access Private (Admin)
 * @query {string} [slot_type] - 广告位类型筛选（popup/carousel）
 * @query {string} [is_active] - 是否启用筛选（true/false）
 * @query {number} [page=1] - 页码
 * @query {number} [limit=20] - 每页数量
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { slot_type = null, is_active = null, page = 1, limit = 20 } = req.query

      if (slot_type && !VALID_SLOT_TYPES.includes(slot_type)) {
        return res.apiBadRequest(`slot_type 必须是以下之一：${VALID_SLOT_TYPES.join(', ')}`)
      }

      let isActiveBool = null
      if (is_active !== null && is_active !== undefined) {
        isActiveBool = is_active === 'true' || is_active === '1'
      }

      const pageNum = Math.max(1, parseInt(page) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 20))

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const result = await AdSlotService.getAdminSlotList({
        slot_type,
        is_active: isActiveBool,
        page: pageNum,
        pageSize
      })

      return res.apiSuccess(
        {
          slots: result.list,
          pagination: {
            total: result.total,
            page: pageNum,
            limit: pageSize,
            total_pages: Math.ceil(result.total / pageSize)
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
 * GET /:id - 获取广告位详情
 * @route GET /api/v4/console/ad-slots/:id
 * @access Private (Admin)
 * @param {number} id - 广告位ID
 */
router.get(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const slotId = parseInt(req.params.id)
      if (isNaN(slotId)) {
        return res.apiBadRequest('广告位 ID 必须是有效数字')
      }

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const slot = await AdSlotService.getSlotById(slotId)

      if (!slot) {
        return res.apiError('广告位不存在', 'AD_SLOT_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(slot, '获取广告位详情成功')
    } catch (error) {
      logger.error('获取广告位详情失败', { error: error.message, slot_id: req.params.id })
      return res.apiInternalError('获取广告位详情失败', error.message, 'AD_SLOT_DETAIL_ERROR')
    }
  })
)

/**
 * POST / - 创建广告位
 * @route POST /api/v4/console/ad-slots
 * @access Private (Admin)
 * @body {string} slot_key - 广告位唯一标识（如 home_popup）
 * @body {string} slot_name - 广告位名称（如「首页弹窗位」）
 * @body {string} slot_type - 广告位类型（popup/carousel）
 * @body {string} position - 页面位置（如 home/lottery/profile）
 * @body {number} daily_price_diamond - 固定包天日价（钻石）
 * @body {number} [max_display_count=3] - 该位每次最多展示广告数
 * @body {number} [min_bid_diamond=50] - 竞价最低日出价（钻石）
 * @body {number} [min_budget_diamond=500] - 竞价最低总预算（钻石）
 * @body {boolean} [is_active=true] - 是否启用
 * @body {string} [description] - 广告位描述
 */
router.post(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { slot_key, slot_name, slot_type, position, daily_price_diamond } = req.body

      // 必填字段校验
      if (!slot_key || !slot_name || !slot_type || !position || daily_price_diamond === undefined) {
        return res.apiBadRequest(
          '缺少必需参数：slot_key, slot_name, slot_type, position, daily_price_diamond'
        )
      }

      // 枚举校验
      if (!VALID_SLOT_TYPES.includes(slot_type)) {
        return res.apiBadRequest(`slot_type 必须是以下之一：${VALID_SLOT_TYPES.join(', ')}`)
      }

      // 数值校验
      const dailyPrice = parseInt(daily_price_diamond)
      if (isNaN(dailyPrice) || dailyPrice < 0) {
        return res.apiBadRequest('daily_price_diamond 必须是非负整数')
      }

      // 白名单字段提取
      const createData = {}
      ALLOWED_CREATE_FIELDS.forEach(field => {
        if (req.body[field] !== undefined) {
          createData[field] = req.body[field]
        }
      })

      // 类型转换
      if (createData.daily_price_diamond !== undefined) {
        createData.daily_price_diamond = parseInt(createData.daily_price_diamond)
      }
      if (createData.min_bid_diamond !== undefined) {
        createData.min_bid_diamond = parseInt(createData.min_bid_diamond)
      }
      if (createData.min_budget_diamond !== undefined) {
        createData.min_budget_diamond = parseInt(createData.min_budget_diamond)
      }
      if (createData.max_display_count !== undefined) {
        createData.max_display_count = parseInt(createData.max_display_count)
      }
      if (createData.is_active !== undefined) {
        createData.is_active = createData.is_active === true || createData.is_active === 'true'
      }

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const slot = await AdSlotService.createSlot(createData)

      logger.info('创建广告位成功', {
        slot_id: slot.ad_slot_id,
        slot_key: slot.slot_key,
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
 * PUT /:id - 更新广告位
 * @route PUT /api/v4/console/ad-slots/:id
 * @access Private (Admin)
 * @param {number} id - 广告位ID
 * @body {string} [slot_name] - 广告位名称
 * @body {string} [position] - 页面位置
 * @body {number} [daily_price_diamond] - 固定包天日价
 * @body {number} [min_bid_diamond] - 竞价最低日出价
 * @body {number} [min_budget_diamond] - 竞价最低总预算
 * @body {number} [max_display_count] - 最大展示数
 * @body {boolean} [is_active] - 是否启用
 * @body {string} [description] - 描述
 */
router.put(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const slotId = parseInt(req.params.id)
      if (isNaN(slotId)) {
        return res.apiBadRequest('广告位 ID 必须是有效数字')
      }

      // 白名单字段提取，防止字段注入
      const updateData = {}
      ALLOWED_UPDATE_FIELDS.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field]
        }
      })

      if (Object.keys(updateData).length === 0) {
        return res.apiBadRequest('至少需要提供一个更新字段')
      }

      // 数值字段类型转换
      const intFields = [
        'daily_price_diamond',
        'min_bid_diamond',
        'min_budget_diamond',
        'max_display_count'
      ]
      for (const field of intFields) {
        if (updateData[field] !== undefined) {
          const val = parseInt(updateData[field])
          if (isNaN(val) || val < 0) {
            return res.apiBadRequest(`${field} 必须是非负整数`)
          }
          updateData[field] = val
        }
      }

      if (updateData.is_active !== undefined) {
        updateData.is_active = updateData.is_active === true || updateData.is_active === 'true'
      }

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const slot = await AdSlotService.updateSlot(slotId, updateData)

      if (!slot) {
        return res.apiError('广告位不存在', 'AD_SLOT_NOT_FOUND', null, 404)
      }

      logger.info('更新广告位成功', {
        slot_id: slotId,
        admin_user_id: req.user.user_id,
        updated_fields: Object.keys(updateData)
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
      const slotId = parseInt(req.params.id)
      if (isNaN(slotId)) {
        return res.apiBadRequest('广告位 ID 必须是有效数字')
      }

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      const slot = await AdSlotService.toggleSlotStatus(slotId)

      if (!slot) {
        return res.apiError('广告位不存在', 'AD_SLOT_NOT_FOUND', null, 404)
      }

      logger.info('切换广告位状态成功', {
        slot_id: slotId,
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
