/**
 * 字典管理独立页面模块
 *
 * @file admin/src/modules/operations/pages/dict-management.js
 * @description 从 system-settings.js 分离的字典管理独立页面
 * @version 1.1.0
 * @date 2026-02-05
 *
 * 修复：ES Module 加载时序问题
 * - 直接注册组件（ES模块导入的Alpine已经可用）
 * - 同时监听alpine:init事件作为后备
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'

// 复用 system 模块的字典 composables
import { useDictState, useDictMethods } from '../../system/composables/dict.js'

// 标记是否已注册，避免重复注册
let _registered = false

/**
 * 注册字典管理页面组件
 */
function registerDictManagementComponents() {
  // 防止重复注册
  if (_registered) {
    logger.debug('[DictManagement] 组件已注册，跳过')
    return
  }

  logger.debug('[DictManagement] 注册 Alpine 组件...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[DictManagement] 关键依赖未加载', {
      Alpine: !!Alpine,
      createPageMixin: typeof createPageMixin
    })
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
      logger.debug('[DictManagement] dictList 初始值:', this.dictList)
      logger.debug('[DictManagement] currentDictType:', this.currentDictType)

      if (!this.checkAuth()) {
        logger.warn('[DictManagement] 认证检查失败')
        return
      }

      // 加载字典数据
      logger.debug('[DictManagement] 开始加载字典数据...')
      this.loadDictList()
    }
  }))

  _registered = true
  logger.info('[DictManagement] Alpine 组件注册完成')
}

// 直接注册（ES模块导入的Alpine已经可用）
// 这是主要的注册方式，避免alpine:init事件时序问题
registerDictManagementComponents()

// 作为后备，也监听alpine:init事件（以防上面的调用时机过早）
document.addEventListener('alpine:init', () => {
  registerDictManagementComponents()
})

export { registerDictManagementComponents }
export default registerDictManagementComponents
