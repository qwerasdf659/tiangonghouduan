/**
 * 管理后台 — 统一资产转换规则管理
 *
 * @route /api/v4/console/assets/conversion-rules
 * @description 管理后台转换规则 CRUD（合并原 console/assets/rates + console/operations/material 中的转换规则部分）
 *
 * API列表：
 * - GET    /                  - 规则列表（分页/筛选）
 * - GET    /:id               - 规则详情
 * - POST   /                  - 创建规则（含风控校验）
 * - PUT    /:id               - 更新规则
 * - PATCH  /:id/status        - 更新规则状态（启用/暂停/禁用）
 *
 * @version 1.0.0
 * @date 2026-04-05
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')

/** 管理员权限中间件（role_level >= 100） */
const requireAdmin = requireRoleLevel(100)

/**
 * @route GET /api/v4/console/assets/conversion-rules
 * @desc 管理后台 — 转换规则列表（分页/筛选）
 * @access Admin
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const service = req.app.locals.services.getService('asset_conversion_rule')
    const result = await service.adminListRules(req.query)

    return res.apiSuccess(result, '获取转换规则列表成功')
  } catch (error) {
    logger.error('获取转换规则列表失败', { error: error.message })
    return handleServiceError(error, res, '获取转换规则列表')
  }
})

/**
 * @route GET /api/v4/console/assets/conversion-rules/:id
 * @desc 管理后台 — 转换规则详情
 * @access Admin
 */
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const ruleId = parseInt(req.params.id, 10)
    if (!ruleId) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const service = req.app.locals.services.getService('asset_conversion_rule')
    const rule = await service.adminGetRuleById(ruleId)

    return res.apiSuccess(rule, '获取转换规则详情成功')
  } catch (error) {
    if (error.code === 'RULE_NOT_FOUND') {
      return res.apiError(error.message, 'RULE_NOT_FOUND', null, 404)
    }
    logger.error('获取转换规则详情失败', { error: error.message, rule_id: req.params.id })
    return handleServiceError(error, res, '获取转换规则详情')
  }
})

/**
 * @route POST /api/v4/console/assets/conversion-rules
 * @desc 管理后台 — 创建转换规则（含风控校验）
 * @access Admin
 *
 * @body {string} from_asset_code - 源资产代码
 * @body {string} to_asset_code - 目标资产代码
 * @body {number} rate_numerator - 转换比率分子
 * @body {number} rate_denominator - 转换比率分母
 * @body {string} [rounding_mode='floor'] - 舍入模式
 * @body {number} [fee_rate=0] - 手续费费率
 * @body {number} [min_from_amount=1] - 最小转换数量
 * @body {number} [max_from_amount] - 最大转换数量
 * @body {string} [status='active'] - 初始状态
 * @body {string} [title] - 规则标题
 * @body {string} [description] - 规则描述
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      from_asset_code,
      to_asset_code,
      rate_numerator,
      rate_denominator,
      rounding_mode,
      fee_rate,
      fee_min_amount,
      fee_asset_code,
      min_from_amount,
      max_from_amount,
      daily_user_limit,
      daily_global_limit,
      status,
      priority,
      effective_from,
      effective_until,
      title,
      description,
      display_icon,
      risk_level,
      is_visible,
      display_category
    } = req.body

    /* 必填参数校验 */
    if (!from_asset_code || !to_asset_code || !rate_numerator || !rate_denominator) {
      return res.apiError(
        '缺少必填参数：from_asset_code, to_asset_code, rate_numerator, rate_denominator',
        'MISSING_PARAMS',
        null,
        400
      )
    }

    if (parseInt(rate_denominator, 10) <= 0) {
      return res.apiError('rate_denominator 必须大于 0', 'INVALID_DENOMINATOR', null, 400)
    }

    const ruleData = {
      from_asset_code,
      to_asset_code,
      rate_numerator: parseInt(rate_numerator, 10),
      rate_denominator: parseInt(rate_denominator, 10),
      rounding_mode: rounding_mode || 'floor',
      fee_rate: fee_rate || 0,
      fee_min_amount: fee_min_amount || 0,
      fee_asset_code: fee_asset_code || null,
      min_from_amount: min_from_amount || 1,
      max_from_amount: max_from_amount || null,
      daily_user_limit: daily_user_limit || null,
      daily_global_limit: daily_global_limit || null,
      status: status || 'active',
      priority: priority || 0,
      effective_from: effective_from || null,
      effective_until: effective_until || null,
      title: title || null,
      description: description || null,
      display_icon: display_icon || null,
      risk_level: risk_level || 'low',
      is_visible: is_visible !== undefined ? is_visible : true,
      display_category: display_category || null,
      created_by: req.user.user_id,
      updated_by: req.user.user_id
    }

    const service = req.app.locals.services.getService('asset_conversion_rule')
    const rule = await TransactionManager.execute(async transaction => {
      return service.adminCreateRule(ruleData, { transaction })
    })

    return res.apiSuccess(rule, '创建转换规则成功')
  } catch (error) {
    if (['CYCLE_DETECTED', 'ARBITRAGE_DETECTED', 'TERMINAL_ASSET_OUTFLOW'].includes(error.code)) {
      return res.apiError(error.message, error.code, null, 400)
    }
    logger.error('创建转换规则失败', { error: error.message })
    return handleServiceError(error, res, '创建转换规则')
  }
})

/**
 * @route PUT /api/v4/console/assets/conversion-rules/:id
 * @desc 管理后台 — 更新转换规则
 * @access Admin
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const ruleId = parseInt(req.params.id, 10)
    if (!ruleId) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const updateData = { ...req.body, updated_by: req.user.user_id }

    /* 禁止修改主键 */
    delete updateData.conversion_rule_id

    const service = req.app.locals.services.getService('asset_conversion_rule')
    const rule = await TransactionManager.execute(async transaction => {
      return service.adminUpdateRule(ruleId, updateData, { transaction })
    })

    return res.apiSuccess(rule, '更新转换规则成功')
  } catch (error) {
    if (error.code === 'RULE_NOT_FOUND') {
      return res.apiError(error.message, 'RULE_NOT_FOUND', null, 404)
    }
    if (['CYCLE_DETECTED', 'ARBITRAGE_DETECTED', 'TERMINAL_ASSET_OUTFLOW'].includes(error.code)) {
      return res.apiError(error.message, error.code, null, 400)
    }
    logger.error('更新转换规则失败', { error: error.message, rule_id: req.params.id })
    return handleServiceError(error, res, '更新转换规则')
  }
})

/**
 * @route PATCH /api/v4/console/assets/conversion-rules/:id/status
 * @desc 管理后台 — 更新规则状态（启用/暂停/禁用）
 * @access Admin
 *
 * @body {string} status - 新状态：active / paused / disabled
 */
router.patch('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const ruleId = parseInt(req.params.id, 10)
    if (!ruleId) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const { status } = req.body
    const validStatuses = ['active', 'paused', 'disabled']
    if (!status || !validStatuses.includes(status)) {
      return res.apiError(
        `无效的状态值，允许值：${validStatuses.join(', ')}`,
        'INVALID_STATUS',
        null,
        400
      )
    }

    const service = req.app.locals.services.getService('asset_conversion_rule')
    const rule = await TransactionManager.execute(async transaction => {
      return service.adminUpdateStatus(ruleId, status, { transaction })
    })

    return res.apiSuccess(rule, `规则状态已更新为 ${status}`)
  } catch (error) {
    if (error.code === 'RULE_NOT_FOUND') {
      return res.apiError(error.message, 'RULE_NOT_FOUND', null, 404)
    }
    if (['CYCLE_DETECTED', 'ARBITRAGE_DETECTED'].includes(error.code)) {
      return res.apiError(error.message, error.code, null, 400)
    }
    logger.error('更新规则状态失败', { error: error.message, rule_id: req.params.id })
    return handleServiceError(error, res, '更新规则状态')
  }
})

module.exports = router
