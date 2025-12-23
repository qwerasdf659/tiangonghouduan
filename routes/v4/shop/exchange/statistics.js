/**
 * 兑换市场模块 - 统计数据
 *
 * @route /api/v4/exchange_market
 * @description 管理员查询兑换市场统计数据
 *
 * API列表：
 * - GET /statistics - 获取兑换市场统计数据（管理员操作）
 *
 * 业务场景：
 * - 管理员查看材料消耗统计
 * - 查看订单总量和趋势
 *
 * 创建时间：2025年12月22日
 * 从exchange_market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * @route GET /api/v4/exchange_market/statistics
 * @desc 获取兑换市场统计数据（管理员操作）
 * @access Private (仅管理员)
 *
 * @returns {Object} 统计数据
 * @returns {Object} data.orders - 订单统计（总数、各状态数量）
 * @returns {Array} data.items - 商品销售统计
 * @returns {Object} data.materials - 材料消耗统计
 */
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeService（符合TR-005规范）
    const ExchangeService = req.app.locals.services.getService('exchangeMarket')

    const admin_id = req.user.user_id

    logger.info('管理员查询统计数据', { admin_id })

    // 调用服务层
    const result = await ExchangeService.getMarketStatistics()

    logger.info('查询统计数据成功', {
      admin_id,
      total_orders: result.statistics.orders.total,
      total_items: result.statistics.items.length
    })

    return res.apiSuccess(result.statistics, '获取统计数据成功')
  } catch (error) {
    logger.error('查询统计数据失败', {
      error: error.message,
      admin_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询统计数据失败')
  }
})

module.exports = router
