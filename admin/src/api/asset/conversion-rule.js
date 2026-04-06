/**
 * 统一资产转换规则 API 模块
 *
 * @module api/asset/conversion-rule
 * @description 统一资产转换规则管理（合并原 exchange-rate + material/conversion-rules）
 * @version 1.0.0
 * @date 2026-04-05
 *
 * 后端路由：
 * - 管理后台：/api/v4/console/assets/conversion-rules
 * - 用户端：/api/v4/assets/conversion
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const CONVERSION_RULE_ENDPOINTS = {
  /** 管理后台 — 规则列表 */
  LIST: `${API_PREFIX}/console/assets/conversion-rules`,
  /** 管理后台 — 创建规则 */
  CREATE: `${API_PREFIX}/console/assets/conversion-rules`,
  /** 管理后台 — 规则详情 */
  DETAIL: `${API_PREFIX}/console/assets/conversion-rules/:id`,
  /** 管理后台 — 更新规则 */
  UPDATE: `${API_PREFIX}/console/assets/conversion-rules/:id`,
  /** 管理后台 — 更新规则状态 */
  STATUS: `${API_PREFIX}/console/assets/conversion-rules/:id/status`,
  /** 材料资产类型列表（复用原有端点） */
  ASSET_TYPES: `${API_PREFIX}/console/material/asset-types`
}

// ========== API 调用方法 ==========

export const ConversionRuleAPI = {
  /**
   * 获取转换规则列表（管理后台）
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} API 响应
   */
  async getRules(params = {}) {
    const url = CONVERSION_RULE_ENDPOINTS.LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取转换规则详情
   * @param {number} id - 规则ID
   * @returns {Promise<Object>} API 响应
   */
  async getRuleDetail(id) {
    const url = buildURL(CONVERSION_RULE_ENDPOINTS.DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建转换规则
   * @param {Object} data - 规则数据
   * @returns {Promise<Object>} API 响应
   */
  async createRule(data) {
    return await request({
      url: CONVERSION_RULE_ENDPOINTS.CREATE,
      method: 'POST',
      data
    })
  },

  /**
   * 更新转换规则
   * @param {number} id - 规则ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} API 响应
   */
  async updateRule(id, data) {
    const url = buildURL(CONVERSION_RULE_ENDPOINTS.UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 更新转换规则状态
   * @param {number} id - 规则ID
   * @param {string} status - 新状态（active/paused/disabled）
   * @returns {Promise<Object>} API 响应
   */
  async updateRuleStatus(id, status) {
    const url = buildURL(CONVERSION_RULE_ENDPOINTS.STATUS, { id })
    return await request({ url, method: 'PATCH', data: { status } })
  },

  /**
   * 获取材料资产类型列表（用于下拉选择）
   * @returns {Promise<Object>} API 响应
   */
  async getAssetTypes() {
    return await request({ url: CONVERSION_RULE_ENDPOINTS.ASSET_TYPES, method: 'GET' })
  }
}
