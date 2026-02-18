/**
 * 侧边栏导航组件
 * @description 管理侧边栏导航的展开/折叠和菜单状态，支持基于 role_level 的权限过滤
 * @version 2.0.0
 * @date 2026-02-01
 * @changelog 2.0.0 - 重构导航结构：待处理中心置顶、风控中心分组、资产交易合并
 */

import { hasMenuAccess, getUserRoleLevel } from '../../config/permission-rules.js'
import { API_PREFIX, request, getToken } from '../../api/base.js'
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
    // P2-3: 默认展开的子分组（三级菜单）
    expandedSubGroups: [],
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
    // 兑换核销待处理数量
    redemptionPendingCount: 0,

    // ========== P0-5: 健康度指示灯 ==========
    healthStatus: 'loading', // 'healthy' | 'warning' | 'critical' | 'loading'
    healthScore: 0,

    // 用户权限等级（用于权限过滤）
    userRoleLevel: 0,

    // 原始导航配置 - 过滤前的完整配置
    _originalNavGroups: null,

    // 导航配置（已按运营优化方案重构 - 8组）
    navGroups: [
      // 1️⃣ 待处理中心 - 置顶最高优先级（补充兑换核销、用户反馈）
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
            id: 'redemption-mgmt',
            name: '兑换核销管理',
            url: '/admin/redemption-management.html',
            badgeKey: 'redemptionPendingCount'
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
          },
          {
            id: 'feedback-mgmt',
            name: '用户反馈处理',
            url: '/admin/feedback-management.html'
          }
        ]
      },

      // 2️⃣ 运营仪表盘 - 第二位
      {
        id: 'dashboard',
        name: '运营仪表盘',
        icon: '📊',
        type: 'single',
        url: '/admin/dashboard-panel.html'
      },

      // 3️⃣ 抽奖运营 - 运营型命名（数据看板、活动运营、策略管理、批量工具、抽奖干预管理）
      {
        id: 'lottery-ops',
        name: '抽奖运营',
        icon: '🎰',
        items: [
          {
            id: 'lottery-monitor',
            name: '📊 数据看板',
            url: '/admin/lottery-management.html?page=lottery-metrics',
            badge: 'live'
          },
          {
            id: 'lottery-activity',
            name: '🎁 活动运营',
            url: '/admin/lottery-management.html?page=campaigns'
          },
          {
            id: 'lottery-strategy',
            name: '⚙️ 策略管理',
            url: '/admin/lottery-management.html?page=lottery-strategy'
          },
          {
            id: 'lottery-tools',
            name: '⚡ 批量工具',
            url: '/admin/lottery-management.html?page=batch-operations'
          },
          {
            id: 'lottery-presets',
            name: '🎯 抽奖干预管理',
            url: '/admin/presets.html'
          },
          {
            id: 'material-conversion',
            name: '🔄 材料转换管理',
            url: '/admin/material-conversion.html'
          }
        ]
      },

      // 4️⃣ 资产交易 - 合并原「资产中心」和「市场交易」（孤儿冻结移到末尾）
      {
        id: 'asset-trade',
        name: '资产交易',
        icon: '💎',
        items: [
          { id: 'asset-mgmt', name: '资产管理', url: '/admin/asset-management.html' },
          { id: 'asset-adj', name: '资产调整', url: '/admin/asset-adjustment.html' },
          { id: 'exchange', name: '兑换市场', url: '/admin/exchange-market.html' },
          { id: 'trade', name: 'C2C交易', url: '/admin/trade-management.html' },
          { id: 'bid-mgmt', name: '竞价管理', url: '/admin/bid-management.html' },
          { id: 'orphan-frozen', name: '孤儿冻结清理', url: '/admin/orphan-frozen.html' }
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

      // 6️⃣ 内容运营 - 🆕新增分组（挂载已有的 content-management 和 message-center）
      {
        id: 'content-ops',
        name: '内容运营',
        icon: '📢',
        items: [
          { id: 'content-mgmt', name: '公告弹窗管理', url: '/admin/content-management.html' },
          { id: 'message-center', name: '消息中心', url: '/admin/message-center.html' }
        ]
      },

      // 7️⃣ 数据分析
      {
        id: 'analytics',
        name: '数据分析',
        icon: '📈',
        items: [
          { id: 'stats', name: '统计报表', url: '/admin/statistics.html' },
          { id: 'analytics', name: '运营分析', url: '/admin/analytics.html' },
          { id: 'user-data-query', name: '用户数据查询', url: '/admin/user-data-query.html' }
        ]
      },

      // 8️⃣ 系统设置 - 整合功能开关、物品模板、数据字典
      {
        id: 'system',
        name: '系统设置',
        icon: '⚙️',
        items: [
          { id: 'prize-config', name: '奖品配置', icon: '🎁', url: '/admin/prize-config.html' },
          { id: 'ops-rules', name: '运营规则', icon: '📊', url: '/admin/ops-rules.html' },
          { id: 'feature-flags', name: '功能开关', icon: '🔀', url: '/admin/feature-flags.html' },
          { id: 'item-templates', name: '物品模板', icon: '📦', url: '/admin/item-templates.html' },
          { id: 'dict-mgmt', name: '数据字典', icon: '📖', url: '/admin/dict-management.html' },
          { id: 'sys-maintain', name: '系统维护', icon: '🔧', url: '/admin/sys-maintain.html' }
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

      // P2-3: 从 localStorage 恢复展开的子分组
      const savedSubGroups = localStorage.getItem('sidebar_expanded_subgroups')
      if (savedSubGroups) {
        try {
          this.expandedSubGroups = JSON.parse(savedSubGroups)
        } catch (e) {
          logger.warn('恢复侧边栏子分组状态失败', e)
        }
      }

      // 根据当前 URL 高亮对应菜单并展开分组
      this.highlightCurrentPage()

      // 监听 Tab 打开/切换事件，更新菜单高亮状态
      this._openTabHandler = e => this.setActiveItem(e.detail.id, e.detail.url)
      window.addEventListener('open-tab', this._openTabHandler)

      // 监听 Tab 切换事件
      this._switchTabHandler = e => this.setActiveItem(e.detail.id, e.detail.url)
      window.addEventListener('switch-tab', this._switchTabHandler)

      // 从 localStorage 恢复当前激活的 Tab 状态
      this.restoreActiveItemFromTabs()

      // 获取所有徽标数量（统一API）
      this.fetchAllBadgeCounts()

      // P0-5: 获取健康度状态
      this.fetchHealthStatus()

      // 每5分钟刷新一次徽标数量和健康度
      this._badgeInterval = setInterval(
        () => {
          this.fetchAllBadgeCounts()
          this.fetchHealthStatus()
        },
        5 * 60 * 1000
      )
    },

    /**
     * 清理事件监听器和定时器
     */
    destroy() {
      if (this._openTabHandler) {
        window.removeEventListener('open-tab', this._openTabHandler)
      }
      if (this._switchTabHandler) {
        window.removeEventListener('switch-tab', this._switchTabHandler)
      }
      if (this._badgeInterval) {
        clearInterval(this._badgeInterval)
      }
      logger.debug('[SidebarNav] 事件监听器和定时器已清理')
    },

    /**
     * P0-5: 获取健康度状态
     */
    async fetchHealthStatus() {
      try {
        if (!getToken()) return

        const data = await request({ url: `${API_PREFIX}/console/dashboard/business-health` })
        if (data.success && data.data) {
          this.healthScore = data.data.score || 0
          this.healthStatus = data.data.status || 'normal'
          
          // 将 'normal' 映射为 'healthy'
          if (this.healthStatus === 'normal') {
            this.healthStatus = 'healthy'
          }
          
          logger.debug('[SidebarNav] 健康度状态已更新', {
            score: this.healthScore,
            status: this.healthStatus
          })
        }
      } catch (error) {
        logger.warn('获取健康度状态失败:', error.message)
        // 降级：基于徽标数量计算健康度
        this.calculateLocalHealthStatus()
      }
    },

    /**
     * 基于本地数据计算健康度状态（降级方案）
     */
    calculateLocalHealthStatus() {
      const totalPending = this.totalPendingCount
      
      if (totalPending > 50) {
        this.healthStatus = 'critical'
        this.healthScore = Math.max(0, 100 - totalPending)
      } else if (totalPending > 20) {
        this.healthStatus = 'warning'
        this.healthScore = Math.max(30, 100 - totalPending * 1.5)
      } else {
        this.healthStatus = 'healthy'
        this.healthScore = Math.max(70, 100 - totalPending * 2)
      }
    },

    /**
     * P0-5: 获取健康度指示灯CSS类
     */
    getHealthIndicatorClass() {
      const classes = {
        healthy: 'bg-green-500',
        warning: 'bg-yellow-500 animate-pulse',
        critical: 'bg-red-500 animate-pulse',
        loading: 'bg-gray-400'
      }
      return classes[this.healthStatus] || 'bg-gray-400'
    },

    /**
     * 获取所有徽标数量（调用统一徽标API）
     */
    async fetchAllBadgeCounts() {
      try {
        if (!getToken()) return

        const data = await request({ url: `${API_PREFIX}/console/nav/badges` })
        if (data.success && data.data) {
          // 直接使用后端字段名
          this.totalPendingCount = data.data.total || 0
          this.consumptionPendingCount = data.data.badges?.consumption || 0
          this.customerPendingCount = data.data.badges?.customer_service || 0
          this.pendingAlertCount = data.data.badges?.risk_alert || 0
          this.lotteryAlertCount = data.data.badges?.lottery_alert || 0
          this.redemptionPendingCount = data.data.badges?.redemption || 0

          logger.debug('[SidebarNav] 徽标数量已更新', {
            total: this.totalPendingCount,
            consumption: this.consumptionPendingCount,
            customer: this.customerPendingCount,
            risk: this.pendingAlertCount,
            lottery: this.lotteryAlertCount
          })
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
        if (!getToken()) return

        const data = await request({
          url: `${API_PREFIX}/shop/risk/alerts`,
          params: { status: 'pending', page_size: 1 }
        })
        if (data.success && data.data) {
          this.pendingAlertCount = data.data.total || 0
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
        if (!getToken()) return

        const data = await request({
          url: `${API_PREFIX}/console/lottery-realtime/alerts`,
          params: { status: 'active', page_size: 1 }
        })
        if (data.success && data.data) {
          // 从 summary 获取 danger + warning 数量
          const summary = data.data.summary || {}
          this.lotteryAlertCount = (summary.danger || 0) + (summary.warning || 0)
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
    setActiveItem(itemId, _url) {
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
     * P2-3: 切换子分组展开/折叠（三级菜单）
     * @param {string} subGroupId - 子分组ID
     */
    toggleSubGroup(subGroupId) {
      const index = this.expandedSubGroups.indexOf(subGroupId)
      if (index > -1) {
        this.expandedSubGroups.splice(index, 1)
      } else {
        this.expandedSubGroups.push(subGroupId)
      }
      localStorage.setItem('sidebar_expanded_subgroups', JSON.stringify(this.expandedSubGroups))
    },

    /**
     * P2-3: 判断子分组是否展开
     * @param {string} subGroupId - 子分组ID
     * @returns {boolean}
     */
    isSubGroupExpanded(subGroupId) {
      return this.expandedSubGroups.includes(subGroupId)
    },

    /**
     * 根据当前 URL 高亮菜单（支持三级菜单）
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
            // P2-3: 处理子分组（三级菜单）
            if (item.subItems) {
              for (const subItem of item.subItems) {
                if (subItem.url && currentPath.includes(subItem.url.split('?')[0])) {
                  // 展开对应分组
                  if (!this.expandedGroups.includes(group.id)) {
                    this.expandedGroups.push(group.id)
                  }
                  // 展开对应子分组
                  if (!this.expandedSubGroups.includes(item.id)) {
                    this.expandedSubGroups.push(item.id)
                  }
                  return
                }
              }
            } else if (item.url && currentPath.includes(item.url.split('?')[0])) {
              // 展开对应分组
              if (!this.expandedGroups.includes(group.id)) {
                this.expandedGroups.push(group.id)
              }
              return
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
      return url && currentPath.includes(url.split('?')[0])
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

          // 三级分组菜单（如系统设置）- 注：系统设置已改为二级菜单
          if (group.subGroups && group.subGroups.length > 0) {
            if (!hasMenuAccess(group.id)) {
              return null
            }
            
            filteredGroup.subGroups = group.subGroups
              .map(subGroup => {
                const filteredSubGroup = { ...subGroup }
                
                // 过滤子分组中的菜单项
                if (subGroup.items && subGroup.items.length > 0) {
                  filteredSubGroup.items = subGroup.items.filter(item => {
                    const menuId = `${group.id}.${subGroup.id}.${item.id}`
                    return hasMenuAccess(menuId)
                  })
                  
                  // 如果子分组的所有项都被过滤，则隐藏整个子分组
                  if (filteredSubGroup.items.length === 0) {
                    return null
                  }
                }
                return filteredSubGroup
              })
              .filter(subGroup => subGroup !== null)

            // 如果所有子分组都被过滤，则隐藏整个分组
            if (filteredGroup.subGroups.length === 0) {
              return null
            }
            return filteredGroup
          }

          // 分组菜单（含子菜单）
          if (group.items && group.items.length > 0) {
            // 过滤子菜单项
            filteredGroup.items = group.items
              .map(item => {
                // P2-3: 处理子分组（三级菜单）
                if (item.subItems && item.subItems.length > 0) {
                  const filteredItem = { ...item }
                  filteredItem.subItems = item.subItems.filter(subItem => {
                    const menuId = `${group.id}.${item.id}.${subItem.id}`
                    return hasMenuAccess(menuId)
                  })
                  // 如果子项全部被过滤，则隐藏整个子分组
                  if (filteredItem.subItems.length === 0) {
                    return null
                  }
                  return filteredItem
                }
                
                // 普通菜单项
                const menuId = `${group.id}.${item.id}`
                return hasMenuAccess(menuId) ? item : null
              })
              .filter(item => item !== null)

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
      
      // P2-3: 更新展开的子分组（移除不存在的子分组）
      const validSubGroupIds = [
        ...this.navGroups.flatMap(g => 
          (g.items || []).filter(i => i.subItems).map(i => i.id)
        ),
        ...this.navGroups.flatMap(g => 
          (g.subGroups || []).map(sg => sg.id)
        )
      ]
      this.expandedSubGroups = this.expandedSubGroups.filter(id => validSubGroupIds.includes(id))
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
