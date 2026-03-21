/**
 * 全局氛围主题配置管理 - 页面组件
 *
 * @file admin/src/modules/system/pages/app-theme-config.js
 * @description Alpine.js 页面组件：管理小程序全局视觉氛围主题
 * @version 1.0.0
 * @date 2026-03-06
 */

import { createPageMixin } from '../../../alpine/mixins/index.js'
import {
  useAppThemeConfigState,
  useAppThemeConfigMethods
} from '../composables/app-theme-config.js'

document.addEventListener('alpine:init', () => {
  Alpine.data('appThemeConfigPage', () => ({
    ...createPageMixin({
      pagination: false,
      modal: false,
      tableSelection: false,
      formValidation: false,
      authGuard: true
    }),
    ...useAppThemeConfigState(),
    ...useAppThemeConfigMethods(),

    async init() {
      if (!this.checkAuth()) return
      await this.loadAppThemeConfig()
    }
  }))
})

