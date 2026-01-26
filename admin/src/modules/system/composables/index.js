/**
 * 系统设置模块 - Composables 导出汇总
 *
 * @file admin/src/modules/system/composables/index.js
 * @description 导出所有系统设置子模块
 * @version 1.0.0
 * @date 2026-01-24
 */

// 系统配置模块
export { useConfigState, useConfigMethods } from './config.js'

// 字典管理模块
export { useDictState, useDictMethods } from './dict.js'

// 功能开关模块
export { useFeatureFlagsState, useFeatureFlagsMethods } from './feature-flags.js'

// 审计日志模块
export { useAuditLogsState, useAuditLogsMethods } from './audit-logs.js'

/**
 * 组合所有系统设置状态
 * @returns {Object} 合并后的状态对象
 */
export function useAllSystemState() {
  return {
    ...useConfigState(),
    ...useDictState(),
    ...useFeatureFlagsState(),
    ...useAuditLogsState()
  }
}

/**
 * 组合所有系统设置方法
 * @returns {Object} 合并后的方法对象
 */
export function useAllSystemMethods() {
  return {
    ...useConfigMethods(),
    ...useDictMethods(),
    ...useFeatureFlagsMethods(),
    ...useAuditLogsMethods()
  }
}
