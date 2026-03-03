/**
 * 用户比例覆盖管理 API
 *
 * @description 管理员为特定用户设置个性化消费比例的 CRUD 接口
 * @module api/user-ratio-override
 * @since 2026-03-02（钻石配额优化方案）
 */

import { API_PREFIX, request, buildURL, buildQueryString } from './base.js'

/**
 * 用户比例覆盖 API 端点
 * @description 端点直接反映后端路由，使用 buildURL 处理动态参数
 */
export const USER_RATIO_OVERRIDE_ENDPOINTS = {
  /** 列表查询 + 新增覆盖 */
  LIST: `${API_PREFIX}/console/user-ratio-overrides`,
  /** 单条覆盖记录（:id = user_ratio_override_id） */
  DETAIL: `${API_PREFIX}/console/user-ratio-overrides/:id`,
  /** 查询某用户的所有覆盖 */
  BY_USER: `${API_PREFIX}/console/user-ratio-overrides/user/:user_id`
}

/**
 * 用户比例覆盖 API 方法集
 */
export const UserRatioOverrideAPI = {
  /**
   * 获取覆盖列表（支持 user_id / ratio_key 过滤，分页）
   * @param {Object} params - 查询参数
   * @param {number} [params.user_id] - 按用户过滤
   * @param {string} [params.ratio_key] - 按比例类型过滤
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页条数
   * @returns {Promise<ApiResponse>}
   */
  async getList(params = {}) {
    const url = USER_RATIO_OVERRIDE_ENDPOINTS.LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取单条覆盖记录
   * @param {number} id - user_ratio_override_id
   * @returns {Promise<ApiResponse>}
   */
  async getDetail(id) {
    const url = buildURL(USER_RATIO_OVERRIDE_ENDPOINTS.DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 查询某用户的所有覆盖
   * @param {number} user_id - 用户ID
   * @returns {Promise<ApiResponse>}
   */
  async getByUser(user_id) {
    const url = buildURL(USER_RATIO_OVERRIDE_ENDPOINTS.BY_USER, { user_id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 新增覆盖
   * @param {Object} data - 覆盖数据
   * @param {number} data.user_id - 目标用户ID
   * @param {string} data.ratio_key - 比例类型
   * @param {number} data.ratio_value - 覆盖比例值
   * @param {string} [data.reason] - 覆盖原因
   * @param {string} [data.effective_start] - 生效开始时间
   * @param {string} [data.effective_end] - 生效结束时间
   * @returns {Promise<ApiResponse>}
   */
  async create(data) {
    return await request({
      url: USER_RATIO_OVERRIDE_ENDPOINTS.LIST,
      method: 'POST',
      data
    })
  },

  /**
   * 修改覆盖
   * @param {number} id - user_ratio_override_id
   * @param {Object} data - 要更新的字段
   * @returns {Promise<ApiResponse>}
   */
  async update(id, data) {
    const url = buildURL(USER_RATIO_OVERRIDE_ENDPOINTS.DETAIL, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除覆盖（恢复为全局默认值）
   * @param {number} id - user_ratio_override_id
   * @returns {Promise<ApiResponse>}
   */
  async remove(id) {
    const url = buildURL(USER_RATIO_OVERRIDE_ENDPOINTS.DETAIL, { id })
    return await request({ url, method: 'DELETE' })
  }
}

export default UserRatioOverrideAPI
