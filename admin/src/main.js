/**
 * 前端主入口文件（ES Module）
 *
 * @description Vite 打包入口，初始化所有核心模块
 * @version 2.2.0
 * @date 2026-01-25
 */

/* ========== 样式导入 ========== */
import './styles/index.css'

/* ========== 工具函数统一导入 ========== */
import { logger } from './utils/index.js'

/* ========== Alpine.js 初始化 ========== */
import { initAlpine } from './alpine/index.js'

/* ========== API 模块导入 ========== */
import { checkBrowserSession } from './api/base.js'

/* ========== 初始化 ========== */
document.addEventListener('DOMContentLoaded', () => {
  /*
   * 检查浏览器会话：如果是新的浏览器会话（浏览器曾被关闭），清除旧 token
   * 这确保关闭浏览器后需要重新登录，同时多标签页共享登录状态
   */
  checkBrowserSession()

  // 初始化 Alpine.js
  initAlpine()

  logger.info('前端应用已初始化')
  logger.debug('技术栈: Vite + Alpine.js + Tailwind CSS')
})
