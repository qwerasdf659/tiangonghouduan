/**
 * 餐厅积分抽奖系统 V4.5 - 兑换订单查询API
 *
 * 业务范围：
 * - 获取用户订单列表
 * - 获取订单详情
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 使用统一错误处理 handleServiceError
 *
 * 创建时间：2025-12-22
 * 来源：从 items.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const DataSanitizer = require('../../../services/DataSanitizer')
const logger = require('../../../utils/logger').logger

/**
 * 获取用户订单列表
 * GET /api/v4/exchange_market/orders
 *
 * @query {string} status - 订单状态（pending/completed/shipped/cancelled）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 */
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const { status, page = 1, page_size = 20 } = req.query
    const user_id = req.user.user_id

    logger.info('查询用户订单列表', { user_id, status, page, page_size })

    // 参数验证
    const finalPage = Math.max(parseInt(page) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 50)

    // 状态白名单验证
    if (status) {
      const validStatuses = ['pending', 'completed', 'shipped', 'cancelled']
      if (!validStatuses.includes(status)) {
        return res.apiError(
          `无效的status参数，允许值：${validStatuses.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    // 调用服务层
    const result = await ExchangeMarketService.getUserOrders(user_id, {
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    // 获取用户权限
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 数据脱敏
    const sanitizedOrders = DataSanitizer.sanitizeExchangeMarketOrders(result.orders, dataLevel)

    logger.info('查询订单列表成功', {
      user_id,
      total: result.pagination.total,
      returned: sanitizedOrders.length,
      page: finalPage
    })

    return res.apiSuccess(
      {
        orders: sanitizedOrders,
        pagination: result.pagination
      },
      '获取订单列表成功'
    )
  } catch (error) {
    logger.error('查询订单列表失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询订单列表失败')
  }
})

/**
 * 获取订单详情
 * GET /api/v4/exchange_market/orders/:order_no
 *
 * @param {string} order_no - 订单号
 */
router.get('/orders/:order_no', authenticateToken, async (req, res) => {
  try {
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const { order_no } = req.params
    const user_id = req.user.user_id

    logger.info('查询订单详情', { user_id, order_no })

    // 参数验证
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层
    const result = await ExchangeMarketService.getOrderDetail(user_id, order_no)

    // 获取用户权限
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 数据脱敏
    const sanitizedOrder = DataSanitizer.sanitizeExchangeMarketOrder(result.order, dataLevel)

    logger.info('查询订单详情成功', {
      user_id,
      order_no,
      status: result.order.status
    })

    return res.apiSuccess({ order: sanitizedOrder }, '获取订单详情成功')
  } catch (error) {
    logger.error('查询订单详情失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      order_no: req.params.order_no
    })
    return handleServiceError(error, res, '查询订单详情失败')
  }
})

module.exports = router
