/**
 * 兑换市场模块 - 兑换操作
 *
 * @route /api/v4/exchange_market
 * @description 用户兑换商品操作
 *
 * API列表：
 * - POST /exchange - 兑换商品（V4.5.0 材料资产支付）
 *
 * 业务场景：
 * - 用户使用材料资产兑换商品
 * - 支持幂等性控制，防止重复下单
 *
 * 支付方式（V4.5.0）：
 * - 使用材料资产支付（cost_asset_code + cost_amount）
 * - 材料扣减通过AssetService执行
 * - 订单记录pay_asset_code和pay_amount字段
 *
 * 创建时间：2025年12月22日
 * 从exchange_market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * @route POST /api/v4/exchange_market/exchange
 * @desc 兑换商品（V4.5.0 材料资产支付）
 * @access Private (需要登录)
 *
 * @body {number} item_id - 商品ID（必填）
 * @body {number} quantity - 兑换数量（默认1，最大10）
 * @body {string} business_id - 业务唯一ID（必填，用于幂等性控制）
 * @header {string} Idempotency-Key - 幂等键（可选，Header方式，与business_id二选一）
 *
 * @returns {Object} 兑换结果
 * @returns {Object} data.order - 订单信息（包含pay_asset_code, pay_amount）
 * @returns {Object} data.remaining - 剩余余额
 * @returns {string} data.business_id - 幂等键（供前端确认）
 * @returns {boolean} data.is_duplicate - 是否为幂等请求（仅重复时返回）
 *
 * 🔴 业务幂等性设计（P1-1强制规范）：
 * 1. 强制幂等键：客户端必须提供幂等键，支持两种方式：
 *    - 方式A：Body中的 business_id（推荐，业务交易号语义）
 *    - 方式B：Header中的 Idempotency-Key（兼容标准HTTP幂等设计）
 * 2. 缺失即拒绝：两者都未提供时，直接返回 400 错误
 * 3. 禁止后端兜底生成：不再自动生成 business_id（防止重复下单）
 */
router.post('/exchange', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeMarketService（符合TR-005规范）
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const { item_id, quantity = 1, business_id: bodyBusinessId } = req.body
    const headerIdempotencyKey = req.headers['idempotency-key']
    const user_id = req.user.user_id

    logger.info('用户兑换商品请求', {
      user_id,
      item_id,
      quantity,
      body_business_id: bodyBusinessId,
      header_idempotency_key: headerIdempotencyKey
    })

    // 🔴 P1-1强制校验：必须提供幂等键（business_id 或 Idempotency-Key）
    if (!bodyBusinessId && !headerIdempotencyKey) {
      logger.warn('缺少幂等键', { user_id, item_id })
      return res.apiError(
        '缺少幂等键：请在请求Body中提供 business_id 或在Header中提供 Idempotency-Key。' +
          '重试时必须复用同一幂等键以防止重复下单。',
        'BAD_REQUEST',
        {
          required_fields: ['business_id (Body)', 'Idempotency-Key (Header)'],
          requirement: 'at_least_one'
        },
        400
      )
    }

    // 🔴 优先使用 Body 中的 business_id，如果没有则使用 Header 中的 Idempotency-Key
    const business_id = bodyBusinessId || headerIdempotencyKey

    // 参数验证：商品ID必填
    if (!item_id || item_id === undefined) {
      return res.apiError('商品ID不能为空', 'BAD_REQUEST', null, 400)
    }

    const itemId = parseInt(item_id)
    const exchangeQuantity = parseInt(quantity)

    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    if (isNaN(exchangeQuantity) || exchangeQuantity <= 0 || exchangeQuantity > 10) {
      return res.apiError('兑换数量必须在1-10之间', 'BAD_REQUEST', null, 400)
    }

    // 🔴 P1-1冲突保护：调用服务层（Service内部会验证幂等性和参数冲突）
    const result = await ExchangeMarketService.exchangeItem(user_id, itemId, exchangeQuantity, {
      business_id
    })

    logger.info('兑换成功', {
      user_id,
      item_id: itemId,
      quantity: exchangeQuantity,
      business_id,
      order_no: result.order.order_no,
      pay_asset_code: result.order.pay_asset_code,
      pay_amount: result.order.pay_amount,
      is_duplicate: result.is_duplicate || false
    })

    // ✅ 在响应中返回 business_id 和材料资产支付信息，供前端确认幂等键
    return res.apiSuccess(
      {
        order: result.order,
        remaining: result.remaining,
        business_id,
        ...(result.is_duplicate && { is_duplicate: true })
      },
      result.message
    )
  } catch (error) {
    logger.error('兑换商品失败', {
      error: error.message,
      user_id: req.user?.user_id,
      item_id: req.body?.item_id,
      business_id: req.body?.business_id || req.headers['idempotency-key']
    })
    return handleServiceError(error, res, '兑换失败')
  }
})

module.exports = router
