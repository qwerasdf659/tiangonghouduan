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
 * 幂等性保证（业界标准形态 - 破坏性重构 2026-01-02）：
 * - 统一只接受 Header Idempotency-Key
 * - 缺失幂等键直接返回 400
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月02日 - 业界标准形态破坏性重构
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
// 业界标准幂等架构 - 统一入口幂等服务
const IdempotencyService = require('../../../../services/IdempotencyService')

/**
 * @route POST /api/v4/exchange_market/exchange
 * @desc 兑换商品（V4.5.0 材料资产支付）
 * @access Private (需要登录)
 *
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {number} item_id - 商品ID（必填）
 * @body {number} quantity - 兑换数量（默认1，最大10）
 *
 * @returns {Object} 兑换结果
 * @returns {Object} data.order - 订单信息（包含pay_asset_code, pay_amount）
 * @returns {Object} data.remaining - 剩余余额
 * @returns {boolean} data.is_duplicate - 是否为幂等回放请求
 *
 * 业务场景：用户使用材料资产兑换商品
 * 幂等性控制（业界标准形态）：统一通过 Header Idempotency-Key 防止重复下单
 */
router.post('/exchange', authenticateToken, async (req, res) => {
  // 【业界标准形态】强制从 Header 获取幂等键，不接受 body
  const idempotency_key = req.headers['idempotency-key']

  // 缺失幂等键直接返回 400
  if (!idempotency_key) {
    logger.warn('缺少幂等键', { user_id: req.user?.user_id, item_id: req.body?.item_id })
    return res.apiError(
      '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
        '重试时必须复用同一幂等键以防止重复下单。',
      'MISSING_IDEMPOTENCY_KEY',
      {
        required_header: 'Idempotency-Key',
        example: 'Idempotency-Key: exchange_<timestamp>_<random>'
      },
      400
    )
  }

  try {
    // 🔄 通过 ServiceManager 获取 ExchangeService（符合TR-005规范）
    const ExchangeService = req.app.locals.services.getService('exchangeMarket')

    const { item_id, quantity = 1 } = req.body
    const user_id = req.user.user_id

    logger.info('用户兑换商品请求', {
      user_id,
      item_id,
      quantity,
      idempotency_key
    })

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

    /*
     * 【入口幂等检查】防止同一次请求被重复提交
     * 统一使用 IdempotencyService 进行请求级幂等控制
     */
    const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
      api_path: '/api/v4/exchange_market/exchange',
      http_method: 'POST',
      request_params: { item_id: itemId, quantity: exchangeQuantity },
      user_id
    })

    // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
    if (!idempotencyResult.should_process) {
      logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
        idempotency_key,
        user_id,
        item_id: itemId
      })
      const duplicateResponse = {
        ...idempotencyResult.response,
        is_duplicate: true
      }
      return res.apiSuccess(duplicateResponse, '兑换成功（幂等回放）')
    }

    /*
     * 调用服务层（传递 idempotency_key）
     * 服务层内部使用此幂等键生成派生子事务幂等键
     */
    const result = await ExchangeService.exchangeItem(user_id, itemId, exchangeQuantity, {
      idempotency_key
    })

    // 构建响应数据
    const responseData = {
      order: result.order,
      remaining: result.remaining,
      is_duplicate: false
    }

    /*
     * 【标记请求完成】保存结果快照到入口幂等表
     */
    await IdempotencyService.markAsCompleted(
      idempotency_key,
      result.order.order_no, // 业务事件ID = 订单号
      responseData
    )

    logger.info('兑换成功', {
      user_id,
      item_id: itemId,
      quantity: exchangeQuantity,
      idempotency_key,
      order_no: result.order.order_no,
      pay_asset_code: result.order.pay_asset_code,
      pay_amount: result.order.pay_amount
    })

    return res.apiSuccess(responseData, result.message)
  } catch (error) {
    // 标记幂等请求失败（允许重试）
    await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
      logger.error('标记幂等请求失败状态时出错:', markError)
    })

    // 处理幂等键冲突错误（409状态码）
    if (error.statusCode === 409) {
      logger.warn('幂等性错误:', {
        idempotency_key,
        error_code: error.errorCode,
        message: error.message
      })
      return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
    }

    logger.error('兑换商品失败', {
      error: error.message,
      user_id: req.user?.user_id,
      item_id: req.body?.item_id,
      idempotency_key
    })
    return handleServiceError(error, res, '兑换失败')
  }
})

module.exports = router
