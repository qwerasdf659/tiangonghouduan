/**
 * 用户域 B2C 兑换路由 - 下单/订单类端点（技术债务方案 7.4-8：路由拆分）
 *
 * 路径：/api/v4/exchange（经 index.js 无前缀挂载，对外 URL 与拆分前完全一致）
 *
 * 端点清单（纯搬移自原 routes/v4/exchange/index.js，逻辑不变）：
 * - POST /                                    - 执行兑换（材料资产支付）
 * - POST /orders/:order_no/rate               - 用户对兑换订单评分
 * - GET  /orders                              - 获取用户兑换订单列表
 * - GET  /orders/:order_no                    - 获取用户兑换订单详情
 * - POST /orders/:order_no/confirm-receipt    - 用户确认收货
 * - POST /orders/:order_no/cancel             - 用户取消订单
 * - PUT  /orders/:order_no/address            - 补录/修改订单收货地址
 * - GET  /orders/:order_no/contact            - 获取本人订单完整收货联系方式
 * - GET  /orders/:order_no/track              - 查询兑换订单物流轨迹
 *
 * 架构规范：
 * - 通过 ServiceManager 获取服务（exchange_query / exchange_core / idempotency / notification 等）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 *
 * @module routes/v4/exchange/orders
 * @created 2026-07-11（技术债务方案 7.4-8 拆分）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError, asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * POST /api/v4/exchange
 *
 * @description 用户兑换商品（V4.5.0 材料资产支付）
 * @access Private（所有登录用户可访问）
 *
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {number} exchange_item_id - 商品ID（必填）
 * @body {number} quantity - 兑换数量（默认 1，最大 10）
 * @body {number} sku_id - SKU ID（必填）。SKU 是下单的唯一主体，单规格商品也有默认 SKU：
 *                         前端从列表的 default_sku_id（单 active SKU 商品）或详情的 skus[] 取得后传入。
 *                         与 CoreService.exchangeItem 的 sku_id 必填校验保持一致（不做自动兜底）。
 *
 * @returns {Object} { order, remaining, is_duplicate }
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')

    // 强制从 Header 获取幂等键
    const idempotency_key = req.headers['idempotency-key']

    if (!idempotency_key) {
      logger.warn('缺少幂等键', {
        user_id: req.user?.user_id,
        exchange_item_id: req.body?.exchange_item_id
      })
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
          '重试时必须复用同一幂等键以防止重复下单。',
        'MISSING_IDEMPOTENCY_KEY',
        {
          required_header: 'Idempotency-Key',
          example: 'Idempotency-Key: exchange_<timestamp>_<random>'
        },
        400
      )
    }

    try {
      const { exchange_item_id, quantity = 1, sku_id, address_id } = req.body
      const user_id = req.user.user_id

      logger.info('用户兑换商品请求', {
        user_id,
        exchange_item_id,
        quantity,
        sku_id: sku_id || '(missing)',
        address_id: address_id || '(none)',
        idempotency_key
      })

      // 参数验证：商品ID必填
      if (!exchange_item_id) {
        return res.apiError('商品ID不能为空', 'BAD_REQUEST', null, 400)
      }

      const itemId = parseInt(exchange_item_id, 10)
      const exchangeQuantity = parseInt(quantity, 10)

      if (isNaN(itemId) || itemId <= 0) {
        return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
      }

      /*
       * 数量基础校验：仅校验为正整数（每单上限由 CoreService 读商品级 max_quantity_per_order 权威校验，
       * 不在路由层硬编码魔术数字）。
       */
      if (isNaN(exchangeQuantity) || exchangeQuantity <= 0) {
        return res.apiError('兑换数量必须为正整数', 'BAD_REQUEST', null, 400)
      }

      /*
       * 入口幂等检查
       */
      const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
        api_path: '/api/v4/exchange',
        http_method: 'POST',
        request_params: { exchange_item_id: itemId, quantity: exchangeQuantity },
        user_id
      })

      // 幂等回放：重复请求直接返回首次结果
      if (!idempotencyResult.should_process) {
        logger.info('入口幂等拦截：重复请求，返回首次结果', {
          idempotency_key,
          user_id,
          exchange_item_id: itemId
        })
        const duplicateResponse = {
          ...idempotencyResult.response,
          is_duplicate: true
        }
        return res.apiSuccess(duplicateResponse, '兑换成功（幂等回放）')
      }

      const parsedSkuId = sku_id ? parseInt(sku_id, 10) : null
      if (sku_id && (isNaN(parsedSkuId) || parsedSkuId <= 0)) {
        return res.apiError('无效的 SKU ID', 'BAD_REQUEST', null, 400)
      }

      // 收货地址 ID 校验（实物邮寄类下单携带，归属校验在 Service 层事务内进行）
      const parsedAddressId = address_id ? parseInt(address_id, 10) : null
      if (address_id && (isNaN(parsedAddressId) || parsedAddressId <= 0)) {
        return res.apiError('无效的收货地址 ID', 'BAD_REQUEST', null, 400)
      }

      // 调用服务层（TransactionManager 统一事务边界）
      const result = await TransactionManager.execute(async transaction => {
        return await ExchangeCoreService.exchangeItem(user_id, itemId, exchangeQuantity, {
          idempotency_key,
          sku_id: parsedSkuId,
          address_id: parsedAddressId,
          transaction
        })
      })

      // 构建响应数据
      const responseData = {
        order: result.order,
        remaining: result.remaining,
        is_duplicate: false
      }

      // 铸造了物品实例时，返回实例信息给前端
      if (result.minted_item) {
        responseData.minted_item = result.minted_item
      }

      // 标记幂等请求完成
      await IdempotencyService.markAsCompleted(idempotency_key, result.order.order_no, responseData)

      logger.info('兑换成功', {
        user_id,
        item_id: itemId,
        quantity: exchangeQuantity,
        idempotency_key,
        order_no: result.order.order_no,
        pay_asset_code: result.order.pay_asset_code,
        pay_amount: result.order.pay_amount
      })

      // 异步通知管理员有新的兑换订单待审核（不阻塞用户响应）
      const NotificationService = req.app.locals.services.getService('notification')
      NotificationService.notifyNewExchangeAudit({
        exchange_id: result.order.record_id,
        user_id,
        item_name: result.order.item_name,
        quantity: exchangeQuantity,
        total_points: result.order.pay_amount,
        item_category: 'exchange'
      }).catch(notifyError => {
        logger.error('[兑换] 通知管理员失败（不影响兑换结果）', { error: notifyError.message })
      })

      return res.apiSuccess(responseData, result.message)
    } catch (error) {
      // 标记幂等请求失败（允许重试）
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
        logger.error('标记幂等请求失败状态时出错:', markError)
      })

      // 数据库死锁错误处理（高并发场景）
      const isDeadlock =
        error.message?.includes('Deadlock') ||
        error.message?.includes('deadlock') ||
        error.parent?.code === 'ER_LOCK_DEADLOCK'
      if (isDeadlock) {
        logger.warn('数据库死锁（并发竞争），建议重试', {
          idempotency_key,
          user_id: req.user?.user_id,
          exchange_item_id: req.body?.exchange_item_id
        })
        return res.apiError('服务繁忙，请稍后重试', 'CONCURRENT_CONFLICT', { retry_after: 1 }, 409)
      }

      // 幂等键冲突错误（409状态码）
      if (error.statusCode === 409) {
        logger.warn('幂等性错误:', {
          idempotency_key,
          error_code: error.errorCode,
          message: error.message
        })
        return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
      }

      logger.error('兑换商品失败', {
        error: error.message,
        user_id: req.user?.user_id,
        exchange_item_id: req.body?.exchange_item_id,
        idempotency_key
      })
      return handleServiceError(error, res, '兑换失败')
    }
  })
)

/**
 * POST /api/v4/exchange/orders/:order_no/rate
 *
 * @description 用户对兑换订单评分（需求6：兑换商品统计字段）
 * @access Private（订单归属用户）
 *
 * @param {string} order_no - 订单号（路由参数）
 * @body {number} rating - 评分（1-5分，必填）
 *
 * @returns {Object} { order_no, rating, rated_at }
 */
router.post(
  '/orders/:order_no/rate',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const user_id = req.user.user_id
    const { order_no } = req.params
    const { rating } = req.body

    // 参数验证：rating 必填
    if (rating === undefined || rating === null) {
      return res.apiError('评分不能为空', 'BAD_REQUEST', null, 400)
    }

    const ratingNum = parseInt(rating, 10)
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.apiError('评分必须为1-5的整数', 'INVALID_RATING', null, 400)
    }

    logger.info('用户评分请求', { user_id, order_no, rating: ratingNum })

    try {
      const result = await TransactionManager.execute(async transaction => {
        return await ExchangeCoreService.rateOrder(user_id, order_no, ratingNum, { transaction })
      })

      return res.apiSuccess(
        {
          order_no: result.order_no,
          rating: result.rating,
          rated_at: result.rated_at
        },
        result.message
      )
    } catch (error) {
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, error.data || null, error.statusCode)
      }
      logger.error('评分失败', { user_id, order_no, error: error.message })
      return handleServiceError(error, res, '评分失败')
    }
  })
)

/**
 * GET /api/v4/exchange/orders
 *
 * @description 获取用户兑换订单列表（支持状态筛选 + 分页）
 * @access Private（登录用户查看自己的订单）
 *
 * @query {string} [status] - 订单状态筛选（9 种状态之一，可选）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（最大 50）
 *
 * @returns {Object} { orders, pagination }
 */
router.get(
  '/orders',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const { getUserRoles } = require('../../../middleware/auth')

    const { status, page = 1, page_size = 20 } = req.query
    const user_id = req.user.user_id

    const finalPage = Math.max(parseInt(page) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 50)

    // 状态白名单验证
    if (status) {
      const validStatuses = [
        'pending',
        'approved',
        'shipped',
        'received',
        'rated',
        'rejected',
        'refunded',
        'cancelled',
        'completed'
      ]
      if (!validStatuses.includes(status)) {
        return res.apiError(
          `无效的status参数，允许值：${validStatuses.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    const result = await ExchangeQueryService.getUserOrders(user_id, {
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'
    const sanitizedOrders = DataSanitizer.sanitizeExchangeMarketOrders(result.orders, dataLevel)

    logger.info('查询用户兑换订单列表成功', {
      user_id,
      total: result.pagination.total,
      page: finalPage
    })

    return res.apiSuccess(
      { orders: sanitizedOrders, pagination: result.pagination },
      '获取订单列表成功'
    )
  })
)

/**
 * GET /api/v4/exchange/orders/:order_no
 *
 * @description 获取用户兑换订单详情（含 user_id 权限校验）
 * @access Private（登录用户查看自己的订单）
 *
 * @param {string} order_no - 订单号
 *
 * @returns {Object} { order }
 */
router.get(
  '/orders/:order_no',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const { getUserRoles } = require('../../../middleware/auth')

    const { order_no } = req.params
    const user_id = req.user.user_id

    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }

    const result = await ExchangeQueryService.getOrderDetail(user_id, order_no)

    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'
    const sanitizedOrder = DataSanitizer.sanitizeExchangeMarketOrder(result.order, dataLevel)

    return res.apiSuccess({ order: sanitizedOrder }, '获取订单详情成功')
  })
)

/**
 * POST /api/v4/exchange/orders/:order_no/confirm-receipt
 *
 * @description 用户确认收货（shipped → received）
 * @access Private（登录用户确认自己的订单）
 *
 * @param {string} order_no - 订单号
 *
 * @returns {Object} 确认收货结果
 */
router.post(
  '/orders/:order_no/confirm-receipt',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const user_id = req.user.user_id

    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await ExchangeCoreService.confirmReceipt(user_id, order_no, { transaction })
    })

    return res.apiSuccess(result, result.message)
  })
)

/**
 * POST /api/v4/exchange/orders/:order_no/cancel
 *
 * @description 用户取消订单（仅 pending 状态，退还材料资产）
 * @access Private（登录用户取消自己的订单）
 *
 * @param {string} order_no - 订单号
 *
 * @returns {Object} 取消结果（含退款信息）
 */
router.post(
  '/orders/:order_no/cancel',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const user_id = req.user.user_id

    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await ExchangeCoreService.cancelOrder(user_id, order_no, { transaction })
    })

    return res.apiSuccess(result, result.message)
  })
)

/**
 * PUT /api/v4/exchange/orders/:order_no/address
 *
 * @description 用户为自己的兑换订单补录/修改收货地址（实物履约）
 *              主要用于竞价中标的实物订单（异步结算时用户不在场，建单为 pending 无地址，中标后在此补地址）；
 *              普通实物订单发货前也可改地址。补地址后由运营发货。
 * @access Private（订单归属用户）
 *
 * @param {string} order_no - 订单号
 * @body {number} address_id - 收货地址主键（须属于本人）
 *
 * @returns {Object} { order_no, address_snapshot }
 */
router.put(
  '/orders/:order_no/address',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const { address_id } = req.body
    const user_id = req.user.user_id

    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }
    const parsedAddressId = address_id ? parseInt(address_id, 10) : null
    if (!parsedAddressId || isNaN(parsedAddressId) || parsedAddressId <= 0) {
      return res.apiError('收货地址 ID 无效', 'BAD_REQUEST', null, 400)
    }

    try {
      const result = await TransactionManager.execute(async transaction => {
        return ExchangeCoreService.updateOrderAddress(user_id, order_no, parsedAddressId, {
          transaction
        })
      })
      return res.apiSuccess(result, '收货地址已更新')
    } catch (error) {
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, error.data || null, error.statusCode)
      }
      return handleServiceError(error, res, '更新收货地址失败')
    }
  })
)

/**
 * GET /api/v4/exchange/orders/:order_no/contact
 *
 * @description 获取本人订单的完整收货联系方式（按需明文，拍板⑤）
 *              小程序订单详情页用户点击「显示完整」时调用，返回完整收件人姓名/手机号/地址供本人核对。
 *              默认订单详情下发掩码地址，本接口是唯一返回完整手机号的入口，仅限本人本单。
 * @access Private（登录用户查看自己订单的联系方式）
 *
 * @param {string} order_no - 订单号
 *
 * @returns {Object} { contact: { receiver_name, receiver_phone, province, city, district, detail_address } | null }
 */
router.get(
  '/orders/:order_no/contact',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')
    const { order_no } = req.params
    const user_id = req.user.user_id

    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }

    const contact = await ExchangeQueryService.getOrderContact(user_id, order_no)

    // 结构化日志记录本人明文地址访问（用于安全审计追踪，含 request_id 全链路追踪）
    logger.info('[兑换市场] 用户查看本人订单完整收货联系方式', {
      request_id: req.id,
      user_id,
      order_no,
      has_contact: !!contact
    })

    return res.apiSuccess({ contact }, '获取收货联系方式成功')
  })
)

/**
 * 用户端查询兑换订单物流轨迹
 * GET /api/v4/exchange/orders/:order_no/track
 *
 * @description 用户查看已发货订单的快递物流轨迹
 */
router.get(
  '/orders/:order_no/track',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { order_no } = req.params
    const user_id = req.user.user_id
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const orderResult = await ExchangeQueryService.getOrderDetail(user_id, order_no)
    if (!orderResult || !orderResult.order) {
      return res.apiError('订单不存在', 'NOT_FOUND', null, 404)
    }

    const order = orderResult.order
    if (!order.shipping_no) {
      return res.apiSuccess({ has_shipping: false, message: '该订单尚未填写快递信息' })
    }

    const ShippingService = req.app.locals.services.getService('shipping_track')

    /*
     * 物流方案一：优先读自有轨迹表（webhook 已落库的全量轨迹，秒回）；
     * 自有表暂无轨迹时（如订阅未生效）降级为第三方实时查询作为补充。
     */
    const localTracks = await ShippingService.getOrderTracks(order.exchange_record_id)
    if (localTracks && localTracks.length > 0) {
      return res.apiSuccess({
        has_shipping: true,
        shipping_company: order.shipping_company,
        shipping_company_name: order.shipping_company_name,
        shipping_no: order.shipping_no,
        shipped_at: order.shipped_at,
        track: { success: true, source: 'local', tracks: localTracks }
      })
    }

    const track = await ShippingService.queryTrack(order.shipping_no, order.shipping_company)

    return res.apiSuccess({
      has_shipping: true,
      shipping_company: order.shipping_company,
      shipping_company_name: order.shipping_company_name,
      shipping_no: order.shipping_no,
      shipped_at: order.shipped_at,
      track
    })
  })
)

module.exports = router
