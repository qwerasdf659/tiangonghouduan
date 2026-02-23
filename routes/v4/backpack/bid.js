/**
 * 竞价路由 - 背包域
 *
 * 路径：/api/v4/backpack/bid
 *
 * 职责：
 * - 用户浏览竞价商品列表和详情
 * - 用户提交出价（冻结资产）
 * - 用户查看自己的竞价历史
 *
 * 子路由清单：
 * - GET  /products                    - 竞价商品列表
 * - GET  /products/:bid_product_id    - 竞价商品详情
 * - POST /                            - 提交出价
 * - GET  /history                     - 用户竞价记录
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 BidService/BidQueryService
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 *
 * @module routes/v4/backpack/bid
 * @created 2026-02-16（臻选空间/幸运空间/竞价功能）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
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
 * GET /api/v4/backpack/bid/products
 *
 * @description 获取竞价商品列表
 * @access Private（所有登录用户可访问，需要JWT认证获取个性化字段）
 *
 * @query {string} status - 竞价状态筛选：active(默认)/pending/ended/settled/no_bid/all
 * @query {number} page - 页码（默认 1）
 * @query {number} page_size - 每页数量（默认 10，最大 50）
 *
 * @returns {Object} { bid_products, pagination }
 */
router.get(
  '/products',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    const { status = 'active', page = 1, page_size = 10 } = req.query
    const userId = req.user.user_id

    logger.info('获取竞价商品列表', { user_id: userId, status, page, page_size })

    // 参数验证
    const validStatuses = ['active', 'pending', 'ended', 'settled', 'no_bid', 'all']
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的 status 参数，允许值：${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    const finalPage = Math.max(parseInt(page, 10) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size, 10) || 10, 1), 50)

    const result = await BidQueryService.getBidProducts({
      status,
      page: finalPage,
      page_size: finalPageSize,
      user_id: userId
    })

    return res.apiSuccess(result, '获取竞价商品列表成功')
  })
)

/**
 * GET /api/v4/backpack/bid/products/:bid_product_id
 *
 * @description 获取竞价商品详情（含用户出价记录 + Top N 排行）
 * @access Private
 *
 * @param {number} bid_product_id - 竞价商品ID（路由参数）
 *
 * @returns {Object} 竞价商品详情
 */
router.get(
  '/products/:bid_product_id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    const { bid_product_id } = req.params
    const userId = req.user.user_id

    // 参数验证
    const productId = parseInt(bid_product_id, 10)
    if (isNaN(productId) || productId <= 0) {
      return res.apiError('无效的竞价商品ID', 'BAD_REQUEST', null, 400)
    }

    logger.info('获取竞价商品详情', { user_id: userId, bid_product_id: productId })

    try {
      const result = await BidQueryService.getBidProductDetail(productId, { user_id: userId })
      return res.apiSuccess(result, '获取竞价商品详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取竞价详情失败')
    }
  })
)

/**
 * POST /api/v4/backpack/bid
 *
 * @description 提交出价（冻结资产，事务保护）
 * @access Private
 *
 * @header {string} Idempotency-Key - 幂等键（必填，格式：bid_<timestamp>_<random>）
 * @body {number} bid_product_id - 竞价商品ID（必填）
 * @body {number} bid_amount - 出价金额（必填）
 *
 * @returns {Object} 出价结果
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const BidService = req.app.locals.services.getService('exchange_bid_core')

    // 强制从 Header 获取幂等键
    const idempotencyKey = req.headers['idempotency-key']
    if (!idempotencyKey) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key',
        'MISSING_IDEMPOTENCY_KEY',
        {
          required_header: 'Idempotency-Key',
          example: 'Idempotency-Key: bid_<timestamp>_<random>'
        },
        400
      )
    }

    const { bid_product_id, bid_amount } = req.body
    const userId = req.user.user_id

    // 参数验证
    if (!bid_product_id) {
      return res.apiError('竞价商品ID不能为空', 'BAD_REQUEST', null, 400)
    }
    if (!bid_amount) {
      return res.apiError('出价金额不能为空', 'BAD_REQUEST', null, 400)
    }

    const productId = parseInt(bid_product_id, 10)
    const amount = parseInt(bid_amount, 10)

    if (isNaN(productId) || productId <= 0) {
      return res.apiError('无效的竞价商品ID', 'BAD_REQUEST', null, 400)
    }
    if (isNaN(amount) || amount <= 0) {
      return res.apiError('出价金额必须为正整数', 'BAD_REQUEST', null, 400)
    }

    logger.info('用户提交出价', {
      user_id: userId,
      bid_product_id: productId,
      bid_amount: amount,
      idempotency_key: idempotencyKey
    })

    try {
      // 写操作通过 TransactionManager 管理事务边界
      const result = await TransactionManager.execute(async transaction => {
        return await BidService.placeBid(userId, productId, amount, {
          transaction,
          idempotency_key: idempotencyKey
        })
      })

      logger.info('出价成功', {
        user_id: userId,
        bid_product_id: productId,
        bid_record_id: result.bid_record_id,
        bid_amount: amount
      })

      /* 事务提交后，异步发送被超越通知（fire-and-forget，不阻塞响应） */
      if (result._outbid_info) {
        /** 通过 ServiceManager 获取 NotificationService（不直接 require） */
        const NotificationService = req.app.locals.services.getService('notification')
        const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

        // 查询商品名称用于通知内容
        BidQueryService.getBidProductDetail(productId, {})
          .then(detail => {
            const itemName = detail?.exchangeItem?.item_name || '竞价商品'
            const assetCode = detail?.price_asset_code || 'DIAMOND'
            return NotificationService.notifyBidOutbid(result._outbid_info.user_id, {
              bid_product_id: productId,
              item_name: itemName,
              my_bid_amount: result._outbid_info.previous_bid_amount,
              new_highest: amount,
              price_asset_code: assetCode
            })
          })
          .catch(err => logger.error('发送竞价超越通知失败', { error: err.message }))
      }

      // 从响应中移除内部字段（不暴露给前端）
      delete result._outbid_info

      return res.apiSuccess(result, result.message)
    } catch (error) {
      logger.error('出价失败', {
        error: error.message,
        user_id: userId,
        bid_product_id: productId,
        bid_amount: amount
      })

      // 业务错误处理
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, null, error.statusCode)
      }

      // 并发冲突
      if (error.message?.includes('Deadlock') || error.parent?.code === 'ER_LOCK_DEADLOCK') {
        return res.apiError('服务繁忙，请稍后重试', 'CONCURRENT_CONFLICT', { retry_after: 1 }, 409)
      }

      return handleServiceError(error, res, '出价失败')
    }
  })
)

/**
 * GET /api/v4/backpack/bid/history
 *
 * @description 获取用户竞价记录
 * @access Private
 *
 * @query {string} status - 状态筛选：all(默认)/winning/outbid
 * @query {number} page - 页码（默认 1）
 * @query {number} page_size - 每页数量（默认 10）
 *
 * @returns {Object} { bid_records, pagination }
 */
router.get(
  '/history',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const BidQueryService = req.app.locals.services.getService('exchange_bid_query')

    const { status = 'all', page = 1, page_size = 10 } = req.query
    const userId = req.user.user_id

    logger.info('获取用户竞价历史', { user_id: userId, status, page })

    const finalPage = Math.max(parseInt(page, 10) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size, 10) || 10, 1), 50)

    const result = await BidQueryService.getUserBidHistory(userId, {
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '获取竞价记录成功')
  })
)

module.exports = router
