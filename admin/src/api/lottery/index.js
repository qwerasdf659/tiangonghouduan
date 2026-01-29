/**
 * 抽奖 API 模块统一导出入口
 *
 * @module api/lottery
 * @description 聚合导出抽奖相关的所有 API 模块
 * @version 2.0.0
 * @date 2026-01-30
 *
 * @example
 * // 导入全部
 * import { LotteryAPI, LOTTERY_ENDPOINTS } from './api/lottery'
 *
 * // 按需导入
 * import { LotteryCoreAPI } from './api/lottery/core.js'
 * import { LotteryAdvancedAPI } from './api/lottery/advanced.js'
 */

// 导入子模块
import { LotteryCoreAPI, LOTTERY_CORE_ENDPOINTS } from './core.js'
import { LotteryAdvancedAPI, LOTTERY_ADVANCED_ENDPOINTS } from './advanced.js'

// 合并端点常量（保持向后兼容）
export const LOTTERY_ENDPOINTS = {
  ...LOTTERY_CORE_ENDPOINTS,
  ...LOTTERY_ADVANCED_ENDPOINTS
}

// 合并 API 对象（保持向后兼容）
export const LotteryAPI = {
  ...LotteryCoreAPI,
  ...LotteryAdvancedAPI
}

// 分模块导出
export { LotteryCoreAPI, LOTTERY_CORE_ENDPOINTS }
export { LotteryAdvancedAPI, LOTTERY_ADVANCED_ENDPOINTS }

export default LotteryAPI

