/**
 * 材料系统运营管理服务（MaterialManagementService）
 *
 * 业务场景：
 * - 管理员维护材料资产类型（material_asset_types）
 * - 管理员维护材料转换规则（material_conversion_rules，版本化 effective_at）
 *
 * 架构约束（强制）：
 * - 路由层禁止直接访问 models；写操作必须收口到 Service
 * - 规则风控校验（循环拦截/套利闭环）在 Service 中执行（保存/启用时触发）
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 命名与语义：
 * - API 参数使用 snake_case（如 from_asset_code/to_asset_code/effective_at）
 * - "版本化"意味着：改比例必须新增规则（禁止 UPDATE 覆盖历史），禁用仅允许修改 is_enabled
 *
 * 创建时间：2025年12月
 * 最后更新：2026年01月05日（事务边界治理改造）
 */

'use strict'

const { MaterialConversionRule, MaterialAssetType, User } = require('../models')
const MaterialConversionValidator = require('../utils/materialConversionValidator')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

/**
 * 材料系统运营管理服务
 */
class MaterialManagementService {
  /**
   * 抛出带业务错误码与HTTP状态码的错误（供路由层统一映射为 res.apiError）
   *
   * @param {number} status_code - HTTP状态码（如 400/404/409/422）
   * @param {string} error_code - 业务错误码（snake_case）
   * @param {string} message - 错误消息（中文）
   * @param {Object|null} details - 附加信息（可选）
   * @returns {never} 直接抛错
   */
  static _throw(status_code, error_code, message, details = null) {
    const err = new Error(message)
    err.status_code = status_code
    err.error_code = error_code
    err.details = details
    throw err
  }

  /**
   * 查询材料转换规则列表（管理员）
   *
   * @param {Object} query - 查询参数（来自路由层 req.query）
   * @param {string} [query.from_asset_code] - 源资产代码
   * @param {string} [query.to_asset_code] - 目标资产代码
   * @param {string|boolean} [query.is_enabled] - 是否启用（true/false）
   * @param {number|string} [query.page=1] - 页码
   * @param {number|string} [query.page_size=20] - 每页数量
   * @returns {Promise<Object>} 查询结果
   */
  static async listConversionRules(query = {}) {
    const { from_asset_code, to_asset_code, is_enabled, page = 1, page_size = 20 } = query

    const where = {}
    if (from_asset_code) where.from_asset_code = from_asset_code
    if (to_asset_code) where.to_asset_code = to_asset_code
    if (is_enabled !== undefined) where.is_enabled = is_enabled === true || is_enabled === 'true'

    const limit = Math.min(Math.max(parseInt(page_size) || 20, 1), 100)
    const current_page = Math.max(parseInt(page) || 1, 1)
    const offset = (current_page - 1) * limit

    const { count, rows } = await MaterialConversionRule.findAndCountAll({
      where,
      order: [
        ['effective_at', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit,
      offset,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false
        }
      ]
    })

    return {
      rules: rows.map(r => r.toJSON()),
      pagination: {
        total: count,
        page: current_page,
        page_size: limit,
        total_pages: Math.ceil(count / limit)
      }
    }
  }

  /**
   * 创建材料转换规则（管理员）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 强约束：
   * - 改比例必须新增规则（禁止 UPDATE 覆盖历史）
   * - 保存时触发风控校验：循环拦截 + 套利闭环检测
   *
   * @param {Object} payload - 规则内容
   * @param {string} payload.from_asset_code - 源资产代码
   * @param {string} payload.to_asset_code - 目标资产代码
   * @param {number|string} payload.from_amount - 源资产数量
   * @param {number|string} payload.to_amount - 目标资产数量
   * @param {string|Date} payload.effective_at - 生效时间（ISO8601字符串或Date）
   * @param {boolean|string} [payload.is_enabled=true] - 是否启用
   * @param {number} created_by - 创建人 user_id（管理员）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 创建结果
   */
  static async createConversionRule(payload, created_by, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'MaterialManagementService.createConversionRule'
    )

    const {
      from_asset_code,
      to_asset_code,
      from_amount,
      to_amount,
      effective_at,
      is_enabled = true
    } = payload || {}

    if (!from_asset_code || !to_asset_code) {
      this._throw(400, 'missing_params', '缺少必填参数：from_asset_code 和 to_asset_code')
    }
    if (!from_amount || parseInt(from_amount) <= 0) {
      this._throw(400, 'invalid_from_amount', 'from_amount 必须大于0')
    }
    if (!to_amount || parseInt(to_amount) <= 0) {
      this._throw(400, 'invalid_to_amount', 'to_amount 必须大于0')
    }
    if (!effective_at) {
      this._throw(400, 'missing_effective_at', '缺少必填参数：effective_at（生效时间）')
    }

    const effectiveDate = effective_at instanceof Date ? effective_at : new Date(effective_at)
    if (isNaN(effectiveDate.getTime())) {
      this._throw(
        400,
        'invalid_date_format',
        'effective_at 格式无效（请使用 ISO8601 格式，如 2025-12-20T00:00:00.000+08:00）'
      )
    }

    // 🔴 风控校验：循环拦截 + 套利闭环检测（保存/启用时触发）
    const tempRule = {
      from_asset_code,
      to_asset_code,
      from_amount: parseInt(from_amount),
      to_amount: parseInt(to_amount),
      effective_at: effectiveDate,
      is_enabled: is_enabled === true || is_enabled === 'true',
      rule_id: null
    }
    const validationResult = await MaterialConversionValidator.validate(tempRule, { transaction })
    if (!validationResult.valid) {
      this._throw(
        422,
        'risk_validation_failed',
        `风控校验失败：${validationResult.errors.join(' | ')}`,
        { errors: validationResult.errors }
      )
    }

    const rule = await MaterialConversionRule.create(
      {
        from_asset_code,
        to_asset_code,
        from_amount: parseInt(from_amount),
        to_amount: parseInt(to_amount),
        effective_at: effectiveDate,
        is_enabled: is_enabled === true || is_enabled === 'true',
        created_by
      },
      { transaction }
    )

    return {
      rule: rule.toJSON(),
      conversion_rate: parseInt(to_amount) / parseInt(from_amount)
    }
  }

  /**
   * 禁用材料转换规则（管理员）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 强约束：
   * - 禁止 UPDATE 覆盖 from_amount/to_amount/effective_at
   * - 只允许修改 is_enabled=false（禁用）
   *
   * @param {number|string} rule_id - 规则ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 禁用结果
   */
  static async disableConversionRule(rule_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'MaterialManagementService.disableConversionRule'
    )

    const rule = await MaterialConversionRule.findByPk(rule_id, { transaction })
    if (!rule) {
      this._throw(404, 'rule_not_found', '规则不存在')
    }
    if (!rule.is_enabled) {
      this._throw(400, 'rule_already_disabled', '规则已经禁用')
    }

    await rule.update({ is_enabled: false }, { transaction })
    return { rule: rule.toJSON() }
  }

  /**
   * 查询材料资产类型列表（管理员）
   *
   * @param {Object} query - 查询参数
   * @param {string} [query.group_code] - 分组代码
   * @param {string|boolean} [query.is_enabled] - 是否启用
   * @returns {Promise<Object>} 查询结果
   */
  static async listAssetTypes(query = {}) {
    const { group_code, is_enabled } = query
    const where = {}
    if (group_code) where.group_code = group_code
    if (is_enabled !== undefined) where.is_enabled = is_enabled === true || is_enabled === 'true'

    const assetTypes = await MaterialAssetType.findAll({
      where,
      order: [
        ['sort_order', 'ASC'],
        ['tier', 'ASC'],
        ['created_at', 'ASC']
      ]
    })

    return { asset_types: assetTypes.map(t => t.toJSON()) }
  }

  /**
   * 创建材料资产类型（管理员）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {Object} payload - 资产类型内容
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 创建结果
   */
  static async createAssetType(payload, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'MaterialManagementService.createAssetType'
    )

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
    } = payload || {}

    if (!asset_code || !display_name || !group_code || !form || tier === undefined) {
      this._throw(
        400,
        'missing_params',
        '缺少必填参数：asset_code/display_name/group_code/form/tier'
      )
    }
    if (!['shard', 'crystal'].includes(form)) {
      this._throw(400, 'invalid_form', 'form 必须为 shard 或 crystal')
    }

    const existing = await MaterialAssetType.findOne({ where: { asset_code }, transaction })
    if (existing) {
      this._throw(409, 'asset_code_exists', `资产代码 ${asset_code} 已存在`)
    }

    const assetType = await MaterialAssetType.create(
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

    return { asset_type: assetType.toJSON() }
  }

  /**
   * 禁用材料资产类型（管理员）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {string} asset_code - 资产代码
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 禁用结果
   */
  static async disableAssetType(asset_code, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'MaterialManagementService.disableAssetType'
    )

    const assetType = await MaterialAssetType.findOne({ where: { asset_code }, transaction })
    if (!assetType) {
      this._throw(404, 'asset_type_not_found', '材料资产类型不存在')
    }
    if (!assetType.is_enabled) {
      this._throw(400, 'asset_type_already_disabled', '材料资产类型已经禁用')
    }

    await assetType.update({ is_enabled: false }, { transaction })
    return { asset_type: assetType.toJSON() }
  }

  /**
   * 获取所有材料资产类型用于交易配置（管理后台）
   *
   * 业务场景：
   * - 管理后台查看所有材料资产的交易配置
   * - 包含黑名单检查和有效交易状态计算
   *
   * @returns {Promise<Array>} 资产类型配置列表
   */
  static async getAllAssetTypesForTradeConfig() {
    const assets = await MaterialAssetType.findAll({
      attributes: [
        'asset_code',
        'display_name',
        'group_code',
        'form',
        'tier',
        'is_tradable',
        'is_enabled',
        'sort_order'
      ],
      order: [
        ['sort_order', 'ASC'],
        ['asset_code', 'ASC']
      ]
    })

    return assets.map(asset => asset.toJSON())
  }
}

module.exports = MaterialManagementService
