/**
 * 功能开关独立页面模块
 *
 * @file admin/src/modules/operations/pages/feature-flags.js
 * @description 从 system-settings.js 分离的功能开关独立页面
 * @version 1.0.0
 * @date 2026-01-28
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'

// 复用 system 模块的功能开关 composables
import {
  useFeatureFlagsState,
  useFeatureFlagsMethods
} from '../../system/composables/feature-flags.js'

/**
 * 注册功能开关页面组件
 */
function registerFeatureFlagsComponents() {
  logger.debug('[FeatureFlags] 注册 Alpine 组件...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[FeatureFlags] 关键依赖未加载')
    return
  }

  /**
   * 功能开关页面组件
   */
  Alpine.data('featureFlags', () => ({
    // 基础混入
    ...createPageMixin(),

    // 从 composables 导入状态和方法
    ...useFeatureFlagsState(),
    ...useFeatureFlagsMethods(),

    // 页面状态
    saving: false,

    /**
     * 初始化
     */
    init() {
      logger.debug('[FeatureFlags] 功能开关页面初始化开始')

      if (!this.checkAuth()) {
        logger.warn('[FeatureFlags] 认证检查失败')
        return
      }

      // 加载功能开关数据
      this.loadFeatureFlags()
    }
  }))

  logger.info('[FeatureFlags] Alpine 组件注册完成')
}

// 事件监听
document.addEventListener('alpine:init', () => {
  registerFeatureFlagsComponents()
})

export { registerFeatureFlagsComponents }
export default registerFeatureFlagsComponents
