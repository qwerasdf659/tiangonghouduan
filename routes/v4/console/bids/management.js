/**
 * 竞价管理路由 - 管理后台
 *
 * 路径：/api/v4/console/bids
 *
 * 职责：
 * - 创建竞价商品（关联兑换商品，设定起拍价、时间段）
 * - 查看竞价列表（含出价统计、状态筛选）
 * - 获取竞价详情（含完整出价记录）
 * - 手动结算竞价（提前结算到期竞价）
 * - 取消竞价（全部出价者解冻返还）
 * - C2C 用户间竞拍管理（通过 ?type=c2c 查询参数区分，复用同一路由入口）
 *
 * 子路由清单：
 * - POST /                         - 创建竞价商品（B2C）
 * - GET  /                         - 竞价商品列表（B2C；?type=c2c 切换为 C2C 拍卖列表）
 * - GET  /:id                      - 竞价商品详情（B2C；?type=c2c 切换为 C2C 拍卖详情）
 * - POST /:id/settle               - 手动结算（B2C；type=c2c 切换为 C2C 拍卖结算）
 * - POST /:id/cancel               - 取消（B2C；type=c2c 切换为 C2C 拍卖取消）
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 BidService/BidQueryService
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 管理员权限要求：role_level >= 100
 *
 * @module routes/v4/console/bids/management
 * @created 2026-02-16（臻选空间/幸运空间/竞价功能 Phase 3 §7 步骤 3.7）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { AssetCode } = require('../../../../constants/AssetCode')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { handleServiceError, asyncHandler } = require('../../../../middleware/validation')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger

// ==================== 所有路由需要管理员权限（role_level >= 100）====================

/**
 * POST /api/v4/console/bids
 *
 * @description 创建竞价商品（关联一个兑换商品，设定竞价参数）
 * @access Admin（role_level >= 100）
 *
 * @body {number} exchange_item_id - 关联的兑换商品ID（必填）
 * @body {number} start_price - 起拍价（必填，正整数）
 * @body {string} [price_asset_code='star_stone'] - 竞价资产类型（默认 star_stone）
 * @body {number} [min_bid_increment=10] - 最小加价幅度（默认 10）
 * @body {string} start_time - 竞价开始时间（必填，ISO8601 格式）
 * @body {string} end_time - 竞价结束时间（必填，ISO8601 格式，必须晚于 start_time）
 * @body {string} [batch_no] - 批次号（可选，预留扩展字段）
 *
 * @returns {Object} 创建的竞价商品信息
 */
router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const {
      exchange_item_id,
      start_price,
      price_asset_code = AssetCode.STAR_STONE,
      min_bid_increment = 10,
      start_time,
      end_time,
      batch_no = null
    } = req.body

    const adminUserId = req.user.user_id

    // === 参数校验 ===
    if (!exchange_item_id) {
      return res.apiError('exchange_item_id 是必填参数', 'BAD_REQUEST', null, 400)
    }
    if (!start_price || parseInt(start_price, 10) <= 0) {
      return res.apiError('start_price 必须为正整数', 'BAD_REQUEST', null, 400)
    }
    if (!start_time || !end_time) {
      return res.apiError('start_time 和 end_time 是必填参数', 'BAD_REQUEST', null, 400)
    }

    const parsedStartTime = new Date(start_time)
    const parsedEndTime = new Date(end_time)

    if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
      return res.apiError('时间格式无效，请使用 ISO8601 格式', 'BAD_REQUEST', null, 400)
    }
    if (parsedEndTime <= parsedStartTime) {
      return res.apiError('end_time 必须晚于 start_time', 'BAD_REQUEST', null, 400)
    }

    // 禁止的资产类型（POINTS / BUDGET_POINTS）
    const forbiddenAssets = [AssetCode.POINTS, AssetCode.BUDGET_POINTS]
    if (forbiddenAssets.includes(price_asset_code)) {
      return res.apiError(
        `资产类型 ${price_asset_code} 不允许用于竞价`,
        'ASSET_NOT_ALLOWED',
        null,
        400
      )
    }

    logger.info('[竞价管理] 创建竞价商品', {
      admin_user_id: adminUserId,
      exchange_item_id,
      start_price,
      price_asset_code,
      start_time,
      end_time
    })

    try {
      const { ExchangeItem, BidProduct } = req.app.locals.models
      const result = await TransactionManager.execute(async transaction => {
        const exchangeItem = await ExchangeItem.findByPk(exchange_item_id, { transaction })
        if (!exchangeItem) {
          const err = new Error('关联的商品不存在')
          err.statusCode = 404
          err.code = 'EXCHANGE_ITEM_NOT_FOUND'
          throw err
        }

        // 一物一拍校验（决策11）：同一兑换商品同时只能有一个 active/pending 竞价
        const existingBid = await BidProduct.findOne({
          where: {
            exchange_item_id,
            status: ['pending', 'active']
          },
          transaction
        })

        if (existingBid) {
          const err = new Error(
            `兑换商品 ${exchange_item_id} 已有进行中的竞价（ID: ${existingBid.bid_product_id}，状态: ${existingBid.status}）`
          )
          err.statusCode = 409
          err.code = 'BID_ALREADY_EXISTS'
          throw err
        }

        // 创建竞价商品
        const bidProduct = await BidProduct.create(
          {
            exchange_item_id: parseInt(exchange_item_id, 10),
            start_price: parseInt(start_price, 10),
            price_asset_code,
            current_price: 0,
            min_bid_increment: parseInt(min_bid_increment, 10),
            start_time: parsedStartTime,
            end_time: parsedEndTime,
            status: parsedStartTime <= new Date() ? 'active' : 'pending',
            bid_count: 0,
            batch_no,
            created_by: adminUserId
          },
          { transaction }
        )

        return {
          bid_product_id: bidProduct.bid_product_id,
          exchange_item_id: bidProduct.exchange_item_id,
          item_name: exchangeItem.item_name,
          start_price: Number(bidProduct.start_price),
          price_asset_code: bidProduct.price_asset_code,
          min_bid_increment: Number(bidProduct.min_bid_increment),
          start_time: bidProduct.start_time,
          end_time: bidProduct.end_time,
          status: bidProduct.status,
          batch_no: bidProduct.batch_no,
          created_by: adminUserId
        }
      })

      logger.info('[竞价管理] 竞价商品创建成功', {
        bid_product_id: result.bid_product_id,
        status: result.status
      })

      return res.apiSuccess(result, '竞价商品创建成功')
    } catch (error) {
      return handleServiceError(error, res, '创建竞价商品失败')
    }
  })
)

/**
 * GET /api/v4/console/bids
 *
 * @description 获取竞价商品列表（管理视图，含出价统计）
 * @access Admin（role_level >= 100）
 *
 * @query {string} [type='b2c'] - 竞拍类型：b2c（默认，BidProduct）/ c2c（AuctionListing）/ all（全部）
 * @query {string} [status='all'] - 状态筛选：all/pending/active/ended/settled/no_bid/cancelled/settlement_failed
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（默认 20，最大 100）
 *
 * @returns {Object} { bid_products/auction_listings, pagination }
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { type: bidType = 'b2c', status = 'all', page = 1, page_size = 20 } = req.query

    const validStatuses = [
      'all',
      'pending',
      'active',
      'ended',
      'settled',
      'no_bid',
      'cancelled',
      'settlement_failed'
    ]
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的 status 参数，允许值：${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    const finalPage = Math.max(parseInt(page, 10) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 100)

    // C2C 拍卖列表（通过 type=c2c 区分）
    if (bidType === 'c2c') {
      const AuctionQueryService = req.app.locals.services.getService('auction_query')

      logger.info('[竞价管理] 查询C2C拍卖列表', {
        status,
        page: finalPage,
        page_size: finalPageSize
      })

      const result = await AuctionQueryService.getAdminAuctionListings({
        status: status === 'all' ? undefined : status,
        page: finalPage,
        page_size: finalPageSize
      })

      return res.apiSuccess(result, '获取C2C拍卖列表成功')
    }

    // B2C 竞价列表（默认逻辑）
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    logger.info('[竞价管理] 查询竞价列表', { status, page: finalPage, page_size: finalPageSize })

    const result = await BidQueryService.getBidProducts({
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '获取竞价列表成功')
  })
)

/**
 * GET /api/v4/console/bids/:id
 *
 * @description 获取竞价商品详情（管理视图，含完整出价记录列表）
 * @access Admin（role_level >= 100）
 *
 * @param {number} id - 竞价商品ID / 拍卖ID（事务实体）
 * @query {string} [type='b2c'] - 竞拍类型：b2c（默认）或 c2c
 *
 * @returns {Object} 竞价商品详情 + 所有出价记录
 */
router.get(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const entityId = parseInt(req.params.id, 10)
    if (isNaN(entityId) || entityId <= 0) {
      return res.apiError('无效的ID', 'BAD_REQUEST', null, 400)
    }

    const bidType = req.query.type || 'b2c'

    // C2C 拍卖详情（通过 type=c2c 区分）
    if (bidType === 'c2c') {
      const AuctionQueryService = req.app.locals.services.getService('auction_query')
      logger.info('[竞价管理] 查询C2C拍卖详情', { auction_listing_id: entityId })

      const result = await AuctionQueryService.getAuctionDetail(entityId, {})
      if (!result) {
        return res.apiError('C2C拍卖不存在', 'NOT_FOUND', null, 404)
      }
      return res.apiSuccess(result, '获取C2C拍卖详情成功')
    }

    // B2C 竞价详情（默认逻辑）
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    const bidProductId = entityId

    logger.info('[竞价管理] 查询竞价详情', { bid_product_id: bidProductId })

    try {
      // 管理视图不传 user_id
      const result = await BidQueryService.getBidProductDetail(bidProductId, {})

      const { BidRecord } = req.app.locals.models
      const allBids = await BidRecord.findAll({
        where: { bid_product_id: bidProductId },
        order: [['bid_amount', 'DESC']],
        attributes: [
          'bid_record_id',
          'user_id',
          'bid_amount',
          'previous_highest',
          'is_winning',
          'is_final_winner',
          'created_at'
        ]
      })

      result.all_bid_records = allBids.map(b => ({
        bid_record_id: b.bid_record_id,
        user_id: b.user_id,
        bid_amount: Number(b.bid_amount),
        previous_highest: Number(b.previous_highest),
        is_winning: b.is_winning,
        is_final_winner: b.is_final_winner,
        created_at: b.created_at
      }))

      return res.apiSuccess(result, '获取竞价详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取竞价详情失败')
    }
  })
)

/**
 * POST /api/v4/console/bids/:id/settle
 *
 * @description 手动结算竞价（管理员强制结算，即使未到结束时间）
 * @access Admin（role_level >= 100）
 *
 * @param {number} id - 竞价商品ID / 拍卖ID（事务实体）
 * @body {string} [type='b2c'] - 竞拍类型：b2c（默认，BidProduct）或 c2c（AuctionListing）
 *
 * @returns {Object} 结算结果
 */
router.post(
  '/:id/settle',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const entityId = parseInt(req.params.id, 10)
    if (isNaN(entityId) || entityId <= 0) {
      return res.apiError('无效的ID', 'BAD_REQUEST', null, 400)
    }

    const bidType = req.body.type || req.query.type || 'b2c'

    // C2C 拍卖结算（通过 type=c2c 区分）
    if (bidType === 'c2c') {
      const AuctionService = req.app.locals.services.getService('auction_core')

      logger.info('[竞价管理] 手动结算C2C拍卖', {
        auction_listing_id: entityId,
        admin_user_id: req.user.user_id
      })

      try {
        const result = await TransactionManager.execute(async transaction => {
          // 先将状态重置为 ended 再结算（处理 settlement_failed 场景）
          const models = require('../../../../models')
          const listing = await models.AuctionListing.findByPk(entityId, { transaction })
          if (listing && listing.status === 'settlement_failed') {
            await listing.update({ status: 'ended' }, { transaction })
          }
          return await AuctionService.settleAuction(entityId, { transaction })
        })

        delete result._losers
        return res.apiSuccess(result, `C2C拍卖结算完成（状态：${result.status}）`)
      } catch (error) {
        return handleServiceError(error, res, 'C2C拍卖手动结算失败')
      }
    }

    // B2C 竞价结算（默认逻辑）
    const BidService = req.app.locals.services.getService('exchange_bid_core')

    logger.info('[竞价管理] 手动结算竞价', {
      bid_product_id: entityId,
      admin_user_id: req.user.user_id
    })

    try {
      const result = await TransactionManager.execute(async transaction => {
        return await BidService.settleBidProduct(entityId, { transaction })
      })

      if (result.status === 'settled') {
        const NotificationService = req.app.locals.services.getService('notification')

        NotificationService.notifyBidWon(result.winner_user_id, {
          bid_product_id: entityId,
          item_name: result.item_name,
          winning_amount: result.winning_amount,
          price_asset_code: result.price_asset_code
        }).catch(err => logger.error('发送中标通知失败', { error: err.message }))

        if (result._losers) {
          for (const loser of result._losers) {
            NotificationService.notifyBidLost(loser.user_id, {
              bid_product_id: entityId,
              item_name: result.item_name,
              my_bid_amount: loser.bid_amount,
              winning_amount: result.winning_amount,
              price_asset_code: result.price_asset_code
            }).catch(err => logger.error('发送落选通知失败', { error: err.message }))
          }
        }
      }

      delete result._losers

      logger.info('[竞价管理] 手动结算完成', {
        bid_product_id: entityId,
        status: result.status
      })

      return res.apiSuccess(result, `竞价结算完成（状态：${result.status}）`)
    } catch (error) {
      return handleServiceError(error, res, '手动结算失败')
    }
  })
)

/**
 * POST /api/v4/console/bids/:id/cancel
 *
 * @description 取消竞价（所有出价者的冻结资产解冻返还）
 * @access Admin（role_level >= 100）
 *
 * @param {number} id - 竞价商品ID / 拍卖ID（事务实体）
 * @body {string} reason - 取消原因（必填）
 * @body {string} [type='b2c'] - 竞拍类型：b2c（默认，BidProduct）或 c2c（AuctionListing）
 *
 * @returns {Object} 取消结果
 */
router.post(
  '/:id/cancel',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const entityId = parseInt(req.params.id, 10)
    if (isNaN(entityId) || entityId <= 0) {
      return res.apiError('无效的ID', 'BAD_REQUEST', null, 400)
    }

    const { reason, type: bidType = 'b2c' } = req.body
    if (!reason || !reason.trim()) {
      return res.apiError('取消原因不能为空', 'BAD_REQUEST', null, 400)
    }

    // C2C 拍卖取消（管理员强制取消，通过 type=c2c 区分）
    if (bidType === 'c2c') {
      const AuctionService = req.app.locals.services.getService('auction_core')

      logger.info('[竞价管理] 管理员强制取消C2C拍卖', {
        auction_listing_id: entityId,
        reason,
        admin_user_id: req.user.user_id
      })

      try {
        const result = await TransactionManager.execute(async transaction => {
          return await AuctionService.cancelAuction(
            entityId,
            req.user.user_id,
            true, // isAdmin = true（管理员强制取消，不受 bid_count 限制）
            { transaction }
          )
        })

        return res.apiSuccess(
          result,
          `C2C拍卖已取消，${result.refunded_users} 名用户的冻结资产已解冻返还`
        )
      } catch (error) {
        return handleServiceError(error, res, 'C2C拍卖取消失败')
      }
    }

    // B2C 竞价取消（默认逻辑）
    const BidService = req.app.locals.services.getService('exchange_bid_core')

    logger.info('[竞价管理] 取消竞价', {
      bid_product_id: entityId,
      reason,
      admin_user_id: req.user.user_id
    })

    try {
      const result = await TransactionManager.execute(async transaction => {
        return await BidService.cancelBidProduct(entityId, reason.trim(), { transaction })
      })

      logger.info('[竞价管理] 竞价取消完成', {
        bid_product_id: entityId,
        refunded_users: result.refunded_users
      })

      return res.apiSuccess(
        result,
        `竞价已取消，${result.refunded_users} 名用户的冻结资产已解冻返还`
      )
    } catch (error) {
      return handleServiceError(error, res, '取消竞价失败')
    }
  })
)

module.exports = router
