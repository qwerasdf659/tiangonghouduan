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
 * @see docs/数据一键删除功能设计方案.md
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { useDataManagementState, useDataManagementMethods } from '../composables/data-management.js'

/**
 * 数据管理页面 Alpine.js 组件工厂函数
 * @returns {Object} Alpine.js 组件配置
 */
function dataManagementPage() {
  return {
    ...createPageMixin(),
    ...useDataManagementState(),
    ...useDataManagementMethods(),

    /**
     * 页面初始化
     */
    async init() {
      logger.info('[DataManagement] 页面初始化')
      await this.loadStats()
    }
  }
}

Alpine.data('dataManagementPage', dataManagementPage)

export default dataManagementPage
