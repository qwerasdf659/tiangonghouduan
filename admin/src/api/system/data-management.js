/**
 * 数据管理 API 模块
 *
 * @module api/system/data-management
 * @description 数据一键删除功能 - 统计/策略/预览/清理/历史
 * @version 1.0.0
 * @date 2026-03-10
 */

import { API_PREFIX, request, buildURL } from '../base.js'

// ========== API 端点 ==========

export const DATA_MANAGEMENT_ENDPOINTS = {
  /** 数据量统计 */
  STATS: `${API_PREFIX}/console/data-management/stats`,
  /** 自动清理策略列表 */
  POLICY_LIST: `${API_PREFIX}/console/data-management/policies`,
  /** 更新策略 */
  POLICY_UPDATE: `${API_PREFIX}/console/data-management/policies/:config_key`,
  /** 清理历史（分页） */
  HISTORY: `${API_PREFIX}/console/data-management/history`,
  /** 预览清理影响 */
  PREVIEW: `${API_PREFIX}/console/data-management/preview`,
  /** 执行清理 */
  CLEANUP: `${API_PREFIX}/console/data-management/cleanup`,
  /** 资产域对账（复用已有端点） */
  RECONCILE_ASSETS: `${API_PREFIX}/console/reconciliation/assets`,
  /** 物品域对账（复用已有端点） */
  RECONCILE_ITEMS: `${API_PREFIX}/console/reconciliation/items`
}

// ========== API 方法 ==========

export const DataManagementAPI = {
  /**
   * 获取数据量统计
   * @returns {Promise<Object>} 各表数据量、安全等级分组、数据库大小
   */
  async getStats() {
    return request({ url: DATA_MANAGEMENT_ENDPOINTS.STATS })
  },

  /**
   * 获取自动清理策略列表
   * @returns {Promise<Object>} 策略配置
   */
  async getPolicies() {
    return request({ url: DATA_MANAGEMENT_ENDPOINTS.POLICY_LIST })
  },

  /**
   * 更新清理策略
   * @param {string} configKey - 策略对应的表名
   * @param {Object} data - { retention_days, enabled }
   * @returns {Promise<Object>} 更新后的策略
   */
  async updatePolicy(configKey, data) {
    return request({
      url: buildURL(DATA_MANAGEMENT_ENDPOINTS.POLICY_UPDATE, { config_key: configKey }),
      method: 'PUT',
      data
    })
  },

  /**
   * 获取清理历史（分页）
   * @param {Object} params - { page, page_size }
   * @returns {Promise<Object>} 分页清理历史
   */
  async getHistory(params = {}) {
    return request({ url: DATA_MANAGEMENT_ENDPOINTS.HISTORY, params })
  },

  /**
   * 预览清理影响
   * @param {Object} data - { mode, categories, time_range, filters }
   * @returns {Promise<Object>} 预览结果含 preview_token
   */
  async preview(data) {
    return request({
      url: DATA_MANAGEMENT_ENDPOINTS.PREVIEW,
      method: 'POST',
      data
    })
  },

  /**
   * 执行清理
   * @param {Object} data - { preview_token, dry_run, reason, confirmation_text }
   * @returns {Promise<Object>} 执行结果
   */
  async cleanup(data) {
    return request({
      url: DATA_MANAGEMENT_ENDPOINTS.CLEANUP,
      method: 'POST',
      data
    })
  },

  /**
   * 资产域对账校验（复用已有端点）
   * @returns {Promise<Object>} 对账结果
   */
  async reconcileAssets() {
    return request({ url: DATA_MANAGEMENT_ENDPOINTS.RECONCILE_ASSETS })
  },

  /**
   * 物品域对账校验（复用已有端点）
   * @returns {Promise<Object>} 对账结果
   */
  async reconcileItems() {
    return request({ url: DATA_MANAGEMENT_ENDPOINTS.RECONCILE_ITEMS })
  }
}

export default DataManagementAPI
