/**
 * 权限规则配置（集中管理）
 *
 * @description 基于 role_level 的前端权限控制规则
 * @version 2.0.0
 * @date 2026-01-27
 * @updated 2026-01-27（与后端 shared/permission-constants.js 对齐）
 *
 * 权限等级说明（与后端一致）：
 * - role_level >= 100：管理员（admin）
 * - role_level >= 30：运营（ops）- 只读权限
 * - role_level >= 1：客服（customer_service）
 * - role_level = 0：普通用户（user）
 *
 * @see shared/permission-constants.js - 后端权限常量定义（唯一真相源）
 *
 * @example
 * import { PERMISSION_RULES, hasMenuAccess } from '@/config/permission-rules.js'
 */

import { logger } from '../utils/logger.js'

// ========== 权限等级阈值（与后端 PERMISSION_LEVELS 对齐） ==========

/**
 * 角色等级阈值定义
 * 注意：这些值必须与后端 shared/permission-constants.js 保持一致
 */
export const ROLE_LEVEL_THRESHOLDS = {
  /** 管理员权限（role_level >= 100） */
  ADMIN: 100,
  /** 运营权限（role_level >= 30，只读） */
  OPS: 30,
  /** 客服权限（role_level >= 1） */
  CUSTOMER_SERVICE: 1,
  /** 普通用户（无后台权限） */
  USER: 0
}

// ========== 菜单权限配置 ==========

/**
 * 菜单访问权限配置
 * key: 菜单ID（对应 sidebar-nav.js 中的 group.id 或 item.id）
 * value: { minLevel: 最低权限等级 }
 *
 * 规则：用户 role_level >= minLevel 才能访问该菜单
 * 注意：minLevel 值必须与后端 PERMISSION_LEVELS 对齐
 */
export const MENU_ACCESS_RULES = {
  // ========== 所有人可访问（role_level >= 0） ==========
  dashboard: { minLevel: 0, description: '运营仪表盘' },

  // ========== 待处理中心（role_level >= 1） ==========
  'pending-center': { minLevel: 1, description: '待处理中心（分组）' },
  'pending-center.consumption-review': { minLevel: 30, description: '消费记录审核' },
  'pending-center.customer-service': { minLevel: 1, description: '客服工作台' },
  'pending-center.risk-alerts': { minLevel: 30, description: '风控告警' },
  'pending-center.lottery-alerts': { minLevel: 30, description: '抽奖告警' },
  'pending-center.feedback-mgmt': { minLevel: 30, description: '用户反馈处理' },

  // ========== 抽奖运营（role_level >= 30） ==========
  'lottery-ops': { minLevel: 30, description: '抽奖运营（分组）' },
  'lottery-ops.lottery-monitoring': { minLevel: 30, description: '实时监控' },
  'lottery-ops.lottery-campaigns': { minLevel: 30, description: '活动管理' },
  'lottery-ops.lottery-prizes': { minLevel: 30, description: '奖品配置' },
  'lottery-ops.lottery-budget': { minLevel: 30, description: '预算控制' },
  'lottery-ops.lottery-strategy': { minLevel: 30, description: '策略配置' },
  'lottery-ops.lottery-presets': { minLevel: 30, description: '抽奖干预管理' },

  // ========== 资产交易（role_level >= 30） ==========
  'asset-trade': { minLevel: 30, description: '资产交易（分组）' },
  'asset-trade.asset-mgmt': { minLevel: 30, description: '资产管理' },
  'asset-trade.asset-adj': { minLevel: 30, description: '资产调整' },
  'asset-trade.orphan-frozen': { minLevel: 30, description: '孤儿冻结清理' },
  'asset-trade.exchange': { minLevel: 30, description: '兑换市场' },
  'asset-trade.trade': { minLevel: 30, description: 'C2C交易' },

  // ========== 用户门店（role_level >= 30） ==========
  users: { minLevel: 30, description: '用户门店（分组）' },
  'users.user-mgmt': { minLevel: 30, description: '用户管理' },
  'users.user-hierarchy': { minLevel: 30, description: '用户层级' },
  'users.stores': { minLevel: 30, description: '门店管理' },

  // ========== 数据分析（role_level >= 30） ==========
  analytics: { minLevel: 30, description: '数据分析（分组）' },
  'analytics.stats': { minLevel: 30, description: '统计报表' },
  'analytics.analytics': { minLevel: 30, description: '运营分析' },

  // ========== 系统设置（管理员专属 role_level >= 100） ==========
  // 改为二级菜单结构（每个子项指向一个Tab页面）
  system: { minLevel: 100, description: '系统设置（分组）' },
  'system.prize-config': { minLevel: 100, description: '奖品配置（Tab页面）' },
  'system.ops-rules': { minLevel: 100, description: '运营规则（Tab页面）' },
  'system.sys-maintain': { minLevel: 100, description: '系统维护（Tab页面）' }
}

// ========== 页面权限配置 ==========

/**
 * 页面访问权限配置
 * key: 页面URL路径（不含 /admin/ 前缀）
 * value: { minLevel: 最低权限等级, menuId: 对应菜单ID }
 * 注意：minLevel 值必须与后端 PERMISSION_LEVELS 对齐
 */
export const PAGE_ACCESS_RULES = {
  // ========== 所有人可访问（role_level >= 0） ==========
  'statistics.html': { minLevel: 0, menuId: 'dashboard' },

  // ========== 客服可访问（role_level >= 1） ==========
  'customer-service.html': { minLevel: 1, menuId: 'operations.customer' },

  // ========== 运营可访问（role_level >= 30，只读） ==========
  'finance-management.html': { minLevel: 30, menuId: 'operations.consumption' },
  'risk-alerts.html': { minLevel: 30, menuId: 'operations.risk' },
  'feedback-management.html': { minLevel: 30, menuId: 'operations.feedback' },

  'lottery-management.html': { minLevel: 30, menuId: 'lottery.campaigns' },
  'presets.html': { minLevel: 30, menuId: 'lottery.presets' },

  'asset-management.html': { minLevel: 30, menuId: 'assets.asset-mgmt' },
  'asset-adjustment.html': { minLevel: 30, menuId: 'assets.asset-adj' },
  'orphan-frozen.html': { minLevel: 30, menuId: 'assets.orphan' },
  'material-conversion-rules.html': { minLevel: 30, menuId: 'assets.material-rules' },
  'assets-portfolio.html': { minLevel: 30, menuId: 'assets.assets-portfolio' },

  'exchange-market.html': { minLevel: 30, menuId: 'market.exchange' },
  'trade-management.html': { minLevel: 30, menuId: 'market.trade' },

  'user-management.html': { minLevel: 30, menuId: 'users.user-mgmt' },
  'user-hierarchy.html': { minLevel: 30, menuId: 'users.user-hierarchy' },
  'store-management.html': { minLevel: 30, menuId: 'users.stores' },

  'analytics.html': { minLevel: 30, menuId: 'analytics.analytics' },

  // ========== 管理员专属（role_level >= 100） ==========
  'system-settings.html': { minLevel: 100, menuId: 'system.settings' },
  'content-management.html': { minLevel: 100, menuId: 'operations.content' },
  'sessions.html': { minLevel: 100, menuId: 'system.sessions' },
  'item-templates.html': { minLevel: 100, menuId: 'operations.item-tpl' },
  'config-tools.html': { minLevel: 100, menuId: 'system.config-tools' },

  // 方案A独立页面（从system-settings.html分离）
  'dict-management.html': { minLevel: 100, menuId: 'operations.dict' },
  'pricing-config.html': { minLevel: 100, menuId: 'operations.pricing' },
  'feature-flags.html': { minLevel: 100, menuId: 'operations.feature-flags' },

  // 系统设置Tab页面（二级菜单改造后的新页面）
  'prize-config.html': { minLevel: 100, menuId: 'system.prize-config' },
  'ops-rules.html': { minLevel: 100, menuId: 'system.ops-rules' },
  'sys-maintain.html': { minLevel: 100, menuId: 'system.sys-maintain' },
  'reminder-rules.html': { minLevel: 100, menuId: 'system.ops-rules' },
  'audit-logs.html': { minLevel: 100, menuId: 'system.sys-maintain' }
}

// ========== 权限判断函数 ==========

/**
 * 获取用户的 role_level
 * @returns {number} 用户权限等级，未登录返回 0
 */
export function getUserRoleLevel() {
  try {
    // 优先从 admin_user 获取（init.js 中 auth store 使用的 key）
    const adminUser = localStorage.getItem('admin_user')
    if (adminUser) {
      const user = JSON.parse(adminUser)
      return user?.role_level || 0
    }

    // 兼容 admin_user_info（index.js 中使用的 key）
    const adminUserInfo = localStorage.getItem('admin_user_info')
    if (adminUserInfo) {
      const user = JSON.parse(adminUserInfo)
      return user?.role_level || 0
    }

    return 0
  } catch (e) {
    logger.warn('[Permission] 获取用户权限等级失败:', e)
    return 0
  }
}

/**
 * 判断用户是否有菜单访问权限
 * @param {string} menuId - 菜单ID（如 'operations.customer'）
 * @returns {boolean} 是否有权限
 */
export function hasMenuAccess(menuId) {
  const userLevel = getUserRoleLevel()
  const rule = MENU_ACCESS_RULES[menuId]

  // 未配置的菜单默认需要 role_level >= 30（运营及以上）
  if (!rule) {
    return userLevel >= ROLE_LEVEL_THRESHOLDS.OPS
  }

  return userLevel >= rule.minLevel
}

/**
 * 判断用户是否有页面访问权限
 * @param {string} pagePath - 页面路径（如 'lottery-management.html'）
 * @returns {boolean} 是否有权限
 */
export function hasPageAccess(pagePath) {
  const userLevel = getUserRoleLevel()

  // 提取文件名（去除路径前缀）
  const fileName = pagePath.split('/').pop()
  const rule = PAGE_ACCESS_RULES[fileName]

  // 未配置的页面默认需要 role_level >= 30（运营及以上）
  if (!rule) {
    return userLevel >= ROLE_LEVEL_THRESHOLDS.OPS
  }

  return userLevel >= rule.minLevel
}

/**
 * 获取当前页面的权限要求
 * @returns {Object|null} 权限规则对象
 */
export function getCurrentPageRule() {
  const path = window.location.pathname
  const fileName = path.split('/').pop()
  return PAGE_ACCESS_RULES[fileName] || null
}

/**
 * 检查当前页面权限并处理无权限情况
 * @param {Object} options - 配置选项
 * @param {string} [options.redirectUrl='/admin/statistics.html'] - 无权限时跳转地址
 * @param {boolean} [options.showAlert=true] - 是否显示提示
 * @returns {boolean} 是否有权限
 */
export function checkCurrentPageAccess(options = {}) {
  const { redirectUrl = '/admin/statistics.html', showAlert = true } = options

  const path = window.location.pathname
  const hasAccess = hasPageAccess(path)

  if (!hasAccess) {
    logger.warn(`[Permission] 无权限访问: ${path}，用户等级: ${getUserRoleLevel()}`)

    if (showAlert) {
      // 使用 Alpine store 的 toast（如果可用）
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').warning('您没有访问此页面的权限')
      } else {
        alert('您没有访问此页面的权限')
      }
    }

    // 延迟跳转，让用户看到提示
    setTimeout(() => {
      window.location.href = redirectUrl
    }, 1500)

    return false
  }

  return true
}

/**
 * 获取用户可访问的菜单ID列表
 * @returns {string[]} 可访问的菜单ID数组
 */
export function getAccessibleMenuIds() {
  const userLevel = getUserRoleLevel()
  const accessibleIds = []

  Object.entries(MENU_ACCESS_RULES).forEach(([menuId, rule]) => {
    if (userLevel >= rule.minLevel) {
      accessibleIds.push(menuId)
    }
  })

  return accessibleIds
}

/**
 * 获取用户权限等级描述（与后端 getRoleLevelDescription 对齐）
 * @returns {string} 权限等级描述
 */
export function getUserRoleLevelDescription() {
  const level = getUserRoleLevel()

  if (level >= ROLE_LEVEL_THRESHOLDS.ADMIN) {
    return '超级管理员'
  } else if (level >= 80) {
    return '高级运营'
  } else if (level >= ROLE_LEVEL_THRESHOLDS.OPS) {
    return '运营'
  } else if (level >= ROLE_LEVEL_THRESHOLDS.CUSTOMER_SERVICE) {
    return '客服'
  } else {
    return '普通用户'
  }
}

// ========== 导出所有 ==========

export const PERMISSION_RULES = {
  ROLE_LEVEL_THRESHOLDS,
  MENU_ACCESS_RULES,
  PAGE_ACCESS_RULES
}

export default {
  PERMISSION_RULES,
  ROLE_LEVEL_THRESHOLDS,
  MENU_ACCESS_RULES,
  PAGE_ACCESS_RULES,
  getUserRoleLevel,
  hasMenuAccess,
  hasPageAccess,
  getCurrentPageRule,
  checkCurrentPageAccess,
  getAccessibleMenuIds,
  getUserRoleLevelDescription
}
