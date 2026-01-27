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
 * 事务边界治理（2026-01-05 决策）：
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 通过 ServiceManager 统一获取服务实例
 *
 * 创建时间：2025-12-15
 * 更新时间：2026-01-05（事务边界治理改造）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const TransactionManager = require('../../../utils/TransactionManager')
// const { Op } = require('sequelize') // 预留未来使用

/**
 * 查询材料转换规则列表（管理员）
 * GET /api/v4/console/material/conversion-rules
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
router.get('/conversion-rules', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { from_asset_code, to_asset_code, is_enabled, page = 1, page_size = 20 } = req.query

    // ✅ 路由层不直连 models：通过 ServiceManager 获取运营管理服务
    const MaterialManagementService = req.app.locals.services.getService('material_management')
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
 * 获取单个材料转换规则详情（管理员）
 * GET /api/v4/console/material/conversion-rules/:id
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 转换规则是事务实体（高频创建），使用数字ID（:id）作为标识符
 *
 * 返回：规则详情
 */
router.get('/conversion-rules/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const rule_id = parseInt(req.params.id, 10)
    if (isNaN(rule_id) || rule_id <= 0) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const MaterialManagementService = req.app.locals.services.getService('material_management')
    const result = await MaterialManagementService.getConversionRuleById(rule_id)

    return res.apiSuccess(result, '获取材料转换规则详情成功')
  } catch (error) {
    return res.apiError(
      `获取材料转换规则详情失败：${error.message}`,
      error.error_code || 'get_rule_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

/**
 * 创建材料转换规则（管理员）
 * POST /api/v4/console/material/conversion-rules
 *
 * Body参数（必填）：
 * - from_asset_code: 源资产代码（如 'red_shard'）
 * - to_asset_code: 目标资产代码（如 'DIAMOND'）
 * - from_amount: 源资产数量（如 1）
 * - to_amount: 目标资产数量（如 20）
 * - effective_at: 生效时间（ISO8601格式，如 '2025-12-20T00:00:00.000+08:00'）
 * - is_enabled: 是否启用（默认 true）
 *
 * Body参数（可选 - 2026-01-14 扩展字段）：
 * - min_from_amount: 最小转换数量（默认1）
 * - max_from_amount: 最大转换数量（null=无上限）
 * - fee_rate: 手续费费率（如 0.05 = 5%，默认0）
 * - fee_min_amount: 最低手续费（默认0）
 * - fee_asset_code: 手续费资产类型（默认与目标资产相同）
 * - title: 规则标题（前端展示）
 * - description: 规则描述
 * - display_icon: 展示图标URL
 * - risk_level: 风险等级（low/medium/high，默认low）
 * - is_visible: 是否前端可见（默认true）
 * - rounding_mode: 舍入模式（floor/ceil/round，默认floor）
 *
 * 硬约束：
 * - **版本化**：改比例必须新增规则（不得 UPDATE 覆盖历史）
 * - **风控校验**：保存时触发循环拦截和套利闭环检测
 *
 * 返回：创建的规则信息
 */
router.post('/conversion-rules', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      // 必填字段
      from_asset_code,
      to_asset_code,
      from_amount,
      to_amount,
      effective_at,
      is_enabled = true,
      // 2026-01-14 扩展字段（可选）
      min_from_amount,
      max_from_amount,
      fee_rate,
      fee_min_amount,
      fee_asset_code,
      title,
      description,
      display_icon,
      risk_level,
      is_visible,
      rounding_mode
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

    // ✅ 路由层只做参数校验，业务逻辑/风控校验由 Service 统一处理
    const MaterialManagementService = req.app.locals.services.getService('material_management')

    // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
    const result = await TransactionManager.execute(
      async transaction => {
        return await MaterialManagementService.createConversionRule(
          {
            // 必填字段
            from_asset_code,
            to_asset_code,
            from_amount: parseInt(from_amount),
            to_amount: parseInt(to_amount),
            effective_at: effectiveDate,
            is_enabled: is_enabled === true || is_enabled === 'true',
            // 2026-01-14 扩展字段（可选，Service 层有默认值）
            min_from_amount,
            max_from_amount,
            fee_rate,
            fee_min_amount,
            fee_asset_code,
            title,
            description,
            display_icon,
            risk_level,
            is_visible,
            rounding_mode
          },
          req.user.user_id,
          { transaction }
        )
      },
      { description: 'createConversionRule' }
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
 * PUT /api/v4/console/material/conversion-rules/:id/disable
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 转换规则是事务实体（高频创建），使用数字ID（:id）作为标识符
 *
 * 硬约束：
 * - 禁止 UPDATE 覆盖 from_amount/to_amount/effective_at
 * - 只允许修改 is_enabled 为 false（禁用）
 * - 不允许删除规则（保留历史用于审计）
 *
 * 返回：更新后的规则信息
 */
router.put('/conversion-rules/:id/disable', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const rule_id = parseInt(req.params.id, 10)
    const MaterialManagementService = req.app.locals.services.getService('material_management')

    // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
    const result = await TransactionManager.execute(
      async transaction => {
        return await MaterialManagementService.disableConversionRule(rule_id, { transaction })
      },
      { description: 'disableConversionRule' }
    )

    return res.apiSuccess(result, '禁用材料转换规则成功')
  } catch (error) {
    return res.apiError(
      `禁用材料转换规则失败：${error.message}`,
      error.error_code || 'disable_rule_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

/**
 * 查询材料资产类型列表（管理员）
 * GET /api/v4/console/material/asset-types
 *
 * Query参数：
 * - group_code: 分组代码（可选）
 * - is_enabled: 是否启用（可选）
 *
 * 返回：材料资产类型列表
 */
router.get('/asset-types', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { group_code, is_enabled } = req.query
    const MaterialManagementService = req.app.locals.services.getService('material_management')
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
 * 获取单个材料资产类型详情（管理员）
 * GET /api/v4/console/material/asset-types/:code
 *
 * @description 配置实体使用业务码（:code）作为标识符
 * @param {string} code - 资产类型代码（如 red_shard、DIAMOND）
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 配置实体使用 :code 占位符
 * - 业务码格式：snake_case 或 UPPER_SNAKE
 *
 * 返回：材料资产类型详情
 */
router.get('/asset-types/:code', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const asset_code = req.params.code
    const MaterialManagementService = req.app.locals.services.getService('material_management')
    const result = await MaterialManagementService.getAssetTypeByCode(asset_code)
    return res.apiSuccess(result, '获取材料资产类型详情成功')
  } catch (error) {
    return res.apiError(
      `获取材料资产类型详情失败：${error.message}`,
      error.error_code || 'get_asset_type_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

/**
 * 创建材料资产类型（管理员）
 * POST /api/v4/console/material/asset-types
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
router.post('/asset-types', authenticateToken, requireRoleLevel(100), async (req, res) => {
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

    const MaterialManagementService = req.app.locals.services.getService('material_management')

    // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
    const result = await TransactionManager.execute(
      async transaction => {
        return await MaterialManagementService.createAssetType(
          {
            asset_code,
            display_name,
            group_code,
            form,
            tier: parseInt(tier),
            sort_order: parseInt(sort_order),
            visible_value_points: visible_value_points ? parseInt(visible_value_points) : null,
            budget_value_points: budget_value_points ? parseInt(budget_value_points) : null,
            is_enabled: is_enabled === true || is_enabled === 'true'
          },
          { transaction }
        )
      },
      { description: 'createAssetType' }
    )

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
 * 更新材料资产类型（管理员）
 * PUT /api/v4/console/material/asset-types/:code
 *
 * @description 配置实体使用业务码（:code）作为标识符
 * @param {string} code - 资产类型代码（如 red_shard、DIAMOND）
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 配置实体使用 :code 占位符
 * - 对应 CANONICAL_OPERATION_MAP: 'ADMIN_MATERIAL_TYPE_UPDATE'
 *
 * Body参数（可选，至少提供一个）：
 * - display_name: 展示名称
 * - group_code: 分组代码
 * - form: 形态（shard/crystal）
 * - tier: 层级
 * - sort_order: 排序权重
 * - visible_value_points: 显示价值积分
 * - budget_value_points: 预算价值积分
 * - is_enabled: 是否启用
 * - is_tradable: 是否可交易
 *
 * 业务约束：
 * - asset_code 不可更新（是配置实体的唯一标识符）
 *
 * 返回：更新后的材料资产类型信息
 */
router.put('/asset-types/:code', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // 配置实体使用业务码作为标识符
    const asset_code = req.params.code
    const {
      display_name,
      group_code,
      form,
      tier,
      sort_order,
      visible_value_points,
      budget_value_points,
      is_enabled,
      is_tradable
    } = req.body

    // form 字段验证
    if (form !== undefined && !['shard', 'crystal'].includes(form)) {
      return res.apiError('form 必须为 shard 或 crystal', 'INVALID_FORM', null, 400)
    }

    const MaterialManagementService = req.app.locals.services.getService('material_management')

    // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
    const result = await TransactionManager.execute(
      async transaction => {
        return await MaterialManagementService.updateAssetType(
          asset_code,
          {
            display_name,
            group_code,
            form,
            tier,
            sort_order,
            visible_value_points,
            budget_value_points,
            is_enabled,
            is_tradable
          },
          { transaction }
        )
      },
      { description: 'updateAssetType' }
    )

    return res.apiSuccess(result, '更新材料资产类型成功')
  } catch (error) {
    return res.apiError(
      `更新材料资产类型失败：${error.message}`,
      error.error_code || 'update_asset_type_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

/**
 * 禁用材料资产类型（管理员）
 * PUT /api/v4/console/material/asset-types/:code/disable
 *
 * @description 配置实体使用业务码（:code）作为标识符
 * @param {string} code - 资产类型代码（如 red_shard、DIAMOND）
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 配置实体使用 :code 占位符
 * - 业务码格式：snake_case 或 UPPER_SNAKE
 *
 * 返回：更新后的材料资产类型信息
 */
router.put('/asset-types/:code/disable', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // 配置实体使用业务码作为标识符
    const asset_code = req.params.code
    const MaterialManagementService = req.app.locals.services.getService('material_management')

    // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
    const result = await TransactionManager.execute(
      async transaction => {
        return await MaterialManagementService.disableAssetType(asset_code, { transaction })
      },
      { description: 'disableAssetType' }
    )

    return res.apiSuccess(result, '禁用材料资产类型成功')
  } catch (error) {
    return res.apiError(
      `禁用材料资产类型失败：${error.message}`,
      error.error_code || 'disable_asset_type_failed',
      error.details || null,
      error.status_code || 500
    )
  }
})

module.exports = router
