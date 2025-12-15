/**
 * 餐厅积分抽奖系统 V4.5 - 材料系统管理API（管理员侧）
 * 处理材料资产类型管理、转换规则管理、余额调整等功能
 *
 * 功能说明：
 * - 材料资产类型管理（创建、更新、查询）
 * - 材料转换规则管理（创建、更新、查询、风控校验）
 * - 查询用户材料余额
 * - 管理员调整用户材料余额
 * - 查询材料流水
 *
 * 业务规则（强制）：
 * - ✅ 新增/启用规则时必须做风控校验（防循环、防套利）
 * - ✅ 管理员调整余额必须携带幂等键（business_id）
 * - ✅ 所有写操作必须记录操作日志
 * - ❌ 禁止删除已使用的资产类型（外键约束保护）
 * - ❌ 禁止删除已使用的转换规则（应禁用而非删除）
 *
 * 创建时间：2025年12月15日
 * 参考文档：/docs/材料系统（碎片-水晶）方案.md 第12节
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const Logger = require('../../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('MaterialAdminAPI')

// ==================== 材料资产类型管理 ====================

/**
 * 查询材料资产类型列表
 * GET /api/v4/admin/material/asset-types
 *
 * @description 查询所有材料资产类型（包括已禁用的）
 * @query {number} is_enabled - 可选，是否启用（1=启用，0=禁用）
 * @query {string} group_code - 可选，材料组代码过滤（red/orange/purple等）
 * @returns {Array} asset_types - 资产类型列表
 */
router.get('/asset-types', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const { is_enabled, group_code } = req.query

    logger.info('管理员查询材料资产类型', {
      admin_id: req.user.user_id,
      is_enabled,
      group_code
    })

    // 调用Service查询资产类型
    const asset_types = await MaterialService.getAssetTypes({
      is_enabled: is_enabled !== undefined ? parseInt(is_enabled) : undefined,
      group_code
    })

    logger.info('查询材料资产类型成功', {
      admin_id: req.user.user_id,
      count: asset_types.length
    })

    return res.apiSuccess(
      { asset_types },
      '查询材料资产类型成功'
    )
  } catch (error) {
    logger.error('查询材料资产类型失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询材料资产类型失败')
  }
})

/**
 * 创建材料资产类型
 * POST /api/v4/admin/material/asset-types
 *
 * @description 创建新的材料资产类型（如：紫碎片、紫水晶等）
 * @body {string} asset_code - 必填，资产代码（如：purple_shard）
 * @body {string} display_name - 必填，展示名称（如：紫碎片）
 * @body {string} group_code - 必填，材料组代码（如：purple）
 * @body {string} form - 必填，形态（shard/crystal）
 * @body {number} tier - 必填，层级（红=1、橙=2、紫=3等）
 * @body {number} visible_value_points - 必填，可见价值
 * @body {number} budget_value_points - 必填，预算价值
 * @body {number} sort_order - 可选，排序顺序（默认0）
 */
router.post('/asset-types', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const admin_id = req.user.user_id

    const {
      asset_code,
      display_name,
      group_code,
      form,
      tier,
      visible_value_points,
      budget_value_points,
      sort_order = 0
    } = req.body

    // 参数验证
    if (!asset_code || !display_name || !group_code || !form || tier === undefined ||
        visible_value_points === undefined || budget_value_points === undefined) {
      return res.apiError(
        '缺少必填参数：asset_code、display_name、group_code、form、tier、visible_value_points、budget_value_points',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // form白名单验证
    const validForms = ['shard', 'crystal']
    if (!validForms.includes(form)) {
      return res.apiError(
        `无效的form参数，允许值：${validForms.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    logger.info('管理员创建材料资产类型', {
      admin_id,
      asset_code,
      display_name,
      group_code,
      form,
      tier
    })

    // 调用Service创建资产类型
    const result = await MaterialService.createAssetType({
      asset_code,
      display_name,
      group_code,
      form,
      tier: parseInt(tier),
      visible_value_points: parseInt(visible_value_points),
      budget_value_points: parseInt(budget_value_points),
      sort_order: parseInt(sort_order),
      created_by: admin_id
    })

    logger.info('创建材料资产类型成功', {
      admin_id,
      asset_code
    })

    return res.apiSuccess(
      result,
      '创建材料资产类型成功'
    )
  } catch (error) {
    logger.error('创建材料资产类型失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      asset_code: req.body?.asset_code
    })
    return handleServiceError(error, res, '创建材料资产类型失败')
  }
})

/**
 * 更新材料资产类型
 * PUT /api/v4/admin/material/asset-types/:asset_code
 *
 * @description 更新材料资产类型的属性（不可更改asset_code本身）
 * @param {string} asset_code - 资产代码
 * @body {string} display_name - 可选，展示名称
 * @body {number} visible_value_points - 可选，可见价值
 * @body {number} budget_value_points - 可选，预算价值
 * @body {number} sort_order - 可选，排序顺序
 * @body {number} is_enabled - 可选，是否启用（0/1）
 */
router.put('/asset-types/:asset_code', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const admin_id = req.user.user_id
    const { asset_code } = req.params

    const {
      display_name,
      visible_value_points,
      budget_value_points,
      sort_order,
      is_enabled
    } = req.body

    logger.info('管理员更新材料资产类型', {
      admin_id,
      asset_code,
      updates: req.body
    })

    // 构建更新数据
    const updates = {}
    if (display_name !== undefined) updates.display_name = display_name
    if (visible_value_points !== undefined) updates.visible_value_points = parseInt(visible_value_points)
    if (budget_value_points !== undefined) updates.budget_value_points = parseInt(budget_value_points)
    if (sort_order !== undefined) updates.sort_order = parseInt(sort_order)
    if (is_enabled !== undefined) updates.is_enabled = parseInt(is_enabled)

    if (Object.keys(updates).length === 0) {
      return res.apiError(
        '至少需要提供一个要更新的字段',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 调用Service更新资产类型
    const result = await MaterialService.updateAssetType(asset_code, updates, admin_id)

    logger.info('更新材料资产类型成功', {
      admin_id,
      asset_code,
      updates
    })

    return res.apiSuccess(
      result,
      '更新材料资产类型成功'
    )
  } catch (error) {
    logger.error('更新材料资产类型失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      asset_code: req.params?.asset_code
    })
    return handleServiceError(error, res, '更新材料资产类型失败')
  }
})

// ==================== 材料转换规则管理 ====================

/**
 * 查询材料转换规则列表
 * GET /api/v4/admin/material/conversion-rules
 *
 * @description 查询所有材料转换规则（包括已禁用和未来生效的）
 * @query {string} from_asset_code - 可选，源资产代码过滤
 * @query {string} to_asset_code - 可选，目标资产代码过滤
 * @query {number} is_enabled - 可选，是否启用（1=启用，0=禁用）
 * @returns {Array} rules - 转换规则列表
 */
router.get('/conversion-rules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const { from_asset_code, to_asset_code, is_enabled } = req.query

    logger.info('管理员查询材料转换规则', {
      admin_id: req.user.user_id,
      from_asset_code,
      to_asset_code,
      is_enabled
    })

    // 调用Service查询规则（管理员可以看到所有规则，包括未来生效的）
    const rules = await MaterialService.getConversionRules({
      from_asset_code,
      to_asset_code,
      is_enabled: is_enabled !== undefined ? parseInt(is_enabled) : undefined,
      include_expired: true,
      include_future: true
    })

    logger.info('查询材料转换规则成功', {
      admin_id: req.user.user_id,
      count: rules.length
    })

    return res.apiSuccess(
      { rules },
      '查询材料转换规则成功'
    )
  } catch (error) {
    logger.error('查询材料转换规则失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询材料转换规则失败')
  }
})

/**
 * 创建材料转换规则
 * POST /api/v4/admin/material/conversion-rules
 *
 * @description 创建新的材料转换规则（创建时会执行风控校验：防循环、防套利）
 * @body {string} from_asset_code - 必填，源资产代码
 * @body {string} to_asset_code - 必填，目标资产代码
 * @body {number} from_amount - 必填，源材料数量
 * @body {number} to_amount - 必填，目标材料数量
 * @body {string} effective_at - 可选，生效时间（默认当前时间，格式：YYYY-MM-DD HH:mm:ss）
 * @body {string} description - 可选，规则描述
 *
 * @returns {object} result - 创建结果
 * @returns {object} result.rule - 规则信息
 * @returns {object} result.validation - 风控校验结果
 */
router.post('/conversion-rules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const admin_id = req.user.user_id

    const {
      from_asset_code,
      to_asset_code,
      from_amount,
      to_amount,
      effective_at,
      description
    } = req.body

    // 参数验证
    if (!from_asset_code || !to_asset_code || !from_amount || !to_amount) {
      return res.apiError(
        '缺少必填参数：from_asset_code、to_asset_code、from_amount、to_amount',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 数量参数验证
    const fromAmount = parseInt(from_amount)
    const toAmount = parseInt(to_amount)

    if (isNaN(fromAmount) || fromAmount < 1 || isNaN(toAmount) || toAmount < 1) {
      return res.apiError(
        'from_amount和to_amount必须是大于0的正整数',
        'BAD_REQUEST',
        null,
        400
      )
    }

    logger.info('管理员创建材料转换规则', {
      admin_id,
      from_asset_code,
      to_asset_code,
      from_amount: fromAmount,
      to_amount: toAmount,
      effective_at
    })

    // 调用Service创建规则（会自动执行风控校验）
    const result = await MaterialService.createConversionRule({
      from_asset_code,
      to_asset_code,
      from_amount: fromAmount,
      to_amount: toAmount,
      effective_at: effective_at || new Date(),
      description,
      created_by: admin_id
    })

    logger.info('创建材料转换规则成功', {
      admin_id,
      rule_id: result.rule.rule_id,
      from_asset_code,
      to_asset_code,
      validation: result.validation
    })

    return res.apiSuccess(
      result,
      '创建材料转换规则成功'
    )
  } catch (error) {
    logger.error('创建材料转换规则失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      from_asset_code: req.body?.from_asset_code,
      to_asset_code: req.body?.to_asset_code
    })
    return handleServiceError(error, res, '创建材料转换规则失败')
  }
})

/**
 * 更新材料转换规则
 * PUT /api/v4/admin/material/conversion-rules/:rule_id
 *
 * @description 更新材料转换规则（建议新增规则而非修改旧规则，以保持历史可追溯）
 * @param {number} rule_id - 规则ID
 * @body {string} description - 可选，规则描述
 * @body {number} is_enabled - 可选，是否启用（0/1）
 */
router.put('/conversion-rules/:rule_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const admin_id = req.user.user_id
    const { rule_id } = req.params
    const { description, is_enabled } = req.body

    logger.info('管理员更新材料转换规则', {
      admin_id,
      rule_id,
      updates: req.body
    })

    // 构建更新数据
    const updates = {}
    if (description !== undefined) updates.description = description
    if (is_enabled !== undefined) updates.is_enabled = parseInt(is_enabled)

    if (Object.keys(updates).length === 0) {
      return res.apiError(
        '至少需要提供一个要更新的字段',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 调用Service更新规则
    const result = await MaterialService.updateConversionRule(
      parseInt(rule_id),
      updates,
      admin_id
    )

    logger.info('更新材料转换规则成功', {
      admin_id,
      rule_id,
      updates
    })

    return res.apiSuccess(
      result,
      '更新材料转换规则成功'
    )
  } catch (error) {
    logger.error('更新材料转换规则失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      rule_id: req.params?.rule_id
    })
    return handleServiceError(error, res, '更新材料转换规则失败')
  }
})

// ==================== 用户材料余额管理 ====================

/**
 * 查询用户材料余额
 * GET /api/v4/admin/material/users/:user_id/balance
 *
 * @description 管理员查询指定用户的所有材料余额
 * @param {number} user_id - 用户ID
 * @returns {Array} balances - 材料余额列表
 */
router.get('/users/:user_id/balance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const admin_id = req.user.user_id
    const { user_id } = req.params

    logger.info('管理员查询用户材料余额', {
      admin_id,
      target_user_id: parseInt(user_id)
    })

    // 调用Service获取余额
    const balances = await MaterialService.getUserBalances(parseInt(user_id))

    logger.info('查询用户材料余额成功', {
      admin_id,
      target_user_id: parseInt(user_id),
      count: balances.length
    })

    return res.apiSuccess(
      { balances },
      '查询用户材料余额成功'
    )
  } catch (error) {
    logger.error('查询用户材料余额失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      target_user_id: req.params?.user_id
    })
    return handleServiceError(error, res, '查询用户材料余额失败')
  }
})

/**
 * 管理员调整用户材料余额
 * POST /api/v4/admin/material/users/:user_id/adjust
 *
 * @description 管理员人工调整用户的材料余额（用于运营补偿、活动发放、纠错等）
 * @param {number} user_id - 用户ID
 * @body {string} asset_code - 必填，资产代码
 * @body {number} delta - 必填，变动金额（可正可负，正数=增加，负数=减少）
 * @body {string} business_id - 必填，幂等键（唯一标识，格式建议：admin_adjust_{admin_id}_{timestamp}）
 * @body {string} title - 必填，调整原因（用于前端展示和审计）
 * @body {object} meta - 可选，元数据（如：工单号、活动ID、备注等）
 *
 * @returns {object} result - 调整结果
 */
router.post('/users/:user_id/adjust', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const admin_id = req.user.user_id
    const { user_id } = req.params
    const { asset_code, delta, business_id, title, meta } = req.body

    // 参数验证
    if (!asset_code || delta === undefined || !business_id || !title) {
      return res.apiError(
        '缺少必填参数：asset_code、delta、business_id、title',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // delta参数验证
    const deltaAmount = parseInt(delta)
    if (isNaN(deltaAmount) || deltaAmount === 0) {
      return res.apiError(
        'delta必须是非零整数',
        'BAD_REQUEST',
        null,
        400
      )
    }

    logger.info('管理员调整用户材料余额', {
      admin_id,
      target_user_id: parseInt(user_id),
      asset_code,
      delta: deltaAmount,
      business_id,
      title
    })

    // 调用Service执行调整
    const result = await MaterialService.adminAdjust(
      parseInt(user_id),
      asset_code,
      deltaAmount,
      {
        business_id,
        title,
        meta: meta || { admin_id, timestamp: new Date() }
      }
    )

    logger.info('管理员调整用户材料余额成功', {
      admin_id,
      target_user_id: parseInt(user_id),
      asset_code,
      delta: deltaAmount,
      balance_after: result.balance_after
    })

    return res.apiSuccess(
      result,
      '调整用户材料余额成功'
    )
  } catch (error) {
    logger.error('管理员调整用户材料余额失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      target_user_id: req.params?.user_id,
      asset_code: req.body?.asset_code
    })
    return handleServiceError(error, res, '调整用户材料余额失败')
  }
})

// ==================== 材料流水查询 ====================

/**
 * 查询材料流水（管理员）
 * GET /api/v4/admin/material/transactions
 *
 * @description 管理员查询材料流水（支持按用户、资产、业务类型等多维度筛选）
 * @query {number} user_id - 可选，用户ID过滤
 * @query {string} asset_code - 可选，资产代码过滤
 * @query {string} tx_type - 可选，交易类型过滤
 * @query {string} business_type - 可选，业务类型过滤
 * @query {string} business_id - 可选，业务ID过滤（精确匹配）
 * @query {string} start_date - 可选，开始日期（格式：YYYY-MM-DD）
 * @query {string} end_date - 可选，结束日期（格式：YYYY-MM-DD）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 * @returns {Array} transactions - 材料流水列表
 * @returns {object} pagination - 分页信息
 */
router.get('/transactions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const admin_id = req.user.user_id

    const {
      user_id,
      asset_code,
      tx_type,
      business_type,
      business_id,
      start_date,
      end_date,
      page = 1,
      page_size = 20
    } = req.query

    // 参数验证
    const finalPage = Math.max(parseInt(page) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 100)

    logger.info('管理员查询材料流水', {
      admin_id,
      filters: {
        user_id,
        asset_code,
        tx_type,
        business_type,
        business_id
      },
      page: finalPage,
      page_size: finalPageSize
    })

    // 调用Service查询流水
    const result = await MaterialService.getTransactions({
      user_id: user_id ? parseInt(user_id) : undefined,
      asset_code,
      tx_type,
      business_type,
      business_id,
      start_date,
      end_date,
      page: finalPage,
      page_size: finalPageSize
    })

    logger.info('管理员查询材料流水成功', {
      admin_id,
      total: result.pagination.total,
      returned: result.transactions.length
    })

    return res.apiSuccess(
      result,
      '查询材料流水成功'
    )
  } catch (error) {
    logger.error('管理员查询材料流水失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询材料流水失败')
  }
})

module.exports = router
