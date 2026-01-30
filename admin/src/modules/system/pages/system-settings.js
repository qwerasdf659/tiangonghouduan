/**
 * 系统设置整合页面 - 模块化重构版
 *
 * @file admin/src/modules/system/pages/system-settings.js
 * @module SystemSettingsPage
 * @version 4.1.0
 * @date 2026-01-24
 *
 * @description
 * 系统设置整合页面，通过 composables 模块化管理：
 * - 系统配置 (config)
 * - 字典管理 (dict)
 * - 功能开关 (feature-flags)
 * - 审计日志 (audit-logs)
 */

// ES Module 导入（替代 window.xxx 全局变量）
import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'

// 导入 composables 模块（方案A：只导入系统配置和审计日志）
import {
  useConfigState,
  useConfigMethods,
  useAuditLogsState,
  useAuditLogsMethods
} from '../composables/index.js'

/**
 * 注册系统设置相关的 Alpine.js 组件
 */
function registerSystemSettingsComponents() {
  logger.debug('[SystemSettings] 注册 Alpine 组件 (ES Module v4.1)...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[SystemSettings] 关键依赖未加载')
    return
  }

  // 全局 Store - 存储当前激活的子页面ID
  Alpine.store('systemPage', 'system-config')

  /**
   * 系统设置导航组件（方案A：精简版，只保留系统配置和审计日志）
   */
  Alpine.data('systemNavigation', () => ({
    ...createPageMixin(),

    current_page: 'system-config',

    // 方案A: 字典管理/定价配置/功能开关已分离为独立页面
    subPages: [
      { id: 'system-config', name: '系统配置', icon: 'bi-gear' },
      { id: 'audit-logs', name: '审计日志', icon: 'bi-journal-text' }
    ],

    init() {
      logger.debug('系统设置导航初始化 (方案A v5.0 - 精简版)')
      if (!this.checkAuth()) return

      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'system-config'
      Alpine.store('systemPage', this.current_page)
    },

    switchPage(pageId) {
      this.current_page = pageId
      Alpine.store('systemPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  /**
   * 系统设置内容组件 - 使用 composables 组合
   * 方案A: 字典管理/定价配置/功能开关已分离为独立页面
   */
  Alpine.data('systemSettings', () => ({
    // 基础混入
    ...createPageMixin(),

    // ==================== 从 Composables 导入状态 ====================
    ...useConfigState(),
    ...useAuditLogsState(),

    // ==================== 导航状态 ====================
    current_page: 'system-config',

    // 子页面配置（方案A：只保留系统配置和审计日志）
    subPages: [
      { id: 'system-config', name: '系统配置', icon: '⚙️' },
      { id: 'audit-logs', name: '审计日志', icon: '📋' }
    ],

    // ==================== 通用状态 ====================
    page: 1,
    page_size: 20,
    total_pages: 1,
    total: 0,
    saving: false,

    // ==================== 初始化和数据加载 ====================

    init() {
      logger.debug('[SystemSettings] 组件初始化开始 (方案A v5.0 - 精简版)')

      if (!this.checkAuth()) {
        logger.warn('[SystemSettings] 认证检查失败')
        return
      }

      // 从 URL 参数读取当前页面
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'system-config'

      logger.debug('[SystemSettings] 当前子页面:', this.current_page)

      // 立即加载数据
      this.loadPageData()

      // 监控配置变更
      this.$watch('systemConfig', () => this.checkConfigModified(), { deep: true })
    },

    switchPage(pageId) {
      logger.debug('[SystemSettings] 切换到子页面:', pageId)
      this.current_page = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    async loadPageData() {
      const page = this.current_page
      await this.withLoading(
        async () => {
          switch (page) {
            case 'system-config':
              await this.loadSystemConfig()
              break
            case 'audit-logs':
              await this.loadAuditLogs()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 从 Composables 导入方法 ====================
    ...useConfigMethods(),
    ...useAuditLogsMethods(),

    // ==================== 工具方法 ====================

    /**
     * 格式化日期时间
     * @param {string|Object} dateValue - ISO日期字符串或后端返回的时间对象
     * @returns {string} 格式化后的日期字符串
     */
    formatDate(dateValue) {
      if (!dateValue) return '-'
      try {
        // 如果是后端返回的时间对象格式 { iso, beijing, timestamp, relative }
        if (typeof dateValue === 'object' && dateValue !== null) {
          // 优先使用 beijing 格式（北京时间）
          if (dateValue.beijing) return dateValue.beijing
          // 或者使用 iso 格式
          if (dateValue.iso) {
            return new Date(dateValue.iso).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
          }
          // 或者使用 relative 格式
          if (dateValue.relative) return dateValue.relative
        }
        // 字符串格式
        const date = new Date(dateValue)
        if (isNaN(date.getTime())) return '-'
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return '-'
      }
    }
  }))

  logger.info('[SystemSettings] Alpine 组件注册完成')
}

// ==================== 事件监听 ====================

document.addEventListener('alpine:init', () => {
  registerSystemSettingsComponents()
})

export { registerSystemSettingsComponents }
export default registerSystemSettingsComponents
