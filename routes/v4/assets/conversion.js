/**
 * 用户域 — 统一资产转换（合并原 rates + shop/assets/convert）
 *
 * @route /api/v4/assets/conversion
 * @description 用户端资产转换功能：查询规则、预览转换、执行转换
 *
 * API列表：
 * - GET  /rules              - 所有可用转换规则列表
 * - GET  /rules/:from/:to    - 特定币对转换规则
 * - POST /preview            - 预览转换结果（不执行）
 * - POST /convert            - 执行转换（需幂等键）
 *
 * 合并来源：
 * - routes/v4/assets/rates.js（汇率兑换用户端）
 * - routes/v4/shop/assets/convert.js（材料转换用户端）
 *
 * @version 1.0.0
 * @date 2026-04-05
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const { requireValidSession } = require('../../../middleware/sensitiveOperation')
const TransactionManager = require('../../../utils/TransactionManager')

const { resolve_display_category } = require('../../../utils/conversion_type_resolver')

/**
 * @route GET /api/v4/assets/conversion/rules
 * @desc 获取所有可用的转换规则（含 conversion_type 分类）
 * @access Private（需要登录）
 */
router.get(
  '/rules',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const service = req.app.locals.services.getService('asset_conversion_rule')
    const rules = await service.getAvailableRules()

    /* 附加 conversion_type + 资产展示信息 */
    const enriched = rules.map(rule => {
      const plain = rule.toJSON ? rule.toJSON() : { ...rule }

      /* 推导 conversion_type（display_category 优先，否则 tier 推导） */
      const { conversion_type, conversion_label, type_source } = resolve_display_category(plain)

      plain.conversion_type = conversion_type
      plain.conversion_label = conversion_label
      plain.type_source = type_source
      plain.from_display_name = plain.fromAssetType?.display_name || plain.from_asset_code
      plain.to_display_name = plain.toAssetType?.display_name || plain.to_asset_code
      plain.from_form = plain.fromAssetType?.form || null
      plain.to_form = plain.toAssetType?.form || null
      plain.from_tier = plain.fromAssetType?.tier ?? null
      plain.to_tier = plain.toAssetType?.tier ?? null
      plain.from_group_code = plain.fromAssetType?.group_code || null
      plain.to_group_code = plain.toAssetType?.group_code || null

      /* 清理关联对象，减少传输体积 */
      delete plain.fromAssetType
      delete plain.toAssetType

      return plain
    })

    return res.apiSuccess(enriched, '获取转换规则列表成功')
  })
)

/**
 * @route GET /api/v4/assets/conversion/rules/:from/:to
 * @desc 获取特定币对的转换规则
 * @access Private（需要登录）
 */
router.get(
  '/rules/:from/:to',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { from, to } = req.params
    const service = req.app.locals.services.getService('asset_conversion_rule')
    const rule = await service.getEffectiveRule(from, to)

    if (!rule) {
      return res.apiError(`转换规则不存在：${from} → ${to}`, 'RULE_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(rule, '获取转换规则成功')
  })
)

/**
 * @route POST /api/v4/assets/conversion/preview
 * @desc 预览转换结果（不执行，不需要幂等键）
 * @access Private（需要登录）
 *
 * @body {string} from_asset_code - 源资产代码
 * @body {string} to_asset_code - 目标资产代码
 * @body {number} from_amount - 源资产数量
 */
router.post(
  '/preview',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { from_asset_code, to_asset_code, from_amount } = req.body
    const userId = req.user.user_id

    /* 参数校验 */
    if (!from_asset_code || !to_asset_code) {
      return res.apiError(
        '缺少必填参数：from_asset_code, to_asset_code',
        'MISSING_PARAMS',
        null,
        400
      )
    }

    const amount = parseInt(from_amount, 10)
    if (!amount || amount <= 0) {
      return res.apiError('from_amount 必须为正整数', 'INVALID_AMOUNT', null, 400)
    }

    const service = req.app.locals.services.getService('asset_conversion_rule')
    const preview = await service.previewConvert(userId, from_asset_code, to_asset_code, amount)

    return res.apiSuccess(preview, '预览转换结果成功')
  })
)

/**
 * @route POST /api/v4/assets/conversion/convert
 * @desc 执行资产转换（需要幂等键）
 * @access Private（需要登录 + 敏感操作验证）
 *
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {string} from_asset_code - 源资产代码
 * @body {string} to_asset_code - 目标资产代码
 * @body {number} from_amount - 源资产数量
 */
router.post(
  '/convert',
  authenticateToken,
  requireValidSession,
  asyncHandler(async (req, res) => {
    const { from_asset_code, to_asset_code, from_amount } = req.body
    const userId = req.user.user_id

    /* 幂等键校验 */
    const idempotencyKey = req.headers['idempotency-key']
    if (!idempotencyKey) {
      return res.apiError('缺少幂等键 Idempotency-Key', 'MISSING_IDEMPOTENCY_KEY', null, 400)
    }

    /* 参数校验 */
    if (!from_asset_code || !to_asset_code) {
      return res.apiError(
        '缺少必填参数：from_asset_code, to_asset_code',
        'MISSING_PARAMS',
        null,
        400
      )
    }

    const amount = parseInt(from_amount, 10)
    if (!amount || amount <= 0) {
      return res.apiError('from_amount 必须为正整数', 'INVALID_AMOUNT', null, 400)
    }

    /* 通过 TransactionManager 执行转换 */
    const service = req.app.locals.services.getService('asset_conversion_rule')
    const result = await TransactionManager.execute(async transaction => {
      return service.executeConvert(
        userId,
        from_asset_code,
        to_asset_code,
        amount,
        idempotencyKey,
        { transaction }
      )
    })

    const message = result.is_duplicate ? '转换已完成（重复请求）' : '转换成功'
    return res.apiSuccess(result, message)
  })
)

module.exports = router
