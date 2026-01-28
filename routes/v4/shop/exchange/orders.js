/**
 * B2C材料兑换模块 - 订单查询/管理
 *
 * @route /api/v4/shop/exchange
 * @description 用户订单查询和管理员订单管理
 *
 * API列表：
 * - GET /orders - 获取用户订单列表
 * - GET /orders/:order_no - 获取订单详情
 * - POST /orders/:order_no/status - 更新订单状态（管理员操作）
 *
 * 业务场景：
 * - 用户查询自己的兑换订单
 * - 管理员管理订单状态（发货、完成、取消）
 *
 * 创建时间：2025年12月22日
 * 从exchange_market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel, getUserRoles } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
/*
 * P1-9：DataSanitizer 通过 ServiceManager 获取（snake_case key）
 * 在路由处理函数内通过 req.app.locals.services.getService('data_sanitizer') 获取
 */
const logger = require('../../../../utils/logger').logger

/**
 * @route GET /api/v4/shop/exchange/orders
 * @desc 获取用户订单列表
 * @access Private (需要登录)
 *
 * @query {string} status - 订单状态（pending/completed/shipped/cancelled，可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 *
 * @returns {Object} 订单列表和分页信息
 * @returns {Array} data.orders - 订单列表（包含pay_asset_code, pay_amount）
 * @returns {Object} data.pagination - 分页信息
 */
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeService（符合TR-005规范）
    const ExchangeService = req.app.locals.services.getService('exchange_market')

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
    const result = await ExchangeService.getUserOrders(user_id, {
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    // 获取用户权限（role_level >= 100 为管理员）
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'

    /*
     * 数据脱敏
     * P1-9：通过 ServiceManager 获取 DataSanitizer（snake_case key）
     */
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
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
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询订单列表失败')
  }
})

/**
 * @route GET /api/v4/shop/exchange/orders/:order_no
 * @desc 获取订单详情
 * @access Private (需要登录，只能查看自己的订单）
 *
 * @param {string} order_no - 订单号
 *
 * @returns {Object} 订单详情
 * @returns {Object} data.order - 订单信息（包含pay_asset_code, pay_amount）
 */
router.get('/orders/:order_no', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeService（符合TR-005规范）
    const ExchangeService = req.app.locals.services.getService('exchange_market')

    const { order_no } = req.params
    const user_id = req.user.user_id

    logger.info('查询订单详情', { user_id, order_no })

    // 参数验证
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层
    const result = await ExchangeService.getOrderDetail(user_id, order_no)

    // 获取用户权限（role_level >= 100 为管理员）
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'

    /*
     * 数据脱敏
     * P1-9：通过 ServiceManager 获取 DataSanitizer（snake_case key）
     */
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
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
      user_id: req.user?.user_id,
      order_no: req.params.order_no
    })
    return handleServiceError(error, res, '查询订单详情失败')
  }
})

/**
 * @route POST /api/v4/shop/exchange/orders/:order_no/status
 * @desc 更新订单状态（管理员操作）
 * @access Private (仅管理员)
 *
 * @param {string} order_no - 订单号
 * @body {string} status - 新状态（completed/shipped/cancelled）
 * @body {string} remark - 备注（可选）
 *
 * @returns {Object} 更新后的订单信息
 */
router.post(
  '/orders/:order_no/status',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      // 🔄 通过 ServiceManager 获取 ExchangeService（符合TR-005规范）
      const ExchangeService = req.app.locals.services.getService('exchange_market')

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
      const result = await ExchangeService.updateOrderStatus(order_no, status, operator_id, remark)

      logger.info('订单状态更新成功', {
        operator_id,
        order_no,
        new_status: status
      })

      return res.apiSuccess(result.order, result.message)
    } catch (error) {
      logger.error('更新订单状态失败', {
        error: error.message,
        operator_id: req.user?.user_id,
        order_no: req.params.order_no
      })
      return handleServiceError(error, res, '更新订单状态失败')
    }
  }
)

module.exports = router
