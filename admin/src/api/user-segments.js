/**
 * 用户画像分析 API
 * @description 用户分层、活跃度分析、行为漏斗
 * @version 1.0.0
 * @date 2026-02-01
 */

import { API_PREFIX, authHeaders, handleResponse, buildURL } from './base.js'

// 用户画像端点（后端挂载在 /console/users 下）
export const USER_SEGMENTS_ENDPOINTS = {
  SEGMENTS: `${API_PREFIX}/console/users/segments`,
  SEGMENT_USERS: (type) => `${API_PREFIX}/console/users/segments/${type}`,
  ACTIVITY_HEATMAP: `${API_PREFIX}/console/users/activity-heatmap`,
  EXCHANGE_PREFERENCES: `${API_PREFIX}/console/users/exchange-preferences`,
  FUNNEL: `${API_PREFIX}/console/users/funnel`
}

/**
 * 用户画像分析 API
 */
export const UserSegmentsAPI = {
  /**
   * 获取用户分层统计
   * @returns {Promise<Object>} 分层统计数据
   */
  async getSegments() {
    const response = await fetch(USER_SEGMENTS_ENDPOINTS.SEGMENTS, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取分层用户列表
   * @param {string} segmentType - 分层类型 (activity_high, activity_medium, activity_low, activity_silent, value_high, value_medium, value_normal)
   * @param {Object} params - 分页参数
   * @returns {Promise<Object>} 用户列表
   */
  async getSegmentUsers(segmentType, params = {}) {
    const url = buildURL(USER_SEGMENTS_ENDPOINTS.SEGMENT_USERS(segmentType), params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取活跃时段热力图
   * @param {Object} params - 查询参数
   * @param {number} [params.days] - 统计天数（默认7天）
   * @returns {Promise<Object>} 热力图数据
   */
  async getActivityHeatmap(params = {}) {
    const url = buildURL(USER_SEGMENTS_ENDPOINTS.ACTIVITY_HEATMAP, params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取兑换偏好分析
   * @param {Object} params - 查询参数
   * @param {number} [params.limit] - 返回条数
   * @returns {Promise<Object>} 偏好数据
   */
  async getExchangePreferences(params = {}) {
    const url = buildURL(USER_SEGMENTS_ENDPOINTS.EXCHANGE_PREFERENCES, params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取用户行为漏斗
   * @param {Object} params - 查询参数
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @returns {Promise<Object>} 漏斗数据
   */
  async getFunnel(params = {}) {
    const url = buildURL(USER_SEGMENTS_ENDPOINTS.FUNNEL, params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  }
}

