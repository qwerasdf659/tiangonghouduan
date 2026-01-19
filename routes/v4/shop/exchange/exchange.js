/**
 * B2C材料兑换模块 - 兑换操作
 *
 * @route /api/v4/shop/exchange
 * @description 用户兑换商品操作
 *
 * API列表：
 * - POST / - 兑换商品（V4.5.0 材料资产支付，路由挂载到 /api/v4/shop/exchange）
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
 * 路径双轨清理（2026-01-19）：
 * - 原路径：/api/v4/shop/exchange/exchange（已废弃删除）
 * - canonical 路径：/api/v4/shop/exchange（当前使用）
 * - 路由定义已从 /exchange 改为 /（根路径）
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月19日 - 路径双轨清理
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')
// P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）

/**
 * @route POST /api/v4/shop/exchange
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
 *
 * 【路径双轨清理 2026-01-19】：
 * - 原路径：/api/v4/shop/exchange/exchange（已废弃）
 * - canonical 路径：/api/v4/shop/exchange（当前使用）
 */
router.post('/', authenticateToken, async (req, res) => {
  // P1-9：通过 ServiceManager 获取服务（B1-Injected + E2-Strict snake_case）
  const IdempotencyService = req.app.locals.services.getService('idempotency')
  const ExchangeService = req.app.locals.services.getService('exchange_market')

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
     * 【路径双轨清理 2026-01-19】：使用 canonical 路径 /api/v4/shop/exchange
     */
    const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
      api_path: '/api/v4/shop/exchange',
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
     * 使用 TransactionManager 统一事务边界（符合治理决策）
     * 服务层内部使用此幂等键生成派生子事务幂等键
     */
    const result = await TransactionManager.execute(async transaction => {
      return await ExchangeService.exchangeItem(user_id, itemId, exchangeQuantity, {
        idempotency_key,
        transaction
      })
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

    /*
     * 数据库死锁错误处理（高并发场景）
     * MySQL在并发竞争同一资源时会产生死锁，这是正常行为
     * 将死锁错误转换为409响应，提示用户重试
     */
    const isDeadlock =
      error.message?.includes('Deadlock') ||
      error.message?.includes('deadlock') ||
      error.parent?.code === 'ER_LOCK_DEADLOCK'
    if (isDeadlock) {
      logger.warn('数据库死锁（并发竞争），建议重试', {
        idempotency_key,
        user_id: req.user?.user_id,
        item_id: req.body?.item_id
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
