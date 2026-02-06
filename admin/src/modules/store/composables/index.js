/**
 * 门店管理模块 - Composables 导出汇总
 *
 * @file admin/src/modules/store/composables/index.js
 * @description 导出所有子模块，便于主模块组合使用
 * @version 1.0.0
 * @date 2026-02-06
 */

// 门店管理模块
import { useStoresState, useStoresMethods } from './stores.js'

// 员工管理模块
import { useStaffState, useStaffMethods } from './staff.js'

// 省市区联动模块
import { useRegionsState, useRegionsMethods } from './regions.js'

export { useStoresState, useStoresMethods }
export { useStaffState, useStaffMethods }
export { useRegionsState, useRegionsMethods }

/**
 * 组合所有门店管理状态
 * @returns {Object} 合并后的状态对象
 */
export function useAllStoreState() {
  return {
    ...useStoresState(),
    ...useStaffState(),
    ...useRegionsState()
  }
}

/**
 * 组合所有门店管理方法
 * @returns {Object} 合并后的方法对象
 */
export function useAllStoreMethods() {
  return {
    ...useStoresMethods(),
    ...useStaffMethods(),
    ...useRegionsMethods()
  }
}
