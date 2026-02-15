/**
 * @fileoverview 待处理中心页面 - Alpine.js Mixin 版本
 * @module modules/operations/pages/pending-center
 * @description 汇总所有待处理事项，提供统一的处理入口
 *
 * @version 1.2.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { usePendingState, usePendingMethods } from '../composables/index.js'

/**
 * 创建待处理中心页面组件
 * @returns {Object} Alpine.js 组件配置对象
 */
function pendingCenterPage() {
  const pendingMethods = usePendingMethods()

  // 使用 Object.defineProperties 保留 getter 描述符
  // （usePendingMethods 包含 get totalPages、get hasSelected 等计算属性）
  const result = {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== Composables ====================
    ...usePendingState()
  }

  // 正确复制含 getter 的方法对象
  Object.defineProperties(result, Object.getOwnPropertyDescriptors(pendingMethods))

  /**
   * 初始化页面
   */
  result.init = async function () {
    logger.info('[PendingCenter] 初始化待处理中心')

    // 并行加载数据
    await Promise.all([this.loadHealthScore(), this.loadSummary(), this.loadPendingItems()])

    // 启动自动刷新
    this.startAutoRefresh()

    logger.info('[PendingCenter] 初始化完成')
  }

  return result
}

// 注册 Alpine 组件
document.addEventListener('alpine:init', () => {
  if (window.Alpine) {
    window.Alpine.data('pendingCenterPage', pendingCenterPage)
    logger.info('[PendingCenter] Alpine 组件注册完成')
  }
})

// 导出
export { pendingCenterPage }
export default pendingCenterPage
