/**
 * 系统管理 API 模块
 *
 * @module api/system/admin
 * @description 通知、告警、审计、会话、字典、功能开关、内容投放（广告活动/广告位/报表）相关的 API 调用
 * @version 2.0.0
 * @date 2026-01-29
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const SYSTEM_ADMIN_ENDPOINTS = {
  // [已合并] 公告管理 → ad-campaigns?category=system

  // 系统通知（数据源：admin_notifications 表）
  NOTIFICATION_LIST: `${API_PREFIX}/system/notifications`,
  NOTIFICATION_DETAIL: `${API_PREFIX}/system/notifications/:id`,
  NOTIFICATION_READ: `${API_PREFIX}/system/notifications/:id/read`,
  NOTIFICATION_READ_ALL: `${API_PREFIX}/system/notifications/read-all`,
  NOTIFICATION_CLEAR: `${API_PREFIX}/system/notifications/clear`,
  NOTIFICATION_SEND: `${API_PREFIX}/system/notifications/send`,
  NOTIFICATION_DELETE: `${API_PREFIX}/system/notifications/:id`,
  NOTIFICATION_UNREAD_COUNT: `${API_PREFIX}/system/notifications/unread-count`,
  CONSOLE_NOTIFICATIONS: `${API_PREFIX}/console/system/notifications`,

  // 广告活动管理（统一内容投放管理，支持 commercial/operational/system 三种类型）
  AD_CAMPAIGN_LIST: `${API_PREFIX}/console/ad-campaigns`,
  AD_CAMPAIGN_CREATE: `${API_PREFIX}/console/ad-campaigns`,
  AD_CAMPAIGN_OPERATIONAL_CREATE: `${API_PREFIX}/console/ad-campaigns/operational`,
  AD_CAMPAIGN_SYSTEM_CREATE: `${API_PREFIX}/console/ad-campaigns/system`,
  AD_CAMPAIGN_DETAIL: `${API_PREFIX}/console/ad-campaigns/:id`,
  AD_CAMPAIGN_REVIEW: `${API_PREFIX}/console/ad-campaigns/:id/review`,
  AD_CAMPAIGN_PUBLISH: `${API_PREFIX}/console/ad-campaigns/:id/publish`,
  AD_CAMPAIGN_PAUSE: `${API_PREFIX}/console/ad-campaigns/:id/pause`,
  AD_CAMPAIGN_STATS: `${API_PREFIX}/console/ad-campaigns/statistics`,
  AD_CAMPAIGN_DASHBOARD: `${API_PREFIX}/console/ad-campaigns/dashboard`,
  AD_CAMPAIGN_INTERACTION_STATS: `${API_PREFIX}/console/ad-campaigns/interaction-stats/:id`,
  AD_POPUP_QUEUE_CONFIG: `${API_PREFIX}/console/ad-campaigns/popup-queue-config`,
  AD_BID_LOGS: `${API_PREFIX}/console/ad-campaigns/bid-logs`,
  AD_USER_TAGS: `${API_PREFIX}/console/ad-campaigns/user-ad-tags`,
  AD_ANTIFRAUD_LOGS: `${API_PREFIX}/console/ad-campaigns/antifraud-logs`,
  AD_ATTRIBUTION_LOGS: `${API_PREFIX}/console/ad-campaigns/attribution-logs`,

  // 广告位管理
  AD_SLOT_LIST: `${API_PREFIX}/console/ad-slots`,
  AD_SLOT_CREATE: `${API_PREFIX}/console/ad-slots`,
  AD_SLOT_UPDATE: `${API_PREFIX}/console/ad-slots/:id`,
  AD_SLOT_TOGGLE: `${API_PREFIX}/console/ad-slots/:id/toggle`,
  AD_SLOT_STATS: `${API_PREFIX}/console/ad-slots/statistics`,

  // 广告定价配置（DAU系数/折扣/底价）
  AD_PRICING_CONFIG: `${API_PREFIX}/console/ad-pricing/config`,
  AD_PRICING_CONFIG_UPDATE: `${API_PREFIX}/console/ad-pricing/config/:config_key`,
  AD_PRICING_DAU_STATS: `${API_PREFIX}/console/ad-pricing/dau-stats`,
  AD_PRICING_PREVIEW: `${API_PREFIX}/console/ad-pricing/preview`,
  AD_PRICING_COEFFICIENT: `${API_PREFIX}/console/ad-pricing/current-coefficient`,

  // 地域定向管理（商圈/区域/联合广告组 CRUD）
  AD_ZONE_LIST: `${API_PREFIX}/console/zone-management/zones`,
  AD_ZONE_CREATE: `${API_PREFIX}/console/zone-management/zones`,
  AD_ZONE_DETAIL: `${API_PREFIX}/console/zone-management/zones/:id`,
  AD_ZONE_UPDATE: `${API_PREFIX}/console/zone-management/zones/:id`,
  AD_ZONE_DELETE: `${API_PREFIX}/console/zone-management/zones/:id`,

  // 联合广告组管理
  AD_ZONE_GROUP_LIST: `${API_PREFIX}/console/zone-management/groups`,
  AD_ZONE_GROUP_CREATE: `${API_PREFIX}/console/zone-management/groups`,
  AD_ZONE_GROUP_DETAIL: `${API_PREFIX}/console/zone-management/groups/:id`,
  AD_ZONE_GROUP_UPDATE: `${API_PREFIX}/console/zone-management/groups/:id`,
  AD_ZONE_GROUP_DELETE: `${API_PREFIX}/console/zone-management/groups/:id`,
  AD_ZONE_GROUP_ADD_MEMBERS: `${API_PREFIX}/console/zone-management/groups/:id/members`,
  AD_ZONE_GROUP_REMOVE_MEMBERS: `${API_PREFIX}/console/zone-management/groups/:id/members`,

  // 调价历史管理（调价建议列表 + 确认/拒绝/执行）
  AD_PRICE_ADJUSTMENT_LIST: `${API_PREFIX}/console/ad-pricing/adjustments`,
  AD_PRICE_ADJUSTMENT_CONFIRM: `${API_PREFIX}/console/ad-pricing/adjustments/:id/confirm`,
  AD_PRICE_ADJUSTMENT_REJECT: `${API_PREFIX}/console/ad-pricing/adjustments/:id/reject`,
  AD_PRICE_ADJUSTMENT_APPLY: `${API_PREFIX}/console/ad-pricing/adjustments/:id/apply`,

  // 平台钻石管理
  PLATFORM_DIAMOND_BALANCE: `${API_PREFIX}/console/platform-diamond/balance`,
  PLATFORM_DIAMOND_BURN: `${API_PREFIX}/console/platform-diamond/burn`,
  PLATFORM_DIAMOND_BURN_HISTORY: `${API_PREFIX}/console/platform-diamond/burn-history`,

  // 统一内容投放获取（系统端只读接口，替代原 popup-banners/carousel-items/announcements）
  AD_DELIVERY: `${API_PREFIX}/system/ad-delivery`,

  // 广告报表
  AD_REPORT_OVERVIEW: `${API_PREFIX}/console/ad-reports/overview`,
  AD_REPORT_CAMPAIGN: `${API_PREFIX}/console/ad-reports/campaigns/:id`,
  AD_REPORT_SLOT: `${API_PREFIX}/console/ad-reports/slots/:id`,

  // 媒体文件管理端点（替代旧 IMAGE_* 端点）
  MEDIA_UPLOAD: `${API_PREFIX}/console/media/upload`,
  MEDIA_LIST: `${API_PREFIX}/console/media`,
  MEDIA_DETAIL: (mediaId) => `${API_PREFIX}/console/media/${mediaId}`,
  MEDIA_UPDATE: (mediaId) => `${API_PREFIX}/console/media/${mediaId}`,
  MEDIA_DELETE: (mediaId) => `${API_PREFIX}/console/media/${mediaId}`,
  MEDIA_ATTACH: (mediaId) => `${API_PREFIX}/console/media/${mediaId}/attach`,
  MEDIA_DETACH: (mediaId) => `${API_PREFIX}/console/media/${mediaId}/detach`,
  MEDIA_BY_ENTITY: (type, id) => `${API_PREFIX}/console/media/by-entity/${type}/${id}`,
  MEDIA_BATCH_UPLOAD: `${API_PREFIX}/console/media/batch-upload`,
  MEDIA_BATCH_ATTACH: `${API_PREFIX}/console/media/batch-attach`,
  MEDIA_RESTORE: (mediaId) => `${API_PREFIX}/console/media/${mediaId}/restore`,
  // 存储管理端点
  STORAGE_OVERVIEW: `${API_PREFIX}/console/storage/overview`,
  STORAGE_ORPHANS: `${API_PREFIX}/console/storage/orphans`,
  STORAGE_TRASH: `${API_PREFIX}/console/storage/trash`,
  STORAGE_CLEANUP: `${API_PREFIX}/console/storage/cleanup`,
  STORAGE_DUPLICATES: `${API_PREFIX}/console/storage/duplicates`,

  // 风控告警
  RISK_ALERT_LIST: `${API_PREFIX}/console/risk-alerts`,
  RISK_ALERT_DETAIL: `${API_PREFIX}/console/risk-alerts/:id`,
  RISK_ALERT_REVIEW: `${API_PREFIX}/console/risk-alerts/:id/review`,
  RISK_ALERT_STATS: `${API_PREFIX}/console/risk-alerts/stats/summary`,
  RISK_ALERT_MARK_ALL_READ: `${API_PREFIX}/console/risk-alerts/mark-all-read`,
  RISK_ALERT_PENDING: `${API_PREFIX}/console/risk-alerts/pending`,
  RISK_ALERT_TYPES: `${API_PREFIX}/console/risk-alerts/types`,

  // 审计日志（后端路由：/api/v4/console/admin-audit-logs）
  AUDIT_LOG_LIST: `${API_PREFIX}/console/admin-audit-logs`,
  AUDIT_LOG_STATISTICS: `${API_PREFIX}/console/admin-audit-logs/statistics`,
  AUDIT_LOG_DETAIL: `${API_PREFIX}/console/admin-audit-logs/:id`,
  AUDIT_LOG_EXPORT: `${API_PREFIX}/console/admin-audit-logs/export`,
  /** 审计报告 - 生成审计报告（支持时间范围筛选） */
  AUDIT_LOG_REPORT: `${API_PREFIX}/console/admin-audit-logs/report`,

  // 会话管理
  SESSION_LIST: `${API_PREFIX}/console/sessions`,
  SESSION_DETAIL: `${API_PREFIX}/console/sessions/:session_id`,
  SESSION_TERMINATE: `${API_PREFIX}/console/sessions/:session_id/terminate`,
  SESSION_TERMINATE_ALL: `${API_PREFIX}/console/sessions/terminate-all`,

  // 配置工具
  CONFIG_TOOL_VALIDATE: `${API_PREFIX}/console/config-tools/validate`,
  CONFIG_TOOL_EXPORT: `${API_PREFIX}/console/config-tools/export`,
  CONFIG_TOOL_IMPORT: `${API_PREFIX}/console/config-tools/import`,

  // 字典管理 - 类目
  DICT_CATEGORY_LIST: `${API_PREFIX}/console/dictionaries/categories`,
  DICT_CATEGORY_DETAIL: `${API_PREFIX}/console/dictionaries/categories/:code`,
  DICT_CATEGORY_CREATE: `${API_PREFIX}/console/dictionaries/categories`,
  DICT_CATEGORY_UPDATE: `${API_PREFIX}/console/dictionaries/categories/:code`,
  DICT_CATEGORY_DELETE: `${API_PREFIX}/console/dictionaries/categories/:code`,
  DICT_CATEGORY_TREE: `${API_PREFIX}/console/dictionaries/categories/tree`,

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
   * 获取通知详情
   * @param {number} id - 通知 admin_notification_id
   * @returns {Promise<Object>} 通知详情响应
   */
  async getNotificationDetail(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_DETAIL, { id })
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

  /**
   * 获取未读通知数量
   * @returns {Promise<Object>} { unread_count, urgent_unread_count }
   */
  async getNotificationUnreadCount() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_UNREAD_COUNT, method: 'GET' })
  },

  /**
   * 删除单条通知（物理删除）
   * @param {number} id - 通知 admin_notification_id
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteNotification(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 清空已读通知
   * @returns {Promise<Object>} 清空结果响应
   */
  async clearNotifications() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.NOTIFICATION_CLEAR, method: 'POST' })
  },

  // ===== 地域定向管理 =====

  /**
   * 获取地域列表
   * @param {Object} [params={}] - 查询参数（zone_type, status, keyword, page, page_size）
   * @returns {Promise<Object>} 地域列表响应
   */
  async getZoneList(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取地域详情
   * @param {number} id - 地域ID
   * @returns {Promise<Object>} 地域详情响应
   */
  async getZoneDetail(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建地域
   * @param {Object} data - 地域数据（zone_type, zone_name, priority, parent_zone_id, geo_scope）
   * @returns {Promise<Object>} 创建结果
   */
  async createZone(data) {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_CREATE, method: 'POST', data })
  },

  /**
   * 更新地域
   * @param {number} id - 地域ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateZone(id, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除地域
   * @param {number} id - 地域ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteZone(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 联合广告组管理 =====

  /**
   * 获取联合组列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 联合组列表
   */
  async getZoneGroupList(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_GROUP_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取联合组详情
   * @param {number} id - 联合组ID
   * @returns {Promise<Object>} 联合组详情
   */
  async getZoneGroupDetail(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_GROUP_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建联合组
   * @param {Object} data - 联合组数据
   * @returns {Promise<Object>} 创建结果
   */
  async createZoneGroup(data) {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_GROUP_CREATE, method: 'POST', data })
  },

  /**
   * 更新联合组
   * @param {number} id - 联合组ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateZoneGroup(id, data) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_GROUP_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除联合组
   * @param {number} id - 联合组ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteZoneGroup(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_GROUP_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 添加联合组成员
   * @param {number} id - 联合组ID
   * @param {number[]} zoneIds - 地域ID列表
   * @returns {Promise<Object>} 添加结果
   */
  async addZoneGroupMembers(id, zoneIds) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_GROUP_ADD_MEMBERS, { id })
    return await request({ url, method: 'POST', data: { zone_ids: zoneIds } })
  },

  /**
   * 移除联合组成员
   * @param {number} id - 联合组ID
   * @param {number[]} zoneIds - 地域ID列表
   * @returns {Promise<Object>} 移除结果
   */
  async removeZoneGroupMembers(id, zoneIds) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_ZONE_GROUP_REMOVE_MEMBERS, { id })
    return await request({ url, method: 'DELETE', data: { zone_ids: zoneIds } })
  },

  // ===== 调价历史管理 =====

  /**
   * 获取调价历史列表
   * @param {Object} [params={}] - 查询参数（status, trigger_type, page, page_size）
   * @returns {Promise<Object>} 调价历史列表
   */
  async getPriceAdjustmentList(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.AD_PRICE_ADJUSTMENT_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 确认调价建议
   * @param {number} id - 调价记录ID
   * @returns {Promise<Object>} 确认结果
   */
  async confirmPriceAdjustment(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_PRICE_ADJUSTMENT_CONFIRM, { id })
    return await request({ url, method: 'POST' })
  },

  /**
   * 拒绝调价建议
   * @param {number} id - 调价记录ID
   * @returns {Promise<Object>} 拒绝结果
   */
  async rejectPriceAdjustment(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_PRICE_ADJUSTMENT_REJECT, { id })
    return await request({ url, method: 'POST' })
  },

  /**
   * 执行已确认的调价
   * @param {number} id - 调价记录ID
   * @returns {Promise<Object>} 执行结果
   */
  async applyPriceAdjustment(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AD_PRICE_ADJUSTMENT_APPLY, { id })
    return await request({ url, method: 'POST' })
  },

  // ===== 风控告警 =====

  /**
   * 获取风控告警列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 告警列表响应
   */
  async getRiskAlerts(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.RISK_ALERT_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 复核风控告警（标记为已处理）
   * @param {number} id - 告警 ID
   * @param {Object} [data={}] - 处理数据（可含 review_notes）
   * @returns {Promise<Object>} 处理结果响应
   */
  async processRiskAlert(id, data = {}) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.RISK_ALERT_REVIEW, { id })
    return await request({
      url,
      method: 'POST',
      data: { ...data, status: 'reviewed' }
    })
  },

  /**
   * 忽略风控告警
   * @param {number} id - 告警 ID
   * @param {Object} [data={}] - 忽略数据（可含 review_notes）
   * @returns {Promise<Object>} 操作结果响应
   */
  async dismissRiskAlert(id, data = {}) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.RISK_ALERT_REVIEW, { id })
    return await request({
      url,
      method: 'POST',
      data: { ...data, status: 'ignored' }
    })
  },

  /**
   * 批量标记所有待处理告警为已读
   * @param {Object} [filters={}] - 可选筛选条件
   * @returns {Promise<Object>} 操作结果响应
   */
  async markAllRiskAlertsRead(filters = {}) {
    return await request({
      url: SYSTEM_ADMIN_ENDPOINTS.RISK_ALERT_MARK_ALL_READ,
      method: 'POST',
      data: filters
    })
  },

  /**
   * 获取风控告警统计
   * @returns {Promise<Object>} 统计数据响应
   */
  async getRiskAlertStats() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.RISK_ALERT_STATS, method: 'GET' })
  },

  // ===== 审计日志 =====

  /**
   * 获取审计日志列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 日志列表响应
   */
  async getAuditLogs(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.AUDIT_LOG_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取审计日志统计
   * @returns {Promise<Object>} 统计数据响应
   */
  async getAuditLogStats() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.AUDIT_LOG_STATISTICS, method: 'GET' })
  },

  /**
   * 获取审计日志详情
   * @param {number} id - 日志 ID
   * @returns {Promise<Object>} 日志详情响应
   */
  async getAuditLogDetail(id) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.AUDIT_LOG_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 生成审计报告
   * @param {Object} [params={}] - 报告参数
   * @param {string} [params.time_range='7d'] - 时间范围（7d/30d/90d/custom）
   * @param {string} [params.start_date] - 自定义开始日期（YYYY-MM-DD，time_range=custom时必填）
   * @param {string} [params.end_date] - 自定义结束日期（YYYY-MM-DD，time_range=custom时必填）
   * @param {number} [params.operator_id] - 操作员ID筛选（可选）
   * @returns {Promise<Object>} 审计报告数据
   */
  async getAuditReport(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.AUDIT_LOG_REPORT + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 会话管理 =====

  /**
   * 获取会话列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 会话列表响应
   */
  async getSessions(params = {}) {
    const url = SYSTEM_ADMIN_ENDPOINTS.SESSION_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 终止指定会话
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object>} 操作结果响应
   */
  async terminateSession(sessionId) {
    const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.SESSION_TERMINATE, { session_id: sessionId })
    return await request({ url, method: 'POST' })
  },

  /**
   * 终止所有会话
   * @returns {Promise<Object>} 操作结果响应
   */
  async terminateAllSessions() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.SESSION_TERMINATE_ALL, method: 'POST' })
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
   * 获取两级分类树
   * @returns {Promise<Object>} 树形分类数据
   */
  async getCategoryTree() {
    return await request({ url: SYSTEM_ADMIN_ENDPOINTS.DICT_CATEGORY_TREE, method: 'GET' })
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
