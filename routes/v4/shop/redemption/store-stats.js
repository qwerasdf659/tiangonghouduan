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
