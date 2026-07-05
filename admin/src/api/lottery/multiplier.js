/**
 * 水晶奖品倍率活动 API 模块
 *
 * @module api/lottery/multiplier
 * @description 倍率规则 CRUD、成本水位、人群选择器数据源、活动预算归集规则 CRUD
 * @version 1.0.0
 * @date 2026-07-06
 *
 * 后端路由（snake_case 契约，字段名 = 数据库列名，不做映射）：
 * - /api/v4/console/multiplier-rules                  倍率规则 CRUD + 成本水位
 * - /api/v4/console/ad-tags                           用户标签选项
 * - /api/v4/console/lottery-campaigns/:id/segment-options  活动分群选项
 * - /api/v4/console/lottery-management/growth-levels  成长等级选项（复用已有端点）
 * - /api/v4/console/event-budget-collection-rules     活动预算归集规则 CRUD
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const MULTIPLIER_ENDPOINTS = {
  // 倍率规则 CRUD
  RULE_LIST: `${API_PREFIX}/console/multiplier-rules`,
  RULE_DETAIL: `${API_PREFIX}/console/multiplier-rules/:id`,
  RULE_CREATE: `${API_PREFIX}/console/multiplier-rules`,
  RULE_UPDATE: `${API_PREFIX}/console/multiplier-rules/:id`,
  RULE_STATUS: `${API_PREFIX}/console/multiplier-rules/:id/status`,
  RULE_DELETE: `${API_PREFIX}/console/multiplier-rules/:id`,
  RULE_COST: `${API_PREFIX}/console/multiplier-rules/:id/cost`,

  // 人群选择器数据源（§16.2）
  SEGMENT_OPTIONS: `${API_PREFIX}/console/lottery-campaigns/:lottery_campaign_id/segment-options`,
  GROWTH_LEVELS: `${API_PREFIX}/console/lottery-management/growth-levels`,
  AD_TAGS: `${API_PREFIX}/console/ad-tags`,

  // 活动预算归集规则 CRUD（§12.10）
  COLLECTION_RULE_LIST: `${API_PREFIX}/console/event-budget-collection-rules`,
  COLLECTION_RULE_DETAIL: `${API_PREFIX}/console/event-budget-collection-rules/:id`,
  COLLECTION_RULE_CREATE: `${API_PREFIX}/console/event-budget-collection-rules`,
  COLLECTION_RULE_UPDATE: `${API_PREFIX}/console/event-budget-collection-rules/:id`,
  COLLECTION_RULE_STATUS: `${API_PREFIX}/console/event-budget-collection-rules/:id/status`,
  COLLECTION_RULE_DELETE: `${API_PREFIX}/console/event-budget-collection-rules/:id`,

  // 监控看板聚合（§13.2 ECharts 数据源）
  ANALYTICS_EVENT_POINTS_TREND: `${API_PREFIX}/console/multiplier-analytics/event-points-trend`,
  ANALYTICS_EVENT_POINTS_OVERVIEW: `${API_PREFIX}/console/multiplier-analytics/event-points-overview`,
  ANALYTICS_BUDGET_DISTRIBUTION: `${API_PREFIX}/console/multiplier-analytics/budget-distribution`,

  // 客服查询（§13.3 "为什么翻/没翻"）
  USER_EXPLAIN: `${API_PREFIX}/console/multiplier-user-explain`,

  // 运维视图（§13.4 到期清零执行历史）
  EXPIRY_CLEAR_HISTORY: `${API_PREFIX}/console/event-budget-collection-rules/expiry-clear-history`
}

// ========== API 方法 ==========

export const MultiplierAPI = {
  /* ---------- 倍率规则 ---------- */

  /**
   * 获取倍率规则列表（分页）
   * @param {Object} params - { lottery_campaign_id?, status?, page?, page_size? }
   * @returns {Promise<Object>} 分页响应
   */
  async getRules(params = {}) {
    return await request({ url: MULTIPLIER_ENDPOINTS.RULE_LIST + buildQueryString(params) })
  },

  /**
   * 获取倍率规则详情（含 targets）
   * @param {number} id - 规则ID（multiplier_campaign_id）
   * @returns {Promise<Object>} 规则详情
   */
  async getRule(id) {
    return await request({ url: buildURL(MULTIPLIER_ENDPOINTS.RULE_DETAIL, { id }) })
  },

  /**
   * 创建倍率规则（后端要求 Header Idempotency-Key，防重复创建）
   * @param {Object} data - 规则请求体（snake_case，含 targets 数组）
   * @returns {Promise<Object>} 创建结果
   */
  async createRule(data) {
    return await request({
      url: MULTIPLIER_ENDPOINTS.RULE_CREATE,
      method: 'POST',
      data,
      headers: {
        'Idempotency-Key': `multiplier_rule_create_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      }
    })
  },

  /**
   * 更新倍率规则（targets 显式提供时全量替换）
   * @param {number} id - 规则ID
   * @param {Object} data - 更新字段
   * @returns {Promise<Object>} 更新结果
   */
  async updateRule(id, data) {
    return await request({
      url: buildURL(MULTIPLIER_ENDPOINTS.RULE_UPDATE, { id }),
      method: 'PUT',
      data
    })
  },

  /**
   * 开关倍率规则（active/inactive，应急秒级下线）
   * @param {number} id - 规则ID
   * @param {string} status - active/inactive
   * @returns {Promise<Object>} 更新结果
   */
  async updateRuleStatus(id, status) {
    return await request({
      url: buildURL(MULTIPLIER_ENDPOINTS.RULE_STATUS, { id }),
      method: 'PATCH',
      data: { status }
    })
  },

  /**
   * 删除倍率规则（级联删除 targets）
   * @param {number} id - 规则ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteRule(id) {
    return await request({
      url: buildURL(MULTIPLIER_ENDPOINTS.RULE_DELETE, { id }),
      method: 'DELETE'
    })
  },

  /**
   * 获取规则成本水位（extra_cost_used/limit + 受益人数 + 多发水晶总量）
   * @param {number} id - 规则ID
   * @returns {Promise<Object>} 成本水位
   */
  async getRuleCost(id) {
    return await request({ url: buildURL(MULTIPLIER_ENDPOINTS.RULE_COST, { id }) })
  },

  /* ---------- 人群选择器数据源 ---------- */

  /**
   * 获取某活动可选的 segment_key 列表（活动 resolver_version 同源，D-12 防漂移）
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @returns {Promise<Object>} { options: [{ segment_key, description }], total }
   */
  async getSegmentOptions(lottery_campaign_id) {
    return await request({
      url: buildURL(MULTIPLIER_ENDPOINTS.SEGMENT_OPTIONS, { lottery_campaign_id })
    })
  },

  /**
   * 获取成长等级选项（user_growth_levels 阶梯，复用现有端点）
   * @returns {Promise<Object>} 等级列表
   */
  async getGrowthLevels() {
    return await request({ url: MULTIPLIER_ENDPOINTS.GROWTH_LEVELS })
  },

  /**
   * 获取用户标签选项（user_ad_tags 去重 tag_key，可能为空 → 前端提示"暂无标签数据"）
   * @returns {Promise<Object>} { tags: [{ tag_key }], total }
   */
  async getAdTags() {
    return await request({ url: MULTIPLIER_ENDPOINTS.AD_TAGS })
  },

  /* ---------- 活动预算归集规则 ---------- */

  /**
   * 获取归集规则列表（分页）
   * @param {Object} params - { lottery_campaign_id?, status?, page?, page_size? }
   * @returns {Promise<Object>} 分页响应
   */
  async getCollectionRules(params = {}) {
    return await request({
      url: MULTIPLIER_ENDPOINTS.COLLECTION_RULE_LIST + buildQueryString(params)
    })
  },

  /**
   * 创建归集规则
   * @param {Object} data - 规则请求体（snake_case）
   * @returns {Promise<Object>} 创建结果
   */
  async createCollectionRule(data) {
    return await request({
      url: MULTIPLIER_ENDPOINTS.COLLECTION_RULE_CREATE,
      method: 'POST',
      data
    })
  },

  /**
   * 更新归集规则（禁止改绑活动）
   * @param {number} id - 规则ID（collection_rule_id）
   * @param {Object} data - 更新字段
   * @returns {Promise<Object>} 更新结果
   */
  async updateCollectionRule(id, data) {
    return await request({
      url: buildURL(MULTIPLIER_ENDPOINTS.COLLECTION_RULE_UPDATE, { id }),
      method: 'PUT',
      data
    })
  },

  /**
   * 开关归集规则（active/inactive，应急秒级停止归集）
   * @param {number} id - 规则ID
   * @param {string} status - active/inactive
   * @returns {Promise<Object>} 更新结果
   */
  async updateCollectionRuleStatus(id, status) {
    return await request({
      url: buildURL(MULTIPLIER_ENDPOINTS.COLLECTION_RULE_STATUS, { id }),
      method: 'PATCH',
      data: { status }
    })
  },

  /**
   * 删除归集规则
   * @param {number} id - 规则ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteCollectionRule(id) {
    return await request({
      url: buildURL(MULTIPLIER_ENDPOINTS.COLLECTION_RULE_DELETE, { id }),
      method: 'DELETE'
    })
  },

  /* ---------- 监控看板聚合（§13.2 ECharts） ---------- */

  /**
   * 活动积分发放/消耗按日趋势
   * @param {Object} params - { days?: number（默认30，最大180） }
   * @returns {Promise<Object>} { range_days, series: [{ date, issued, consumed }] }
   */
  async getEventPointsTrend(params = {}) {
    return await request({
      url: MULTIPLIER_ENDPOINTS.ANALYTICS_EVENT_POINTS_TREND + buildQueryString(params)
    })
  },

  /**
   * 活动积分在途余额概览（发放/消耗/在途/到期清零量/持有人数）
   * @returns {Promise<Object>} { total_issued, total_consumed, expired_cleared, in_flight, holder_count }
   */
  async getEventPointsOverview() {
    return await request({ url: MULTIPLIER_ENDPOINTS.ANALYTICS_EVENT_POINTS_OVERVIEW })
  },

  /**
   * 个人活动预算账户余额分布（防套利监控，识别异常高余额囤积）
   * @param {Object} params - { asset_code?: 'event_points'|'budget_points' }
   * @returns {Promise<Object>} { asset_code, buckets: [{ bucket_label, holder_count, total_amount }] }
   */
  async getBudgetDistribution(params = {}) {
    return await request({
      url: MULTIPLIER_ENDPOINTS.ANALYTICS_BUDGET_DISTRIBUTION + buildQueryString(params)
    })
  },

  /* ---------- 客服查询（§13.3） ---------- */

  /**
   * 查某用户抽奖水晶倍率解释（"为什么翻/没翻"）
   * @param {Object} params - { user_id（必填）, lottery_campaign_id?, limit? }
   * @returns {Promise<Object>} { user_id, total, records: [...] }
   */
  async getUserExplain(params = {}) {
    return await request({
      url: MULTIPLIER_ENDPOINTS.USER_EXPLAIN + buildQueryString(params)
    })
  },

  /* ---------- 运维视图（§13.4） ---------- */

  /**
   * 到期清零执行历史（执行状态/历史清零量）
   * @param {Object} params - { days?: number（默认30，最大180） }
   * @returns {Promise<Object>} { enabled, range_days, total_cleared_amount, total_cleared_count, daily: [...] }
   */
  async getExpiryClearHistory(params = {}) {
    return await request({
      url: MULTIPLIER_ENDPOINTS.EXPIRY_CLEAR_HISTORY + buildQueryString(params)
    })
  }
}

export default MultiplierAPI
