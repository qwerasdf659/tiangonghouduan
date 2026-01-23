/**
 * API 模块统一入口（分散式架构 - ES Module 版本）
 *
 * @description 统一导出所有 API 模块，支持按需引入和向后兼容
 * @version 3.0.0 - 从集中式架构迁移到分散式模块化架构
 * @date 2026-01-23
 *
 * @example
 * // 推荐：按需引入特定模块
 * import { UserAPI } from '@/api/user.js'
 * import { LotteryAPI } from '@/api/lottery.js'
 *
 * // 或者：从统一入口引入
 * import { UserAPI, LotteryAPI } from '@/api/index.js'
 *
 * // 向后兼容：仍支持 API_ENDPOINTS 和 API 类
 * import { API_ENDPOINTS, API } from '@/api/index.js'
 */

// ========== 类型定义模块 ==========
/**
 * @see {@link ./types.js} 通用类型定义
 */
import './types.js'

// ========== 基础模块 ==========
export {
  request,
  http,
  buildURL,
  buildQueryString,
  getToken,
  setToken,
  clearToken
} from './base.js'

// ========== 业务模块导出 ==========
export { AuthAPI, AUTH_ENDPOINTS } from './auth.js'
export { UserAPI, USER_ENDPOINTS } from './user.js'
export { LotteryAPI, LOTTERY_ENDPOINTS } from './lottery.js'
export { AssetAPI, ASSET_ENDPOINTS } from './asset.js'
export { MarketAPI, MARKET_ENDPOINTS } from './market.js'
export { StoreAPI, STORE_ENDPOINTS } from './store.js'
export { SystemAPI, SYSTEM_ENDPOINTS } from './system.js'
export { AnalyticsAPI, ANALYTICS_ENDPOINTS } from './analytics.js'
export { ContentAPI, CONTENT_ENDPOINTS } from './content.js'

// ========== 向后兼容：统一 API_ENDPOINTS ==========
import { AUTH_ENDPOINTS } from './auth.js'
import { USER_ENDPOINTS } from './user.js'
import { LOTTERY_ENDPOINTS } from './lottery.js'
import { ASSET_ENDPOINTS } from './asset.js'
import { MARKET_ENDPOINTS } from './market.js'
import { STORE_ENDPOINTS } from './store.js'
import { SYSTEM_ENDPOINTS } from './system.js'
import { ANALYTICS_ENDPOINTS } from './analytics.js'
import { CONTENT_ENDPOINTS } from './content.js'

/**
 * 向后兼容的 API_ENDPOINTS 聚合对象
 * @deprecated 建议使用各模块的独立 ENDPOINTS 常量
 */
export const API_ENDPOINTS = {
  // 认证相关
  AUTH: AUTH_ENDPOINTS,

  // 用户管理
  USER: USER_ENDPOINTS,
  ROLE: { LIST: USER_ENDPOINTS.ROLES },
  PERMISSION: {
    CHECK: USER_ENDPOINTS.PERMISSION_CHECK,
    USER_PERMISSIONS: USER_ENDPOINTS.USER_PERMISSIONS,
    MY_PERMISSIONS: USER_ENDPOINTS.MY_PERMISSIONS,
    PROMOTE: USER_ENDPOINTS.PROMOTE,
    CREATE_ADMIN: USER_ENDPOINTS.CREATE_ADMIN
  },
  USER_HIERARCHY: {
    LIST: USER_ENDPOINTS.HIERARCHY_LIST,
    ROLES: USER_ENDPOINTS.HIERARCHY_ROLES,
    DETAIL: USER_ENDPOINTS.HIERARCHY_DETAIL,
    CREATE: USER_ENDPOINTS.HIERARCHY_CREATE,
    SUBORDINATES: USER_ENDPOINTS.HIERARCHY_SUBORDINATES,
    UPDATE_STATUS: USER_ENDPOINTS.HIERARCHY_UPDATE_STATUS,
    DEACTIVATE: USER_ENDPOINTS.HIERARCHY_DEACTIVATE,
    ACTIVATE: USER_ENDPOINTS.HIERARCHY_ACTIVATE
  },
  USER_PREMIUM: {
    LIST: USER_ENDPOINTS.PREMIUM_LIST,
    DETAIL: USER_ENDPOINTS.PREMIUM_DETAIL,
    UPDATE: USER_ENDPOINTS.PREMIUM_UPDATE,
    UNLOCK: USER_ENDPOINTS.PREMIUM_UNLOCK
  },
  // 会话管理
  SESSIONS: {
    LIST: USER_ENDPOINTS.SESSIONS_LIST,
    STATS: USER_ENDPOINTS.SESSIONS_STATS,
    DETAIL: USER_ENDPOINTS.SESSIONS_DETAIL,
    DEACTIVATE: USER_ENDPOINTS.SESSIONS_DEACTIVATE,
    CLEANUP: USER_ENDPOINTS.SESSIONS_CLEANUP,
    ONLINE_USERS: USER_ENDPOINTS.SESSIONS_ONLINE_USERS
  },

  // 抽奖管理
  LOTTERY: LOTTERY_ENDPOINTS,
  PRESET: {
    LIST: LOTTERY_ENDPOINTS.PRESET_LIST,
    CREATE: LOTTERY_ENDPOINTS.PRESET_CREATE,
    USER_LIST: LOTTERY_ENDPOINTS.PRESET_USER_LIST,
    DELETE: LOTTERY_ENDPOINTS.PRESET_DELETE,
    STATS: LOTTERY_ENDPOINTS.PRESET_STATS
  },
  PRIZE: {
    LIST: LOTTERY_ENDPOINTS.PRIZE_LIST,
    BATCH_ADD: LOTTERY_ENDPOINTS.PRIZE_BATCH_ADD,
    UPDATE: LOTTERY_ENDPOINTS.PRIZE_UPDATE,
    DELETE: LOTTERY_ENDPOINTS.PRIZE_DELETE,
    DETAIL: LOTTERY_ENDPOINTS.PRIZE_DETAIL,
    ADD_STOCK: LOTTERY_ENDPOINTS.PRIZE_ADD_STOCK
  },
  CAMPAIGN: {
    LIST: LOTTERY_ENDPOINTS.CAMPAIGN_LIST,
    DETAIL: LOTTERY_ENDPOINTS.CAMPAIGN_DETAIL,
    BUDGET: LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET
  },
  STRATEGY: {
    LIST: LOTTERY_ENDPOINTS.STRATEGY_LIST,
    DETAIL: LOTTERY_ENDPOINTS.STRATEGY_DETAIL,
    CREATE: LOTTERY_ENDPOINTS.STRATEGY_CREATE,
    UPDATE: LOTTERY_ENDPOINTS.STRATEGY_UPDATE,
    DELETE: LOTTERY_ENDPOINTS.STRATEGY_DELETE
  },
  PROBABILITY: {
    ADJUST: LOTTERY_ENDPOINTS.PROBABILITY_ADJUST
  },
  LOTTERY_INTERVENTION: {
    LIST: LOTTERY_ENDPOINTS.INTERVENTION_LIST,
    DETAIL: LOTTERY_ENDPOINTS.INTERVENTION_DETAIL,
    CANCEL: LOTTERY_ENDPOINTS.INTERVENTION_CANCEL,
    FORCE_WIN: LOTTERY_ENDPOINTS.INTERVENTION_FORCE_WIN
  },
  LOTTERY_CAMPAIGNS: {
    LIST: LOTTERY_ENDPOINTS.CAMPAIGNS_LIST,
    DETAIL: LOTTERY_ENDPOINTS.CAMPAIGNS_DETAIL,
    CONDITIONS: LOTTERY_ENDPOINTS.CAMPAIGNS_CONDITIONS,
    CONFIGURE_CONDITIONS: LOTTERY_ENDPOINTS.CAMPAIGNS_CONFIGURE_CONDITIONS
  },

  // 资产管理
  ASSETS: ASSET_ENDPOINTS,
  ASSET_ADJUSTMENT: {
    ASSET_TYPES: ASSET_ENDPOINTS.ADJUSTMENT_ASSET_TYPES,
    USER_BALANCES: ASSET_ENDPOINTS.ADJUSTMENT_USER_BALANCES,
    ADJUST: ASSET_ENDPOINTS.ADJUSTMENT_ADJUST
  },
  MATERIAL: {
    ASSET_TYPES: ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES,
    ASSET_TYPE_DETAIL: ASSET_ENDPOINTS.MATERIAL_ASSET_TYPE_DETAIL,
    CONVERSION_RULES: ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULES,
    CONVERSION_RULE_DETAIL: ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULE_DETAIL,
    USER_BALANCE: ASSET_ENDPOINTS.MATERIAL_USER_BALANCE,
    USER_ADJUST: ASSET_ENDPOINTS.MATERIAL_USER_ADJUST,
    USERS: ASSET_ENDPOINTS.MATERIAL_USERS,
    TRANSACTIONS: ASSET_ENDPOINTS.MATERIAL_TRANSACTIONS
  },
  DIAMOND_ACCOUNTS: {
    LIST: ASSET_ENDPOINTS.DIAMOND_LIST,
    DETAIL: ASSET_ENDPOINTS.DIAMOND_DETAIL,
    ADJUST: ASSET_ENDPOINTS.DIAMOND_ADJUST,
    USER_BALANCE: ASSET_ENDPOINTS.DIAMOND_USER_BALANCE,
    USER_ADJUST: ASSET_ENDPOINTS.DIAMOND_USER_ADJUST,
    USERS: ASSET_ENDPOINTS.DIAMOND_USERS,
    ACCOUNTS: ASSET_ENDPOINTS.DIAMOND_ACCOUNTS
  },
  ITEM_TEMPLATES: {
    LIST: ASSET_ENDPOINTS.ITEM_TEMPLATES_LIST,
    DETAIL: ASSET_ENDPOINTS.ITEM_TEMPLATES_DETAIL,
    CREATE: ASSET_ENDPOINTS.ITEM_TEMPLATES_CREATE,
    UPDATE: ASSET_ENDPOINTS.ITEM_TEMPLATES_UPDATE,
    DELETE: ASSET_ENDPOINTS.ITEM_TEMPLATES_DELETE,
    STATS: ASSET_ENDPOINTS.ITEM_TEMPLATES_STATS
  },
  ITEM_INSTANCES: {
    LIST: ASSET_ENDPOINTS.ITEM_INSTANCES_LIST,
    DETAIL: ASSET_ENDPOINTS.ITEM_INSTANCES_DETAIL,
    USER: ASSET_ENDPOINTS.ITEM_INSTANCES_USER,
    TRANSFER: ASSET_ENDPOINTS.ITEM_INSTANCES_TRANSFER,
    FREEZE: ASSET_ENDPOINTS.ITEM_INSTANCES_FREEZE,
    UNFREEZE: ASSET_ENDPOINTS.ITEM_INSTANCES_UNFREEZE
  },

  // 市场交易
  MARKETPLACE: MARKET_ENDPOINTS,
  ORPHAN_FROZEN: {
    DETECT: MARKET_ENDPOINTS.ORPHAN_DETECT,
    STATS: MARKET_ENDPOINTS.ORPHAN_STATS,
    CLEANUP: MARKET_ENDPOINTS.ORPHAN_CLEANUP
  },
  TRADE_ORDERS: {
    LIST: MARKET_ENDPOINTS.TRADE_ORDERS,
    DETAIL: MARKET_ENDPOINTS.TRADE_ORDER_DETAIL
  },
  MARKETPLACE_STATS: {
    LISTING_STATS: MARKET_ENDPOINTS.LISTINGS_STATS
  },

  // 门店管理
  STORE: STORE_ENDPOINTS,
  MERCHANT_POINTS: {
    LIST: STORE_ENDPOINTS.MERCHANT_POINTS_LIST,
    DETAIL: STORE_ENDPOINTS.MERCHANT_POINTS_DETAIL,
    BATCH: STORE_ENDPOINTS.MERCHANT_POINTS_BATCH,
    APPROVE: STORE_ENDPOINTS.MERCHANT_POINTS_APPROVE,
    REJECT: STORE_ENDPOINTS.MERCHANT_POINTS_REJECT,
    STATS_PENDING: STORE_ENDPOINTS.MERCHANT_POINTS_STATS
  },
  CONSUMPTION: {
    ADMIN_RECORDS: STORE_ENDPOINTS.CONSUMPTION_RECORDS,
    PENDING: STORE_ENDPOINTS.CONSUMPTION_PENDING,
    APPROVE: STORE_ENDPOINTS.CONSUMPTION_APPROVE,
    REJECT: STORE_ENDPOINTS.CONSUMPTION_REJECT
  },

  // 系统管理
  SYSTEM: SYSTEM_ENDPOINTS,
  SETTINGS: {
    LIST: SYSTEM_ENDPOINTS.SETTINGS_LIST,
    CATEGORY: SYSTEM_ENDPOINTS.SETTINGS_CATEGORY,
    UPDATE: SYSTEM_ENDPOINTS.SETTINGS_UPDATE,
    SECURITY: SYSTEM_ENDPOINTS.SETTINGS_SECURITY,
    BASIC: SYSTEM_ENDPOINTS.SETTINGS_BASIC,
    POINTS: SYSTEM_ENDPOINTS.SETTINGS_POINTS,
    NOTIFICATION: SYSTEM_ENDPOINTS.SETTINGS_NOTIFICATION,
    MARKETPLACE: SYSTEM_ENDPOINTS.SETTINGS_MARKETPLACE
  },
  SETTINGS_EXT: {
    GLOBAL: SYSTEM_ENDPOINTS.SETTINGS_GLOBAL,
    LOTTERY: SYSTEM_ENDPOINTS.SETTINGS_LOTTERY,
    SYSTEM: SYSTEM_ENDPOINTS.SETTINGS_SYSTEM,
    PRIZE: SYSTEM_ENDPOINTS.SETTINGS_PRIZE
  },
  ANNOUNCEMENT: {
    LIST: SYSTEM_ENDPOINTS.ANNOUNCEMENT_LIST,
    DETAIL: SYSTEM_ENDPOINTS.ANNOUNCEMENT_DETAIL,
    CREATE: SYSTEM_ENDPOINTS.ANNOUNCEMENT_CREATE,
    UPDATE: SYSTEM_ENDPOINTS.ANNOUNCEMENT_UPDATE,
    DELETE: SYSTEM_ENDPOINTS.ANNOUNCEMENT_DELETE
  },
  NOTIFICATION: {
    LIST: SYSTEM_ENDPOINTS.NOTIFICATION_LIST,
    READ: SYSTEM_ENDPOINTS.NOTIFICATION_READ,
    READ_ALL: SYSTEM_ENDPOINTS.NOTIFICATION_READ_ALL,
    CLEAR: SYSTEM_ENDPOINTS.NOTIFICATION_CLEAR,
    SEND: SYSTEM_ENDPOINTS.NOTIFICATION_SEND,
    ANNOUNCEMENTS: SYSTEM_ENDPOINTS.NOTIFICATION_ANNOUNCEMENTS
  },
  POPUP_BANNER: {
    LIST: SYSTEM_ENDPOINTS.POPUP_BANNER_LIST,
    STATS: SYSTEM_ENDPOINTS.POPUP_BANNER_STATS,
    DETAIL: SYSTEM_ENDPOINTS.POPUP_BANNER_DETAIL,
    CREATE: SYSTEM_ENDPOINTS.POPUP_BANNER_CREATE,
    UPDATE: SYSTEM_ENDPOINTS.POPUP_BANNER_UPDATE,
    DELETE: SYSTEM_ENDPOINTS.POPUP_BANNER_DELETE,
    TOGGLE: SYSTEM_ENDPOINTS.POPUP_BANNER_TOGGLE
  },
  IMAGE: {
    LIST: SYSTEM_ENDPOINTS.IMAGE_LIST,
    UPLOAD: SYSTEM_ENDPOINTS.IMAGE_UPLOAD,
    DELETE: SYSTEM_ENDPOINTS.IMAGE_DELETE
  },
  CACHE: {
    CLEAR: SYSTEM_ENDPOINTS.CACHE_CLEAR
  },
  AUDIT_LOGS: {
    LIST: SYSTEM_ENDPOINTS.AUDIT_LOGS_LIST,
    STATISTICS: SYSTEM_ENDPOINTS.AUDIT_LOGS_STATISTICS,
    DETAIL: SYSTEM_ENDPOINTS.AUDIT_LOGS_DETAIL
  },

  // 数据分析
  ANALYTICS: ANALYTICS_ENDPOINTS,
  CAMPAIGN_BUDGET: {
    BATCH_STATUS: ANALYTICS_ENDPOINTS.CAMPAIGN_BUDGET_BATCH_STATUS,
    CAMPAIGN: ANALYTICS_ENDPOINTS.CAMPAIGN_BUDGET_DETAIL
  },
  // 统计图表数据（charts.js 使用）
  STATS: {
    USER_GROWTH: ANALYTICS_ENDPOINTS.CHARTS_USER_GROWTH,
    ACTIVE_USERS: ANALYTICS_ENDPOINTS.TODAY_STATS, // 活跃用户使用今日统计接口
    LOTTERY: ANALYTICS_ENDPOINTS.CHARTS_LOTTERY,
    REVENUE: ANALYTICS_ENDPOINTS.CHARTS_REVENUE
  },

  // 内容管理
  CUSTOMER_SERVICE: CONTENT_ENDPOINTS,
  FEEDBACK: {
    LIST: CONTENT_ENDPOINTS.FEEDBACK_LIST,
    DETAIL: CONTENT_ENDPOINTS.FEEDBACK_DETAIL,
    REPLY: CONTENT_ENDPOINTS.FEEDBACK_REPLY,
    STATUS: CONTENT_ENDPOINTS.FEEDBACK_STATUS
  },
  ACTIVITIES: {
    LIST: CONTENT_ENDPOINTS.ACTIVITIES_LIST,
    DETAIL: CONTENT_ENDPOINTS.ACTIVITIES_DETAIL
  },

  // 控制台认证
  CONSOLE_AUTH: {
    LOGIN: AUTH_ENDPOINTS.CONSOLE_LOGIN,
    LOGOUT: AUTH_ENDPOINTS.CONSOLE_LOGOUT
  },

  // 系统数据
  SYSTEM_DATA: {
    USER_ROLES: USER_ENDPOINTS.HIERARCHY_ROLES
  }
}

// ========== 向后兼容：API 类 ==========
import { request, buildURL, buildQueryString } from './base.js'
import { AuthAPI } from './auth.js'
import { UserAPI } from './user.js'
import { LotteryAPI } from './lottery.js'
import { AssetAPI } from './asset.js'
import { MarketAPI } from './market.js'
import { StoreAPI } from './store.js'
import { SystemAPI } from './system.js'
import { AnalyticsAPI } from './analytics.js'
import { ContentAPI } from './content.js'

/**
 * 向后兼容的 API 类
 * @deprecated 建议直接使用各模块的 API 对象（如 UserAPI, LotteryAPI）
 */
export class API {
  /**
   * 构建 API 完整 URL（处理路径参数）
   */
  static buildURL(endpoint, pathParams = {}) {
    return buildURL(endpoint, pathParams)
  }

  /**
   * 构建查询字符串
   */
  static buildQueryString(queryParams = {}) {
    return buildQueryString(queryParams)
  }

  /**
   * 统一 API 请求方法
   * @async
   * @returns {Promise<Object>}
   */
  static async request(endpoint, options = {}) {
    const { method = 'GET', pathParams = {}, queryParams = {}, body = null, headers = {} } = options

    let url = this.buildURL(endpoint, pathParams)
    url += this.buildQueryString(queryParams)

    return await request({
      url,
      method,
      data: body,
      headers
    })
  }

  // ===== 认证相关 =====

  /**
   * 用户登录
   * @async
   * @returns {Promise<Object>}
   */
  static async login(mobile, verification_code) {
    return await AuthAPI.login(mobile, verification_code)
  }

  /**
   * 用户登出
   * @async
   * @returns {Promise<Object>}
   */
  static async logout() {
    return await AuthAPI.logout()
  }

  /**
   * 验证 Token
   * @async
   * @returns {Promise<Object>}
   */
  static async verifyToken() {
    return await AuthAPI.verifyToken()
  }

  // ===== 预设管理 =====

  /**
   * 获取预设列表
   * @async
   * @returns {Promise<Object>}
   */
  static async getPresetList(params = {}) {
    return await LotteryAPI.getPresetList(params)
  }

  /**
   * 获取用户预设
   * @async
   * @returns {Promise<Object>}
   */
  static async getUserPresets(userId, params = {}) {
    return await LotteryAPI.getUserPresets(userId, params)
  }

  /**
   * 创建预设
   * @async
   * @returns {Promise<Object>}
   */
  static async createPreset(data) {
    return await LotteryAPI.createPreset(data)
  }

  /**
   * 删除用户预设
   * @async
   * @returns {Promise<Object>}
   */
  static async deleteUserPresets(userId) {
    return await LotteryAPI.deleteUserPresets(userId)
  }

  /**
   * 获取预设统计
   * @async
   * @returns {Promise<Object>}
   */
  static async getPresetStats() {
    return await LotteryAPI.getPresetStats()
  }

  // ===== 奖品管理 =====

  /**
   * 获取奖品列表
   * @async
   * @returns {Promise<Object>}
   */
  static async getPrizeList(params = {}) {
    return await LotteryAPI.getPrizeList(params)
  }

  /**
   * 更新奖品
   * @async
   * @returns {Promise<Object>}
   */
  static async updatePrize(prizeId, data) {
    return await LotteryAPI.updatePrize(prizeId, data)
  }

  /**
   * 删除奖品
   * @async
   * @returns {Promise<Object>}
   */
  static async deletePrize(prizeId) {
    return await LotteryAPI.deletePrize(prizeId)
  }

  // ===== 用户管理 =====

  /**
   * 获取用户列表
   * @async
   * @returns {Promise<Object>}
   */
  static async getUserList(params = {}) {
    return await UserAPI.getList(params)
  }

  /**
   * 获取用户详情
   * @async
   * @returns {Promise<Object>}
   */
  static async getUserDetail(userId) {
    return await UserAPI.getDetail(userId)
  }

  /**
   * 更新用户角色
   * @async
   * @returns {Promise<Object>}
   */
  static async updateUserRole(userId, roleData) {
    return await UserAPI.updateRole(userId, roleData)
  }

  /**
   * 更新用户状态
   * @async
   * @returns {Promise<Object>}
   */
  static async updateUserStatus(userId, statusData) {
    return await UserAPI.updateStatus(userId, statusData)
  }

  /**
   * 删除用户
   * @async
   * @returns {Promise<Object>}
   */
  static async deleteUser(userId) {
    return await UserAPI.delete(userId)
  }

  // ===== 角色管理 =====

  /**
   * 获取角色列表
   * @async
   * @returns {Promise<Object>}
   */
  static async getRoleList() {
    return await UserAPI.getRoles()
  }

  // ===== 系统管理 =====

  /**
   * 获取仪表盘数据
   * @async
   * @returns {Promise<Object>}
   */
  static async getDashboard() {
    return await SystemAPI.getDashboard()
  }

  /**
   * 健康检查
   * @async
   * @returns {Promise<Object>}
   */
  static async healthCheck() {
    return await SystemAPI.healthCheck()
  }
}

// ========== 默认导出 ==========
export default {
  // 基础工具
  request,
  http: { get: request, post: request, put: request, delete: request },
  buildURL,
  buildQueryString,

  // API 模块
  AuthAPI,
  UserAPI,
  LotteryAPI,
  AssetAPI,
  MarketAPI,
  StoreAPI,
  SystemAPI,
  AnalyticsAPI,
  ContentAPI,

  // 向后兼容
  API_ENDPOINTS,
  API
}
