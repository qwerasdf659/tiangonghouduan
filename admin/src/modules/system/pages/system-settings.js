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

// 导入所有 composables 模块
import {
  useConfigState,
  useConfigMethods,
  useDictState,
  useDictMethods,
  useFeatureFlagsState,
  useFeatureFlagsMethods,
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
   * 系统设置导航组件
   */
  Alpine.data('systemNavigation', () => ({
    ...createPageMixin(),

    currentPage: 'system-config',

    subPages: [
      { id: 'system-config', name: '系统配置', icon: 'bi-gear' },
      { id: 'dict-management', name: '字典管理', icon: 'bi-book' },
      { id: 'feature-flags', name: '功能开关', icon: 'bi-toggle-on' },
      { id: 'audit-logs', name: '审计日志', icon: 'bi-journal-text' },
      { id: 'pricing-config', name: '定价配置', icon: 'bi-currency-dollar' }
    ],

    init() {
      logger.debug('系统设置导航初始化 (模块化 v4.0)')
      if (!this.checkAuth()) return

      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'system-config'
      Alpine.store('systemPage', this.currentPage)
    },

    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('systemPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  /**
   * 系统设置内容组件 - 使用 composables 组合
   * 合并了导航和内容组件的功能
   */
  Alpine.data('systemSettings', () => ({
    // 基础混入
    ...createPageMixin(),

    // ==================== 从 Composables 导入状态 ====================
    ...useConfigState(),
    ...useDictState(),
    ...useFeatureFlagsState(),
    ...useAuditLogsState(),

    // ==================== 导航状态 (从 systemNavigation 合并) ====================
    currentPage: 'system-config',
    
    subPages: [
      { id: 'system-config', name: '系统配置', icon: '⚙️' },
      { id: 'dict-management', name: '字典管理', icon: '📚' },
      { id: 'feature-flags', name: '功能开关', icon: '🔘' },
      { id: 'audit-logs', name: '审计日志', icon: '📋' },
      { id: 'pricing-config', name: '定价配置', icon: '💰' }
    ],

    // ==================== 通用状态 ====================
    page: 1,
    pageSize: 20,
    totalPages: 1,
    total: 0,
    saving: false,

    // ==================== 初始化和数据加载 ====================

    init() {
      console.log('[SystemSettings] 组件初始化开始')
      logger.debug('系统设置初始化 (合并版 v4.1)')
      
      if (!this.checkAuth()) {
        console.warn('[SystemSettings] 认证检查失败')
        return
      }

      // 从 URL 参数读取当前页面
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'system-config'
      console.log('[SystemSettings] 当前子页面:', this.currentPage)
      
      // 立即加载数据
      this.loadPageData()

      // 监控配置变更
      this.$watch('systemConfig', () => this.checkConfigModified(), { deep: true })
    },

    switchPage(pageId) {
      console.log('[SystemSettings] 切换到子页面:', pageId)
      this.currentPage = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    async loadPageData() {
      const page = this.currentPage
      await this.withLoading(
        async () => {
          switch (page) {
            case 'system-config':
              await this.loadSystemConfig()
              break
            case 'dict-management':
              await this.loadDictList()
              break
            case 'feature-flags':
              await this.loadFeatureFlags()
              break
            case 'audit-logs':
              await this.loadAuditLogs()
              break
            case 'pricing-config':
              await this.loadPricingConfigs()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 从 Composables 导入方法 ====================
    ...useConfigMethods(),
    ...useDictMethods(),
    ...useFeatureFlagsMethods(),
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
