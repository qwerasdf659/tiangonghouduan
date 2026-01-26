/**
 * 用户管理模块 - Composables 导出汇总
 *
 * @file admin/src/modules/user/composables/index.js
 * @description 导出所有用户管理子模块
 * @version 1.0.0
 * @date 2026-01-24
 */

// 用户管理模块
export { useUsersState, useUsersMethods } from './users.js'

// 角色权限管理模块
export { useRolesPermissionsState, useRolesPermissionsMethods } from './roles-permissions.js'

// 高级状态管理模块
export { useAdvancedStatusState, useAdvancedStatusMethods } from './advanced-status.js'

/**
 * 组合所有用户管理状态
 * @returns {Object} 合并后的状态对象
 */
export function useAllUserState() {
  return {
    ...useUsersState(),
    ...useRolesPermissionsState(),
    ...useAdvancedStatusState()
  }
}

/**
 * 组合所有用户管理方法
 * @returns {Object} 合并后的方法对象
 */
export function useAllUserMethods() {
  return {
    ...useUsersMethods(),
    ...useRolesPermissionsMethods(),
    ...useAdvancedStatusMethods()
  }
}
