/**
 * 兑换页面配置管理 - 页面组件
 *
 * @file admin/src/modules/system/pages/exchange-page-config.js
 * @description Alpine.js 页面组件：管理兑换页面的 Tab/空间/筛选/卡片主题/运营参数配置
 * @version 1.0.0
 * @date 2026-02-19
 */

import { createPageMixin } from '../../../alpine/mixins/index.js'
import {
  useExchangePageConfigState,
  useExchangePageConfigMethods
} from '../composables/exchange-page-config.js'

document.addEventListener('alpine:init', () => {
  Alpine.data('exchangePageConfigPage', () => ({
    ...createPageMixin({
      pagination: false,
      modal: false,
      tableSelection: false,
      formValidation: false,
      authGuard: true
    }),
    ...useExchangePageConfigState(),
    ...useExchangePageConfigMethods(),

    async init() {
      if (!this.checkAuth()) return
      await this.loadExchangePageConfig()
    }
  }))
})
