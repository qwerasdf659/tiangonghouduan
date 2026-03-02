/**
 * 广告定价配置 Composable
 *
 * 管理 DAU 系数档位、阶梯折扣规则、动态底价配置的 CRUD。
 * 数据通过 /api/v4/console/ad-pricing/ 端点读写。
 *
 * @module admin/src/modules/content/composables/ad-pricing
 */

import { request, buildURL } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { logger } from '../../../utils/logger.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'

/**
 * 广告定价配置状态管理
 *
 * @returns {Object} 定价配置状态和方法
 */
export function useAdPricingState() {
  return {
    pricing_loading: false,
    pricing_saving: false,

    dau_pricing_enabled: false,
    dau_coefficient_tiers: [],
    discount_enabled: false,
    discount_tiers: [],
    floor_price_config: {
      enabled: false,
      lookback_days: 7,
      floor_ratio: 0.5,
      fallback_prices: {}
    },

    current_coefficient: null,
    dau_stats: [],

    dau_chart_days: 30,
    preview_slot_id: null,
    preview_days: 1,
    preview_result: null,

    new_dau_tier: { max_dau: '', coefficient: '', label: '' },
    new_discount_tier: { min_days: '', discount: '', label: '' },

    /**
     * 加载所有定价配置
     *
     * @returns {Promise<void>}
     */
    async loadPricingConfig() {
      this.pricing_loading = true
      try {
        const res = await request({
          url: SYSTEM_ENDPOINTS.AD_PRICING_CONFIG,
          method: 'GET'
        })
        if (res.success && res.data) {
          this.dau_pricing_enabled = res.data.ad_dau_pricing_enabled === true || res.data.ad_dau_pricing_enabled === 'true'
          this.dau_coefficient_tiers = Array.isArray(res.data.ad_dau_coefficient_tiers)
            ? res.data.ad_dau_coefficient_tiers
            : JSON.parse(res.data.ad_dau_coefficient_tiers || '[]')
          this.discount_enabled = res.data.ad_discount_enabled === true || res.data.ad_discount_enabled === 'true'
          this.discount_tiers = Array.isArray(res.data.ad_consecutive_discount_tiers)
            ? res.data.ad_consecutive_discount_tiers
            : JSON.parse(res.data.ad_consecutive_discount_tiers || '[]')
          const floorCfg = res.data.ad_dynamic_floor_price_config
          this.floor_price_config = typeof floorCfg === 'string' ? JSON.parse(floorCfg) : (floorCfg || this.floor_price_config)
        }
      } catch (error) {
        logger.error('[AdPricing] 加载配置失败', error)
        this.showError('加载定价配置失败: ' + error.message)
      } finally {
        this.pricing_loading = false
      }
    },

    /**
     * 保存单个配置项
     *
     * @param {string} config_key - 配置键
     * @param {*} config_value - 配置值
     * @returns {Promise<void>}
     */
    async savePricingConfigItem(config_key, config_value) {
      this.pricing_saving = true
      try {
        const res = await request({
          url: buildURL(SYSTEM_ENDPOINTS.AD_PRICING_CONFIG_UPDATE, { config_key }),
          method: 'PUT',
          data: { config_value }
        })
        if (res.success) {
          this.showSuccess('配置已保存')
        } else {
          this.showError('保存失败: ' + res.message)
        }
      } catch (error) {
        this.showError('保存失败: ' + error.message)
      } finally {
        this.pricing_saving = false
      }
    },

    /** 保存 DAU 系数总开关 */
    async toggleDauPricing() {
      await this.savePricingConfigItem('ad_dau_pricing_enabled', this.dau_pricing_enabled)
    },

    /** 保存 DAU 系数档位 */
    async saveDauTiers() {
      await this.savePricingConfigItem('ad_dau_coefficient_tiers', this.dau_coefficient_tiers)
    },

    /** 添加 DAU 系数档位 */
    addDauTier() {
      const tier = this.new_dau_tier
      if (!tier.coefficient || tier.coefficient <= 0) {
        this.showError('系数必须大于 0')
        return
      }
      this.dau_coefficient_tiers.push({
        max_dau: tier.max_dau ? parseInt(tier.max_dau) : null,
        coefficient: parseFloat(tier.coefficient),
        label: tier.label || ''
      })
      this.new_dau_tier = { max_dau: '', coefficient: '', label: '' }
      this.saveDauTiers()
    },

    /** 删除 DAU 系数档位 */
    removeDauTier(index) {
      this.dau_coefficient_tiers.splice(index, 1)
      this.saveDauTiers()
    },

    /** 保存折扣总开关 */
    async toggleDiscount() {
      await this.savePricingConfigItem('ad_discount_enabled', this.discount_enabled)
    },

    /** 保存折扣规则 */
    async saveDiscountTiers() {
      await this.savePricingConfigItem('ad_consecutive_discount_tiers', this.discount_tiers)
    },

    /** 添加折扣档位 */
    addDiscountTier() {
      const tier = this.new_discount_tier
      if (!tier.min_days || !tier.discount) {
        this.showError('天数和折扣率必填')
        return
      }
      this.discount_tiers.push({
        min_days: parseInt(tier.min_days),
        discount: parseFloat(tier.discount),
        label: tier.label || ''
      })
      this.new_discount_tier = { min_days: '', discount: '', label: '' }
      this.saveDiscountTiers()
    },

    /** 删除折扣档位 */
    removeDiscountTier(index) {
      this.discount_tiers.splice(index, 1)
      this.saveDiscountTiers()
    },

    /** 保存动态底价配置 */
    async saveFloorPriceConfig() {
      await this.savePricingConfigItem('ad_dynamic_floor_price_config', this.floor_price_config)
    },

    /** 加载当前 DAU 系数 */
    async loadCurrentCoefficient() {
      try {
        const res = await request({
          url: SYSTEM_ENDPOINTS.AD_PRICING_COEFFICIENT,
          method: 'GET'
        })
        if (res.success) {
          this.current_coefficient = res.data
        }
      } catch (error) {
        logger.error('[AdPricing] 加载 DAU 系数失败', error)
      }
    },

    /** 加载 DAU 趋势数据并渲染折线图 */
    async loadDauStats(days) {
      try {
        const res = await request({
          url: SYSTEM_ENDPOINTS.AD_PRICING_DAU_STATS + '?days=' + (days || 30),
          method: 'GET'
        })
        if (res.success) {
          this.dau_stats = res.data.stats || []
          this.$nextTick(() => this.renderDauChart())
        }
      } catch (error) {
        logger.error('[AdPricing] 加载 DAU 统计失败', error)
      }
    },

    /**
     * 渲染 DAU 趋势折线图（ECharts）
     *
     * 双 Y 轴：左侧 DAU 人数（柱状图）、右侧 DAU 系数（折线图）
     */
    async renderDauChart() {
      const container = document.getElementById('dauTrendChart')
      if (!container || !this.dau_stats.length) return

      try {
        const echarts = await loadECharts()
        let chart = echarts.getInstanceByDom(container)
        if (!chart) chart = echarts.init(container)

        const dates = this.dau_stats.map(s => s.stat_date)
        const dauCounts = this.dau_stats.map(s => s.dau_count || 0)
        const coefficients = this.dau_stats.map(s =>
          s.dau_coefficient !== null && s.dau_coefficient !== undefined
            ? parseFloat(s.dau_coefficient) : 1.0
        )

        chart.setOption({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
          },
          legend: { data: ['DAU 人数', 'DAU 系数'] },
          grid: { left: 60, right: 60, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: dates },
          yAxis: [
            { type: 'value', name: 'DAU 人数', min: 0 },
            { type: 'value', name: 'DAU 系数', min: 0, max: 2, splitLine: { show: false } }
          ],
          series: [
            {
              name: 'DAU 人数',
              type: 'bar',
              yAxisIndex: 0,
              data: dauCounts,
              itemStyle: { color: '#6366f1' }
            },
            {
              name: 'DAU 系数',
              type: 'line',
              yAxisIndex: 1,
              data: coefficients,
              itemStyle: { color: '#f59e0b' },
              lineStyle: { width: 2 },
              symbol: 'circle',
              symbolSize: 6
            }
          ]
        })

        logger.info('[AdPricing] DAU 趋势图表已渲染', { data_points: dates.length })
      } catch (error) {
        logger.warn('[AdPricing] 渲染 DAU 图表失败:', error.message)
      }
    },

    /** 价格预览计算 */
    async calculatePreview() {
      if (!this.preview_slot_id) {
        this.showError('请选择广告位')
        return
      }
      try {
        const res = await request({
          url: SYSTEM_ENDPOINTS.AD_PRICING_PREVIEW + '?ad_slot_id=' + this.preview_slot_id + '&days=' + (this.preview_days || 1),
          method: 'GET'
        })
        if (res.success) {
          this.preview_result = res.data
        }
      } catch (error) {
        this.showError('价格预览失败: ' + error.message)
      }
    }
  }
}
