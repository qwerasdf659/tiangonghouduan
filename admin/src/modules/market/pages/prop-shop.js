/**
 * 道具商城管理 - 页面组件（道具商城 / 星石轨）
 *
 * @file admin/src/modules/market/pages/prop-shop.js
 * @description Alpine.js 页面组件：一体化上架零价值虚拟道具（item_type='prop'），
 *   一次填写自动串联「建 prop 模板 → 建 SPU → 建 SKU → 设星石价」。
 * @date 2026-06-11
 */

import { createPageMixin } from '../../../alpine/mixins/index.js'
import { usePropShopState, usePropShopMethods } from '../composables/prop-shop.js'

document.addEventListener('alpine:init', () => {
  Alpine.data('propShopPage', () => ({
    ...createPageMixin({
      pagination: false,
      modal: false,
      tableSelection: false,
      formValidation: false,
      authGuard: true
    }),
    ...usePropShopState(),
    ...usePropShopMethods(),

    async init() {
      if (!this.checkAuth()) return
      await this.loadPropList()
    }
  }))
})
