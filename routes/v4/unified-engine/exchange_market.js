/**
 * 餐厅积分抽奖系统 V4.0 - 兑换市场API
 * 处理双账户模型中的兑换市场功能
 *
 * 功能说明：
 * - 获取兑换市场商品列表
 * - 获取商品详情
 * - 兑换商品（虚拟奖品价值/积分/混合支付）
 * - 查询用户订单
 * - 管理员订单管理
 * - 统计数据查询
 *
 * 创建时间：2025年12月06日
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin, getUserRoles } = require('../../../middleware/auth')
const ExchangeMarketService = require('../../../services/ExchangeMarketService')
const DataSanitizer = require('../../../services/DataSanitizer')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('ExchangeMarketAPI')

/**
 * 获取兑换市场商品列表
 * GET /api/v4/exchange_market/items
 *
 * @query {string} status - 商品状态（active/inactive，默认active）
 * @query {string} price_type - 支付方式（virtual/points/mixed）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 * @query {string} sort_by - 排序字段（默认sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认ASC）
 */
router.get('/items', authenticateToken, async (req, res) => {
  try {
    const {
      status = 'active',
      price_type,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = req.query

    logger.info('获取兑换市场商品列表', {
      user_id: req.user.user_id,
      status,
      price_type,
      page,
      page_size
    })

    // 参数验证
    const finalPage = Math.max(parseInt(page) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 50)

    // 状态白名单验证
    const validStatuses = ['active', 'inactive']
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的status参数，允许值：${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 支付方式白名单验证
    if (price_type) {
      const validPriceTypes = ['virtual', 'points', 'mixed']
      if (!validPriceTypes.includes(price_type)) {
        return res.apiError(
          `无效的price_type参数，允许值：${validPriceTypes.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    // 排序方向白名单验证
    const validSortOrders = ['ASC', 'DESC']
    if (!validSortOrders.includes(sort_order.toUpperCase())) {
      return res.apiError(
        `无效的sort_order参数，允许值：${validSortOrders.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 调用服务层
    const result = await ExchangeMarketService.getMarketItems({
      status,
      price_type,
      page: finalPage,
      page_size: finalPageSize,
      sort_by,
      sort_order: sort_order.toUpperCase()
    })

    // 获取用户权限
    const userRoles = await getUserRoles(req.user.user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 数据脱敏
    const sanitizedItems = DataSanitizer.sanitizeExchangeMarketItems(result.items, dataLevel)

    logger.info('获取商品列表成功', {
      user_id: req.user.user_id,
      total: result.pagination.total,
      returned: sanitizedItems.length,
      page: finalPage
    })

    return res.apiSuccess(
      {
        items: sanitizedItems,
        pagination: result.pagination
      },
      '获取商品列表成功'
    )
  } catch (error) {
    logger.error('获取商品列表失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return res.apiError(error.message || '获取商品列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 获取商品详情
 * GET /api/v4/exchange_market/items/:item_id
 *
 * @param {number} item_id - 商品ID
 */
router.get('/items/:item_id', authenticateToken, async (req, res) => {
  try {
    const { item_id } = req.params
    const user_id = req.user.user_id

    logger.info('获取商品详情', { user_id, item_id })

    // 参数验证
    const itemId = parseInt(item_id)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层
    const result = await ExchangeMarketService.getItemDetail(itemId)

    // 获取用户权限
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 数据脱敏
    const sanitizedItem = DataSanitizer.sanitizeExchangeMarketItem(result.item, dataLevel)

    logger.info('获取商品详情成功', {
      user_id,
      item_id: itemId,
      item_name: result.item.item_name
    })

    return res.apiSuccess({ item: sanitizedItem }, '获取商品详情成功')
  } catch (error) {
    logger.error('获取商品详情失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      item_id: req.params.item_id
    })

    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    return res.apiError(error.message || '获取商品详情失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 兑换商品
 * POST /api/v4/exchange_market/exchange
 *
 * @body {number} item_id - 商品ID（必填）
 * @body {number} quantity - 兑换数量（默认1）
 */
router.post('/exchange', authenticateToken, async (req, res) => {
  try {
    const { item_id, quantity = 1 } = req.body
    const user_id = req.user.user_id

    logger.info('用户兑换商品', { user_id, item_id, quantity })

    // 参数验证
    if (!item_id || item_id === undefined) {
      return res.apiError('商品ID不能为空', 'BAD_REQUEST', null, 400)
    }

    const itemId = parseInt(item_id)
    const exchangeQuantity = parseInt(quantity)

    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    if (isNaN(exchangeQuantity) || exchangeQuantity <= 0 || exchangeQuantity > 10) {
      return res.apiError('兑换数量必须在1-10之间', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层
    const result = await ExchangeMarketService.exchangeItem(user_id, itemId, exchangeQuantity)

    logger.info('兑换成功', {
      user_id,
      item_id: itemId,
      quantity: exchangeQuantity,
      order_no: result.order.order_no,
      virtual_value_paid: result.order.virtual_value_paid,
      points_paid: result.order.points_paid
    })

    return res.apiSuccess(
      {
        order: result.order,
        remaining: result.remaining
      },
      result.message
    )
  } catch (error) {
    logger.error('兑换商品失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      item_id: req.body?.item_id
    })

    // 根据错误类型返回不同的响应
    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    if (error.message.includes('不足') || error.message.includes('库存')) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }

    return res.apiError(error.message || '兑换失败', 'INTERNAL_ERROR', null, 500)
  }
})

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
    return res.apiError(error.message || '查询订单列表失败', 'INTERNAL_ERROR', null, 500)
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

    if (error.message.includes('不存在') || error.message.includes('无权访问')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    return res.apiError(error.message || '查询订单详情失败', 'INTERNAL_ERROR', null, 500)
  }
})

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

    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    return res.apiError(error.message || '更新订单状态失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 获取兑换市场统计数据（管理员操作）
 * GET /api/v4/exchange_market/statistics
 */
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
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
    return res.apiError(error.message || '查询统计数据失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
