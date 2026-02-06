/**
 * 系统核心 API 模块
 *
 * @module api/system/core
 * @description 系统基础、设置、配置、缓存相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-29
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const SYSTEM_CORE_ENDPOINTS = {
  // 系统基础
  STATUS: `${API_PREFIX}/console/system/status`,
  DASHBOARD: `${API_PREFIX}/console/system/dashboard`,
  DASHBOARD_TRENDS: `${API_PREFIX}/console/system/dashboard`,
  CHARTS: `${API_PREFIX}/system/statistics/charts`,
  LOTTERY_TRENDS: `${API_PREFIX}/console/analytics/lottery/trends`,
  PERFORMANCE_REPORT: `${API_PREFIX}/console/analytics/performance/report`,
  TODAY_STATS: `${API_PREFIX}/console/analytics/stats/today`,
  STATISTIC_EXPORT: `${API_PREFIX}/system/statistics/export`,
  HEALTH: '/health',
  VERSION: '/api/v4',

  // 系统设置
  SETTING_LIST: `${API_PREFIX}/console/settings`,
  SETTING_CATEGORY: `${API_PREFIX}/console/settings/:category`,
  SETTING_UPDATE: `${API_PREFIX}/console/settings/:category`,
  SETTING_GLOBAL: `${API_PREFIX}/console/settings/global`,
  SETTING_LOTTERY: `${API_PREFIX}/console/settings/lottery`,
  SETTING_SYSTEM: `${API_PREFIX}/console/settings/system`,
  SETTING_PRIZE: `${API_PREFIX}/console/settings/prize`,
  SETTING_SECURITY: `${API_PREFIX}/console/settings/security`,
  SETTING_BASIC: `${API_PREFIX}/console/settings/basic`,
  SETTING_POINTS: `${API_PREFIX}/console/settings/points`,
  SETTING_NOTIFICATION: `${API_PREFIX}/console/settings/notification`,
  SETTING_MARKETPLACE: `${API_PREFIX}/console/settings/marketplace`,

  // 缓存管理
  CACHE_CLEAR: `${API_PREFIX}/console/cache/clear`,

  // 系统配置（全局）
  SYSTEM_CONFIG_LIST: `${API_PREFIX}/console/settings`,
  SYSTEM_CONFIG_GET: `${API_PREFIX}/console/settings/basic`,
  SYSTEM_CONFIG_UPDATE: `${API_PREFIX}/console/settings/basic`,
  SYSTEM_CONFIG_MAINTENANCE: `${API_PREFIX}/console/settings/basic`,
  SYSTEM_CONFIG_POINTS: `${API_PREFIX}/console/settings/points`,
  SYSTEM_CONFIG_UPDATE_POINTS: `${API_PREFIX}/console/settings/points`,

  // 行政区划
  REGION_PROVINCES: `${API_PREFIX}/console/regions/provinces`,
  REGION_CHILDREN: `${API_PREFIX}/console/regions/children/:parent_code`
}

// ========== API 调用方法 ==========

export const SystemCoreAPI = {
  // ===== 系统基础 =====

  /**
   * 获取仪表盘数据
   * @returns {Promise<Object>} 仪表盘数据响应
   */
  async getDashboard() {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.DASHBOARD, method: 'GET' })
  },

  /**
   * 系统健康检查
   * @returns {Promise<Object>} 健康检查响应
   */
  async healthCheck() {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.HEALTH, method: 'GET' })
  },

  /**
   * 获取 API 版本信息
   * @returns {Promise<Object>} 版本信息响应
   */
  async getVersion() {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.VERSION, method: 'GET' })
  },

  // ===== 系统设置 =====

  /**
   * 获取所有设置概览
   * @returns {Promise<Object>} 设置概览响应
   */
  async getSettings() {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.SETTING_LIST, method: 'GET' })
  },

  /**
   * 获取指定分类的设置详情
   * @param {string} category - 设置分类码（basic|lottery|points|notification|security）
   * @returns {Promise<Object>} 分类设置响应
   */
  async getSettingsByCategory(category) {
    const url = buildURL(SYSTEM_CORE_ENDPOINTS.SETTING_CATEGORY, { category })
    return await request({ url, method: 'GET' })
  },

  /**
   * 更新分类设置
   * @param {string} category - 设置分类码
   * @param {Object} data - 设置更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateSettings(category, data) {
    const url = buildURL(SYSTEM_CORE_ENDPOINTS.SETTING_UPDATE, { category })
    return await request({ url, method: 'PUT', data })
  },

  // ===== 缓存管理 =====

  /**
   * 清除系统缓存
   * @param {Object} [data={}] - 清除参数
   * @param {string} [data.type='all'] - 缓存类型（all|user|session|api|static）
   * @param {Array<string>} [data.keys] - 指定要清除的缓存键
   * @returns {Promise<Object>} 清除结果响应
   */
  async clearCache(data = {}) {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.CACHE_CLEAR, method: 'POST', data })
  },

  // ===== 系统配置（全局） =====

  /**
   * 获取系统配置列表（所有设置概览）
   * @returns {Promise<Object>} 配置列表响应
   */
  async getSystemConfigList() {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.SYSTEM_CONFIG_LIST, method: 'GET' })
  },

  /**
   * 获取系统配置
   * @returns {Promise<Object>} 系统配置响应
   */
  async getSystemConfig() {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.SYSTEM_CONFIG_GET, method: 'GET' })
  },

  /**
   * 更新系统配置
   * @param {Object} data - 配置数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateSystemConfig(data) {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.SYSTEM_CONFIG_UPDATE, method: 'PUT', data })
  },

  /**
   * 获取维护模式配置
   * @returns {Promise<Object>} 维护模式配置响应
   */
  async getMaintenanceConfig() {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.SYSTEM_CONFIG_MAINTENANCE, method: 'GET' })
  },

  /**
   * 更新维护模式配置
   * @param {Object} data - 维护模式配置数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateMaintenanceConfig(data) {
    return await request({
      url: SYSTEM_CORE_ENDPOINTS.SYSTEM_CONFIG_MAINTENANCE,
      method: 'PUT',
      data
    })
  },

  /**
   * 获取定价配置
   * @returns {Promise<Object>} 定价配置响应
   */
  async getPricingConfig() {
    return await request({ url: SYSTEM_CORE_ENDPOINTS.SYSTEM_CONFIG_POINTS, method: 'GET' })
  },

  /**
   * 更新定价配置
   * @param {Object} data - 定价配置数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updatePricingConfig(data) {
    return await request({
      url: SYSTEM_CORE_ENDPOINTS.SYSTEM_CONFIG_UPDATE_POINTS,
      method: 'PUT',
      data
    })
  }
}

export default SystemCoreAPI
