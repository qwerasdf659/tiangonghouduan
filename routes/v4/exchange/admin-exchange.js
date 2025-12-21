/**
 * 餐厅积分抽奖系统 V4.5 - 兑换市场管理员API
 *
 * 业务范围：
 * - 更新订单状态（管理员操作）
 * - 获取统计数据（管理员操作）
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 使用统一错误处理 handleServiceError
 * - 需要管理员权限 requireAdmin
 *
 * 创建时间：2025-12-22
 * 来源：从 items.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * 更新订单状态（管理员操作）
 * POST /api/v4/exchange_market/orders/:order_no/status
 *
 * @param {string} order_no - 订单号
 * @body {string} status - 新状态（completed/shipped/cancelled）
 * @body {string} remark - 备注（可选）
 */
router.post('/orders/:order_no/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const { order_no } = req.params
    const { status, remark = '' } = req.body
    const operator_id = req.user.user_id

    logger.info('管理员更新订单状态', {
      operator_id,
      order_no,
      new_status: status,
      remark
    })

    // 参数验证
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }

    if (!status || status.trim().length === 0) {
      return res.apiError('订单状态不能为空', 'BAD_REQUEST', null, 400)
    }

    // 状态白名单验证
    const validStatuses = ['completed', 'shipped', 'cancelled']
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的status参数，允许值：${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 调用服务层
    const result = await ExchangeMarketService.updateOrderStatus(
      order_no,
      status,
      operator_id,
      remark
    )

    logger.info('订单状态更新成功', {
      operator_id,
      order_no,
      new_status: status
    })

    return res.apiSuccess(result.order, result.message)
  } catch (error) {
    logger.error('更新订单状态失败', {
      error: error.message,
      stack: error.stack,
      operator_id: req.user?.user_id,
      order_no: req.params.order_no
    })
    return handleServiceError(error, res, '更新订单状态失败')
  }
})

/**
 * 获取兑换市场统计数据（管理员操作）
 * GET /api/v4/exchange_market/statistics
 */
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const admin_id = req.user.user_id

    logger.info('管理员查询统计数据', { admin_id })

    // 调用服务层
    const result = await ExchangeMarketService.getMarketStatistics()

    logger.info('查询统计数据成功', {
      admin_id,
      total_orders: result.statistics.orders.total,
      total_items: result.statistics.items.length
    })

    return res.apiSuccess(result.statistics, '获取统计数据成功')
  } catch (error) {
    logger.error('查询统计数据失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询统计数据失败')
  }
})

module.exports = router
