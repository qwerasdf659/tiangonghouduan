/**
 * 用户域 B2C 兑换路由
 *
 * 路径：/api/v4/exchange
 *
 * 职责：
 * - 用户浏览兑换商品列表
 * - 用户使用材料资产兑换商品
 *
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
 *
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, optionalAuth, getUserRoles } = require('../../../middleware/auth')
const { handleServiceError, asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * GET /api/v4/exchange/items
 *
 * @description 获取兑换商品列表（展示材料成本，支持空间筛选/搜索/价格范围）
 * @access Private（所有登录用户可访问）
 *
 * @query {string} status - 商品状态（active/inactive，默认 active）
 * @query {string} asset_code - 材料资产代码筛选（可选）
 * @query {string} space - 空间筛选：lucky/premium（可选，不传返回全部）
 * @query {string} item_type - 频道筛选：prop(道具商城)/product/voucher/virtual（可选，不传返回全部）
 * @query {string} keyword - 模糊搜索（匹配 item_name，可选）
 * @query {number} category_id - 分类ID筛选（categories.category_id，可选）
 * @query {number} min_cost - 最低价格（可选）
 * @query {number} max_cost - 最高价格（可选）
 * @query {string} stock_status - 库存状态：in_stock(>5)/low_stock(1-5)（可选）
 * @query {number} page - 页码（默认 1）
 * @query {number} page_size - 每页数量（默认 20，最大 50）
 * @query {string} sort_by - 排序字段（默认 sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认 ASC）
 *
 * @returns {Object} { items, pagination }
 */
router.get(
  '/items',
  optionalAuth,
  asyncHandler(async (req, res) => {
    // 通过 ServiceManager 获取 ExchangeQueryService
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const {
      status = 'active',
      asset_code,
      space,
      item_type,
      keyword,
      category_id,
      exclude_id,
      min_cost,
      max_cost,
      stock_status,
      with_counts,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC',
      refresh
    } = req.query

    logger.info('用户浏览兑换商品列表', {
      user_id: req.user?.user_id || null,
      status,
      asset_code,
      space,
      item_type,
      keyword,
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

    // 空间白名单验证
    if (space) {
      const validSpaces = ['lucky', 'premium']
      if (!validSpaces.includes(space)) {
        return res.apiError(
          `无效的 space 参数，允许值：${validSpaces.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    // item_type 白名单验证（双轨频道筛选：prop=道具商城/星石轨）
    if (item_type) {
      const validItemTypes = ['prop', 'product', 'voucher', 'virtual']
      if (!validItemTypes.includes(item_type)) {
        return res.apiError(
          `无效的 item_type 参数，允许值：${validItemTypes.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
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

    // 调用服务层（筛选 + C+++ 聚合计数）
    const result = await ExchangeQueryService.getMarketItems({
      status,
      asset_code,
      space: space || null,
      item_type: item_type || null,
      keyword: keyword || null,
      category: category_id || null,
      exclude_id: exclude_id || null,
      min_cost: min_cost ? parseInt(min_cost, 10) : null,
      max_cost: max_cost ? parseInt(max_cost, 10) : null,
      stock_status: stock_status || null,
      with_counts: with_counts === 'true',
      page: finalPage,
      page_size: finalPageSize,
      sort_by,
      sort_order: upperSortOrder,
      refresh: refresh === 'true'
    })

    // 获取用户权限（未登录用户默认 public 级别，role_level >= 100 为管理员）
    let dataLevel = 'public'
    if (req.user?.user_id) {
      const userRoles = await getUserRoles(req.user.user_id)
      dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'
    }

    // 数据脱敏
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const sanitizedItems = DataSanitizer.sanitizeExchangeMarketItems(result.items, dataLevel)

    logger.info('获取兑换商品列表成功', {
      user_id: req.user?.user_id || null,
      total: result.pagination.total,
      returned: sanitizedItems.length,
      page: finalPage
    })

    const responseData = {
      items: sanitizedItems,
      pagination: result.pagination,
      /** 统计摘要（需求6 趋势销量 + 需求8 折扣率） */
      summary: result.summary || null
    }

    // C+++ 聚合计数：仅在 with_counts=true 时返回
    if (result.filters_count) {
      responseData.filters_count = result.filters_count
    }

    return res.apiSuccess(responseData, '获取商品列表成功')
  })
)

/**
 * GET /api/v4/exchange/items/:exchange_item_id
 *
 * @description 获取兑换商品详情（展示 cost_asset_code + cost_amount）
 * @access Public（optionalAuth - 未登录可浏览商品详情）
 *
 * @param {number} exchange_item_id - 商品ID（路由参数）
 *
 * @returns {Object} { item }
 */
router.get(
  '/items/:exchange_item_id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const { exchange_item_id } = req.params
    const user_id = req.user?.user_id || null

    logger.info('获取兑换商品详情', { user_id, exchange_item_id })

    // 参数验证
    const itemId = parseInt(exchange_item_id, 10)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层
    const result = await ExchangeQueryService.getItemDetail(itemId)

    // 获取用户权限（未登录用户默认 public 级别）
    let dataLevel = 'public'
    if (user_id) {
      const userRoles = await getUserRoles(user_id)
      dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'
    }

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
 * GET /api/v4/exchange/space-stats
 *
 * @description 获取空间统计数据（臻选空间/幸运空间）
 * @access Public（optionalAuth - 未登录可浏览空间统计）
 *
 * @query {string} space - 空间类型（必填）：lucky / premium
 *
 * @returns {Object} { space, total_items, new_count, hot_count, asset_code_distribution }
 */
router.get(
  '/space-stats',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const { space } = req.query

    // 参数验证：space 必填
    if (!space) {
      return res.apiError('space 参数不能为空', 'BAD_REQUEST', null, 400)
    }

    const validSpaces = ['lucky', 'premium']
    if (!validSpaces.includes(space)) {
      return res.apiError(
        `无效的 space 参数，允许值：${validSpaces.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    logger.info('查询空间统计', { user_id: req.user?.user_id || null, space })

    const stats = await ExchangeQueryService.getSpaceStats(space)

    return res.apiSuccess(stats, '获取空间统计成功')
  })
)

/**
 * GET /api/v4/exchange/premium-status
 *
 * @description 查询高级空间（臻选空间）状态
 * @access Private（所有登录用户可访问）
 *
 * 复用 PremiumService.getPremiumStatus(user_id)
 *
 * @returns {Object} 解锁状态和条件信息
 */
router.get(
  '/premium-status',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const PremiumService = req.app.locals.services.getService('premium')
    const userId = req.user.user_id

    logger.info('查询高级空间状态', { user_id: userId })

    try {
      const status = await PremiumService.getPremiumStatus(userId)

      if (!status.unlocked || !status.is_valid) {
        // 未解锁或已过期：返回明确的解锁条件，由 PremiumService 提供权威字段（费用/有效期/条件明细）
        return res.apiSuccess(
          {
            unlocked: false,
            is_expired: status.is_expired || false,
            can_unlock: status.can_unlock,
            unlock_cost: status.unlock_cost,
            validity_hours: status.validity_hours,
            conditions: status.conditions
          },
          status.is_expired ? '高级空间已过期' : '高级空间未解锁'
        )
      }

      // 已解锁且在有效期内
      return res.apiSuccess(
        {
          unlocked: true,
          is_valid: true,
          unlock_cost: status.unlock_cost,
          validity_hours: status.validity_hours,
          remaining_hours: status.remaining_hours,
          total_unlock_count: status.total_unlock_count
        },
        '高级空间访问中'
      )
    } catch (error) {
      logger.error('查询高级空间状态失败', { user_id: userId, error: error.message })
      return handleServiceError(error, res, '查询高级空间状态失败')
    }
  })
)

/**
 * POST /api/v4/exchange/unlock-premium
 *
 * @description 解锁高级空间（臻选空间）
 * @access Private（所有登录用户可访问，需满足解锁条件）
 *
 * 复用 PremiumService.unlockPremium(user_id, {transaction})
 *
 * @returns {Object} 解锁结果
 */
router.post(
  '/unlock-premium',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const PremiumService = req.app.locals.services.getService('premium')
    const userId = req.user.user_id

    logger.info('用户解锁高级空间', { user_id: userId })

    try {
      // 通过 TransactionManager 统一管理事务边界（PremiumService 强制要求外部事务）
      const result = await TransactionManager.execute(async transaction => {
        return await PremiumService.unlockPremium(userId, { transaction })
      })

      logger.info('高级空间解锁成功', {
        user_id: userId,
        is_first_unlock: result.is_first_unlock,
        unlock_cost: result.unlock_cost
      })

      return res.apiSuccess(
        {
          unlocked: true,
          is_first_unlock: result.is_first_unlock,
          unlock_cost: result.unlock_cost,
          remaining_points: result.remaining_points,
          validity_hours: result.validity_hours,
          total_unlock_count: result.total_unlock_count
        },
        '高级空间解锁成功'
      )
    } catch (error) {
      logger.error('高级空间解锁失败', { user_id: userId, error: error.message })

      // 处理业务错误（来自 PremiumService，带有明确的 code + statusCode）
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, error.data || null, error.statusCode)
      }

      return handleServiceError(error, res, '解锁失败')
    }
  })
)

// ==================== 兑换订单路由 ====================

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

/**
 * 竞价子路由（B2C 兑换商品竞拍）
 * 底表 FK→exchange_items
 */
const bidRoutes = require('./bid')
router.use('/bid', bidRoutes)

/**
 * 星石虚拟装饰子路由（模块D：纯展示装饰，星石明码标价购买）
 */
const decorationRoutes = require('./decorations')
router.use('/decorations', decorationRoutes)

/**
 * GET /api/v4/exchange/barter/recipes
 *
 * @description 获取以物易物配方列表（旧物组合 → 官方产出物）
 * @access Private（登录用户）
 *
 * @returns {Object} { recipes }
 */
router.get(
  '/barter/recipes',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const BarterService = req.app.locals.services.getService('exchange_barter')
    const recipes = await BarterService.getRecipes()
    // 仅返回启用的配方给用户端
    const enabled = recipes.filter(r => r.is_enabled !== false)
    return res.apiSuccess({ recipes: enabled })
  })
)

/**
 * POST /api/v4/exchange/barter
 *
 * @description 执行以物易物（B2C 官方合成）：用户旧物核销 → 官方库存产出新物。
 *              全程用户↔官方，无用户间转移；旧物真销毁、产出非货币型资产且方向等价/向下。
 * @access Private（登录用户）
 *
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {string} recipe_code - 配方码（必填）
 * @body {number[]} old_item_ids - 投入的旧物实例ID列表（必填，归属本人且 available）
 *
 * @returns {Object} { order_no, consumed_item_ids, minted_item }
 */
router.post(
  '/barter',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const idempotency_key = req.headers['idempotency-key']
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key',
        'MISSING_IDEMPOTENCY_KEY',
        { required_header: 'Idempotency-Key' },
        400
      )
    }

    const user_id = req.user.user_id
    const { recipe_code, old_item_ids } = req.body

    if (!recipe_code) {
      return res.apiError('recipe_code 不能为空', 'BAD_REQUEST', null, 400)
    }
    if (!Array.isArray(old_item_ids) || old_item_ids.length === 0) {
      return res.apiError('old_item_ids 必须是非空数组', 'BAD_REQUEST', null, 400)
    }

    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
      api_path: '/api/v4/exchange/barter',
      http_method: 'POST',
      request_params: { recipe_code, old_item_ids },
      user_id
    })
    if (!idempotencyResult.should_process) {
      return res.apiSuccess({ ...idempotencyResult.response, is_duplicate: true })
    }

    try {
      const BarterService = req.app.locals.services.getService('exchange_barter')
      // 事务边界由路由层管理（写操作收口到 Service + options.transaction）
      const result = await TransactionManager.execute(async transaction => {
        return BarterService.executeBarter(user_id, recipe_code, old_item_ids, idempotency_key, {
          transaction
        })
      })

      await IdempotencyService.markAsCompleted(idempotency_key, result.order_no, result)
      return res.apiSuccess(result, '以物易物兑换成功')
    } catch (error) {
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(() => {})
      return handleServiceError(error, res, '以物易物兑换失败')
    }
  })
)

module.exports = router
