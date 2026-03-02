/**
 * 管理后台 - 地域定向管理模块
 *
 * 业务范围：
 * - 地域区域（商圈/区域）CRUD：创建、查询、编辑、删除
 * - 联合广告组 CRUD：创建、查询、编辑、删除
 * - 联合组成员管理：添加/移除地域成员
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 AdTargetZoneService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 * - 写操作通过路由层事务边界管理
 *
 * @module routes/v4/console/zone-management
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('./shared/middleware')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/*
 * ═══════════════════════════════════════════════════
 * 地域区域 CRUD
 * ═══════════════════════════════════════════════════
 */

/**
 * GET /api/v4/console/zone-management/zones
 * 查询地域列表（支持筛选、搜索、分页）
 */
router.get(
  '/zones',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const ServiceManager = require('../../../services')
    const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

    const result = await AdTargetZoneService.listZones({
      zone_type: req.query.zone_type,
      status: req.query.status,
      keyword: req.query.keyword,
      page: parseInt(req.query.page) || 1,
      page_size: parseInt(req.query.page_size) || 20
    })

    return res.apiSuccess(result, '获取地域列表成功')
  })
)

/**
 * GET /api/v4/console/zone-management/zones/:id
 * 获取地域详情
 */
router.get(
  '/zones/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const ServiceManager = require('../../../services')
    const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

    const zone = await AdTargetZoneService.getZoneById(parseInt(req.params.id))
    if (!zone) {
      return res.apiError('地域不存在', 'ZONE_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(zone, '获取地域详情成功')
  })
)

/**
 * POST /api/v4/console/zone-management/zones
 * 创建地域区域
 */
router.post(
  '/zones',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { zone_type, zone_name, priority, parent_zone_id, geo_scope } = req.body

    if (!zone_type || !zone_name) {
      return res.apiError('缺少必需参数：zone_type, zone_name', 'MISSING_PARAM', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      const ServiceManager = require('../../../services')
      const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

      return AdTargetZoneService.createZone(
        { zone_type, zone_name, priority, parent_zone_id, geo_scope },
        { transaction }
      )
    })

    logger.info('[地域管理] 创建地域', {
      zone_id: result.zone_id,
      zone_name,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess(result, '创建地域成功')
  })
)

/**
 * PUT /api/v4/console/zone-management/zones/:id
 * 更新地域区域
 */
router.put(
  '/zones/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const zoneId = parseInt(req.params.id)

    const result = await TransactionManager.execute(async transaction => {
      const ServiceManager = require('../../../services')
      const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

      return AdTargetZoneService.updateZone(zoneId, req.body, { transaction })
    })

    logger.info('[地域管理] 更新地域', {
      zone_id: zoneId,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess(result, '更新地域成功')
  })
)

/**
 * DELETE /api/v4/console/zone-management/zones/:id
 * 删除地域区域
 */
router.delete(
  '/zones/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const zoneId = parseInt(req.params.id)

    await TransactionManager.execute(async transaction => {
      const ServiceManager = require('../../../services')
      const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

      return AdTargetZoneService.deleteZone(zoneId, { transaction })
    })

    logger.info('[地域管理] 删除地域', {
      zone_id: zoneId,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess(null, '删除地域成功')
  })
)

/*
 * ═══════════════════════════════════════════════════
 * 联合广告组 CRUD
 * ═══════════════════════════════════════════════════
 */

/**
 * GET /api/v4/console/zone-management/groups
 * 查询联合组列表
 */
router.get(
  '/groups',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const ServiceManager = require('../../../services')
    const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

    const result = await AdTargetZoneService.listGroups({
      status: req.query.status,
      keyword: req.query.keyword,
      page: parseInt(req.query.page) || 1,
      page_size: parseInt(req.query.page_size) || 20
    })

    return res.apiSuccess(result, '获取联合组列表成功')
  })
)

/**
 * GET /api/v4/console/zone-management/groups/:id
 * 获取联合组详情
 */
router.get(
  '/groups/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const ServiceManager = require('../../../services')
    const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

    const group = await AdTargetZoneService.getGroupById(parseInt(req.params.id))
    if (!group) {
      return res.apiError('联合组不存在', 'GROUP_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(group, '获取联合组详情成功')
  })
)

/**
 * POST /api/v4/console/zone-management/groups
 * 创建联合广告组
 */
router.post(
  '/groups',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { group_name, pricing_mode, discount_rate, fixed_price, zone_ids } = req.body

    if (!group_name) {
      return res.apiError('缺少必需参数：group_name', 'MISSING_PARAM', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      const ServiceManager = require('../../../services')
      const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

      return AdTargetZoneService.createGroup(
        { group_name, pricing_mode, discount_rate, fixed_price, zone_ids },
        { transaction }
      )
    })

    logger.info('[地域管理] 创建联合组', {
      group_id: result.group_id,
      group_name,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess(result, '创建联合组成功')
  })
)

/**
 * PUT /api/v4/console/zone-management/groups/:id
 * 更新联合广告组
 */
router.put(
  '/groups/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const groupId = parseInt(req.params.id)

    const result = await TransactionManager.execute(async transaction => {
      const ServiceManager = require('../../../services')
      const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

      return AdTargetZoneService.updateGroup(groupId, req.body, { transaction })
    })

    logger.info('[地域管理] 更新联合组', {
      group_id: groupId,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess(result, '更新联合组成功')
  })
)

/**
 * DELETE /api/v4/console/zone-management/groups/:id
 * 删除联合广告组
 */
router.delete(
  '/groups/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const groupId = parseInt(req.params.id)

    await TransactionManager.execute(async transaction => {
      const ServiceManager = require('../../../services')
      const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

      return AdTargetZoneService.deleteGroup(groupId, { transaction })
    })

    logger.info('[地域管理] 删除联合组', {
      group_id: groupId,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess(null, '删除联合组成功')
  })
)

/*
 * ═══════════════════════════════════════════════════
 * 联合组成员管理
 * ═══════════════════════════════════════════════════
 */

/**
 * POST /api/v4/console/zone-management/groups/:id/members
 * 批量添加地域到联合组
 */
router.post(
  '/groups/:id/members',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const groupId = parseInt(req.params.id)
    const { zone_ids } = req.body

    if (!Array.isArray(zone_ids) || zone_ids.length === 0) {
      return res.apiError('zone_ids 必须是非空数组', 'INVALID_PARAM', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      const ServiceManager = require('../../../services')
      const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

      return AdTargetZoneService.addGroupMembers(groupId, zone_ids, { transaction })
    })

    return res.apiSuccess(result, '添加联合组成员成功')
  })
)

/**
 * DELETE /api/v4/console/zone-management/groups/:id/members
 * 批量从联合组移除地域
 */
router.delete(
  '/groups/:id/members',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const groupId = parseInt(req.params.id)
    const { zone_ids } = req.body

    if (!Array.isArray(zone_ids) || zone_ids.length === 0) {
      return res.apiError('zone_ids 必须是非空数组', 'INVALID_PARAM', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      const ServiceManager = require('../../../services')
      const AdTargetZoneService = ServiceManager.getService('ad_target_zone')

      return AdTargetZoneService.removeGroupMembers(groupId, zone_ids, { transaction })
    })

    return res.apiSuccess(result, '移除联合组成员成功')
  })
)

module.exports = router
