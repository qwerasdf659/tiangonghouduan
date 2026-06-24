/**
 * 天工商户营销平台 V4.2 - 本店核销概况 + 店员授权 API（门店专属兑换券业务线）
 *
 * 提供两个端点（均挂在 /api/v4/shop/redemption 前缀下）：
 * - GET  /store-stats?store_id=:id          本店核销概况（manager 或被授权 staff 可看）
 * - PUT  /staff/:store_staff_id/stats-permission  店长授权本店店员查看（小程序 + Web 后台共用）
 *
 * 设计依据：docs/门店专属兑换券业务线设计与核销概况对接.md §10.5 接口1/2、§9.8
 * 规则：路由不直连 models，写操作经 TransactionManager.execute + Service；snake_case；res.api*；不下发用户 PII。
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const { resolveStoreContext } = require('../../../../middleware/resolveStoreContext')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger

/**
 * 本店核销概况（接口1）
 * GET /api/v4/shop/redemption/store-stats?store_id=:id
 *
 * 鉴权：登录 + 门店上下文解析（在职校验）+ manager 放行 / staff 须被授权 can_view_redemption_stats。
 * 返回：{ store_id, pending_count, fulfilled_count }（无用户 PII）。
 */
router.get(
  '/store-stats',
  authenticateToken,
  resolveStoreContext({ storeIdParam: 'query' }),
  asyncHandler(async (req, res) => {
    const storeId = req.store_context?.store_id || parseInt(req.query.store_id, 10)
    const userId = req.user.user_id
    const roleLevel = req.user.role_level || 0

    const RedemptionService = req.app.locals.services.getService('redemption_order')

    const canView = await RedemptionService.canUserViewStoreStats(userId, storeId, roleLevel)
    if (!canView) {
      logger.warn('无权限查看本店核销概况', { user_id: userId, store_id: storeId })
      return res.apiError(
        '无权限查看本店核销概况，请联系本店店长授权',
        'REDEMPTION_STATS_FORBIDDEN',
        null,
        403
      )
    }

    const stats = await RedemptionService.getStoreRedemptionStats(storeId)
    return res.apiSuccess(stats, '查询成功')
  })
)

/**
 * 门店范围核销订单列表（数据范围隔离 - 核销侧跨店列表，2026-06-24 §12 补齐）
 * GET /api/v4/shop/redemption/store-orders?store_id=:id&status=fulfilled&page=1&page_size=20
 *
 * 与消费记录列表（/shop/consumption/merchant/list）同构的核销侧版本：
 * - resolveStoreContext 先校验该用户在 store_id 在职（防越权访问任意门店）+ 概况查看授权；
 * - DataScopeService 给出"该用户可见的全部门店集合"（店长本店 / 区域负责人辖区多店 / 管理员全局），
 *   列表按"实际核销门店 fulfilled_store_id"聚合。
 * 鉴权：登录 + 门店上下文（在职校验）+ manager 放行 / staff 须被授权 can_view_redemption_stats。
 * 返回：{ records, pagination, query_scope, query_note }（无用户 PII）。
 */
router.get(
  '/store-orders',
  authenticateToken,
  resolveStoreContext({ storeIdParam: 'query' }),
  asyncHandler(async (req, res) => {
    const storeId = req.store_context?.store_id || parseInt(req.query.store_id, 10)
    const userId = req.user.user_id
    const roleLevel = req.user.role_level || 0
    const { status, page = 1, page_size = 20 } = req.query

    const RedemptionService = req.app.locals.services.getService('redemption_order')

    // 概况查看授权复用：与本店核销概况同一授权口径（manager 放行 / staff 须被授权）
    const canView = await RedemptionService.canUserViewStoreStats(userId, storeId, roleLevel)
    if (!canView) {
      logger.warn('无权限查看门店核销订单列表', { user_id: userId, store_id: storeId })
      return res.apiError(
        '无权限查看门店核销订单，请联系本店店长授权',
        'REDEMPTION_STATS_FORBIDDEN',
        null,
        403
      )
    }

    // 数据范围多店聚合（DataScopeService 单一事实源）
    const DataScopeService = req.app.locals.services.getService('data_scope')
    const { scope: storeScope, store_ids: storeIds } =
      await DataScopeService.getAccessibleStoreIds(userId)

    const result = await RedemptionService.getStoreScopedOrders({
      store_scope: storeScope,
      store_ids: storeIds,
      status,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    })

    return res.apiSuccess(result, '查询成功')
  })
)

/**
 * 店长授权本店店员查看核销概况（接口2）
 * PUT /api/v4/shop/redemption/staff/:store_staff_id/stats-permission
 *
 * @body {boolean} can_view_redemption_stats - 是否授权查看
 * 鉴权：操作人须为该门店 active manager 或平台管理员（role_level>=100）。
 */
router.put(
  '/staff/:store_staff_id/stats-permission',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const storeStaffId = parseInt(req.params.store_staff_id, 10)
    if (!Number.isInteger(storeStaffId) || storeStaffId <= 0) {
      return res.apiError('store_staff_id 必须是正整数', 'BAD_REQUEST', null, 400)
    }

    const { can_view_redemption_stats } = req.body
    if (typeof can_view_redemption_stats !== 'boolean') {
      return res.apiError('can_view_redemption_stats 必须是布尔值', 'BAD_REQUEST', null, 400)
    }

    const RedemptionService = req.app.locals.services.getService('redemption_order')
    const result = await TransactionManager.execute(async transaction => {
      return await RedemptionService.setStaffRedemptionStatsPermission(
        storeStaffId,
        can_view_redemption_stats,
        {
          transaction,
          operator_user_id: req.user.user_id,
          operator_role_level: req.user.role_level || 0
        }
      )
    })

    logger.info('店员核销概况查看授权已更新', {
      operator_user_id: req.user.user_id,
      store_staff_id: storeStaffId,
      can_view: can_view_redemption_stats
    })

    return res.apiSuccess(result, '授权更新成功')
  })
)

module.exports = router
