/**
 * 前端主入口文件（ES Module）
 *
 * @description Vite 打包入口，初始化所有核心模块
 * @version 2.1.0
 * @date 2026-01-24
 */

// ========== 样式导入 ==========
import './styles/index.css'

// ========== 工具函数统一导入 ==========
import {
  logger,
  loadECharts,
  isEChartsLoaded,
  preloadECharts,
  formatDate,
  formatAmount,
  formatNumber,
  showToast,
  buildURL,
  buildQueryString
} from './utils/index.js'

// ========== Alpine.js 初始化 ==========
import { initAlpine } from './alpine/index.js'

// ========== API 模块导入 ==========
// 推荐直接从各模块导入：
// import { UserAPI } from './api/user.js'
// import { LotteryAPI } from './api/lottery.js'
import { request } from './api/base.js'

// ========== 全局变量已移除（方案 A：彻底 ES Module） ==========
// 所有 window.xxx 已按技术债务文档决策移除
// 新代码请使用 ES Module 导入：
//   import { API, request } from '@/api/index.js'
//   import { showToast, formatDate } from '@/utils/index.js'
//   import { loadECharts } from '@/utils/echarts-lazy.js'

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  // 初始化 Alpine.js
  initAlpine()

  logger.info('前端应用已初始化')
  logger.debug('技术栈: Vite + Alpine.js + Tailwind CSS')
})
