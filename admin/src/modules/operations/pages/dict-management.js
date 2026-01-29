/**
 * 字典管理独立页面模块
 *
 * @file admin/src/modules/operations/pages/dict-management.js
 * @description 从 system-settings.js 分离的字典管理独立页面
 * @version 1.0.0
 * @date 2026-01-28
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'

// 复用 system 模块的字典 composables
import { useDictState, useDictMethods } from '../../system/composables/dict.js'

/**
 * 注册字典管理页面组件
 */
function registerDictManagementComponents() {
  logger.debug('[DictManagement] 注册 Alpine 组件...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[DictManagement] 关键依赖未加载')
    return
  }

  /**
   * 字典管理页面组件
   */
  Alpine.data('dictManagement', () => ({
    // 基础混入
    ...createPageMixin(),

    // 从 composables 导入状态和方法
    ...useDictState(),
    ...useDictMethods(),

    // 页面状态
    saving: false,

    /**
     * 初始化
     */
    init() {
      logger.debug('[DictManagement] 字典管理页面初始化开始')

      if (!this.checkAuth()) {
        logger.warn('[DictManagement] 认证检查失败')
        return
      }

      // 加载字典数据
      this.loadDictList()
    }
  }))

  logger.info('[DictManagement] Alpine 组件注册完成')
}

// 事件监听
document.addEventListener('alpine:init', () => {
  registerDictManagementComponents()
})

export { registerDictManagementComponents }
export default registerDictManagementComponents
