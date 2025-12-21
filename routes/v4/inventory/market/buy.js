/**
 * 交易市场模块 - 购买商品
 *
 * @route /api/v4/inventory/market
 * @description 用户购买交易市场中的商品
 *
 * API列表：
 * - POST /listings/:listing_id/purchase - 购买市场商品
 *
 * 业务场景：
 * - 用户购买交易市场中的商品
 * - 使用 business_id 进行幂等控制，防止重复购买
 * - 购买完成后自动转移物品所有权和扣款
 *
 * 创建时间：2025年12月22日
 * 从inventory-market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const { MarketListing } = require('../../../../models')

/**
 * @route POST /api/v4/inventory/market/listings/:listing_id/purchase
 * @desc 购买市场商品
 * @access Private (需要登录)
 *
 * @param {number} listing_id - 挂牌ID
 * @body {string} business_id - 幂等键（必填，或使用Header: Idempotency-Key）
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
 * @returns {boolean} data.is_duplicate - 是否为幂等请求
 * @returns {string} data.purchase_note - 购买备注
 *
 * 🔴 业务场景：用户购买交易市场中的商品
 * 幂等性控制：通过 business_id 防止重复购买
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
