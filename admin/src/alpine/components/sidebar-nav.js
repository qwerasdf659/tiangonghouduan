/**
 * 侧边栏导航组件
 * @description 管理侧边栏导航的展开/折叠和菜单状态，支持基于 role_level 的权限过滤
 * @version 2.0.0
 * @date 2026-02-01
 * @changelog 2.0.0 - 重构导航结构：待处理中心置顶、风控中心分组、资产交易合并
 */

import { hasMenuAccess, getUserRoleLevel } from '../../config/permission-rules.js'
import { logger } from '../../utils/logger.js'

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
    expandedGroups: ['pending-center', 'lottery-ops'],
    // 当前激活的菜单项ID（用于工作台Tab模式下的高亮）
    activeItemId: null,

    // ========== 徽标数量 ==========
    // 总待处理数量
    totalPendingCount: 0,
    // 消费审核待处理数量
    consumptionPendingCount: 0,
    // 客服会话待处理数量
    customerPendingCount: 0,
    // 风控告警待处理数量
    pendingAlertCount: 0,
    // 抽奖告警待处理数量
    lotteryAlertCount: 0,

    // 用户权限等级（用于权限过滤）
    userRoleLevel: 0,

    // 原始导航配置 - 过滤前的完整配置
    _originalNavGroups: null,

    // 导航配置（已按文档要求重构）
    navGroups: [
      // 1️⃣ 待处理中心 - 置顶最高优先级
      {
        id: 'pending-center',
        name: '待处理中心',
        icon: '🔔',
        items: [
          {
            id: 'consumption-review',
            name: '消费记录审核',
            url: '/admin/finance-management.html',
            badgeKey: 'consumptionPendingCount'
          },
          {
            id: 'customer-service',
            name: '客服工作台',
            url: '/admin/customer-service.html',
            badgeKey: 'customerPendingCount'
          },
          {
            id: 'risk-alerts',
            name: '风控告警',
            url: '/admin/risk-alerts.html',
            badgeKey: 'pendingAlertCount'
          },
          {
            id: 'lottery-alerts',
            name: '抽奖告警',
            url: '/admin/lottery-alerts.html',
            badgeKey: 'lotteryAlertCount'
          }
        ]
      },

      // 2️⃣ 运营仪表盘 - 第二位
      {
        id: 'dashboard',
        name: '运营仪表盘',
        icon: '📊',
        type: 'single',
        url: '/admin/workspace.html?tab=dashboard'
      },

      // 3️⃣ 抽奖运营 - 高频操作区
      {
        id: 'lottery-ops',
        name: '抽奖运营',
        icon: '🎰',
        items: [
          {
            id: 'lottery-monitoring',
            name: '实时监控',
            url: '/admin/lottery-management.html?page=lottery-metrics',
            badge: 'live'
          },
          {
            id: 'lottery-campaigns',
            name: '活动管理',
            url: '/admin/lottery-management.html?page=campaigns'
          },
          {
            id: 'lottery-prizes',
            name: '奖品配置',
            url: '/admin/lottery-management.html?page=prizes'
          },
          {
            id: 'lottery-budget',
            name: '预算控制',
            url: '/admin/lottery-management.html?page=campaign-budget'
          },
          {
            id: 'lottery-strategy',
            name: '策略配置',
            url: '/admin/lottery-management.html?page=lottery-strategy'
          },
          {
            id: 'lottery-presets',
            name: '干预预设',
            url: '/admin/presets.html'
          }
        ]
      },

      // 4️⃣ 资产交易 - 合并原「资产中心」和「市场交易」
      {
        id: 'asset-trade',
        name: '资产交易',
        icon: '💎',
        items: [
          { id: 'asset-mgmt', name: '资产管理', url: '/admin/asset-management.html' },
          { id: 'asset-adj', name: '资产调整', url: '/admin/asset-adjustment.html' },
          { id: 'exchange', name: '兑换市场', url: '/admin/exchange-market.html' },
          { id: 'trade', name: 'C2C交易', url: '/admin/trade-management.html' }
        ]
      },

      // 5️⃣ 用户门店
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

      // 6️⃣ 数据分析
      {
        id: 'analytics',
        name: '数据分析',
        icon: '📈',
        items: [
          { id: 'stats', name: '统计报表', url: '/admin/statistics.html' },
          { id: 'analytics', name: '运营分析', url: '/admin/analytics.html' }
        ]
      },

      // 7️⃣ 系统设置 - 低频功能整合
      {
        id: 'system',
        name: '系统设置',
        icon: '⚙️',
        items: [
          { id: 'content', name: '内容管理', url: '/admin/content-management.html' },
          { id: 'item-tpl', name: '物品模板', url: '/admin/item-templates.html' },
          { id: 'dict', name: '字典管理', url: '/admin/dict-management.html' },
          { id: 'pricing', name: '定价配置', url: '/admin/pricing-config.html' },
          { id: 'feature-flags', name: '功能开关', url: '/admin/feature-flags.html' },
          { id: 'orphan', name: '孤儿冻结清理', url: '/admin/orphan-frozen.html' },
          { id: 'material-rules', name: '物料转换规则', url: '/admin/material-conversion-rules.html' },
          { id: 'assets-portfolio', name: '资产组合', url: '/admin/assets-portfolio.html' },
          { id: 'settings', name: '系统配置', url: '/admin/system-settings.html' },
          { id: 'reminder-rules', name: '提醒规则配置', url: '/admin/reminder-rules.html' },
          { id: 'sessions', name: '会话管理', url: '/admin/sessions.html' },
          { id: 'config-tools', name: '配置工具', url: '/admin/config-tools.html' }
        ]
      }
    ],

    /**
     * 初始化
     */
    init() {
      // ========== 权限过滤（优先执行）==========
      this.userRoleLevel = getUserRoleLevel()
      this.filterNavByPermission()
      logger.debug(`[SidebarNav] 用户权限等级: ${this.userRoleLevel}，菜单已过滤`)

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
          logger.warn('恢复侧边栏分组状态失败', e)
        }
      }

      // 根据当前 URL 高亮对应菜单并展开分组
      this.highlightCurrentPage()

      // 监听 Tab 打开/切换事件，更新菜单高亮状态
      window.addEventListener('open-tab', e => {
        this.setActiveItem(e.detail.id, e.detail.url)
      })

      // 监听 Tab 切换事件
      window.addEventListener('switch-tab', e => {
        this.setActiveItem(e.detail.id, e.detail.url)
      })

      // 从 localStorage 恢复当前激活的 Tab 状态
      this.restoreActiveItemFromTabs()

      // 获取所有徽标数量（统一API）
      this.fetchAllBadgeCounts()

      // 每5分钟刷新一次徽标数量
      setInterval(() => {
        this.fetchAllBadgeCounts()
      }, 5 * 60 * 1000)
    },

    /**
     * 获取所有徽标数量（调用统一徽标API）
     */
    async fetchAllBadgeCounts() {
      try {
        const token = localStorage.getItem('admin_token')
        if (!token) return

        const response = await fetch('/api/v4/console/nav/badges', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            // 直接使用后端字段名
            this.totalPendingCount = data.data.total || 0
            this.consumptionPendingCount = data.data.badges?.consumption || 0
            this.customerPendingCount = data.data.badges?.customer_service || 0
            this.pendingAlertCount = data.data.badges?.risk_alert || 0
            this.lotteryAlertCount = data.data.badges?.lottery_alert || 0

            logger.debug('[SidebarNav] 徽标数量已更新', {
              total: this.totalPendingCount,
              consumption: this.consumptionPendingCount,
              customer: this.customerPendingCount,
              risk: this.pendingAlertCount,
              lottery: this.lotteryAlertCount
            })
          }
        }
      } catch (error) {
        logger.warn('获取徽标数量失败:', error.message)
        // 降级：使用原有单独的API获取
        this.fetchPendingAlertCount()
        this.fetchLotteryAlertCount()
      }
    },

    /**
     * 获取未处理的风控告警数量（降级方案）
     */
    async fetchPendingAlertCount() {
      try {
        const token = localStorage.getItem('admin_token')
        if (!token) return

        const response = await fetch('/api/v4/shop/risk/alerts?status=pending&page_size=1', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            this.pendingAlertCount = data.data.total || 0
          }
        }
      } catch (error) {
        logger.warn('获取风控告警数量失败:', error.message)
      }
    },

    /**
     * 获取未处理的抽奖告警数量（降级方案）
     */
    async fetchLotteryAlertCount() {
      try {
        const token = localStorage.getItem('admin_token')
        if (!token) return

        const response = await fetch(
          '/api/v4/console/lottery-realtime/alerts?status=active&page_size=1',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        )

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            // 从 summary 获取 danger + warning 数量
            const summary = data.data.summary || {}
            this.lotteryAlertCount = (summary.danger || 0) + (summary.warning || 0)
          }
        }
      } catch (error) {
        logger.warn('获取抽奖告警数量失败:', error.message)
      }
    },

    /**
     * 获取徽标数量（供模板使用）
     * @param {string} badgeKey - 徽标键名
     * @returns {number}
     */
    getBadgeCount(badgeKey) {
      return this[badgeKey] || 0
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
        logger.warn('恢复激活菜单项失败', e)
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
      window.dispatchEvent(
        new CustomEvent('open-tab', {
          detail: {
            url,
            id: itemId,
            title: itemName,
            icon: icon || '📄'
          }
        })
      )

      // 移动端关闭菜单
      this.mobileOpen = false
    },

    // ========== 权限过滤方法 ==========

    /**
     * 根据用户权限过滤导航菜单
     * 基于 permission-rules.js 中的配置进行过滤
     */
    filterNavByPermission() {
      // 保存原始配置（用于调试或重新过滤）
      if (!this._originalNavGroups) {
        this._originalNavGroups = JSON.parse(JSON.stringify(this.navGroups))
      }

      // 过滤导航分组
      this.navGroups = this._originalNavGroups
        .map(group => {
          // 深拷贝分组对象
          const filteredGroup = { ...group }

          // 单项菜单（如运营仪表盘）
          if (group.type === 'single') {
            // 检查该菜单是否有权限
            if (!hasMenuAccess(group.id)) {
              return null // 无权限，过滤掉
            }
            return filteredGroup
          }

          // 分组菜单（含子菜单）
          if (group.items && group.items.length > 0) {
            // 过滤子菜单项
            filteredGroup.items = group.items.filter(item => {
              const menuId = `${group.id}.${item.id}`
              return hasMenuAccess(menuId)
            })

            // 如果子菜单全部被过滤，则隐藏整个分组
            if (filteredGroup.items.length === 0) {
              return null
            }
          }

          return filteredGroup
        })
        .filter(group => group !== null) // 移除被过滤的分组

      // 更新展开的分组（移除不存在的分组）
      const validGroupIds = this.navGroups.map(g => g.id)
      this.expandedGroups = this.expandedGroups.filter(id => validGroupIds.includes(id))
    },

    /**
     * 检查指定菜单是否有访问权限
     * @param {string} menuId - 菜单ID（如 'pending-center.consumption-review'）
     * @returns {boolean}
     */
    hasMenuAccess(menuId) {
      return hasMenuAccess(menuId)
    }
  }
}

export default sidebarNav
