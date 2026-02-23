/**
 * 资产管理 API 模块
 *
 * @module api/asset
 * @description 资产、材料、钻石账户相关的 API 调用
 *
 * 后端路由映射：
 * - 资产统计: /api/v4/console/assets/*
 * - 资产调整: /api/v4/console/asset-adjustment/*（POINTS/DIAMOND/BUDGET_POINTS/材料统一入口）
 * - 材料管理: /api/v4/console/material/*
 * - 物品管理: /api/v4/console/item-templates/*, /api/v4/console/item-instances/*
 *
 * @version 2.0.0
 * @since 2026-01-23
 * @see routes/v4/console/assets/transactions.js - 资产流水查询
 * @see routes/v4/console/asset-adjustment.js - 资产调整（含钻石）
 * @see routes/v4/console/material.js - 材料转换规则管理
 */

import { API_PREFIX, request, buildURL, buildQueryString } from './base.js'

// ========== API 端点 ==========

export const ASSET_ENDPOINTS = {
  // 资产统计
  STATS: `${API_PREFIX}/console/assets/stats`,
  TRANSACTIONS: `${API_PREFIX}/console/assets/transactions`,
  PORTFOLIO: `${API_PREFIX}/console/assets/portfolio`,
  EXPORT: `${API_PREFIX}/console/assets/export`,

  // 资产调整
  ADJUSTMENT_ASSET_TYPES: `${API_PREFIX}/console/asset-adjustment/asset-types`,
  ADJUSTMENT_USER_BALANCES: `${API_PREFIX}/console/asset-adjustment/user/:user_id/balances`,
  ADJUSTMENT_ADJUST: `${API_PREFIX}/console/asset-adjustment/adjust`,

  // 材料资产
  MATERIAL_ASSET_TYPES: `${API_PREFIX}/console/material/asset-types`,
  MATERIAL_ASSET_TYPE_DETAIL: `${API_PREFIX}/console/material/asset-types/:asset_code`,
  MATERIAL_ASSET_TYPE_DISABLE: `${API_PREFIX}/console/material/asset-types/:asset_code/disable`,
  MATERIAL_CONVERSION_RULES: `${API_PREFIX}/console/material/conversion-rules`,
  MATERIAL_CONVERSION_RULE_DETAIL: `${API_PREFIX}/console/material/conversion-rules/:rule_id`,
  MATERIAL_CONVERSION_RULE_DISABLE: `${API_PREFIX}/console/material/conversion-rules/:rule_id/disable`,
  // 材料用户余额查询通过 ADJUSTMENT_USER_BALANCES 统一接口
  // 材料交易记录通过 TRANSACTIONS（需要 user_id）统一接口

  // 系统账户（用户资产账户列表查询）
  SYSTEM_ACCOUNTS: `${API_PREFIX}/console/system-data/accounts`,
  SYSTEM_ACCOUNT_DETAIL: `${API_PREFIX}/console/system-data/accounts/:account_id`,

  // 物品模板
  ITEM_TEMPLATE_LIST: `${API_PREFIX}/console/item-templates`,
  ITEM_TEMPLATE_DETAIL: `${API_PREFIX}/console/item-templates/:id`,
  ITEM_TEMPLATE_CREATE: `${API_PREFIX}/console/item-templates`,
  ITEM_TEMPLATE_UPDATE: `${API_PREFIX}/console/item-templates/:id`,
  ITEM_TEMPLATE_DELETE: `${API_PREFIX}/console/item-templates/:id`,
  ITEM_TEMPLATE_STATS: `${API_PREFIX}/console/item-templates/stats`,

  // 物品管理（三表模型：items + item_ledger + item_holds）
  ITEM_INSTANCE_LIST: `${API_PREFIX}/console/item-instances`,
  ITEM_INSTANCE_DETAIL: `${API_PREFIX}/console/item-instances/:id`,
  ITEM_INSTANCE_USER: `${API_PREFIX}/console/item-instances/user/:user_id`,
  ITEM_INSTANCE_TRANSFER: `${API_PREFIX}/console/item-instances/:id/transfer`,
  ITEM_INSTANCE_FREEZE: `${API_PREFIX}/console/item-instances/:id/freeze`,
  ITEM_INSTANCE_UNFREEZE: `${API_PREFIX}/console/item-instances/:id/unfreeze`,

  // 物品全链路追踪（三表模型 2026-02-22）
  ITEM_LIFECYCLE: `${API_PREFIX}/console/item-lifecycle/:identifier/lifecycle`,
  ITEM_LEDGER: `${API_PREFIX}/console/item-lifecycle/ledger`,

  // 对账报告（三表模型 2026-02-22）
  RECONCILIATION_ITEMS: `${API_PREFIX}/console/reconciliation/items`,
  RECONCILIATION_ASSETS: `${API_PREFIX}/console/reconciliation/assets`,

  // 孤立冻结资产
  ORPHAN_FROZEN_DETECT: `${API_PREFIX}/console/orphan-frozen/detect`,
  ORPHAN_FROZEN_CLEANUP: `${API_PREFIX}/console/orphan-frozen/cleanup`,
  ORPHAN_FROZEN_STATS: `${API_PREFIX}/console/orphan-frozen/stats`,

  // 资产调整（统一入口，已合并原钻石/材料调整）
  // 资产类型列表: ADJUSTMENT_ASSET_TYPES
  // 用户余额查询: ADJUSTMENT_USER_BALANCES
  // 资产调整操作: ADJUSTMENT_ADJUST

  // 债务管理 - 适配后端 debt-management 路由
  DEBT_LIST: `${API_PREFIX}/console/debt-management/pending`, // 待冲销欠账列表
  DEBT_DETAIL: `${API_PREFIX}/console/debt-management/by-campaign`, // 按活动汇总欠账
  DEBT_STATS: `${API_PREFIX}/console/debt-management/dashboard`, // 欠账看板总览
  DEBT_REPAY: `${API_PREFIX}/console/debt-management/clear`, // 执行欠账清偿
  DEBT_WRITE_OFF: `${API_PREFIX}/console/debt-management/clear`, // 核销（使用相同的清偿接口）
  DEBT_BY_PRIZE: `${API_PREFIX}/console/debt-management/by-prize`, // 按奖品汇总
  DEBT_BY_CREATOR: `${API_PREFIX}/console/debt-management/by-creator`, // 按责任人汇总
  DEBT_TREND: `${API_PREFIX}/console/debt-management/trend`, // 欠账趋势
  DEBT_LIMITS: `${API_PREFIX}/console/debt-management/limits`, // 欠账上限配置

  // 交易订单
  TRADE_ORDER_LIST: `${API_PREFIX}/console/trade-orders`
}

// ========== API 调用方法 ==========

export const AssetAPI = {
  // ===== 资产统计 =====

  /**
   * 获取资产统计
   * @async
   * @returns {Promise<Object>}
   */
  async getStats() {
    return await request({ url: ASSET_ENDPOINTS.STATS, method: 'GET' })
  },

  /**
   * 获取资产流水记录（管理员视角）
   *
   * @description 查询指定用户的资产流水记录，支持分页和多条件筛选
   * @async
   * @function getTransactions
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 用户ID（必填）
   * @param {string} [params.asset_code] - 资产代码筛选（如 'POINTS', 'DIAMOND', 'red_shard'）
   * @param {string} [params.business_type] - 业务类型筛选（如 'admin_adjustment', 'lottery_reward'）
   * @param {string} [params.start_date] - 开始日期（ISO8601格式）
   * @param {string} [params.end_date] - 结束日期（ISO8601格式）
   * @param {number} [params.page=1] - 页码（从1开始）
   * @param {number} [params.page_size=20] - 每页数量（最大100）
   *
   * @returns {Promise<Object>} 响应对象
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<Object>} return.data.transactions - 流水记录数组
   * @returns {number} return.data.transactions[].asset_transaction_id - 流水ID（主键）
   * @returns {string} return.data.transactions[].asset_code - 资产代码
   * @returns {string} return.data.transactions[].asset_name - 资产显示名称
   * @returns {string} return.data.transactions[].tx_type - 业务类型（附带 tx_type_display 中文）
   * @returns {number} return.data.transactions[].delta_amount - 变动金额（正数=增加，负数=扣减）
   * @returns {number} return.data.transactions[].balance_before - 变动前余额
   * @returns {number} return.data.transactions[].balance_after - 变动后余额
   * @returns {string|null} return.data.transactions[].description - 交易描述（来自 meta.description）
   * @returns {string|null} return.data.transactions[].title - 交易标题（来自 meta.title）
   * @returns {string|null} return.data.transactions[].reason - 变动原因（来自 meta.reason）
   * @returns {string} return.data.transactions[].created_at - 创建时间（ISO8601）
   * @returns {Object} return.data.pagination - 分页信息
   * @returns {number} return.data.pagination.page - 当前页码
   * @returns {number} return.data.pagination.page_size - 每页数量
   * @returns {number} return.data.pagination.total - 总记录数
   * @returns {number} return.data.pagination.total_pages - 总页数
   *
   * @example
   * // 查询用户积分流水
   * const result = await AssetAPI.getTransactions({
   *   user_id: 123,
   *   asset_code: 'POINTS',
   *   page: 1,
   *   page_size: 20
   * })
   *
   * @see GET /api/v4/console/assets/transactions
   */
  async getTransactions(params = {}) {
    const url = ASSET_ENDPOINTS.TRANSACTIONS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 导出资产数据
   *
   * @description 导出用户资产余额数据为Excel或CSV文件
   * @async
   * @function exportAssets
   *
   * @param {Object} [params] - 导出参数
   * @param {string} [params.type] - 资产类型筛选（如 'POINTS', 'DIAMOND'）
   * @param {string} [params.format='excel'] - 导出格式（excel/csv）
   * @param {number} [params.user_id] - 筛选指定用户
   * @param {number} [params.limit=1000] - 导出数据条数限制（最大10000）
   *
   * @returns {Promise<Blob>} 文件流
   *
   * @example
   * // 导出所有积分资产
   * const blob = await AssetAPI.exportAssets({ type: 'POINTS', format: 'excel' })
   *
   * @see GET /api/v4/console/assets/export
   */
  async exportAssets(params = {}) {
    return await request({
      url: ASSET_ENDPOINTS.EXPORT,
      params,
      responseType: 'blob'
    })
  },

  /**
   * 获取用户资产总览（资产组合）
   *
   * @description 整合三类资产域，提供统一的资产查询入口：
   * 1. 积分（POINTS）- 来自 account_asset_balances
   * 2. 可叠加资产（DIAMOND、材料）- 来自 account_asset_balances
   * 3. 不可叠加物品（优惠券、实物商品）- 来自 item_instances
   *
   * @async
   * @function getPortfolio
   *
   * @param {Object} [params] - 查询参数
   * @param {boolean} [params.include_items=false] - 是否包含物品详细列表
   *
   * @returns {Promise<Object>} 响应对象
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 资产总览数据
   * @returns {number} return.data.user_id - 用户ID
   * @returns {Object} return.data.points - 积分信息
   * @returns {number} return.data.points.available - 可用积分
   * @returns {number} return.data.points.frozen - 冻结积分
   * @returns {number} return.data.points.total_earned - 累计获得
   * @returns {number} return.data.points.total_consumed - 累计消耗
   * @returns {Array<Object>} return.data.fungible_assets - 可叠加资产列表
   * @returns {string} return.data.fungible_assets[].asset_code - 资产代码
   * @returns {string} return.data.fungible_assets[].display_name - 显示名称
   * @returns {number} return.data.fungible_assets[].available_amount - 可用数量
   * @returns {number} return.data.fungible_assets[].frozen_amount - 冻结数量
   * @returns {number} return.data.fungible_assets[].total_amount - 总数量
   * @returns {Object} return.data.non_fungible_items - 不可叠加物品统计
   * @returns {number} return.data.non_fungible_items.total_count - 物品总数
   * @returns {number} return.data.non_fungible_items.available_count - 可用物品数
   * @returns {number} return.data.non_fungible_items.locked_count - 锁定物品数
   * @returns {Object} return.data.non_fungible_items.by_type - 按类型分组统计
   * @returns {string} return.data.retrieved_at - 数据获取时间（ISO8601）
   *
   * @example
   * // 获取当前用户资产总览
   * const result = await AssetAPI.getPortfolio()
   *
   * // 获取资产总览并包含物品列表
   * const resultWithItems = await AssetAPI.getPortfolio({ include_items: true })
   *
   * @see GET /api/v4/console/assets/portfolio
   */
  async getPortfolio(params = {}) {
    const url = ASSET_ENDPOINTS.PORTFOLIO + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 资产调整 =====

  /**
   * 获取资产类型列表
   * @async
   * @returns {Promise<Object>}
   */
  async getAssetTypes() {
    return await request({ url: ASSET_ENDPOINTS.ADJUSTMENT_ASSET_TYPES, method: 'GET' })
  },

  /**
   * 获取指定用户的所有资产余额（管理员视角）
   *
   * @description 查询指定用户的所有资产账户余额，用于资产调整前的余额确认
   * @async
   * @function getUserBalances
   *
   * @param {number|string} userId - 用户ID（必填）
   *
   * @returns {Promise<Object>} 响应对象
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Object} return.data.user - 用户基本信息
   * @returns {number} return.data.user.user_id - 用户ID
   * @returns {string} return.data.user.nickname - 用户昵称
   * @returns {string} return.data.user.mobile - 手机号
   * @returns {string} return.data.user.status - 用户状态
   * @returns {Array<Object>} return.data.balances - 资产余额列表
   * @returns {string} return.data.balances[].asset_code - 资产代码（POINTS/DIAMOND/BUDGET_POINTS/材料代码）
   * @returns {number} return.data.balances[].available_amount - 可用余额
   * @returns {number} return.data.balances[].frozen_amount - 冻结余额
   * @returns {number} return.data.balances[].total - 总余额（可用+冻结）
   * @returns {number|null} return.data.balances[].campaign_id - 活动ID（仅 BUDGET_POINTS 有值）
   *
   * @throws {Error} 用户不存在时返回 404 错误
   *
   * @example
   * // 获取用户123的所有资产余额
   * const result = await AssetAPI.getUserBalances(123)
   * logger.debug(result.data.balances)
   *
   * @see GET /api/v4/console/asset-adjustment/user/:user_id/balances
   */
  async getUserBalances(userId) {
    const url = buildURL(ASSET_ENDPOINTS.ADJUSTMENT_USER_BALANCES, { user_id: userId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 管理员调整用户资产（敏感操作）
   *
   * @description 统一资产调整入口，支持 POINTS/DIAMOND/BUDGET_POINTS/材料等所有资产类型
   *
   * ⚠️ 安全约束：
   * - idempotency_key 必须由前端提供（禁止自动生成，确保幂等性）
   * - 所有调整操作记录审计日志
   * - BUDGET_POINTS 调整必须提供 campaign_id
   *
   * @async
   * @function adjustAsset
   *
   * @param {Object} data - 调整参数
   * @param {number} data.user_id - 目标用户ID（必填）
   * @param {string} data.asset_code - 资产代码（必填，如 'POINTS', 'DIAMOND', 'BUDGET_POINTS', 'red_shard'）
   * @param {number} data.amount - 调整数量（必填，正数=增加，负数=扣减，不能为0）
   * @param {string} data.reason - 调整原因（必填，用于审计）
   * @param {string} data.idempotency_key - 幂等键（必填，推荐格式：admin_adjust_{admin_id}_{user_id}_{asset_code}_{timestamp}）
   * @param {number} [data.campaign_id] - 活动ID（BUDGET_POINTS 必填）
   *
   * @returns {Promise<Object>} 响应对象
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 调整结果
   * @returns {string} return.data.message - 操作结果消息
   * @returns {number} return.data.user_id - 用户ID
   * @returns {string} return.data.asset_code - 资产代码
   * @returns {number} return.data.amount - 调整数量
   * @returns {number} return.data.balance_before - 调整前余额
   * @returns {number} return.data.balance_after - 调整后余额
   * @returns {number} return.data.transaction_id - 交易流水ID
   * @returns {string} return.data.idempotency_key - 幂等键
   * @returns {boolean} [return.data.is_duplicate] - 是否为重复请求
   *
   * @throws {Error} 余额不足时返回 INSUFFICIENT_BALANCE 错误
   * @throws {Error} 缺少必填参数时返回 BAD_REQUEST 错误
   *
   * @example
   * // 增加用户积分
   * const result = await AssetAPI.adjustAsset({
   *   user_id: 123,
   *   asset_code: 'POINTS',
   *   amount: 1000,
   *   reason: '客服补偿',
   *   idempotency_key: `admin_adjust_1_123_POINTS_${Date.now()}`
   * })
   *
   * // 扣减用户钻石
   * const result2 = await AssetAPI.adjustAsset({
   *   user_id: 123,
   *   asset_code: 'DIAMOND',
   *   amount: -50,
   *   reason: '数据修正',
   *   idempotency_key: `admin_adjust_1_123_DIAMOND_${Date.now()}`
   * })
   *
   * @see POST /api/v4/console/asset-adjustment/adjust
   */
  async adjustAsset(data) {
    return await request({ url: ASSET_ENDPOINTS.ADJUSTMENT_ADJUST, method: 'POST', data })
  },

  // ===== 材料资产 =====

  /**
   * 获取材料资产类型列表
   * @async
   * @returns {Promise<Object>}
   */
  async getMaterialAssetTypes() {
    return await request({ url: ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES, method: 'GET' })
  },

  /**
   * 获取材料转换规则列表（管理员）
   *
   * @description 查询材料转换规则，支持分页和筛选。
   *
   * 业务规则说明：
   * - 规则采用版本化管理，改比例必须新增规则（禁止 UPDATE 覆盖历史）
   * - 通过 effective_at 生效时间控制规则切换
   * - 创建规则时会进行风控校验（循环拦截 + 套利闭环检测）
   *
   * @async
   * @function getConversionRules
   *
   * @param {Object} [params] - 查询参数
   * @param {string} [params.from_asset_code] - 源资产代码筛选（如 'red_shard'）
   * @param {string} [params.to_asset_code] - 目标资产代码筛选（如 'DIAMOND'）
   * @param {boolean|string} [params.is_enabled] - 是否启用筛选（true/false）
   * @param {number} [params.page=1] - 页码（从1开始）
   * @param {number} [params.page_size=20] - 每页数量
   *
   * @returns {Promise<Object>} 响应对象
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<Object>} return.data.rules - 转换规则列表
   * @returns {number} return.data.rules[].rule_id - 规则ID
   * @returns {string} return.data.rules[].from_asset_code - 源资产代码
   * @returns {string} return.data.rules[].to_asset_code - 目标资产代码
   * @returns {number} return.data.rules[].from_amount - 源资产数量
   * @returns {number} return.data.rules[].to_amount - 目标资产数量
   * @returns {string} return.data.rules[].effective_at - 生效时间（ISO8601）
   * @returns {boolean} return.data.rules[].is_enabled - 是否启用
   * @returns {number} [return.data.rules[].min_from_amount] - 最小转换数量
   * @returns {number} [return.data.rules[].max_from_amount] - 最大转换数量
   * @returns {number} [return.data.rules[].fee_rate] - 手续费费率（如 0.05 = 5%）
   * @returns {string} [return.data.rules[].title] - 规则标题
   * @returns {Object} return.data.pagination - 分页信息
   * @returns {number} return.data.total - 总记录数
   *
   * @example
   * // 查询所有启用的转换规则
   * const result = await AssetAPI.getConversionRules({ is_enabled: true })
   *
   * // 查询红水晶碎片的转换规则
   * const result2 = await AssetAPI.getConversionRules({
   *   from_asset_code: 'red_shard',
   *   page: 1,
   *   page_size: 10
   * })
   *
   * @see GET /api/v4/console/material/conversion-rules
   */
  async getConversionRules(params = {}) {
    const url = ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULES + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取单个材料转换规则详情（管理员）
   *
   * @async
   * @function getConversionRuleDetail
   * @param {number} ruleId - 转换规则ID（事务实体，使用数字ID）
   * @returns {Promise<Object>} 规则详情
   * @see GET /api/v4/console/material/conversion-rules/:id
   */
  async getConversionRuleDetail(ruleId) {
    const url = buildURL(ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULE_DETAIL, { rule_id: ruleId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建材料转换规则（管理员，版本化：改比例必须新增规则）
   *
   * @async
   * @function createConversionRule
   * @param {Object} data - 规则参数
   * @param {string} data.from_asset_code - 源资产代码（如 'red_shard'）
   * @param {string} data.to_asset_code - 目标资产代码（如 'DIAMOND'）
   * @param {number} data.from_amount - 源资产数量
   * @param {number} data.to_amount - 目标资产数量
   * @param {string} data.effective_at - 生效时间（ISO8601，含 +08:00 时区）
   * @param {boolean} [data.is_enabled=true] - 是否启用
   * @param {number} [data.min_from_amount] - 最小转换数量
   * @param {number} [data.max_from_amount] - 最大转换数量（null=无上限）
   * @param {number} [data.fee_rate] - 手续费费率（如 0.05 = 5%）
   * @param {number} [data.fee_min_amount] - 最低手续费
   * @param {string} [data.fee_asset_code] - 手续费资产类型
   * @param {string} [data.title] - 规则标题
   * @param {string} [data.description] - 规则描述
   * @param {string} [data.risk_level] - 风险等级（low/medium/high）
   * @param {boolean} [data.is_visible=true] - 前端是否可见
   * @param {string} [data.rounding_mode='floor'] - 舍入模式（floor/ceil/round）
   * @returns {Promise<Object>} 创建结果
   * @see POST /api/v4/console/material/conversion-rules
   */
  async createConversionRule(data) {
    return await request({ url: ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULES, method: 'POST', data })
  },

  /**
   * 禁用材料转换规则（管理员，不可删除/修改，仅禁用）
   *
   * @async
   * @function disableConversionRule
   * @param {number} ruleId - 转换规则ID
   * @returns {Promise<Object>} 禁用结果
   * @see PUT /api/v4/console/material/conversion-rules/:id/disable
   */
  async disableConversionRule(ruleId) {
    const url = buildURL(ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULE_DISABLE, { rule_id: ruleId })
    return await request({ url, method: 'PUT' })
  },

  /**
   * 创建材料资产类型（管理员）
   *
   * @async
   * @function createAssetType
   * @param {Object} data - 资产类型参数
   * @param {string} data.asset_code - 资产代码（唯一，如 'red_shard'）
   * @param {string} data.display_name - 展示名称
   * @param {string} data.group_code - 分组代码（如 'red'、'orange'）
   * @param {string} data.form - 形态（'shard' 或 'crystal'）
   * @param {number} data.tier - 层级
   * @param {number} [data.sort_order=0] - 排序权重
   * @param {boolean} [data.is_enabled=true] - 是否启用
   * @returns {Promise<Object>} 创建结果
   * @see POST /api/v4/console/material/asset-types
   */
  async createAssetType(data) {
    return await request({ url: ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES, method: 'POST', data })
  },

  /**
   * 更新材料资产类型（管理员，asset_code 不可更新）
   *
   * @async
   * @function updateAssetType
   * @param {string} assetCode - 资产类型代码（配置实体，使用业务码）
   * @param {Object} data - 可更新字段
   * @returns {Promise<Object>} 更新结果
   * @see PUT /api/v4/console/material/asset-types/:code
   */
  async updateAssetType(assetCode, data) {
    const url = buildURL(ASSET_ENDPOINTS.MATERIAL_ASSET_TYPE_DETAIL, { asset_code: assetCode })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 禁用材料资产类型（管理员）
   *
   * @async
   * @function disableAssetType
   * @param {string} assetCode - 资产类型代码
   * @returns {Promise<Object>} 禁用结果
   * @see PUT /api/v4/console/material/asset-types/:code/disable
   */
  async disableAssetType(assetCode) {
    const url = buildURL(ASSET_ENDPOINTS.MATERIAL_ASSET_TYPE_DISABLE, { asset_code: assetCode })
    return await request({ url, method: 'PUT' })
  },

  // 用户材料余额：通过 getUserBalances(userId) 统一查询
  // 材料交易记录：通过 getTransactions({ user_id }) 统一查询

  // ===== 系统账户 =====

  /**
   * 获取系统账户列表（分页）
   *
   * @description 获取用户资产账户列表，支持分页查询
   * @async
   * @function getSystemAccounts
   *
   * @param {Object} [params] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {number} [params.user_id] - 用户ID筛选
   * @param {string} [params.account_type] - 账户类型筛选
   * @param {string} [params.status] - 状态筛选
   *
   * @returns {Promise<Object>} 响应对象
   *
   * @see GET /api/v4/console/system-data/accounts
   */
  async getSystemAccounts(params = {}) {
    const url = ASSET_ENDPOINTS.SYSTEM_ACCOUNTS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 物品模板 =====

  /**
   * 获取物品模板列表
   * @param {Object} params - 查询参数
   * @async
   * @returns {Promise<Object>}
   */
  async getItemTemplates(params = {}) {
    const url = ASSET_ENDPOINTS.ITEM_TEMPLATE_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取物品模板详情
   * @param {number} id - 模板 ID
   * @async
   * @returns {Promise<Object>}
   */
  async getItemTemplateDetail(id) {
    const url = buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建物品模板
   * @param {Object} data - 模板数据
   * @async
   * @returns {Promise<Object>}
   */
  async createItemTemplate(data) {
    return await request({ url: ASSET_ENDPOINTS.ITEM_TEMPLATE_CREATE, method: 'POST', data })
  },

  /**
   * 更新物品模板
   * @param {number} id - 模板 ID
   * @param {Object} data - 模板数据
   * @async
   * @returns {Promise<Object>}
   */
  async updateItemTemplate(id, data) {
    const url = buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除物品模板
   * @param {number} id - 模板 ID
   * @async
   * @returns {Promise<Object>}
   */
  async deleteItemTemplate(id) {
    const url = buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 物品实例 =====

  /**
   * 获取物品实例列表
   * @param {Object} params - 查询参数
   * @async
   * @returns {Promise<Object>}
   */
  async getItemInstances(params = {}) {
    const url = ASSET_ENDPOINTS.ITEM_INSTANCE_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取指定用户的物品列表
   * @param {number} userId - 用户 ID
   * @param {Object} params - 查询参数（page, page_size, status, item_type）
   * @async
   * @returns {Promise<Object>} 物品列表（分页）
   */
  async getUserItems(userId, params = {}) {
    const url =
      buildURL(ASSET_ENDPOINTS.ITEM_INSTANCE_USER, { user_id: userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 管理员转移物品所有权（通过 item_ledger 双录）
   * @param {number} itemId - 物品 ID（item_id）
   * @param {Object} data - 转移数据 { target_user_id, reason }
   * @async
   * @returns {Promise<Object>} 转移结果
   */
  async transferItem(itemId, data) {
    const url = buildURL(ASSET_ENDPOINTS.ITEM_INSTANCE_TRANSFER, { id: itemId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 冻结物品（添加 security 锁定到 item_holds）
   * @param {number} itemId - 物品 ID（item_id）
   * @param {Object} data - 冻结数据 { reason }
   * @async
   * @returns {Promise<Object>} 冻结结果
   */
  async freezeItem(itemId, data) {
    const url = buildURL(ASSET_ENDPOINTS.ITEM_INSTANCE_FREEZE, { id: itemId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 解冻物品（释放 item_holds 中的 security 锁定）
   * @param {number} itemId - 物品 ID（item_id）
   * @async
   * @returns {Promise<Object>} 解冻结果
   */
  async unfreezeItem(itemId) {
    const url = buildURL(ASSET_ENDPOINTS.ITEM_INSTANCE_UNFREEZE, { id: itemId })
    return await request({ url, method: 'POST' })
  }
}

export default AssetAPI
