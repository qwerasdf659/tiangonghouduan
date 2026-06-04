/**
 * 小程序版本闸门配置管理 - 页面组件
 *
 * @file admin/src/modules/system/pages/app-version-config.js
 * @description Alpine.js 页面组件：管理小程序版本闸门（最低/最新版本、强更开关、提示文案）
 * @version 1.0.0
 * @date 2026-06-03
 */

import { createPageMixin } from '../../../alpine/mixins/index.js'
import {
  useAppVersionConfigState,
  useAppVersionConfigMethods
} from '../composables/app-version-config.js'

document.addEventListener('alpine:init', () => {
  Alpine.data('appVersionConfigPage', () => ({
    ...createPageMixin({
      pagination: false,
      modal: false,
      tableSelection: false,
      formValidation: false,
      authGuard: true
    }),
    ...useAppVersionConfigState(),
    ...useAppVersionConfigMethods(),

    async init() {
      if (!this.checkAuth()) return
      await this.loadAppVersionConfig()
    }
  }))
})
