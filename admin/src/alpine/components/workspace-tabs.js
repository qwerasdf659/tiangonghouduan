/**
 * Tab 工作台管理器
 * @description 管理多 Tab 页面的打开、切换、关闭
 * @version 1.0.0
 * @date 2026-01-25
 */

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
    init() {
      // 恢复 Tab 状态
      this.loadState()
      
      // 监听侧边栏导航事件
      window.addEventListener('open-tab', (e) => {
        this.openTab(e.detail)
      })
      
      // 监听浏览器前进/后退
      window.addEventListener('popstate', () => {
        // 可选：根据 URL 切换 Tab
      })
      
      // 默认打开统计页面（作为工作台首页）
      if (this.tabs.length === 0) {
        this.openTab({
          id: 'statistics',
          title: '数据统计',
          icon: '📊',
          url: '/admin/statistics.html'
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
      
      // 已存在则切换
      const existing = this.tabs.find(t => t.id === id)
      if (existing) {
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
      if (!this.tabs.find(t => t.id === id)) return
      this.activeTabId = id
      this.saveState()
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
        this.activeTabId = this.tabs.length > 0 
          ? this.tabs[this.tabs.length - 1].id 
          : null
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
      localStorage.setItem('workspace_tabs', JSON.stringify({
        tabs: this.tabs,
        activeTabId: this.activeTabId
      }))
    },
    
    /**
     * 从 localStorage 加载状态
     */
    loadState() {
      try {
        const state = JSON.parse(localStorage.getItem('workspace_tabs'))
        if (state) {
          this.tabs = state.tabs || []
          this.activeTabId = state.activeTabId
        }
      } catch (e) {
        console.warn('加载 Tab 状态失败', e)
      }
    }
  }
}

export default workspaceTabs

