/**
 * 对账报告页面
 *
 * @description 物品守恒 + 资产守恒对账，一键发现数据异常
 * @module modules/asset/pages/reconciliation
 * @version 1.0.0
 * @date 2026-02-22
 */

import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { request } from '../../../api/base.js'

document.addEventListener('alpine:init', () => {
  Alpine.data('reconciliationPage', () => ({
    ...createPageMixin(),

    /** 物品对账结果 */
    item_result: null,

    /** 资产对账结果 */
    asset_result: null,

    /** 加载状态 */
    loading_items: false,
    loading_assets: false,

    /**
     * 页面初始化
     */
    init() {
      if (!this.checkAuth()) return
      console.log('[reconciliation] 页面初始化完成')
    },

    /**
     * 执行物品对账
     */
    async runItemReconciliation() {
      this.loading_items = true
      try {
        const response = await request(ASSET_ENDPOINTS.RECONCILIATION_ITEMS)
        if (response.success && response.data) {
          this.item_result = response.data
          Alpine.store('notification').show('物品对账完成', 'success')
        } else {
          Alpine.store('notification').show(response.message || '对账失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show(`物品对账失败：${error.message}`, 'error')
      } finally {
        this.loading_items = false
      }
    },

    /**
     * 执行资产对账
     */
    async runAssetReconciliation() {
      this.loading_assets = true
      try {
        const response = await request(ASSET_ENDPOINTS.RECONCILIATION_ASSETS)
        if (response.success && response.data) {
          this.asset_result = response.data
          Alpine.store('notification').show('资产对账完成', 'success')
        } else {
          Alpine.store('notification').show(response.message || '对账失败', 'error')
        }
      } catch (error) {
        Alpine.store('notification').show(`资产对账失败：${error.message}`, 'error')
      } finally {
        this.loading_assets = false
      }
    }
  }))
})
