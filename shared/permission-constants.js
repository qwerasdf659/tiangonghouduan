/**
 * 权限等级常量定义
 *
 * @description 前后端共用，确保权限阈值一致
 * @file shared/permission-constants.js
 *
 * @created 2026-01-27
 * @updated 2026-01-27
 *
 * 设计决策（2026-01-27 已确认）：
 * - role_level 为唯一权限判断依据
 * - role_name 仅用于显示和日志
 * - 废除 ROLE_LEVEL_MAP 映射表，统一使用 requireRoleLevel(minLevel)
 *
 * 数据库实际角色数据参考：
 * | role_name         | role_level | 定位           |
 * |-------------------|------------|----------------|
 * | admin             | 100        | 超级管理员     |
 * | regional_manager  | 80         | 区域经理       |
 * | business_manager  | 60         | 业务经理       |
 * | sales_staff       | 40         | 销售人员       |
 * | merchant_manager  | 40         | 商户店长       |
 * | ops               | 30         | 运营（只读）   |
 * | merchant_staff    | 20         | 商户员工       |
 * | user              | 0          | 普通用户       |
 */

/**
 * 权限等级常量（以数据库实际值为准，零冗余常量）
 *
 * @description 用于 requireRoleLevel(minLevel) 中间件的阈值定义
 *
 * 使用示例：
 * - requireRoleLevel(PERMISSION_LEVELS.ADMIN)  // 仅管理员（role_level >= 100）
 * - requireRoleLevel(PERMISSION_LEVELS.OPS)    // 运营及以上（role_level >= 30）
 * - requireRoleLevel(PERMISSION_LEVELS.CUSTOMER_SERVICE)  // 客服及以上（role_level >= 1）
 *
 * 注意：不定义 HIGH_OPS(80)，避免未使用常量造成技术债务
 * 如果后续需要区分高级运营（regional_manager），直接使用数值 80 即可
 */
const PERMISSION_LEVELS = {
  /**
   * 管理员：所有功能（包括系统设置）
   * 对应角色：admin
   */
  ADMIN: 100,

  /**
   * 运营：大部分运营功能（只读权限）
   * 对应角色：ops、merchant_manager、sales_staff、business_manager 等
   */
  OPS: 30,

  /**
   * 客服：仅客服工作台
   * 对应角色：任何 role_level > 0 的用户
   */
  CUSTOMER_SERVICE: 1,

  /**
   * 普通用户：无后台权限
   * 对应角色：user
   */
  USER: 0
}

/**
 * 前端菜单最低权限等级配置
 *
 * @description 用于前端侧边栏菜单权限过滤
 * @note 此配置应与前端 permission-rules.js 保持一致
 */
const MENU_MIN_LEVELS = {
  // 所有人可访问
  dashboard: PERMISSION_LEVELS.USER,
  'operations.customer': PERMISSION_LEVELS.CUSTOMER_SERVICE,

  // 运营功能（role_level >= 30）
  operations: PERMISSION_LEVELS.OPS,
  'operations.consumption': PERMISSION_LEVELS.OPS,
  'operations.risk': PERMISSION_LEVELS.OPS,

  lottery: PERMISSION_LEVELS.OPS,
  'lottery.campaigns': PERMISSION_LEVELS.OPS,
  'lottery.presets': PERMISSION_LEVELS.OPS,

  assets: PERMISSION_LEVELS.OPS,
  'assets.asset-mgmt': PERMISSION_LEVELS.OPS,
  'assets.asset-adj': PERMISSION_LEVELS.OPS,
  'assets.orphan': PERMISSION_LEVELS.OPS,
  'assets.material-rules': PERMISSION_LEVELS.OPS,
  'assets.assets-portfolio': PERMISSION_LEVELS.OPS,

  market: PERMISSION_LEVELS.OPS,
  'market.exchange': PERMISSION_LEVELS.OPS,
  'market.trade': PERMISSION_LEVELS.OPS,

  users: PERMISSION_LEVELS.OPS,
  'users.user-mgmt': PERMISSION_LEVELS.OPS,
  'users.user-hierarchy': PERMISSION_LEVELS.OPS,
  'users.stores': PERMISSION_LEVELS.OPS,

  analytics: PERMISSION_LEVELS.OPS,
  'analytics.stats': PERMISSION_LEVELS.OPS,
  'analytics.analytics': PERMISSION_LEVELS.OPS,

  // 系统设置（仅管理员）
  system: PERMISSION_LEVELS.ADMIN,
  'system.settings': PERMISSION_LEVELS.ADMIN,
  'system.content': PERMISSION_LEVELS.ADMIN,
  'system.sessions': PERMISSION_LEVELS.ADMIN,
  'system.item-tpl': PERMISSION_LEVELS.ADMIN,
  'system.config-tools': PERMISSION_LEVELS.ADMIN
}

/**
 * 获取角色级别描述（用于日志和显示）
 *
 * @param {number} role_level - 角色权限等级
 * @returns {string} 角色描述
 */
function getRoleLevelDescription(role_level) {
  if (role_level >= 100) return '超级管理员'
  if (role_level >= 80) return '高级运营'
  if (role_level >= 30) return '运营'
  if (role_level >= 1) return '客服'
  return '普通用户'
}

module.exports = {
  PERMISSION_LEVELS,
  MENU_MIN_LEVELS,
  getRoleLevelDescription
}
