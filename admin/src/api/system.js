/**
 * 系统配置 API 模块
 *
 * @module api/system
 * @description 系统设置、公告、风控、审计日志相关的 API 调用
 * @version 1.0.0
 * @date 2026-01-23
 */

import { request, buildURL, buildQueryString } from './base.js'

// ========== API 端点 ==========

export const SYSTEM_ENDPOINTS = {
  // 系统基础
  DASHBOARD: '/api/v4/console/system/dashboard',
  DASHBOARD_TRENDS: '/api/v4/console/analytics/decisions/analytics', // 仪表盘趋势数据
  CHARTS: '/api/v4/console/analytics/decisions/analytics', // 统计图表数据（与DASHBOARD_TRENDS相同）
  LOTTERY_TRENDS: '/api/v4/console/analytics/lottery/trends', // 抽奖趋势数据
  PERFORMANCE_REPORT: '/api/v4/console/analytics/performance/report', // 性能报告
  TODAY_STATS: '/api/v4/console/analytics/stats/today', // 今日统计
  STATISTICS_EXPORT: '/api/v4/system/statistics/export', // 统计导出
  HEALTH: '/health',
  VERSION: '/api/v4',

  // 系统设置
  SETTINGS_LIST: '/api/v4/console/settings',
  SETTINGS_CATEGORY: '/api/v4/console/settings/:category',
  SETTINGS_UPDATE: '/api/v4/console/settings/:category',
  SETTINGS_GLOBAL: '/api/v4/console/settings/global',
  SETTINGS_LOTTERY: '/api/v4/console/settings/lottery',
  SETTINGS_SYSTEM: '/api/v4/console/settings/system',
  SETTINGS_PRIZE: '/api/v4/console/settings/prize',
  SETTINGS_SECURITY: '/api/v4/console/settings/security',
  SETTINGS_BASIC: '/api/v4/console/settings/basic',
  SETTINGS_POINTS: '/api/v4/console/settings/points',
  SETTINGS_NOTIFICATION: '/api/v4/console/settings/notification',
  SETTINGS_MARKETPLACE: '/api/v4/console/settings/marketplace',

  // 公告管理
  ANNOUNCEMENT_LIST: '/api/v4/console/system/announcements',
  ANNOUNCEMENT_DETAIL: '/api/v4/console/system/announcements/:id',
  ANNOUNCEMENT_CREATE: '/api/v4/console/system/announcements',
  ANNOUNCEMENT_UPDATE: '/api/v4/console/system/announcements/:id',
  ANNOUNCEMENT_DELETE: '/api/v4/console/system/announcements/:id',

  // 系统通知
  NOTIFICATION_LIST: '/api/v4/system/notifications',
  NOTIFICATION_READ: '/api/v4/system/notifications/:id/read',
  NOTIFICATION_READ_ALL: '/api/v4/system/notifications/read-all',
  NOTIFICATION_CLEAR: '/api/v4/system/notifications/clear',
  NOTIFICATION_SEND: '/api/v4/system/notifications/send',
  NOTIFICATION_ANNOUNCEMENTS: '/api/v4/console/notifications/announcements',
  CONSOLE_NOTIFICATIONS: '/api/v4/console/system/notifications',

  // 弹窗Banner
  POPUP_BANNER_LIST: '/api/v4/console/popup-banners',
  POPUP_BANNER_STATS: '/api/v4/console/popup-banners/statistics',
  POPUP_BANNER_DETAIL: '/api/v4/console/popup-banners/:id',
  POPUP_BANNER_CREATE: '/api/v4/console/popup-banners',
  POPUP_BANNER_UPDATE: '/api/v4/console/popup-banners/:id',
  POPUP_BANNER_DELETE: '/api/v4/console/popup-banners/:id',
  POPUP_BANNER_TOGGLE: '/api/v4/console/popup-banners/:id/toggle',

  // 图片资源
  IMAGE_LIST: '/api/v4/console/images',
  IMAGE_UPLOAD: '/api/v4/console/images/upload',
  IMAGE_DELETE: '/api/v4/console/images/:id',

  // 缓存管理
  CACHE_CLEAR: '/api/v4/console/cache/clear',

  // 风控告警
  RISK_ALERTS_LIST: '/api/v4/console/risk-alerts',
  RISK_ALERTS_DETAIL: '/api/v4/console/risk-alerts/:id',
  RISK_ALERTS_PROCESS: '/api/v4/console/risk-alerts/:id/process',
  RISK_ALERTS_DISMISS: '/api/v4/console/risk-alerts/:id/dismiss',
  RISK_ALERTS_STATS: '/api/v4/console/risk-alerts/stats',

  // 审计日志
  AUDIT_LOGS_LIST: '/api/v4/console/system/audit-logs',
  AUDIT_LOGS_STATISTICS: '/api/v4/console/system/audit-logs/statistics',
  AUDIT_LOGS_DETAIL: '/api/v4/console/system/audit-logs/:id',

  // 会话管理
  SESSIONS_LIST: '/api/v4/console/sessions',
  SESSIONS_DETAIL: '/api/v4/console/sessions/:session_id',
  SESSIONS_TERMINATE: '/api/v4/console/sessions/:session_id/terminate',
  SESSIONS_TERMINATE_ALL: '/api/v4/console/sessions/terminate-all',

  // 配置工具
  CONFIG_TOOLS_VALIDATE: '/api/v4/console/config-tools/validate',
  CONFIG_TOOLS_EXPORT: '/api/v4/console/config-tools/export',
  CONFIG_TOOLS_IMPORT: '/api/v4/console/config-tools/import',

  // 字典管理 - 类目
  DICT_CATEGORY_LIST: '/api/v4/console/dictionaries/categories',
  DICT_CATEGORY_DETAIL: '/api/v4/console/dictionaries/categories/:code',
  DICT_CATEGORY_CREATE: '/api/v4/console/dictionaries/categories',
  DICT_CATEGORY_UPDATE: '/api/v4/console/dictionaries/categories/:code',
  DICT_CATEGORY_DELETE: '/api/v4/console/dictionaries/categories/:code',

  // 字典管理 - 稀有度
  DICT_RARITY_LIST: '/api/v4/console/dictionaries/rarities',
  DICT_RARITY_DETAIL: '/api/v4/console/dictionaries/rarities/:code',
  DICT_RARITY_CREATE: '/api/v4/console/dictionaries/rarities',
  DICT_RARITY_UPDATE: '/api/v4/console/dictionaries/rarities/:code',
  DICT_RARITY_DELETE: '/api/v4/console/dictionaries/rarities/:code',

  // 字典管理 - 资产分组
  DICT_ASSET_GROUP_LIST: '/api/v4/console/dictionaries/asset-groups',
  DICT_ASSET_GROUP_DETAIL: '/api/v4/console/dictionaries/asset-groups/:code',
  DICT_ASSET_GROUP_CREATE: '/api/v4/console/dictionaries/asset-groups',
  DICT_ASSET_GROUP_UPDATE: '/api/v4/console/dictionaries/asset-groups/:code',
  DICT_ASSET_GROUP_DELETE: '/api/v4/console/dictionaries/asset-groups/:code',

  // 字典管理 - 全量获取
  DICT_ALL: '/api/v4/console/dictionaries/all',

  // 字典管理 - 兼容别名（映射到 categories 作为默认字典类型）
  // 注意：后端按类型分离字典 API，这些别名用于 dict.js composable 兼容
  DICT_LIST: '/api/v4/console/dictionaries/categories',
  DICT_DETAIL: '/api/v4/console/dictionaries/categories/:code',
  DICT_CREATE: '/api/v4/console/dictionaries/categories',
  DICT_UPDATE: '/api/v4/console/dictionaries/categories/:code',
  DICT_DELETE: '/api/v4/console/dictionaries/categories/:code',

  // 功能开关
  FEATURE_FLAG_LIST: '/api/v4/console/feature-flags',
  FEATURE_FLAG_DETAIL: '/api/v4/console/feature-flags/:flagKey',
  FEATURE_FLAG_CREATE: '/api/v4/console/feature-flags',
  FEATURE_FLAG_UPDATE: '/api/v4/console/feature-flags/:flagKey',
  FEATURE_FLAG_DELETE: '/api/v4/console/feature-flags/:flagKey',
  FEATURE_FLAG_TOGGLE: '/api/v4/console/feature-flags/:flagKey/toggle',
  FEATURE_FLAG_WHITELIST_ADD: '/api/v4/console/feature-flags/:flagKey/whitelist',
  FEATURE_FLAG_WHITELIST_REMOVE: '/api/v4/console/feature-flags/:flagKey/whitelist',
  FEATURE_FLAG_BLACKLIST_ADD: '/api/v4/console/feature-flags/:flagKey/blacklist',
  FEATURE_FLAG_BLACKLIST_REMOVE: '/api/v4/console/feature-flags/:flagKey/blacklist',
  FEATURE_FLAG_CHECK: '/api/v4/console/feature-flags/:flagKey/check/:userId',

  // 系统配置（全局）
  SYSTEM_CONFIG_LIST: '/api/v4/console/settings',
  SYSTEM_CONFIG_GET: '/api/v4/console/system/config',
  SYSTEM_CONFIG_UPDATE: '/api/v4/console/system/config',
  SYSTEM_CONFIG_MAINTENANCE: '/api/v4/console/system/config/maintenance',
  SYSTEM_CONFIG_PRICING: '/api/v4/console/settings/pricing',
  SYSTEM_CONFIG_UPDATE_PRICING: '/api/v4/console/settings/pricing',

  // 行政区划
  REGION_PROVINCES: '/api/v4/console/regions/provinces',
  REGION_CHILDREN: '/api/v4/console/regions/:parent_code/children',

  // 风控告警（兼容别名）
  RISK_ALERT_LIST: '/api/v4/console/risk-alerts',
  RISK_ALERT_REVIEW: '/api/v4/console/risk-alerts/:id/review',
  RISK_ALERT_MARK_ALL_READ: '/api/v4/console/risk-alerts/mark-all-read',

  // 审计日志（兼容别名）
  AUDIT_LOG_LIST: '/api/v4/console/audit-logs',
  AUDIT_LOG_DETAIL: '/api/v4/console/audit-logs/:id',
  AUDIT_LOG_EXPORT: '/api/v4/console/audit-logs/export'
}

// ========== API 调用方法 ==========

export const SystemAPI = {
  // ===== 系统基础 =====

  /**
   * 获取仪表盘数据
   *
   * @description 获取管理后台仪表盘概览数据，包含今日统计、趋势分析等
   * @async
   * @function getDashboard
   * @memberof SystemAPI
   * @returns {Promise<Object>} 仪表盘数据响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 仪表盘数据
   * @returns {Object} returns.data.today_stats - 今日统计
   * @returns {number} returns.data.today_stats.new_users - 今日新增用户
   * @returns {number} returns.data.today_stats.lottery_count - 今日抽奖次数
   * @returns {number} returns.data.today_stats.order_count - 今日订单数
   * @returns {Object} returns.data.trends - 趋势数据
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取仪表盘概览</caption>
   * const response = await SystemAPI.getDashboard()
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     today_stats: { new_users: 15, lottery_count: 128, order_count: 23 },
   * //     trends: { users: [...], orders: [...] }
   * //   }
   * // }
   */
  async getDashboard() {
    return await request({ url: SYSTEM_ENDPOINTS.DASHBOARD, method: 'GET' })
  },

  /**
   * 系统健康检查
   *
   * @description 检查后端服务、数据库、Redis等依赖服务的健康状态
   * @async
   * @function healthCheck
   * @memberof SystemAPI
   * @returns {Promise<Object>} 健康检查响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 健康状态数据
   * @returns {string} returns.data.status - 整体状态（healthy|degraded|unhealthy）
   * @returns {Object} returns.data.checks - 各服务检查结果
   * @returns {Object} returns.data.checks.database - 数据库状态
   * @returns {Object} returns.data.checks.redis - Redis状态
   * @returns {number} returns.data.uptime - 服务运行时间（秒）
   * @throws {Error} 服务不可用时抛出错误
   *
   * @example <caption>执行健康检查</caption>
   * const response = await SystemAPI.healthCheck()
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     status: 'healthy',
   * //     checks: {
   * //       database: { status: 'connected', latency: 5 },
   * //       redis: { status: 'connected', latency: 2 }
   * //     },
   * //     uptime: 86400
   * //   }
   * // }
   */
  async healthCheck() {
    return await request({ url: SYSTEM_ENDPOINTS.HEALTH, method: 'GET' })
  },

  /**
   * 获取 API 版本信息
   *
   * @description 获取后端API版本、构建信息和支持的功能列表
   * @async
   * @function getVersion
   * @memberof SystemAPI
   * @returns {Promise<Object>} 版本信息响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 版本数据
   * @returns {string} returns.data.version - API版本号
   * @returns {string} returns.data.build - 构建号
   * @returns {string} returns.data.environment - 运行环境
   * @returns {Array<string>} returns.data.features - 支持的功能列表
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取API版本</caption>
   * const response = await SystemAPI.getVersion()
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     version: 'v4.0.0',
   * //     build: '20260123',
   * //     environment: 'production',
   * //     features: ['lottery', 'market', 'chat']
   * //   }
   * // }
   */
  async getVersion() {
    return await request({ url: SYSTEM_ENDPOINTS.VERSION, method: 'GET' })
  },

  // ===== 系统设置 =====

  /**
   * 获取所有设置概览
   *
   * @async
   * @function getSettings
   * @memberof SystemAPI
   * @returns {Promise<Object>} 设置概览响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 各分类的设置概览
   * @returns {Object} returns.data.basic - 基础设置概览
   * @returns {number} returns.data.basic.count - 基础设置项数量
   * @returns {Object} returns.data.lottery - 抽奖设置概览
   * @returns {Object} returns.data.points - 积分设置概览
   * @returns {Object} returns.data.notification - 通知设置概览
   * @returns {Object} returns.data.security - 安全设置概览
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取全部设置概览</caption>
   * const response = await SystemAPI.getSettings()
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     basic: { count: 5, last_updated: '2026-01-23T10:00:00+08:00' },
   * //     lottery: { count: 8, last_updated: '2026-01-22T15:30:00+08:00' },
   * //     points: { count: 4, last_updated: '2026-01-20T09:00:00+08:00' },
   * //     notification: { count: 6, last_updated: '2026-01-21T14:00:00+08:00' },
   * //     security: { count: 3, last_updated: '2026-01-19T11:00:00+08:00' }
   * //   },
   * //   message: '系统设置概览获取成功'
   * // }
   */
  async getSettings() {
    return await request({ url: SYSTEM_ENDPOINTS.SETTINGS_LIST, method: 'GET' })
  },

  /**
   * 获取指定分类的设置详情
   *
   * @description 获取某个分类下的所有配置项及其当前值
   * @async
   * @function getSettingsByCategory
   * @memberof SystemAPI
   * @param {string} category - 设置分类码（basic|lottery|points|notification|security）
   * @returns {Promise<Object>} 分类设置响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 设置数据
   * @returns {string} returns.data.category - 分类码
   * @returns {number} returns.data.count - 设置项数量
   * @returns {Array<Object>} returns.data.settings - 设置项列表
   * @returns {string} returns.data.settings[].key - 设置项键名
   * @returns {*} returns.data.settings[].value - 设置项值
   * @returns {string} returns.data.settings[].description - 设置项描述
   * @throws {Error} INVALID_CATEGORY - 无效的设置分类
   *
   * @example <caption>获取基础设置详情</caption>
   * const response = await SystemAPI.getSettingsByCategory('basic')
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     category: 'basic',
   * //     count: 5,
   * //     settings: [
   * //       { key: 'system_name', value: '餐厅抽奖系统', description: '系统名称' },
   * //       { key: 'customer_phone', value: '400-123-4567', description: '客服电话' }
   * //     ]
   * //   }
   * // }
   */
  async getSettingsByCategory(category) {
    const url = buildURL(SYSTEM_ENDPOINTS.SETTINGS_CATEGORY, { category })
    return await request({ url, method: 'GET' })
  },

  /**
   * 更新分类设置
   *
   * @async
   * @function updateSettings
   * @memberof SystemAPI
   * @param {string} category - 设置分类码（basic|lottery|points|notification|security）
   * @param {Object} data - 设置更新数据
   * @param {Object} data.settings - 要更新的配置项键值对
   * @returns {Promise<Object>} 更新结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 更新结果详情
   * @returns {number} returns.data.total_requested - 请求更新的设置项数量
   * @returns {number} returns.data.success_count - 成功更新的数量
   * @returns {number} returns.data.error_count - 更新失败的数量
   * @returns {Array} returns.data.errors - 失败项详情数组
   * @throws {Error} INVALID_CATEGORY - 无效的设置分类
   * @throws {Error} INVALID_SETTINGS_DATA - 未提供要更新的设置项
   *
   * @example <caption>更新基础设置</caption>
   * const response = await SystemAPI.updateSettings('basic', {
   *   settings: {
   *     system_name: '餐厅抽奖系统',
   *     customer_phone: '400-123-4567',
   *     maintenance_mode: false
   *   }
   * })
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     total_requested: 3,
   * //     success_count: 3,
   * //     error_count: 0,
   * //     errors: []
   * //   },
   * //   message: 'basic设置更新完成'
   * // }
   *
   * @example <caption>更新抽奖设置</caption>
   * const response = await SystemAPI.updateSettings('lottery', {
   *   settings: {
   *     daily_draw_limit: 5,
   *     cost_per_draw: 10,
   *     enable_guaranteed_prize: true
   *   }
   * })
   */
  async updateSettings(category, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.SETTINGS_UPDATE, { category })
    return await request({ url, method: 'PUT', data })
  },

  // ===== 公告管理 =====

  /**
   * 获取公告列表
   *
   * @async
   * @function getAnnouncements
   * @memberof SystemAPI
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.type] - 公告类型过滤（notice|system|maintenance）
   * @param {string} [params.priority] - 优先级过滤（low|medium|high）
   * @param {string} [params.is_active] - 是否激活（'true'|'false'）
   * @param {number} [params.limit=20] - 每页数量
   * @param {number} [params.offset=0] - 偏移量
   * @returns {Promise<Object>} 公告列表响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 公告数据
   * @returns {Array<Object>} returns.data.announcements - 公告列表
   * @returns {number} returns.data.announcements[].announcement_id - 公告ID
   * @returns {string} returns.data.announcements[].title - 公告标题
   * @returns {string} returns.data.announcements[].content - 公告内容
   * @returns {string} returns.data.announcements[].type - 公告类型
   * @returns {string} returns.data.announcements[].priority - 优先级
   * @returns {boolean} returns.data.announcements[].is_active - 是否激活
   * @returns {string} returns.data.announcements[].created_at - 创建时间（北京时间）
   * @returns {number} returns.data.total - 总数量
   * @returns {number} returns.data.limit - 每页数量
   * @returns {number} returns.data.offset - 当前偏移量
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>查询公告列表（分页）</caption>
   * const response = await SystemAPI.getAnnouncements({
   *   type: 'notice',
   *   priority: 'high',
   *   is_active: 'true',
   *   limit: 10,
   *   offset: 0
   * })
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     announcements: [
   * //       {
   * //         announcement_id: 1,
   * //         title: '系统升级通知',
   * //         content: '系统将于今晚进行维护升级...',
   * //         type: 'notice',
   * //         priority: 'high',
   * //         is_active: true,
   * //         target_groups: 'all',
   * //         view_count: 120,
   * //         created_at: '2026-01-23T10:00:00+08:00',
   * //         expires_at: null,
   * //         creator: { user_id: 1, nickname: '管理员' }
   * //       }
   * //     ],
   * //     total: 15,
   * //     limit: 10,
   * //     offset: 0
   * //   },
   * //   message: '获取公告列表成功'
   * // }
   */
  async getAnnouncements(params = {}) {
    const url = SYSTEM_ENDPOINTS.ANNOUNCEMENT_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取公告详情
   *
   * @description 获取指定公告的完整详情，包含创建者信息
   * @async
   * @function getAnnouncementDetail
   * @memberof SystemAPI
   * @param {number} id - 公告 ID
   * @returns {Promise<Object>} 公告详情响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 公告详情
   * @returns {number} returns.data.announcement_id - 公告ID
   * @returns {string} returns.data.title - 公告标题
   * @returns {string} returns.data.content - 公告内容
   * @returns {string} returns.data.type - 公告类型
   * @returns {string} returns.data.priority - 优先级
   * @returns {boolean} returns.data.is_active - 是否激活
   * @returns {number} returns.data.view_count - 浏览次数
   * @returns {Object} returns.data.creator - 创建者信息
   * @throws {Error} ANNOUNCEMENT_NOT_FOUND - 公告不存在
   *
   * @example <caption>获取公告详情</caption>
   * const response = await SystemAPI.getAnnouncementDetail(1)
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     announcement_id: 1,
   * //     title: '系统升级通知',
   * //     content: '系统将于今晚22:00-24:00进行升级维护...',
   * //     type: 'maintenance',
   * //     priority: 'high',
   * //     is_active: true,
   * //     view_count: 156,
   * //     created_at: '2026-01-23T10:00:00+08:00',
   * //     creator: { user_id: 1, nickname: '管理员' }
   * //   }
   * // }
   */
  async getAnnouncementDetail(id) {
    const url = buildURL(SYSTEM_ENDPOINTS.ANNOUNCEMENT_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建系统公告
   *
   * @description 创建新的系统公告，支持多类型、优先级控制和过期时间设置
   * @async
   * @param {Object} data - 公告数据
   * @param {string} data.title - 公告标题（必填，1-200字符）
   * @param {string} data.content - 公告内容（必填）
   * @param {'system'|'activity'|'maintenance'|'notice'} [data.type='notice'] - 公告类型
   *   - `system` - 系统公告（重要系统通知）
   *   - `activity` - 活动公告（促销活动等）
   *   - `maintenance` - 维护公告（系统维护通知）
   *   - `notice` - 通知公告（一般通知，默认）
   * @param {'high'|'medium'|'low'} [data.priority='medium'] - 优先级
   *   - `high` - 高优先级（优先展示）
   *   - `medium` - 中优先级（默认）
   *   - `low` - 低优先级
   * @param {boolean} [data.is_active=true] - 是否立即激活
   * @param {string|null} [data.expires_at] - 过期时间（ISO 8601 格式，null 表示永不过期）
   * @param {Array<string>|null} [data.target_groups] - 目标用户组（管理员可见）
   * @param {string|null} [data.internal_notes] - 内部备注（管理员可见）
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {string} return.code - 业务状态码
   * @returns {Object} return.data - 创建的公告数据
   * @returns {number} return.data.announcement_id - 公告ID
   * @returns {string} return.data.title - 公告标题
   * @returns {string} return.data.content - 公告内容
   * @returns {string} return.data.type - 公告类型
   * @returns {string} return.data.priority - 优先级
   * @returns {boolean} return.data.is_active - 是否激活
   * @returns {string} return.data.created_at - 创建时间（北京时间）
   * @throws {Error} 当标题或内容为空时抛出验证错误
   * @throws {Error} 当类型或优先级值无效时抛出验证错误
   * @example
   * // 创建高优先级系统公告
   * const result = await SystemAPI.createAnnouncement({
   *   title: '系统升级通知',
   *   content: '系统将于今晚22:00-24:00进行升级维护...',
   *   type: 'maintenance',
   *   priority: 'high',
   *   expires_at: '2026-01-24T00:00:00+08:00'
   * })
   */
  async createAnnouncement(data) {
    return await request({ url: SYSTEM_ENDPOINTS.ANNOUNCEMENT_CREATE, method: 'POST', data })
  },

  /**
   * 更新公告
   *
   * @description 更新指定公告的信息，支持部分更新
   * @async
   * @function updateAnnouncement
   * @memberof SystemAPI
   * @param {number} id - 公告 ID
   * @param {Object} data - 公告更新数据
   * @param {string} [data.title] - 公告标题
   * @param {string} [data.content] - 公告内容
   * @param {string} [data.type] - 公告类型
   * @param {string} [data.priority] - 优先级
   * @param {boolean} [data.is_active] - 是否激活
   * @param {string|null} [data.expires_at] - 过期时间
   * @returns {Promise<Object>} 更新结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 更新后的公告数据
   * @returns {Object} returns.data.announcement - 公告详情
   * @throws {Error} ANNOUNCEMENT_NOT_FOUND - 公告不存在
   *
   * @example <caption>更新公告内容和状态</caption>
   * const response = await SystemAPI.updateAnnouncement(1, {
   *   title: '系统升级通知（更新）',
   *   is_active: false
   * })
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: { announcement: { ... } },
   * //   message: '公告更新成功'
   * // }
   */
  async updateAnnouncement(id, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.ANNOUNCEMENT_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除公告
   *
   * @description 删除指定公告（软删除或硬删除取决于后端配置）
   * @async
   * @function deleteAnnouncement
   * @memberof SystemAPI
   * @param {number} id - 公告 ID
   * @returns {Promise<Object>} 删除结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {string} returns.message - 操作消息
   * @throws {Error} ANNOUNCEMENT_NOT_FOUND - 公告不存在
   * @throws {Error} ANNOUNCEMENT_DELETE_FAILED - 删除失败
   *
   * @example <caption>删除公告</caption>
   * const response = await SystemAPI.deleteAnnouncement(1)
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   message: '公告删除成功'
   * // }
   */
  async deleteAnnouncement(id) {
    const url = buildURL(SYSTEM_ENDPOINTS.ANNOUNCEMENT_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 系统通知 =====

  /**
   * 获取通知列表
   *
   * @description 获取当前用户的通知列表，支持分页和类型过滤
   * @async
   * @function getNotifications
   * @memberof SystemAPI
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.type] - 通知类型过滤
   * @param {boolean} [params.unread_only] - 仅未读通知
   * @param {number} [params.limit=20] - 每页数量
   * @param {number} [params.offset=0] - 偏移量
   * @returns {Promise<Object>} 通知列表响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 通知数据
   * @returns {Array<Object>} returns.data.notifications - 通知列表
   * @returns {number} returns.data.total - 总数量
   * @returns {number} returns.data.unread_count - 未读数量
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取未读通知</caption>
   * const response = await SystemAPI.getNotifications({
   *   unread_only: true,
   *   limit: 10
   * })
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     notifications: [
   * //       { notification_id: 1, title: '新订单', is_read: false, ... }
   * //     ],
   * //     total: 25,
   * //     unread_count: 5
   * //   }
   * // }
   */
  async getNotifications(params = {}) {
    const url = SYSTEM_ENDPOINTS.NOTIFICATION_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 标记单条通知已读
   *
   * @description 将指定通知标记为已读状态
   * @async
   * @function markNotificationRead
   * @memberof SystemAPI
   * @param {number} id - 通知 ID
   * @returns {Promise<Object>} 操作结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {string} returns.message - 操作消息
   * @throws {Error} NOTIFICATION_NOT_FOUND - 通知不存在
   *
   * @example <caption>标记通知已读</caption>
   * const response = await SystemAPI.markNotificationRead(1)
   * // 响应数据结构:
   * // { success: true, message: '已标记为已读' }
   */
  async markNotificationRead(id) {
    const url = buildURL(SYSTEM_ENDPOINTS.NOTIFICATION_READ, { id })
    return await request({ url, method: 'POST' })
  },

  /**
   * 标记所有通知已读
   *
   * @description 将当前用户的所有未读通知标记为已读
   * @async
   * @function markAllNotificationsRead
   * @memberof SystemAPI
   * @returns {Promise<Object>} 操作结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 操作结果
   * @returns {number} returns.data.updated_count - 更新的通知数量
   * @throws {Error} 操作失败时抛出错误
   *
   * @example <caption>标记所有通知已读</caption>
   * const response = await SystemAPI.markAllNotificationsRead()
   * // 响应数据结构:
   * // { success: true, data: { updated_count: 5 }, message: '已全部标记为已读' }
   */
  async markAllNotificationsRead() {
    return await request({ url: SYSTEM_ENDPOINTS.NOTIFICATION_READ_ALL, method: 'POST' })
  },

  /**
   * 发送系统通知
   *
   * @description 发送系统通知给指定目标用户，内部会创建公告并通过 WebSocket 推送给在线用户
   * @async
   * @param {Object} data - 通知数据
   * @param {string} data.title - 通知标题（必填）
   * @param {string} data.content - 通知内容（必填）
   * @param {'system'|'user'|'order'|'alert'} [data.type='system'] - 通知类型
   *   - `system` - 系统通知（映射为 system 公告）
   *   - `user` - 用户通知（映射为 notice 公告）
   *   - `order` - 订单通知（映射为 notice 公告）
   *   - `alert` - 告警通知（映射为 maintenance 公告，高优先级）
   * @param {'all'|'user'|'admin'} [data.target='all'] - 目标用户群体
   *   - `all` - 所有用户
   *   - `user` - 仅普通用户
   *   - `admin` - 仅管理员
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {string} return.code - 业务状态码
   * @returns {Object} return.data - 发送结果
   * @returns {number} return.data.notification_id - 通知ID（对应公告ID）
   * @returns {string} return.data.title - 通知标题
   * @returns {string} return.data.content - 通知内容
   * @returns {string} return.data.type - 通知类型（转换后的公告类型）
   * @returns {string} return.data.created_at - 创建时间（北京时间）
   * @throws {Error} 当标题或内容为空时抛出 MISSING_REQUIRED_FIELDS 错误
   * @example
   * // 发送系统告警通知
   * const result = await SystemAPI.sendNotification({
   *   type: 'alert',
   *   title: '紧急通知',
   *   content: '系统检测到异常，请及时处理...',
   *   target: 'admin'
   * })
   */
  async sendNotification(data) {
    return await request({ url: SYSTEM_ENDPOINTS.NOTIFICATION_SEND, method: 'POST', data })
  },

  // ===== 弹窗Banner =====

  /**
   * 获取弹窗Banner列表
   *
   * @description 获取弹窗广告Banner列表，支持分页和状态过滤
   * @async
   * @function getPopupBanners
   * @memberof SystemAPI
   * @param {Object} [params={}] - 查询参数
   * @param {boolean} [params.is_active] - 是否激活
   * @param {number} [params.limit=20] - 每页数量
   * @param {number} [params.offset=0] - 偏移量
   * @returns {Promise<Object>} Banner列表响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - Banner数据
   * @returns {Array<Object>} returns.data.banners - Banner列表
   * @returns {number} returns.data.banners[].banner_id - Banner ID
   * @returns {string} returns.data.banners[].title - Banner标题
   * @returns {string} returns.data.banners[].image_url - 图片URL
   * @returns {boolean} returns.data.banners[].is_active - 是否激活
   * @returns {number} returns.data.total - 总数量
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取激活的Banner</caption>
   * const response = await SystemAPI.getPopupBanners({ is_active: true })
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     banners: [
   * //       { banner_id: 1, title: '春节活动', image_url: '...', is_active: true }
   * //     ],
   * //     total: 5
   * //   }
   * // }
   */
  async getPopupBanners(params = {}) {
    const url = SYSTEM_ENDPOINTS.POPUP_BANNER_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建弹窗Banner
   *
   * @description 创建新的弹窗广告Banner
   * @async
   * @function createPopupBanner
   * @memberof SystemAPI
   * @param {Object} data - Banner数据
   * @param {string} data.title - Banner标题
   * @param {string} data.image_url - 图片URL
   * @param {string} [data.link_url] - 跳转链接
   * @param {boolean} [data.is_active=true] - 是否激活
   * @param {number} [data.sort_order=0] - 排序顺序
   * @param {string} [data.start_time] - 开始时间
   * @param {string} [data.end_time] - 结束时间
   * @returns {Promise<Object>} 创建结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 创建的Banner数据
   * @throws {Error} 创建失败时抛出错误
   *
   * @example <caption>创建活动Banner</caption>
   * const response = await SystemAPI.createPopupBanner({
   *   title: '春节活动',
   *   image_url: 'https://example.com/banner.jpg',
   *   link_url: '/activity/spring',
   *   is_active: true
   * })
   */
  async createPopupBanner(data) {
    return await request({ url: SYSTEM_ENDPOINTS.POPUP_BANNER_CREATE, method: 'POST', data })
  },

  /**
   * 更新弹窗Banner
   *
   * @description 更新指定Banner的信息
   * @async
   * @function updatePopupBanner
   * @memberof SystemAPI
   * @param {number} id - Banner ID
   * @param {Object} data - 更新数据
   * @param {string} [data.title] - Banner标题
   * @param {string} [data.image_url] - 图片URL
   * @param {string} [data.link_url] - 跳转链接
   * @param {boolean} [data.is_active] - 是否激活
   * @param {number} [data.sort_order] - 排序顺序
   * @returns {Promise<Object>} 更新结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 更新后的Banner数据
   * @throws {Error} BANNER_NOT_FOUND - Banner不存在
   *
   * @example <caption>更新Banner图片</caption>
   * const response = await SystemAPI.updatePopupBanner(1, {
   *   image_url: 'https://example.com/new-banner.jpg'
   * })
   */
  async updatePopupBanner(id, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_UPDATE, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除弹窗Banner
   *
   * @description 删除指定的弹窗Banner
   * @async
   * @function deletePopupBanner
   * @memberof SystemAPI
   * @param {number} id - Banner ID
   * @returns {Promise<Object>} 删除结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {string} returns.message - 操作消息
   * @throws {Error} BANNER_NOT_FOUND - Banner不存在
   *
   * @example <caption>删除Banner</caption>
   * const response = await SystemAPI.deletePopupBanner(1)
   * // { success: true, message: 'Banner删除成功' }
   */
  async deletePopupBanner(id) {
    const url = buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 切换弹窗Banner状态
   *
   * @description 切换Banner的激活/停用状态
   * @async
   * @function togglePopupBanner
   * @memberof SystemAPI
   * @param {number} id - Banner ID
   * @returns {Promise<Object>} 切换结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 切换后的状态
   * @returns {boolean} returns.data.is_active - 当前激活状态
   * @throws {Error} BANNER_NOT_FOUND - Banner不存在
   *
   * @example <caption>切换Banner状态</caption>
   * const response = await SystemAPI.togglePopupBanner(1)
   * // { success: true, data: { is_active: false }, message: 'Banner已停用' }
   */
  async togglePopupBanner(id) {
    const url = buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_TOGGLE, { id })
    return await request({ url, method: 'POST' })
  },

  // ===== 缓存管理 =====

  /**
   * 清除系统缓存
   *
   * @description 清除指定类型的系统缓存，支持全量或部分清除
   * @async
   * @function clearCache
   * @memberof SystemAPI
   * @param {Object} [data={}] - 清除参数
   * @param {string} [data.type='all'] - 缓存类型（all|user|session|api|static）
   * @param {Array<string>} [data.keys] - 指定要清除的缓存键
   * @returns {Promise<Object>} 清除结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 清除结果
   * @returns {number} returns.data.cleared_count - 清除的缓存数量
   * @returns {string} returns.message - 操作消息
   * @throws {Error} CACHE_CLEAR_FAILED - 清除失败
   *
   * @example <caption>清除全部缓存</caption>
   * const response = await SystemAPI.clearCache({ type: 'all' })
   * // { success: true, data: { cleared_count: 156 }, message: '缓存清除成功' }
   *
   * @example <caption>清除指定缓存键</caption>
   * const response = await SystemAPI.clearCache({
   *   keys: ['user:1001', 'session:abc123']
   * })
   */
  async clearCache(data = {}) {
    return await request({ url: SYSTEM_ENDPOINTS.CACHE_CLEAR, method: 'POST', data })
  },

  // ===== 风控告警 =====

  /**
   * 获取风控告警列表
   *
   * @description 获取系统风控告警列表，支持状态和级别过滤
   * @async
   * @function getRiskAlerts
   * @memberof SystemAPI
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 告警状态（pending|processed|dismissed）
   * @param {string} [params.level] - 告警级别（low|medium|high|critical）
   * @param {number} [params.limit=20] - 每页数量
   * @param {number} [params.offset=0] - 偏移量
   * @returns {Promise<Object>} 告警列表响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 告警数据
   * @returns {Array<Object>} returns.data.alerts - 告警列表
   * @returns {number} returns.data.total - 总数量
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取高危告警</caption>
   * const response = await SystemAPI.getRiskAlerts({
   *   status: 'pending',
   *   level: 'high'
   * })
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     alerts: [
   * //       { alert_id: 1, type: 'abnormal_login', level: 'high', status: 'pending', ... }
   * //     ],
   * //     total: 8
   * //   }
   * // }
   */
  async getRiskAlerts(params = {}) {
    const url = SYSTEM_ENDPOINTS.RISK_ALERTS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 处理风控告警
   *
   * @description 处理指定的风控告警，记录处理结果
   * @async
   * @function processRiskAlert
   * @memberof SystemAPI
   * @param {number} id - 告警 ID
   * @param {Object} data - 处理数据
   * @param {string} data.action - 处理动作（block|warn|whitelist）
   * @param {string} [data.notes] - 处理备注
   * @returns {Promise<Object>} 处理结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 处理后的告警数据
   * @throws {Error} ALERT_NOT_FOUND - 告警不存在
   *
   * @example <caption>处理告警并封禁用户</caption>
   * const response = await SystemAPI.processRiskAlert(1, {
   *   action: 'block',
   *   notes: '确认为恶意行为，封禁处理'
   * })
   */
  async processRiskAlert(id, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.RISK_ALERTS_PROCESS, { id })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 忽略风控告警
   *
   * @description 忽略指定的风控告警，需要填写忽略原因
   * @async
   * @function dismissRiskAlert
   * @memberof SystemAPI
   * @param {number} id - 告警 ID
   * @param {Object} data - 忽略数据
   * @param {string} data.reason - 忽略原因
   * @returns {Promise<Object>} 操作结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {string} returns.message - 操作消息
   * @throws {Error} ALERT_NOT_FOUND - 告警不存在
   *
   * @example <caption>忽略误报告警</caption>
   * const response = await SystemAPI.dismissRiskAlert(1, {
   *   reason: '经核实为正常操作，系统误报'
   * })
   */
  async dismissRiskAlert(id, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.RISK_ALERTS_DISMISS, { id })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 获取风控告警统计
   *
   * @description 获取风控告警的统计概览数据
   * @async
   * @function getRiskAlertStats
   * @memberof SystemAPI
   * @returns {Promise<Object>} 统计数据响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 统计数据
   * @returns {number} returns.data.total - 总告警数
   * @returns {number} returns.data.pending - 待处理数
   * @returns {number} returns.data.processed - 已处理数
   * @returns {Object} returns.data.by_level - 按级别分组统计
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取告警统计</caption>
   * const response = await SystemAPI.getRiskAlertStats()
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     total: 50, pending: 8, processed: 35, dismissed: 7,
   * //     by_level: { critical: 2, high: 10, medium: 25, low: 13 }
   * //   }
   * // }
   */
  async getRiskAlertStats() {
    return await request({ url: SYSTEM_ENDPOINTS.RISK_ALERTS_STATS, method: 'GET' })
  },

  // ===== 审计日志 =====

  /**
   * 获取审计日志列表
   *
   * @description 获取系统操作审计日志，支持多条件过滤
   * @async
   * @function getAuditLogs
   * @memberof SystemAPI
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 操作者ID
   * @param {string} [params.action] - 操作类型
   * @param {string} [params.resource_type] - 资源类型
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.limit=20] - 每页数量
   * @param {number} [params.offset=0] - 偏移量
   * @returns {Promise<Object>} 日志列表响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 日志数据
   * @returns {Array<Object>} returns.data.logs - 日志列表
   * @returns {number} returns.data.total - 总数量
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>查询用户操作日志</caption>
   * const response = await SystemAPI.getAuditLogs({
   *   user_id: 1,
   *   action: 'update',
   *   limit: 50
   * })
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     logs: [
   * //       { log_id: 1, user_id: 1, action: 'update', resource_type: 'user', ... }
   * //     ],
   * //     total: 120
   * //   }
   * // }
   */
  async getAuditLogs(params = {}) {
    const url = SYSTEM_ENDPOINTS.AUDIT_LOGS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取审计日志统计
   *
   * @description 获取审计日志的统计概览数据
   * @async
   * @function getAuditLogStats
   * @memberof SystemAPI
   * @returns {Promise<Object>} 统计数据响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 统计数据
   * @returns {number} returns.data.total - 总日志数
   * @returns {Object} returns.data.by_action - 按操作类型分组
   * @returns {Object} returns.data.by_user - 按用户分组（前10）
   * @returns {Array<Object>} returns.data.recent_activity - 最近活动趋势
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取审计统计</caption>
   * const response = await SystemAPI.getAuditLogStats()
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     total: 5000,
   * //     by_action: { create: 1200, update: 2500, delete: 300, ... },
   * //     by_user: [{ user_id: 1, count: 500 }, ...],
   * //     recent_activity: [{ date: '2026-01-23', count: 150 }, ...]
   * //   }
   * // }
   */
  async getAuditLogStats() {
    return await request({ url: SYSTEM_ENDPOINTS.AUDIT_LOGS_STATISTICS, method: 'GET' })
  },

  /**
   * 获取审计日志详情
   *
   * @description 获取指定审计日志的完整详情
   * @async
   * @function getAuditLogDetail
   * @memberof SystemAPI
   * @param {number} id - 日志 ID
   * @returns {Promise<Object>} 日志详情响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 日志详情
   * @returns {number} returns.data.log_id - 日志ID
   * @returns {number} returns.data.user_id - 操作者ID
   * @returns {string} returns.data.action - 操作类型
   * @returns {Object} returns.data.changes - 变更详情
   * @returns {Object} returns.data.request_info - 请求信息
   * @throws {Error} LOG_NOT_FOUND - 日志不存在
   *
   * @example <caption>获取日志详情</caption>
   * const response = await SystemAPI.getAuditLogDetail(1)
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     log_id: 1,
   * //     user_id: 1,
   * //     action: 'update',
   * //     resource_type: 'user',
   * //     changes: { before: {...}, after: {...} },
   * //     request_info: { ip: '192.168.1.1', user_agent: '...' }
   * //   }
   * // }
   */
  async getAuditLogDetail(id) {
    const url = buildURL(SYSTEM_ENDPOINTS.AUDIT_LOGS_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  // ===== 会话管理 =====

  /**
   * 获取会话列表
   *
   * @description 获取系统当前活跃会话列表，支持用户过滤
   * @async
   * @function getSessions
   * @memberof SystemAPI
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 用户ID过滤
   * @param {boolean} [params.active_only=true] - 仅活跃会话
   * @param {number} [params.limit=20] - 每页数量
   * @param {number} [params.offset=0] - 偏移量
   * @returns {Promise<Object>} 会话列表响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 会话数据
   * @returns {Array<Object>} returns.data.sessions - 会话列表
   * @returns {string} returns.data.sessions[].session_id - 会话ID
   * @returns {number} returns.data.sessions[].user_id - 用户ID
   * @returns {string} returns.data.sessions[].ip_address - IP地址
   * @returns {string} returns.data.sessions[].last_activity - 最后活跃时间
   * @returns {number} returns.data.total - 总数量
   * @throws {Error} 获取失败时抛出错误
   *
   * @example <caption>获取活跃会话</caption>
   * const response = await SystemAPI.getSessions({ active_only: true })
   * // 响应数据结构:
   * // {
   * //   success: true,
   * //   data: {
   * //     sessions: [
   * //       { session_id: 'abc123', user_id: 1, ip_address: '192.168.1.1', ... }
   * //     ],
   * //     total: 25
   * //   }
   * // }
   */
  async getSessions(params = {}) {
    const url = SYSTEM_ENDPOINTS.SESSIONS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 终止指定会话
   *
   * @description 强制终止指定的用户会话
   * @async
   * @function terminateSession
   * @memberof SystemAPI
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object>} 操作结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {string} returns.message - 操作消息
   * @throws {Error} SESSION_NOT_FOUND - 会话不存在
   *
   * @example <caption>终止指定会话</caption>
   * const response = await SystemAPI.terminateSession('abc123')
   * // { success: true, message: '会话已终止' }
   */
  async terminateSession(sessionId) {
    const url = buildURL(SYSTEM_ENDPOINTS.SESSIONS_TERMINATE, { session_id: sessionId })
    return await request({ url, method: 'POST' })
  },

  /**
   * 终止所有会话
   *
   * @description 强制终止系统中所有活跃会话（危险操作）
   * @async
   * @function terminateAllSessions
   * @memberof SystemAPI
   * @returns {Promise<Object>} 操作结果响应
   * @returns {boolean} returns.success - 是否成功
   * @returns {Object} returns.data - 操作结果
   * @returns {number} returns.data.terminated_count - 终止的会话数量
   * @returns {string} returns.message - 操作消息
   * @throws {Error} TERMINATE_FAILED - 终止操作失败
   *
   * @example <caption>终止所有会话</caption>
   * const response = await SystemAPI.terminateAllSessions()
   * // { success: true, data: { terminated_count: 25 }, message: '所有会话已终止' }
   */
  async terminateAllSessions() {
    return await request({ url: SYSTEM_ENDPOINTS.SESSIONS_TERMINATE_ALL, method: 'POST' })
  },

  // ===== 字典管理 - 类目 =====

  /**
   * 获取类目字典列表
   * @param {Object} [params={}] - 查询参数
   * @param {boolean} [params.is_enabled] - 是否启用
   * @param {string} [params.keyword] - 关键词搜索
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 类目列表响应
   */
  async getCategoryList(params = {}) {
    const url = SYSTEM_ENDPOINTS.DICT_CATEGORY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取类目详情
   * @param {string} code - 类目代码
   * @returns {Promise<Object>} 类目详情响应
   */
  async getCategoryDetail(code) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_CATEGORY_DETAIL, { code })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建类目
   * @param {Object} data - 类目数据
   * @param {string} data.category_code - 类目代码
   * @param {string} data.display_name - 显示名称
   * @param {string} [data.description] - 描述
   * @param {string} [data.icon_url] - 图标URL
   * @param {number} [data.sort_order=0] - 排序顺序
   * @param {boolean} [data.is_enabled=true] - 是否启用
   * @returns {Promise<Object>} 创建结果响应
   */
  async createCategory(data) {
    return await request({ url: SYSTEM_ENDPOINTS.DICT_CATEGORY_CREATE, method: 'POST', data })
  },

  /**
   * 更新类目
   * @param {string} code - 类目代码
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateCategory(code, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_CATEGORY_UPDATE, { code })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除类目
   * @param {string} code - 类目代码
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteCategory(code) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_CATEGORY_DELETE, { code })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 字典管理 - 稀有度 =====

  /**
   * 获取稀有度字典列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 稀有度列表响应
   */
  async getRarityList(params = {}) {
    const url = SYSTEM_ENDPOINTS.DICT_RARITY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取稀有度详情
   * @param {string} code - 稀有度代码
   * @returns {Promise<Object>} 稀有度详情响应
   */
  async getRarityDetail(code) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_RARITY_DETAIL, { code })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建稀有度
   * @param {Object} data - 稀有度数据
   * @returns {Promise<Object>} 创建结果响应
   */
  async createRarity(data) {
    return await request({ url: SYSTEM_ENDPOINTS.DICT_RARITY_CREATE, method: 'POST', data })
  },

  /**
   * 更新稀有度
   * @param {string} code - 稀有度代码
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateRarity(code, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_RARITY_UPDATE, { code })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除稀有度
   * @param {string} code - 稀有度代码
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteRarity(code) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_RARITY_DELETE, { code })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 字典管理 - 资产分组 =====

  /**
   * 获取资产分组列表
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 资产分组列表响应
   */
  async getAssetGroupList(params = {}) {
    const url = SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取资产分组详情
   * @param {string} code - 资产分组代码
   * @returns {Promise<Object>} 资产分组详情响应
   */
  async getAssetGroupDetail(code) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_DETAIL, { code })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建资产分组
   * @param {Object} data - 资产分组数据
   * @returns {Promise<Object>} 创建结果响应
   */
  async createAssetGroup(data) {
    return await request({ url: SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_CREATE, method: 'POST', data })
  },

  /**
   * 更新资产分组
   * @param {string} code - 资产分组代码
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateAssetGroup(code, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_UPDATE, { code })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除资产分组
   * @param {string} code - 资产分组代码
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteAssetGroup(code) {
    const url = buildURL(SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_DELETE, { code })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取所有字典数据
   * @returns {Promise<Object>} 所有字典数据响应
   */
  async getAllDictionaries() {
    return await request({ url: SYSTEM_ENDPOINTS.DICT_ALL, method: 'GET' })
  },

  // ===== 功能开关管理 =====

  /**
   * 获取功能开关列表
   * @param {Object} [params={}] - 查询参数
   * @param {boolean} [params.is_enabled] - 是否启用
   * @param {string} [params.rollout_strategy] - 发布策略
   * @returns {Promise<Object>} 功能开关列表响应
   */
  async getFeatureFlags(params = {}) {
    const url = SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取功能开关详情
   * @param {string} flagKey - 功能键名
   * @returns {Promise<Object>} 功能开关详情响应
   */
  async getFeatureFlagDetail(flagKey) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_DETAIL, { flagKey })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建功能开关
   * @param {Object} data - 功能开关数据
   * @param {string} data.flag_key - 功能键名
   * @param {string} data.name - 功能名称
   * @param {string} [data.description] - 描述
   * @param {boolean} [data.is_enabled=false] - 是否启用
   * @param {string} [data.rollout_strategy='all'] - 发布策略
   * @returns {Promise<Object>} 创建结果响应
   */
  async createFeatureFlag(data) {
    return await request({ url: SYSTEM_ENDPOINTS.FEATURE_FLAG_CREATE, method: 'POST', data })
  },

  /**
   * 更新功能开关
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateFeatureFlag(flagKey, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_UPDATE, { flagKey })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除功能开关
   * @param {string} flagKey - 功能键名
   * @returns {Promise<Object>} 删除结果响应
   */
  async deleteFeatureFlag(flagKey) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_DELETE, { flagKey })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 切换功能开关状态
   * @param {string} flagKey - 功能键名
   * @returns {Promise<Object>} 切换结果响应
   */
  async toggleFeatureFlag(flagKey) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_TOGGLE, { flagKey })
    return await request({ url, method: 'PATCH' })
  },

  /**
   * 添加功能开关白名单用户
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 白名单数据
   * @param {number} data.user_id - 用户ID
   * @returns {Promise<Object>} 添加结果响应
   */
  async addFeatureFlagWhitelist(flagKey, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_WHITELIST_ADD, { flagKey })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 移除功能开关白名单用户
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 白名单数据
   * @param {number} data.user_id - 用户ID
   * @returns {Promise<Object>} 移除结果响应
   */
  async removeFeatureFlagWhitelist(flagKey, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_WHITELIST_REMOVE, { flagKey })
    return await request({ url, method: 'DELETE', data })
  },

  /**
   * 添加功能开关黑名单用户
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 黑名单数据
   * @param {number} data.user_id - 用户ID
   * @returns {Promise<Object>} 添加结果响应
   */
  async addFeatureFlagBlacklist(flagKey, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_BLACKLIST_ADD, { flagKey })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 移除功能开关黑名单用户
   * @param {string} flagKey - 功能键名
   * @param {Object} data - 黑名单数据
   * @param {number} data.user_id - 用户ID
   * @returns {Promise<Object>} 移除结果响应
   */
  async removeFeatureFlagBlacklist(flagKey, data) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_BLACKLIST_REMOVE, { flagKey })
    return await request({ url, method: 'DELETE', data })
  },

  /**
   * 检查用户的功能开关状态
   * @param {string} flagKey - 功能键名
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 检查结果响应
   */
  async checkFeatureFlagForUser(flagKey, userId) {
    const url = buildURL(SYSTEM_ENDPOINTS.FEATURE_FLAG_CHECK, { flagKey, userId })
    return await request({ url, method: 'GET' })
  },

  // ===== 系统配置（全局） =====

  /**
   * 获取系统配置列表（所有设置概览）
   * @returns {Promise<Object>} 配置列表响应
   */
  async getSystemConfigList() {
    return await request({ url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_LIST, method: 'GET' })
  },

  /**
   * 获取系统配置
   * @returns {Promise<Object>} 系统配置响应
   */
  async getSystemConfig() {
    return await request({ url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_GET, method: 'GET' })
  },

  /**
   * 更新系统配置
   * @param {Object} data - 配置数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateSystemConfig(data) {
    return await request({ url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_UPDATE, method: 'PUT', data })
  },

  /**
   * 获取维护模式配置
   * @returns {Promise<Object>} 维护模式配置响应
   */
  async getMaintenanceConfig() {
    return await request({ url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_MAINTENANCE, method: 'GET' })
  },

  /**
   * 更新维护模式配置
   * @param {Object} data - 维护模式配置数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updateMaintenanceConfig(data) {
    return await request({ url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_MAINTENANCE, method: 'PUT', data })
  },

  /**
   * 获取定价配置
   * @returns {Promise<Object>} 定价配置响应
   */
  async getPricingConfig() {
    return await request({ url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_PRICING, method: 'GET' })
  },

  /**
   * 更新定价配置
   * @param {Object} data - 定价配置数据
   * @returns {Promise<Object>} 更新结果响应
   */
  async updatePricingConfig(data) {
    return await request({ url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_UPDATE_PRICING, method: 'PUT', data })
  }
}

export default SystemAPI
