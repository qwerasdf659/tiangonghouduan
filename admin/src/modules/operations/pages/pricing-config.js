/**
 * 定价配置（积分配置）独立页面模块
 *
 * @file admin/src/modules/operations/pages/pricing-config.js
 * @description 从 system-settings.js 分离的定价配置独立页面
 * @version 1.0.0
 * @date 2026-01-28
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'

// 复用 system 模块的配置 composables（包含积分配置）
import { useConfigState, useConfigMethods } from '../../system/composables/config.js'

/**
 * 注册定价配置页面组件
 */
function registerPricingConfigComponents() {
  logger.debug('[PricingConfig] 注册 Alpine 组件...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[PricingConfig] 关键依赖未加载')
    return
  }

  /**
   * 定价配置页面组件
   */
  Alpine.data('pricingConfig', () => ({
    // 基础混入
    ...createPageMixin(),

    // 从 composables 导入状态和方法
    ...useConfigState(),
    ...useConfigMethods(),

    // 页面状态
    saving: false,

    /**
     * 初始化
     */
    init() {
      logger.debug('[PricingConfig] 定价配置页面初始化开始')

      if (!this.checkAuth()) {
        logger.warn('[PricingConfig] 认证检查失败')
        return
      }

      // 加载积分配置
      this.loadPointsConfigs()
    }
  }))

  logger.info('[PricingConfig] Alpine 组件注册完成')
}

// 事件监听
document.addEventListener('alpine:init', () => {
  registerPricingConfigComponents()
})

export { registerPricingConfigComponents }
export default registerPricingConfigComponents
