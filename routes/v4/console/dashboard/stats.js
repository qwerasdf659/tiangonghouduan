/**
 * 跨域平台概览 — Dashboard 统计 API
 *
 * @route GET /api/v4/console/dashboard/stats
 * @description 并行聚合 B2C 兑换 + 官方竞价 两个业务域的顶线数据（C2C 市场已下线）
 * @security JWT + Admin权限
 * @module routes/v4/console/dashboard/stats
 */

'use strict'

const { asyncHandler } = require('../../../../middleware/validation')
const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const logger = require('../../../../utils/logger').logger

/**
 * GET / - 跨域顶线数据
 *
 * @query {number} [days=7] - 统计周期天数
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { days = 7 } = req.query
    const safeDays = parseInt(days) || 7
    const admin_id = req.user.user_id

    logger.info('[Dashboard-统计] 查询跨域顶线数据', { admin_id, days: safeDays })

    const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    const [exchange, bids] = await Promise.all([
      ExchangeAdminService.getExchangeTopline(safeDays),
      BidQueryService.getBidTopline(safeDays)
    ])

    logger.info('[Dashboard-统计] 查询成功', {
      admin_id,
      exchange_active: exchange.active_items,
      bids_active: bids.active_products
    })

    return res.apiSuccess(
      {
        period_days: safeDays,
        exchange,
        bids
      },
      '跨域平台概览查询成功'
    )
  })
)

module.exports = router
