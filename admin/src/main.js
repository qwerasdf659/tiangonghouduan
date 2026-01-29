/**
 * 前端主入口文件（ES Module）
 *
 * @description Vite 打包入口，初始化所有核心模块
 * @version 2.3.0
 * @date 2026-01-26
 */

/* ========== 样式导入 ========== */
import './styles/index.css'

/* ========== 工具函数统一导入 ========== */
import { logger } from './utils/index.js'

/* ========== Alpine.js 初始化 ========== */
import { initAlpine } from './alpine/index.js'

/* ========== API 模块导入 ========== */
import { checkBrowserSession } from './api/base.js'

/* ========== 主题同步模块 ========== */
/**
 * 同步主题到当前页面
 * - 从 localStorage 读取保存的主题
 * - 如果是 iframe，尝试从父窗口获取主题
 * - 监听父窗口的主题变更消息
 * @returns {void}
 */
function syncTheme() {
  // 1. 从 localStorage 读取主题
  const savedTheme = window.localStorage.getItem('admin_theme') || 'light'

  // 2. 应用主题到当前文档
  document.documentElement.setAttribute('data-theme', savedTheme)

  // 3. 如果是 iframe，尝试从父窗口同步主题
  if (window.parent !== window) {
    try {
      // 尝试直接获取父窗口的主题
      const parentTheme = window.parent.document.documentElement.getAttribute('data-theme')
      if (parentTheme) {
        document.documentElement.setAttribute('data-theme', parentTheme)
        logger.debug(`[主题同步] 从父窗口同步主题: ${parentTheme}`)
      }
    } catch (e) {
      // 跨域情况下无法直接访问父窗口
      logger.debug('[主题同步] 无法直接访问父窗口，使用 localStorage 主题')
    }
  }

  logger.debug(`[主题同步] 当前主题: ${document.documentElement.getAttribute('data-theme')}`)
}

/**
 * 主题广播频道名称
 * @constant {string}
 */
const THEME_CHANNEL_NAME = 'admin_theme_channel'

/**
 * 监听主题变更
 * - 监听 localStorage 变更（多标签页同步）
 * - 使用 BroadcastChannel 实现 iframe 与父窗口的实时同步（替代轮询）
 * @returns {void}
 */
function watchThemeChanges() {
  // 监听 localStorage 变更（用于多标签页同步）
  window.addEventListener('storage', e => {
    if (e.key === 'admin_theme' && e.newValue) {
      document.documentElement.setAttribute('data-theme', e.newValue)
      logger.debug(`[主题同步] localStorage 主题变更: ${e.newValue}`)
    }
  })

  // 使用 BroadcastChannel 实现 iframe 与父窗口的实时同步
  // 比 setInterval 轮询更高效，仅在主题变更时触发
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const themeChannel = new BroadcastChannel(THEME_CHANNEL_NAME)

      themeChannel.onmessage = event => {
        if (event.data?.type === 'theme_change' && event.data?.theme) {
          const newTheme = event.data.theme
          const currentTheme = document.documentElement.getAttribute('data-theme')

          if (newTheme !== currentTheme) {
            document.documentElement.setAttribute('data-theme', newTheme)
            logger.debug(`[主题同步] BroadcastChannel 主题更新: ${newTheme}`)
          }
        }
      }

      logger.debug('[主题同步] BroadcastChannel 监听已启动')
    } catch (e) {
      logger.warn('[主题同步] BroadcastChannel 初始化失败，回退到 localStorage 同步')
    }
  }
}

/* ========== 初始化 ========== */
// 立即同步主题（不等待 DOMContentLoaded，确保第一时间应用主题避免闪烁）
syncTheme()

document.addEventListener('DOMContentLoaded', () => {
  /*
   * 检查浏览器会话：如果是新的浏览器会话（浏览器曾被关闭），清除旧 token
   * 这确保关闭浏览器后需要重新登录，同时多标签页共享登录状态
   */
  checkBrowserSession()

  // 初始化 Alpine.js
  initAlpine()

  // 启动主题变更监听
  watchThemeChanges()

  logger.info('前端应用已初始化')
  logger.debug('技术栈: Vite + Alpine.js + Tailwind CSS')
})
