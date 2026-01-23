/**
 * 抽奖管理整合页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/lottery/pages/lottery-management.js
 * @module LotteryManagementPage
 * @version 3.1.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 抽奖系统管理中心，整合以下子模块：
 * - 活动管理（campaigns）：创建、编辑、启停活动
 * - 奖品管理（prizes）：配置奖品、库存、概率
 * - 预算管理（campaign-budget）：设置活动预算、警戒线
 * - 策略配置（lottery-strategy）：概率策略、层级矩阵
 * - 配额管理（lottery-quota）：全局/用户/活动配额
 * - 定价配置（lottery-pricing）：单次抽奖价格、折扣
 * - 抽奖监控（lottery-metrics）：实时统计、用户状态
 * - 核销码管理（redemption-codes）：奖品核销、批量操作
 *
 * @requires createPageMixin - 页面混入基础功能
 * @requires API_ENDPOINTS - API端点配置
 * @requires apiRequest - API请求函数
 *
 * @example
 * // HTML中使用导航组件
 * <div x-data="lotteryNavigation">
 *   <template x-for="page in subPages" :key="page.id">...</template>
 * </div>
 *
 * // HTML中使用内容组件
 * <div x-data="lotteryPageContent">
 *   <div x-show="currentPage === 'campaigns'">...</div>
 * </div>
 */

/* global Alpine, createPageMixin, API_ENDPOINTS, API */

/**
 * 活动对象类型
 * @typedef {Object} Campaign
 * @property {number|string} campaign_id - 活动ID
 * @property {string} name - 活动名称
 * @property {string} [description] - 活动描述
 * @property {string} start_time - 开始时间
 * @property {string} end_time - 结束时间
 * @property {string} status - 状态 ('active'|'inactive'|'pending'|'ended')
 * @property {string} [rules] - 活动规则
 */

/**
 * 奖品对象类型
 * @typedef {Object} Prize
 * @property {number|string} prize_id - 奖品ID
 * @property {string} name - 奖品名称
 * @property {string} type - 类型 ('physical'|'virtual'|'coupon'|'points')
 * @property {number} probability - 中奖概率
 * @property {number} stock - 库存数量 (-1表示无限)
 * @property {boolean} is_active - 是否启用
 * @property {string} [image_url] - 图片URL
 * @property {string} [description] - 描述
 */

/**
 * 预算配置类型
 * @typedef {Object} BudgetConfig
 * @property {number|string} campaign_id - 活动ID
 * @property {string} budget_mode - 预算模式 ('pool'|'user'|'daily'|'none')
 * @property {Object} [pool_budget] - 总预算对象
 * @property {number} pool_budget.total - 总预算金额
 * @property {number} pool_budget.used - 已使用金额
 * @property {number} [alert_threshold] - 预警阈值百分比
 * @property {string} [status] - 状态
 */

/**
 * 配额规则类型
 * @typedef {Object} QuotaRule
 * @property {number|string} quota_id - 配额ID
 * @property {number|string} campaign_id - 活动ID
 * @property {number|string} prize_id - 奖品ID
 * @property {number} total_quota - 总配额
 * @property {number} [used_quota] - 已使用配额
 * @property {string} period_type - 周期类型 ('daily'|'weekly'|'monthly'|'total')
 * @property {string} rule_type - 规则类型 ('global'|'user'|'campaign')
 * @property {string} status - 状态 ('active'|'inactive')
 */

/**
 * 定价配置类型
 * @typedef {Object} PricingConfig
 * @property {number|string} pricing_id - 定价ID
 * @property {string} campaign_code - 活动代码
 * @property {number} price_per_draw - 单次抽奖价格
 * @property {number} discount_rate - 折扣率
 * @property {number} min_purchase - 最小购买数
 * @property {number} max_purchase - 最大购买数
 * @property {string} [status] - 状态
 */

/**
 * 核销码记录类型
 * @typedef {Object} RedemptionCode
 * @property {string} order_id - 订单ID
 * @property {string} code_hash - 核销码哈希
 * @property {number} user_id - 用户ID
 * @property {string} status - 状态 ('pending'|'fulfilled'|'expired'|'cancelled')
 * @property {Object} [item_instance] - 物品实例信息
 * @property {Object} [redeemer] - 核销人信息
 * @property {string} created_at - 创建时间
 */

/**
 * 抽奖指标类型
 * @typedef {Object} LotteryMetrics
 * @property {number} totalDraws - 总抽奖次数
 * @property {number} totalWins - 总中奖次数
 * @property {number|string} winRate - 中奖率
 * @property {number} totalUsers - 参与用户数
 */

/**
 * 注册抽奖管理相关的Alpine.js组件
 * @function registerLotteryManagementComponents
 * @description
 * 检查Alpine.js和createPageMixin是否可用，然后注册lotteryNavigation和lotteryPageContent组件。
 * 如果依赖未就绪，会延迟50ms后重试。
 * @returns {void}
 */
function registerLotteryManagementComponents() {
  console.log('[LotteryManagement] 注册 Alpine 组件 (Mixin v3.1)...')

  // 检查 Alpine 和 createPageMixin 是否可用
  if (typeof window.Alpine === 'undefined' || typeof window.createPageMixin !== 'function') {
    console.log('[LotteryManagement] 等待 Alpine 初始化...')
    setTimeout(registerLotteryManagementComponents, 50)
    return
  }

  // 全局 Store - 存储当前激活的子页面
  Alpine.store('lotteryPage', 'campaigns')

  /**
   * 抽奖管理导航组件
   * @function lotteryNavigation
   * @description 提供子页面导航功能，管理页面切换和URL同步
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('lotteryNavigation', () => ({
    ...createPageMixin(),

    /** @type {string} 当前激活的子页面ID */
    currentPage: 'campaigns',

    /**
     * 子页面配置列表
     * @type {Array<{id: string, title: string, icon: string}>}
     */
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

    /**
     * 初始化导航组件
     * @method init
     * @description 验证登录状态，从URL参数获取初始页面
     * @returns {void} 无返回值
     */
    init() {
      console.log('✅ 抽奖管理导航初始化')
      if (!this.checkAuth()) {
        return
      }
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'campaigns'
      Alpine.store('lotteryPage', this.currentPage)
    },

    /**
     * 切换子页面
     * @method switchPage
     * @param {string} pageId - 目标子页面ID
     * @description 更新当前页面、全局Store和URL
     * @returns {void} 无返回值
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('lotteryPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  /**
   * 抽奖管理内容组件
   * @function lotteryPageContent
   * @description 根据导航状态渲染对应子页面内容，管理所有抽奖相关数据
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('lotteryPageContent', () => ({
    ...createPageMixin(),

    // ==================== 活动管理状态 ====================

    /** @type {Campaign[]} 活动列表 */
    campaigns: [],
    /** @type {{total: number, active: number, todayParticipants: number, todayWinners: number}} 活动统计 */
    campaignStats: { total: 0, active: 0, todayParticipants: 0, todayWinners: 0 },

    /** @type {{status: string, keyword: string}} 活动筛选条件 */
    campaignFilters: { status: '', keyword: '' },

    /** @type {Object} 活动编辑表单 */
    campaignForm: {
      name: '',
      description: '',
      start_time: '',
      end_time: '',
      status: 'pending',
      rules: ''
    },

    /** @type {number|string|null} 当前编辑的活动ID */
    editingCampaignId: null,

    // ==================== 奖品管理状态 ====================

    /** @type {Prize[]} 奖品列表 */
    prizes: [],
    /** @type {{type: string, status: string, keyword: string}} 奖品筛选条件 */
    prizeFilters: { type: '', status: '', keyword: '' },

    /** @type {Object} 奖品编辑表单 */
    prizeForm: {
      name: '',
      type: 'virtual',
      probability: 0,
      stock: -1,
      is_active: true,
      image_url: '',
      description: ''
    },

    /** @type {number|string|null} 当前编辑的奖品ID */
    editingPrizeId: null,

    /** @type {{prizeId: number|null, prizeName: string, quantity: number}} 库存补充表单 */
    stockForm: { prizeId: null, prizeName: '', quantity: 1 },

    // ==================== 预算管理状态 ====================

    /** @type {BudgetConfig[]} 预算活动列表 */
    budgetCampaigns: [],
    budgetSummary: { total_budget: 0, total_used: 0, total_remaining: 0, total_campaigns: 0 },
    budgetFilters: { status: '', budgetType: '' },
    budgetForm: {
      campaign_id: '',
      budget_mode: 'pool',
      pool_budget_total: 0,
      alert_threshold: 80,
      remark: ''
    },
    editingBudgetCampaignId: null,

    // 策略配置
    strategies: [], // 策略列表（用于 x-for 循环）
    strategyGroups: {}, // 按组分类的策略
    tierMatrix: [],
    budgetTiers: ['低', '中', '高', '特高'],
    pressureTiers: ['低压', '中压', '高压'],

    // 配额管理
    quotas: [],
    quotaForm: {
      campaign_id: '',
      prize_id: '',
      total_quota: 0,
      period_type: 'daily',
      rule_type: 'campaign',
      status: 'active'
    },
    editingQuotaId: null,
    isEditQuota: false,
    quotaFilters: { ruleType: '', status: '', campaignId: '' },
    quotaStats: { totalRules: 0, activeRules: 0, totalQuota: 0, usedQuota: 0, usedPercentage: 0 },
    quotaUsage: [],
    quotaCheckUserId: '',
    userQuotaCheckResult: null,

    // 抽奖监控
    lotteryMetrics: { totalDraws: 0, totalWins: 0, winRate: 0, totalUsers: 0 },
    campaignMetrics: [],
    hourlyMetrics: [],
    userExperienceStates: [],
    userGlobalStates: [],
    userQuotas: [],
    monitoringFilters: { campaignId: '', userId: '', timeRange: '24h' },

    // 配额统计（旧版本兼容）
    quotaStatistics: { totalRules: 0, activeRules: 0, totalQuota: 0, usedQuota: 0 },

    // 定价配置
    pricingConfigs: [],
    pricingVersions: [],
    pricingFilters: { campaignCode: '', status: '' },
    pricingForm: {
      campaign_code: '',
      price_per_draw: 0,
      discount_rate: 1.0,
      min_purchase: 1,
      max_purchase: 10,
      effective_from: '',
      effective_to: ''
    },
    editingPricingId: null,
    isEditPricing: false,
    selectedPricingCampaign: null,

    // 核销码管理
    redemptionCodes: [],
    redemptionStats: { total: 0, pending: 0, fulfilled: 0, expired: 0 },
    redemptionFilters: { status: '', prizeType: '', code: '', userId: '' },
    redemptionSelectedIds: [],
    redemptionDetail: null,
    redeemForm: { orderId: '', codeDisplay: '', storeId: '', remark: '' },
    stores: [],

    // 分页相关
    page: 1,
    pageSize: 20,
    totalPages: 1,
    total: 0,

    // 选中的数据项
    selectedCampaign: null,
    editingMatrixCell: null,

    // Modal 由 modalMixin 统一管理

    // 通用状态
    saving: false,
    isEditMode: false,
    submitting: false,

    /**
     * 获取当前激活的子页面ID
     * @type {string}
     * @readonly
     */
    get currentPage() {
      return Alpine.store('lotteryPage')
    },

    /**
     * 初始化页面内容组件
     * @method init
     * @description 加载当前页面数据，并监听全局Store变化自动重新加载
     * @returns {void} 无返回值
     */
    init() {
      console.log('✅ 抽奖管理内容初始化')

      this.loadPageData()
      this.$watch('$store.lotteryPage', () => this.loadPageData())
    },

    /**
     * 根据当前页面加载对应数据
     * @async
     * @method loadPageData
     * @description 根据currentPage值分发到对应的数据加载方法
     * @returns {Promise<void>} 无返回值的Promise
     */
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

    // ==================== 活动管理方法 ====================

    /**
     * 加载活动列表
     * @async
     * @method loadCampaigns
     * @description 根据筛选条件和分页参数获取活动列表
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadCampaigns() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.campaignFilters.status) {
          params.append('status', this.campaignFilters.status)
        }
        if (this.campaignFilters.keyword) {
          params.append('keyword', this.campaignFilters.keyword)
        }

        const response = await this.apiGet(
          `${API_ENDPOINTS.CAMPAIGN.LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.campaigns = response.data?.campaigns || response.data?.list || []
        }
      } catch (error) {
        console.error('加载活动失败:', error)
        this.campaigns = []
      }
    },

    /**
     * 加载活动统计数据
     * @async
     * @method loadCampaignStats
     * @description 从已加载的活动列表中计算统计数据
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadCampaignStats() {
      // 从已加载的campaigns列表中计算统计数据（后端无独立统计端点）
      this.campaignStats = {
        total: this.campaigns.length,
        active: this.campaigns.filter(c => c.status === 'active').length,
        todayParticipants: 0, // 需要从lottery_hourly_metrics聚合，暂不实现
        todayWinners: 0 // 需要从lottery_hourly_metrics聚合，暂不实现
      }
    },

    /**
     * 打开创建活动模态框
     * @method openCreateCampaignModal
     * @description 重置表单状态并显示活动创建模态框
     * @returns {void} 无返回值
     */
    openCreateCampaignModal() {
      this.editingCampaignId = null
      this.isEditMode = false
      this.campaignForm = {
        name: '',
        description: '',
        start_time: '',
        end_time: '',
        status: 'pending',
        rules: ''
      }
      this.showModal('campaignModal')
    },

    /**
     * 编辑活动
     * @method editCampaign
     * @param {Campaign} campaign - 要编辑的活动对象
     * @description 设置编辑状态并显示编辑模态框
     * @returns {void} 无返回值
     */
    editCampaign(campaign) {
      this.editingCampaignId = campaign.campaign_id || campaign.id
      this.isEditMode = true
      this.campaignForm = {
        name: campaign.name || '',
        description: campaign.description || '',
        start_time: this.formatDateTimeLocal(campaign.start_time),
        end_time: this.formatDateTimeLocal(campaign.end_time),
        status: campaign.status || 'pending',
        rules: campaign.rules || ''
      }
      this.showModal('campaignModal')
    },

    /**
     * 查看活动详情
     * @method viewCampaignDetail
     * @param {Campaign} campaign - 活动对象
     * @description 设置选中活动并显示详情模态框
     * @returns {void} 无返回值
     */
    viewCampaignDetail(campaign) {
      this.selectedCampaign = campaign
      this.showModal('campaignDetailModal')
    },

    /**
     * 提交活动表单
     * @async
     * @method submitCampaignForm
     * @description 验证表单数据后创建或更新活动
     * @returns {Promise<void>} 无返回值的Promise
     */
    async submitCampaignForm() {
      if (!this.campaignForm.name) {
        this.showError('请输入活动名称')
        return
      }
      if (!this.campaignForm.start_time || !this.campaignForm.end_time) {
        this.showError('请设置活动时间')
        return
      }

      try {
        this.saving = true
        const url = this.isEditMode
          ? `${API_ENDPOINTS.CAMPAIGN.LIST}/${this.editingCampaignId}`
          : API_ENDPOINTS.CAMPAIGN.LIST

        const response = await this.apiCall(url, {
          method: this.isEditMode ? 'PUT' : 'POST',
          data: {
            name: this.campaignForm.name,
            description: this.campaignForm.description,
            start_time: this.campaignForm.start_time,
            end_time: this.campaignForm.end_time,
            status: this.campaignForm.status,
            rules: this.campaignForm.rules
          }
        })

        if (response?.success) {
          this.showSuccess(this.isEditMode ? '活动更新成功' : '活动创建成功')
          this.hideModal('campaignModal')
          await this.loadCampaigns()
          await this.loadCampaignStats()
        }
      } catch (error) {
        this.showError('保存活动失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除活动
     * @async
     * @method deleteCampaign
     * @param {Campaign} campaign - 要删除的活动对象
     * @description 确认后删除指定活动
     * @returns {Promise<void>} 无返回值的Promise
     */
    async deleteCampaign(campaign) {
      await this.confirmAndExecute(
        `确认删除活动「${campaign.name}」？此操作不可恢复`,
        async () => {
          const response = await this.apiCall(
            `${API_ENDPOINTS.CAMPAIGN.LIST}/${campaign.campaign_id || campaign.id}`,
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadCampaigns()
            await this.loadCampaignStats()
          }
        },
        { successMessage: '活动已删除', confirmText: '确认删除' }
      )
    },

    /**
     * 切换活动状态
     * @async
     * @method toggleCampaign
     * @param {Campaign} campaign - 活动对象
     * @description 确认后切换活动的启用/停用状态
     * @returns {Promise<void>} 无返回值的Promise
     */
    async toggleCampaign(campaign) {
      const newStatus = campaign.status === 'active' ? 'inactive' : 'active'
      await this.confirmAndExecute(
        `确认${newStatus === 'active' ? '启用' : '停用'}活动「${campaign.name}」？`,
        async () => {
          const response = await this.apiCall(
            `${API_ENDPOINTS.CAMPAIGN.LIST}/${campaign.campaign_id || campaign.id}/status`,
            { method: 'PUT', data: { status: newStatus } }
          )
          if (response?.success) {
            await this.loadCampaigns()
            await this.loadCampaignStats()
          }
        },
        { successMessage: `活动已${newStatus === 'active' ? '启用' : '停用'}` }
      )
    },

    /**
     * 获取活动状态对应的CSS类
     * @method getCampaignStatusClass
     * @param {string} status - 活动状态
     * @returns {string} Bootstrap徽章CSS类名
     */
    getCampaignStatusClass(status) {
      const map = {
        active: 'bg-success',
        inactive: 'bg-secondary',
        pending: 'bg-warning',
        ended: 'bg-dark'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取活动状态的中文文本
     * @method getCampaignStatusText
     * @param {string} status - 活动状态
     * @returns {string} 状态中文文本
     */
    getCampaignStatusText(status) {
      const map = { active: '进行中', inactive: '已结束', pending: '待开始', ended: '已结束' }
      return map[status] || status
    },

    // ==================== 奖品管理方法 ====================

    /**
     * 加载奖品列表
     * @async
     * @method loadPrizes
     * @description 根据筛选条件和分页参数获取奖品列表
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadPrizes() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.prizeFilters.type) {
          params.append('type', this.prizeFilters.type)
        }
        if (this.prizeFilters.status) {
          params.append('is_active', this.prizeFilters.status === 'active')
        }
        if (this.prizeFilters.keyword) {
          params.append('keyword', this.prizeFilters.keyword)
        }

        const response = await this.apiGet(
          `${API_ENDPOINTS.PRIZE.LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.prizes = response.data?.prizes || response.data?.list || []
        }
      } catch (error) {
        console.error('加载奖品失败:', error)
        this.prizes = []
      }
    },

    /**
     * 打开创建奖品模态框
     * @method openCreatePrizeModal
     * @description 重置表单状态并显示奖品创建模态框
     * @returns {void} 无返回值
     */
    openCreatePrizeModal() {
      this.editingPrizeId = null
      this.isEditMode = false
      this.prizeForm = {
        name: '',
        type: 'virtual',
        probability: 0,
        stock: -1,
        is_active: true,
        image_url: '',
        description: ''
      }
      this.showModal('prizeModal')
    },

    /**
     * 编辑奖品
     * @method editPrize
     * @param {Prize} prize - 要编辑的奖品对象
     * @description 设置编辑状态并显示编辑模态框
     * @returns {void} 无返回值
     */
    editPrize(prize) {
      this.editingPrizeId = prize.prize_id || prize.id
      this.isEditMode = true
      this.prizeForm = {
        name: prize.name || '',
        type: prize.type || 'virtual',
        probability: prize.probability || 0,
        stock: prize.stock ?? -1,
        is_active: prize.is_active,
        image_url: prize.image_url || '',
        description: prize.description || ''
      }
      this.showModal('prizeModal')
    },

    /**
     * 切换奖品启用状态
     * @async
     * @method togglePrize
     * @param {Prize} prize - 奖品对象
     * @description 确认后切换奖品的启用/禁用状态
     * @returns {Promise<void>} 无返回值的Promise
     */
    async togglePrize(prize) {
      const newStatus = !prize.is_active
      await this.confirmAndExecute(
        `确认${newStatus ? '启用' : '禁用'}奖品「${prize.name}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.PRIZE.UPDATE.replace(':prize_id', ':id') + '/toggle', {
              id: prize.prize_id
            }),
            { method: 'PUT' }
          )
          if (response?.success) this.loadPrizes()
        },
        { successMessage: `奖品已${newStatus ? '启用' : '禁用'}` }
      )
    },

    /**
     * 删除奖品
     * @async
     * @method deletePrize
     * @param {Prize} prize - 要删除的奖品对象
     * @description 确认后删除指定奖品
     * @returns {Promise<void>} 无返回值的Promise
     */
    async deletePrize(prize) {
      await this.confirmAndExecute(
        `确认删除奖品「${prize.name}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.PRIZE.DELETE.replace(':prize_id', ':id'), {
              id: prize.prize_id
            }),
            { method: 'DELETE' }
          )
          if (response?.success) this.loadPrizes()
        },
        { successMessage: '奖品已删除' }
      )
    },

    /**
     * 提交奖品表单
     * @async
     * @method submitPrizeForm
     * @description 创建或更新奖品
     * @returns {Promise<void>} 无返回值的Promise
     */
    async submitPrizeForm() {
      if (!this.prizeForm.name) {
        this.showError('请输入奖品名称')
        return
      }

      try {
        this.saving = true
        const url = this.isEditMode
          ? `${API_ENDPOINTS.PRIZE.UPDATE.replace(':prize_id', '')}/${this.editingPrizeId}`
          : API_ENDPOINTS.PRIZE.LIST

        const response = await this.apiCall(url, {
          method: this.isEditMode ? 'PUT' : 'POST',
          data: {
            name: this.prizeForm.name,
            type: this.prizeForm.type,
            probability: this.prizeForm.probability,
            stock: this.prizeForm.stock,
            is_active: this.prizeForm.is_active,
            image_url: this.prizeForm.image_url,
            description: this.prizeForm.description
          }
        })

        if (response?.success) {
          this.showSuccess(this.isEditMode ? '奖品更新成功' : '奖品创建成功')
          this.hideModal('prizeModal')
          await this.loadPrizes()
        }
      } catch (error) {
        this.showError('保存奖品失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取奖品类型的中文文本
     * @method getPrizeTypeText
     * @param {string} type - 奖品类型
     * @returns {string} 类型中文文本
     */
    getPrizeTypeText(type) {
      const map = { physical: '实物', virtual: '虚拟', coupon: '优惠券', points: '积分' }
      return map[type] || type
    },

    /**
     * 打开奖品补货模态框
     * @method openStockModal
     * @param {Prize} prize - 奖品对象
     * @description 设置补货表单并显示模态框
     * @returns {void} 无返回值
     */
    openStockModal(prize) {
      this.stockForm = {
        prizeId: prize.prize_id || prize.id,
        prizeName: prize.name || prize.prize_name,
        quantity: 1
      }
      this.showModal('stockModal')
    },

    /**
     * 提交奖品补货
     * @async
     * @method submitAddStock
     * @description 验证补货数量后为指定奖品添加库存
     * @returns {Promise<void>} 无返回值的Promise
     */
    async submitAddStock() {
      if (!this.stockForm.prizeId) {
        this.showError('奖品信息无效')
        return
      }
      if (!this.stockForm.quantity || this.stockForm.quantity <= 0) {
        this.showError('请输入有效的补货数量')
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(
          API.buildURL(API_ENDPOINTS.PRIZE.ADD_STOCK.replace(':prize_id', ':id'), {
            id: this.stockForm.prizeId
          }),
          {
            method: 'POST',
            data: { quantity: parseInt(this.stockForm.quantity) }
          }
        )

        if (response?.success) {
          this.showSuccess(`已成功补充 ${this.stockForm.quantity} 件库存`)
          this.hideModal('stockModal')
          await this.loadPrizes()
        }
      } catch (error) {
        this.showError('补货失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    // ==================== 预算管理方法 ====================

    /**
     * 加载预算数据
     * @async
     * @method loadBudgetData
     * @description 获取活动预算批量状态和汇总信息
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadBudgetData() {
      try {
        const params = new URLSearchParams()
        params.append('limit', 50)
        if (this.budgetFilters.status) {
          params.append('status', this.budgetFilters.status)
        }

        const response = await this.apiGet(
          `${API_ENDPOINTS.CAMPAIGN_BUDGET.BATCH_STATUS}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          const { campaigns, summary } = response.data || {}

          // 更新汇总数据
          this.budgetSummary = {
            total_budget: summary?.total_budget || 0,
            total_used: summary?.total_used || 0,
            total_remaining: summary?.total_remaining || 0,
            total_campaigns: summary?.total_campaigns || 0
          }

          // 前端筛选
          let filteredCampaigns = campaigns || []
          if (this.budgetFilters.status) {
            filteredCampaigns = filteredCampaigns.filter(
              c => c.status === this.budgetFilters.status
            )
          }
          if (this.budgetFilters.budgetType) {
            filteredCampaigns = filteredCampaigns.filter(
              c => c.budget_mode === this.budgetFilters.budgetType
            )
          }

          this.budgetCampaigns = filteredCampaigns
        }
      } catch (error) {
        console.error('加载预算数据失败:', error)
        this.budgetCampaigns = []
      }
    },

    /**
     * 打开设置预算模态框
     * @method openSetBudgetModal
     * @param {number|string|null} [campaignId=null] - 活动ID，null表示新建模式
     * @description 设置预算表单并显示模态框，支持新建和编辑模式
     * @returns {void} 无返回值
     */
    openSetBudgetModal(campaignId = null) {
      this.editingBudgetCampaignId = campaignId
      if (campaignId) {
        // 编辑模式：加载现有预算数据
        const campaign = this.budgetCampaigns.find(c => (c.campaign_id || c.id) === campaignId)
        if (campaign) {
          this.budgetForm = {
            campaign_id: campaignId,
            budget_mode: campaign.budget_mode || 'pool',
            pool_budget_total: campaign.pool_budget?.total || 0,
            alert_threshold: campaign.alert_threshold || 80,
            remark: campaign.remark || ''
          }
        }
      } else {
        // 新建模式
        this.budgetForm = {
          campaign_id: '',
          budget_mode: 'pool',
          pool_budget_total: 0,
          alert_threshold: 80,
          remark: ''
        }
      }
      this.showModal('budgetModal')
    },

    /**
     * 提交预算设置
     * @async
     * @method submitBudget
     * @description 验证并保存活动预算配置
     * @returns {Promise<void>} 无返回值的Promise
     */
    async submitBudget() {
      const campaignId = this.budgetForm.campaign_id || this.editingBudgetCampaignId
      if (!campaignId) {
        this.showError('请选择活动')
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(
          API.buildURL(API_ENDPOINTS.CAMPAIGN_BUDGET.CAMPAIGN, { campaign_id: campaignId }),
          {
            method: 'PUT',
            data: {
              budget_mode: this.budgetForm.budget_mode,
              pool_budget_total: parseFloat(this.budgetForm.pool_budget_total) || 0,
              alert_threshold: parseInt(this.budgetForm.alert_threshold) || 80
            }
          }
        )

        if (response?.success) {
          this.showSuccess('预算设置成功')
          this.hideModal('budgetModal')
          await this.loadBudgetData()
        }
      } catch (error) {
        this.showError('预算设置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取预算使用率
     * @method getBudgetUsageRate
     * @param {BudgetConfig} campaign - 预算配置对象
     * @description 计算预算使用百分比
     * @returns {number|string} 使用率百分比
     */
    getBudgetUsageRate(campaign) {
      const total = campaign.pool_budget?.total || 0
      const used = campaign.pool_budget?.used || 0
      return total > 0 ? ((used / total) * 100).toFixed(1) : 0
    },

    /**
     * 获取预算使用率样式类
     * @method getBudgetUsageClass
     * @param {BudgetConfig} campaign - 预算配置对象
     * @description 根据使用率返回对应的Bootstrap进度条CSS类
     * @returns {string} CSS类名 ('bg-danger'|'bg-warning'|'bg-success')
     */
    getBudgetUsageClass(campaign) {
      const rate = this.getBudgetUsageRate(campaign)
      if (rate >= 90) {
        return 'bg-danger'
      }
      if (rate >= 70) {
        return 'bg-warning'
      }
      return 'bg-success'
    },

    /**
     * 获取预算模式文本
     * @method getBudgetModeText
     * @param {string} mode - 预算模式代码
     * @description 将预算模式代码转换为中文显示文本
     * @returns {string} 预算模式中文文本
     */
    getBudgetModeText(mode) {
      const modeMap = { pool: '总预算', user: '用户预算', daily: '每日预算', none: '无预算' }
      return modeMap[mode] || mode || '未设置'
    },

    // ==================== 策略配置方法 ====================

    /**
     * 加载策略列表
     * @async
     * @method loadStrategies
     * @description 获取策略列表并按分组分类
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadStrategies() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.STRATEGY.LIST, {}, { showLoading: false })
        if (response?.success) {
          const strategies = response.data?.strategies || response.data?.list || []
          // 保存原始策略列表（用于 x-for 循环）
          this.strategies = strategies
          // 按组分类（用于分组显示）
          this.strategyGroups = strategies.reduce((groups, strategy) => {
            const groupName = strategy.group || strategy.category || 'other'
            if (!groups[groupName]) groups[groupName] = []
            groups[groupName].push(strategy)
            return groups
          }, {})
        }
      } catch (error) {
        console.error('加载策略失败:', error)
        this.strategies = []
        this.strategyGroups = {}
      }
    },

    /**
     * 加载层级矩阵配置
     * @async
     * @method loadTierMatrix
     * @description 获取预算/压力层级矩阵配置
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadTierMatrix() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.MATRIX.LIST, {}, { showLoading: false })
        if (response?.success) {
          const data = response.data?.matrix || response.data
          this.tierMatrix = Array.isArray(data) ? data : []
        }
      } catch (error) {
        console.error('加载层级矩阵失败:', error)
        this.tierMatrix = []
      }
    },

    /**
     * 获取矩阵单元格配置
     * @method getMatrixConfig
     * @param {string} budgetTier - 预算层级
     * @param {string} pressureTier - 压力层级
     * @returns {Object|undefined} 矩阵配置对象
     */
    getMatrixConfig(budgetTier, pressureTier) {
      return this.tierMatrix.find(
        item => item.budget_tier === budgetTier && item.pressure_tier === pressureTier
      )
    },

    /**
     * 编辑矩阵单元格
     * @method editMatrixCell
     * @param {string} budgetTier - 预算层级
     * @param {string} pressureTier - 压力层级
     * @description 设置编辑单元格并显示模态框
     * @returns {void} 无返回值
     */
    editMatrixCell(budgetTier, pressureTier) {
      const currentConfig = this.getMatrixConfig(budgetTier, pressureTier) || {
        budget_tier: budgetTier,
        pressure_tier: pressureTier,
        win_probability: 0,
        max_win_amount: 0
      }
      this.editingMatrixCell = { ...currentConfig }
      this.showModal('matrixEditModal')
    },

    /**
     * 提交矩阵配置
     * @async
     * @method submitMatrixConfig
     * @description 保存层级矩阵单元格配置
     * @returns {Promise<void>} 无返回值的Promise
     */
    async submitMatrixConfig() {
      try {
        this.saving = true
        const response = await this.apiCall(API_ENDPOINTS.MATRIX.LIST, {
          method: 'PUT',
          data: this.editingMatrixCell
        })

        if (response?.success) {
          this.showSuccess('矩阵配置已更新')
          this.hideModal('matrixEditModal')
          await this.loadTierMatrix()
        }
      } catch (error) {
        this.showError('保存矩阵配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取策略分组图标
     * @method getStrategyGroupIcon
     * @param {string} groupName - 分组名称
     * @returns {string} Bootstrap图标类名
     */
    getStrategyGroupIcon(groupName) {
      const icons = {
        probability: 'bi-percent',
        frequency: 'bi-clock',
        budget: 'bi-cash',
        user: 'bi-person',
        other: 'bi-gear'
      }
      return icons[groupName] || 'bi-gear'
    },

    /**
     * 获取策略分组的中文名称
     * @method getStrategyGroupName
     * @param {string} groupName - 分组名称
     * @returns {string} 分组中文名称
     */
    getStrategyGroupName(groupName) {
      const names = {
        probability: '概率策略',
        frequency: '频率控制',
        budget: '预算管理',
        user: '用户限制',
        other: '其他策略'
      }
      return names[groupName] || groupName
    },

    // ==================== 配额管理方法 ====================

    /**
     * 加载配额规则列表
     * @async
     * @method loadQuotas
     * @description 根据筛选条件获取配额规则并计算统计
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadQuotas() {
      try {
        const params = new URLSearchParams()
        if (this.quotaFilters?.ruleType) {
          params.append('rule_type', this.quotaFilters.ruleType)
        }
        if (this.quotaFilters?.status) {
          params.append('status', this.quotaFilters.status)
        }
        if (this.quotaFilters?.campaignId) {
          params.append('campaign_id', this.quotaFilters.campaignId)
        }

        const response = await this.apiGet(
          `${API_ENDPOINTS.LOTTERY_QUOTA.RULES}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.quotas = response.data?.quotas || response.data?.list || response.data || []
          // 计算配额统计
          this.quotaStats = this.generateQuotaStats(this.quotas)
        }
      } catch (error) {
        console.error('加载配额失败:', error)
        this.quotas = []
        this.quotaStats = { totalRules: 0, activeRules: 0, usedPercentage: 0 }
      }
    },

    /**
     * 生成配额统计
     * @method generateQuotaStats
     * @param {QuotaRule[]} quotas - 配额规则列表
     * @description 从配额列表计算统计数据
     * @returns {Object} 统计对象 {totalRules, activeRules, totalQuota, usedQuota, usedPercentage}
     */
    generateQuotaStats(quotas) {
      const totalRules = quotas.length
      const activeRules = quotas.filter(q => q.status === 'active' || q.is_active).length
      const totalQuota = quotas.reduce((sum, q) => sum + (q.total_quota || 0), 0)
      const usedQuota = quotas.reduce((sum, q) => sum + (q.used_quota || 0), 0)
      const usedPercentage = totalQuota > 0 ? ((usedQuota / totalQuota) * 100).toFixed(1) : 0

      return { totalRules, activeRules, totalQuota, usedQuota, usedPercentage }
    },

    /**
     * 加载配额使用情况
     * @async
     * @method loadQuotaUsage
     * @description 获取配额使用统计数据
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadQuotaUsage() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.LOTTERY_QUOTA.USAGE,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.quotaUsage = response.data?.usage || response.data || []
        }
      } catch (error) {
        console.error('加载配额使用情况失败:', error)
        this.quotaUsage = []
      }
    },

    /**
     * 检查用户配额
     * @async
     * @method checkUserQuota
     * @description 根据用户ID查询其配额使用情况
     * @returns {Promise<void>} 无返回值的Promise
     */
    async checkUserQuota() {
      if (!this.quotaCheckUserId) {
        this.showError('请输入用户ID')
        return
      }
      try {
        const response = await this.apiGet(
          `${API_ENDPOINTS.LOTTERY_QUOTA.CHECK}?user_id=${this.quotaCheckUserId}`,
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.userQuotaCheckResult = response.data
          this.showSuccess('配额检查完成')
        }
      } catch (error) {
        console.error('检查用户配额失败:', error)
        this.showError('检查用户配额失败')
      }
    },

    /**
     * 打开创建配额模态框
     * @method openCreateQuotaModal
     * @description 重置表单状态并显示配额创建模态框
     * @returns {void} 无返回值
     */
    openCreateQuotaModal() {
      this.editingQuotaId = null
      this.isEditQuota = false
      this.quotaForm = {
        campaign_id: '',
        prize_id: '',
        total_quota: 0,
        period_type: 'daily',
        rule_type: 'campaign',
        status: 'active'
      }
      this.showModal('quotaModal')
    },

    /**
     * 编辑配额规则
     * @method editQuota
     * @param {QuotaRule} quota - 要编辑的配额规则对象
     * @description 设置编辑状态并显示编辑模态框
     * @returns {void} 无返回值
     */
    editQuota(quota) {
      this.editingQuotaId = quota.quota_id || quota.id
      this.isEditQuota = true
      this.quotaForm = {
        campaign_id: quota.campaign_id,
        prize_id: quota.prize_id,
        total_quota: quota.total_quota,
        period_type: quota.period_type || 'daily',
        rule_type: quota.rule_type || 'campaign',
        status: quota.status || 'active'
      }
      this.showModal('quotaModal')
    },

    /**
     * 提交配额表单
     * @async
     * @method submitQuotaForm
     * @description 创建或更新配额规则
     * @returns {Promise<void>} 无返回值的Promise
     */
    async submitQuotaForm() {
      if (!this.quotaForm.campaign_id || !this.quotaForm.prize_id) {
        this.showError('请选择活动和奖品')
        return
      }
      if (!this.quotaForm.total_quota || this.quotaForm.total_quota <= 0) {
        this.showError('请输入有效的配额数量')
        return
      }

      try {
        this.saving = true
        const url = this.isEditQuota
          ? `${API_ENDPOINTS.LOTTERY_QUOTA.RULES}/${this.editingQuotaId}`
          : API_ENDPOINTS.LOTTERY_QUOTA.RULES

        const response = await this.apiCall(url, {
          method: this.isEditQuota ? 'PUT' : 'POST',
          data: this.quotaForm
        })

        if (response?.success) {
          this.showSuccess(this.isEditQuota ? '配额更新成功' : '配额创建成功')
          this.hideModal('quotaModal')
          await this.loadQuotas()
        }
      } catch (error) {
        this.showError('保存配额失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除配额
     * @async
     * @method deleteQuota
     * @param {QuotaRule} quota - 要删除的配额规则对象
     * @description 确认后删除指定配额规则
     * @returns {Promise<void>} 无返回值的Promise
     */
    async deleteQuota(quota) {
      await this.confirmAndExecute(
        `确认删除此配额配置？`,
        async () => {
          const response = await this.apiCall(
            `${API_ENDPOINTS.LOTTERY_QUOTA.RULES}/${quota.quota_id || quota.id}`,
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadQuotas()
          }
        },
        { successMessage: '配额已删除' }
      )
    },

    /**
     * 切换配额状态
     * @async
     * @method toggleQuotaStatus
     * @param {QuotaRule} quota - 配额规则对象
     * @description 切换配额的启用/禁用状态
     * @returns {Promise<void>} 无返回值的Promise
     */
    async toggleQuotaStatus(quota) {
      const newStatus = quota.status === 'active' ? 'inactive' : 'active'
      try {
        const response = await this.apiCall(
          `${API_ENDPOINTS.LOTTERY_QUOTA.RULES}/${quota.quota_id || quota.id}`,
          { method: 'PUT', data: { status: newStatus } }
        )
        if (response?.success) {
          this.showSuccess(`配额已${newStatus === 'active' ? '启用' : '禁用'}`)
          await this.loadQuotas()
        }
      } catch (error) {
        this.showError('切换配额状态失败')
      }
    },

    /**
     * 获取配额类型文本
     * @method getQuotaTypeText
     * @param {string} type - 配额类型代码
     * @description 将配额类型代码转换为中文显示文本
     * @returns {string} 配额类型中文文本
     */
    getQuotaTypeText(type) {
      const map = {
        global: '全局配额',
        user: '用户配额',
        tier: '等级配额',
        campaign: '活动配额',
        daily: '每日配额'
      }
      return map[type] || type || '-'
    },

    /**
     * 获取周期类型文本
     * @method getPeriodTypeText
     * @param {string} type - 周期类型代码
     * @description 将周期类型代码转换为中文显示文本
     * @returns {string} 周期类型中文文本
     */
    getPeriodTypeText(type) {
      const map = {
        daily: '每日',
        weekly: '每周',
        monthly: '每月',
        total: '总计',
        permanent: '永久'
      }
      return map[type] || type || '-'
    },

    /**
     * 计算配额使用百分比
     * @method getQuotaUsagePercent
     * @param {QuotaRule} quota - 配额规则对象
     * @description 计算配额的使用百分比
     * @returns {number|string} 使用率百分比
     */
    getQuotaUsagePercent(quota) {
      if (!quota.total_quota || quota.total_quota <= 0) {
        return 0
      }
      return (((quota.used_quota || 0) / quota.total_quota) * 100).toFixed(1)
    },

    /**
     * 获取配额状态样式
     * @method getQuotaStatusClass
     * @param {QuotaRule} quota - 配额规则对象
     * @description 根据使用率返回对应的Bootstrap进度条CSS类
     * @returns {string} CSS类名 ('bg-danger'|'bg-warning'|'bg-success')
     */
    getQuotaStatusClass(quota) {
      const percent = this.getQuotaUsagePercent(quota)
      if (percent >= 100) {
        return 'bg-danger'
      }
      if (percent >= 80) {
        return 'bg-warning'
      }
      return 'bg-success'
    },

    // ==================== 定价配置方法 ====================

    /**
     * 加载定价配置列表
     * @async
     * @method loadPricingConfigs
     * @description 获取所有定价配置
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadPricingConfigs() {
      try {
        // 使用 PRICING.LIST API 获取定价配置列表
        const response = await this.apiGet(API_ENDPOINTS.PRICING.LIST)
        if (response?.success) {
          const pricingData = response.data?.list || response.data?.configs || response.data
          this.pricingConfigs = Array.isArray(pricingData) ? pricingData : []
          console.log('[LotteryManagement] 定价配置数量:', this.pricingConfigs.length)
        }
      } catch (error) {
        console.error('加载定价配置失败:', error)
        this.pricingConfigs = []
      }
    },

    /**
     * 加载定价版本历史
     * @async
     * @method loadPricingVersions
     * @param {string} campaignCode - 活动代码
     * @description 获取指定活动的定价版本列表
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadPricingVersions(campaignCode) {
      if (!campaignCode) {
        return
      }
      try {
        const endpoint = API_ENDPOINTS.PRICING.GET_VERSIONS.replace(':code', campaignCode)
        const response = await this.apiGet(endpoint)
        if (response?.success) {
          this.pricingVersions = response.data?.versions || response.data || []
        }
      } catch (error) {
        console.error('加载定价版本失败:', error)
        this.pricingVersions = []
      }
    },

    /**
     * 打开创建定价模态框
     * @method openCreatePricingModal
     * @description 重置表单状态并显示定价创建模态框
     * @returns {void} 无返回值
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
     * @method editPricing
     * @param {PricingConfig} pricing - 要编辑的定价配置对象
     * @description 设置编辑状态并显示编辑模态框
     * @returns {void} 无返回值
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
     * @async
     * @method savePricing
     * @description 创建或更新定价配置
     * @returns {Promise<void>} 无返回值的Promise
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
          ? API_ENDPOINTS.PRICING.UPDATE.replace(':id', this.editingPricingId)
          : API_ENDPOINTS.PRICING.CREATE.replace(':code', this.pricingForm.campaign_code)

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
     * @async
     * @method activatePricing
     * @param {PricingConfig} pricing - 定价配置对象
     * @param {number|string} version - 要激活的版本号
     * @description 确认后激活指定定价版本
     * @returns {Promise<void>} 无返回值的Promise
     */
    async activatePricing(pricing, version) {
      await this.confirmAndExecute(
        `确认激活定价版本 v${version}？`,
        async () => {
          const endpoint = API_ENDPOINTS.PRICING.ACTIVATE.replace(
            ':code',
            pricing.campaign_code
          ).replace(':version', version)
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
     * @async
     * @method archivePricing
     * @param {PricingConfig} pricing - 定价配置对象
     * @param {number|string} version - 要归档的版本号
     * @description 确认后归档指定定价版本
     * @returns {Promise<void>} 无返回值的Promise
     */
    async archivePricing(pricing, version) {
      await this.confirmAndExecute(
        `确认归档定价版本 v${version}？归档后将无法使用。`,
        async () => {
          const endpoint = API_ENDPOINTS.PRICING.ARCHIVE.replace(
            ':code',
            pricing.campaign_code
          ).replace(':version', version)
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
     * @method viewPricingVersions
     * @param {PricingConfig} pricing - 定价配置对象
     * @description 加载版本列表并显示版本历史模态框
     * @returns {void} 无返回值
     */
    viewPricingVersions(pricing) {
      this.selectedPricingCampaign = pricing
      this.loadPricingVersions(pricing.campaign_code)
      this.showModal('pricingVersionsModal')
    },

    /**
     * 搜索定价配置
     * @method searchPricing
     * @description 重新加载定价配置列表
     * @returns {void} 无返回值
     */
    searchPricing() {
      this.loadPricingConfigs()
    },

    /**
     * 重置定价筛选条件
     * @method resetPricingFilters
     * @description 清除筛选条件并重新加载列表
     * @returns {void} 无返回值
     */
    resetPricingFilters() {
      this.pricingFilters = { campaignCode: '', status: '' }
      this.loadPricingConfigs()
    },

    /**
     * 获取定价状态CSS类
     * @method getPricingStatusClass
     * @param {string} status - 定价状态代码
     * @description 根据状态返回Bootstrap徽章CSS类
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
     * @method getPricingStatusText
     * @param {string} status - 定价状态代码
     * @description 将状态代码转换为中文显示文本
     * @returns {string} 状态中文文本
     */
    getPricingStatusText(status) {
      const labels = {
        active: '生效中',
        draft: '草稿',
        archived: '已归档',
        scheduled: '待生效'
      }
      return labels[status] || status
    },

    // ==================== 抽奖监控方法 ====================

    /**
     * 加载抽奖监控指标
     * @async
     * @method loadLotteryMetrics
     * @description 并行加载统计数据、活动指标、小时指标
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadLotteryMetrics() {
      try {
        // 并行加载所有监控数据
        const [metricsRes, campaignMetricsRes, hourlyRes, _statsRes] = await Promise.all([
          this.apiGet(
            API_ENDPOINTS.LOTTERY_MONITORING.STATS,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            API_ENDPOINTS.LOTTERY_STRATEGY_STATS.OVERVIEW,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            API_ENDPOINTS.LOTTERY_MONITORING.HOURLY_METRICS,
            {},
            { showLoading: false, showError: false }
          ),
          this.apiGet(
            API_ENDPOINTS.LOTTERY_STRATEGY_STATS.TIER_DISTRIBUTION,
            {},
            { showLoading: false, showError: false }
          )
        ])

        // 处理统计数据
        if (metricsRes?.success) {
          const data = metricsRes.data || {}
          this.lotteryMetrics = {
            totalDraws: data.total_draws ?? data.totalDraws ?? 0,
            totalWins: data.total_wins ?? data.totalWins ?? 0,
            winRate: data.win_rate ? (data.win_rate * 100).toFixed(2) : data.winRate || 0,
            totalUsers: data.total_users ?? data.totalUsers ?? 0
          }
        }

        // 处理活动指标
        if (campaignMetricsRes?.success) {
          this.campaignMetrics = campaignMetricsRes.data?.metrics || campaignMetricsRes.data || []
        }

        // 处理小时指标
        if (hourlyRes?.success) {
          this.hourlyMetrics = hourlyRes.data?.metrics || hourlyRes.data?.list || []
        }
      } catch (error) {
        console.error('加载抽奖指标失败:', error)
        this.lotteryMetrics = { totalDraws: 0, totalWins: 0, winRate: 0, totalUsers: 0 }
        this.campaignMetrics = []
        this.hourlyMetrics = []
      }
    },

    /**
     * 加载用户体验状态
     * @async
     * @method loadUserExperienceStates
     * @description 根据筛选条件获取用户体验状态列表
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadUserExperienceStates() {
      try {
        const params = new URLSearchParams()
        if (this.monitoringFilters.userId) {
          params.append('user_id', this.monitoringFilters.userId)
        }
        if (this.monitoringFilters.campaignId) {
          params.append('campaign_id', this.monitoringFilters.campaignId)
        }
        params.append('limit', 50)

        const response = await this.apiGet(
          `${API_ENDPOINTS.LOTTERY_MONITORING.USER_EXPERIENCE}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.userExperienceStates = response.data?.states || response.data?.list || []
        }
      } catch (error) {
        console.error('加载用户体验状态失败:', error)
        this.userExperienceStates = []
      }
    },

    /**
     * 加载用户全局状态
     * @async
     * @method loadUserGlobalStates
     * @description 根据筛选条件获取用户全局状态列表
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadUserGlobalStates() {
      try {
        const params = new URLSearchParams()
        if (this.monitoringFilters.userId) {
          params.append('user_id', this.monitoringFilters.userId)
        }
        params.append('limit', 50)

        const response = await this.apiGet(
          `${API_ENDPOINTS.LOTTERY_MONITORING.USER_GLOBAL}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.userGlobalStates = response.data?.states || response.data?.list || []
        }
      } catch (error) {
        console.error('加载用户全局状态失败:', error)
        this.userGlobalStates = []
      }
    },

    /**
     * 加载用户配额信息
     * @async
     * @method loadUserQuotaList
     * @description 从后端加载当前用户的配额使用情况
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadUserQuotaList() {
      try {
        const params = new URLSearchParams()
        if (this.monitoringFilters.userId) {
          params.append('user_id', this.monitoringFilters.userId)
        }
        params.append('limit', 50)

        const response = await this.apiGet(
          `${API_ENDPOINTS.LOTTERY_MONITORING.USER_QUOTAS}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.userQuotas = response.data?.quotas || response.data?.list || []
        }
      } catch (error) {
        console.error('加载用户配额失败:', error)
        this.userQuotas = []
      }
    },

    /**
     * 刷新监控数据
     * @async
     * @method refreshMonitoringData
     * @description 并行刷新所有监控相关数据
     * @returns {Promise<void>} 无返回值的Promise
     */
    async refreshMonitoringData() {
      await Promise.all([
        this.loadLotteryMetrics(),
        this.loadUserExperienceStates(),
        this.loadUserGlobalStates(),
        this.loadUserQuotaList()
      ])
    },

    /**
     * 搜索用户监控数据
     * @method searchUserMonitoring
     * @description 根据当前筛选条件重新加载用户监控数据
     * @returns {void} 无返回值
     */
    searchUserMonitoring() {
      this.loadUserExperienceStates()
      this.loadUserGlobalStates()
      this.loadUserQuotaList()
    },

    /**
     * 获取体验阶段文本
     * @method getExperiencePhaseText
     * @param {string} phase - 体验阶段代码
     * @description 将体验阶段代码转换为中文显示文本
     * @returns {string} 体验阶段中文文本
     */
    getExperiencePhaseText(phase) {
      const map = {
        newcomer: '新手期',
        growth: '成长期',
        mature: '成熟期',
        decline: '衰退期',
        churn_risk: '流失风险'
      }
      return map[phase] || phase || '-'
    },

    /**
     * 获取体验阶段样式
     * @method getExperiencePhaseClass
     * @param {string} phase - 体验阶段代码
     * @description 根据体验阶段返回对应的Bootstrap徽章CSS类
     * @returns {string} CSS类名
     */
    getExperiencePhaseClass(phase) {
      const map = {
        newcomer: 'bg-info',
        growth: 'bg-success',
        mature: 'bg-primary',
        decline: 'bg-warning',
        churn_risk: 'bg-danger'
      }
      return map[phase] || 'bg-secondary'
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化日期时间为本地datetime-local输入格式
     * @method formatDateTimeLocal
     * @param {string|Date|null} dateStr - 日期字符串或Date对象
     * @returns {string} datetime-local格式字符串 (YYYY-MM-DDTHH:mm)
     */
    formatDateTimeLocal(dateStr) {
      if (!dateStr) {
        return ''
      }
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) {
          return ''
        }
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}`
      } catch {
        return ''
      }
    },

    /**
     * 安全格式化日期时间
     * @method formatDateSafe
     * @param {string|Date|null} dateStr - 日期字符串或Date对象
     * @returns {string} 格式化后的中文日期时间字符串
     */
    formatDateSafe(dateStr) {
      if (!dateStr) {
        return '-'
      }
      if (typeof dateStr === 'string' && dateStr.includes('年')) {
        return dateStr.replace(/星期[一二三四五六日]/, '').trim()
      }
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) {
          return dateStr
        }
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return dateStr
      }
    },

    // ==================== 核销码管理方法 ====================

    /**
     * 加载门店列表
     * @async
     * @method loadStores
     * @description 获取可用门店列表供核销选择
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadStores() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.STORE.LIST,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.stores = response.data?.items || response.data?.stores || []
        }
      } catch (error) {
        console.error('加载门店失败:', error)
        this.stores = []
      }
    },

    /**
     * 加载核销码列表
     * @async
     * @method loadRedemptionCodes
     * @param {number} [pageNum=1] - 页码
     * @description 根据筛选条件和分页参数获取核销码列表
     * @returns {Promise<void>} 无返回值的Promise
     */
    async loadRedemptionCodes(pageNum = 1) {
      try {
        this.page = pageNum
        this.redemptionSelectedIds = []

        const params = new URLSearchParams()
        params.append('page', pageNum)
        params.append('limit', this.pageSize)
        if (this.redemptionFilters.status) {
          params.append('status', this.redemptionFilters.status)
        }
        if (this.redemptionFilters.prizeType) {
          params.append('prize_type', this.redemptionFilters.prizeType)
        }
        if (this.redemptionFilters.code) {
          params.append('code', this.redemptionFilters.code)
        }
        if (this.redemptionFilters.userId) {
          params.append('user_id', this.redemptionFilters.userId)
        }

        const response = await this.apiGet(
          `${API_ENDPOINTS.BUSINESS_RECORDS.LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.redemptionCodes =
            response.data?.orders || response.data?.records || response.data?.codes || []
          this.total = response.data?.pagination?.total || this.redemptionCodes.length
          this.totalPages =
            response.data?.pagination?.total_pages || Math.ceil(this.total / this.pageSize)

          // 更新统计
          this.redemptionStats = {
            total: this.total,
            pending: this.redemptionCodes.filter(c => c.status === 'pending').length,
            fulfilled: this.redemptionCodes.filter(
              c => c.status === 'fulfilled' || c.status === 'redeemed'
            ).length,
            expired: this.redemptionCodes.filter(c => c.status === 'expired').length
          }
        }
      } catch (error) {
        console.error('加载核销码失败:', error)
        this.redemptionCodes = []
      }
    },

    /**
     * 搜索核销码
     * @method searchRedemptionCodes
     * @description 重置到第一页并重新加载核销码列表
     * @returns {void} 无返回值
     */
    searchRedemptionCodes() {
      this.loadRedemptionCodes(1)
    },

    /**
     * 查看核销码详情
     * @async
     * @method viewRedemptionDetail
     * @param {string} orderId - 订单ID
     * @description 获取核销码详情并显示详情模态框
     * @returns {Promise<void>} 无返回值的Promise
     */
    async viewRedemptionDetail(orderId) {
      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.BUSINESS_RECORDS.DETAIL, { order_id: orderId }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.redemptionDetail = response.data
          this.showModal('redemptionDetailModal')
        } else {
          this.showError(response?.message || '获取详情失败')
        }
      } catch (error) {
        console.error('加载详情失败:', error)
        this.showError(error.message || '加载详情失败')
      }
    },

    /**
     * 打开手动核销模态框
     * @method openRedeemModal
     * @param {string} orderId - 订单ID
     * @param {string} codeDisplay - 核销码显示文本
     * @description 设置核销表单并显示模态框
     * @returns {void} 无返回值
     */
    openRedeemModal(orderId, codeDisplay) {
      this.redeemForm = {
        orderId,
        codeDisplay,
        storeId: '',
        remark: ''
      }
      this.showModal('redeemModal')
    },

    /**
     * 提交核销
     * @async
     * @method submitRedeem
     * @description 执行核销操作并刷新列表
     * @returns {Promise<void>} 无返回值的Promise
     */
    async submitRedeem() {
      if (this.submitting) {
        return
      }
      this.submitting = true

      try {
        const response = await this.apiCall(
          API.buildURL(API_ENDPOINTS.BUSINESS_RECORDS.REDEEM, {
            order_id: this.redeemForm.orderId
          }),
          {
            method: 'POST',
            data: {
              store_id: this.redeemForm.storeId ? parseInt(this.redeemForm.storeId) : null,
              remark: this.redeemForm.remark
            }
          }
        )

        if (response?.success) {
          this.hideModal('redeemModal')
          this.showSuccess('核销成功')
          await this.loadRedemptionCodes(this.page)
        } else {
          this.showError(response?.message || '核销失败')
        }
      } catch (error) {
        console.error('核销失败:', error)
        this.showError(error.message || '核销失败')
      } finally {
        this.submitting = false
      }
    },

    /**
     * 取消核销码
     * @async
     * @method cancelRedemptionCode
     * @param {string} orderId - 订单ID
     * @description 确认后取消指定核销码
     * @returns {Promise<void>} 无返回值的Promise
     */
    async cancelRedemptionCode(orderId) {
      await this.confirmAndExecute(
        '确定要取消此核销码吗？',
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.BUSINESS_RECORDS.CANCEL, { order_id: orderId }),
            { method: 'POST' }
          )
          if (response?.success) {
            await this.loadRedemptionCodes(this.page)
          }
        },
        { successMessage: '已取消', confirmText: '确认取消' }
      )
    },

    /**
     * 切换选中状态
     * @method toggleRedemptionSelect
     * @param {string} orderId - 订单ID
     * @description 切换指定核销码的选中状态
     * @returns {void} 无返回值
     */
    toggleRedemptionSelect(orderId) {
      const index = this.redemptionSelectedIds.indexOf(orderId)
      if (index > -1) {
        this.redemptionSelectedIds.splice(index, 1)
      } else {
        this.redemptionSelectedIds.push(orderId)
      }
    },

    /**
     * 全选/取消全选
     * @method toggleRedemptionSelectAll
     * @description 切换所有核销码的选中状态
     * @returns {void} 无返回值
     */
    toggleRedemptionSelectAll() {
      if (this.isAllRedemptionSelected) {
        this.redemptionSelectedIds = []
      } else {
        this.redemptionSelectedIds = this.redemptionCodes.map(c => c.order_id)
      }
    },

    /**
     * 是否全选
     * @type {boolean}
     * @description 计算属性，判断是否所有核销码都被选中
     * @returns {boolean} 是否全选
     */
    get isAllRedemptionSelected() {
      return (
        this.redemptionCodes.length > 0 &&
        this.redemptionSelectedIds.length === this.redemptionCodes.length
      )
    },

    /**
     * 批量过期
     * @async
     * @method batchExpireRedemption
     * @description 确认后将选中的核销码批量设为过期
     * @returns {Promise<void>} 无返回值的Promise
     */
    async batchExpireRedemption() {
      if (this.redemptionSelectedIds.length === 0) {
        this.showWarning('请先选择要处理的核销码')
        return
      }

      await this.confirmAndExecute(
        `确定要将选中的 ${this.redemptionSelectedIds.length} 个核销码设为过期吗？`,
        async () => {
          const response = await this.apiCall(API_ENDPOINTS.BUSINESS_RECORDS.BATCH_EXPIRE, {
            method: 'POST',
            data: { order_ids: this.redemptionSelectedIds }
          })
          if (response?.success) {
            this.redemptionSelectedIds = []
            await this.loadRedemptionCodes(this.page)
          }
        },
        { successMessage: '批量过期成功', confirmText: '确认过期' }
      )
    },

    /**
     * 导出核销码
     * @method exportRedemptionCodes
     * @description 根据筛选条件导出核销码CSV文件
     * @returns {void} 无返回值
     */
    exportRedemptionCodes() {
      const params = new URLSearchParams()
      if (this.redemptionFilters.status) params.append('status', this.redemptionFilters.status)
      params.append('format', 'csv')

      const exportUrl = API_ENDPOINTS.BUSINESS_RECORDS.EXPORT + '?' + params.toString()
      window.open(exportUrl, '_blank')
    },

    // 核销码工具函数

    /**
     * 获取核销码显示文本
     * @method getCodeDisplay
     * @param {string|null} codeHash - 核销码哈希值
     * @description 截取核销码前8位并添加省略号
     * @returns {string} 显示用的短码
     */
    getCodeDisplay(codeHash) {
      if (!codeHash) {
        return '-'
      }
      return codeHash.substring(0, 8) + '...'
    },

    /**
     * 获取核销人姓名
     * @method getRedeemerName
     * @param {RedemptionCode|null} item - 核销码记录对象
     * @description 从核销码记录中提取核销人姓名或手机号
     * @returns {string} 核销人姓名
     */
    getRedeemerName(item) {
      if (!item) {
        return ''
      }
      const redeemer = item.redeemer || {}
      return redeemer.nickname || redeemer.mobile || ''
    },

    /**
     * 获取核销码对应奖品名称
     * @method getRedemptionPrizeName
     * @param {RedemptionCode|null} item - 核销码记录对象
     * @description 从核销码记录中提取奖品名称
     * @returns {string} 奖品名称
     */
    getRedemptionPrizeName(item) {
      if (!item) {
        return '-'
      }
      const itemInfo = item.item_instance || {}
      const itemMeta = itemInfo.meta || {}
      return itemMeta.prize_name || itemMeta.name || itemInfo.item_type || '-'
    },

    /**
     * 获取核销码对应活动名称
     * @method getRedemptionCampaignName
     * @param {RedemptionCode|null} item - 核销码记录对象
     * @description 从核销码记录中提取活动名称
     * @returns {string} 活动名称
     */
    getRedemptionCampaignName(item) {
      if (!item) {
        return '-'
      }
      const itemInfo = item.item_instance || {}
      const itemMeta = itemInfo.meta || {}
      return itemMeta.campaign_name || '-'
    },

    /**
     * 获取核销状态CSS类
     * @method getRedemptionStatusClass
     * @param {string} status - 核销状态代码
     * @description 根据状态返回对应的Bootstrap徽章CSS类
     * @returns {string} CSS类名
     */
    getRedemptionStatusClass(status) {
      const classes = {
        pending: 'bg-warning text-dark',
        fulfilled: 'bg-success',
        redeemed: 'bg-success',
        expired: 'bg-danger',
        cancelled: 'bg-secondary'
      }
      return classes[status] || 'bg-secondary'
    },

    /**
     * 获取核销状态文本
     * @method getRedemptionStatusText
     * @param {string} status - 核销状态代码
     * @description 将状态代码转换为中文显示文本
     * @returns {string} 状态中文文本
     */
    getRedemptionStatusText(status) {
      const labels = {
        pending: '待核销',
        fulfilled: '已核销',
        redeemed: '已核销',
        expired: '已过期',
        cancelled: '已取消'
      }
      return labels[status] || status
    }
  }))

  console.log('✅ [LotteryManagement] Alpine 组件已注册')
}

// 🔧 修复：多种初始化方式确保组件被注册
if (typeof window.Alpine !== 'undefined' && typeof window.createPageMixin === 'function') {
  console.log('[LotteryManagement] Alpine 已可用，直接注册组件')
  registerLotteryManagementComponents()
} else {
  document.addEventListener('alpine:init', registerLotteryManagementComponents)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(registerLotteryManagementComponents, 100)
    })
  } else {
    setTimeout(registerLotteryManagementComponents, 100)
  }
}

console.log('📦 [LotteryManagement] 页面脚本已加载')
