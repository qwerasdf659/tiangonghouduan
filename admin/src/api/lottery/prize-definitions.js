/**
 * 奖品目录 API 模块
 *
 * @module api/lottery/prize-definitions
 * @description 集中奖品目录的 CRUD 和查询 API
 * @version 1.0.0
 * @date 2026-05-26
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const PRIZE_DEFINITION_ENDPOINTS = {
  /** 分页查询奖品目录 */
  LIST: `${API_PREFIX}/console/prize-definitions`,
  /** 获取下拉选项列表（活动配置时选择奖品用） */
  OPTIONS: `${API_PREFIX}/console/prize-definitions/options`,
  /** 获取单个奖品定义详情 */
  DETAIL: `${API_PREFIX}/console/prize-definitions/:id`,
  /** 创建奖品定义 */
  CREATE: `${API_PREFIX}/console/prize-definitions`,
  /** 更新奖品定义 */
  UPDATE: `${API_PREFIX}/console/prize-definitions/:id`,
  /** 删除奖品定义 */
  DELETE: `${API_PREFIX}/console/prize-definitions/:id`
}

// ========== API 调用方法 ==========

export const PrizeDefinitionAPI = {
  /**
   * 分页查询奖品目录
   * @param {Object} params - 查询参数
   * @param {string} [params.prize_type] - 奖品类型筛选
   * @param {string} [params.rarity_code] - 稀有度筛选
   * @param {string} [params.reward_tier] - 档位筛选
   * @param {string} [params.keyword] - 关键词搜索
   * @param {string} [params.is_enabled] - 启用状态（1/0）
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   */
  async list(params = {}) {
    const url = PRIZE_DEFINITION_ENDPOINTS.LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取下拉选项列表
   * @param {Object} [params] - 筛选参数
   */
  async getOptions(params = {}) {
    const url = PRIZE_DEFINITION_ENDPOINTS.OPTIONS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取单个奖品定义详情
   * @param {number} id - 奖品定义ID
   */
  async getDetail(id) {
    const url = buildURL(PRIZE_DEFINITION_ENDPOINTS.DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建奖品定义
   * @param {Object} data - 奖品定义数据
   */
  async create(data) {
    return await request({
      url: PRIZE_DEFINITION_ENDPOINTS.CREATE,
      method: 'POST',
      data
    })
  },

  /**
   * 更新奖品定义
   * @param {number} id - 奖品定义ID
   * @param {Object} data - 更新数据
   */
  async update(id, data) {
    const url = buildURL(PRIZE_DEFINITION_ENDPOINTS.UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除奖品定义
   * @param {number} id - 奖品定义ID
   */
  async delete(id) {
    const url = buildURL(PRIZE_DEFINITION_ENDPOINTS.DELETE, { id })
    return await request({ url, method: 'DELETE' })
  }
}

export default PrizeDefinitionAPI
