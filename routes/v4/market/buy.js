/**
 * 交易市场模块 - 购买商品
 *
 * @route /api/v4/market
 * @description 用户购买交易市场中的商品
 *
 * API列表：
 * - POST /listings/:listing_id/purchase - 购买市场商品
 *
 * 业务场景：
 * - 用户购买交易市场中的商品
 * - 使用 Idempotency-Key（Header）进行幂等控制，防止重复购买
 * - 购买完成后自动转移物品所有权和扣款
 *
 * 幂等性保证（业界标准形态 - 破坏性重构 2026-01-02）：
 * - 统一只接受 Header Idempotency-Key，不接受 body 中的 business_id
 * - 缺失幂等键直接返回 400
 * - 接入请求级幂等服务（IdempotencyService），统一回放/冲突/处理中语义
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月02日 - 接入请求级幂等服务
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')
// P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）

/**
 * @route POST /api/v4/market/listings/:listing_id/purchase
 * @desc 购买市场商品
 * @access Private (需要登录)
 *
 * @param {number} listing_id - 挂牌ID
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {string} purchase_note - 购买备注（可选）
 *
 * @returns {Object} 购买结果
 * @returns {string} data.order_id - 订单ID
 * @returns {number} data.listing_id - 挂牌ID
 * @returns {number} data.seller_id - 卖家用户ID
 * @returns {string} data.asset_code - 支付资产类型
 * @returns {number} data.gross_amount - 总金额
 * @returns {number} data.fee_amount - 手续费
 * @returns {number} data.net_amount - 卖家实收金额
 * @returns {boolean} data.is_duplicate - 是否为幂等回放请求
 * @returns {string} data.purchase_note - 购买备注
 *
 * 业务场景：用户购买交易市场中的商品
 * 幂等性控制（业界标准形态）：
 * - 首次请求 → 200 + 业务结果
 * - 同 key 同参数重试 → 200 + is_duplicate: true + 首次结果
 * - 同 key 不同参数 → 409 IDEMPOTENCY_KEY_CONFLICT
 * - 处理中重复请求 → 409 REQUEST_PROCESSING
 */
router.post(
  '/listings/:listing_id/purchase',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    // P1-9：通过 ServiceManager 获取服务（B1-Injected + E2-Strict snake_case）
    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const MarketListingService = req.app.locals.services.getService('market_listing')
    const TradeOrderService = req.app.locals.services.getService('trade_order')

    // 【业界标准形态】强制从 Header 获取幂等键，不接受 body
    const idempotency_key = req.headers['idempotency-key']

    // 缺失幂等键直接返回 400
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
          '重试时必须复用同一幂等键以防止重复购买。',
        'MISSING_IDEMPOTENCY_KEY',
        {
          required_header: 'Idempotency-Key',
          example: 'Idempotency-Key: market_purchase_<timestamp>_<random>'
        },
        400
      )
    }

    try {
      const listing_id = req.validated.listing_id
      const buyer_id = req.user.user_id
      const { purchase_note } = req.body

      /*
       * 【入口幂等检查】防止同一次请求被重复提交
       * 统一使用 IdempotencyService 进行请求级幂等控制
       */
      const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
        api_path: '/api/v4/market/listings/:id/purchase',
        http_method: 'POST',
        request_params: { listing_id, purchase_note },
        user_id: buyer_id
      })

      // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
      if (!idempotencyResult.should_process) {
        logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
          idempotency_key,
          buyer_id,
          listing_id
        })
        const duplicateResponse = {
          ...idempotencyResult.response,
          is_duplicate: true
        }
        return res.apiSuccess(duplicateResponse, '购买成功（幂等回放）')
      }

      // 查询挂牌信息（通过 Service 层访问，符合路由层规范）
      const listing = await MarketListingService.getListingById(listing_id)

      if (!listing) {
        // 标记幂等请求失败，允许重试
        await IdempotencyService.markAsFailed(idempotency_key, '挂牌不存在')
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }

      // 检查挂牌状态是否为在售
      if (listing.status !== 'on_sale') {
        await IdempotencyService.markAsFailed(idempotency_key, '挂牌已下架或已售出')
        return res.apiError('挂牌已下架或已售出', 'NOT_AVAILABLE', null, 400)
      }

      // 不能购买自己的商品
      if (listing.seller_user_id === buyer_id) {
        await IdempotencyService.markAsFailed(idempotency_key, '不能购买自己的商品')
        return res.apiError('不能购买自己的商品', 'BAD_REQUEST', null, 400)
      }

      /*
       * 创建并完成交易订单
       * 使用 TransactionManager 统一事务边界（符合治理决策）
       * 传递 idempotency_key 给服务层（业界标准形态命名）
       */
      const { orderResult, completeResult } = await TransactionManager.execute(
        async transaction => {
          const orderResult = await TradeOrderService.createOrder(
            {
              buyer_id,
              seller_id: listing.seller_user_id,
              listing_id,
              item_instance_id: listing.offer_item_instance_id,
              price_amount: listing.price_amount,
              price_asset_code: listing.price_asset_code || 'DIAMOND',
              idempotency_key // 业界标准形态：统一使用 idempotency_key
            },
            { transaction }
          )

          // 完成订单
          const completeResult = await TradeOrderService.completeOrder(
            {
              order_id: orderResult.order_id,
              buyer_id
            },
            { transaction }
          )

          return { orderResult, completeResult }
        }
      )

      // 构建响应数据
      const responseData = {
        order_id: orderResult.order_id,
        listing_id,
        seller_id: listing.seller_user_id,
        asset_code: listing.price_asset_code || 'DIAMOND',
        gross_amount: listing.price_amount,
        fee_amount: completeResult.fee_amount || 0,
        net_amount: completeResult.net_amount || listing.price_amount,
        is_duplicate: false,
        purchase_note: purchase_note || null
      }

      /*
       * 【标记请求完成】保存结果快照到入口幂等表
       */
      await IdempotencyService.markAsCompleted(
        idempotency_key,
        orderResult.order_id, // 业务事件ID = 订单ID
        responseData
      )

      // 缓存失效已在 TradeOrderService.completeOrder 中处理（决策5B：Service层统一收口）

      logger.info('市场商品购买成功', {
        listing_id,
        buyer_id,
        seller_id: listing.seller_user_id,
        price_amount: listing.price_amount,
        order_id: orderResult.order_id,
        idempotency_key
      })

      return res.apiSuccess(responseData, '购买成功')
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
          buyer_id: req.user?.user_id
        })
        return res.apiError('服务繁忙，请稍后重试', 'CONCURRENT_CONFLICT', { retry_after: 1 }, 409)
      }

      // 处理幂等键冲突错误（409状态码）
      if (error.statusCode === 409) {
        logger.warn('幂等性错误:', {
          idempotency_key,
          error_code: error.errorCode,
          message: error.message
        })
        return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
      }

      logger.error('购买市场商品失败', {
        error: error.message,
        listing_id: req.validated.listing_id,
        buyer_id: req.user?.user_id,
        idempotency_key
      })

      return handleServiceError(error, res, '购买失败')
    }
  }
)

module.exports = router
