/**
 * 餐厅积分抽奖系统 V4.0 - 交易市场购买API
 *
 * 业务范围：
 * - 购买市场商品（带幂等控制）
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 使用统一错误处理 handleServiceError
 * - 使用统一响应 res.apiSuccess / res.apiError
 * - 购买操作通过 TradeOrderService 处理
 *
 * 创建时间：2025-12-22
 * 来源：从 listings.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const { MarketListing } = require('../../../models')

/**
 * 购买市场商品
 * POST /api/v4/inventory/market/listings/:listing_id/purchase
 *
 * 🔴 业务场景：用户购买交易市场中的商品
 * 幂等性控制：通过 business_id 或 Idempotency-Key 防止重复购买
 */
router.post(
  '/listings/:listing_id/purchase',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    try {
      const listingId = req.validated.listing_id
      const buyerId = req.user.user_id
      const { purchase_note } = req.body

      // 【强制幂等】客户端必须传入business_id或Idempotency-Key（二选一）
      const businessId = req.body.business_id || req.headers['idempotency-key']

      if (!businessId) {
        return res.apiError(
          '缺少必填参数：business_id（Body）或 Idempotency-Key（Header），强幂等控制',
          'BAD_REQUEST',
          null,
          400
        )
      }

      // 获取 TradeOrderService
      const TradeOrderService = req.app.locals.services.getService('tradeOrder')

      // 查询挂牌信息
      const listing = await MarketListing.findOne({
        where: {
          listing_id: listingId,
          status: 'on_sale'
        }
      })

      if (!listing) {
        return res.apiError('挂牌不存在或已下架', 'NOT_FOUND', null, 404)
      }

      // 不能购买自己的商品
      if (listing.seller_user_id === buyerId) {
        return res.apiError('不能购买自己的商品', 'BAD_REQUEST', null, 400)
      }

      // 创建并完成交易订单
      const orderResult = await TradeOrderService.createOrder({
        buyer_id: buyerId,
        seller_id: listing.seller_user_id,
        listing_id: listingId,
        item_instance_id: listing.item_instance_id,
        price_amount: listing.price_amount,
        price_asset_code: listing.price_asset_code || 'DIAMOND',
        business_id: businessId
      })

      // 如果是幂等请求（订单已存在），直接返回
      if (orderResult.is_duplicate) {
        return res.apiSuccess(
          {
            ...orderResult,
            purchase_note: purchase_note || null
          },
          '购买成功（幂等请求）'
        )
      }

      // 完成订单
      const completeResult = await TradeOrderService.completeOrder({
        order_id: orderResult.order_id,
        buyer_id: buyerId
      })

      logger.info('市场商品购买成功', {
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: listing.seller_user_id,
        price_amount: listing.price_amount,
        order_id: orderResult.order_id
      })

      return res.apiSuccess(
        {
          order_id: orderResult.order_id,
          listing_id: listingId,
          seller_id: listing.seller_user_id,
          asset_code: listing.price_asset_code || 'DIAMOND',
          gross_amount: listing.price_amount,
          fee_amount: completeResult.fee_amount || 0,
          net_amount: completeResult.net_amount || listing.price_amount,
          is_duplicate: false,
          purchase_note: purchase_note || null
        },
        '购买成功'
      )
    } catch (error) {
      logger.error('购买市场商品失败', {
        error: error.message,
        listing_id: req.validated.listing_id,
        buyer_id: req.user?.user_id
      })

      return handleServiceError(error, res, '购买失败')
    }
  }
)

module.exports = router
