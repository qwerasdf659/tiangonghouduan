/**
 * 用户端兑换路由 - 背包域
 *
 * 路径：/api/v4/backpack/exchange
 *
 * 职责：
 * - 用户浏览兑换商品列表
 * - 用户使用材料资产兑换商品
 *
 * 域边界说明（2026-02-07 阻塞项核实决策）：
 * - 兑换本质是"用户用积分/材料换物品"，语义上属于用户域
 * - 从 /shop/exchange 迁移到 /backpack/exchange
 * - /shop 域 = 100% 商家专属，不再包含用户兑换功能
 *
 * 子路由清单：
 * - GET  /items                  - 获取兑换商品列表
 * - GET  /items/:exchange_item_id - 获取商品详情
 * - POST /                       - 执行兑换（材料资产支付）
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 ExchangeService（exchange_query / exchange_core）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 *
 * 创建时间：2026-02-07（从 routes/v4/shop/exchange/ 迁移）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * 错误处理包装器
 *
 * @param {Function} fn - 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * GET /api/v4/backpack/exchange/items
 *
 * @description 获取兑换商品列表（展示材料成本）
 * @access Private（所有登录用户可访问）
 *
 * @query {string} status - 商品状态（active/inactive，默认 active）
 * @query {string} asset_code - 材料资产代码筛选（可选）
 * @query {number} page - 页码（默认 1）
 * @query {number} page_size - 每页数量（默认 20，最大 50）
 * @query {string} sort_by - 排序字段（默认 sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认 ASC）
 *
 * @returns {Object} { items, pagination }
 */
router.get(
  '/items',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // 通过 ServiceManager 获取 ExchangeQueryService
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const {
      status = 'active',
      asset_code,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = req.query

    logger.info('用户浏览兑换商品列表', {
      user_id: req.user.user_id,
      status,
      asset_code,
      page,
      page_size
    })

    // 参数验证
    const finalPage = Math.max(parseInt(page, 10) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 50)

    // 状态白名单验证
    const validStatuses = ['active', 'inactive']
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的 status 参数，允许值：${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 排序方向白名单验证
    const validSortOrders = ['ASC', 'DESC']
    const upperSortOrder = sort_order.toUpperCase()
    if (!validSortOrders.includes(upperSortOrder)) {
      return res.apiError(
        `无效的 sort_order 参数，允许值：${validSortOrders.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 调用服务层
    const result = await ExchangeQueryService.getMarketItems({
      status,
      asset_code,
      page: finalPage,
      page_size: finalPageSize,
      sort_by,
      sort_order: upperSortOrder
    })

    // 获取用户权限（role_level >= 100 为管理员）
    const userRoles = await getUserRoles(req.user.user_id)
    const dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'

    // 数据脱敏
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const sanitizedItems = DataSanitizer.sanitizeExchangeMarketItems(result.items, dataLevel)

    logger.info('获取兑换商品列表成功', {
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
  })
)

/**
 * GET /api/v4/backpack/exchange/items/:exchange_item_id
 *
 * @description 获取兑换商品详情（展示 cost_asset_code + cost_amount）
 * @access Private（所有登录用户可访问）
 *
 * @param {number} exchange_item_id - 商品ID（路由参数）
 *
 * @returns {Object} { item }
 */
router.get(
  '/items/:exchange_item_id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const { exchange_item_id } = req.params
    const user_id = req.user.user_id

    logger.info('获取兑换商品详情', { user_id, exchange_item_id })

    // 参数验证
    const itemId = parseInt(exchange_item_id, 10)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层
    const result = await ExchangeQueryService.getItemDetail(itemId)

    // 获取用户权限
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'

    // 数据脱敏
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const sanitizedItem = DataSanitizer.sanitizeExchangeMarketItem(result.item, dataLevel)

    logger.info('获取兑换商品详情成功', {
      user_id,
      exchange_item_id: itemId,
      item_name: result.item.item_name
    })

    return res.apiSuccess({ item: sanitizedItem }, '获取商品详情成功')
  })
)

/**
 * POST /api/v4/backpack/exchange
 *
 * @description 用户兑换商品（V4.5.0 材料资产支付）
 * @access Private（所有登录用户可访问）
 *
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {number} exchange_item_id - 商品ID（必填）
 * @body {number} quantity - 兑换数量（默认 1，最大 10）
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
      const { exchange_item_id, quantity = 1 } = req.body
      const user_id = req.user.user_id

      logger.info('用户兑换商品请求', {
        user_id,
        exchange_item_id,
        quantity,
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

      if (isNaN(exchangeQuantity) || exchangeQuantity <= 0 || exchangeQuantity > 10) {
        return res.apiError('兑换数量必须在1-10之间', 'BAD_REQUEST', null, 400)
      }

      /*
       * 入口幂等检查
       * 路径更新为 /api/v4/backpack/exchange（从 /api/v4/shop/exchange 迁移）
       */
      const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
        api_path: '/api/v4/backpack/exchange',
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

      // 调用服务层（TransactionManager 统一事务边界）
      const result = await TransactionManager.execute(async transaction => {
        return await ExchangeCoreService.exchangeItem(user_id, itemId, exchangeQuantity, {
          idempotency_key,
          transaction
        })
      })

      // 构建响应数据
      const responseData = {
        order: result.order,
        remaining: result.remaining,
        is_duplicate: false
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

module.exports = router
