/**
 * @file 管理员材料资产管理路由（Phase 2 - P1-4 恢复功能）
 * @description 材料转换规则管理接口（版本化 + 风控校验）
 *
 * 业务场景：
 * - 材料转换规则新增（版本化，禁止 UPDATE 覆盖历史）
 * - 材料转换规则禁用（is_enabled = false）
 * - 材料转换规则查询（支持历史版本查询）
 * - 风控校验：循环拦截 + 套利闭环检测（保存/启用时触发）
 *
 * 硬约束（来自文档）：
 * - **版本化强约束**：改比例/费率必须新增规则（禁止 UPDATE 覆盖历史）
 * - 通过 effective_at 生效时间控制规则切换
 * - 历史流水可通过 effective_at 回放计算依据，确保可审计/可解释
 * - **风控校验（保存/启用时触发）**：
 *   - 循环拦截：不得出现 A→B→...→A 的闭环路径
 *   - 套利拦截：不得出现"沿环路换一圈资产数量不减反增"（负环检测）
 *
 * 创建时间：2025-12-15
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
// const { Op } = require('sequelize') // 预留未来使用

/**
 * 查询材料转换规则列表（管理员）
 * GET /api/v4/admin/material/conversion-rules
 *
 * Query参数：
 * - from_asset_code: 源资产代码（可选）
 * - to_asset_code: 目标资产代码（可选）
 * - is_enabled: 是否启用（可选，true/false）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：规则列表（含版本化信息）
 */
router.get('/conversion-rules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { from_asset_code, to_asset_code, is_enabled, page = 1, page_size = 20 } = req.query

    // ✅ 路由层不直连 models：通过 ServiceManager 获取运营管理服务
    const MaterialManagementService = req.app.locals.services.getService('materialManagement')
    const result = await MaterialManagementService.listConversionRules({
      from_asset_code,
      to_asset_code,
      is_enabled,
      page,
      page_size
    })

    return res.apiSuccess(result, '查询材料转换规则成功')
  } catch (error) {
    return res.apiError(
      `查询材料转换规则失败：${error.message}`,
      error.error_code || 'query_rules_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

/**
 * 创建材料转换规则（管理员）
 * POST /api/v4/admin/material/conversion-rules
 *
 * Body参数（必填）：
 * - from_asset_code: 源资产代码（如 'red_shard'）
 * - to_asset_code: 目标资产代码（如 'DIAMOND'）
 * - from_amount: 源资产数量（如 1）
 * - to_amount: 目标资产数量（如 20）
 * - effective_at: 生效时间（ISO8601格式，如 '2025-12-20T00:00:00.000+08:00'）
 * - is_enabled: 是否启用（默认 true）
 *
 * 硬约束：
 * - **版本化**：改比例必须新增规则（不得 UPDATE 覆盖历史）
 * - **风控校验**：保存时触发循环拦截和套利闭环检测
 *
 * 返回：创建的规则信息
 */
router.post('/conversion-rules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      from_asset_code,
      to_asset_code,
      from_amount,
      to_amount,
      effective_at,
      is_enabled = true
    } = req.body

    // 参数验证
    if (!from_asset_code || !to_asset_code) {
      return res.apiError(
        '缺少必填参数：from_asset_code 和 to_asset_code',
        'MISSING_PARAMS',
        null,
        400
      )
    }

    if (!from_amount || from_amount <= 0) {
      return res.apiError('from_amount 必须大于0', 'INVALID_FROM_AMOUNT', null, 400)
    }

    if (!to_amount || to_amount <= 0) {
      return res.apiError('to_amount 必须大于0', 'INVALID_TO_AMOUNT', null, 400)
    }

    if (!effective_at) {
      return res.apiError(
        '缺少必填参数：effective_at（生效时间）',
        'MISSING_EFFECTIVE_AT',
        null,
        400
      )
    }

    // 验证生效时间格式
    const effectiveDate = new Date(effective_at)
    if (isNaN(effectiveDate.getTime())) {
      return res.apiError(
        'effective_at 格式无效（请使用 ISO8601 格式，如 2025-12-20T00:00:00.000+08:00）',
        'INVALID_DATE_FORMAT',
        null,
        400
      )
    }

    // ✅ 路由层只做参数校验，业务逻辑/风控校验/事务由 Service 统一处理
    const MaterialManagementService = req.app.locals.services.getService('materialManagement')
    const result = await MaterialManagementService.createConversionRule(
      {
        from_asset_code,
        to_asset_code,
        from_amount: parseInt(from_amount),
        to_amount: parseInt(to_amount),
        effective_at: effectiveDate,
        is_enabled: is_enabled === true || is_enabled === 'true'
      },
      req.user.user_id
    )

    return res.apiSuccess(result, '创建材料转换规则成功')
  } catch (error) {
    return res.apiError(
      `创建材料转换规则失败：${error.message}`,
      error.error_code || 'create_rule_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

/**
 * 禁用材料转换规则（管理员）
 * PUT /api/v4/admin/material/conversion-rules/:rule_id/disable
 *
 * 硬约束：
 * - 禁止 UPDATE 覆盖 from_amount/to_amount/effective_at
 * - 只允许修改 is_enabled 为 false（禁用）
 * - 不允许删除规则（保留历史用于审计）
 *
 * 返回：更新后的规则信息
 */
router.put(
  '/conversion-rules/:rule_id/disable',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { rule_id } = req.params
      const MaterialManagementService = req.app.locals.services.getService('materialManagement')
      const result = await MaterialManagementService.disableConversionRule(rule_id)
      return res.apiSuccess(result, '禁用材料转换规则成功')
    } catch (error) {
      return res.apiError(
        `禁用材料转换规则失败：${error.message}`,
        error.error_code || 'disable_rule_failed',
        error.details || null,
        error.status_code || 500
      )
    }
  }
)

/**
 * 查询材料资产类型列表（管理员）
 * GET /api/v4/admin/material/asset-types
 *
 * Query参数：
 * - group_code: 分组代码（可选）
 * - is_enabled: 是否启用（可选）
 *
 * 返回：材料资产类型列表
 */
router.get('/asset-types', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { group_code, is_enabled } = req.query
    const MaterialManagementService = req.app.locals.services.getService('materialManagement')
    const result = await MaterialManagementService.listAssetTypes({ group_code, is_enabled })
    return res.apiSuccess(result, '查询材料资产类型成功')
  } catch (error) {
    return res.apiError(
      `查询材料资产类型失败：${error.message}`,
      error.error_code || 'query_asset_types_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

/**
 * 创建材料资产类型（管理员）
 * POST /api/v4/admin/material/asset-types
 *
 * Body参数（必填）：
 * - asset_code: 资产代码（如 'red_shard'，必须唯一）
 * - display_name: 展示名称（如 '红色碎片'）
 * - group_code: 分组代码（如 'red'）
 * - form: 形态（'shard' 或 'crystal'）
 * - tier: 层级（数字，如 1）
 * - sort_order: 排序权重（数字，默认0）
 * - is_enabled: 是否启用（默认 true）
 *
 * 返回：创建的材料资产类型信息
 */
router.post('/asset-types', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      asset_code,
      display_name,
      group_code,
      form,
      tier,
      sort_order = 0,
      visible_value_points,
      budget_value_points,
      is_enabled = true
    } = req.body

    // 参数验证
    if (!asset_code || !display_name || !group_code || !form || tier === undefined) {
      return res.apiError(
        '缺少必填参数：asset_code/display_name/group_code/form/tier',
        'MISSING_PARAMS',
        null,
        400
      )
    }

    if (!['shard', 'crystal'].includes(form)) {
      return res.apiError('form 必须为 shard 或 crystal', 'INVALID_FORM', null, 400)
    }

    const MaterialManagementService = req.app.locals.services.getService('materialManagement')
    const result = await MaterialManagementService.createAssetType({
      asset_code,
      display_name,
      group_code,
      form,
      tier: parseInt(tier),
      sort_order: parseInt(sort_order),
      visible_value_points: visible_value_points ? parseInt(visible_value_points) : null,
      budget_value_points: budget_value_points ? parseInt(budget_value_points) : null,
      is_enabled: is_enabled === true || is_enabled === 'true'
    })

    return res.apiSuccess(result, '创建材料资产类型成功')
  } catch (error) {
    return res.apiError(
      `创建材料资产类型失败：${error.message}`,
      error.error_code || 'create_asset_type_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

/**
 * 禁用材料资产类型（管理员）
 * PUT /api/v4/admin/material/asset-types/:asset_code/disable
 *
 * 返回：更新后的材料资产类型信息
 */
router.put(
  '/asset-types/:asset_code/disable',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { asset_code } = req.params
      const MaterialManagementService = req.app.locals.services.getService('materialManagement')
      const result = await MaterialManagementService.disableAssetType(asset_code)
      return res.apiSuccess(result, '禁用材料资产类型成功')
    } catch (error) {
      return res.apiError(
        `禁用材料资产类型失败：${error.message}`,
        error.error_code || 'disable_asset_type_failed',
        error.details || null,
        error.status_code || 500
      )
    }
  }
)

module.exports = router
