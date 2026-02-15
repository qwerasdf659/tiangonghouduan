/**
 * 运营管理模块 - Composables 导出汇总
 *
 * @file admin/src/modules/operations/composables/index.js
 * @description 导出所有子模块，便于主模块组合使用
 * @version 1.0.0
 * @date 2026-02-06
 */

// 待处理中心模块
import { usePendingState, usePendingMethods } from './pending.js'

export { usePendingState, usePendingMethods }

/**
 * 组合所有状态
 * @returns {Object} 合并后的状态对象
 */
export function useAllOperationsState() {
  return {
    ...usePendingState()
  }
}

/**
 * 组合所有方法（保留 getter 描述符）
 * @returns {Object} 合并后的方法对象
 */
export function useAllOperationsMethods() {
  const result = {}
  Object.defineProperties(result, Object.getOwnPropertyDescriptors(usePendingMethods()))
  return result
}
