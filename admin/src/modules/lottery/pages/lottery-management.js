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
  useRedemptionMethods,
  useUserProfileState,
  useUserProfileMethods,
  // 新增模块 - P0/P1/P2/P3 优先级功能
  useAlertsState,
  useAlertsMethods,
  useRiskControlState,
  useRiskControlMethods,
  useReportState,
  useReportMethods,
  useDailyReportState,
  useDailyReportMethods,
  useBatchOperationsState,
  useBatchOperationsMethods,
  // P1-3: 预设可视化模块
  usePresetVisualizationState,
  usePresetVisualizationMethods,
  // P1-10: 系统垫付看板模块
  useSystemAdvanceState,
  useSystemAdvanceMethods
} from '../composables/index.js'

/**
 * 注册抽奖管理相关的 Alpine.js 组件
 * @function registerLotteryManagementComponents
 * @returns {void}
 */
function registerLotteryManagementComponents() {
  logger.debug('🔧 [LotteryManagement] 开始注册 Alpine 组件...')
  logger.debug('🔍 [LotteryManagement] Alpine 状态:', {
    Alpine: typeof Alpine,
    createPageMixin: typeof createPageMixin,
    AlpineData: typeof Alpine?.data
  })
  logger.info('[LotteryManagement] 注册 Alpine 组件 (ES Module v4.1)...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('❌ [LotteryManagement] 关键依赖未加载!', {
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

  // 全局 Store - 存储当前激活的子页面（默认为实时监控）
  Alpine.store('lotteryPage', 'lottery-metrics')

  /**
   * 抽奖管理导航组件 - 左侧侧边栏控制分类，右侧只显示子Tab
   * 降低运营人员思考成本：左侧选分类（监控/活动/策略/工具），右侧切换具体页面
   */
  Alpine.data('lotteryNavigation', () => ({
    ...createPageMixin(),

    // 当前激活的分类（由URL参数自动确定）
    active_category: 'monitor',
    // 当前激活的子Tab（具体页面）
    current_page: 'lottery-metrics',

    // 分类 -> 子Tab列表映射
    categoryTabs: {
      monitor: [
        { id: 'lottery-metrics', title: '实时监控', icon: '📊' },
        { id: 'daily-report', title: '运营日报', icon: '📋' },
        { id: 'lottery-risk-control', title: '风控面板', icon: '🛡️' },
        { id: 'system-advance', title: '系统垫付', icon: '💳' }
      ],
      activity: [
        { id: 'campaigns', title: '活动管理', icon: '🎁' },
        { id: 'prizes', title: '奖品管理', icon: '🏆' },
        { id: 'campaign-budget', title: '预算管理', icon: '💰' }
      ],
      strategy: [
        { id: 'lottery-strategy', title: '策略配置', icon: '⚙️' },
        { id: 'lottery-quota', title: '配额管理', icon: '📊' },
        { id: 'lottery-pricing', title: '定价配置', icon: '💵' },
        { id: 'preset-visualization', title: '预设可视化', icon: '🎯' },
        { id: 'strategy-effectiveness', title: '策略效果', icon: '📈' }
      ],
      tools: [
        { id: 'batch-operations', title: '批量操作', icon: '⚡' },
        { id: 'redemption-codes', title: '核销码管理', icon: '🎫' }
      ]
    },

    // 页面ID -> 分类的反向映射（根据URL自动定位分类）
    pageToCategory: {
      'lottery-metrics': 'monitor',
      'daily-report': 'monitor',
      'lottery-risk-control': 'monitor',
      'system-advance': 'monitor',
      'campaigns': 'activity',
      'prizes': 'activity',
      'campaign-budget': 'activity',
      'lottery-strategy': 'strategy',
      'lottery-quota': 'strategy',
      'lottery-pricing': 'strategy',
      'preset-visualization': 'strategy',
      'strategy-effectiveness': 'strategy',
      'batch-operations': 'tools',
      'redemption-codes': 'tools'
    },

    // 获取当前分类的子Tab列表（用于右侧Tab栏显示）
    get currentTabs() {
      return this.categoryTabs[this.active_category] || []
    },

    init() {
      logger.debug('🎯 [LotteryNavigation] init() 开始执行')
      if (!this.checkAuth()) {
        logger.debug('⚠️ [LotteryNavigation] checkAuth 返回 false，停止初始化')
        return
      }
      const urlParams = new URLSearchParams(window.location.search)
      const pageFromUrl = urlParams.get('page') || 'lottery-metrics'
      
      // 根据URL参数自动确定分类和子Tab
      this.current_page = pageFromUrl
      this.active_category = this.pageToCategory[pageFromUrl] || 'monitor'
      
      logger.debug('📍 [LotteryNavigation] 设置状态:', {
        active_category: this.active_category,
        current_page: this.current_page
      })
      Alpine.store('lotteryPage', this.current_page)
      logger.debug('✅ [LotteryNavigation] init() 完成')
    },

    // 切换子Tab（右侧Tab栏点击）
    switchPage(pageId) {
      this.current_page = pageId
      Alpine.store('lotteryPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  /**
   * 抽奖管理内容组件 - 使用 composables 组合
   */
  Alpine.data('lotteryPageContent', () => {
    // 预先调用所有 composables
    const pageMixin = createPageMixin({ userResolver: true })
    const campaignsState = useCampaignsState()
    const prizesState = usePrizesState()
    const budgetState = useBudgetState()
    const strategyState = useStrategyState()
    const quotaState = useQuotaState()
    const pricingState = usePricingState()
    const metricsState = useMetricsState()
    const redemptionState = useRedemptionState()
    const userProfileState = useUserProfileState()
    // 新增模块状态
    const alertsState = useAlertsState()
    const riskControlState = useRiskControlState()
    const reportState = useReportState()
    const dailyReportState = useDailyReportState()
    const batchOperationsState = useBatchOperationsState()
    // P1-3 & P1-10 模块状态
    const presetVisualizationState = usePresetVisualizationState()
    const systemAdvanceState = useSystemAdvanceState()

    // 预先调用所有方法 composables
    const campaignsMethods = useCampaignsMethods()
    const prizesMethods = usePrizesMethods()
    const budgetMethods = useBudgetMethods()
    const strategyMethods = useStrategyMethods()
    const quotaMethods = useQuotaMethods()
    const pricingMethods = usePricingMethods()
    const metricsMethods = useMetricsMethods()
    const redemptionMethods = useRedemptionMethods()
    const userProfileMethods = useUserProfileMethods()
    // 新增模块方法
    const alertsMethods = useAlertsMethods()
    const riskControlMethods = useRiskControlMethods()
    const reportMethods = useReportMethods()
    const dailyReportMethods = useDailyReportMethods()
    const batchOperationsMethods = useBatchOperationsMethods()
    // P1-3 & P1-10 模块方法
    const presetVisualizationMethods = usePresetVisualizationMethods()
    const systemAdvanceMethods = useSystemAdvanceMethods()

    // 合并所有状态和方法到返回对象
    const returnObj = {
      ...pageMixin,
      ...campaignsState,
      ...prizesState,
      ...budgetState,
      ...strategyState,
      ...quotaState,
      ...pricingState,
      ...metricsState,
      ...redemptionState,
      ...userProfileState,
      ...alertsState,
      ...riskControlState,
      ...reportState,
      ...dailyReportState,
      ...batchOperationsState,
      ...presetVisualizationState,
      ...systemAdvanceState,

      // ==================== 通用状态 ====================
      page: 1,
      page_size: 20,
      total_pages: 1,
      total: 0,
      saving: false,
      isEditMode: false,
      submitting: false,

      get current_page() {
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
        logger.debug('✅ [LotteryPageContent] init() 开始执行')
        logger.debug('📍 [LotteryPageContent] 当前页面:', this.current_page)
        // 关键诊断：检查 openCreateQuotaModal 是否存在
        logger.debug(
          '🔴 [CRITICAL] openCreateQuotaModal 存在:',
          typeof this.openCreateQuotaModal === 'function'
        )
        logger.debug('🔴 [CRITICAL] loadQuotas 存在:', typeof this.loadQuotas === 'function')
        logger.debug(
          '🔴 [CRITICAL] 所有配额方法:',
          ['openCreateQuotaModal', 'submitQuotaForm', 'deleteQuota', 'loadQuotas'].map(
            m => `${m}: ${typeof this[m]}`
          )
        )
        logger.debug('📊 [LotteryPageContent] this 对象属性列表:', Object.keys(this).slice(0, 50))
        logger.debug(
          '🔍 [LotteryPageContent] 所有方法:',
          Object.keys(this).filter(k => typeof this[k] === 'function')
        )
        this.loadPageData()
        this.$watch('$store.lotteryPage', newPage => {
          logger.debug('🔄 [LotteryPage] 页面切换到:', newPage)
          this.loadPageData()
        })
      },

      async loadPageData() {
        const page = this.current_page
        logger.debug('📂 [LotteryPage] loadPageData 被调用, page =', page)
        await this.withLoading(
          async () => {
            switch (page) {
              case 'campaigns':
                await this.loadCampaigns()
                await this.loadCampaignStats()
                break
              case 'prizes':
                await this.loadPrizes()
                // P2: 加载奖品发放统计
                await this.loadPrizeIssuedStats()
                // 加载活动列表供添加奖品时选择
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              case 'campaign-budget':
                await this.loadBudgetData()
                // P1: 初始化预算趋势图（如果有选中的活动）
                if (this.selectedBudgetCampaignId) {
                  await this.loadBudgetTrendData()
                  setTimeout(() => this.initBudgetTrendChart(), 200)
                }
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
                  logger.debug('📋 [LotteryPage] 配额管理页面加载活动列表...')
                  await this.loadCampaigns()
                }
                break
              case 'lottery-pricing':
                await this.loadPricingConfigs()
                // 🔧 修复：加载活动列表供定价配置选择活动
                if (!this.campaigns || this.campaigns.length === 0) {
                  logger.debug('📋 [LotteryPage] 定价配置页面加载活动列表...')
                  await this.loadCampaigns()
                }
                break
              case 'lottery-metrics':
                // 加载增强的监控数据（包含图表数据）
                await this.loadEnhancedMetrics()
                // 初始化图表（延迟执行确保 DOM 已渲染）
                setTimeout(() => this.initMonitoringCharts(), 200)
                // P3-4: 加载抽奖时段热力图
                await this.loadLotteryHeatmap(7)
                // 加载活动列表供指标筛选
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              case 'redemption-codes':
                logger.debug('🎫 [LotteryPage] 进入核销码管理页面')
                await this.loadStores()
                await this.loadRedemptionCodes()
                logger.debug('✅ [LotteryPage] 核销码数据加载完成')
                break
              // 告警中心已迁移至独立页面 /admin/lottery-alerts.html
              case 'lottery-risk-control':
                logger.debug('🛡️ [LotteryPage] 进入风控面板页面')
                await this.loadAbnormalUsers()
                break
              case 'strategy-effectiveness':
                logger.debug('📈 [LotteryPage] 进入策略效果分析页面')
                await this.loadStrategyEffectiveness()
                // 加载活动列表供选择
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              case 'daily-report':
                logger.debug('📋 [LotteryPage] 进入运营日报页面')
                await this.loadDailyReportPage()
                // 加载活动列表供筛选
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              case 'batch-operations':
                logger.debug('⚡ [LotteryPage] 进入批量操作工具页面')
                await this.loadBatchOperationLogs()
                // 加载活动列表供选择
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              // P1-3: 预设可视化
              case 'preset-visualization':
                logger.debug('🎯 [LotteryPage] 进入预设可视化页面')
                await this.loadPresetStats()
                await this.loadPresets()
                // 加载奖品列表供创建预设选择
                if (!this.prizes || this.prizes.length === 0) {
                  await this.loadPrizes()
                }
                // 将奖品列表转换为选项格式
                this.prizeOptions = (this.prizes || []).map(p => ({
                  value: p.lottery_prize_id || p.id,
                  label: p.name || p.prize_name || `奖品#${p.lottery_prize_id || p.id}`
                }))
                break
              // P1-10: 系统垫付看板
              case 'system-advance':
                logger.debug('💳 [LotteryPage] 进入系统垫付看板页面')
                await this.loadAdvanceDashboard()
                // 加载活动列表供筛选
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
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
      ...userProfileMethods,
      // 新增模块方法
      ...alertsMethods,
      ...riskControlMethods,
      ...reportMethods,
      ...dailyReportMethods,
      ...batchOperationsMethods,
      // P1-3 & P1-10 模块方法
      ...presetVisualizationMethods,
      ...systemAdvanceMethods,

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

      formatCurrency(value) {
        if (value === undefined || value === null) return '¥0.00'
        return `¥${parseFloat(value).toFixed(2)}`
      }
    }
    
    return returnObj
  })

  logger.info('[LotteryManagement] Alpine 组件注册完成')
}

// ==================== 组件注册 ====================

/**
 * 组件注册策略：
 * 
 * 问题分析：
 * - lottery-management.js 在 <head> 中作为 ES Module 加载
 * - main.js 中的 initAlpine() 在 DOMContentLoaded 事件中调用
 * - 当浏览器解析 HTML 中的 x-data="lotteryPageContent()" 时，Alpine.start() 还没被调用
 * 
 * 解决方案：
 * - 立即注册组件到 Alpine.data()
 * - 然后检查 Alpine 是否已启动，如果没有则调用 initAlpine()
 * - 这确保组件在 HTML 解析时就已经可用
 */

// 立即注册组件（模块加载时执行）
// 注意：Alpine.start() 由 main.js 的 DOMContentLoaded 统一触发
// 这里只注册组件，不调用 initAlpine()，避免双重 Alpine.start() 导致事件监听器重复
logger.debug('📦 [LotteryManagement] 模块加载，准备注册组件...')
try {
  registerLotteryManagementComponents()
  logger.debug('📦 [LotteryManagement] 组件注册完成，等待 main.js 触发 Alpine.start()')
} catch (error) {
  logger.error('[LotteryManagement] 组件注册失败:', error)
}

export { registerLotteryManagementComponents }
export default registerLotteryManagementComponents
