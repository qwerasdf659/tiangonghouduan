/**
 * 管理后台 - 汇率兑换管理
 *
 * @route /api/v4/console/exchange-rates
 * @description 管理后台汇率规则CRUD + 启停操作
 *
 * API列表：
 * - GET    /              - 查询汇率规则列表（分页+筛选）
 * - POST   /              - 新增汇率规则
 * - PUT    /:id           - 更新汇率规则
 * - PATCH  /:id/status    - 更新汇率规则状态（启停）
 *
 * @version 1.0.0
 * @date 2026-02-23
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * @route GET /api/v4/console/exchange-rates
 * @desc 查询汇率规则列表（管理员）
 * @access Admin (role_level >= 100)
 * @query {string} status - 筛选状态（active/paused/disabled）
 * @query {string} from_asset_code - 筛选源资产
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { status, from_asset_code, page = 1, page_size = 20 } = req.query
    const ExchangeRateService = req.app.locals.services.getService('exchange_rate')

    const result = await ExchangeRateService.adminListRates({
      status,
      from_asset_code,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    return res.apiSuccess(result, '获取汇率规则列表成功')
  } catch (error) {
    logger.error('获取汇率规则列表失败', { error: error.message })
    return handleServiceError(error, res, '获取汇率规则列表')
  }
})

/**
 * @route POST /api/v4/console/exchange-rates
 * @desc 新增汇率规则（管理员）
 * @access Admin (role_level >= 100)
 */
router.post('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      from_asset_code,
      to_asset_code,
      rate_numerator,
      rate_denominator,
      min_from_amount,
      max_from_amount,
      daily_user_limit,
      daily_global_limit,
      fee_rate,
      priority,
      effective_from,
      effective_until,
      description
    } = req.body

    if (!from_asset_code || !to_asset_code || !rate_numerator || !rate_denominator) {
      return res.apiError(
        '缺少必填参数：from_asset_code, to_asset_code, rate_numerator, rate_denominator',
        'MISSING_PARAMS',
        null,
        400
      )
    }

    if (parseInt(rate_numerator) <= 0 || parseInt(rate_denominator) <= 0) {
      return res.apiError('汇率分子和分母必须为正整数', 'INVALID_RATE', null, 400)
    }

    const ExchangeRateService = req.app.locals.services.getService('exchange_rate')

    const rate = await ExchangeRateService.adminCreateRate({
      from_asset_code,
      to_asset_code,
      rate_numerator: parseInt(rate_numerator),
      rate_denominator: parseInt(rate_denominator),
      min_from_amount: min_from_amount ? parseInt(min_from_amount) : 1,
      max_from_amount: max_from_amount ? parseInt(max_from_amount) : null,
      daily_user_limit: daily_user_limit ? parseInt(daily_user_limit) : null,
      daily_global_limit: daily_global_limit ? parseInt(daily_global_limit) : null,
      fee_rate: fee_rate ? parseFloat(fee_rate) : 0,
      priority: priority ? parseInt(priority) : 0,
      effective_from: effective_from || null,
      effective_until: effective_until || null,
      description: description || null,
      created_by: req.user.user_id
    })

    logger.info('管理员创建汇率规则', {
      admin_id: req.user.user_id,
      exchange_rate_id: rate.exchange_rate_id,
      from_asset_code,
      to_asset_code
    })

    return res.apiSuccess(rate, '汇率规则创建成功')
  } catch (error) {
    logger.error('创建汇率规则失败', { error: error.message, admin_id: req.user?.user_id })

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.apiError('该币对和优先级的规则已存在', 'DUPLICATE_RATE', null, 409)
    }

    return handleServiceError(error, res, '创建汇率规则')
  }
})

/**
 * @route PUT /api/v4/console/exchange-rates/:id
 * @desc 更新汇率规则（管理员）
 * @access Admin (role_level >= 100)
 */
router.put('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const exchange_rate_id = parseInt(req.params.id)
    if (isNaN(exchange_rate_id)) {
      return res.apiError('无效的汇率规则ID', 'INVALID_ID', null, 400)
    }

    const updateData = {}
    const allowedFields = [
      'rate_numerator',
      'rate_denominator',
      'min_from_amount',
      'max_from_amount',
      'daily_user_limit',
      'daily_global_limit',
      'fee_rate',
      'priority',
      'effective_from',
      'effective_until',
      'description'
    ]

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field]
      }
    }

    const ExchangeRateService = req.app.locals.services.getService('exchange_rate')
    const rate = await ExchangeRateService.adminUpdateRate(exchange_rate_id, updateData)

    logger.info('管理员更新汇率规则', {
      admin_id: req.user.user_id,
      exchange_rate_id,
      updated_fields: Object.keys(updateData)
    })

    return res.apiSuccess(rate, '汇率规则更新成功')
  } catch (error) {
    logger.error('更新汇率规则失败', { error: error.message, admin_id: req.user?.user_id })
    return handleServiceError(error, res, '更新汇率规则')
  }
})

/**
 * @route PATCH /api/v4/console/exchange-rates/:id/status
 * @desc 更新汇率规则状态（启停）
 * @access Admin (role_level >= 100)
 * @body {string} status - 新状态（active/paused/disabled）
 */
router.patch('/:id/status', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const exchange_rate_id = parseInt(req.params.id)
    if (isNaN(exchange_rate_id)) {
      return res.apiError('无效的汇率规则ID', 'INVALID_ID', null, 400)
    }

    const { status } = req.body
    if (!status) {
      return res.apiError('缺少 status 参数', 'MISSING_STATUS', null, 400)
    }

    const ExchangeRateService = req.app.locals.services.getService('exchange_rate')
    const rate = await ExchangeRateService.adminUpdateStatus(exchange_rate_id, status)

    logger.info('管理员更新汇率规则状态', {
      admin_id: req.user.user_id,
      exchange_rate_id,
      new_status: status
    })

    return res.apiSuccess(rate, `汇率规则状态已更新为 ${status}`)
  } catch (error) {
    logger.error('更新汇率规则状态失败', { error: error.message })
    return handleServiceError(error, res, '更新汇率规则状态')
  }
})

module.exports = router
