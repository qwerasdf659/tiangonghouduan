/**
 * 用户比例覆盖管理页面入口
 *
 * @description Alpine.js 组件注册，管理员为特定用户设置个性化消费比例
 * @module modules/user/pages/user-ratio-overrides
 * @since 2026-03-02（钻石配额优化方案）
 */

import { createPageMixin } from '../../../alpine/index.js'
import { useRatioOverridesState, useRatioOverridesMethods } from '../composables/index.js'

document.addEventListener('alpine:init', () => {
  console.log('[user-ratio-overrides] 页面组件注册中...')

  Alpine.data('ratioOverridesPage', () => ({
    ...createPageMixin(),
    ...useRatioOverridesState(),
    ...useRatioOverridesMethods(),

    async init() {
      console.log('[user-ratio-overrides] 组件初始化...')
      await this.checkAuth()
      await this.loadOverrides()
      console.log('[user-ratio-overrides] 组件初始化完成')
    }
  }))
})
