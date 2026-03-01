/**
 * 抽奖核心 API 模块
 *
 * @module api/lottery/core
 * @description 抽奖执行、预设管理、奖品池、活动管理相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-30
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const LOTTERY_CORE_ENDPOINTS = {
  // 基础抽奖
  EXECUTE: `${API_PREFIX}/lottery/execute`,
  HISTORY: `${API_PREFIX}/lottery/history`,
  STRATEGIES: `${API_PREFIX}/lottery/strategies`,

  // 预设管理
  PRESET_LIST: `${API_PREFIX}/lottery/preset/list`,
  PRESET_CREATE: `${API_PREFIX}/lottery/preset/create`,
  PRESET_USER_LIST: `${API_PREFIX}/lottery/preset/user/:user_id`,
  PRESET_DELETE: `${API_PREFIX}/lottery/preset/user/:user_id`,
  PRESET_STATS: `${API_PREFIX}/lottery/preset/stats`,

  // 奖品池管理
  PRIZE_LIST: `${API_PREFIX}/console/prize-pool/list`,
  PRIZE_BATCH_ADD: `${API_PREFIX}/console/prize-pool/batch-add`,
  PRIZE_UPDATE: `${API_PREFIX}/console/prize-pool/prize/:prize_id`,
  PRIZE_DELETE: `${API_PREFIX}/console/prize-pool/prize/:prize_id`,
  PRIZE_DETAIL: `${API_PREFIX}/console/prize-pool/prize/:prize_id`,
  PRIZE_ADD_STOCK: `${API_PREFIX}/console/prize-pool/prize/:prize_id/add-stock`,
  /** 按档位分组获取活动奖品（含档内占比、风险警告） */
  PRIZE_GROUPED: `${API_PREFIX}/console/prize-pool/:code/grouped`,
  /** 为指定活动添加单个奖品 */
  PRIZE_ADD_TO_CAMPAIGN: `${API_PREFIX}/console/prize-pool/:code/add-prize`,
  /** 批量更新奖品排序 */
  PRIZE_SORT_ORDER: `${API_PREFIX}/console/prize-pool/:code/sort-order`,
  /** 批量更新奖品库存 */
  PRIZE_BATCH_STOCK: `${API_PREFIX}/console/prize-pool/:code/batch-stock`,
  /** 设置单个奖品绝对库存值 */
  PRIZE_SET_STOCK: `${API_PREFIX}/console/prize-pool/prize/:prize_id/stock`,

  // 分群策略管理
  SEGMENT_RULE_LIST: `${API_PREFIX}/console/segment-rules`,
  SEGMENT_RULE_DETAIL: `${API_PREFIX}/console/segment-rules/:version_key`,
  SEGMENT_RULE_CREATE: `${API_PREFIX}/console/segment-rules`,
  SEGMENT_RULE_UPDATE: `${API_PREFIX}/console/segment-rules/:version_key`,
  SEGMENT_RULE_DELETE: `${API_PREFIX}/console/segment-rules/:version_key`,
  SEGMENT_RULE_FIELD_REGISTRY: `${API_PREFIX}/console/segment-rules/field-registry`,

  // 活动管理（管理后台 - 使用 console 路由）
  CAMPAIGN_LIST: `${API_PREFIX}/console/lottery-campaigns`,
  CAMPAIGN_DETAIL: `${API_PREFIX}/console/lottery-campaigns/:lottery_campaign_id`,

  // 活动 CRUD（通过 system-data 路由，支持创建/编辑/删除/状态变更）
  CAMPAIGN_CREATE: `${API_PREFIX}/console/system-data/lottery-campaigns`,
  CAMPAIGN_UPDATE: `${API_PREFIX}/console/system-data/lottery-campaigns/:lottery_campaign_id`,
  CAMPAIGN_STATUS: `${API_PREFIX}/console/system-data/lottery-campaigns/:lottery_campaign_id/status`,
  CAMPAIGN_DELETE: `${API_PREFIX}/console/system-data/lottery-campaigns/:lottery_campaign_id`,

  // 活动位置配置管理（控制活动在小程序中的展示位置和尺寸）
  PLACEMENT_GET: `${API_PREFIX}/console/system/placement`,
  PLACEMENT_UPDATE: `${API_PREFIX}/console/system/placement`,

  // 活动条件配置
  CAMPAIGN_CONDITIONS: `${API_PREFIX}/activities/:code/conditions`,
  CAMPAIGN_CONFIGURE_CONDITIONS: `${API_PREFIX}/activities/:code/configure-conditions`,

  // 活动策略配置（9策略活动级开关）
  CAMPAIGN_STRATEGY_CONFIG: `${API_PREFIX}/console/lottery-campaigns/:lottery_campaign_id/strategy-config`,

  /** 获取抽奖系统全局默认配置（积分定价配置页的全局值） */
  CAMPAIGN_GLOBAL_DEFAULTS: `${API_PREFIX}/console/lottery-campaigns/global-defaults`
}

// ========== API 调用方法 ==========

export const LotteryCoreAPI = {
  // ===== 基础抽奖 =====

  /**
   * 执行抽奖
   * @param {Object} data - 抽奖执行参数
   * @param {number} data.campaign_id - 活动 ID（必填）
   * @param {number} data.user_id - 用户 ID（必填）
   * @param {number} [data.count=1] - 抽奖次数
   * @returns {Promise<Object>} 抽奖结果
   */
  async execute(data) {
    return await request({ url: LOTTERY_CORE_ENDPOINTS.EXECUTE, method: 'POST', data })
  },

  /**
   * 获取抽奖历史记录
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 用户 ID
   * @param {number} [params.campaign_id] - 活动 ID
   * @param {string} [params.prize_type] - 奖品类型
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 分页的历史记录
   */
  async getHistory(params = {}) {
    const url = LOTTERY_CORE_ENDPOINTS.HISTORY + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 预设管理 =====

  /**
   * 获取预设列表（管理员视角）
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status='all'] - 状态筛选（pending/used/all）
   * @param {number} [params.user_id] - 用户 ID 筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 分页的预设列表
   */
  async getPresetList(params = {}) {
    const url = LOTTERY_CORE_ENDPOINTS.PRESET_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建抽奖预设
   * @param {Object} data - 预设创建数据
   * @param {number} data.user_id - 目标用户 ID
   * @param {Array} data.presets - 预设列表
   * @returns {Promise<Object>} 创建结果
   */
  async createPreset(data) {
    return await request({ url: LOTTERY_CORE_ENDPOINTS.PRESET_CREATE, method: 'POST', data })
  },

  /**
   * 获取用户预设
   * @param {number} userId - 用户 ID
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 用户的预设列表
   */
  async getUserPresets(userId, params = {}) {
    const url =
      buildURL(LOTTERY_CORE_ENDPOINTS.PRESET_USER_LIST, { user_id: userId }) +
      buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 删除用户预设
   * @param {number} userId - 用户 ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteUserPresets(userId) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.PRESET_DELETE, { user_id: userId })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取预设统计信息
   * @returns {Promise<Object>} 预设统计信息
   */
  async getPresetStats() {
    return await request({ url: LOTTERY_CORE_ENDPOINTS.PRESET_STATS, method: 'GET' })
  },

  // ===== 奖品池管理 =====

  /**
   * 获取奖品列表
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.campaign_id] - 活动 ID 筛选
   * @param {string} [params.status] - 状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 奖品列表
   */
  async getPrizeList(params = {}) {
    const url = LOTTERY_CORE_ENDPOINTS.PRIZE_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 批量添加奖品到奖品池
   * @param {Object} data - 奖品数据
   * @param {number} data.campaign_id - 活动 ID
   * @param {Array} data.prizes - 奖品列表
   * @returns {Promise<Object>} 添加结果
   */
  async batchAddPrize(data) {
    return await request({ url: LOTTERY_CORE_ENDPOINTS.PRIZE_BATCH_ADD, method: 'POST', data })
  },

  /**
   * 更新奖品信息
   * @param {number} prizeId - 奖品 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async updatePrize(prizeId, data) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.PRIZE_UPDATE, { prize_id: prizeId })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除奖品
   * @param {number} prizeId - 奖品 ID
   * @returns {Promise<Object>} 删除结果
   */
  async deletePrize(prizeId) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.PRIZE_DELETE, { prize_id: prizeId })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 补充奖品库存
   * @param {number} prizeId - 奖品 ID
   * @param {Object} data - 库存数据
   * @param {number} data.quantity - 补充数量
   * @returns {Promise<Object>} 补充结果
   */
  async addPrizeStock(prizeId, data) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.PRIZE_ADD_STOCK, { prize_id: prizeId })
    return await request({ url, method: 'POST', data })
  },

  // ===== 活动管理 =====

  /**
   * 获取活动列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 活动列表
   */
  async getCampaignList(params = {}) {
    const url = LOTTERY_CORE_ENDPOINTS.CAMPAIGN_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取活动详情
   * @param {number} lotteryCampaignId - 活动 ID
   * @returns {Promise<Object>} 活动详情
   */
  async getCampaignDetail(lotteryCampaignId) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_DETAIL, {
      lottery_campaign_id: lotteryCampaignId
    })
    return await request({ url, method: 'GET' })
  },

  // ===== 活动 CRUD =====

  /**
   * 创建活动（含展示配置 display_mode/effect_theme 等）
   * @param {Object} data - 活动数据（直接使用后端 snake_case 字段名）
   * @returns {Promise<Object>} 创建结果
   */
  async createCampaign(data) {
    return await request({ url: LOTTERY_CORE_ENDPOINTS.CAMPAIGN_CREATE, method: 'POST', data })
  },

  /**
   * 更新活动（含展示配置字段）
   * @param {number} lotteryCampaignId - 活动 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateCampaign(lotteryCampaignId, data) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_UPDATE, {
      lottery_campaign_id: lotteryCampaignId
    })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 更新活动状态
   * @param {number} lotteryCampaignId - 活动 ID
   * @param {Object} data - 状态数据 { status: 'active'|'paused'|'ended'|'cancelled' }
   * @returns {Promise<Object>} 更新结果
   */
  async updateCampaignStatus(lotteryCampaignId, data) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_STATUS, {
      lottery_campaign_id: lotteryCampaignId
    })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除活动
   * @param {number} lotteryCampaignId - 活动 ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteCampaign(lotteryCampaignId) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_DELETE, {
      lottery_campaign_id: lotteryCampaignId
    })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 活动位置配置 =====

  /**
   * 获取活动位置配置
   * @returns {Promise<Object>} 位置配置 { placements: [...] }
   */
  async getPlacement() {
    return await request({ url: LOTTERY_CORE_ENDPOINTS.PLACEMENT_GET, method: 'GET' })
  },

  /**
   * 更新活动位置配置（保存后前端下次打开即生效）
   * @param {Object} data - { placements: [...] }
   * @returns {Promise<Object>} 更新结果
   */
  async updatePlacement(data) {
    return await request({ url: LOTTERY_CORE_ENDPOINTS.PLACEMENT_UPDATE, method: 'PUT', data })
  },

  // ===== 活动条件 =====

  /**
   * 获取活动条件
   * @param {string} code - 活动代码
   * @returns {Promise<Object>} 活动条件配置
   */
  async getActivityConditions(code) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_CONDITIONS, { code })
    return await request({ url, method: 'GET' })
  },

  /**
   * 配置活动条件
   * @param {string} code - 活动代码
   * @param {Object} data - 条件配置数据
   * @returns {Promise<Object>} 配置结果
   */
  async configureActivityConditions(code, data) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_CONFIGURE_CONDITIONS, { code })
    return await request({ url, method: 'POST', data })
  },

  // ===== 活动策略配置（9策略活动级开关） =====

  /**
   * 获取某活动的全部策略配置
   * @param {number} lotteryCampaignId - 活动ID
   * @returns {Promise<Object>} { lottery_campaign_id, config: { pity: {...}, ... } }
   */
  async getStrategyConfig(lotteryCampaignId) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_STRATEGY_CONFIG, {
      lottery_campaign_id: lotteryCampaignId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 批量更新某活动的策略配置
   * @param {number} lotteryCampaignId - 活动ID
   * @param {Object} config - 配置对象 { pity: { enabled: false }, ... }
   * @returns {Promise<Object>} 更新结果
   */
  async updateStrategyConfig(lotteryCampaignId, config) {
    const url = buildURL(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_STRATEGY_CONFIG, {
      lottery_campaign_id: lotteryCampaignId
    })
    return await request({ url, method: 'PUT', data: { config } })
  },

  /**
   * 获取抽奖系统全局默认配置
   * @returns {Promise<Object>} { global_defaults, priority_rules }
   */
  async getGlobalDefaults() {
    return await request({ url: LOTTERY_CORE_ENDPOINTS.CAMPAIGN_GLOBAL_DEFAULTS, method: 'GET' })
  }
}

export default LotteryCoreAPI
