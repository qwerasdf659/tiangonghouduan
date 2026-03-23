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
const logger = require('../../../../utils/logger').logger

/**
 * GET / - 兑换市场统计数据（Admin Only）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const admin_id = req.user.user_id

    logger.info('[B2C兑换-统计] 查询统计数据', { admin_id })

    const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
    const statistics = await ExchangeAdminService.getMarketItemStatistics()

    logger.info('[B2C兑换-统计] 查询成功', {
      admin_id,
      total_items: statistics.total_items,
      active_items: statistics.active_items
    })

    return res.apiSuccess(statistics, '兑换市场统计数据查询成功')
  } catch (error) {
    logger.error('[B2C兑换-统计] 查询失败', {
      error: error.message,
      admin_id: req.user?.user_id
    })
    return res.apiError(error.message || '查询统计数据失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
