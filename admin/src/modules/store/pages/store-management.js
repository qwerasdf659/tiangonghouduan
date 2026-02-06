/**
 * Store Management Page - Alpine.js Mixin 重构版
 * 门店管理整合页面组件
 *
 * @file admin/src/modules/store/pages/store-management.js
 * @description 门店管理整合页面，包含门店列表、员工管理和门店统计功能
 * @version 3.2.0 (Composable 重构版)
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import {
  useStoresState,
  useStoresMethods,
  useStaffState,
  useStaffMethods,
  useRegionsState,
  useRegionsMethods
} from '../composables/index.js'

/**
 * 注册门店管理相关Alpine组件
 */
function registerStoreManagementComponents() {
  logger.info('[StoreManagement] 注册 Alpine 组件 (Composable v3.2)...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[StoreManagement] Alpine.js 未加载，请检查脚本加载顺序')
    return
  }

  // 全局 Store
  Alpine.store('storePage', 'stores')

  // ==================== 导航组件 ====================

  Alpine.data('storeNavigation', () => ({
    ...createPageMixin(),
    current_page: 'stores',
    subPages: [
      { id: 'stores', title: '门店列表', icon: 'bi-shop' },
      { id: 'staff', title: '员工管理', icon: 'bi-people' },
      { id: 'store-stats', title: '门店统计', icon: 'bi-graph-up' }
    ],

    init() {
      logger.info('门店管理导航初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'stores'
      Alpine.store('storePage', this.current_page)
    },

    switchPage(pageId) {
      this.current_page = pageId
      Alpine.store('storePage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // ==================== 页面内容组件 ====================

  Alpine.data('storePageContent', () => ({
    ...createPageMixin(),

    // ==================== Composables ====================
    ...useStoresState(),
    ...useStoresMethods(),
    ...useStaffState(),
    ...useStaffMethods(),
    ...useRegionsState(),
    ...useRegionsMethods(),

    // 通用状态
    saving: false,
    isEditMode: false,

    get current_page() {
      return Alpine.store('storePage')
    },

    init() {
      logger.info('门店管理内容初始化')
      this.loadProvinces()
      this.loadPageData()
      this.$watch('$store.storePage', () => this.loadPageData())
    },

    async loadPageData() {
      const page = this.current_page
      await this.withLoading(
        async () => {
          await this.loadStores()

          switch (page) {
            case 'stores':
              await this.loadStoreStats()
              break
            case 'staff':
              await this.loadStaff()
              break
            case 'store-stats':
              await this.loadStoreRanking()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 工具方法 ====================

    formatDateTimeLocal(dateValue) {
      if (!dateValue) return ''
      try {
        let dateStr = dateValue
        if (typeof dateValue === 'object') {
          dateStr = dateValue.iso || dateValue.beijing || dateValue.timestamp
        }
        if (!dateStr) return ''
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return ''
        return date.toISOString().split('T')[0]
      } catch {
        return ''
      }
    },

    formatDateSafe(dateValue) {
      if (!dateValue) return '-'
      try {
        let dateStr = dateValue
        if (typeof dateValue === 'object') {
          dateStr = dateValue.beijing || dateValue.iso || dateValue.timestamp
        }
        if (!dateStr) return '-'
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return String(dateValue)
        return date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return String(dateValue)
      }
    }
  }))

  logger.info('[StoreManagement] Alpine 组件已注册')
}

// 使用 alpine:init 事件注册组件
document.addEventListener('alpine:init', registerStoreManagementComponents)

logger.info('[StoreManagement] 页面脚本已加载')
