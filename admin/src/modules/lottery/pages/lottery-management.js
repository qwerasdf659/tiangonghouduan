/**
 * 抽奖管理整合页面 - 模块化重构版
 *
 * @file admin/src/modules/lottery/pages/lottery-management.js
 * @module LotteryManagementPage
 * @version 4.1.0
 * @date 2026-01-24
 * @author Admin System
 *
 * @description
 * 抽奖系统管理中心，通过 composables 模块化管理以下子功能：
 * - 活动管理（campaigns）
 * - 奖品管理（prizes）
 * - 预算管理（budget）
 * - 策略配置（strategy）
 * - 配额管理（quota）
 * - 定价配置（pricing）
 * - 抽奖监控（metrics）
 * - 核销码管理（redemption）
 */

// ES Module 导入（替代 window.xxx 全局变量）
import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'

// 导入所有 composables 模块
import {
  useCampaignsState,
  useCampaignsMethods,
  usePrizesState,
  usePrizesMethods,
  useBudgetState,
  useBudgetMethods,
  useStrategyState,
  useStrategyMethods,
  useQuotaState,
  useQuotaMethods,
  usePricingState,
  usePricingMethods,
  useMetricsState,
  useMetricsMethods,
  useRedemptionState,
  useRedemptionMethods
} from '../composables/index.js'

/**
 * 注册抽奖管理相关的 Alpine.js 组件
 * @function registerLotteryManagementComponents
 * @returns {void}
 */
function registerLotteryManagementComponents() {
  logger.info('[LotteryManagement] 注册 Alpine 组件 (ES Module v4.1)...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[LotteryManagement] 关键依赖未加载')
    return
  }

  // 全局 Store - 存储当前激活的子页面
  Alpine.store('lotteryPage', 'campaigns')

  /**
   * 抽奖管理导航组件
   */
  Alpine.data('lotteryNavigation', () => ({
    ...createPageMixin(),

    currentPage: 'campaigns',

    subPages: [
      { id: 'campaigns', title: '活动管理', icon: 'bi-gift' },
      { id: 'prizes', title: '奖品管理', icon: 'bi-trophy' },
      { id: 'campaign-budget', title: '预算管理', icon: 'bi-cash-stack' },
      { id: 'lottery-strategy', title: '策略配置', icon: 'bi-gear' },
      { id: 'lottery-quota', title: '配额管理', icon: 'bi-bar-chart-steps' },
      { id: 'lottery-pricing', title: '定价配置', icon: 'bi-currency-dollar' },
      { id: 'lottery-metrics', title: '抽奖指标', icon: 'bi-speedometer' },
      { id: 'redemption-codes', title: '核销码管理', icon: 'bi-ticket-perforated' }
    ],

    init() {
      logger.debug('✅ 抽奖管理导航初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'campaigns'
      Alpine.store('lotteryPage', this.currentPage)
    },

    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('lotteryPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  /**
   * 抽奖管理内容组件 - 使用 composables 组合
   */
  Alpine.data('lotteryPageContent', () => ({
    // 基础混入
    ...createPageMixin(),

    // ==================== 从 Composables 导入状态 ====================
    ...useCampaignsState(),
    ...usePrizesState(),
    ...useBudgetState(),
    ...useStrategyState(),
    ...useQuotaState(),
    ...usePricingState(),
    ...useMetricsState(),
    ...useRedemptionState(),

    // ==================== 通用状态 ====================
    page: 1,
    pageSize: 20,
    totalPages: 1,
    total: 0,
    saving: false,
    isEditMode: false,
    submitting: false,

    get currentPage() {
      return Alpine.store('lotteryPage')
    },

    // ==================== 初始化和数据加载 ====================

    init() {
      logger.debug('✅ 抽奖管理内容初始化 (模块化)')
      this.loadPageData()
      this.$watch('$store.lotteryPage', () => this.loadPageData())
    },

    async loadPageData() {
      const page = this.currentPage
      await this.withLoading(
        async () => {
          switch (page) {
            case 'campaigns':
              await this.loadCampaigns()
              await this.loadCampaignStats()
              break
            case 'prizes':
              await this.loadPrizes()
              break
            case 'campaign-budget':
              await this.loadBudgetData()
              break
            case 'lottery-strategy':
              await this.loadStrategies()
              await this.loadTierMatrix()
              break
            case 'lottery-quota':
              await this.loadQuotas()
              break
            case 'lottery-pricing':
              await this.loadPricingConfigs()
              break
            case 'lottery-metrics':
              await this.loadLotteryMetrics()
              break
            case 'redemption-codes':
              await this.loadStores()
              await this.loadRedemptionCodes()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 从 Composables 导入方法 ====================
    ...useCampaignsMethods(),
    ...usePrizesMethods(),
    ...useBudgetMethods(),
    ...useStrategyMethods(),
    ...useQuotaMethods(),
    ...usePricingMethods(),
    ...useMetricsMethods(),
    ...useRedemptionMethods(),

    // ==================== 工具方法 ====================

    formatDateTimeLocal(dateString) {
      if (!dateString) return ''
      try {
        const date = new Date(dateString)
        return date.toISOString().slice(0, 16)
      } catch {
        return ''
      }
    },

    formatDate(dateString) {
      if (!dateString) return '-'
      try {
        const date = new Date(dateString)
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return dateString
      }
    },

    formatCurrency(value) {
      if (value === undefined || value === null) return '¥0.00'
      return `¥${parseFloat(value).toFixed(2)}`
    }
  }))

  logger.info('[LotteryManagement] Alpine 组件注册完成')
}

// ==================== 事件监听 ====================

document.addEventListener('alpine:init', () => {
  registerLotteryManagementComponents()
})

export { registerLotteryManagementComponents }
export default registerLotteryManagementComponents
