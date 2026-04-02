/**
 * C2C 拍卖路由 - 用户端
 *
 * 路径：/api/v4/marketplace/auctions
 *
 * 职责：
 * - 创建拍卖（用户从背包选择物品发起拍卖）
 * - 浏览拍卖列表/详情
 * - 出价竞拍
 * - 我的拍卖/我的出价
 * - 卖方取消拍卖
 * - 买方发起争议
 *
 * 子路由清单：
 * - POST /                                    - 创建拍卖
 * - GET  /                                    - 拍卖列表
 * - GET  /my                                  - 我发起的拍卖
 * - GET  /my-bids                             - 我的出价记录
 * - GET  /:auction_listing_id                 - 拍卖详情
 * - POST /:auction_listing_id/bid             - 出价
 * - POST /:auction_listing_id/cancel          - 卖方取消
 * - POST /:auction_listing_id/dispute         - 买方发起争议
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 auction_core / auction_query
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 *
 * @module routes/v4/marketplace/auctions
 * @created 2026-03-24（C2C用户间竞拍功能）
 * @see docs/C2C竞拍方案.md §5.1
 */

'use strict'

const express = require('express')
const router = express.Router()
const { AssetCode } = require('../../../constants/AssetCode')
const { authenticateToken } = require('../../../middleware/auth')
const { requireValidSession } = require('../../../middleware/sensitiveOperation')
const { handleServiceError } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger
const {
  getMarketRiskControlMiddleware
} = require('../../../middleware/MarketRiskControlMiddleware')
const marketRiskMiddleware = getMarketRiskControlMiddleware().createListingRiskMiddleware()

/**
 * @param {Function} fn - 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * @route POST /api/v4/marketplace/auctions
 * @desc 创建C2C拍卖（用户从背包选择物品发起拍卖）
 * @access Private
 *
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {number} item_id - 拍卖物品ID（必填）
 * @body {number} start_price - 起拍价（必填，大于0）
 * @body {string} [price_asset_code='star_stone'] - 出价资产类型
 * @body {number} [min_bid_increment=10] - 最小加价幅度
 * @body {number|null} [buyout_price] - 一口价（不传或null=不支持）
 * @body {string} start_time - 开始时间（ISO8601）
 * @body {string} end_time - 结束时间（ISO8601）
 */
router.post(
  '/',
  authenticateToken,
  requireValidSession,
  marketRiskMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id
    const {
      item_id,
      start_price,
      price_asset_code,
      min_bid_increment,
      buyout_price,
      start_time,
      end_time
    } = req.body

    if (!item_id) return res.apiError('item_id 是必填参数', 'MISSING_PARAM', null, 400)
    if (!start_price) return res.apiError('start_price 是必填参数', 'MISSING_PARAM', null, 400)
    if (!start_time || !end_time) {
      return res.apiError('start_time 和 end_time 是必填参数', 'MISSING_PARAM', null, 400)
    }

    const auctionService = req.app.locals.services.getService('auction_core')

    const result = await TransactionManager.execute(async transaction => {
      return await auctionService.createAuction(
        userId,
        item_id,
        { price_asset_code, start_price, min_bid_increment, buyout_price, start_time, end_time },
        { transaction }
      )
    })

    return res.apiSuccess(result, '拍卖创建成功')
  })
)

/**
 * @route GET /api/v4/marketplace/auctions
 * @desc 浏览C2C拍卖列表
 * @access Public（可选登录）
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const queryService = req.app.locals.services.getService('auction_query')
    const result = await queryService.getAuctionListings(req.query)
    return res.apiSuccess(result)
  })
)

/**
 * @route GET /api/v4/marketplace/auctions/my
 * @desc 我发起的拍卖列表（卖方视角）
 * @access Private
 */
router.get(
  '/my',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id
    const queryService = req.app.locals.services.getService('auction_query')
    const result = await queryService.getUserAuctions(userId, req.query)
    return res.apiSuccess(result)
  })
)

/**
 * @route GET /api/v4/marketplace/auctions/my-bids
 * @desc 我的出价记录（买方视角）
 * @access Private
 */
router.get(
  '/my-bids',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id
    const queryService = req.app.locals.services.getService('auction_query')
    const result = await queryService.getUserBidHistory(userId, req.query)
    return res.apiSuccess(result)
  })
)

/**
 * @route GET /api/v4/marketplace/auctions/:auction_listing_id
 * @desc 拍卖详情（含出价排行、卖方信息、物品快照）
 * @access Public（可选登录）
 */
router.get(
  '/:auction_listing_id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const auctionListingId = req.params.auction_listing_id
    const userId = req.user?.user_id || null

    const queryService = req.app.locals.services.getService('auction_query')
    const result = await queryService.getAuctionDetail(auctionListingId, { user_id: userId })

    if (!result) {
      return res.apiError('拍卖不存在', 'NOT_FOUND', null, 404)
    }

    return res.apiSuccess(result)
  })
)

/**
 * @route POST /api/v4/marketplace/auctions/:auction_listing_id/bid
 * @desc 出价竞拍
 * @access Private
 *
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {number} bid_amount - 出价金额（必填）
 */
router.post(
  '/:auction_listing_id/bid',
  authenticateToken,
  requireValidSession,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id
    const auctionListingId = req.params.auction_listing_id
    const { bid_amount } = req.body
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key

    if (!bid_amount) return res.apiError('bid_amount 是必填参数', 'MISSING_PARAM', null, 400)
    if (!idempotencyKey) {
      return res.apiError('Idempotency-Key 是必填 Header', 'MISSING_IDEMPOTENCY_KEY', null, 400)
    }

    const auctionService = req.app.locals.services.getService('auction_core')

    const result = await TransactionManager.execute(async transaction => {
      return await auctionService.placeBid(userId, Number(auctionListingId), Number(bid_amount), {
        transaction,
        idempotency_key: idempotencyKey
      })
    })

    // 事务提交后：WebSocket 推送（fire-and-forget）
    try {
      const ChatWebSocketService = require('../../../services/ChatWebSocketService')
      const snapshot = result._item_snapshot || {}

      if (result._outbid_user_id) {
        ChatWebSocketService.pushAuctionOutbid(result._outbid_user_id, {
          auction_listing_id: Number(auctionListingId),
          item_name: snapshot.item_name || '',
          new_highest: result.bid_amount,
          price_asset_code: result.price_asset_code || AssetCode.STAR_STONE
        })
      }

      if (result._seller_user_id) {
        ChatWebSocketService.pushAuctionNewBid(result._seller_user_id, {
          auction_listing_id: Number(auctionListingId),
          item_name: snapshot.item_name || '',
          bid_amount: result.bid_amount,
          bidder_user_id: userId,
          price_asset_code: result.price_asset_code || AssetCode.STAR_STONE
        })
      }
    } catch (wsError) {
      logger.warn('[C2C拍卖路由] WebSocket推送失败（非致命）', { error: wsError.message })
    }

    // 保存一口价标志后清除内部字段
    const wasBuyoutSettled = result._buyout_settled
    delete result._outbid_user_id
    delete result._seller_user_id
    delete result._item_snapshot
    delete result._buyout_settled
    delete result._settle_result

    return res.apiSuccess(result, wasBuyoutSettled ? '一口价即时成交' : '出价成功')
  })
)

/**
 * @route POST /api/v4/marketplace/auctions/:auction_listing_id/cancel
 * @desc 卖方取消拍卖（有出价后禁止卖方取消）
 * @access Private
 */
router.post(
  '/:auction_listing_id/cancel',
  authenticateToken,
  requireValidSession,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id
    const auctionListingId = req.params.auction_listing_id

    const auctionService = req.app.locals.services.getService('auction_core')

    const result = await TransactionManager.execute(async transaction => {
      return await auctionService.cancelAuction(
        Number(auctionListingId),
        userId,
        false, // 非管理员
        { transaction }
      )
    })

    return res.apiSuccess(result, '拍卖已取消')
  })
)

/**
 * @route POST /api/v4/marketplace/auctions/:auction_listing_id/dispute
 * @desc 买方发起争议（接入 TradeDisputeService）
 * @access Private
 */
router.post(
  '/:auction_listing_id/dispute',
  authenticateToken,
  requireValidSession,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id
    const auctionListingId = req.params.auction_listing_id
    const { dispute_type = 'item_mismatch', description } = req.body

    if (!description) return res.apiError('description 是必填参数', 'MISSING_PARAM', null, 400)

    const tradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const queryService = req.app.locals.services.getService('auction_query')

    const auctionDetail = await queryService.getAuctionDetail(auctionListingId, { user_id: userId })
    if (!auctionDetail) {
      return res.apiError('拍卖不存在', 'NOT_FOUND', null, 404)
    }
    if (auctionDetail.status !== 'settled') {
      return res.apiError('仅已结算的拍卖可发起争议', 'INVALID_STATUS', null, 400)
    }
    if (auctionDetail.winner_user_id !== userId) {
      return res.apiError('仅中标买方可发起争议', 'FORBIDDEN', null, 403)
    }

    const result = await tradeDisputeService.createDispute({
      user_id: userId,
      order_type: 'auction',
      order_id: auctionListingId,
      dispute_type,
      description,
      evidence: {
        item_snapshot: auctionDetail.item_snapshot,
        auction_listing_id: auctionListingId,
        winning_amount: auctionDetail.gross_amount
      }
    })

    return res.apiSuccess(result, '争议已提交')
  })
)

// 统一错误处理
router.use(handleServiceError)

module.exports = router
