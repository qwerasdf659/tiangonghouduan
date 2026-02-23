/**
 * 市场域 - 固定汇率兑换（用户端）
 *
 * @route /api/v4/market/exchange-rates
 * @description 用户端汇率兑换功能：查询汇率、预览兑换、执行兑换
 *
 * API列表：
 * - GET  /exchange-rates          - 所有可用汇率列表
 * - GET  /exchange-rates/:from/:to - 特定币对汇率
 * - POST /exchange-rates/preview  - 预览兑换结果（不执行）
 * - POST /exchange-rates/convert  - 执行兑换（需幂等键）
 *
 * @version 1.0.0
 * @date 2026-02-23
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { requireValidSession } = require('../../../middleware/sensitiveOperation')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * @route GET /api/v4/market/exchange-rates
 * @desc 获取所有可用的汇率兑换规则
 * @access Private (需要登录)
 */
router.get('/exchange-rates', authenticateToken, async (req, res) => {
  try {
    const ExchangeRateService = req.app.locals.services.getService('exchange_rate')
    const rates = await ExchangeRateService.getAllRates()

    return res.apiSuccess(rates, '获取汇率列表成功')
  } catch (error) {
    logger.error('获取汇率列表失败', { error: error.message, user_id: req.user?.user_id })
    return handleServiceError(error, res, '获取汇率列表')
  }
})

/**
 * @route GET /api/v4/market/exchange-rates/:from/:to
 * @desc 获取特定币对的汇率
 * @access Private (需要登录)
 */
router.get('/exchange-rates/:from/:to', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.params
    const ExchangeRateService = req.app.locals.services.getService('exchange_rate')
    const rate = await ExchangeRateService.getRate(from, to)

    if (!rate) {
      return res.apiError(`汇率规则不存在：${from} → ${to}`, 'RATE_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(rate, '获取汇率成功')
  } catch (error) {
    logger.error('获取汇率失败', { error: error.message, params: req.params })
    return handleServiceError(error, res, '获取汇率')
  }
})

/**
 * @route POST /api/v4/market/exchange-rates/preview
 * @desc 预览兑换结果（不执行，仅计算）
 * @access Private (需要登录)
 * @body {string} from_asset_code - 源资产代码
 * @body {string} to_asset_code - 目标资产代码
 * @body {number} from_amount - 兑换数量
 */
router.post('/exchange-rates/preview', authenticateToken, async (req, res) => {
  try {
    const { from_asset_code, to_asset_code, from_amount } = req.body
    const user_id = req.user.user_id

    if (!from_asset_code || !to_asset_code || !from_amount) {
      return res.apiError(
        '缺少必填参数：from_asset_code, to_asset_code, from_amount',
        'MISSING_PARAMS',
        null,
        400
      )
    }

    const amount = parseInt(from_amount)
    if (isNaN(amount) || amount <= 0) {
      return res.apiError('兑换数量必须为正整数', 'INVALID_AMOUNT', null, 400)
    }

    const ExchangeRateService = req.app.locals.services.getService('exchange_rate')
    const preview = await ExchangeRateService.previewConvert(
      user_id,
      from_asset_code,
      to_asset_code,
      amount
    )

    return res.apiSuccess(preview, '兑换预览成功')
  } catch (error) {
    logger.error('兑换预览失败', {
      error: error.message,
      user_id: req.user?.user_id,
      body: req.body
    })
    return handleServiceError(error, res, '兑换预览')
  }
})

/**
 * @route POST /api/v4/market/exchange-rates/convert
 * @desc 执行汇率兑换（需要幂等键）
 * @access Private (需要登录 + 有效会话)
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {string} from_asset_code - 源资产代码
 * @body {string} to_asset_code - 目标资产代码
 * @body {number} from_amount - 兑换数量
 */
router.post('/exchange-rates/convert', authenticateToken, requireValidSession, async (req, res) => {
  try {
    const { from_asset_code, to_asset_code, from_amount } = req.body
    const user_id = req.user.user_id
    const idempotency_key = req.headers['idempotency-key']

    if (!idempotency_key) {
      return res.apiError('缺少 Idempotency-Key 请求头', 'MISSING_IDEMPOTENCY_KEY', null, 400)
    }

    if (!from_asset_code || !to_asset_code || !from_amount) {
      return res.apiError(
        '缺少必填参数：from_asset_code, to_asset_code, from_amount',
        'MISSING_PARAMS',
        null,
        400
      )
    }

    const amount = parseInt(from_amount)
    if (isNaN(amount) || amount <= 0) {
      return res.apiError('兑换数量必须为正整数', 'INVALID_AMOUNT', null, 400)
    }

    const ExchangeRateService = req.app.locals.services.getService('exchange_rate')

    const result = await TransactionManager.execute(async transaction => {
      return await ExchangeRateService.executeConvert(
        user_id,
        from_asset_code,
        to_asset_code,
        amount,
        idempotency_key,
        { transaction }
      )
    })

    const message = result.is_duplicate ? '兑换已完成（重复请求）' : '兑换成功'
    return res.apiSuccess(result, message)
  } catch (error) {
    logger.error('汇率兑换失败', {
      error: error.message,
      user_id: req.user?.user_id,
      body: req.body
    })

    if (error.statusCode === 409) {
      return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_CONFLICT', null, 409)
    }

    return handleServiceError(error, res, '汇率兑换')
  }
})

module.exports = router
