/**
 * 侧边栏导航组件
 * @description 管理侧边栏导航的展开/折叠和菜单状态
 * @version 1.1.0
 * @date 2026-01-25
 */

/**
 * 创建侧边栏导航组件
 * @returns {Object} Alpine 组件对象
 */
export function sidebarNav() {
  return {
    // 侧边栏折叠状态
    collapsed: false,
    // 移动端菜单显示状态
    mobileOpen: false,
    // 默认展开的分组
    expandedGroups: ['operations', 'lottery'],
    // 当前激活的菜单项ID（用于工作台Tab模式下的高亮）
    activeItemId: null,
    
    // 导航配置（7大业务模块）
    navGroups: [
      {
        id: 'dashboard',
        name: '工作台',
        icon: '🏠',
        type: 'single',
        url: '/admin/statistics.html'
      },
      {
        id: 'operations',
        name: '日常运营',
        icon: '📋',
        items: [
          { id: 'consumption', name: '消费记录审核', url: '/admin/finance-management.html' },
          { id: 'risk', name: '风控告警', url: '/admin/risk-alerts.html', badge: true },
          { id: 'customer', name: '客服工作台', url: '/admin/customer-service.html' }
        ]
      },
      {
        id: 'lottery',
        name: '抽奖活动',
        icon: '🎰',
        items: [
          { id: 'campaigns', name: '活动管理', url: '/admin/lottery-management.html' },
          { id: 'presets', name: '抽奖预设', url: '/admin/presets.html' }
        ]
      },
      {
        id: 'assets',
        name: '资产中心',
        icon: '💎',
        items: [
          { id: 'asset-mgmt', name: '资产管理', url: '/admin/asset-management.html' },
          { id: 'asset-adj', name: '资产调整', url: '/admin/asset-adjustment.html' },
          { id: 'orphan', name: '孤儿冻结清理', url: '/admin/orphan-frozen.html' },
          { id: 'material-rules', name: '物料转换规则', url: '/admin/material-conversion-rules.html' },
          { id: 'assets-portfolio', name: '资产组合', url: '/admin/assets-portfolio.html' }
        ]
      },
      {
        id: 'market',
        name: '市场交易',
        icon: '🏪',
        items: [
          { id: 'exchange', name: '兑换市场', url: '/admin/exchange-market.html' },
          { id: 'trade', name: 'C2C交易', url: '/admin/trade-management.html' }
        ]
      },
      {
        id: 'users',
        name: '用户门店',
        icon: '👥',
        items: [
          { id: 'user-mgmt', name: '用户管理', url: '/admin/user-management.html' },
          { id: 'user-hierarchy', name: '用户层级', url: '/admin/user-hierarchy.html' },
          { id: 'stores', name: '门店管理', url: '/admin/store-management.html' }
        ]
      },
      {
        id: 'system',
        name: '系统设置',
        icon: '⚙️',
        items: [
          { id: 'settings', name: '系统配置', url: '/admin/system-settings.html' },
          { id: 'content', name: '内容管理', url: '/admin/content-management.html' },
          { id: 'sessions', name: '会话管理', url: '/admin/sessions.html' },
          { id: 'item-tpl', name: '物品模板', url: '/admin/item-templates.html' },
          { id: 'config-tools', name: '配置工具', url: '/admin/config-tools.html' }
        ]
      },
      {
        id: 'analytics',
        name: '数据分析',
        icon: '📊',
        items: [
          { id: 'stats', name: '统计报表', url: '/admin/statistics.html' },
          { id: 'analytics', name: '运营分析', url: '/admin/analytics.html' }
        ]
      }
    ],
    
    /**
     * 初始化
     */
    init() {
      // 从 localStorage 恢复折叠状态
      const savedCollapsed = localStorage.getItem('sidebar_collapsed')
      if (savedCollapsed !== null) {
        this.collapsed = savedCollapsed === 'true'
      }
      
      // 从 localStorage 恢复展开的分组
      const savedGroups = localStorage.getItem('sidebar_expanded_groups')
      if (savedGroups) {
        try {
          this.expandedGroups = JSON.parse(savedGroups)
        } catch (e) {
          console.warn('恢复侧边栏分组状态失败', e)
        }
      }
      
      // 根据当前 URL 高亮对应菜单并展开分组
      this.highlightCurrentPage()
      
      // 监听 Tab 打开/切换事件，更新菜单高亮状态
      window.addEventListener('open-tab', (e) => {
        this.setActiveItem(e.detail.id, e.detail.url)
      })
      
      // 监听 Tab 切换事件
      window.addEventListener('switch-tab', (e) => {
        this.setActiveItem(e.detail.id, e.detail.url)
      })
      
      // 从 localStorage 恢复当前激活的 Tab 状态
      this.restoreActiveItemFromTabs()
    },
    
    /**
     * 从 localStorage 恢复当前激活的菜单项
     */
    restoreActiveItemFromTabs() {
      try {
        const state = JSON.parse(localStorage.getItem('workspace_tabs'))
        if (state && state.activeTabId) {
          this.activeItemId = state.activeTabId
          // 展开对应的分组
          this.expandGroupForItem(state.activeTabId)
        }
      } catch (e) {
        console.warn('恢复激活菜单项失败', e)
      }
    },
    
    /**
     * 设置当前激活的菜单项
     * @param {string} itemId - 菜单项ID
     * @param {string} url - 菜单项URL
     */
    setActiveItem(itemId, url) {
      this.activeItemId = itemId
      // 展开对应的分组
      this.expandGroupForItem(itemId)
    },
    
    /**
     * 根据菜单项ID展开对应的分组
     * @param {string} itemId - 菜单项ID
     */
    expandGroupForItem(itemId) {
      for (const group of this.navGroups) {
        if (group.items) {
          const found = group.items.find(item => item.id === itemId)
          if (found && !this.expandedGroups.includes(group.id)) {
            this.expandedGroups.push(group.id)
            localStorage.setItem('sidebar_expanded_groups', JSON.stringify(this.expandedGroups))
            break
          }
        }
      }
    },
    
    /**
     * 切换侧边栏折叠状态
     */
    toggleCollapse() {
      this.collapsed = !this.collapsed
      localStorage.setItem('sidebar_collapsed', this.collapsed)
    },
    
    /**
     * 切换移动端菜单
     */
    toggleMobileMenu() {
      this.mobileOpen = !this.mobileOpen
    },
    
    /**
     * 切换分组展开/折叠
     * @param {string} groupId - 分组ID
     */
    toggleGroup(groupId) {
      const index = this.expandedGroups.indexOf(groupId)
      if (index > -1) {
        this.expandedGroups.splice(index, 1)
      } else {
        this.expandedGroups.push(groupId)
      }
      localStorage.setItem('sidebar_expanded_groups', JSON.stringify(this.expandedGroups))
    },
    
    /**
     * 判断分组是否展开
     * @param {string} groupId - 分组ID
     * @returns {boolean}
     */
    isGroupExpanded(groupId) {
      return this.expandedGroups.includes(groupId)
    },
    
    /**
     * 根据当前 URL 高亮菜单
     */
    highlightCurrentPage() {
      const currentPath = window.location.pathname + window.location.search
      
      for (const group of this.navGroups) {
        if (group.type === 'single') {
          // 单项菜单不需要处理
          continue
        }
        
        if (group.items) {
          for (const item of group.items) {
            if (currentPath.includes(item.url.split('?')[0])) {
              // 展开对应分组
              if (!this.expandedGroups.includes(group.id)) {
                this.expandedGroups.push(group.id)
              }
              break
            }
          }
        }
      }
    },
    
    /**
     * 判断菜单项是否激活
     * @param {string} url - 菜单URL
     * @param {string} itemId - 菜单项ID（可选）
     * @returns {boolean}
     */
    isItemActive(url, itemId) {
      // 如果在工作台模式下（有 activeItemId），优先使用 Tab 状态判断
      if (this.activeItemId) {
        // 如果提供了 itemId，直接比较
        if (itemId) {
          return this.activeItemId === itemId
        }
        // 根据 URL 查找对应的 itemId
        for (const group of this.navGroups) {
          if (group.type === 'single' && group.url === url) {
            return this.activeItemId === group.id
          }
          if (group.items) {
            const item = group.items.find(i => i.url === url)
            if (item) {
              return this.activeItemId === item.id
            }
          }
        }
      }
      
      // 非工作台模式，使用传统的 URL 匹配
      const currentPath = window.location.pathname + window.location.search
      return currentPath.includes(url.split('?')[0])
    },
    
    /**
     * 导航到指定页面（在 Tab 中打开）
     * @param {string} url - 目标URL
     * @param {string} itemId - 菜单项ID
     * @param {string} itemName - 菜单项名称
     * @param {string} icon - 图标
     */
    navigateTo(url, itemId, itemName, icon) {
      // 通知 Tab 管理器打开新 Tab
      window.dispatchEvent(new CustomEvent('open-tab', {
        detail: { 
          url, 
          id: itemId,
          title: itemName,
          icon: icon || '📄'
        }
      }))
      
      // 移动端关闭菜单
      this.mobileOpen = false
    }
  }
}

export default sidebarNav

