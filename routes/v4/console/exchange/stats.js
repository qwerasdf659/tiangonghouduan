/**
 * B2C 兑换商城统计 API
 *
 * @route GET /api/v4/console/exchange/stats
 * @description 聚合兑换市场商品和订单的统计数据，供管理后台仪表板使用
 * @security JWT + Admin权限
 * @module routes/v4/console/exchange/stats
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../shared/middleware')
const logger = require('../../../../utils/logger').logger

/**
 * GET / - 兑换市场统计数据（Admin Only）
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const admin_id = req.user.user_id
    const { trend_days, item_type } = req.query

    logger.info('[B2C兑换-统计] 查询统计数据', { admin_id, trend_days, item_type })

    const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
    const statistics = await ExchangeAdminService.getMarketItemStatistics({ trend_days, item_type })

    logger.info('[B2C兑换-统计] 查询成功', {
      admin_id,
      total_items: statistics.total_items,
      active_items: statistics.active_items
    })

    return res.apiSuccess(statistics, '兑换市场统计数据查询成功')
  })
)

/**
 * GET /barter - 换物运营看板统计（P2-5，拍板⑫）
 *
 * @route GET /api/v4/console/exchange/stats/barter?days=30
 * @description barter 订单量趋势、按配方兑换统计、旧物销毁量、发货状态分布
 * @security JWT + Admin权限
 */
router.get(
  '/barter',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { days = 30 } = req.query
    const BarterService = req.app.locals.services.getService('exchange_barter')
    const stats = await BarterService.getBarterStats({ days })
    return res.apiSuccess(stats, '换物运营统计数据查询成功')
  })
)

module.exports = router
