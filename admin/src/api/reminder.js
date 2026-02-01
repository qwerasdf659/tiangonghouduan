/**
 * 智能提醒系统 API
 * @description 提醒规则配置和历史通知管理
 * @version 1.0.0
 * @date 2026-02-01
 */

import { API_PREFIX, authHeaders, handleResponse, buildURL } from './base.js'

// 提醒系统端点
export const REMINDER_ENDPOINTS = {
  // 规则管理
  RULES: `${API_PREFIX}/console/reminder-rules`,
  RULE_DETAIL: id => `${API_PREFIX}/console/reminder-rules/${id}`,
  RULE_TOGGLE: id => `${API_PREFIX}/console/reminder-rules/${id}/toggle`,
  RULE_TEST: id => `${API_PREFIX}/console/reminder-rules/${id}/test`,
  RULE_EXECUTE: id => `${API_PREFIX}/console/reminder-rules/${id}/execute`,
  // 提醒历史（在 reminder-rules 路由下）
  HISTORY: `${API_PREFIX}/console/reminder-rules/history`,
  HISTORY_STATS: `${API_PREFIX}/console/reminder-rules/history/stats`,
  HISTORY_DETAIL: id => `${API_PREFIX}/console/reminder-rules/history/${id}`
}

/**
 * 提醒规则 API
 */
export const ReminderRulesAPI = {
  /**
   * 获取规则列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 规则列表
   */
  async getRules(params = {}) {
    const url = buildURL(REMINDER_ENDPOINTS.RULES, params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取规则详情
   * @param {number} ruleId - 规则ID
   * @returns {Promise<Object>} 规则详情
   */
  async getRuleDetail(ruleId) {
    const response = await fetch(REMINDER_ENDPOINTS.RULE_DETAIL(ruleId), {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 创建规则
   * @param {Object} data - 规则数据
   * @returns {Promise<Object>} 创建结果
   */
  async createRule(data) {
    const response = await fetch(REMINDER_ENDPOINTS.RULES, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return handleResponse(response)
  },

  /**
   * 更新规则
   * @param {number} ruleId - 规则ID
   * @param {Object} data - 规则数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateRule(ruleId, data) {
    const response = await fetch(REMINDER_ENDPOINTS.RULE_DETAIL(ruleId), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return handleResponse(response)
  },

  /**
   * 删除规则
   * @param {number} ruleId - 规则ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteRule(ruleId) {
    const response = await fetch(REMINDER_ENDPOINTS.RULE_DETAIL(ruleId), {
      method: 'DELETE',
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 切换规则状态
   * @param {number} ruleId - 规则ID
   * @param {boolean} isEnabled - 是否启用
   * @returns {Promise<Object>} 切换结果
   */
  async toggleRule(ruleId, isEnabled) {
    const response = await fetch(REMINDER_ENDPOINTS.RULE_TOGGLE(ruleId), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: isEnabled })
    })
    return handleResponse(response)
  },

  /**
   * 测试规则（检查是否会触发）
   * @param {number} ruleId - 规则ID
   * @returns {Promise<Object>} 测试结果
   */
  async testRule(ruleId) {
    const response = await fetch(REMINDER_ENDPOINTS.RULE_TEST(ruleId), {
      method: 'POST',
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 手动执行规则
   * @param {number} ruleId - 规则ID
   * @returns {Promise<Object>} 执行结果
   */
  async executeRule(ruleId) {
    const response = await fetch(REMINDER_ENDPOINTS.RULE_EXECUTE(ruleId), {
      method: 'POST',
      headers: authHeaders()
    })
    return handleResponse(response)
  }
}

/**
 * 提醒历史 API
 */
export const ReminderHistoryAPI = {
  /**
   * 获取提醒历史列表
   * @param {Object} params - 查询参数
   * @param {number} [params.rule_id] - 规则ID筛选
   * @param {string} [params.status] - 状态筛选 (pending/sent/failed)
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   * @returns {Promise<Object>} 历史列表
   */
  async getHistory(params = {}) {
    const url = buildURL(REMINDER_ENDPOINTS.HISTORY, params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取提醒统计数据
   * @param {Object} params - 查询参数
   * @param {number} [params.rule_id] - 规则ID筛选
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 统计数据
   */
  async getStats(params = {}) {
    const url = buildURL(REMINDER_ENDPOINTS.HISTORY_STATS, params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取提醒历史详情
   * @param {number} historyId - 历史记录ID
   * @returns {Promise<Object>} 历史详情
   */
  async getHistoryDetail(historyId) {
    const response = await fetch(REMINDER_ENDPOINTS.HISTORY_DETAIL(historyId), {
      headers: authHeaders()
    })
    return handleResponse(response)
  }
}
