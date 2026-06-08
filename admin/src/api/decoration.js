/**
 * 星石虚拟装饰管理 API 客户端（模块D）
 *
 * @module api/decoration
 * @description 装饰 SKU 的控制台管理接口封装（创建/更新/上下架）
 *
 * 后端契约（以后端为准）：
 * - GET  /api/v4/console/decorations          列出全部装饰SKU
 * - POST /api/v4/console/decorations          创建装饰SKU（草稿态）
 * - PUT  /api/v4/console/decorations/:id      更新装饰SKU（含 status 上下架）
 */

import { API_PREFIX, request, buildURL } from './base.js'

const CONSOLE_PREFIX = `${API_PREFIX}/console`

/**
 * 装饰管理端点路径常量
 * @constant {Object<string, string>}
 */
export const DECORATION_ENDPOINTS = {
  DECORATION_LIST: `${CONSOLE_PREFIX}/decorations`,
  DECORATION_CREATE: `${CONSOLE_PREFIX}/decorations`,
  DECORATION_UPDATE: `${CONSOLE_PREFIX}/decorations/:id`,
  SEASON_LIST: `${CONSOLE_PREFIX}/decorations/seasons`,
  SEASON_CREATE: `${CONSOLE_PREFIX}/decorations/seasons`,
  SEASON_UPDATE: `${CONSOLE_PREFIX}/decorations/seasons/:id`
}

/**
 * 装饰管理 API 方法集合
 * @namespace DecorationAPI
 */
export const DecorationAPI = {
  /**
   * 列出全部装饰SKU（含草稿/下架）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listDecorations() {
    return request({ url: DECORATION_ENDPOINTS.DECORATION_LIST })
  },

  /**
   * 创建装饰SKU（草稿态）
   * @param {Object} data 装饰数据（decoration_code/decoration_name/decoration_type/price_star_stone 等）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createDecoration(data) {
    return request({ url: DECORATION_ENDPOINTS.DECORATION_CREATE, method: 'POST', data })
  },

  /**
   * 更新装饰SKU（含上下架 status: draft/on_sale/off_sale）
   * @param {number} id 装饰SKU ID
   * @param {Object} data 更新字段
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateDecoration(id, data) {
    return request({
      url: buildURL(DECORATION_ENDPOINTS.DECORATION_UPDATE, { id }),
      method: 'PUT',
      data
    })
  },

  /**
   * 列出全部赛季
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listSeasons() {
    return request({ url: DECORATION_ENDPOINTS.SEASON_LIST })
  },

  /**
   * 创建赛季
   * @param {Object} data 赛季数据（season_code/season_name/start_at/end_at/status）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createSeason(data) {
    return request({ url: DECORATION_ENDPOINTS.SEASON_CREATE, method: 'POST', data })
  },

  /**
   * 更新赛季（含状态 draft/active/ended）
   * @param {number} id 赛季 ID
   * @param {Object} data 更新字段
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateSeason(id, data) {
    return request({
      url: buildURL(DECORATION_ENDPOINTS.SEASON_UPDATE, { id }),
      method: 'PUT',
      data
    })
  }
}

export default DecorationAPI
