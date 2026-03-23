/**
 * 跨域平台概览 — Dashboard 统计 API
 *
 * @route GET /api/v4/console/dashboard/stats
 * @description 并行聚合 B2C 兑换 + C2C 市场 + 竞拍 三个业务域的顶线数据
 * @security JWT + Admin权限
 * @module routes/v4/console/dashboard/stats
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const MarketAnalyticsService = require('../../../../services/market/MarketAnalyticsService')
const logger = require('../../../../utils/logger').logger

/**
 * GET / - 跨域顶线数据
 *
 * @query {number} [days=7] - 统计周期天数
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { days = 7 } = req.query
    const safeDays = parseInt(days) || 7
    const admin_id = req.user.user_id

    logger.info('[Dashboard-统计] 查询跨域顶线数据', { admin_id, days: safeDays })

    const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    const [exchange, marketplace, bids] = await Promise.all([
      ExchangeAdminService.getExchangeTopline(safeDays),
      MarketAnalyticsService.getTradingTopline(safeDays),
      BidQueryService.getBidTopline(safeDays)
    ])

    logger.info('[Dashboard-统计] 查询成功', {
      admin_id,
      exchange_active: exchange.active_items,
      marketplace_on_sale: marketplace.on_sale_count,
      bids_active: bids.active_products
    })

    return res.apiSuccess(
      {
        period_days: safeDays,
        exchange,
        marketplace,
        bids
      },
      '跨域平台概览查询成功'
    )
  } catch (error) {
    logger.error('[Dashboard-统计] 查询失败', {
      error: error.message,
      admin_id: req.user?.user_id
    })
    return res.apiError(error.message || '查询失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
