/**
 * @file 管理员材料资产管理路由
 * @description 材料资产类型管理接口
 *
 * 业务场景：
 * - 材料资产类型 CRUD（创建、编辑、禁用）
 *
 * ⚠️ 转换规则管理已合并到 /api/v4/console/assets/conversion-rules（2026-04-05）
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 通过 ServiceManager 统一获取服务实例
 *
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const { asyncHandler } = require('../../../../middleware/validation')

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
router.get('/asset-types', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const { group_code, is_enabled } = req.query
  const MaterialManagementService = req.app.locals.services.getService('material_management')
  const result = await MaterialManagementService.listAssetTypes({ group_code, is_enabled })
  return res.apiSuccess(result, '查询材料资产类型成功')
}))

/**
 * 获取单个材料资产类型详情（管理员）
 * GET /api/v4/console/material/asset-types/:code
 *
 * @description 配置实体使用业务码（:code）作为标识符
 * @param {string} code - 资产类型代码（如 red_core_shard、star_stone）
 *
 * API路径参数设计规范 V2.2：
 * - 配置实体使用 :code 占位符
 * - 业务码格式：snake_case 或 UPPER_SNAKE
 *
 * 返回：材料资产类型详情
 */
router.get('/asset-types/:code', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const asset_code = req.params.code
  const MaterialManagementService = req.app.locals.services.getService('material_management')
  const result = await MaterialManagementService.getAssetTypeByCode(asset_code)
  return res.apiSuccess(result, '获取材料资产类型详情成功')
}))

/**
 * 创建材料资产类型（管理员）
 * POST /api/v4/console/material/asset-types
 *
 * Body参数（必填）：
 * - asset_code: 资产代码（如 'red_core_shard'，必须唯一）
 * - display_name: 展示名称（如 '红源晶碎片'）
 * - group_code: 分组代码（如 'red'）
 * - form: 形态（'shard' 或 'crystal'）
 * - tier: 层级（数字，如 1）
 * - sort_order: 排序权重（数字，默认0）
 * - is_enabled: 是否启用（默认 true）
 *
 * 返回：创建的材料资产类型信息
 */
router.post('/asset-types', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const {
    asset_code,
    display_name,
    group_code,
    form,
    tier,
    sort_order = 0,
    visible_value_points,
    budget_value_points,
    is_enabled = true,
    icon_media_id
  } = req.body

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
          is_enabled: is_enabled === true || is_enabled === 'true',
          icon_media_id: icon_media_id || null
        },
        { transaction }
      )
    },
    { description: 'createAssetType' }
  )

  return res.apiSuccess(result, '创建材料资产类型成功')
}))

/**
 * 更新材料资产类型（管理员）
 * PUT /api/v4/console/material/asset-types/:code
 *
 * @description 配置实体使用业务码（:code）作为标识符
 * @param {string} code - 资产类型代码（如 red_core_shard、star_stone）
 *
 * API路径参数设计规范 V2.2：
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
router.put('/asset-types/:code', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
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
    is_tradable,
    icon_media_id
  } = req.body

  if (form !== undefined && !['shard', 'crystal'].includes(form)) {
    return res.apiError('form 必须为 shard 或 crystal', 'INVALID_FORM', null, 400)
  }

  const MaterialManagementService = req.app.locals.services.getService('material_management')

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
          is_tradable,
          icon_media_id
        },
        { transaction }
      )
    },
    { description: 'updateAssetType' }
  )

  return res.apiSuccess(result, '更新材料资产类型成功')
}))

/**
 * 禁用材料资产类型（管理员）
 * PUT /api/v4/console/material/asset-types/:code/disable
 *
 * @description 配置实体使用业务码（:code）作为标识符
 * @param {string} code - 资产类型代码（如 red_core_shard、star_stone）
 *
 * API路径参数设计规范 V2.2：
 * - 配置实体使用 :code 占位符
 * - 业务码格式：snake_case 或 UPPER_SNAKE
 *
 * 返回：更新后的材料资产类型信息
 */
router.put(
  '/asset-types/:code/disable',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
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
}))

module.exports = router
