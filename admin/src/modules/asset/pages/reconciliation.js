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
        const response = await request({ url: ASSET_ENDPOINTS.RECONCILIATION_ITEMS })
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
        const response = await request({ url: ASSET_ENDPOINTS.RECONCILIATION_ASSETS })
        if (response.success && response.data) {
          this.asset_result = response.data
          Alpine.store('notification').success('资产对账完成')
          this.$nextTick(() => this.renderAssetChart())
        } else {
          Alpine.store('notification').error(response.message || '对账失败')
        }
      } catch (error) {
        Alpine.store('notification').error(`资产对账失败：${error.message}`)
      } finally {
        this.loading_assets = false
      }
    },

    /**
     * 渲染资产守恒 ECharts 柱状图
     */
    renderAssetChart() {
      const container = document.getElementById('asset-conservation-chart')
      if (!container || !this.asset_result?.global_conservation?.by_asset_code) return

      const echarts = window.echarts
      if (!echarts) {
        console.warn('[reconciliation] ECharts 未加载，跳过图表渲染')
        return
      }

      const chart = echarts.init(container)
      const data = this.asset_result.global_conservation.by_asset_code

      const option = {
        title: { text: '资产全局守恒概览', left: 'center', textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'axis', formatter: '{b}: {c}' },
        xAxis: {
          type: 'category',
          data: data.map(r => r.asset_code),
          axisLabel: { rotate: 30 }
        },
        yAxis: { type: 'value', name: 'SUM(delta_amount)' },
        series: [{
          name: 'delta_amount',
          type: 'bar',
          data: data.map(r => ({
            value: Number(r.total_delta) || 0,
            itemStyle: { color: Number(r.total_delta) === 0 ? '#10b981' : '#ef4444' }
          })),
          label: { show: true, position: 'top', formatter: '{c}' }
        }],
        grid: { left: '10%', right: '5%', bottom: '15%', top: '15%' }
      }

      chart.setOption(option)
      window.addEventListener('resize', () => chart.resize())
    }
  }))
})
