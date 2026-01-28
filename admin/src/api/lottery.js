/**
 * 抽奖管理 API 模块
 *
 * @module api/lottery
 * @description 抽奖活动、策略、配置相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @example
 * // 导入抽奖 API
 * import { LotteryAPI } from './api/lottery.js'
 *
 * // 执行抽奖
 * const result = await LotteryAPI.execute({ campaign_id: 1, user_id: 123, count: 1 })
 *
 * // 获取奖品列表
 * const prizes = await LotteryAPI.getPrizeList({ campaign_id: 1, page: 1, page_size: 20 })
 */

import { logger } from '../utils/logger.js'
import { request, buildURL, buildQueryString } from './base.js'

// ========== 类型定义 ==========

/**
 * 抽奖执行参数
 * @typedef {Object} LotteryExecuteParams
 * @property {number} campaign_id - 活动 ID（必填）
 * @property {number} user_id - 用户 ID（必填）
 * @property {number} [count=1] - 抽奖次数（默认 1）
 * @property {string} [campaign_code] - 活动代码（可选，与 campaign_id 二选一）
 */

/**
 * 抽奖历史查询参数
 * @typedef {Object} LotteryHistoryParams
 * @property {number} [user_id] - 用户 ID（按用户筛选）
 * @property {number} [campaign_id] - 活动 ID（按活动筛选）
 * @property {string} [prize_type] - 奖品类型（按奖品类型筛选）
 * @property {string} [start_date] - 开始日期（ISO 8601 格式）
 * @property {string} [end_date] - 结束日期（ISO 8601 格式）
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 */

/**
 * 抽奖预设查询参数
 * @typedef {Object} PresetListParams
 * @property {string} [status] - 状态筛选（pending/used/all，默认 all）
 * @property {number} [user_id] - 用户 ID 筛选
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 * @property {string} [order_by='created_at'] - 排序字段
 * @property {'ASC'|'DESC'} [order_dir='DESC'] - 排序方向
 */

/**
 * 创建预设参数
 * @typedef {Object} CreatePresetParams
 * @property {number} user_id - 目标用户 ID（必填）
 * @property {Array<PresetItem>} presets - 预设列表（必填）
 */

/**
 * 预设项数据
 * @typedef {Object} PresetItem
 * @property {number} prize_id - 奖品 ID（必填）
 * @property {number} queue_order - 队列顺序（必填，同一用户不能重复）
 */

/**
 * 奖品列表查询参数
 * @typedef {Object} PrizeListParams
 * @property {number} [campaign_id] - 活动 ID 筛选
 * @property {string} [status] - 状态筛选（active/inactive）
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 */

/**
 * 批量添加奖品参数
 * @typedef {Object} BatchAddPrizeParams
 * @property {number} campaign_id - 活动 ID（必填）
 * @property {Array<PrizeData>} prizes - 奖品列表（必填）
 */

/**
 * 奖品数据结构
 * @typedef {Object} PrizeData
 * @property {string} name - 奖品名称（必填）
 * @property {string} type - 奖品类型（必填，如 'physical'、'virtual'、'coupon'、'empty'）
 * @property {number} [value=0] - 奖品价值
 * @property {number} win_probability - 中奖概率（必填，所有奖品概率总和必须为 1）
 * @property {number} [total_quantity] - 总库存（可选，不设置为无限）
 * @property {number} [sort_order] - 排序顺序（可选，自动分配）
 * @property {number} [prize_value_points=0] - 内部预算成本（积分）
 */

/**
 * 更新奖品参数
 * @typedef {Object} UpdatePrizeParams
 * @property {string} [prize_name] - 奖品名称
 * @property {string} [prize_type] - 奖品类型
 * @property {number} [prize_value] - 奖品价值
 * @property {number} [win_probability] - 中奖概率
 * @property {number} [total_quantity] - 总库存
 * @property {number} [remaining_quantity] - 剩余库存
 * @property {string} [status] - 状态（active/inactive）
 * @property {number} [sort_order] - 排序顺序
 */

/**
 * 策略列表查询参数
 * @typedef {Object} StrategyListParams
 * @property {string} [config_group] - 配置分组筛选
 * @property {boolean} [is_active] - 是否启用
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 */

/**
 * 奖品信息响应
 * @typedef {Object} PrizeInfo
 * @property {number} prize_id - 奖品 ID
 * @property {number} campaign_id - 活动 ID
 * @property {string} prize_name - 奖品名称
 * @property {string} prize_type - 奖品类型
 * @property {number} prize_value - 奖品价值
 * @property {number} win_probability - 中奖概率
 * @property {number} total_quantity - 总库存
 * @property {number} remaining_quantity - 剩余库存
 * @property {number} won_count - 已中奖次数
 * @property {string} status - 状态
 * @property {number} sort_order - 排序顺序
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

/**
 * 抽奖历史记录
 * @typedef {Object} LotteryHistoryRecord
 * @property {number} lottery_id - 抽奖记录 ID
 * @property {number} user_id - 用户 ID
 * @property {number} campaign_id - 活动 ID
 * @property {number} prize_id - 奖品 ID
 * @property {string} prize_name - 奖品名称
 * @property {string} prize_type - 奖品类型
 * @property {number} prize_value - 奖品价值
 * @property {string} lottery_time - 抽奖时间
 * @property {string} status - 状态
 */

/**
 * 预设统计信息
 * @typedef {Object} PresetStats
 * @property {number} total_presets - 总预设数量
 * @property {number} pending_presets - 待使用预设数量
 * @property {number} used_presets - 已使用预设数量
 * @property {number} total_users_with_presets - 拥有预设的用户数量
 * @property {string} usage_rate - 预设使用率（百分比字符串）
 * @property {Array<Object>} prize_type_distribution - 奖品类型分布统计
 */

// ========== API 端点 ==========

export const LOTTERY_ENDPOINTS = {
  // 基础抽奖
  EXECUTE: '/api/v4/lottery/execute',
  HISTORY: '/api/v4/lottery/history',
  STRATEGIES: '/api/v4/lottery/strategies',

  // 预设管理
  PRESET_LIST: '/api/v4/lottery/preset/list',
  PRESET_CREATE: '/api/v4/lottery/preset/create',
  PRESET_USER_LIST: '/api/v4/lottery/preset/user/:user_id',
  PRESET_DELETE: '/api/v4/lottery/preset/user/:user_id',
  PRESET_STATS: '/api/v4/lottery/preset/stats',

  // 奖品池管理
  PRIZE_LIST: '/api/v4/console/prize-pool/list',
  PRIZE_BATCH_ADD: '/api/v4/console/prize-pool/batch-add',
  PRIZE_UPDATE: '/api/v4/console/prize-pool/prize/:prize_id',
  PRIZE_DELETE: '/api/v4/console/prize-pool/prize/:prize_id',
  PRIZE_DETAIL: '/api/v4/console/prize-pool/prize/:prize_id',
  PRIZE_ADD_STOCK: '/api/v4/console/prize-pool/prize/:prize_id/add-stock',
  PRIZE_TOGGLE: '/api/v4/console/prize-pool/prize/:prize_id/toggle',

  // 活动管理
  CAMPAIGN_LIST: '/api/v4/console/system-data/lottery-campaigns',
  CAMPAIGN_DETAIL: '/api/v4/console/system-data/lottery-campaigns/:campaign_id',
  CAMPAIGN_BUDGET: '/api/v4/console/campaign-budget/campaigns/:campaign_id',

  // 策略配置
  STRATEGY_LIST: '/api/v4/console/lottery-configs/strategies',
  STRATEGY_DETAIL: '/api/v4/console/lottery-configs/strategies/:id',
  STRATEGY_CREATE: '/api/v4/console/lottery-configs/strategies',
  STRATEGY_UPDATE: '/api/v4/console/lottery-configs/strategies/:id',
  STRATEGY_DELETE: '/api/v4/console/lottery-configs/strategies/:id',

  // 矩阵配置
  MATRIX_LIST: '/api/v4/console/lottery-configs/matrix',
  MATRIX_FULL: '/api/v4/console/lottery-configs/matrix/full',
  MATRIX_DETAIL: '/api/v4/console/lottery-configs/matrix/:id',
  MATRIX_CREATE: '/api/v4/console/lottery-configs/matrix',
  MATRIX_UPDATE: '/api/v4/console/lottery-configs/matrix/:id',
  MATRIX_HISTORY: '/api/v4/console/lottery-configs/matrix/history',
  MATRIX_ROLLBACK: '/api/v4/console/lottery-configs/matrix/:id/rollback',

  // 档位规则
  TIER_RULES_LIST: '/api/v4/console/lottery-tier-rules',
  TIER_RULES_DETAIL: '/api/v4/console/lottery-tier-rules/:id',
  TIER_RULES_CREATE: '/api/v4/console/lottery-tier-rules',
  TIER_RULES_UPDATE: '/api/v4/console/lottery-tier-rules/:id',
  TIER_RULES_DELETE: '/api/v4/console/lottery-tier-rules/:id',

  // 抽奖干预管理（后端路由: /api/v4/console/lottery-management/interventions）
  INTERVENTION_LIST: '/api/v4/console/lottery-management/interventions',
  INTERVENTION_DETAIL: '/api/v4/console/lottery-management/interventions/:id',
  INTERVENTION_CANCEL: '/api/v4/console/lottery-management/interventions/:id/cancel',

  // 策略统计（后端路由: /api/v4/console/lottery-strategy-stats）
  // 注意: STRATEGY_STATS_OVERVIEW 为兼容旧代码的别名，实际使用 REALTIME 端点
  STRATEGY_STATS_OVERVIEW: '/api/v4/console/lottery-strategy-stats/realtime/:campaign_id',
  STRATEGY_STATS_REALTIME: '/api/v4/console/lottery-strategy-stats/realtime/:campaign_id',
  STRATEGY_STATS_HOURLY: '/api/v4/console/lottery-strategy-stats/hourly/:campaign_id',
  STRATEGY_STATS_DAILY: '/api/v4/console/lottery-strategy-stats/daily/:campaign_id',
  STRATEGY_STATS_TIER: '/api/v4/console/lottery-strategy-stats/tier-distribution/:campaign_id',
  STRATEGY_STATS_EXPERIENCE:
    '/api/v4/console/lottery-strategy-stats/experience-triggers/:campaign_id',
  STRATEGY_STATS_BUDGET: '/api/v4/console/lottery-strategy-stats/budget-consumption/:campaign_id',

  // 抽奖配额（后端路由: /api/v4/console/lottery-quota）
  QUOTA_RULES_LIST: '/api/v4/console/lottery-quota/rules',
  QUOTA_RULES_DETAIL: '/api/v4/console/lottery-quota/rules/:id',
  QUOTA_RULES_CREATE: '/api/v4/console/lottery-quota/rules',
  QUOTA_RULES_DISABLE: '/api/v4/console/lottery-quota/rules/:id/disable',
  QUOTA_USER_STATUS: '/api/v4/console/lottery-quota/users/:user_id/status',
  QUOTA_USER_BONUS: '/api/v4/console/lottery-quota/users/:user_id/bonus',
  QUOTA_USER_CHECK: '/api/v4/console/lottery-quota/users/:user_id/check',
  QUOTA_STATISTICS: '/api/v4/console/lottery-quota/statistics',

  // 概率调整和强制中奖
  PROBABILITY_ADJUST: '/api/v4/console/lottery-management/probability-adjust',
  INTERVENTION_FORCE_WIN: '/api/v4/console/lottery-management/force-win',

  // 活动定价
  PRICING_CONFIGS_ALL: '/api/v4/console/lottery-management/pricing-configs', // 批量获取所有定价配置
  PRICING_GET: '/api/v4/console/lottery-management/campaigns/:code/pricing',
  PRICING_VERSIONS: '/api/v4/console/lottery-management/campaigns/:code/pricing/versions',
  PRICING_CREATE: '/api/v4/console/lottery-management/campaigns/:code/pricing',
  PRICING_ACTIVATE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/activate',
  PRICING_ARCHIVE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/archive',
  PRICING_ROLLBACK: '/api/v4/console/lottery-management/campaigns/:code/pricing/rollback',
  PRICING_SCHEDULE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/schedule',

  // 活动条件
  CAMPAIGNS_LIST: '/api/v4/lottery/campaigns',
  CAMPAIGNS_DETAIL: '/api/v4/lottery/campaigns/:campaign_code',
  CAMPAIGNS_CONDITIONS: '/api/v4/activities/:code/conditions',
  CAMPAIGNS_CONFIGURE_CONDITIONS: '/api/v4/activities/:code/configure-conditions',

  // 抽奖监控（后端路由: /api/v4/console/lottery-monitoring）
  MONITORING_STATS: '/api/v4/console/lottery-monitoring/stats',
  MONITORING_HOURLY_LIST: '/api/v4/console/lottery-monitoring/hourly-metrics',
  MONITORING_HOURLY_DETAIL: '/api/v4/console/lottery-monitoring/hourly-metrics/:id',
  MONITORING_HOURLY_SUMMARY:
    '/api/v4/console/lottery-monitoring/hourly-metrics/summary/:campaign_id',
  MONITORING_USER_EXPERIENCE_LIST: '/api/v4/console/lottery-monitoring/user-experience-states',
  MONITORING_USER_EXPERIENCE_DETAIL:
    '/api/v4/console/lottery-monitoring/user-experience-states/:user_id/:campaign_id',
  MONITORING_USER_GLOBAL_LIST: '/api/v4/console/lottery-monitoring/user-global-states',
  MONITORING_USER_GLOBAL_DETAIL: '/api/v4/console/lottery-monitoring/user-global-states/:user_id',
  MONITORING_QUOTA_GRANTS_LIST: '/api/v4/console/lottery-monitoring/quota-grants',
  MONITORING_QUOTA_GRANTS_DETAIL: '/api/v4/console/lottery-monitoring/quota-grants/:id',
  MONITORING_USER_QUOTAS_LIST: '/api/v4/console/lottery-monitoring/user-quotas',
  MONITORING_USER_QUOTAS_DETAIL:
    '/api/v4/console/lottery-monitoring/user-quotas/:user_id/:campaign_id',
  MONITORING_USER_QUOTAS_STATS: '/api/v4/console/lottery-monitoring/user-quotas/stats/:campaign_id',

  // 用户抽奖档案聚合 API（P0）
  MONITORING_USER_PROFILE: '/api/v4/console/lottery-monitoring/user-profile/:user_id',
  // 活动 ROI 聚合 API（P1）
  MONITORING_CAMPAIGN_ROI: '/api/v4/console/lottery-monitoring/campaign-roi/:campaign_id',
  // 日报数据聚合 API（P2）
  ANALYTICS_DAILY_REPORT: '/api/v4/console/lottery-analytics/daily-report',

  // 核销订单 - 使用后端实际路径
  BUSINESS_RECORDS_REDEMPTION_ORDERS: '/api/v4/console/business-records/redemption-orders',
  BUSINESS_RECORDS_REDEMPTION_STATISTICS:
    '/api/v4/console/business-records/redemption-orders/statistics',
  BUSINESS_RECORDS_REDEMPTION_DETAIL:
    '/api/v4/console/business-records/redemption-orders/:order_id',
  BUSINESS_RECORDS_REDEMPTION_REDEEM:
    '/api/v4/console/business-records/redemption-orders/:order_id/redeem',
  BUSINESS_RECORDS_REDEMPTION_CANCEL:
    '/api/v4/console/business-records/redemption-orders/:order_id/cancel',
  BUSINESS_RECORDS_BATCH_EXPIRE: '/api/v4/console/business-records/redemption-orders/batch-expire',
  BUSINESS_RECORDS_EXPORT: '/api/v4/console/business-records/redemption-orders/export',

  // 活动预算（基于后端实际提供的端点）
  // 注意：后端没有提供 LIST、CREATE、DELETE、STATS、TOGGLE 端点
  // 预算管理通过 batch-status 和单活动操作完成
  CAMPAIGN_BUDGET_BATCH_STATUS: '/api/v4/console/campaign-budget/batch-status',
  CAMPAIGN_BUDGET_DETAIL: '/api/v4/console/campaign-budget/campaigns/:campaign_id',
  CAMPAIGN_BUDGET_UPDATE: '/api/v4/console/campaign-budget/campaigns/:campaign_id',
  CAMPAIGN_BUDGET_STATUS: '/api/v4/console/campaign-budget/campaigns/:campaign_id/budget-status',
  CAMPAIGN_BUDGET_POOL_ADD: '/api/v4/console/campaign-budget/campaigns/:campaign_id/pool/add',
  CAMPAIGN_BUDGET_VALIDATE: '/api/v4/console/campaign-budget/campaigns/:campaign_id/validate',
  CAMPAIGN_BUDGET_VALIDATE_LAUNCH:
    '/api/v4/console/campaign-budget/campaigns/:campaign_id/validate-for-launch',
  CAMPAIGN_BUDGET_USER: '/api/v4/console/campaign-budget/users/:user_id'
}

// ========== API 调用方法 ==========

export const LotteryAPI = {
  // ===== 基础抽奖 =====

  /**
   * 执行抽奖
   *
   * @async
   * @function execute
   * @description 为指定用户执行一次或多次抽奖操作，核心业务接口
   *
   * @param {LotteryExecuteParams} data - 抽奖执行参数
   * @param {number} data.campaign_id - 活动 ID（必填）
   * @param {number} data.user_id - 用户 ID（必填）
   * @param {number} [data.count=1] - 抽奖次数
   * @param {string} [data.campaign_code] - 活动代码（与 campaign_id 二选一）
   *
   * @returns {Promise<ApiResponse>} 抽奖结果
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 抽奖结果数据
   * @returns {Array<LotteryHistoryRecord>} return.data.results - 抽奖结果列表
   * @returns {number} return.data.total_cost - 总消耗
   *
   * @throws {ApiError} MISSING_CAMPAIGN_ID - 缺少活动 ID
   * @throws {ApiError} MISSING_USER_ID - 缺少用户 ID
   * @throws {ApiError} CAMPAIGN_NOT_FOUND - 活动不存在
   * @throws {ApiError} CAMPAIGN_INACTIVE - 活动未开启
   * @throws {ApiError} INSUFFICIENT_BALANCE - 余额不足
   *
   * @example
   * // 执行单次抽奖
   * const result = await LotteryAPI.execute({
   *   campaign_id: 1,
   *   user_id: 123,
   *   count: 1
   * })
   * logger.debug(result.data.results) // [{ prize_id: 5, prize_name: '一等奖', ... }]
   *
   * @example
   * // 执行十连抽
   * const result = await LotteryAPI.execute({
   *   campaign_id: 1,
   *   user_id: 123,
   *   count: 10
   * })
   */
  async execute(data) {
    return await request({ url: LOTTERY_ENDPOINTS.EXECUTE, method: 'POST', data })
  },

  /**
   * 获取抽奖历史记录
   *
   * @async
   * @function getHistory
   * @description 查询抽奖历史记录，支持按用户、活动、时间等条件筛选，支持分页
   *
   * @param {LotteryHistoryParams} [params={}] - 查询参数
   * @param {number} [params.user_id] - 用户 ID（按用户筛选）
   * @param {number} [params.campaign_id] - 活动 ID（按活动筛选）
   * @param {string} [params.prize_type] - 奖品类型筛选
   * @param {string} [params.start_date] - 开始日期（ISO 8601 格式）
   * @param {string} [params.end_date] - 结束日期（ISO 8601 格式）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量（最大 100）
   *
   * @returns {Promise<ApiResponse>} 分页的历史记录
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<LotteryHistoryRecord>} return.data.list - 历史记录列表
   * @returns {Object} return.data.pagination - 分页信息
   *
   * @throws {ApiError} INVALID_DATE_RANGE - 无效的日期范围
   * @throws {ApiError} INVALID_PAGE - 无效的页码
   *
   * @example
   * // 查询指定用户的抽奖历史
   * const history = await LotteryAPI.getHistory({
   *   user_id: 123,
   *   page: 1,
   *   page_size: 20
   * })
   *
   * @example
   * // 查询指定活动和时间范围的抽奖历史
   * const history = await LotteryAPI.getHistory({
   *   campaign_id: 1,
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-31',
   *   page: 1,
   *   page_size: 50
   * })
   */
  async getHistory(params = {}) {
    const url = LOTTERY_ENDPOINTS.HISTORY + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 预设管理 =====

  /**
   * 获取预设列表（管理员视角）
   *
   * @async
   * @function getPresetList
   * @description 获取所有用户的预设列表，支持筛选和分页（管理员查看所有预设记录）
   *
   * @param {PresetListParams} [params={}] - 查询参数
   * @param {string} [params.status='all'] - 状态筛选（pending/used/all）
   * @param {number} [params.user_id] - 用户 ID 筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量（最大 100）
   * @param {string} [params.order_by='created_at'] - 排序字段（created_at/queue_order）
   * @param {'ASC'|'DESC'} [params.order_dir='DESC'] - 排序方向
   *
   * @returns {Promise<ApiResponse>} 分页的预设列表
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<Object>} return.data.list - 预设列表
   * @returns {Object} return.data.pagination - 分页信息
   * @returns {Object} return.data.filters - 当前筛选条件
   *
   * @throws {ApiError} INVALID_STATUS - 无效的状态值
   * @throws {ApiError} INVALID_ORDER_BY - 无效的排序字段
   * @throws {ApiError} INVALID_PAGE - 无效的页码
   *
   * @example
   * // 获取所有待使用的预设
   * const presets = await LotteryAPI.getPresetList({
   *   status: 'pending',
   *   page: 1,
   *   page_size: 20
   * })
   */
  async getPresetList(params = {}) {
    const url = LOTTERY_ENDPOINTS.PRESET_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建抽奖预设
   *
   * @async
   * @function createPreset
   * @description 为用户创建抽奖预设队列（运营干预功能，用户无感知）
   *
   * @param {CreatePresetParams} data - 预设创建数据
   * @param {number} data.user_id - 目标用户 ID（必填）
   * @param {Array<PresetItem>} data.presets - 预设列表（必填）
   * @param {number} data.presets[].prize_id - 奖品 ID
   * @param {number} data.presets[].queue_order - 队列顺序（同一用户不能重复）
   *
   * @returns {Promise<ApiResponse>} 创建结果
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {number} return.data.user_id - 用户 ID
   * @returns {number} return.data.presets_count - 创建的预设数量
   * @returns {Array<Object>} return.data.created_presets - 创建的预设详情
   *
   * @throws {ApiError} INVALID_PARAMETERS - 参数无效
   * @throws {ApiError} USER_NOT_FOUND - 用户不存在
   * @throws {ApiError} PRIZE_NOT_FOUND - 奖品不存在
   * @throws {ApiError} TOO_MANY_PRESETS - 预设数量超限
   * @throws {ApiError} DUPLICATE_QUEUE_ORDER - 队列顺序重复
   *
   * @example
   * // 为用户创建预设队列
   * const result = await LotteryAPI.createPreset({
   *   user_id: 123,
   *   presets: [
   *     { prize_id: 5, queue_order: 1 },
   *     { prize_id: 3, queue_order: 2 }
   *   ]
   * })
   */
  async createPreset(data) {
    return await request({ url: LOTTERY_ENDPOINTS.PRESET_CREATE, method: 'POST', data })
  },

  /**
   * 获取用户预设
   *
   * @async
   * @function getUserPresets
   * @description 获取指定用户的预设列表
   *
   * @param {number} userId - 用户 ID（必填）
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 状态筛选（pending/used）
   *
   * @returns {Promise<ApiResponse>} 用户的预设列表
   *
   * @throws {ApiError} USER_NOT_FOUND - 用户不存在
   *
   * @example
   * const presets = await LotteryAPI.getUserPresets(123, { status: 'pending' })
   */
  async getUserPresets(userId, params = {}) {
    const url =
      buildURL(LOTTERY_ENDPOINTS.PRESET_USER_LIST, { user_id: userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 删除用户预设
   *
   * @async
   * @function deleteUserPresets
   * @description 删除指定用户的所有预设
   *
   * @param {number} userId - 用户 ID（必填）
   *
   * @returns {Promise<ApiResponse>} 删除结果
   *
   * @throws {ApiError} USER_NOT_FOUND - 用户不存在
   *
   * @example
   * await LotteryAPI.deleteUserPresets(123)
   */
  async deleteUserPresets(userId) {
    const url = buildURL(LOTTERY_ENDPOINTS.PRESET_DELETE, { user_id: userId })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取预设统计信息
   *
   * @async
   * @function getPresetStats
   * @description 获取系统级预设统计数据（管理员监控运营效果）
   *
   * @returns {Promise<ApiResponse>} 预设统计信息
   * @returns {boolean} return.success - 是否成功
   * @returns {PresetStats} return.data - 统计数据
   * @returns {number} return.data.total_presets - 总预设数量
   * @returns {number} return.data.pending_presets - 待使用预设数量
   * @returns {number} return.data.used_presets - 已使用预设数量
   * @returns {number} return.data.total_users_with_presets - 拥有预设的用户数量
   * @returns {string} return.data.usage_rate - 使用率（百分比）
   *
   * @example
   * const stats = await LotteryAPI.getPresetStats()
   * logger.info(`预设使用率: ${stats.data.usage_rate}`)
   */
  async getPresetStats() {
    return await request({ url: LOTTERY_ENDPOINTS.PRESET_STATS, method: 'GET' })
  },

  // ===== 奖品池管理 =====

  /**
   * 获取奖品列表
   *
   * @async
   * @function getPrizeList
   * @description 获取所有奖品的列表，支持按活动和状态筛选
   *
   * @param {PrizeListParams} [params={}] - 查询参数
   * @param {number} [params.campaign_id] - 活动 ID 筛选
   * @param {string} [params.status] - 状态筛选（active/inactive）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   *
   * @returns {Promise<ApiResponse>} 奖品列表
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<PrizeInfo>} return.data.list - 奖品列表
   * @returns {Object} return.data.pagination - 分页信息
   *
   * @example
   * // 获取指定活动的奖品列表
   * const prizes = await LotteryAPI.getPrizeList({
   *   campaign_id: 1,
   *   status: 'active',
   *   page: 1,
   *   page_size: 50
   * })
   */
  async getPrizeList(params = {}) {
    const url = LOTTERY_ENDPOINTS.PRIZE_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 批量添加奖品到奖品池
   *
   * @async
   * @function batchAddPrize
   * @description 批量添加奖品到指定活动的奖品池（概率总和必须为 1）
   *
   * @param {BatchAddPrizeParams} data - 奖品数据
   * @param {number} data.campaign_id - 活动 ID（必填）
   * @param {Array<PrizeData>} data.prizes - 奖品列表（必填）
   * @param {string} data.prizes[].name - 奖品名称
   * @param {string} data.prizes[].type - 奖品类型（physical/virtual/coupon/empty）
   * @param {number} data.prizes[].win_probability - 中奖概率（总和必须为 1）
   * @param {number} [data.prizes[].value=0] - 奖品价值
   * @param {number} [data.prizes[].total_quantity] - 总库存
   * @param {number} [data.prizes[].sort_order] - 排序顺序
   *
   * @returns {Promise<ApiResponse>} 添加结果
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {number} return.data.campaign_id - 活动 ID
   * @returns {number} return.data.added_prizes - 添加的奖品数量
   * @returns {Array<PrizeInfo>} return.data.prizes - 添加的奖品详情
   *
   * @throws {ApiError} MISSING_CAMPAIGN_ID - 缺少活动 ID
   * @throws {ApiError} VALIDATION_ERROR - 奖品数据验证失败
   * @throws {ApiError} PROBABILITY_SUM_ERROR - 概率总和不为 1
   * @throws {ApiError} SORT_ORDER_DUPLICATE - 排序值重复
   *
   * @example
   * // 批量添加奖品
   * const result = await LotteryAPI.batchAddPrize({
   *   campaign_id: 1,
   *   prizes: [
   *     { name: '一等奖', type: 'physical', win_probability: 0.01, value: 1000 },
   *     { name: '二等奖', type: 'virtual', win_probability: 0.09, value: 100 },
   *     { name: '三等奖', type: 'coupon', win_probability: 0.2, value: 10 },
   *     { name: '谢谢参与', type: 'empty', win_probability: 0.7, value: 0 }
   *   ]
   * })
   */
  async batchAddPrize(data) {
    return await request({ url: LOTTERY_ENDPOINTS.PRIZE_BATCH_ADD, method: 'POST', data })
  },

  /**
   * 更新奖品信息
   *
   * @async
   * @function updatePrize
   * @description 更新指定奖品的信息（不能将库存改为小于已使用数量）
   *
   * @param {number} prizeId - 奖品 ID（必填）
   * @param {UpdatePrizeParams} data - 更新数据
   * @param {string} [data.prize_name] - 奖品名称
   * @param {string} [data.prize_type] - 奖品类型
   * @param {number} [data.prize_value] - 奖品价值
   * @param {number} [data.win_probability] - 中奖概率
   * @param {number} [data.total_quantity] - 总库存
   * @param {string} [data.status] - 状态（active/inactive）
   * @param {number} [data.sort_order] - 排序顺序
   *
   * @returns {Promise<ApiResponse>} 更新结果
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<string>} return.data.updated_fields - 更新的字段列表
   *
   * @throws {ApiError} INVALID_PRIZE_ID - 无效的奖品 ID
   * @throws {ApiError} PRIZE_NOT_FOUND - 奖品不存在
   * @throws {ApiError} SORT_ORDER_DUPLICATE - 排序值重复
   * @throws {ApiError} INVALID_QUANTITY - 库存值无效
   *
   * @example
   * // 更新奖品信息
   * const result = await LotteryAPI.updatePrize(5, {
   *   prize_name: '特等奖',
   *   win_probability: 0.005,
   *   status: 'active'
   * })
   */
  async updatePrize(prizeId, data) {
    const url = buildURL(LOTTERY_ENDPOINTS.PRIZE_UPDATE, { prize_id: prizeId })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除奖品
   *
   * @async
   * @function deletePrize
   * @description 删除指定的奖品（仅当无中奖记录时可删除）
   *
   * @param {number} prizeId - 奖品 ID（必填）
   *
   * @returns {Promise<ApiResponse>} 删除结果
   *
   * @throws {ApiError} PRIZE_NOT_FOUND - 奖品不存在
   * @throws {ApiError} PRIZE_IN_USE - 奖品已被中奖，不能删除
   *
   * @example
   * await LotteryAPI.deletePrize(5)
   */
  async deletePrize(prizeId) {
    const url = buildURL(LOTTERY_ENDPOINTS.PRIZE_DELETE, { prize_id: prizeId })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 补充奖品库存
   *
   * @async
   * @function addPrizeStock
   * @description 为指定奖品补充库存数量
   *
   * @param {number} prizeId - 奖品 ID（必填）
   * @param {Object} data - 库存数据
   * @param {number} data.quantity - 补充数量（必填，必须大于 0）
   *
   * @returns {Promise<ApiResponse>} 补充结果
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {number} return.data.old_quantity - 原库存数量
   * @returns {number} return.data.add_quantity - 补充数量
   * @returns {number} return.data.new_quantity - 新库存数量
   *
   * @throws {ApiError} PRIZE_NOT_FOUND - 奖品不存在
   * @throws {ApiError} INVALID_QUANTITY - 补充数量必须大于 0
   *
   * @example
   * // 补充 100 个库存
   * const result = await LotteryAPI.addPrizeStock(5, { quantity: 100 })
   * logger.info(`库存已从 ${result.data.old_quantity} 增加到 ${result.data.new_quantity}`)
   */
  async addPrizeStock(prizeId, data) {
    const url = buildURL(LOTTERY_ENDPOINTS.PRIZE_ADD_STOCK, { prize_id: prizeId })
    return await request({ url, method: 'POST', data })
  },

  // ===== 策略配置 =====

  /**
   * 获取策略配置列表
   *
   * @async
   * @function getStrategyList
   * @description 获取抽奖策略配置列表，支持分页和筛选
   *
   * @param {StrategyListParams} [params={}] - 查询参数
   * @param {string} [params.config_group] - 配置分组筛选
   * @param {boolean} [params.is_active] - 是否启用
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   *
   * @returns {Promise<ApiResponse>} 策略列表
   * @returns {boolean} return.success - 是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<Object>} return.data.list - 策略列表
   * @returns {Object} return.data.pagination - 分页信息
   *
   * @example
   * // 获取所有启用的策略
   * const strategies = await LotteryAPI.getStrategyList({
   *   is_active: true,
   *   page: 1,
   *   page_size: 50
   * })
   */
  async getStrategyList(params = {}) {
    const url = LOTTERY_ENDPOINTS.STRATEGY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取策略详情
   *
   * @async
   * @function getStrategyDetail
   * @description 获取指定策略的详细信息
   *
   * @param {number} id - 策略 ID（必填）
   *
   * @returns {Promise<ApiResponse>} 策略详情
   *
   * @throws {ApiError} STRATEGY_CONFIG_DETAIL_FAILED - 获取详情失败
   *
   * @example
   * const strategy = await LotteryAPI.getStrategyDetail(1)
   */
  async getStrategyDetail(id) {
    const url = buildURL(LOTTERY_ENDPOINTS.STRATEGY_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建策略配置
   *
   * @async
   * @function createStrategy
   * @description 创建新的抽奖策略配置
   *
   * @param {Object} data - 策略数据
   * @param {string} data.config_group - 配置分组（必填）
   * @param {string} data.config_key - 配置键名（必填）
   * @param {*} data.config_value - 配置值（必填）
   * @param {string} [data.description] - 配置描述
   * @param {boolean} [data.is_active=true] - 是否启用
   * @param {number} [data.priority=0] - 配置优先级
   * @param {string} [data.effective_start] - 生效开始时间
   * @param {string} [data.effective_end] - 生效结束时间
   *
   * @returns {Promise<ApiResponse>} 创建结果
   *
   * @throws {ApiError} STRATEGY_CONFIG_CREATE_FAILED - 创建失败
   *
   * @example
   * const result = await LotteryAPI.createStrategy({
   *   config_group: 'probability',
   *   config_key: 'base_rate',
   *   config_value: 0.1,
   *   description: '基础中奖率',
   *   is_active: true
   * })
   */
  async createStrategy(data) {
    return await request({ url: LOTTERY_ENDPOINTS.STRATEGY_CREATE, method: 'POST', data })
  },

  /**
   * 更新策略配置
   *
   * @async
   * @function updateStrategy
   * @description 更新指定的策略配置
   *
   * @param {number} id - 策略 ID（必填）
   * @param {Object} data - 更新数据（均为可选）
   * @param {string} [data.config_group] - 配置分组
   * @param {string} [data.config_key] - 配置键名
   * @param {*} [data.config_value] - 配置值
   * @param {string} [data.description] - 配置描述
   * @param {boolean} [data.is_active] - 是否启用
   * @param {number} [data.priority] - 配置优先级
   * @param {string} [data.effective_start] - 生效开始时间
   * @param {string} [data.effective_end] - 生效结束时间
   *
   * @returns {Promise<ApiResponse>} 更新结果
   *
   * @throws {ApiError} STRATEGY_CONFIG_UPDATE_FAILED - 更新失败
   *
   * @example
   * const result = await LotteryAPI.updateStrategy(1, {
   *   config_value: 0.15,
   *   is_active: true
   * })
   */
  async updateStrategy(id, data) {
    const url = buildURL(LOTTERY_ENDPOINTS.STRATEGY_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除策略配置
   *
   * @async
   * @function deleteStrategy
   * @description 删除指定的策略配置
   *
   * @param {number} id - 策略 ID（必填）
   *
   * @returns {Promise<ApiResponse>} 删除结果
   *
   * @throws {ApiError} STRATEGY_CONFIG_DELETE_FAILED - 删除失败
   *
   * @example
   * await LotteryAPI.deleteStrategy(1)
   */
  async deleteStrategy(id) {
    const url = buildURL(LOTTERY_ENDPOINTS.STRATEGY_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 活动管理 =====

  /**
   * 获取活动列表
   *
   * @async
   * @function getCampaignList
   * @description 获取抽奖活动列表
   *
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   *
   * @returns {Promise<ApiResponse>} 活动列表
   *
   * @example
   * const campaigns = await LotteryAPI.getCampaignList({ status: 'active' })
   */
  async getCampaignList(params = {}) {
    const url = LOTTERY_ENDPOINTS.CAMPAIGN_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取活动详情
   *
   * @async
   * @function getCampaignDetail
   * @description 获取指定活动的详细信息
   *
   * @param {string} campaignId - 活动 ID（必填）
   *
   * @returns {Promise<ApiResponse>} 活动详情
   *
   * @throws {ApiError} CAMPAIGN_NOT_FOUND - 活动不存在
   *
   * @example
   * const campaign = await LotteryAPI.getCampaignDetail('1')
   */
  async getCampaignDetail(campaignId) {
    const url = buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_DETAIL, { campaign_id: campaignId })
    return await request({ url, method: 'GET' })
  },

  // ===== 概率调整 =====

  /**
   * 调整中奖概率
   *
   * @async
   * @function adjustProbability
   * @description 动态调整抽奖活动的中奖概率
   *
   * @param {Object} data - 调整数据
   * @param {number} data.campaign_id - 活动 ID（必填）
   * @param {number} data.prize_id - 奖品 ID（必填）
   * @param {number} data.new_probability - 新的概率值（必填，0-1 之间）
   * @param {string} [data.reason] - 调整原因
   *
   * @returns {Promise<ApiResponse>} 调整结果
   *
   * @throws {ApiError} INVALID_PROBABILITY - 概率值无效
   * @throws {ApiError} CAMPAIGN_NOT_FOUND - 活动不存在
   * @throws {ApiError} PRIZE_NOT_FOUND - 奖品不存在
   *
   * @example
   * const result = await LotteryAPI.adjustProbability({
   *   campaign_id: 1,
   *   prize_id: 5,
   *   new_probability: 0.05,
   *   reason: '活动期间提高中奖率'
   * })
   */
  async adjustProbability(data) {
    return await request({ url: LOTTERY_ENDPOINTS.PROBABILITY_ADJUST, method: 'POST', data })
  },

  // ===== 抽奖干预 =====

  /**
   * 获取干预列表
   *
   * @async
   * @function getInterventionList
   * @description 获取抽奖干预记录列表
   *
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 用户 ID 筛选
   * @param {string} [params.status] - 状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   *
   * @returns {Promise<ApiResponse>} 干预列表
   *
   * @example
   * const interventions = await LotteryAPI.getInterventionList({ status: 'pending' })
   */
  async getInterventionList(params = {}) {
    const url = LOTTERY_ENDPOINTS.INTERVENTION_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 强制中奖
   *
   * @async
   * @function forceWin
   * @description 为指定用户设置强制中奖（运营干预功能）
   *
   * @param {Object} data - 干预数据
   * @param {number} data.user_id - 用户 ID（必填）
   * @param {number} data.campaign_id - 活动 ID（必填）
   * @param {number} data.prize_id - 奖品 ID（必填）
   * @param {string} [data.reason] - 干预原因
   *
   * @returns {Promise<ApiResponse>} 干预结果
   *
   * @throws {ApiError} USER_NOT_FOUND - 用户不存在
   * @throws {ApiError} CAMPAIGN_NOT_FOUND - 活动不存在
   * @throws {ApiError} PRIZE_NOT_FOUND - 奖品不存在
   *
   * @example
   * const result = await LotteryAPI.forceWin({
   *   user_id: 123,
   *   campaign_id: 1,
   *   prize_id: 5,
   *   reason: '客户补偿'
   * })
   */
  async forceWin(data) {
    return await request({ url: LOTTERY_ENDPOINTS.INTERVENTION_FORCE_WIN, method: 'POST', data })
  },

  /**
   * 取消干预
   *
   * @async
   * @function cancelIntervention
   * @description 取消指定的抽奖干预
   *
   * @param {number} id - 干预 ID（必填）
   *
   * @returns {Promise<ApiResponse>} 取消结果
   *
   * @throws {ApiError} INTERVENTION_NOT_FOUND - 干预记录不存在
   * @throws {ApiError} INTERVENTION_ALREADY_USED - 干预已使用，无法取消
   *
   * @example
   * await LotteryAPI.cancelIntervention(1)
   */
  async cancelIntervention(id) {
    const url = buildURL(LOTTERY_ENDPOINTS.INTERVENTION_CANCEL, { id })
    return await request({ url, method: 'POST' })
  },

  // ===== 活动条件 =====

  /**
   * 获取活动条件
   *
   * @async
   * @function getActivityConditions
   * @description 获取指定活动的参与条件配置
   *
   * @param {string} code - 活动代码（必填）
   *
   * @returns {Promise<ApiResponse>} 活动条件配置
   *
   * @throws {ApiError} ACTIVITY_NOT_FOUND - 活动不存在
   *
   * @example
   * const conditions = await LotteryAPI.getActivityConditions('spring_festival')
   */
  async getActivityConditions(code) {
    const url = buildURL(LOTTERY_ENDPOINTS.CAMPAIGNS_CONDITIONS, { code })
    return await request({ url, method: 'GET' })
  },

  /**
   * 配置活动条件
   *
   * @async
   * @function configureActivityConditions
   * @description 配置指定活动的参与条件
   *
   * @param {string} code - 活动代码（必填）
   * @param {Object} data - 条件配置数据
   * @param {Object} [data.user_level] - 用户等级要求
   * @param {Object} [data.consumption] - 消费要求
   * @param {Object} [data.time_range] - 时间范围
   * @param {Array<string>} [data.whitelist] - 白名单用户
   *
   * @returns {Promise<ApiResponse>} 配置结果
   *
   * @throws {ApiError} ACTIVITY_NOT_FOUND - 活动不存在
   * @throws {ApiError} INVALID_CONDITIONS - 条件配置无效
   *
   * @example
   * const result = await LotteryAPI.configureActivityConditions('spring_festival', {
   *   user_level: { min: 3 },
   *   consumption: { min_amount: 100 },
   *   time_range: {
   *     start: '2026-01-01',
   *     end: '2026-01-31'
   *   }
   * })
   */
  async configureActivityConditions(code, data) {
    const url = buildURL(LOTTERY_ENDPOINTS.CAMPAIGNS_CONFIGURE_CONDITIONS, { code })
    return await request({ url, method: 'POST', data })
  }
}

export default LotteryAPI
