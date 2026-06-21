/**
 * 数据管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/system/pages/data-management.js
 * @module DataManagementPage
 * @version 1.0.0
 * @date 2026-03-10
 *
 * @description
 * 管理后台数据一键删除功能，提供以下 Tab：
 * - 数据总览：各安全等级数据量统计
 * - 自动清理策略：L3 表保留天数配置
 * - 手动清理：步骤式清理（选择→预览→确认→执行）
 * - 对账校验：复用已有资产/物品域对账 API
 * - 清理历史：审计日志查询
 *
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { useDataManagementState, useDataManagementMethods } from '../composables/data-management.js'

/**
 * 数据管理页面 Alpine.js 组件工厂函数
 * @returns {Object} Alpine.js 组件配置
 */
function dataManagementPage() {
  /*
   * useDataManagementMethods 含 get availableCategories 计算属性，
   * 必须用 Object.defineProperties + getOwnPropertyDescriptors 保留 getter 描述符，
   * 直接展开（...）会在构造时调用一次 getter 并复制为静态值，破坏响应式与 this 绑定
   */
  const methods = useDataManagementMethods()

  const result = {
    ...createPageMixin(),
    ...useDataManagementState()
  }

  Object.defineProperties(result, Object.getOwnPropertyDescriptors(methods))

  /**
   * 页面初始化
   */
  result.init = async function () {
    logger.info('[DataManagement] 页面初始化')
    await this.loadStats()
  }

  return result
}

Alpine.data('dataManagementPage', dataManagementPage)

export default dataManagementPage
