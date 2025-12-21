/**
 * 餐厅积分抽奖系统 V4.5 - 兑换市场API
 * 材料资产支付兑换市场路由（V4.5.0统一版）
 *
 * 功能说明：
 * - 获取兑换市场商品列表（展示材料成本）
 * - 获取商品详情（展示cost_asset_code + cost_amount）
 * - 兑换商品（使用材料资产支付，通过AssetService扣减）
 * - 查询用户订单（显示pay_asset_code + pay_amount）
 * - 管理员订单管理
 * - 统计数据查询（材料消耗统计）
 *
 * 业务规则（V4.5.0强制）：
 * - ✅ 兑换只能使用材料资产支付（cost_asset_code + cost_amount）
 * - ✅ 支付资产扣减通过AssetService.changeBalance()执行
 * - ✅ 订单记录pay_asset_code和pay_amount字段（必填）
 * - ✅ 支持幂等性控制（business_id必填）
 * - ❌ 禁止积分支付和虚拟价值支付（已彻底移除）
 *
 * 创建时间：2025年12月06日
 * 最后修改：2025年12月18日 - 暴力移除旧方案，统一为材料资产支付
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin, getUserRoles } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const DataSanitizer = require('../../../services/DataSanitizer')

const logger = require('../../../utils/logger').logger

/**
 * 获取兑换市场商品列表
 * GET /api/v4/exchange_market/items
 *
 * @query {string} status - 商品状态（active/inactive，默认active）
 * @query {string} asset_code - 材料资产代码筛选（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 * @query {string} sort_by - 排序字段（默认sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认ASC）
 */
router.get('/items', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeMarketService（符合TR-005规范）
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const {
      status = 'active',
      asset_code,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = req.query

    logger.info('获取兑换市场商品列表', {
      user_id: req.user.user_id,
      status,
      asset_code,
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

    // V4.5.0：材料资产代码筛选（可选）
    if (asset_code) {
      // 可选的筛选参数，传递给Service层
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
      asset_code,
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
    return handleServiceError(error, res, '获取商品列表失败')
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
    // 🔄 通过 ServiceManager 获取 ExchangeMarketService（符合TR-005规范）
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

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
    return handleServiceError(error, res, '获取商品详情失败')
  }
})

/**
 * 兑换商品（V4.5.0 材料资产支付）
 * POST /api/v4/exchange_market/exchange
 *
 * @body {number} item_id - 商品ID（必填）
 * @body {number} quantity - 兑换数量（默认1）
 * @body {string} business_id - 业务唯一ID（必填，用于幂等性控制）
 * @header {string} Idempotency-Key - 幂等键（可选，Header方式，与business_id二选一）
 *
 * 支付方式（V4.5.0）：
 * - 使用材料资产支付（cost_asset_code + cost_amount）
 * - 材料扣减通过AssetService执行（支持幂等性和事务保护）
 * - 订单记录pay_asset_code和pay_amount字段用于对账
 * - 材料余额不足时直接失败，不允许负余额
 *
 * 🔴 业务幂等性设计（P1-1强制规范）：
 * 1. 强制幂等键：客户端必须提供幂等键，支持两种方式：
 *    - 方式A：Body中的 business_id（推荐，业务交易号语义）
 *    - 方式B：Header中的 Idempotency-Key（兼容标准HTTP幂等设计）
 * 2. 缺失即拒绝：两者都未提供时，直接返回 400 错误
 * 3. 禁止后端兜底生成：不再自动生成 business_id（防止重复下单）
 * 4. 冲突保护：同一幂等键但请求参数不同时，返回 409 错误
 * 5. 幂等返回：同一幂等键重复请求时，返回原结果（标记 is_duplicate: true）
 *
 * ⚠️ 注意：此接口不支持后端自动生成幂等键，客户端必须主动传入。
 * 建议前端使用 UUID 或 timestamp+random 生成唯一ID，并在重试时复用同一ID。
 */
router.post('/exchange', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeMarketService（符合TR-005规范）
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const { item_id, quantity = 1, business_id: bodyBusinessId } = req.body
    const headerIdempotencyKey = req.headers['idempotency-key']
    const user_id = req.user.user_id

    logger.info('用户兑换商品请求', {
      user_id,
      item_id,
      quantity,
      body_business_id: bodyBusinessId,
      header_idempotency_key: headerIdempotencyKey
    })

    // 🔴 P1-1强制校验：必须提供幂等键（business_id 或 Idempotency-Key）
    if (!bodyBusinessId && !headerIdempotencyKey) {
      logger.warn('缺少幂等键', { user_id, item_id })
      return res.apiError(
        '缺少幂等键：请在请求Body中提供 business_id 或在Header中提供 Idempotency-Key。' +
          '重试时必须复用同一幂等键以防止重复下单。',
        'BAD_REQUEST',
        {
          required_fields: ['business_id (Body)', 'Idempotency-Key (Header)'],
          requirement: 'at_least_one'
        },
        400
      )
    }

    // 🔴 优先使用 Body 中的 business_id，如果没有则使用 Header 中的 Idempotency-Key
    const business_id = bodyBusinessId || headerIdempotencyKey

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

    // 🔴 P1-1冲突保护：调用服务层（Service内部会验证幂等性和参数冲突）
    const result = await ExchangeMarketService.exchangeItem(user_id, itemId, exchangeQuantity, {
      business_id
    })

    logger.info('兑换成功', {
      user_id,
      item_id: itemId,
      quantity: exchangeQuantity,
      business_id, // 记录实际使用的 business_id
      order_no: result.order.order_no,
      // V4.5.0: 材料资产支付字段（唯一真相）
      pay_asset_code: result.order.pay_asset_code,
      pay_amount: result.order.pay_amount,
      is_duplicate: result.is_duplicate || false
    })

    // ✅ 在响应中返回 business_id 和材料资产支付信息，供前端确认幂等键
    return res.apiSuccess(
      {
        order: result.order,
        remaining: result.remaining,
        business_id, // ✅ 回传 business_id 供前端确认
        ...(result.is_duplicate && { is_duplicate: true }) // ✅ 只有重复请求时才返回此字段
      },
      result.message
    )
  } catch (error) {
    logger.error('兑换商品失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      item_id: req.body?.item_id,
      business_id: req.body?.business_id || req.headers['idempotency-key']
    })
    return handleServiceError(error, res, '兑换失败')
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
    // 🔄 通过 ServiceManager 获取 ExchangeMarketService（符合TR-005规范）
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
    // 🔄 通过 ServiceManager 获取 ExchangeMarketService（符合TR-005规范）
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
    // 🔄 通过 ServiceManager 获取 ExchangeMarketService（符合TR-005规范）
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
    // 🔄 通过 ServiceManager 获取 ExchangeMarketService（符合TR-005规范）
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
