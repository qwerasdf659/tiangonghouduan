/**
 * 系统权限资源定义（以数据库为权威）
 *
 * 文件路径：constants/PermissionResources.js
 *
 * 数据来源：从 roles 表的 permissions 字段提取的实际使用资源
 * 查询时间：2026-01-26
 *
 * 用途：
 * - 角色权限配置界面展示
 * - 前端树形复选框渲染
 * - 后端权限校验参考
 *
 * 使用方式：
 * - 服务层：const { PERMISSION_RESOURCES, SYSTEM_ROLES } = require('../constants/PermissionResources')
 * - 路由层：const { isSystemRole } = require('../constants/PermissionResources')
 *
 * 创建时间：2026-01-26
 * 版本：V1.0.0（角色权限管理功能）
 */

'use strict'

/**
 * 权限资源定义数组
 *
 * 每个资源包含：
 * - code: 资源唯一标识（与数据库 permissions JSON 的 key 一致）
 * - name: 中文显示名称
 * - actions: 可用操作列表 [{ code, name }]
 *
 * @type {Array<{code: string, name: string, actions: Array<{code: string, name: string}>}>}
 */
const PERMISSION_RESOURCES = Object.freeze([
  // ==================== 核心业务模块 ====================
  {
    code: 'users',
    name: '用户管理',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'create', name: '创建' },
      { code: 'update', name: '更新' },
      { code: 'delete', name: '删除' }
    ]
  },
  {
    code: 'user-management',
    name: '用户管理（控制台）',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'lottery',
    name: '抽奖活动',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'participate', name: '参与' }
    ]
  },
  {
    code: 'lottery-management',
    name: '抽奖管理',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'lottery-quota',
    name: '抽奖配额',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'prize-pool',
    name: '奖池管理',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'stores',
    name: '门店管理',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'create', name: '创建' },
      { code: 'update', name: '更新' },
      { code: 'delete', name: '删除' }
    ]
  },
  {
    code: 'store',
    name: '门店（单数）',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'staff',
    name: '员工管理',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'create', name: '创建' },
      { code: 'update', name: '更新' },
      { code: 'delete', name: '删除' },
      { code: 'manage', name: '管理' }
    ]
  },
  {
    code: 'consumption',
    name: '消费管理',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'create', name: '录入' },
      { code: 'update', name: '更新' },
      { code: 'delete', name: '删除' },
      { code: 'scan_user', name: '扫码' }
    ]
  },
  {
    code: 'hierarchy',
    name: '层级管理',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'create', name: '创建' },
      { code: 'update', name: '更新' },
      { code: 'delete', name: '删除' }
    ]
  },
  {
    code: 'reports',
    name: '报表管理',
    actions: [{ code: 'read', name: '查看' }]
  },

  // ==================== 资产与积分模块 ====================
  {
    code: 'points',
    name: '积分管理',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'assets',
    name: '资产管理',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'asset-adjustment',
    name: '资产调整',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'marketplace',
    name: '市场交易',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'material',
    name: '素材管理',
    actions: [{ code: 'read', name: '查看' }]
  },

  // ==================== 营销活动模块 ====================
  {
    code: 'campaign',
    name: '活动管理',
    actions: [{ code: 'access', name: '访问' }]
  },
  {
    code: 'campaign-budget',
    name: '活动预算',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'popup-banners',
    name: '弹窗横幅',
    actions: [{ code: 'read', name: '查看' }]
  },

  // ==================== 系统配置模块 ====================
  {
    code: 'profile',
    name: '个人资料',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'update', name: '更新' }
    ]
  },
  {
    code: 'settings',
    name: '系统设置',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'config',
    name: '配置管理',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'auth',
    name: '认证授权',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'analytics',
    name: '数据分析',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'customer-service',
    name: '客服系统',
    actions: [{ code: 'read', name: '查看' }]
  },
  {
    code: 'system',
    name: '系统管理',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'execute_scheduled_tasks', name: '执行定时任务' },
      { code: 'manage_frozen_assets', name: '管理冻结资产' },
      { code: 'audit_log_write', name: '写入审计日志' }
    ]
  },

  // ==================== 角色管理模块（新增）====================
  {
    code: 'roles',
    name: '角色管理',
    actions: [
      { code: 'read', name: '查看' },
      { code: 'create', name: '创建' },
      { code: 'update', name: '更新' },
      { code: 'delete', name: '删除' }
    ]
  }
])

/**
 * 系统内置角色（技术必需，不可删除/重命名）
 *
 * 🔒 这3个角色在代码中被硬编码引用，删除会导致系统崩溃：
 * - admin: 管理后台入口权限基准 (role_level >= 100)
 * - user: 新用户注册自动分配的默认角色
 * - system_job: 定时任务/后台Job执行专用角色
 *
 * @type {string[]}
 */
const SYSTEM_ROLES = Object.freeze(['admin', 'user', 'system_job'])

/**
 * 检查角色是否为系统内置角色
 *
 * @param {string} role_name - 角色名称
 * @returns {boolean} 是否为系统内置角色
 *
 * @example
 * if (isSystemRole('admin')) {
 *   throw new Error('系统内置角色不可删除')
 * }
 */
function isSystemRole(role_name) {
  return SYSTEM_ROLES.includes(role_name)
}

/**
 * 获取权限资源列表（用于 API 响应）
 *
 * @returns {Array} 权限资源数组（深拷贝，防止外部修改）
 */
function getPermissionResources() {
  // 返回深拷贝，防止外部修改影响常量
  return JSON.parse(JSON.stringify(PERMISSION_RESOURCES))
}

/**
 * 根据资源代码获取资源信息
 *
 * @param {string} code - 资源代码
 * @returns {Object|null} 资源信息对象或 null
 */
function getResourceByCode(code) {
  const resource = PERMISSION_RESOURCES.find(r => r.code === code)
  return resource ? JSON.parse(JSON.stringify(resource)) : null
}

/**
 * 验证权限格式是否有效
 *
 * @param {Object} permissions - 权限对象 { resource: [action1, action2] }
 * @returns {{ valid: boolean, errors: string[] }} 验证结果
 */
function validatePermissions(permissions) {
  const errors = []

  if (!permissions || typeof permissions !== 'object') {
    return { valid: false, errors: ['权限配置必须是一个对象'] }
  }

  // 获取所有有效的资源代码
  const validResourceCodes = PERMISSION_RESOURCES.map(r => r.code)

  // 验证每个资源和操作
  for (const [resourceCode, actions] of Object.entries(permissions)) {
    // 检查资源是否存在
    if (!validResourceCodes.includes(resourceCode)) {
      errors.push(`未知的权限资源: ${resourceCode}`)
      continue
    }

    // 检查 actions 是否为数组
    if (!Array.isArray(actions)) {
      errors.push(`资源 ${resourceCode} 的操作必须是数组`)
      continue
    }

    // 获取该资源的有效操作
    const resource = PERMISSION_RESOURCES.find(r => r.code === resourceCode)
    const validActions = resource.actions.map(a => a.code)

    // 检查每个操作是否有效
    for (const action of actions) {
      if (!validActions.includes(action)) {
        errors.push(`资源 ${resourceCode} 不支持操作: ${action}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

module.exports = {
  // 常量
  PERMISSION_RESOURCES,
  SYSTEM_ROLES,

  // 工具函数
  isSystemRole,
  getPermissionResources,
  getResourceByCode,
  validatePermissions
}
