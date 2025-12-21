/**
 * 餐厅积分抽奖系统 V4.5 - 兑换功能API
 *
 * 业务范围：
 * - 兑换商品（材料资产支付）
 *
 * 业务规则（V4.5.0强制）：
 * - 兑换只能使用材料资产支付（cost_asset_code + cost_amount）
 * - 支付资产扣减通过AssetService.changeBalance()执行
 * - 订单记录pay_asset_code和pay_amount字段（必填）
 * - 支持幂等性控制（business_id必填）
 *
 * 创建时间：2025-12-22
 * 来源：从 items.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * 兑换商品（V4.5.0 材料资产支付）
 * POST /api/v4/exchange_market/exchange
 *
 * @body {number} item_id - 商品ID（必填）
 * @body {number} quantity - 兑换数量（默认1）
 * @body {string} business_id - 业务唯一ID（必填，用于幂等性控制）
 * @header {string} Idempotency-Key - 幂等键（可选，与business_id二选一）
 *
 * 🔴 业务幂等性设计（P1-1强制规范）：
 * 1. 强制幂等键：客户端必须提供幂等键
 * 2. 缺失即拒绝：两者都未提供时，直接返回 400 错误
 * 3. 禁止后端兜底生成：不再自动生成 business_id
 */
router.post('/exchange', authenticateToken, async (req, res) => {
  try {
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

    // 强制校验：必须提供幂等键
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

    // 优先使用 Body 中的 business_id
    const business_id = bodyBusinessId || headerIdempotencyKey

    // 参数验证
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

    // 调用服务层（Service内部验证幂等性和参数冲突）
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
      stack: error.stack,
      user_id: req.user?.user_id,
      item_id: req.body?.item_id,
      business_id: req.body?.business_id || req.headers['idempotency-key']
    })
    return handleServiceError(error, res, '兑换失败')
  }
})

module.exports = router
