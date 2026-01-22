/**
 * 导航配置
 * 
 * 定义管理后台的导航菜单结构
 * 
 * @file public/admin/js/configs/navigation.js
 * @version 1.0.0
 * @date 2026-01-23
 */

const NavigationConfig = {
  modules: [
    {
      id: 'dashboard',
      label: '仪表盘',
      icon: 'bi-speedometer2',
      path: '/admin/dashboard.html'
    },
    {
      id: 'users',
      label: '用户管理',
      icon: 'bi-people',
      path: '/admin/user-management.html',
      children: [
        { id: 'user-list', label: '用户列表', icon: 'bi-person-lines-fill' },
        { id: 'user-roles', label: '用户角色', icon: 'bi-person-badge' },
        { id: 'user-permissions', label: '用户权限', icon: 'bi-shield-check' },
        { id: 'user-stats', label: '用户统计', icon: 'bi-graph-up' }
      ]
    },
    {
      id: 'assets',
      label: '资产管理',
      icon: 'bi-coin',
      path: '/admin/asset-management.html',
      children: [
        { id: 'material-types', label: '材料类型', icon: 'bi-tags' },
        { id: 'material-accounts', label: '材料账户', icon: 'bi-wallet2' },
        { id: 'material-transactions', label: '材料交易', icon: 'bi-arrow-left-right' },
        { id: 'item-instances', label: '物品实例', icon: 'bi-box' },
        { id: 'virtual-accounts', label: '虚拟账户', icon: 'bi-credit-card' },
        { id: 'virtual-transactions', label: '虚拟交易', icon: 'bi-currency-exchange' },
        { id: 'asset-stats', label: '资产统计', icon: 'bi-pie-chart' }
      ]
    },
    {
      id: 'lottery',
      label: '抽奖管理',
      icon: 'bi-gift',
      path: '/admin/lottery-management.html',
      children: [
        { id: 'prizes', label: '奖品管理', icon: 'bi-trophy' },
        { id: 'lottery-quota', label: '抽奖配额', icon: 'bi-sliders' },
        { id: 'lottery-strategy', label: '抽奖策略', icon: 'bi-gear' },
        { id: 'lottery-metrics', label: '抽奖统计', icon: 'bi-bar-chart' },
        { id: 'redemption-codes', label: '兑换码', icon: 'bi-qr-code' }
      ]
    },
    {
      id: 'exchange',
      label: '兑换市场',
      icon: 'bi-shop-window',
      path: '/admin/exchange-market.html',
      children: [
        { id: 'items', label: '商品管理', icon: 'bi-box-seam' },
        { id: 'orders', label: '订单管理', icon: 'bi-receipt' },
        { id: 'stats', label: '市场统计', icon: 'bi-graph-up-arrow' }
      ]
    },
    {
      id: 'trade',
      label: '交易管理',
      icon: 'bi-cart3',
      path: '/admin/trade-management.html',
      children: [
        { id: 'c2c-orders', label: 'C2C订单', icon: 'bi-people' },
        { id: 'listing-stats', label: '上架统计', icon: 'bi-bar-chart-line' },
        { id: 'exchange-orders', label: '兑换订单', icon: 'bi-arrow-repeat' }
      ]
    },
    {
      id: 'finance',
      label: '财务管理',
      icon: 'bi-cash-stack',
      path: '/admin/finance-management.html',
      children: [
        { id: 'consumption', label: '消费记录', icon: 'bi-receipt-cutoff' },
        { id: 'debt', label: '债务管理', icon: 'bi-credit-card-2-back' },
        { id: 'diamond', label: '钻石账户', icon: 'bi-gem' },
        { id: 'redemption', label: '兑换订单', icon: 'bi-arrow-repeat' }
      ]
    },
    {
      id: 'stores',
      label: '店铺管理',
      icon: 'bi-shop',
      path: '/admin/store-management.html',
      children: [
        { id: 'store-list', label: '店铺列表', icon: 'bi-building' },
        { id: 'store-staff', label: '店铺员工', icon: 'bi-person-workspace' }
      ]
    },
    {
      id: 'content',
      label: '内容管理',
      icon: 'bi-file-earmark-text',
      path: '/admin/content-management.html',
      children: [
        { id: 'announcements', label: '公告管理', icon: 'bi-megaphone' },
        { id: 'notifications', label: '通知管理', icon: 'bi-bell' },
        { id: 'popup-banners', label: '弹窗Banner', icon: 'bi-window' },
        { id: 'image-resources', label: '图片资源', icon: 'bi-image' }
      ]
    },
    {
      id: 'system',
      label: '系统设置',
      icon: 'bi-gear',
      path: '/admin/system-settings.html',
      children: [
        { id: 'settings', label: '系统设置', icon: 'bi-sliders' },
        { id: 'roles', label: '角色管理', icon: 'bi-shield-lock' },
        { id: 'audit-logs', label: '审计日志', icon: 'bi-journal-text' },
        { id: 'dict-management', label: '字典管理', icon: 'bi-book' }
      ]
    }
  ],
  
  /**
   * 获取当前模块
   * @param {string} path - 当前路径
   * @returns {Object|null} 当前模块配置
   */
  getCurrentModule(path = window.location.pathname) {
    return this.modules.find(m => path.includes(m.path?.replace('.html', ''))) || null
  },
  
  /**
   * 获取当前子模块
   * @param {string} moduleId - 模块 ID
   * @param {string} childId - 子模块 ID
   * @returns {Object|null} 子模块配置
   */
  getChild(moduleId, childId) {
    const module = this.modules.find(m => m.id === moduleId)
    return module?.children?.find(c => c.id === childId) || null
  },
  
  /**
   * 获取模块的面包屑
   * @param {string} moduleId - 模块 ID
   * @param {string} childId - 子模块 ID（可选）
   * @returns {Array} 面包屑数组
   */
  getBreadcrumb(moduleId, childId = null) {
    const breadcrumb = [{ label: '首页', path: '/admin/dashboard.html', icon: 'bi-house' }]
    
    const module = this.modules.find(m => m.id === moduleId)
    if (module) {
      breadcrumb.push({ 
        label: module.label, 
        path: module.path, 
        icon: module.icon 
      })
      
      if (childId && module.children) {
        const child = module.children.find(c => c.id === childId)
        if (child) {
          breadcrumb.push({ 
            label: child.label, 
            path: null, 
            icon: child.icon 
          })
        }
      }
    }
    
    return breadcrumb
  },
  
  /**
   * 获取所有模块（扁平化）
   * @returns {Array} 所有模块和子模块的扁平数组
   */
  getAllFlat() {
    const flat = []
    
    this.modules.forEach(module => {
      flat.push({
        id: module.id,
        label: module.label,
        icon: module.icon,
        path: module.path,
        parent: null
      })
      
      if (module.children) {
        module.children.forEach(child => {
          flat.push({
            id: child.id,
            label: child.label,
            icon: child.icon,
            path: module.path,
            parent: module.id
          })
        })
      }
    })
    
    return flat
  },
  
  /**
   * 搜索模块
   * @param {string} keyword - 搜索关键词
   * @returns {Array} 匹配的模块列表
   */
  search(keyword) {
    if (!keyword) return []
    
    const lowerKeyword = keyword.toLowerCase()
    const results = []
    
    this.modules.forEach(module => {
      if (module.label.toLowerCase().includes(lowerKeyword)) {
        results.push({
          ...module,
          type: 'module'
        })
      }
      
      if (module.children) {
        module.children.forEach(child => {
          if (child.label.toLowerCase().includes(lowerKeyword)) {
            results.push({
              ...child,
              path: module.path,
              parentLabel: module.label,
              type: 'child'
            })
          }
        })
      }
    })
    
    return results
  }
}

// 导出到全局
window.NavigationConfig = NavigationConfig

console.log('✅ NavigationConfig 导航配置已加载')

