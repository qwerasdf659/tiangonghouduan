/**
 * 导航配置系统 - 统一管理后台导航结构
 * 
 * @file public/admin/js/core/navigation-config.js
 * @description 定义后台管理系统的导航结构、权限配置和路由映射
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * 功能说明：
 * - 统一定义导航菜单结构
 * - 支持多级菜单和权限控制
 * - 提供导航相关的工具方法
 * - 支持动态导航渲染
 */

// ==================== 导航配置 ====================

/**
 * 主导航配置
 * @type {Array<NavigationItem>}
 */
const NAVIGATION_CONFIG = [
  // 首页/仪表盘
  {
    id: 'dashboard',
    label: '仪表盘',
    icon: 'bi-speedometer2',
    path: '/admin/dashboard.html',
    order: 0,
    permission: 'admin.dashboard'
  },

  // 用户管理中心
  {
    id: 'user-management',
    label: '用户管理',
    icon: 'bi-people',
    path: '/admin/user-management.html',
    order: 10,
    permission: 'admin.user',
    children: [
      { id: 'user-list', label: '用户列表', icon: 'bi-person-lines-fill' },
      { id: 'role-list', label: '角色管理', icon: 'bi-shield' },
      { id: 'permission-list', label: '权限管理', icon: 'bi-key' },
      { id: 'user-roles', label: '角色分配', icon: 'bi-person-badge' },
      { id: 'user-stats', label: '用户统计', icon: 'bi-graph-up' }
    ]
  },

  // 资产管理中心
  {
    id: 'asset-management',
    label: '资产管理',
    icon: 'bi-wallet2',
    path: '/admin/asset-management.html',
    order: 20,
    permission: 'admin.asset',
    children: [
      { id: 'material-types', label: '材料资产类型', icon: 'bi-archive' },
      { id: 'material-accounts', label: '材料账户', icon: 'bi-wallet2' },
      { id: 'material-transactions', label: '材料交易', icon: 'bi-arrow-left-right' },
      { id: 'item-instances', label: '物品实例', icon: 'bi-collection' },
      { id: 'item-templates', label: '物品模板', icon: 'bi-box-seam', path: '/admin/item-templates.html' },
      { id: 'material-conversion', label: '材料转换规则', icon: 'bi-shuffle', path: '/admin/material-conversion-rules.html' },
      { id: 'asset-adjustment', label: '资产调整', icon: 'bi-plus-slash-minus', path: '/admin/asset-adjustment.html' },
      { id: 'virtual-accounts', label: '虚拟账户', icon: 'bi-coin' },
      { id: 'virtual-transactions', label: '虚拟交易', icon: 'bi-receipt-cutoff' },
      { id: 'asset-stats', label: '资产统计', icon: 'bi-graph-up' }
    ]
  },

  // 内容管理中心
  {
    id: 'content-management',
    label: '内容管理',
    icon: 'bi-file-earmark-text',
    path: '/admin/content-management.html',
    order: 30,
    permission: 'admin.content',
    children: [
      { id: 'announcements', label: '公告管理', icon: 'bi-megaphone' },
      { id: 'notifications', label: '通知管理', icon: 'bi-bell' },
      { id: 'popup-banners', label: '弹窗横幅', icon: 'bi-images' },
      { id: 'image-resources', label: '图片资源', icon: 'bi-file-image' }
    ]
  },

  // 抽奖管理（整合页面）
  {
    id: 'lottery-management',
    label: '抽奖管理',
    icon: 'bi-gift',
    path: '/admin/lottery-management.html',
    order: 40,
    permission: 'admin.lottery',
    children: [
      { id: 'campaigns', label: '活动管理', icon: 'bi-calendar-event' },
      { id: 'prizes', label: '奖品管理', icon: 'bi-trophy' },
      { id: 'lottery-strategy', label: '策略配置', icon: 'bi-gear' },
      { id: 'lottery-quota', label: '配额管理', icon: 'bi-bar-chart-steps' },
      { id: 'lottery-metrics', label: '抽奖指标', icon: 'bi-speedometer' }
    ]
  },

  // 门店管理（整合页面）
  {
    id: 'store-management',
    label: '门店管理',
    icon: 'bi-shop',
    path: '/admin/store-management.html',
    order: 60,
    permission: 'admin.store',
    children: [
      { id: 'stores', label: '门店列表', icon: 'bi-shop' },
      { id: 'staff', label: '员工管理', icon: 'bi-people' },
      { id: 'store-stats', label: '门店统计', icon: 'bi-graph-up' }
    ]
  },

  // 兑换市场（整合页面）
  {
    id: 'exchange-market',
    label: '兑换市场',
    icon: 'bi-shop',
    path: '/admin/exchange-market.html',
    order: 65,
    permission: 'admin.market',
    children: [
      { id: 'items', label: '商品管理', icon: 'bi-box-seam' },
      { id: 'orders', label: '订单管理', icon: 'bi-receipt' },
      { id: 'stats', label: '统计分析', icon: 'bi-graph-up' }
    ]
  },

  // 交易管理（整合页面）
  {
    id: 'trade-management',
    label: '交易管理',
    icon: 'bi-arrow-left-right',
    path: '/admin/trade-management.html',
    order: 70,
    permission: 'admin.market',
    children: [
      { id: 'trade-orders', label: 'C2C交易订单', icon: 'bi-receipt' },
      { id: 'marketplace-stats', label: '上架统计', icon: 'bi-bar-chart' },
      { id: 'redemption-orders', label: '兑换订单', icon: 'bi-arrow-repeat' }
    ]
  },

  // 财务管理（整合页面）
  {
    id: 'finance-management',
    label: '财务管理',
    icon: 'bi-currency-dollar',
    path: '/admin/finance-management.html',
    order: 80,
    permission: 'admin.finance',
    children: [
      { id: 'consumption', label: '消费记录', icon: 'bi-receipt' },
      { id: 'diamond-accounts', label: '钻石账户', icon: 'bi-gem' },
      { id: 'merchant-points', label: '商户积分', icon: 'bi-coin' },
      { id: 'debt-management', label: '债务管理', icon: 'bi-file-earmark-minus' },
      { id: 'campaign-budget', label: '活动预算', icon: 'bi-piggy-bank' }
    ]
  },

  // 数据统计
  {
    id: 'analytics',
    label: '数据统计',
    icon: 'bi-bar-chart-line',
    path: null,
    order: 90,
    permission: 'admin.analytics',
    children: [
      { id: 'statistics', label: '统计报表', icon: 'bi-file-earmark-bar-graph', path: '/admin/statistics.html' },
      { id: 'charts', label: '图表展示', icon: 'bi-graph-up', path: '/admin/charts.html' },
      { id: 'analytics-detail', label: '运营分析', icon: 'bi-clipboard-data', path: '/admin/analytics.html' }
    ]
  },

  // 系统设置（整合页面）
  {
    id: 'system-settings',
    label: '系统设置',
    icon: 'bi-gear',
    path: '/admin/system-settings.html',
    order: 100,
    permission: 'admin.system',
    children: [
      { id: 'system-config', label: '系统配置', icon: 'bi-gear' },
      { id: 'dict-management', label: '字典管理', icon: 'bi-book' },
      { id: 'audit-logs', label: '审计日志', icon: 'bi-journal-text' },
      { id: 'pricing-config', label: '定价配置', icon: 'bi-currency-dollar' },
      { id: 'presets', label: '预设配置', icon: 'bi-sliders', path: '/admin/presets.html' },
      { id: 'config-tools', label: '配置工具', icon: 'bi-tools', path: '/admin/config-tools.html' }
    ]
  },

  // 活动配置
  {
    id: 'activity-config',
    label: '活动配置',
    icon: 'bi-calendar-event',
    path: null,
    order: 45,
    permission: 'admin.lottery',
    children: [
      { id: 'activity-conditions', label: '活动条件', icon: 'bi-list-check', path: '/admin/activity-conditions.html' }
    ]
  },

  // 风控管理
  {
    id: 'risk',
    label: '风控管理',
    icon: 'bi-shield-exclamation',
    path: null,
    order: 110,
    permission: 'admin.risk',
    children: [
      { id: 'risk-alerts', label: '风险告警', icon: 'bi-exclamation-triangle', path: '/admin/risk-alerts.html' },
      { id: 'orphan-frozen', label: '冻结资产', icon: 'bi-snow', path: '/admin/orphan-frozen.html' }
    ]
  },

  // 客服管理
  {
    id: 'customer-service',
    label: '客服中心',
    icon: 'bi-headset',
    path: null,
    order: 120,
    permission: 'admin.service',
    children: [
      { id: 'customer-service', label: '在线客服', icon: 'bi-chat-dots', path: '/admin/customer-service.html' },
      { id: 'sessions', label: '会话管理', icon: 'bi-chat-square-text', path: '/admin/sessions.html' },
      { id: 'feedbacks', label: '用户反馈', icon: 'bi-chat-left-text', path: '/admin/feedbacks.html' }
    ]
  }
]

// ==================== 导航工具方法 ====================

/**
 * 导航配置管理器
 */
const NavigationManager = {
  /**
   * 获取完整导航配置
   * @returns {Array<NavigationItem>}
   */
  getConfig() {
    return NAVIGATION_CONFIG.sort((a, b) => a.order - b.order)
  },

  /**
   * 根据ID查找导航项
   * @param {string} id - 导航项ID
   * @returns {NavigationItem|null}
   */
  findById(id) {
    for (const item of NAVIGATION_CONFIG) {
      if (item.id === id) return item
      if (item.children) {
        const child = item.children.find(c => c.id === id)
        if (child) return { ...child, parent: item }
      }
    }
    return null
  },

  /**
   * 根据路径查找导航项
   * @param {string} path - 页面路径
   * @returns {NavigationItem|null}
   */
  findByPath(path) {
    const normalizedPath = path.replace(/\?.*$/, '')

    for (const item of NAVIGATION_CONFIG) {
      if (item.path === normalizedPath) return item
      if (item.children) {
        const child = item.children.find(c => c.path === normalizedPath)
        if (child) return { ...child, parent: item }
      }
    }
    return null
  },

  /**
   * 获取面包屑导航
   * @param {string} path - 当前页面路径
   * @returns {Array<{label: string, path: string|null}>}
   */
  getBreadcrumb(path) {
    const breadcrumb = [{ label: '首页', path: '/admin/dashboard.html' }]
    const item = this.findByPath(path)

    if (item) {
      if (item.parent) {
        breadcrumb.push({ label: item.parent.label, path: item.parent.path })
      }
      breadcrumb.push({ label: item.label, path: null })
    }

    return breadcrumb
  },

  /**
   * 检查用户是否有权限访问
   * @param {string} permission - 权限标识
   * @param {Array<string>} userPermissions - 用户权限列表
   * @returns {boolean}
   */
  hasPermission(permission, userPermissions = []) {
    if (!permission) return true
    if (userPermissions.includes('admin.*')) return true
    return userPermissions.includes(permission)
  },

  /**
   * 根据用户权限过滤导航
   * @param {Array<string>} userPermissions - 用户权限列表
   * @returns {Array<NavigationItem>}
   */
  filterByPermission(userPermissions) {
    return this.getConfig()
      .filter(item => this.hasPermission(item.permission, userPermissions))
      .map(item => {
        if (item.children) {
          return {
            ...item,
            children: item.children.filter(child =>
              this.hasPermission(child.permission || item.permission, userPermissions)
            )
          }
        }
        return item
      })
      .filter(item => !item.children || item.children.length > 0)
  },

  /**
   * 获取当前页面的子页面配置
   * @param {string} parentId - 父级导航ID
   * @returns {Array<{id: string, title: string, icon: string}>}
   */
  getSubPages(parentId) {
    const parent = this.findById(parentId)
    if (parent && parent.children) {
      return parent.children.map(child => ({
        id: child.id,
        title: child.label,
        icon: child.icon
      }))
    }
    return []
  },

  /**
   * 渲染侧边栏导航 HTML
   * @param {Array<string>} userPermissions - 用户权限列表
   * @param {string} currentPath - 当前页面路径
   * @returns {string}
   */
  renderSidebar(userPermissions = [], currentPath = '') {
    const filteredNav = this.filterByPermission(userPermissions)

    return filteredNav.map(item => {
      const isActive = item.path === currentPath ||
        (item.children && item.children.some(c => c.path === currentPath))

      if (item.children && item.children.length > 0) {
        const childrenHtml = item.children.map(child => {
          const childActive = child.path === currentPath
          return `
            <li class="nav-item">
              <a class="nav-link ${childActive ? 'active' : ''}" href="${child.path || '#'}">
                <i class="${child.icon} me-2"></i>
                ${child.label}
              </a>
            </li>
          `
        }).join('')

        return `
          <li class="nav-item">
            <a class="nav-link ${isActive ? '' : 'collapsed'}" href="#${item.id}-collapse" 
               data-bs-toggle="collapse" aria-expanded="${isActive}">
              <i class="${item.icon} me-2"></i>
              ${item.label}
              <i class="bi bi-chevron-down ms-auto"></i>
            </a>
            <ul class="nav collapse ${isActive ? 'show' : ''}" id="${item.id}-collapse">
              ${childrenHtml}
            </ul>
          </li>
        `
      }

      return `
        <li class="nav-item">
          <a class="nav-link ${isActive ? 'active' : ''}" href="${item.path || '#'}">
            <i class="${item.icon} me-2"></i>
            ${item.label}
          </a>
        </li>
      `
    }).join('')
  }
}

// ==================== 页面整合映射 ====================

/**
 * 旧页面到新整合页面的映射
 * 用于重定向和兼容处理
 */
const PAGE_CONSOLIDATION_MAP = {
  // 用户管理相关
  '/admin/users.html': '/admin/user-management.html?page=user-list',
  '/admin/user-hierarchy.html': '/admin/user-management.html?page=user-hierarchy',
  '/admin/roles.html': '/admin/user-management.html?page=role-list',
  '/admin/permissions.html': '/admin/user-management.html?page=permission-list',
  '/admin/user-roles.html': '/admin/user-management.html?page=user-roles',

  // 资产管理相关
  '/admin/material-asset-types.html': '/admin/asset-management.html?page=material-types',
  '/admin/material-balances.html': '/admin/asset-management.html?page=material-accounts',
  '/admin/material-transactions.html': '/admin/asset-management.html?page=material-transactions',
  '/admin/assets-portfolio.html': '/admin/asset-management.html?page=asset-stats',
  '/admin/item-instances.html': '/admin/asset-management.html?page=item-instances',
  '/admin/virtual-accounts.html': '/admin/asset-management.html?page=virtual-accounts',

  // 内容管理相关
  '/admin/announcements.html': '/admin/content-management.html?page=announcements',
  '/admin/notifications.html': '/admin/content-management.html?page=notifications',
  '/admin/popup-banners.html': '/admin/content-management.html?page=popup-banners',
  '/admin/image-resources.html': '/admin/content-management.html?page=image-resources',

  // 抽奖管理相关
  '/admin/campaigns.html': '/admin/lottery-management.html?page=campaigns',
  '/admin/prizes.html': '/admin/lottery-management.html?page=prizes',
  '/admin/lottery-strategy.html': '/admin/lottery-management.html?page=lottery-strategy',
  '/admin/lottery-quota.html': '/admin/lottery-management.html?page=lottery-quota',
  '/admin/lottery-metrics.html': '/admin/lottery-management.html?page=lottery-metrics',
  '/admin/tier-matrix.html': '/admin/lottery-management.html?page=lottery-strategy',
  '/admin/campaign-budget.html': '/admin/finance-management.html?page=campaign-budget',

  // 门店管理相关
  '/admin/stores.html': '/admin/store-management.html?page=stores',
  '/admin/store-staff.html': '/admin/store-management.html?page=staff',
  '/admin/merchant-points.html': '/admin/finance-management.html?page=merchant-points',

  // 兑换市场相关
  '/admin/exchange-market-items.html': '/admin/exchange-market.html?page=items',
  '/admin/exchange-market-orders.html': '/admin/exchange-market.html?page=orders',
  '/admin/exchange-market-stats.html': '/admin/exchange-market.html?page=stats',
  
  // 交易管理相关
  '/admin/trade-orders.html': '/admin/trade-management.html?page=trade-orders',
  '/admin/marketplace-stats.html': '/admin/trade-management.html?page=marketplace-stats',
  '/admin/redemption-orders.html': '/admin/trade-management.html?page=redemption-orders',

  // 财务管理相关
  '/admin/consumption.html': '/admin/finance-management.html?page=consumption',
  '/admin/diamond-accounts.html': '/admin/finance-management.html?page=diamond-accounts',
  '/admin/debt-management.html': '/admin/finance-management.html?page=debt-management',

  // 系统设置相关
  '/admin/settings.html': '/admin/system-settings.html?page=system-config',
  '/admin/system-config.html': '/admin/system-settings.html?page=system-config',
  '/admin/dict-management.html': '/admin/system-settings.html?page=dict-management',
  '/admin/audit-logs.html': '/admin/system-settings.html?page=audit-logs'
  // 注意: config-tools.html 作为独立页面保留，不需要重定向
}

/**
 * 处理页面重定向
 * @param {string} currentPath - 当前页面路径
 * @returns {string|null} - 需要重定向的目标路径，或 null
 */
function handlePageConsolidation(currentPath) {
  const normalizedPath = currentPath.split('?')[0]
  return PAGE_CONSOLIDATION_MAP[normalizedPath] || null
}

// ==================== 导出 ====================

// 如果在模块环境中
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NAVIGATION_CONFIG,
    NavigationManager,
    PAGE_CONSOLIDATION_MAP,
    handlePageConsolidation
  }
}

// 全局变量
window.NAVIGATION_CONFIG = NAVIGATION_CONFIG
window.NavigationManager = NavigationManager
window.PAGE_CONSOLIDATION_MAP = PAGE_CONSOLIDATION_MAP
window.handlePageConsolidation = handlePageConsolidation

console.log('✅ [NavigationConfig] 导航配置系统已加载')

