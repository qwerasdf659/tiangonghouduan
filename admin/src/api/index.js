/**
 * API 模块统一入口（分散式架构 - ES Module 版本）
 *
 * @description 统一导出所有 API 模块，支持按需引入
 * @version 4.0.0 - 移除 @deprecated 兼容代码
 * @date 2026-01-24
 *
 * @example
 * // 推荐：按需引入特定模块
 * import { UserAPI } from '@/api/user.js'
 * import { LotteryAPI } from '@/api/lottery.js'
 *
 * // 或者：从统一入口引入
 * import { UserAPI, LotteryAPI, USER_ENDPOINTS } from '@/api/index.js'
 */

// ========== 类型定义模块 ==========
import './types.js'

// ========== 基础模块 ==========
import {
  request,
  http,
  buildURL,
  buildQueryString,
  getToken,
  setToken,
  clearToken
} from './base.js'

// ========== 业务模块导入 ==========
import { AuthAPI, AUTH_ENDPOINTS } from './auth.js'
import { UserAPI, USER_ENDPOINTS } from './user.js'
import { LotteryAPI, LOTTERY_ENDPOINTS } from './lottery.js'
import { AssetAPI, ASSET_ENDPOINTS } from './asset.js'
import { MarketAPI, MARKET_ENDPOINTS } from './market.js'
import { StoreAPI, STORE_ENDPOINTS } from './store.js'
import { SystemAPI, SYSTEM_ENDPOINTS } from './system.js'
import { AnalyticsAPI, ANALYTICS_ENDPOINTS } from './analytics.js'
import { ContentAPI, CONTENT_ENDPOINTS } from './content.js'

// ========== 导出基础模块 ==========
export {
  request,
  http,
  buildURL,
  buildQueryString,
  getToken,
  setToken,
  clearToken
}

// ========== 导出业务模块 ==========
export { AuthAPI, AUTH_ENDPOINTS }
export { UserAPI, USER_ENDPOINTS }
export { LotteryAPI, LOTTERY_ENDPOINTS }
export { AssetAPI, ASSET_ENDPOINTS }
export { MarketAPI, MARKET_ENDPOINTS }
export { StoreAPI, STORE_ENDPOINTS }
export { SystemAPI, SYSTEM_ENDPOINTS }
export { AnalyticsAPI, ANALYTICS_ENDPOINTS }
export { ContentAPI, CONTENT_ENDPOINTS }

// ========== 默认导出 ==========
export default {
  // 基础工具
  request,
  http,
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
  ContentAPI
}
