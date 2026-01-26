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
  // 使用 console.log 确保输出不受 logger 级别限制
  console.log('🔧 [LotteryManagement] 开始注册 Alpine 组件...')
  console.log('🔍 [LotteryManagement] Alpine 状态:', {
    Alpine: typeof Alpine,
    createPageMixin: typeof createPageMixin,
    AlpineData: typeof Alpine?.data
  })
  logger.info('[LotteryManagement] 注册 Alpine 组件 (ES Module v4.1)...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    console.error('❌ [LotteryManagement] 关键依赖未加载!')
    logger.error('[LotteryManagement] 关键依赖未加载', {
      Alpine: !!Alpine,
      createPageMixin: typeof createPageMixin
    })
    return
  }

  // 调试：验证 composables 返回正确的对象
  logger.debug('[LotteryManagement] 验证 composables...', {
    useCampaignsState: typeof useCampaignsState,
    usePrizesState: typeof usePrizesState,
    useBudgetState: typeof useBudgetState,
    useStrategyState: typeof useStrategyState
  })

  // 全局 Store - 存储当前激活的子页面
  Alpine.store('lotteryPage', 'campaigns')

  /**
   * 抽奖管理导航组件
   */
  Alpine.data('lotteryNavigation', () => ({
    ...createPageMixin(),

    currentPage: 'campaigns',

    subPages: [
      { id: 'campaigns', title: '活动管理', icon: '🎁' },
      { id: 'prizes', title: '奖品管理', icon: '🏆' },
      { id: 'campaign-budget', title: '预算管理', icon: '💰' },
      { id: 'lottery-strategy', title: '策略配置', icon: '⚙️' },
      { id: 'lottery-quota', title: '配额管理', icon: '📊' },
      { id: 'lottery-pricing', title: '定价配置', icon: '💵' },
      { id: 'lottery-metrics', title: '抽奖指标', icon: '📈' },
      { id: 'redemption-codes', title: '核销码管理', icon: '🎫' }
    ],

    init() {
      console.log('🎯 [LotteryNavigation] init() 开始执行')
      logger.debug('✅ 抽奖管理导航初始化')
      if (!this.checkAuth()) {
        console.log('⚠️ [LotteryNavigation] checkAuth 返回 false，停止初始化')
        return
      }
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'campaigns'
      console.log('📍 [LotteryNavigation] 设置当前页面:', this.currentPage)
      Alpine.store('lotteryPage', this.currentPage)
      console.log('✅ [LotteryNavigation] init() 完成，store 已更新')
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
  Alpine.data('lotteryPageContent', () => {
    // 预先调用所有 composables 并验证
    const pageMixin = createPageMixin()
    const campaignsState = useCampaignsState()
    const prizesState = usePrizesState()
    const budgetState = useBudgetState()
    const strategyState = useStrategyState()
    const quotaState = useQuotaState()
    const pricingState = usePricingState()
    const metricsState = useMetricsState()
    const redemptionState = useRedemptionState()

    // 预先调用所有方法 composables
    const campaignsMethods = useCampaignsMethods()
    const prizesMethods = usePrizesMethods()
    const budgetMethods = useBudgetMethods()
    const strategyMethods = useStrategyMethods()
    const quotaMethods = useQuotaMethods()
    const pricingMethods = usePricingMethods()
    const metricsMethods = useMetricsMethods()
    const redemptionMethods = useRedemptionMethods()

    // 调试日志 - 检查 quotaMethods
    console.log('[Quota Debug] quotaMethods keys:', Object.keys(quotaMethods || {}))
    console.log(
      '[Quota Debug] has openCreateQuotaModal:',
      typeof quotaMethods?.openCreateQuotaModal
    )

    logger.debug('[LotteryPageContent] Composable check:', {
      pageMixin: Object.keys(pageMixin || {}),
      quotaMethods: Object.keys(quotaMethods || {}),
      redemptionMethods: Object.keys(redemptionMethods || {})
    })

    return {
      // 基础混入
      ...pageMixin,

      // ==================== 从 Composables 导入状态 ====================
      ...campaignsState,
      ...prizesState,
      ...budgetState,
      ...strategyState,
      ...quotaState,
      ...pricingState,
      ...metricsState,
      ...redemptionState,

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

      /**
       * 是否全选核销码（getter必须在主组件中定义，确保this上下文正确）
       * @returns {boolean}
       */
      get isAllRedemptionSelected() {
        const codes = this.redemptionCodes || []
        const selectedIds = this.redemptionSelectedIds || []
        return codes.length > 0 && selectedIds.length === codes.length
      },

      // ==================== 初始化和数据加载 ====================

      init() {
        console.log('✅ [LotteryPageContent] init() 开始执行')
        console.log('📍 [LotteryPageContent] 当前页面:', this.currentPage)
        // 关键诊断：检查 openCreateQuotaModal 是否存在
        console.log(
          '🔴 [CRITICAL] openCreateQuotaModal 存在:',
          typeof this.openCreateQuotaModal === 'function'
        )
        console.log('🔴 [CRITICAL] loadQuotas 存在:', typeof this.loadQuotas === 'function')
        console.log(
          '🔴 [CRITICAL] 所有配额方法:',
          ['openCreateQuotaModal', 'editQuota', 'submitQuotaForm', 'deleteQuota', 'loadQuotas'].map(
            m => `${m}: ${typeof this[m]}`
          )
        )
        console.log('📊 [LotteryPageContent] this 对象属性列表:', Object.keys(this).slice(0, 50))
        console.log(
          '🔍 [LotteryPageContent] 所有方法:',
          Object.keys(this).filter(k => typeof this[k] === 'function')
        )
        this.loadPageData()
        this.$watch('$store.lotteryPage', newPage => {
          console.log('🔄 [LotteryPage] 页面切换到:', newPage)
          this.loadPageData()
        })
      },

      async loadPageData() {
        const page = this.currentPage
        console.log('📂 [LotteryPage] loadPageData 被调用, page =', page)
        await this.withLoading(
          async () => {
            switch (page) {
              case 'campaigns':
                await this.loadCampaigns()
                await this.loadCampaignStats()
                break
              case 'prizes':
                await this.loadPrizes()
                // 加载活动列表供添加奖品时选择
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              case 'campaign-budget':
                await this.loadBudgetData()
                // 加载活动列表供预算管理选择
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              case 'lottery-strategy':
                await this.loadStrategies()
                await this.loadTierMatrix()
                // 加载活动列表供策略配置选择
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              case 'lottery-quota':
                await this.loadQuotas()
                // 🔧 修复：加载活动列表供配额规则选择活动
                if (!this.campaigns || this.campaigns.length === 0) {
                  console.log('📋 [LotteryPage] 配额管理页面加载活动列表...')
                  await this.loadCampaigns()
                }
                break
              case 'lottery-pricing':
                await this.loadPricingConfigs()
                // 🔧 修复：加载活动列表供定价配置选择活动
                if (!this.campaigns || this.campaigns.length === 0) {
                  console.log('📋 [LotteryPage] 定价配置页面加载活动列表...')
                  await this.loadCampaigns()
                }
                break
              case 'lottery-metrics':
                await this.loadLotteryMetrics()
                // 加载活动列表供指标筛选
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              case 'redemption-codes':
                console.log('🎫 [LotteryPage] 进入核销码管理页面')
                await this.loadStores()
                await this.loadRedemptionCodes()
                console.log('✅ [LotteryPage] 核销码数据加载完成')
                break
            }
          },
          { loadingText: '加载数据...' }
        )
      },

      // ==================== 从 Composables 导入方法 ====================
      ...campaignsMethods,
      ...prizesMethods,
      ...budgetMethods,
      ...strategyMethods,
      ...quotaMethods,
      ...pricingMethods,
      ...metricsMethods,
      ...redemptionMethods,

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
      },

      /**
       * 安全格式化日期显示
       * @param {string} dateStr - ISO日期字符串
       * @returns {string} 本地化日期字符串
       */
      formatDateSafe(dateStr) {
        if (!dateStr) return '-'
        try {
          const date = new Date(dateStr)
          if (isNaN(date.getTime())) return dateStr
          return date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
        } catch {
          return dateStr
        }
      }
    }
  })

  logger.info('[LotteryManagement] Alpine 组件注册完成')
}

// ==================== 组件注册 ====================

/**
 * 组件注册策略：
 * 由于 ES 模块的导入顺序问题（Alpine.start() 在导入时执行），
 * 需要立即注册组件，而不是等待 alpine:init 事件
 */

// 立即注册组件（模块加载时执行）
console.log('📦 [LotteryManagement] 模块加载，准备注册组件...')
try {
  registerLotteryManagementComponents()
  console.log('✅ [LotteryManagement] 组件注册成功完成!')
} catch (error) {
  console.error('❌ [LotteryManagement] 组件注册失败:', error)
}

export { registerLotteryManagementComponents }
export default registerLotteryManagementComponents
