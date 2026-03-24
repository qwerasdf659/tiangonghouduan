/**
 * 交易市场模块 - 购买商品
 *
 * @route /api/v4/market
 * @description 用户购买交易市场中的商品
 *
 * API列表：
 * - POST /listings/:market_listing_id/purchase - 购买市场商品
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
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { requireValidSession } = require('../../../middleware/sensitiveOperation')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/*
 * 风控中间件（2026-01-14 多币种扩展新增）
 * - 购买操作执行 fail-closed 策略：Redis 不可用时拒绝购买
 * - 提供风控预检和上下文注入
 */
const {
  getMarketRiskControlMiddleware
} = require('../../../middleware/MarketRiskControlMiddleware')
const marketRiskMiddleware = getMarketRiskControlMiddleware()

/**
 * @route POST /api/v4/marketplace/listings/:market_listing_id/purchase
 * @desc 购买市场商品
 * @access Private (需要登录)
 *
 * @param {number} market_listing_id - 挂牌ID
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {string} purchase_note - 购买备注（可选）
 *
 * @returns {Object} 购买结果
 * @returns {number} data.trade_order_id - 交易订单ID
 * @returns {number} data.market_listing_id - 挂牌ID
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
  '/listings/:market_listing_id/purchase',
  authenticateToken,
  requireValidSession, // 🔐 市场购买属于敏感操作，需验证会话（2026-01-21 会话管理功能）
  marketRiskMiddleware.createBuyRiskMiddleware(),
  validatePositiveInteger('market_listing_id', 'params'),
  async (req, res) => {
    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const MarketListingQueryService = req.app.locals.services.getService('market_listing_query')
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
      const market_listing_id = req.validated.market_listing_id
      const buyer_id = req.user.user_id
      const { purchase_note } = req.body

      /*
       * 【入口幂等检查】防止同一次请求被重复提交
       * 统一使用 IdempotencyService 进行请求级幂等控制
       */
      const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
        api_path: '/api/v4/marketplace/listings/:market_listing_id/purchase',
        http_method: 'POST',
        request_params: { market_listing_id, purchase_note },
        user_id: buyer_id
      })

      // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
      if (!idempotencyResult.should_process) {
        logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
          idempotency_key,
          buyer_id,
          market_listing_id
        })
        const duplicateResponse = {
          ...idempotencyResult.response,
          is_duplicate: true
        }
        return res.apiSuccess(duplicateResponse, '购买成功（幂等回放）')
      }

      // 查询挂牌信息（通过 Service 层访问，符合路由层规范）
      const listing = await MarketListingQueryService.getListingById(market_listing_id)

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
       * 购买流程分支（Phase 4 担保码集成）：
       * - item_instance 交易：创建订单 + 生成担保码（买方需确认后才完成）
       * - fungible_asset 交易：创建订单 + 立即完成（自动转移，无需担保码）
       */
      const isItemTrade = listing.listing_kind === 'item'
      const EscrowCodeService = req.app.locals.services.getService('escrow_code')

      let responseData

      if (isItemTrade) {
        // 实物交易：创建订单（冻结资产）→ 生成担保码 → 等待买方确认
        const orderResult = await TransactionManager.execute(async transaction => {
          return await TradeOrderService.createOrder(
            {
              buyer_id,
              seller_id: listing.seller_user_id,
              market_listing_id,
              item_id: listing.offer_item_id,
              price_amount: listing.price_amount,
              price_asset_code: listing.price_asset_code,
              idempotency_key
            },
            { transaction }
          )
        })

        // 生成担保码（Redis 存储，30 分钟有效）
        const escrowResult = await EscrowCodeService.generateEscrowCode(
          orderResult.trade_order_id,
          {
            buyer_user_id: buyer_id,
            seller_user_id: listing.seller_user_id
          }
        )

        responseData = {
          trade_order_id: orderResult.trade_order_id,
          market_listing_id,
          seller_id: listing.seller_user_id,
          asset_code: listing.price_asset_code,
          gross_amount: listing.price_amount,
          fee_amount: 0,
          net_amount: listing.price_amount,
          is_duplicate: false,
          purchase_note: purchase_note || null,
          // 担保码交易特有字段
          requires_escrow_confirmation: true,
          escrow_expires_at: escrowResult.expires_at,
          status: 'frozen'
        }

        logger.info('实物交易订单已创建，等待担保码确认', {
          trade_order_id: orderResult.trade_order_id,
          escrow_expires_at: escrowResult.expires_at
        })
      } else {
        // 可替代资产交易：创建并立即完成（保持原有逻辑）
        const { orderResult, completeResult } = await TransactionManager.execute(
          async transaction => {
            const orderResult = await TradeOrderService.createOrder(
              {
                buyer_id,
                seller_id: listing.seller_user_id,
                market_listing_id,
                item_id: listing.offer_item_id,
                price_amount: listing.price_amount,
                price_asset_code: listing.price_asset_code,
                idempotency_key
              },
              { transaction }
            )

            const completeResult = await TradeOrderService.completeOrder(
              {
                trade_order_id: orderResult.trade_order_id,
                buyer_id
              },
              { transaction }
            )

            return { orderResult, completeResult }
          }
        )

        responseData = {
          trade_order_id: orderResult.trade_order_id,
          market_listing_id,
          seller_id: listing.seller_user_id,
          asset_code: listing.price_asset_code,
          gross_amount: listing.price_amount,
          fee_amount: completeResult.fee_amount || 0,
          net_amount: completeResult.net_amount || listing.price_amount,
          is_duplicate: false,
          purchase_note: purchase_note || null,
          requires_escrow_confirmation: false,
          status: 'completed'
        }
      }

      /*
       * 【标记请求完成】保存结果快照到入口幂等表
       */
      await IdempotencyService.markAsCompleted(
        idempotency_key,
        responseData.trade_order_id, // 业务事件ID = 订单ID
        responseData
      )

      // 缓存失效已在 TradeOrderService.completeOrder 中处理（决策5B：Service层统一收口）

      logger.info('市场商品购买成功', {
        market_listing_id,
        buyer_id,
        seller_id: listing.seller_user_id,
        price_amount: listing.price_amount,
        trade_order_id: responseData.trade_order_id,
        requires_escrow: isItemTrade,
        idempotency_key
      })

      try {
        const AdAttributionService = req.app.locals.services.getService('ad_attribution')
        await AdAttributionService.checkConversion(
          buyer_id,
          'market_buy',
          String(responseData.trade_order_id)
        )
      } catch (attrError) {
        logger.warn('[MarketBuy] 广告归因追踪失败（非关键）', { error: attrError.message })
      }

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
        market_listing_id: req.validated.market_listing_id,
        buyer_id: req.user?.user_id,
        idempotency_key
      })

      return handleServiceError(error, res, '购买失败')
    }
  }
)

module.exports = router
