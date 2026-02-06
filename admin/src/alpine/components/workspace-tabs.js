/**
 * Tab 工作台管理器
 * @description 管理多 Tab 页面的打开、切换、关闭
 * @version 1.0.0
 * @date 2026-01-25
 */

import { logger } from '../../utils/logger.js'

/**
 * 创建 Tab 工作台管理器
 * @returns {Object} Alpine 组件对象
 */
export function workspaceTabs() {
  return {
    // Tab 列表
    tabs: [],
    // 当前激活的 Tab ID
    activeTabId: null,
    // 最大 Tab 数量
    maxTabs: 10,

    /**
     * 初始化
     */
    // 事件处理器引用（用于 destroy 清理）
    _openTabHandler: null,
    _popstateHandler: null,

    init() {
      // 恢复 Tab 状态
      this.loadState()

      // 监听侧边栏导航事件
      this._openTabHandler = e => this.openTab(e.detail)
      window.addEventListener('open-tab', this._openTabHandler)

      // 监听浏览器前进/后退
      this._popstateHandler = () => {
        // 可选：根据 URL 切换 Tab
      }
      window.addEventListener('popstate', this._popstateHandler)

      // 默认打开待处理中心和运营仪表盘（待处理中心为默认激活）
      if (this.tabs.length === 0) {
        // 先打开运营仪表盘
        this.openTab({
          id: 'dashboard-panel',
          title: '运营仪表盘',
          icon: '📊',
          url: '/admin/dashboard-panel.html'
        })
        // 再打开待处理中心（后打开的会成为激活Tab）
        this.openTab({
          id: 'pending-center',
          title: '待处理中心',
          icon: '🔔',
          url: '/admin/pending-center.html'
        })
      }
    },

    /**
     * 打开新 Tab
     * @param {Object} config - Tab 配置
     * @param {string} config.id - Tab ID
     * @param {string} config.title - Tab 标题
     * @param {string} config.icon - Tab 图标
     * @param {string} config.url - Tab URL
     */
    openTab(config) {
      const { id, title, icon, url } = config

      // 防止加载 workspace.html 到 iframe 中（会导致无限嵌套）
      if (url && url.includes('workspace.html')) {
        logger.warn('[WorkspaceTabs] 阻止加载 workspace.html 到 Tab 中，避免嵌套')
        return
      }

      // 已存在则检查 URL 是否需要更新
      const existing = this.tabs.find(t => t.id === id)
      if (existing) {
        // 如果 URL 不同，更新 Tab 的 URL（解决方案A升级后的缓存问题）
        if (existing.url !== url) {
          logger.debug(`[WorkspaceTabs] 更新 Tab URL: ${existing.url} → ${url}`)
          existing.url = url
          this.saveState()
          // 如果当前是激活的 Tab，刷新 iframe
          if (this.activeTabId === id) {
            const iframe = document.querySelector(`[data-tab-id="${id}"] iframe`)
            if (iframe) {
              iframe.src = url
            }
          }
        }
        this.switchTab(id)
        return
      }

      // 超出限制则关闭最早打开的
      if (this.tabs.length >= this.maxTabs) {
        // 不关闭仪表盘
        const oldestNonDashboard = this.tabs.find(t => t.id !== 'dashboard')
        if (oldestNonDashboard) {
          this.closeTab(oldestNonDashboard.id)
        } else {
          this.tabs.shift()
        }
      }

      // 添加新 Tab
      this.tabs.push({
        id,
        title,
        icon: icon || '📄',
        url,
        openTime: Date.now()
      })

      this.activeTabId = id
      this.saveState()
    },

    /**
     * 切换 Tab
     * @param {string} id - Tab ID
     */
    switchTab(id) {
      const tab = this.tabs.find(t => t.id === id)
      if (!tab) return
      this.activeTabId = id
      this.saveState()

      // 发送 Tab 切换事件，通知侧边栏更新高亮
      window.dispatchEvent(
        new CustomEvent('switch-tab', {
          detail: {
            id: tab.id,
            url: tab.url,
            title: tab.title
          }
        })
      )
    },

    /**
     * 关闭 Tab
     * @param {string} id - Tab ID
     */
    closeTab(id) {
      const index = this.tabs.findIndex(t => t.id === id)
      if (index === -1) return

      this.tabs.splice(index, 1)

      // 关闭的是当前 Tab，切换到最后一个
      if (this.activeTabId === id) {
        this.activeTabId = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].id : null
      }

      this.saveState()
    },

    /**
     * 关闭其他 Tab
     * @param {string} keepId - 保留的 Tab ID
     */
    closeOtherTabs(keepId) {
      this.tabs = this.tabs.filter(t => t.id === keepId)
      this.activeTabId = keepId
      this.saveState()
    },

    /**
     * 关闭所有 Tab
     */
    closeAllTabs() {
      this.tabs = []
      this.activeTabId = null
      this.saveState()

      // 重新打开统计页面
      this.openTab({
        id: 'statistics',
        title: '数据统计',
        icon: '📊',
        url: '/admin/statistics.html'
      })
    },

    /**
     * 判断是否为激活 Tab
     * @param {string} id - Tab ID
     * @returns {boolean}
     */
    isActiveTab(id) {
      return this.activeTabId === id
    },

    /**
     * 获取当前激活的 Tab
     * @returns {Object|undefined}
     */
    getActiveTab() {
      return this.tabs.find(t => t.id === this.activeTabId)
    },

    /**
     * 刷新当前 Tab
     */
    refreshCurrentTab() {
      const activeTab = this.getActiveTab()
      if (activeTab) {
        // 通过改变 URL 触发 iframe 刷新
        const iframe = document.querySelector(`[data-tab-id="${activeTab.id}"] iframe`)
        if (iframe) {
          iframe.src = activeTab.url
        }
      }
    },

    /**
     * 右键菜单处理
     * @param {string} tabId - Tab ID
     * @param {Event} event - 事件对象
     */
    showContextMenu(tabId, event) {
      event.preventDefault()
      // 可扩展：显示右键菜单
    },

    /**
     * 保存状态到 localStorage
     */
    saveState() {
      localStorage.setItem(
        'workspace_tabs',
        JSON.stringify({
          tabs: this.tabs,
          activeTabId: this.activeTabId
        })
      )
    },

    /**
     * 从 localStorage 加载状态
     */
    loadState() {
      try {
        const state = JSON.parse(localStorage.getItem('workspace_tabs'))
        if (state) {
          // 过滤掉 workspace.html 的 Tab（防止嵌套）
          const safeTabs = (state.tabs || []).filter(tab => {
            if (tab.url && tab.url.includes('workspace.html')) {
              logger.warn('[WorkspaceTabs] 过滤掉可能导致嵌套的 Tab:', tab.url)
              return false
            }
            return true
          })

          this.tabs = safeTabs

          // 如果过滤后激活的 Tab 不存在，重置为第一个 Tab
          const activeExists = safeTabs.some(t => t.id === state.activeTabId)
          this.activeTabId = activeExists ? state.activeTabId : safeTabs[0]?.id || null

          // 如果有变化，保存状态
          if (safeTabs.length !== (state.tabs || []).length) {
            this.saveState()
          }
        }
      } catch (e) {
        logger.warn('加载 Tab 状态失败', e)
        // 清理可能损坏的状态
        localStorage.removeItem('workspace_tabs')
      }
    },
    /**
     * 清理事件监听器
     */
    destroy() {
      if (this._openTabHandler) {
        window.removeEventListener('open-tab', this._openTabHandler)
      }
      if (this._popstateHandler) {
        window.removeEventListener('popstate', this._popstateHandler)
      }
      logger.debug('[WorkspaceTabs] 事件监听器已清理')
    }
  }
}

export default workspaceTabs
