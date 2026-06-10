/**
 * 协议正文配置管理 - 页面组件（ADM-1 / 合规硬项 A-2）
 *
 * @file admin/src/modules/system/pages/agreement-config.js
 * @description Alpine.js 页面组件：编辑《用户协议》《隐私政策》正文，写入 system_settings 供 C 端只读下发
 * @version 1.0.0
 * @date 2026-06-09
 */

import { createPageMixin } from '../../../alpine/mixins/index.js'
import {
  useAgreementConfigState,
  useAgreementConfigMethods
} from '../composables/agreement-config.js'

document.addEventListener('alpine:init', () => {
  Alpine.data('agreementConfigPage', () => ({
    ...createPageMixin({
      pagination: false,
      modal: false,
      tableSelection: false,
      formValidation: false,
      authGuard: true
    }),
    ...useAgreementConfigState(),
    ...useAgreementConfigMethods(),

    async init() {
      if (!this.checkAuth()) return
      await this.loadAgreementConfig()
    }
  }))
})
