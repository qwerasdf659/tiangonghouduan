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

    // ========== P0-5: 健康度指示灯 ==========
    healthStatus: 'loading', // 'healthy' | 'warning' | 'critical' | 'loading'
    healthScore: 0,

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
          { id: 'orphan-frozen', name: '孤儿冻结清理', url: '/admin/orphan-frozen.html' },
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

      // 7️⃣ 系统设置 - 低频功能整合（P2-3/P3-1/P3-6: 三级分组+命名优化）
      {
        id: 'system',
        name: '系统设置',
        icon: '⚙️',
        // P2-3: 支持三级分组结构（决策4：系统设置三级分组）
        subGroups: [
          {
            // P3-6命名优化: 物品配置 → 奖品配置
            id: 'prize-config',
            name: '奖品配置',
            icon: '🎁',
            items: [
              { id: 'item-tpl', name: '物品模板', url: '/admin/item-templates.html' },
              { id: 'material-rules', name: '物料转换规则', url: '/admin/material-conversion-rules.html' },
              { id: 'assets-portfolio', name: '资产组合', url: '/admin/assets-portfolio.html' }
            ]
          },
          {
            // P3-6命名优化: 运营配置 → 运营规则
            id: 'ops-rules',
            name: '运营规则',
            icon: '📊',
            items: [
              { id: 'pricing', name: '定价配置', url: '/admin/pricing-config.html' },
              { id: 'feature-flags', name: '功能开关', url: '/admin/feature-flags.html' },
              { id: 'reminder-rules', name: '提醒规则', url: '/admin/reminder-rules.html' }
            ]
          },
          {
            id: 'sys-maintain',
            name: '系统维护',
            icon: '🔧',
            items: [
              { id: 'content', name: '内容管理', url: '/admin/content-management.html' },
              { id: 'dict', name: '字典管理', url: '/admin/dict-management.html' },
              { id: 'settings', name: '系统配置', url: '/admin/system-settings.html' },
              { id: 'sessions', name: '会话管理', url: '/admin/sessions.html' },
              { id: 'audit-logs', name: '操作审计', url: '/admin/audit-logs.html' },
              { id: 'config-tools', name: '高级工具', url: '/admin/config-tools.html' }
            ]
          }
        ]
      }
    ],

    /**
     * 初始化
     */
    init() {
      // ========== 权限过滤（优先执行）==========
      this.userRoleLevel = getUserRoleLevel()
      
      // 🔍 DEBUG: 打印权限调试信息（帮助诊断菜单不显示问题）
      const adminUser = localStorage.getItem('admin_user')
      const adminUserInfo = localStorage.getItem('admin_user_info')
      console.log('🔍 [SidebarNav DEBUG] ======= 权限调试信息 =======')
      console.log('🔍 admin_user 原始数据:', adminUser)
      console.log('🔍 admin_user_info 原始数据:', adminUserInfo)
      console.log('🔍 解析后的 role_level:', this.userRoleLevel)
      console.log('🔍 是否 >= 100 (管理员):', this.userRoleLevel >= 100)
      console.log('🔍 ================================================')
      
      this.filterNavByPermission()
      logger.debug(`[SidebarNav] 用户权限等级: ${this.userRoleLevel}，菜单已过滤`)
      
      // 🔍 DEBUG: 打印最终的 navGroups
      console.log('🔍 [最终菜单] navGroups 共', this.navGroups.length, '个分组:')
      this.navGroups.forEach((g, i) => {
        console.log(`🔍   ${i+1}. ${g.name} (${g.id}) - type=${g.type || 'group'}, items=${g.items?.length || 0}, subGroups=${g.subGroups?.length || 0}`)
      })
      const systemGroup = this.navGroups.find(g => g.id === 'system')
      console.log('🔍 [系统设置] 是否存在:', !!systemGroup, systemGroup ? `(subGroups: ${systemGroup.subGroups?.length})` : '')
      
      // 延迟检查 DOM 渲染
      setTimeout(() => {
        const navMenuItems = document.querySelectorAll('.sidebar-nav .nav-menu-item')
        const navGroups = document.querySelectorAll('.sidebar-nav .nav-group')
        const navGroups3Level = document.querySelectorAll('.sidebar-nav .nav-group-3level')
        const navSingles = document.querySelectorAll('.sidebar-nav .nav-single')
        console.log('🔍 [DOM检查] nav-menu-item 包装器数量:', navMenuItems.length)
        console.log('🔍 [DOM检查] nav-group 元素数量:', navGroups.length)
        console.log('🔍 [DOM检查] nav-group-3level 元素数量:', navGroups3Level.length)
        console.log('🔍 [DOM检查] nav-single 元素数量:', navSingles.length)
        
        // 检查三级分组是否被隐藏
        navGroups3Level.forEach((el, i) => {
          const computed = window.getComputedStyle(el)
          console.log(`🔍 [DOM检查] nav-group-3level[${i}]:`, {
            display: computed.display,
            visibility: computed.visibility,
            hidden: el.hidden,
            dataGroupId: el.getAttribute('data-group-id')
          })
        })
        
        // 检查系统设置
        const systemGroup = document.querySelector('.nav-group[data-group-id="system"]')
        console.log('🔍 [DOM检查] 系统设置DOM:', systemGroup || '未找到')
      }, 1000)

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

      // P0-5: 获取健康度状态
      this.fetchHealthStatus()

      // 每5分钟刷新一次徽标数量和健康度
      setInterval(
        () => {
          this.fetchAllBadgeCounts()
          this.fetchHealthStatus()
        },
        5 * 60 * 1000
      )
    },

    /**
     * P0-5: 获取健康度状态
     */
    async fetchHealthStatus() {
      try {
        const token = localStorage.getItem('admin_token')
        if (!token) return

        const response = await fetch('/api/v4/console/pending/health-score', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
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
                if (currentPath.includes(subItem.url.split('?')[0])) {
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

          // 三级分组菜单（如系统设置）
          if (group.subGroups && group.subGroups.length > 0) {
            // 🔍 DEBUG: 打印三级分组检查
            const groupAccess = hasMenuAccess(group.id)
            console.log(`🔍 [权限检查] 三级分组 "${group.name}" (${group.id}): hasAccess=${groupAccess}, 需要role_level>=100`)
            
            if (!groupAccess) {
              console.log(`🔍 [权限检查] ❌ 分组 "${group.name}" 被过滤（权限不足）`)
              return null
            }
            
            console.log(`🔍 [权限检查] 开始过滤 "${group.name}" 的子分组，共 ${group.subGroups.length} 个`)
            
            filteredGroup.subGroups = group.subGroups
              .map(subGroup => {
                const filteredSubGroup = { ...subGroup }
                console.log(`🔍 [子分组] 检查 "${subGroup.name}" (${subGroup.id})，共 ${subGroup.items?.length || 0} 项`)
                
                // 过滤子分组中的菜单项
                if (subGroup.items && subGroup.items.length > 0) {
                  filteredSubGroup.items = subGroup.items.filter(item => {
                    const menuId = `${group.id}.${subGroup.id}.${item.id}`
                    const access = hasMenuAccess(menuId)
                    console.log(`🔍   [菜单项] "${item.name}" (${menuId}): hasAccess=${access}`)
                    return access
                  })
                  console.log(`🔍 [子分组] "${subGroup.name}" 过滤后剩余 ${filteredSubGroup.items.length} 项`)
                  
                  // 如果子分组的所有项都被过滤，则隐藏整个子分组
                  if (filteredSubGroup.items.length === 0) {
                    console.log(`🔍 [子分组] ❌ "${subGroup.name}" 被移除（无可见项）`)
                    return null
                  }
                }
                return filteredSubGroup
              })
              .filter(subGroup => subGroup !== null)

            console.log(`🔍 [权限检查] "${group.name}" 过滤后剩余 ${filteredGroup.subGroups.length} 个子分组`)
            
            // 如果所有子分组都被过滤，则隐藏整个分组
            if (filteredGroup.subGroups.length === 0) {
              console.log(`🔍 [权限检查] ❌ 整个分组 "${group.name}" 被移除（无可见子分组）`)
              return null
            }
            console.log(`🔍 [权限检查] ✅ 分组 "${group.name}" 保留，包含子分组:`, filteredGroup.subGroups.map(s => s.name))
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
