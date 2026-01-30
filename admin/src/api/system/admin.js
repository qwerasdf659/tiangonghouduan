/**
 * 系统管理 API 模块
 *
 * @module api/system/admin
 * @description 公告、通知、Banner、告警、审计、会话、字典、功能开关相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-29
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const SYSTEM_ADMIN_ENDPOINTS = {
  // 公告管理
  ANNOUNCEMENT_LIST: `${API_PREFIX}/console/system/announcements`,
  ANNOUNCEMENT_DETAIL: `${API_PREFIX}/console/system/announcements/:id`,
  ANNOUNCEMENT_CREATE: `${API_PREFIX}/console/system/announcements`,
  ANNOUNCEMENT_UPDATE: `${API_PREFIX}/console/system/announcements/:id`,
  ANNOUNCEMENT_DELETE: `${API_PREFIX}/console/system/announcements/:id`,

  // 系统通知
  NOTIFICATION_LIST: `${API_PREFIX}/system/notifications`,
  NOTIFICATION_READ: `${API_PREFIX}/system/notifications/:id/read`,
  NOTIFICATION_READ_ALL: `${API_PREFIX}/system/notifications/read-all`,
  NOTIFICATION_CLEAR: `${API_PREFIX}/system/notifications/clear`,
  NOTIFICATION_SEND: `${API_PREFIX}/system/notifications/send`,
  NOTIFICATION_ANNOUNCEMENTS: `${API_PREFIX}/console/notifications/announcements`,
  CONSOLE_NOTIFICATIONS: `${API_PREFIX}/console/system/notifications`,

  // 弹窗Banner
  POPUP_BANNER_LIST: `${API_PREFIX}/console/popup-banners`,
  POPUP_BANNER_STATS: `${API_PREFIX}/console/popup-banners/statistics`,
  POPUP_BANNER_DETAIL: `${API_PREFIX}/console/popup-banners/:id`,
  POPUP_BANNER_CREATE: `${API_PREFIX}/console/popup-banners`,
  POPUP_BANNER_UPDATE: `${API_PREFIX}/console/popup-banners/:id`,
  POPUP_BANNER_DELETE: `${API_PREFIX}/console/popup-banners/:id`,
  POPUP_BANNER_TOGGLE: `${API_PREFIX}/console/popup-banners/:id/toggle`,

  // 图片资源
  IMAGE_LIST: `${API_PREFIX}/console/images`,
  IMAGE_UPLOAD: `${API_PREFIX}/console/images/upload`,
  IMAGE_DELETE: `${API_PREFIX}/console/images/:id`,

  // 风控告警
  RISK_ALERTS_LIST: `${API_PREFIX}/console/risk-alerts`,
  RISK_ALERTS_DETAIL: `${API_PREFIX}/console/risk-alerts/:id`,
  RISK_ALERTS_PROCESS: `${API_PREFIX}/console/risk-alerts/:id/process`,
  RISK_ALERTS_DISMISS: `${API_PREFIX}/console/risk-alerts/:id/dismiss`,
  RISK_ALERTS_STATS: `${API_PREFIX}/console/risk-alerts/stats`,
  RISK_ALERT_LIST: `${API_PREFIX}/console/risk-alerts`,
  RISK_ALERT_REVIEW: `${API_PREFIX}/console/risk-alerts/:id/review`,
  RISK_ALERT_MARK_ALL_READ: `${API_PREFIX}/console/risk-alerts/mark-all-read`,

  // 审计日志
  AUDIT_LOGS_LIST: `${API_PREFIX}/console/system/audit-logs`,
  AUDIT_LOGS_STATISTICS: `${API_PREFIX}/console/system/audit-logs/statistics`,
  AUDIT_LOGS_DETAIL: `${API_PREFIX}/console/system/audit-logs/:id`,
  AUDIT_LOG_LIST: `${API_PREFIX}/console/audit-logs`,
  AUDIT_LOG_DETAIL: `${API_PREFIX}/console/audit-logs/:id`,
  AUDIT_LOG_EXPORT: `${API_PREFIX}/console/audit-logs/export`,

  // 会话管理
  SESSIONS_LIST: `${API_PREFIX}/console/sessions`,
  SESSIONS_DETAIL: `${API_PREFIX}/console/sessions/:session_id`,
  SESSIONS_TERMINATE: `${API_PREFIX}/console/sessions/:session_id/terminate`,
  SESSIONS_TERMINATE_ALL: `${API_PREFIX}/console/sessions/terminate-all`,

  // 配置工具
  CONFIG_TOOLS_VALIDATE: `${API_PREFIX}/console/config-tools/validate`,
  CONFIG_TOOLS_EXPORT: `${API_PREFIX}/console/config-tools/export`,
  CONFIG_TOOLS_IMPORT: `${API_PREFIX}/console/config-tools/import`,

  // 字典管理 - 类目
  DICT_CATEGORY_LIST: `${API_PREFIX}/console/dictionaries/categories`,
  DICT_CATEGORY_DETAIL: `${API_PREFIX}/console/dictionaries/categories/:code`,
  DICT_CATEGORY_CREATE: `${API_PREFIX}/console/dictionaries/categories`,
  DICT_CATEGORY_UPDATE: `${API_PREFIX}/console/dictionaries/categories/:code`,
  DICT_CATEGORY_DELETE: `${API_PREFIX}/console/dictionaries/categories/:code`,

  // 字典管理 - 稀有度
  DICT_RARITY_LIST: `${API_PREFIX}/console/dictionaries/rarities`,
  DICT_RARITY_DETAIL: `${API_PREFIX}/console/dictionaries/rarities/:code`,
  DICT_RARITY_CREATE: `${API_PREFIX}/console/dictionaries/rarities`,
  DICT_RARITY_UPDATE: `${API_PREFIX}/console/dictionaries/rarities/:code`,
  DICT_RARITY_DELETE: `${API_PREFIX}/console/dictionaries/rarities/:code`,

  // 字典管理 - 资产分组
  DICT_ASSET_GROUP_LIST: `${API_PREFIX}/console/dictionaries/asset-groups`,
  DICT_ASSET_GROUP_DETAIL: `${API_PREFIX}/console/dictionaries/asset-groups/:code`,
  DICT_ASSET_GROUP_CREATE: `${API_PREFIX}/console/dictionaries/asset-groups`,
  DICT_ASSET_GROUP_UPDATE: `${API_PREFIX}/console/dictionaries/asset-groups/:code`,
  DICT_ASSET_GROUP_DELETE: `${API_PREFIX}/console/dictionaries/asset-groups/:code`,

  // 字典管理 - 全量获取
  DICT_ALL: `${API_PREFIX}/console/dictionaries/all`,

  // 功能开关
  FEATURE_FLAG_LIST: `${API_PREFIX}/console/feature-flags`,
  FEATURE_FLAG_DETAIL: `${API_PREFIX}/console/feature-flags/:flagKey`,
  FEATURE_FLAG_CREATE: `${API_PREFIX}/console/feature-flags`,
  FEATURE_FLAG_UPDATE: `${API_PREFIX}/console/feature-flags/:flagKey`,
  FEATURE_FLAG_DELETE: `${API_PREFIX}/console/feature-flags/:flagKey`,
  FEATURE_FLAG_TOGGLE: `${API_PREFIX}/console/feature-flags/:flagKey/toggle`,
  FEATURE_FLAG_WHITELIST_ADD: `${API_PREFIX}/console/feature-flags/:flagKey/whitelist`,
  FEATURE_FLAG_WHITELIST_REMOVE: `${API_PREFIX}/console/feature-flags/:flagKey/whitelist`,
  FEATURE_FLAG_BLACKLIST_ADD: `${API_PREFIX}/console/feature-flags/:flagKey/blacklist`,
  FEATURE_FLAG_BLACKLIST_REMOVE: `${API_PREFIX}/console/feature-flags/:flagKey/blacklist`,
  FEATURE_FLAG_CHECK: `${API_PREFIX}/console/feature-flags/:flagKey/check/:userId`
}

// ========== API 调用方法 ==========

export const SystemAdminAPI = {
  // ===== 公告管理 =====

  /**
   * 获取公告列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 公告列表响应
   */
  async getAnnouncements(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.ANNOUNCEMENT_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取公告详情
   * @param {number} id - 公告 ID
   * @returns {Promise<Object>} 公告详情响应
   */
  async getAnnouncementDetail(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.ANNOUNCEMENT_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建系统公告
   * @param {Object} data - 公告数据
   * @returns {Promise<Object>} 创建结果响应
   */
  async createAnnouncement(data) {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.ANNOUNCEMENT_CREATE, method: 'POST', data })
  },

  /**
   * 更新公告
   * @param {number} id - 公告 ID
   * @param {Object} data - 公告更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateAnnouncement(id, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.ANNOUNCEMENT_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除公告
   * @param {number} id - 公告 ID
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteAnnouncement(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.ANNOUNCEMENT_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 系统通知 =====

  /**
   * 获取通知列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 通知列表响应
   */
  async getNotifications(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 标记单条通知已读
   * @param {number} id - 通知 ID
   * @returns {Promise<Object>} 操作结果响应
   */
  async markNotificationRead(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_READ, { id })
    return await request({ url, method: 'POST' })
  },

  /**
   * 标记所有通知已读
   * @returns {Promise<Object>} 操作结果响应
   */
  async markAllNotificationsRead() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_READ_ALL, method: 'POST' })
  },

  /**
   * 发送系统通知
   * @param {Object} data - 通知数据
   * @returns {Promise<Object>} 发送结果响应
   */
  async sendNotification(data) {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_SEND, method: 'POST', data })
  },

  // ===== 弹窗Banner =====

  /**
   * 获取弹窗Banner列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} Banner列表响应
   */
  async getPopupBanners(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.POPUP_BANNER_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建弹窗Banner
   * @param {Object} data - Banner数据
   * @returns {Promise<Object>} 创建结果响应
   */
  async createPopupBanner(data) {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.POPUP_BANNER_CREATE, method: 'POST', data })
  },

  /**
   * 更新弹窗Banner
   * @param {number} id - Banner ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updatePopupBanner(id, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.POPUP_BANNER_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除弹窗Banner
   * @param {number} id - Banner ID
   * @returns {Promise<Object>} 删除结果响应
   */
  async deletePopupBanner(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.POPUP_BANNER_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 切换弹窗Banner状态
   * @param {number} id - Banner ID
   * @returns {Promise<Object>} 切换结果响应
   */
  async togglePopupBanner(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.POPUP_BANNER_TOGGLE, { id })
    return await request({ url, method: 'POST' })
  },

  // ===== 风控告警 =====

  /**
   * 获取风控告警列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 告警列表响应
   */
  async getRiskAlerts(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.RISK_ALERTS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 处理风控告警
   * @param {number} id - 告警 ID
   * @param {Object} data - 处理数据
   * @returns {Promise<Object>} 处理结果响应
   */
  async processRiskAlert(id, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.RISK_ALERTS_PROCESS, { id })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 忽略风控告警
   * @param {number} id - 告警 ID
   * @param {Object} data - 忽略数据
   * @returns {Promise<Object>} 操作结果响应
   */
  async dismissRiskAlert(id, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.RISK_ALERTS_DISMISS, { id })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 获取风控告警统计
   * @returns {Promise<Object>} 统计数据响应
   */
  async getRiskAlertStats() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.RISK_ALERTS_STATS, method: 'GET' })
  },

  // ===== 审计日志 =====

  /**
   * 获取审计日志列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 日志列表响应
   */
  async getAuditLogs(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.AUDIT_LOGS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取审计日志统计
   * @returns {Promise<Object>} 统计数据响应
   */
  async getAuditLogStats() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.AUDIT_LOGS_STATISTICS, method: 'GET' })
  },

  /**
   * 获取审计日志详情
   * @param {number} id - 日志 ID
   * @returns {Promise<Object>} 日志详情响应
   */
  async getAuditLogDetail(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AUDIT_LOGS_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  // ===== 会话管理 =====

  /**
   * 获取会话列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 会话列表响应
   */
  async getSessions(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.SESSIONS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 终止指定会话
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object>} 操作结果响应
   */
  async terminateSession(sessionId) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.SESSIONS_TERMINATE, { session_id: sessionId })
    return await request({ url, method: 'POST' })
  },

  /**
   * 终止所有会话
   * @returns {Promise<Object>} 操作结果响应
   */
  async terminateAllSessions() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.SESSIONS_TERMINATE_ALL, method: 'POST' })
  },

  // ===== 字典管理 - 类目 =====

  /**
   * 获取类目字典列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 类目列表响应
   */
  async getCategoryList(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.DICT_CATEGORY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取类目详情
   * @param {string} code - 类目代码
   * @returns {Promise<Object>} 类目详情响应
   */
  async getCategoryDetail(code) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_CATEGORY_DETAIL, { code })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建类目
   * @param {Object} data - 类目数据
   * @returns {Promise<Object>} 创建结果响应
   */
  async createCategory(data) {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.DICT_CATEGORY_CREATE, method: 'POST', data })
  },

  /**
   * 更新类目
   * @param {string} code - 类目代码
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateCategory(code, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_CATEGORY_UPDATE, { code })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除类目
   * @param {string} code - 类目代码
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteCategory(code) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_CATEGORY_DELETE, { code })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 字典管理 - 稀有度 =====

  /**
   * 获取稀有度字典列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 稀有度列表响应
   */
  async getRarityList(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.DICT_RARITY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取稀有度详情
   * @param {string} code - 稀有度代码
   * @returns {Promise<Object>} 稀有度详情响应
   */
  async getRarityDetail(code) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_RARITY_DETAIL, { code })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建稀有度
   * @param {Object} data - 稀有度数据
   * @returns {Promise<Object>} 创建结果响应
   */
  async createRarity(data) {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.DICT_RARITY_CREATE, method: 'POST', data })
  },

  /**
   * 更新稀有度
   * @param {string} code - 稀有度代码
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateRarity(code, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_RARITY_UPDATE, { code })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除稀有度
   * @param {string} code - 稀有度代码
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteRarity(code) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_RARITY_DELETE, { code })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 字典管理 - 资产分组 =====

  /**
   * 获取资产分组列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 资产分组列表响应
   */
  async getAssetGroupList(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.DICT_ASSET_GROUP_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取资产分组详情
   * @param {string} code - 资产分组代码
   * @returns {Promise<Object>} 资产分组详情响应
   */
  async getAssetGroupDetail(code) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_ASSET_GROUP_DETAIL, { code })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建资产分组
   * @param {Object} data - 资产分组数据
   * @returns {Promise<Object>} 创建结果响应
   */
  async createAssetGroup(data) {
    return await request({
      url: SYSTEM_ADMIN_ENDPOINTS.DICT_ASSET_GROUP_CREATE,
      method: 'POST',
      data
    })
  },

  /**
   * 更新资产分组
   * @param {string} code - 资产分组代码
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateAssetGroup(code, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_ASSET_GROUP_UPDATE, { code })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除资产分组
   * @param {string} code - 资产分组代码
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteAssetGroup(code) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.DICT_ASSET_GROUP_DELETE, { code })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取所有字典数据
   * @returns {Promise<Object>} 所有字典数据响应
   */
  async getAllDictionaries() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.DICT_ALL, method: 'GET' })
  },

  // ===== 功能开关管理 =====

  /**
   * 获取功能开关列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 功能开关列表响应
   */
  async getFeatureFlags(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取功能开关详情
   * @param {string} flagKey - 功能键名
   * @returns {Promise<Object>} 功能开关详情响应
   */
  async getFeatureFlagDetail(flagKey) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_DETAIL, { flagKey })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建功能开关
   * @param {Object} data - 功能开关数据
   * @returns {Promise<Object>} 创建结果响应
   */
  async createFeatureFlag(data) {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_CREATE, method: 'POST', data })
  },

  /**
   * 更新功能开关
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateFeatureFlag(flagKey, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_UPDATE, { flagKey })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除功能开关
   * @param {string} flagKey - 功能键名
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteFeatureFlag(flagKey) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_DELETE, { flagKey })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 切换功能开关状态
   * @param {string} flagKey - 功能键名
   * @returns {Promise<Object>} 切换结果响应
   */
  async toggleFeatureFlag(flagKey) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_TOGGLE, { flagKey })
    return await request({ url, method: 'PATCH' })
  },

  /**
   * 添加功能开关白名单用户
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 白名单数据
   * @returns {Promise<Object>} 添加结果响应
   */
  async addFeatureFlagWhitelist(flagKey, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_WHITELIST_ADD, { flagKey })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 移除功能开关白名单用户
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 白名单数据
   * @returns {Promise<Object>} 移除结果响应
   */
  async removeFeatureFlagWhitelist(flagKey, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_WHITELIST_REMOVE, { flagKey })
    return await request({ url, method: 'DELETE', data })
  },

  /**
   * 添加功能开关黑名单用户
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 黑名单数据
   * @returns {Promise<Object>} 添加结果响应
   */
  async addFeatureFlagBlacklist(flagKey, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_BLACKLIST_ADD, { flagKey })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 移除功能开关黑名单用户
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 黑名单数据
   * @returns {Promise<Object>} 移除结果响应
   */
  async removeFeatureFlagBlacklist(flagKey, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_BLACKLIST_REMOVE, { flagKey })
    return await request({ url, method: 'DELETE', data })
  },

  /**
   * 检查用户的功能开关状态
   * @param {string} flagKey - 功能键名
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 检查结果响应
   */
  async checkFeatureFlagForUser(flagKey, userId) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.FEATURE_FLAG_CHECK, { flagKey, userId })
    return await request({ url, method: 'GET' })
  }
}

export default SystemAdminAPI
