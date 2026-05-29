/**
 * 客服工作台 - B区多Tab页签管理 Composable
 *
 * @file admin/src/modules/content/composables/cs-work-tabs.js
 * @description B区多Tab页签容器，支持同时打开多个聊天/订单详情页签
 * @version 1.0.0
 * @date 2026-05-27
 */

import { logger } from '../../../utils/logger.js'
import Alpine from 'alpinejs'

/** B区最大同时打开的Tab数量 */
const MAX_TABS = 5

/**
 * B区多Tab页签状态
 * @returns {Object} B区Tab管理状态
 */
export function useCsWorkTabsState() {
  return {
    /** @type {Array<{id:string, type:string, label:string, data:Object}>} Tab列表 */
    work_tabs: [],
    /** @type {string|null} 当前激活的Tab ID */
    active_work_tab: null
  }
}

/**
 * B区多Tab页签方法
 * @returns {Object} B区Tab管理方法
 */
export function useCsWorkTabsMethods() {
  return {
    /**
     * 打开一个工作Tab（聊天或订单详情）
     * @param {Object} config - Tab配置
     * @param {string} config.type - Tab类型（'chat' | 'order'）
     * @param {string|number} config.id - 唯一标识
     * @param {string} [config.label] - Tab显示标签
     * @param {Object} [config.data] - Tab关联数据
     */
    openWorkTab(config) {
      const tabId = `${config.type}_${config.id}`
      const existing = this.work_tabs.find(t => t.id === tabId)
      if (existing) {
        this.active_work_tab = tabId
        return
      }
      if (this.work_tabs.length >= MAX_TABS) {
        Alpine.store('notification').show('最多同时打开5个标签页，请关闭不需要的标签', 'warning')
        return
      }
      this.work_tabs.push({
        id: tabId,
        type: config.type,
        label: config.label || (config.type === 'chat' ? '聊天' : `订单#${config.id}`),
        data: config.data || null
      })
      this.active_work_tab = tabId
      logger.info(`[WorkTabs] 打开Tab: ${tabId}`)
    },

    /**
     * 关闭一个工作Tab
     * @param {string} tabId - Tab ID
     */
    closeWorkTab(tabId) {
      const idx = this.work_tabs.findIndex(t => t.id === tabId)
      if (idx === -1) return
      this.work_tabs.splice(idx, 1)
      if (this.active_work_tab === tabId) {
        this.active_work_tab =
          this.work_tabs.length > 0 ? this.work_tabs[this.work_tabs.length - 1].id : null
      }
      logger.info(`[WorkTabs] 关闭Tab: ${tabId}`)
    },

    /**
     * 获取当前激活的Tab对象
     * @returns {Object|null} 当前Tab
     */
    getActiveTab() {
      return this.work_tabs.find(t => t.id === this.active_work_tab) || null
    },

    /**
     * 判断当前是否有激活的聊天Tab
     * @returns {boolean}
     */
    isActiveChatTab() {
      const tab = this.getActiveTab()
      return tab?.type === 'chat'
    },

    /**
     * 判断当前是否有激活的订单Tab
     * @returns {boolean}
     */
    isActiveOrderTab() {
      const tab = this.getActiveTab()
      return tab?.type === 'order'
    }
  }
}
