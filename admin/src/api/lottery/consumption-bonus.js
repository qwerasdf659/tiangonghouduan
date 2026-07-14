/**
 * 消费加成活动 API 模块（多活动独立倍率，方案C）
 *
 * @module api/lottery/consumption-bonus
 * @description 消费加成活动规则 CRUD + 状态开关
 * @version 1.0.0
 * @date 2026-07-15
 *
 * 后端路由（snake_case 契约，字段名 = 数据库列名，不做映射）：
 * - /api/v4/console/consumption-bonus-rules            规则 CRUD
 * - /api/v4/console/consumption-bonus-rules/:id/status 状态开关
 *
 * 业务说明：
 * - 全平台活动（store_ids/merchant_ids 均 null）与单商家专属活动（任一非空）并存，商家专属优先。
 * - 命中的 bonus_rate 在消费提交时锁定，与等级倍率加法叠加，受总倍数 3.0 硬封顶。
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const CONSUMPTION_BONUS_ENDPOINTS = {
  RULE_LIST: `${API_PREFIX}/console/consumption-bonus-rules`,
  RULE_DETAIL: `${API_PREFIX}/console/consumption-bonus-rules/:id`,
  RULE_CREATE: `${API_PREFIX}/console/consumption-bonus-rules`,
  RULE_UPDATE: `${API_PREFIX}/console/consumption-bonus-rules/:id`,
  RULE_STATUS: `${API_PREFIX}/console/consumption-bonus-rules/:id/status`,
  RULE_DELETE: `${API_PREFIX}/console/consumption-bonus-rules/:id`
}

// ========== API 方法 ==========

export const ConsumptionBonusAPI = {
  /**
   * 获取消费加成规则列表（分页）
   * @param {Object} params - { status?, page?, page_size? }
   * @returns {Promise<Object>} 分页响应
   */
  async getRules(params = {}) {
    return await request({
      url: CONSUMPTION_BONUS_ENDPOINTS.RULE_LIST + buildQueryString(params)
    })
  },

  /**
   * 获取规则详情
   * @param {number} id - 规则ID（consumption_bonus_rule_id）
   * @returns {Promise<Object>} 规则详情
   */
  async getRule(id) {
    return await request({ url: buildURL(CONSUMPTION_BONUS_ENDPOINTS.RULE_DETAIL, { id }) })
  },

  /**
   * 创建消费加成规则
   * @param {Object} data - 规则请求体（snake_case）
   * @returns {Promise<Object>} 创建结果
   */
  async createRule(data) {
    return await request({
      url: CONSUMPTION_BONUS_ENDPOINTS.RULE_CREATE,
      method: 'POST',
      data
    })
  },

  /**
   * 更新消费加成规则
   * @param {number} id - 规则ID
   * @param {Object} data - 更新字段
   * @returns {Promise<Object>} 更新结果
   */
  async updateRule(id, data) {
    return await request({
      url: buildURL(CONSUMPTION_BONUS_ENDPOINTS.RULE_UPDATE, { id }),
      method: 'PUT',
      data
    })
  },

  /**
   * 开关规则（active/inactive，应急秒级启停）
   * @param {number} id - 规则ID
   * @param {string} status - active/inactive
   * @returns {Promise<Object>} 更新结果
   */
  async updateRuleStatus(id, status) {
    return await request({
      url: buildURL(CONSUMPTION_BONUS_ENDPOINTS.RULE_STATUS, { id }),
      method: 'PATCH',
      data: { status }
    })
  },

  /**
   * 删除规则
   * @param {number} id - 规则ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteRule(id) {
    return await request({
      url: buildURL(CONSUMPTION_BONUS_ENDPOINTS.RULE_DELETE, { id }),
      method: 'DELETE'
    })
  }
}

export default ConsumptionBonusAPI
