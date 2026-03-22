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
 */

// ES Module 导入（替代 window.xxx 全局变量）
import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin, dataTable } from '../../../alpine/index.js'
import { request, API_PREFIX } from '../../../api/base.js'

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
  // P1-3: 预设可视化模块 → 已迁移到 presets.html（抽奖干预管理页面）
  // P1-10: 系统垫付看板模块
  useSystemAdvanceState,
  useSystemAdvanceMethods,
  // 活动投放位置配置模块（多活动抽奖系统 2026-02-15）
  usePlacementState,
  usePlacementMethods,
  // 策略效果模拟分析模块（2026-02-20 Monte Carlo 模拟引擎）
  useStrategySimulationState,
  useStrategySimulationMethods
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
        { id: 'campaign-budget', title: '预算管理', icon: '💰' },
        { id: 'campaign-placement', title: '投放位置', icon: '📍' }
      ],
      strategy: [
        { id: 'lottery-strategy', title: '策略配置', icon: '⚙️' },
        { id: 'activity-strategy-switch', title: '活动策略开关', icon: '🔧' },
        { id: 'segment-rules', title: '分群策略', icon: '👥' },
        { id: 'lottery-quota', title: '配额管理', icon: '📊' },
        { id: 'lottery-pricing', title: '定价配置', icon: '💵' },
        { id: 'strategy-effectiveness', title: '策略效果', icon: '📈' },
        { id: 'strategy-simulation', title: '策略模拟', icon: '🧪' }
      ],
      tools: [
        { id: 'batch-operations', title: '批量操作', icon: '⚡' }
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
      'campaign-placement': 'activity',
      'lottery-strategy': 'strategy',
      'activity-strategy-switch': 'strategy',
      'segment-rules': 'strategy',
      'lottery-quota': 'strategy',
      'lottery-pricing': 'strategy',
      'strategy-effectiveness': 'strategy',
      'strategy-simulation': 'strategy',
      'batch-operations': 'tools'
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
    const userProfileState = useUserProfileState()
    // 新增模块状态
    const alertsState = useAlertsState()
    const riskControlState = useRiskControlState()
    const reportState = useReportState()
    const dailyReportState = useDailyReportState()
    const batchOperationsState = useBatchOperationsState()
    // P1-10 系统垫付看板模块状态
    const systemAdvanceState = useSystemAdvanceState()
    // 活动投放位置配置状态
    const placementState = usePlacementState()
    // 策略效果模拟分析状态
    const simulationState = useStrategySimulationState()

    // 预先调用所有方法 composables
    const campaignsMethods = useCampaignsMethods()
    const prizesMethods = usePrizesMethods()
    const budgetMethods = useBudgetMethods()
    const strategyMethods = useStrategyMethods()
    const quotaMethods = useQuotaMethods()
    const pricingMethods = usePricingMethods()
    const metricsMethods = useMetricsMethods()
    const userProfileMethods = useUserProfileMethods()
    // 新增模块方法
    const alertsMethods = useAlertsMethods()
    const riskControlMethods = useRiskControlMethods()
    const reportMethods = useReportMethods()
    const dailyReportMethods = useDailyReportMethods()
    const batchOperationsMethods = useBatchOperationsMethods()
    // P1-10 系统垫付看板模块方法
    const systemAdvanceMethods = useSystemAdvanceMethods()
    // 活动投放位置配置方法
    const placementMethods = usePlacementMethods()
    // 策略效果模拟分析方法
    const simulationMethods = useStrategySimulationMethods()

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
      ...userProfileState,
      ...alertsState,
      ...riskControlState,
      ...reportState,
      ...dailyReportState,
      ...batchOperationsState,
      ...systemAdvanceState,
      ...placementState,
      ...simulationState,

      // ==================== 分群策略管理状态（任务3前端） ====================
      /** @type {Array} 分群策略版本列表 */
      segmentRuleVersions: [],
      /** @type {Object|null} 当前编辑的策略版本 */
      editingSegmentRule: null,
      /** @type {Object} 字段注册表（可选字段 + 运算符） */
      segmentFieldRegistry: { fields: {}, operators: {} },
      /** @type {Object|null} 分群测试结果 */
      segmentTestResult: null,
      /** @type {Object} 分群测试输入数据 */
      segmentTestInput: { registration_days: 30, points: 0, user_level: 'normal', fail_count: 0 },

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
                // 加载全局默认配置（用于活动编辑弹窗中的优先级可视化提示）
                await this.loadGlobalDefaults()
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
              // 告警中心已迁移至独立页面 /admin/lottery-alerts.html
              case 'lottery-risk-control':
                logger.debug('🛡️ [LotteryPage] 进入风控面板页面')
                await this.loadAbnormalUsers()
                break
              case 'strategy-simulation':
                logger.debug('🧪 [LotteryPage] 进入策略模拟分析页面')
                await this.loadSimulationBaseline()
                await this.loadSimulationHistory()
                break
              case 'segment-rules':
                logger.debug('👥 [LotteryPage] 进入分群策略管理页面')
                await this.loadSegmentRules()
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
              // P1-3: 预设可视化 → 已迁移到 presets.html（抽奖干预管理页面）
              // P1-10: 系统垫付看板
              case 'system-advance':
                logger.debug('💳 [LotteryPage] 进入系统垫付看板页面')
                await this.loadAdvanceDashboard()
                // 加载活动列表供筛选
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              // 9策略活动级开关配置
              case 'activity-strategy-switch':
                logger.debug('🔧 [LotteryPage] 进入活动策略开关页面')
                if (!this.campaigns || this.campaigns.length === 0) {
                  await this.loadCampaigns()
                }
                break
              // 活动投放位置配置
              case 'campaign-placement':
                logger.debug('📍 [LotteryPage] 进入活动投放位置配置页面')
                await this.loadPlacements()
                // 加载活动列表供选择活动代码
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
      ...userProfileMethods,
      // 新增模块方法
      ...alertsMethods,
      ...riskControlMethods,
      ...reportMethods,
      ...dailyReportMethods,
      ...batchOperationsMethods,
      // P1-10 系统垫付看板模块方法
      ...systemAdvanceMethods,
      // 活动投放位置配置方法
      ...placementMethods,
      ...simulationMethods,

      // ==================== 分群策略管理方法（任务3前端） ====================

      /** 加载所有分群策略版本 */
      async loadSegmentRules() {
        try {
          const response = await this.apiGet(
            `${API_PREFIX}/console/segment-rules`, {}, { showLoading: false }
          )
          const data = response?.success ? response.data : response
          this.segmentRuleVersions = data?.configs || data?.versions || data || []
          // 加载字段注册表
          const regResponse = await this.apiGet(
            `${API_PREFIX}/console/segment-rules/field-registry`, {}, { showLoading: false }
          )
          const regData = regResponse?.success ? regResponse.data : regResponse
          if (regData) {
            this.segmentFieldRegistry = regData
          }
        } catch (error) {
          logger.error('[SegmentRules] 加载分群策略失败:', error)
          this.segmentRuleVersions = []
        }
      },

      /** 打开编辑分群策略（查看详情/编辑模式） */
      async openSegmentRuleEditor(versionKey) {
        try {
          const response = await this.apiGet(
            `${API_PREFIX}/console/segment-rules/${versionKey}`, {}, { showLoading: false }
          )
          const data = response?.success ? response.data : response
          this.editingSegmentRule = data
          this.showModal('segmentRuleModal')
        } catch (_error) {
          this.showError('加载策略详情失败')
        }
      },

      /** 创建新的分群策略版本 */
      openCreateSegmentRule() {
        this.editingSegmentRule = {
          version_key: '',
          version_name: '',
          description: '',
          is_system: false,
          rules: [
            { segment_key: 'default', label: '所有用户', conditions: [], logic: 'AND', priority: 0 }
          ]
        }
        this.showModal('segmentRuleModal')
      },

      /** 保存分群策略 */
      async saveSegmentRule() {
        if (!this.editingSegmentRule) return
        try {
          this.saving = true
          const isNew = !this.editingSegmentRule.id
          const data = {
            version_key: this.editingSegmentRule.version_key,
            version_name: this.editingSegmentRule.version_name,
            description: this.editingSegmentRule.description,
            rules: this.editingSegmentRule.rules
          }
          if (isNew) {
            await this.apiCall(`${API_PREFIX}/console/segment-rules`, { method: 'POST', data })
          } else {
            await this.apiCall(
              `${API_PREFIX}/console/segment-rules/${this.editingSegmentRule.version_key}`,
              { method: 'PUT', data }
            )
          }
          this.showSuccess(isNew ? '策略创建成功' : '策略更新成功')
          this.hideModal('segmentRuleModal')
          await this.loadSegmentRules()
        } catch (error) {
          this.showError('保存策略失败: ' + (error.message || '未知错误'))
        } finally {
          this.saving = false
        }
      },

      /** 归档分群策略 */
      async archiveSegmentRule(versionKey) {
        await this.confirmAndExecute(
          `确认归档策略「${versionKey}」？归档后将不可用于新活动。`,
          async () => {
            await this.apiCall(
              `${API_PREFIX}/console/segment-rules/${versionKey}`, { method: 'DELETE' }
            )
            await this.loadSegmentRules()
          },
          { successMessage: '策略已归档' }
        )
      },

      /** 添加规则到当前编辑的策略 */
      addSegmentRuleCondition(ruleIndex) {
        if (!this.editingSegmentRule?.rules?.[ruleIndex]) return
        this.editingSegmentRule.rules[ruleIndex].conditions.push(
          { field: 'created_at', operator: 'days_within', value: 7 }
        )
      },

      /** 移除规则条件 */
      removeSegmentRuleCondition(ruleIndex, condIndex) {
        if (!this.editingSegmentRule?.rules?.[ruleIndex]) return
        this.editingSegmentRule.rules[ruleIndex].conditions.splice(condIndex, 1)
      },

      /** 添加新的分群规则 */
      addSegmentRule() {
        if (!this.editingSegmentRule) return
        this.editingSegmentRule.rules.push({
          segment_key: '', label: '', conditions: [], logic: 'AND', priority: 5
        })
      },

      /** 移除分群规则 */
      removeSegmentRule(index) {
        if (!this.editingSegmentRule?.rules) return
        this.editingSegmentRule.rules.splice(index, 1)
      },

      /** 获取字段的可用运算符列表 */
      getOperatorsForField(fieldKey) {
        const field = this.segmentFieldRegistry.fields?.[fieldKey]
        if (!field) return []
        return (field.operators || []).map(opKey => ({
          key: opKey,
          label: this.segmentFieldRegistry.operators?.[opKey]?.label || opKey
        }))
      },

      /** 生成条件的自然语言描述 */
      describeCondition(cond) {
        const field = this.segmentFieldRegistry.fields?.[cond.field]
        const op = this.segmentFieldRegistry.operators?.[cond.operator]
        const fieldLabel = field?.label || cond.field
        const opLabel = op?.label || cond.operator
        return `${fieldLabel} ${opLabel} ${cond.value}`
      },

      /** 测试分群策略（模拟用户匹配） */
      async testSegmentRule() {
        if (!this.editingSegmentRule?.version_key) {
          this.showError('请先保存策略后再测试')
          return
        }
        try {
          const mockUser = {
            created_at: this.segmentTestInput?.created_at || new Date().toISOString(),
            history_total_points: parseInt(this.segmentTestInput?.points) || 0,
            user_level: this.segmentTestInput?.user_level || 'normal',
            last_active_at: this.segmentTestInput?.last_active_at || new Date().toISOString(),
            consecutive_fail_count: parseInt(this.segmentTestInput?.fail_count) || 0
          }
          const response = await this.apiCall(
            `${API_PREFIX}/console/segment-rules/${this.editingSegmentRule.version_key}`,
            { method: 'GET', params: { simulate: JSON.stringify(mockUser) } }
          )
          this.segmentTestResult = response?.data || response
        } catch (error) {
          this.showError('测试失败: ' + (error.message || '未知错误'))
        }
      },

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
      },

      // ========== 图片预览 ==========
      previewImageUrl: '',
      previewImageAlt: '',

      openImagePreview(url, alt) {
        if (!url) return
        this.previewImageUrl = url
        this.previewImageAlt = alt || ''
        this.showModal('imagePreviewModal')
      },

      closeImagePreview() {
        this.hideModal('imagePreviewModal')
        this.previewImageUrl = ''
        this.previewImageAlt = ''
      }
    }
    
    return returnObj
  })

  // ==================== data-table 组件注册 ====================

  /** 活动列表 */
  Alpine.data('campaignsDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'lottery_campaign_id', label: '活动ID', sortable: true },
      { key: 'name', label: '活动名称', sortable: true },
      { key: 'campaign_code', label: '活动代码' },
      { key: 'status', label: '状态', type: 'status', statusMap: { active: { class: 'green', label: '进行中' }, inactive: { class: 'gray', label: '未激活' }, ended: { class: 'red', label: '已结束' } } },
      { key: 'start_time', label: '开始时间', type: 'datetime', sortable: true },
      { key: 'end_time', label: '结束时间', type: 'datetime' }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-campaigns`, method: 'GET', params: p }); return { items: r.data?.campaigns || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'lottery_campaign_id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-campaigns', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 奖品池 */
  Alpine.data('prizesDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'prize_id', label: '奖品ID', sortable: true },
      { key: 'prize_name', label: '奖品名称', sortable: true },
      { key: 'tier', label: '等级', render: (v, r) => r.tier_display || v || '-' },
      { key: 'probability', label: '概率', render: (v) => v != null ? (Number(v) * 100).toFixed(2) + '%' : '-' },
      { key: 'stock', label: '库存', type: 'number', sortable: true },
      { key: 'status', label: '状态', type: 'status' }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/prize-pool/list`, method: 'GET', params: p }); return { items: r.data?.prizes || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'prize_id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-prizes', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 活动预算 */
  Alpine.data('campaignBudgetDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'budget_id', label: '预算ID', sortable: true },
      { key: 'campaign_name', label: '活动名称', render: (v, r) => v || r.campaign?.name || '-' },
      { key: 'total_budget', label: '总预算', type: 'currency', sortable: true },
      { key: 'used_budget', label: '已使用', type: 'currency' },
      { key: 'usage_rate', label: '使用率', render: (v) => v != null ? Number(v).toFixed(1) + '%' : '-' },
      { key: 'status', label: '状态', type: 'status' }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/campaign-budget`, method: 'GET', params: p }); return { items: r.data?.list || r.data?.budgets || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'budget_id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-campaign-budgets', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 策略配置 */
  Alpine.data('strategiesDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'strategy_name', label: '策略名称', sortable: true },
      { key: 'strategy_type', label: '类型', render: (v, r) => r.strategy_type_display || v || '-' },
      { key: 'priority', label: '优先级', type: 'number', sortable: true },
      { key: 'is_enabled', label: '状态', type: 'status', statusMap: { true: { class: 'green', label: '启用' }, false: { class: 'gray', label: '禁用' } } }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-configs/strategies`, method: 'GET', params: p }); return { items: r.data?.strategies || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-strategies', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 配额规则 */
  Alpine.data('quotaRulesDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'rule_name', label: '规则名称' },
      { key: 'rule_type', label: '规则类型', render: (v, r) => r.rule_type_display || v || '-' },
      { key: 'quota_limit', label: '限额', type: 'number' },
      { key: 'is_enabled', label: '状态', type: 'status', statusMap: { true: { class: 'green', label: '启用' }, false: { class: 'gray', label: '禁用' } } }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-quota/rules`, method: 'GET', params: p }); return { items: r.data?.rules || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-quota-rules', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 定价配置 */
  Alpine.data('pricingDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'pricing_id', label: '定价ID', sortable: true },
      { key: 'name', label: '定价名称' },
      { key: 'base_price', label: '基础价格', type: 'currency' },
      { key: 'asset_code', label: '资产类型' },
      { key: 'is_active', label: '状态', type: 'status', statusMap: { true: { class: 'green', label: '启用' }, false: { class: 'gray', label: '禁用' } } }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-management/pricing-configs`, method: 'GET', params: p }); return { items: r.data?.configs || r.data?.pricing_configs || r.data?.list || [], total: r.data?.total || r.data?.pagination?.total || 0 } }, primaryKey: 'pricing_id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-pricing', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 阶梯规则 */
  Alpine.data('tierRulesDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'rule_name', label: '规则名称' },
      { key: 'tier_level', label: '阶梯等级', type: 'number' },
      { key: 'min_draws', label: '最小次数', type: 'number' },
      { key: 'probability_boost', label: '概率提升', render: (v) => v != null ? Number(v).toFixed(2) + '%' : '-' },
      { key: 'is_enabled', label: '状态', type: 'status', statusMap: { true: { class: 'green', label: '启用' }, false: { class: 'gray', label: '禁用' } } }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-tier-rules`, method: 'GET', params: p }); return { items: r.data?.rules || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-tier-rules', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 干预记录 */
  Alpine.data('interventionsDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'user_id', label: '用户ID' },
      { key: 'intervention_type', label: '干预类型', render: (v, r) => r.intervention_type_display || v || '-' },
      { key: 'target_prize', label: '目标奖品', render: (v, r) => r.prize_name || v || '-' },
      { key: 'status', label: '状态', type: 'status', statusMap: { pending: { class: 'yellow', label: '待执行' }, executed: { class: 'green', label: '已执行' }, cancelled: { class: 'gray', label: '已取消' }, expired: { class: 'red', label: '已过期' } } },
      { key: 'created_at', label: '创建时间', type: 'datetime', sortable: true }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-management/interventions`, method: 'GET', params: p }); return { items: r.data?.interventions || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-interventions', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 概率矩阵 */
  Alpine.data('matrixDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'matrix_name', label: '矩阵名称', render: (v, r) => v || r.name || '-' },
      { key: 'campaign_name', label: '关联活动', render: (v, r) => v || r.campaign?.name || '-' },
      { key: 'version', label: '版本', type: 'number' },
      { key: 'is_active', label: '状态', type: 'status', statusMap: { true: { class: 'green', label: '激活' }, false: { class: 'gray', label: '未激活' } } },
      { key: 'updated_at', label: '更新时间', type: 'datetime', sortable: true }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-configs/matrix`, method: 'GET', params: p }); return { items: r.data?.matrix_configs || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-matrix', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 抽奖记录 */
  Alpine.data('drawHistoryDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'draw_id', label: '抽奖ID', sortable: true },
      { key: 'user_id', label: '用户ID' },
      { key: 'campaign_name', label: '活动' },
      { key: 'prize_name', label: '奖品', render: (v, r) => v || r.result?.prize_name || '未中奖' },
      { key: 'cost_amount', label: '消耗', type: 'number' },
      { key: 'is_winner', label: '中奖', type: 'boolean' },
      { key: 'created_at', label: '时间', type: 'datetime', sortable: true }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-statistics/hourly`, method: 'GET', params: p }); return { items: r.data?.metrics || r.data?.draws || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'draw_id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-draw-history', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  /** 异常用户列表 */
  Alpine.data('abnormalUsersDataTable', () => {
    const t = dataTable({ columns: [
      { key: 'user_id', label: '用户ID', sortable: true },
      { key: 'nickname', label: '用户', render: (v, r) => v || r.user_nickname || '-' },
      { key: 'total_draws', label: '抽奖次数', type: 'number', sortable: true },
      { key: 'total_wins', label: '中奖次数', type: 'number' },
      { key: 'win_rate', label: '中奖率', render: (v) => v != null ? Number(v).toFixed(2) + '%' : '-' },
      { key: 'risk_level', label: '风险等级', type: 'status', statusMap: { high: { class: 'red', label: '高' }, medium: { class: 'yellow', label: '中' }, low: { class: 'green', label: '低' } } }
    ], dataSource: async (p) => { const r = await request({ url: `${API_PREFIX}/console/lottery-user-analysis/abnormal`, method: 'GET', params: p }); return { items: r.data?.users || r.data?.list || [], total: r.data?.pagination?.total || 0 } }, primaryKey: 'user_id', page_size: 20 })
    const o = t.init; t.init = async function () { window.addEventListener('refresh-abnormal-users', () => this.loadData()); if (o) await o.call(this) }; return t
  })

  logger.info('[LotteryManagement] Alpine 组件注册完成（含 data-table）')
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
