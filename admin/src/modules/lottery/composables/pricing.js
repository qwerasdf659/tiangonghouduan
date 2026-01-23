/**
 * 定价配置模块
 *
 * @file admin/src/modules/lottery/composables/pricing.js
 * @description 抽奖定价配置和版本管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL } from '../../../api/base.js'

/**
 * 定价配置状态
 * @returns {Object} 状态对象
 */
export function usePricingState() {
  return {
    /** @type {Array} 定价配置列表 */
    pricingConfigs: [],
    /** @type {Array} 定价版本列表 */
    pricingVersions: [],
    /** @type {Object} 定价筛选条件 */
    pricingFilters: { campaignCode: '', status: '' },
    /** @type {Object} 定价表单 */
    pricingForm: {
      campaign_code: '',
      price_per_draw: 0,
      discount_rate: 1.0,
      min_purchase: 1,
      max_purchase: 10,
      effective_from: '',
      effective_to: ''
    },
    /** @type {number|string|null} 当前编辑的定价ID */
    editingPricingId: null,
    /** @type {boolean} 是否编辑模式 */
    isEditPricing: false,
    /** @type {Object|null} 选中的定价活动 */
    selectedPricingCampaign: null
  }
}

/**
 * 定价配置方法
 * @returns {Object} 方法对象
 */
export function usePricingMethods() {
  return {
    /**
     * 加载定价配置列表
     */
    async loadPricingConfigs() {
      try {
        const response = await this.apiGet(LOTTERY_ENDPOINTS.PRICING_GET)
        if (response?.success) {
          const pricingData = response.data?.list || response.data?.configs || response.data
          this.pricingConfigs = Array.isArray(pricingData) ? pricingData : []
          logger.debug('[LotteryManagement] 定价配置数量:', this.pricingConfigs.length)
        }
      } catch (error) {
        logger.error('加载定价配置失败:', error)
        this.pricingConfigs = []
      }
    },

    /**
     * 加载定价版本历史
     * @param {string} campaignCode - 活动代码
     */
    async loadPricingVersions(campaignCode) {
      if (!campaignCode) return
      try {
        const endpoint = buildURL(LOTTERY_ENDPOINTS.PRICING_VERSIONS, { code: campaignCode })
        const response = await this.apiGet(endpoint)
        if (response?.success) {
          this.pricingVersions = response.data?.versions || response.data || []
        }
      } catch (error) {
        logger.error('加载定价版本失败:', error)
        this.pricingVersions = []
      }
    },

    /**
     * 打开创建定价模态框
     */
    openCreatePricingModal() {
      this.isEditPricing = false
      this.pricingForm = {
        campaign_code: '',
        price_per_draw: 0,
        discount_rate: 1.0,
        min_purchase: 1,
        max_purchase: 10,
        effective_from: '',
        effective_to: ''
      }
      this.showModal('pricingModal')
    },

    /**
     * 编辑定价配置
     * @param {Object} pricing - 定价配置对象
     */
    editPricing(pricing) {
      this.isEditPricing = true
      this.editingPricingId = pricing.pricing_id || pricing.id
      this.pricingForm = {
        campaign_code: pricing.campaign_code || '',
        price_per_draw: pricing.price_per_draw || 0,
        discount_rate: pricing.discount_rate || 1.0,
        min_purchase: pricing.min_purchase || 1,
        max_purchase: pricing.max_purchase || 10,
        effective_from: pricing.effective_from || '',
        effective_to: pricing.effective_to || ''
      }
      this.showModal('pricingModal')
    },

    /**
     * 保存定价配置
     */
    async savePricing() {
      if (!this.pricingForm.campaign_code) {
        this.showError('请选择活动')
        return
      }
      if (!this.pricingForm.price_per_draw || this.pricingForm.price_per_draw <= 0) {
        this.showError('请输入有效的单次抽奖价格')
        return
      }

      this.saving = true
      try {
        const endpoint = this.isEditPricing
          ? buildURL(LOTTERY_ENDPOINTS.PRICING_CREATE, { code: this.pricingForm.campaign_code })
          : buildURL(LOTTERY_ENDPOINTS.PRICING_CREATE, { code: this.pricingForm.campaign_code })

        const response = await this.apiCall(endpoint, {
          method: this.isEditPricing ? 'PUT' : 'POST',
          data: this.pricingForm
        })

        if (response?.success) {
          this.showSuccess(this.isEditPricing ? '定价配置更新成功' : '定价配置创建成功')
          this.hideModal('pricingModal')
          await this.loadPricingConfigs()
        }
      } catch (error) {
        this.showError('保存定价配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 激活定价版本
     * @param {Object} pricing - 定价配置对象
     * @param {number|string} version - 版本号
     */
    async activatePricing(pricing, version) {
      await this.confirmAndExecute(
        `确认激活定价版本 v${version}？`,
        async () => {
          const endpoint = buildURL(LOTTERY_ENDPOINTS.PRICING_ACTIVATE, {
            code: pricing.campaign_code,
            version: version
          })
          const response = await this.apiCall(endpoint, { method: 'POST' })
          if (response?.success) {
            await this.loadPricingConfigs()
          }
        },
        { successMessage: '定价版本已激活' }
      )
    },

    /**
     * 归档定价版本
     * @param {Object} pricing - 定价配置对象
     * @param {number|string} version - 版本号
     */
    async archivePricing(pricing, version) {
      await this.confirmAndExecute(
        `确认归档定价版本 v${version}？归档后将无法使用。`,
        async () => {
          const endpoint = buildURL(LOTTERY_ENDPOINTS.PRICING_ARCHIVE, {
            code: pricing.campaign_code,
            version: version
          })
          const response = await this.apiCall(endpoint, { method: 'POST' })
          if (response?.success) {
            await this.loadPricingConfigs()
          }
        },
        { successMessage: '定价版本已归档', confirmText: '确认归档' }
      )
    },

    /**
     * 查看定价版本历史
     * @param {Object} pricing - 定价配置对象
     */
    viewPricingVersions(pricing) {
      this.selectedPricingCampaign = pricing
      this.loadPricingVersions(pricing.campaign_code)
      this.showModal('pricingVersionsModal')
    },

    /**
     * 搜索定价配置
     */
    searchPricing() {
      this.loadPricingConfigs()
    },

    /**
     * 重置定价筛选条件
     */
    resetPricingFilters() {
      this.pricingFilters = { campaignCode: '', status: '' }
      this.loadPricingConfigs()
    },

    /**
     * 获取定价状态CSS类
     * @param {string} status - 定价状态代码
     * @returns {string} CSS类名
     */
    getPricingStatusClass(status) {
      const classes = {
        active: 'bg-success',
        draft: 'bg-warning text-dark',
        archived: 'bg-secondary',
        scheduled: 'bg-info'
      }
      return classes[status] || 'bg-secondary'
    },

    /**
     * 获取定价状态文本
     * @param {string} status - 定价状态代码
     * @returns {string} 状态文本
     */
    getPricingStatusText(status) {
      const labels = {
        active: '生效中',
        draft: '草稿',
        archived: '已归档',
        scheduled: '待生效'
      }
      return labels[status] || status
    }
  }
}

export default { usePricingState, usePricingMethods }

