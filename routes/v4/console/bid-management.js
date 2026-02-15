/**
 * 竞价管理路由 - 管理后台
 *
 * 路径：/api/v4/console/bid-management
 *
 * 职责：
 * - 创建竞价商品（关联兑换商品，设定起拍价、时间段）
 * - 查看竞价列表（含出价统计、状态筛选）
 * - 获取竞价详情（含完整出价记录）
 * - 手动结算竞价（提前结算到期竞价）
 * - 取消竞价（全部出价者解冻返还）
 *
 * 子路由清单：
 * - POST /                         - 创建竞价商品
 * - GET  /                         - 竞价商品列表（管理视图）
 * - GET  /:id                      - 竞价商品详情（管理视图，含完整出价记录）
 * - POST /:id/settle               - 手动结算竞价
 * - POST /:id/cancel               - 取消竞价
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 BidService/BidQueryService
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 管理员权限要求：role_level >= 100
 *
 * @module routes/v4/console/bid-management
 * @created 2026-02-16（臻选空间/幸运空间/竞价功能 Phase 3 §7 步骤 3.7）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
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

// ==================== 所有路由需要管理员权限（role_level >= 100）====================

/**
 * POST /api/v4/console/bid-management
 *
 * @description 创建竞价商品（关联一个兑换商品，设定竞价参数）
 * @access Admin（role_level >= 100）
 *
 * @body {number} exchange_item_id - 关联的兑换商品ID（必填）
 * @body {number} start_price - 起拍价（必填，正整数）
 * @body {string} [price_asset_code='DIAMOND'] - 竞价资产类型（默认 DIAMOND）
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
      price_asset_code = 'DIAMOND',
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
    const forbiddenAssets = ['POINTS', 'BUDGET_POINTS']
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
      const result = await TransactionManager.execute(async transaction => {
        const { ExchangeItem, BidProduct } = require('../../../models')

        // 校验兑换商品是否存在
        const exchangeItem = await ExchangeItem.findByPk(exchange_item_id, { transaction })
        if (!exchangeItem) {
          const err = new Error('关联的兑换商品不存在')
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
 * GET /api/v4/console/bid-management
 *
 * @description 获取竞价商品列表（管理视图，含出价统计）
 * @access Admin（role_level >= 100）
 *
 * @query {string} [status='all'] - 状态筛选：all/pending/active/ended/settled/no_bid/cancelled/settlement_failed
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（默认 20，最大 100）
 *
 * @returns {Object} { bid_products, pagination }
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    const { status = 'all', page = 1, page_size = 20 } = req.query

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

    logger.info('[竞价管理] 查询竞价列表', { status, page: finalPage, page_size: finalPageSize })

    // 管理视图不传 user_id（不附加个人出价信息）
    const result = await BidQueryService.getBidProducts({
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '获取竞价列表成功')
  })
)

/**
 * GET /api/v4/console/bid-management/:id
 *
 * @description 获取竞价商品详情（管理视图，含完整出价记录列表）
 * @access Admin（role_level >= 100）
 *
 * @param {number} id - 竞价商品ID（事务实体）
 *
 * @returns {Object} 竞价商品详情 + 所有出价记录
 */
router.get(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    const bidProductId = parseInt(req.params.id, 10)
    if (isNaN(bidProductId) || bidProductId <= 0) {
      return res.apiError('无效的竞价商品ID', 'BAD_REQUEST', null, 400)
    }

    logger.info('[竞价管理] 查询竞价详情', { bid_product_id: bidProductId })

    try {
      // 管理视图不传 user_id
      const result = await BidQueryService.getBidProductDetail(bidProductId, {})

      // 管理视图额外返回完整出价记录（不脱敏用户ID，管理员需要看到）
      const { BidRecord } = require('../../../models')
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
 * POST /api/v4/console/bid-management/:id/settle
 *
 * @description 手动结算竞价（管理员强制结算，即使未到结束时间）
 * @access Admin（role_level >= 100）
 *
 * @param {number} id - 竞价商品ID（事务实体）
 *
 * @returns {Object} 结算结果
 */
router.post(
  '/:id/settle',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const BidService = req.app.locals.services.getService('exchange_bid_core')

    const bidProductId = parseInt(req.params.id, 10)
    if (isNaN(bidProductId) || bidProductId <= 0) {
      return res.apiError('无效的竞价商品ID', 'BAD_REQUEST', null, 400)
    }

    logger.info('[竞价管理] 手动结算竞价', {
      bid_product_id: bidProductId,
      admin_user_id: req.user.user_id
    })

    try {
      const result = await TransactionManager.execute(async transaction => {
        return await BidService.settleBidProduct(bidProductId, { transaction })
      })

      // 🔔 事务提交后，异步发送结算通知（fire-and-forget）
      if (result.status === 'settled') {
        const NotificationService = require('../../../services/NotificationService')

        // 中标通知
        NotificationService.notifyBidWon(result.winner_user_id, {
          bid_product_id: bidProductId,
          item_name: result.item_name,
          winning_amount: result.winning_amount,
          price_asset_code: result.price_asset_code
        }).catch(err => logger.error('发送中标通知失败', { error: err.message }))

        // 落选通知
        if (result._losers) {
          for (const loser of result._losers) {
            NotificationService.notifyBidLost(loser.user_id, {
              bid_product_id: bidProductId,
              item_name: result.item_name,
              my_bid_amount: loser.bid_amount,
              winning_amount: result.winning_amount,
              price_asset_code: result.price_asset_code
            }).catch(err => logger.error('发送落选通知失败', { error: err.message }))
          }
        }
      }

      // 从响应中移除内部字段
      delete result._losers

      logger.info('[竞价管理] 手动结算完成', {
        bid_product_id: bidProductId,
        status: result.status
      })

      return res.apiSuccess(result, `竞价结算完成（状态：${result.status}）`)
    } catch (error) {
      return handleServiceError(error, res, '手动结算失败')
    }
  })
)

/**
 * POST /api/v4/console/bid-management/:id/cancel
 *
 * @description 取消竞价（所有出价者的冻结资产解冻返还）
 * @access Admin（role_level >= 100）
 *
 * @param {number} id - 竞价商品ID（事务实体）
 * @body {string} reason - 取消原因（必填）
 *
 * @returns {Object} 取消结果
 */
router.post(
  '/:id/cancel',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const BidService = req.app.locals.services.getService('exchange_bid_core')

    const bidProductId = parseInt(req.params.id, 10)
    if (isNaN(bidProductId) || bidProductId <= 0) {
      return res.apiError('无效的竞价商品ID', 'BAD_REQUEST', null, 400)
    }

    const { reason } = req.body
    if (!reason || !reason.trim()) {
      return res.apiError('取消原因不能为空', 'BAD_REQUEST', null, 400)
    }

    logger.info('[竞价管理] 取消竞价', {
      bid_product_id: bidProductId,
      reason,
      admin_user_id: req.user.user_id
    })

    try {
      const result = await TransactionManager.execute(async transaction => {
        return await BidService.cancelBidProduct(bidProductId, reason.trim(), { transaction })
      })

      logger.info('[竞价管理] 竞价取消完成', {
        bid_product_id: bidProductId,
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
