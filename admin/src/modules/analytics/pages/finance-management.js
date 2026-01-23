/* global Alpine, createPageMixin, API_ENDPOINTS, API */
/**
 * Finance Management Page - Alpine.js Mixin 重构版
 * 财务管理整合页面组件
 *
 * @file admin/src/modules/analytics/pages/finance-management.js
 * @module FinanceManagementPage
 * @version 3.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 财务管理整合页面，提供多个财务相关子模块的统一管理界面：
 * - 消费记录 (consumption) - 用户消费流水查询和统计
 * - 钻石账户 (diamond-accounts) - 用户钻石余额管理和调整
 * - 商户积分 (merchant-points) - 商户积分余额和历史查询
 * - 债务管理 (debt-management) - 欠款记录管理、还款和核销
 * - 活动预算 (campaign-budget) - 活动预算配置和使用率监控
 * - 商户操作日志 (merchant-logs) - 商户相关操作审计日志
 *
 * @requires Alpine.js - 响应式框架
 * @requires createPageMixin - 页面基础功能混入（分页、认证、API调用等）
 * @requires API_ENDPOINTS - API端点配置对象
 * @requires API - API工具类，用于构建URL
 *
 * @example
 * <!-- 使用导航组件 -->
 * <nav x-data="financeNavigation">
 *   <template x-for="page in subPages">
 *     <button @click="switchPage(page.id)" x-text="page.title"></button>
 *   </template>
 * </nav>
 *
 * <!-- 使用内容组件 -->
 * <div x-data="financePageContent">
 *   <div x-show="currentPage === 'consumption'">消费记录列表</div>
 *   <div x-show="currentPage === 'diamond-accounts'">钻石账户列表</div>
 * </div>
 */

/**
 * @typedef {Object} ConsumptionRecord
 * @property {number} id - 消费记录ID
 * @property {number} user_id - 用户ID
 * @property {number} amount - 消费金额
 * @property {string} payment_method - 支付方式 ('wechat'|'alipay'|'cash'|'card'|'points')
 * @property {string} status - 状态 ('pending'|'approved'|'rejected')
 * @property {string} created_at - 创建时间
 */

/**
 * @typedef {Object} DiamondAccount
 * @property {number} user_id - 用户ID
 * @property {string} nickname - 用户昵称
 * @property {number} balance - 钻石余额
 * @property {number} total_earned - 累计获得
 * @property {number} total_spent - 累计消费
 */

/**
 * @typedef {Object} DebtRecord
 * @property {number} debt_id - 债务ID
 * @property {number} user_id - 用户ID
 * @property {number} amount - 债务金额
 * @property {number} total_amount - 总金额
 * @property {number} paid_amount - 已还金额
 * @property {string} status - 状态 ('pending'|'partial'|'recovered'|'written_off'|'overdue')
 * @property {string} created_at - 创建时间
 */

/**
 * @typedef {Object} BudgetConfig
 * @property {number} budget_id - 预算ID
 * @property {number} campaign_id - 活动ID
 * @property {string} campaign_name - 活动名称
 * @property {number} total_budget - 总预算
 * @property {number} used_budget - 已使用预算
 * @property {boolean} is_active - 是否激活
 */

/**
 * @typedef {Object} SubPage
 * @property {string} id - 子页面ID
 * @property {string} title - 子页面标题
 * @property {string} icon - Bootstrap图标类名
 */

document.addEventListener('alpine:init', () => {
  console.log('[FinanceManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 全局 Store - 存储当前激活的子页面ID
  Alpine.store('financePage', 'consumption')

  /**
   * 财务管理导航组件
   *
   * @function financeNavigation
   * @description 提供财务管理子页面切换导航功能，与financePageContent组件配合使用
   * @returns {Object} Alpine.js组件配置对象
   *
   * @property {string} currentPage - 当前激活的子页面ID
   * @property {SubPage[]} subPages - 子页面配置列表
   */
  Alpine.data('financeNavigation', () => ({
    ...createPageMixin(),

    /**
     * 当前激活的子页面ID
     * @type {string}
     */
    currentPage: 'consumption',

    /**
     * 子页面配置列表
     * @type {SubPage[]}
     */
    subPages: [
      { id: 'consumption', title: '消费记录', icon: 'bi-receipt' },
      { id: 'diamond-accounts', title: '钻石账户', icon: 'bi-gem' },
      { id: 'merchant-points', title: '商户积分', icon: 'bi-coin' },
      { id: 'debt-management', title: '债务管理', icon: 'bi-file-earmark-minus' },
      { id: 'campaign-budget', title: '活动预算', icon: 'bi-piggy-bank' },
      { id: 'merchant-logs', title: '商户操作日志', icon: 'bi-journal-text' }
    ],

    /**
     * 初始化导航组件
     * @method init
     * @description 验证登录状态，从URL参数获取初始页面，同步到全局Store
     * @returns {void}
     */
    init() {
      console.log('✅ 财务管理导航初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'consumption'
      Alpine.store('financePage', this.currentPage)
    },

    /**
     * 切换子页面
     * @method switchPage
     * @param {string} pageId - 目标子页面ID
     * @description 更新当前页面状态，同步到全局Store，并更新URL
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('financePage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  /**
   * 财务管理页面内容组件
   *
   * @function financePageContent
   * @description 根据当前激活的子页面渲染对应内容，与financeNavigation组件配合使用
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('financePageContent', () => ({
    ...createPageMixin(),

    // ==================== 消费记录数据 ====================

    /**
     * 消费记录列表
     * @type {ConsumptionRecord[]}
     */
    consumptionList: [],

    /**
     * 消费统计数据
     * @type {{totalCount: number, totalAmount: number, todayAmount: number, avgAmount: number}}
     */
    consumptionStats: { totalCount: 0, totalAmount: 0, todayAmount: 0, avgAmount: 0 },

    /**
     * 消费记录筛选条件
     * @type {{startDate: string, endDate: string, keyword: string, userId: string, status: string}}
     */
    consumptionFilters: { startDate: '', endDate: '', keyword: '', userId: '', status: '' },

    // ==================== 钻石账户数据 ====================

    /**
     * 钻石账户列表
     * @type {DiamondAccount[]}
     */
    diamondAccounts: [],

    /**
     * 钻石账户筛选条件
     * @type {{keyword: string, balanceRange: string}}
     */
    diamondFilters: { keyword: '', balanceRange: '' },

    // ==================== 商户积分数据 ====================

    /**
     * 商户积分列表
     * @type {Array<Object>}
     */
    merchantPoints: [],

    // ==================== 债务管理数据 ====================

    /**
     * 债务记录列表
     * @type {DebtRecord[]}
     */
    debtList: [],

    /**
     * 债务统计数据
     * @type {{pendingCount: number, pendingAmount: number, recoveredAmount: number}}
     */
    debtStats: { pendingCount: 0, pendingAmount: 0, recoveredAmount: 0 },

    // ==================== 财务统计数据 ====================

    /**
     * 财务统计数据（用于活动预算页面显示）
     * @type {{todayRevenue: number, monthRevenue: number, pendingCount: number, totalDebt: number}}
     */
    financeStats: { todayRevenue: 0, monthRevenue: 0, pendingCount: 0, totalDebt: 0 },

    // ==================== 商户操作日志数据 ====================

    /**
     * 商户操作日志列表
     * @type {Array<Object>}
     */
    merchantLogs: [],

    /**
     * 商户日志统计数据
     * @type {{totalLogs: number, todayLogs: number, errorLogs: number}}
     */
    merchantLogStats: { totalLogs: 0, todayLogs: 0, errorLogs: 0 },

    /**
     * 商户日志筛选条件
     * @type {{merchantId: string, actionType: string, startDate: string, endDate: string}}
     */
    merchantLogFilters: { merchantId: '', actionType: '', startDate: '', endDate: '' },

    /** @type {number} 商户日志当前页码 */
    merchantLogPage: 1,

    /** @type {number} 商户日志每页数量 */
    merchantLogPageSize: 20,

    /** @type {{total: number, totalPages: number}} 商户日志分页信息 */
    merchantLogPagination: { total: 0, totalPages: 1 },

    /** @type {Object|null} 当前选中的商户日志 */
    selectedMerchantLog: null,

    // ==================== 表单数据 ====================

    /**
     * 拒绝表单数据
     * @type {{reason: string}}
     */
    rejectForm: {
      reason: ''
    },

    /**
     * 还款表单数据
     * @type {{totalAmount: number, paidAmount: number, amount: number, remark: string}}
     */
    paymentForm: {
      totalAmount: 0,
      paidAmount: 0,
      amount: 0,
      remark: ''
    },

    // ==================== 活动预算数据 ====================

    /**
     * 活动预算列表
     * @type {BudgetConfig[]}
     */
    budgetList: [],

    /**
     * 预算表单数据
     * @type {{budget_id: number|null, campaign_id: string, campaign_name: string, total_budget: number, is_active: boolean}}
     */
    budgetForm: {
      budget_id: null,
      campaign_id: '',
      campaign_name: '',
      total_budget: 0,
      is_active: true
    },

    /** @type {boolean} 是否为编辑预算模式 */
    isEditBudget: false,

    // ==================== 选中数据项 ====================

    /** @type {ConsumptionRecord|null} 当前选中的消费记录 */
    selectedConsumption: null,

    /** @type {DiamondAccount|null} 当前选中的钻石账户 */
    selectedAccount: null,

    /** @type {DebtRecord|null} 当前选中的债务记录 */
    selectedDebt: null,

    /** @type {Object|null} 当前选中的商户 */
    selectedMerchant: null,

    // ==================== 钻石调整表单 ====================

    /**
     * 钻石调整表单数据
     * @type {{user_id: string, nickname: string, adjust_type: string, amount: number, reason: string}}
     */
    adjustDiamondForm: {
      user_id: '',
      nickname: '',
      adjust_type: 'increase',
      amount: 0,
      reason: ''
    },

    /** @type {Array<Object>} 钻石变动历史记录 */
    diamondHistory: [],

    /** @type {Array<Object>} 商户积分历史记录 */
    merchantPointHistory: [],

    // ==================== 通用状态 ====================

    /** @type {boolean} 保存操作进行中标志 */
    saving: false,

    /** @type {number} 当前页码 */
    page: 1,

    /** @type {number} 每页数量 */
    pageSize: 20,

    /**
     * 获取当前激活的子页面ID
     * @returns {string} 当前页面ID
     */
    get currentPage() {
      return Alpine.store('financePage')
    },

    /**
     * 初始化页面内容组件
     * @method init
     * @description 加载当前页面数据，并监听全局Store变化自动重新加载
     * @returns {void}
     */
    init() {
      console.log('✅ 财务管理内容初始化')

      this.loadPageData()
      this.$watch('$store.financePage', () => this.loadPageData())
    },

    /**
     * 根据当前页面加载对应数据
     * @async
     * @method loadPageData
     * @description 根据currentPage值分发到对应的数据加载方法
     * @returns {Promise<void>} 无返回值
     */
    async loadPageData() {
      const page = this.currentPage
      await this.withLoading(
        async () => {
          switch (page) {
            case 'consumption':
              await this.loadConsumption()
              await this.loadConsumptionStats()
              break
            case 'diamond-accounts':
              await this.loadDiamondAccounts()
              break
            case 'merchant-points':
              await this.loadMerchantPoints()
              break
            case 'debt-management':
              await this.loadDebtList()
              await this.loadDebtStats()
              break
            case 'campaign-budget':
              await this.loadBudgetList()
              await this.loadFinanceStats()
              break
            case 'merchant-logs':
              await this.loadMerchantLogs()
              await this.loadMerchantLogStats()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 消费记录方法 ====================

    /**
     * 加载消费记录列表
     * @async
     * @method loadConsumption
     * @description 根据筛选条件从后端获取消费记录数据
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.CONSUMPTION.ADMIN_RECORDS
     */
    async loadConsumption() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page || 1) // 使用分页变量 page，不是 currentPage（子页面ID）
        params.append('page_size', this.pageSize || 20)
        if (this.consumptionFilters.startDate)
          params.append('start_date', this.consumptionFilters.startDate)
        if (this.consumptionFilters.endDate)
          params.append('end_date', this.consumptionFilters.endDate)
        if (this.consumptionFilters.keyword)
          params.append('keyword', this.consumptionFilters.keyword)

        // 使用正确的 API 端点：/api/v4/console/consumption/records
        const response = await this.apiGet(
          `${API_ENDPOINTS.CONSUMPTION.ADMIN_RECORDS}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.consumptionList = response.data?.records || response.data?.list || []
        }
      } catch (error) {
        console.error('加载消费记录失败:', error)
        this.consumptionList = []
      }
    },

    /**
     * 加载消费统计数据
     * @async
     * @method loadConsumptionStats
     * @description 从消费列表数据计算统计信息（总数、总金额、今日金额、平均值）
     * @returns {Promise<void>} 无返回值
     */
    async loadConsumptionStats() {
      // 消费统计从消费列表数据计算（后端没有独立的统计端点）
      try {
        const stats = {
          totalCount: this.consumptionList.length,
          totalAmount: this.consumptionList.reduce((sum, r) => sum + (r.amount || 0), 0),
          todayAmount: 0,
          avgAmount: 0
        }
        // 计算今日金额
        const today = new Date().toDateString()
        stats.todayAmount = this.consumptionList
          .filter(r => new Date(r.created_at).toDateString() === today)
          .reduce((sum, r) => sum + (r.amount || 0), 0)
        // 计算平均值
        stats.avgAmount =
          stats.totalCount > 0 ? Math.round(stats.totalAmount / stats.totalCount) : 0
        this.consumptionStats = stats
      } catch (error) {
        console.error('计算消费统计失败:', error)
      }
    },

    /**
     * 查看消费详情
     * @method viewConsumptionDetail
     * @param {ConsumptionRecord} record - 消费记录对象
     * @description 设置选中消费记录并显示详情模态框
     * @returns {void}
     */
    viewConsumptionDetail(record) {
      this.selectedConsumption = record
      this.showModal('consumptionDetailModal')
    },

    /**
     * 获取支付方式显示文本
     * @method getPaymentMethodText
     * @param {string} method - 支付方式代码
     * @returns {string} 支付方式中文文本
     */
    getPaymentMethodText(method) {
      const map = {
        wechat: '微信支付',
        alipay: '支付宝',
        cash: '现金',
        card: '银行卡',
        points: '积分'
      }
      return map[method] || method
    },

    // ==================== 钻石账户方法 ====================

    /**
     * 加载钻石账户列表
     * @async
     * @method loadDiamondAccounts
     * @description 根据筛选条件获取用户钻石账户数据
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.ASSETS.PORTFOLIO
     */
    async loadDiamondAccounts() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page || 1) // 使用分页变量 page
        params.append('page_size', this.pageSize || 20)
        if (this.diamondFilters.keyword) params.append('keyword', this.diamondFilters.keyword)
        if (this.diamondFilters.balanceRange)
          params.append('balance_range', this.diamondFilters.balanceRange)

        // 使用正确的 API 端点：/api/v4/console/assets/portfolio（钻石账户作为资产组合的一部分）
        const response = await this.apiGet(
          `${API_ENDPOINTS.ASSETS.PORTFOLIO}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          const diamondData = response.data?.accounts || response.data?.list || response.data
          this.diamondAccounts = Array.isArray(diamondData) ? diamondData : []
        }
      } catch (error) {
        console.error('加载钻石账户失败:', error)
        this.diamondAccounts = []
      }
    },

    /**
     * 打开调整钻石模态框
     * @method openAdjustDiamondModal
     * @param {DiamondAccount|null} [account=null] - 钻石账户对象（可选，预填充用户信息）
     * @description 重置调整表单并显示钻石调整模态框
     * @returns {void}
     */
    openAdjustDiamondModal(account = null) {
      this.selectedAccount = account
      this.adjustDiamondForm = {
        user_id: account ? account.user_id : '',
        nickname: account ? account.nickname || '' : '',
        adjust_type: 'increase',
        amount: 0,
        reason: ''
      }
      this.showModal('adjustDiamondModal')
    },

    /**
     * 提交钻石调整
     * @async
     * @method submitAdjustDiamond
     * @description 验证表单数据并提交钻石调整请求到后端
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.DIAMOND_ACCOUNTS.USER_ADJUST
     */
    async submitAdjustDiamond() {
      if (!this.adjustDiamondForm.user_id) {
        this.showError('请选择用户')
        return
      }
      if (!this.adjustDiamondForm.amount || this.adjustDiamondForm.amount <= 0) {
        this.showError('请输入有效的调整数量')
        return
      }
      if (!this.adjustDiamondForm.reason) {
        this.showError('请输入调整原因')
        return
      }

      try {
        this.saving = true
        const adjustAmount =
          this.adjustDiamondForm.adjust_type === 'increase'
            ? Math.abs(this.adjustDiamondForm.amount)
            : -Math.abs(this.adjustDiamondForm.amount)

        // 使用正确的 API 端点：/api/v4/console/diamond/users/:user_id/adjust
        const response = await this.apiCall(
          API.buildURL(API_ENDPOINTS.DIAMOND_ACCOUNTS.USER_ADJUST, {
            user_id: this.adjustDiamondForm.user_id
          }),
          {
            method: 'POST',
            data: {
              amount: adjustAmount,
              reason: this.adjustDiamondForm.reason
            }
          }
        )

        if (response?.success) {
          this.showSuccess('钻石调整成功')
          this.hideModal('adjustDiamondModal')
          await this.loadDiamondAccounts()
        }
      } catch (error) {
        this.showError('钻石调整失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 查看钻石账户历史
     * @async
     * @method viewDiamondHistory
     * @param {DiamondAccount} account - 钻石账户对象
     * @description 获取指定账户的钻石变动历史并显示模态框
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.DIAMOND_ACCOUNTS.USER_BALANCE
     */
    async viewDiamondHistory(account) {
      this.selectedAccount = account
      this.diamondHistory = []

      try {
        // 使用用户余额端点获取历史（后端没有独立的历史端点）
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.DIAMOND_ACCOUNTS.USER_BALANCE, { user_id: account.user_id }),
          {},
          { showLoading: false }
        )
        if (response?.success) {
          // 钻石历史从余额数据中提取（如果有的话）
          this.diamondHistory = response.data?.transactions || response.data?.history || []
        }
      } catch (error) {
        console.error('加载钻石历史失败:', error)
      }

      this.showModal('diamondHistoryModal')
    },

    /**
     * 调整钻石（快捷入口）
     * @method adjustDiamond
     * @param {DiamondAccount} account - 钻石账户对象
     * @description openAdjustDiamondModal的快捷调用方式
     * @returns {void}
     */
    adjustDiamond(account) {
      this.openAdjustDiamondModal(account)
    },

    // ==================== 商户积分方法 ====================

    /**
     * 加载商户积分列表
     * @async
     * @method loadMerchantPoints
     * @description 获取所有商户的积分余额数据
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.MERCHANT_POINTS.LIST
     */
    async loadMerchantPoints() {
      try {
        // 使用正确的 API 端点：/api/v4/console/merchant-points
        const response = await this.apiGet(
          API_ENDPOINTS.MERCHANT_POINTS.LIST,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          const merchantData = response.data?.merchants || response.data?.list || response.data
          this.merchantPoints = Array.isArray(merchantData) ? merchantData : []
        }
      } catch (error) {
        console.error('加载商户积分失败:', error)
        this.merchantPoints = []
      }
    },

    /**
     * 查看商户积分历史
     * @async
     * @method viewMerchantPointHistory
     * @param {Object} merchant - 商户对象
     * @param {number} merchant.merchant_id - 商户ID
     * @description 获取指定商户的积分变动历史并显示模态框
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.MERCHANT_POINTS.DETAIL
     */
    async viewMerchantPointHistory(merchant) {
      this.selectedMerchant = merchant
      this.merchantPointHistory = []

      try {
        // 使用详情端点获取历史记录
        const merchantId = merchant.merchant_id || merchant.id
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.MERCHANT_POINTS.DETAIL, { id: merchantId }),
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.merchantPointHistory = response.data?.records || response.data?.history || []
        }
      } catch (error) {
        console.error('加载商户积分历史失败:', error)
      }

      this.showModal('merchantPointHistoryModal')
    },

    // ==================== 债务管理方法 ====================

    /**
     * 债务筛选条件
     * @type {{status: string, userId: string, startDate: string, endDate: string}}
     */
    debtFilters: { status: '', userId: '', startDate: '', endDate: '' },

    /**
     * 加载债务记录列表
     * @async
     * @method loadDebtList
     * @description 根据筛选条件获取待处理的债务记录
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.DEBT.PENDING
     */
    async loadDebtList() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page || 1)
        params.append('page_size', this.pageSize || 20)
        if (this.debtFilters?.status) params.append('status', this.debtFilters.status)
        if (this.debtFilters?.userId) params.append('user_id', this.debtFilters.userId)
        if (this.debtFilters?.startDate) params.append('start_date', this.debtFilters.startDate)
        if (this.debtFilters?.endDate) params.append('end_date', this.debtFilters.endDate)

        // 使用正确的 API 端点：/api/v4/console/debt-management/pending
        const response = await this.apiGet(
          `${API_ENDPOINTS.DEBT.PENDING}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          const debtData = response.data?.debts || response.data?.list || response.data
          this.debtList = Array.isArray(debtData) ? debtData : []
        }
      } catch (error) {
        console.error('加载债务记录失败:', error)
        this.debtList = []
      }
    },

    /**
     * 加载债务统计数据
     * @async
     * @method loadDebtStats
     * @description 获取债务相关的统计信息（待处理数、待处理金额、已回收金额等）
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.DEBT.DASHBOARD
     */
    async loadDebtStats() {
      try {
        // 使用 dashboard 端点获取统计数据
        const response = await this.apiGet(
          API_ENDPOINTS.DEBT.DASHBOARD,
          {},
          { showError: false, showLoading: false }
        )
        if (response?.success) {
          const stats = response.data?.statistics || response.data || {}
          this.debtStats = {
            pendingCount: stats.pending_count ?? stats.pendingCount ?? 0,
            pendingAmount: stats.pending_amount ?? stats.pendingAmount ?? 0,
            recoveredAmount: stats.recovered_amount ?? stats.recoveredAmount ?? 0,
            writtenOffCount: stats.written_off_count ?? stats.writtenOffCount ?? 0,
            totalCount: stats.total_count ?? stats.totalCount ?? 0
          }
        }
      } catch (error) {
        // 使用本地数据计算
        this.debtStats = {
          pendingCount: this.debtList.filter(d => d.status === 'pending').length,
          pendingAmount: this.debtList
            .filter(d => d.status === 'pending')
            .reduce((sum, d) => sum + (d.amount || 0), 0),
          recoveredAmount: this.debtList
            .filter(d => d.status === 'recovered')
            .reduce((sum, d) => sum + (d.amount || 0), 0),
          writtenOffCount: this.debtList.filter(d => d.status === 'written_off').length,
          totalCount: this.debtList.length
        }
      }
    },

    /**
     * 查看债务详情
     * @method viewDebtDetail
     * @param {DebtRecord} debt - 债务记录对象
     * @description 设置选中债务记录并显示详情模态框
     * @returns {void}
     */
    viewDebtDetail(debt) {
      this.selectedDebt = debt
      this.showModal('debtDetailModal')
    },

    /**
     * 处理债务 - 清偿
     * @async
     * @method processDebt
     * @param {DebtRecord} debt - 债务记录对象
     * @description 确认后调用清偿接口处理债务
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.DEBT.CLEAR
     */
    async processDebt(debt) {
      await this.confirmAndExecute(
        `确认处理债务 ${debt.debt_id}？`,
        async () => {
          // 使用清偿端点处理债务
          const response = await this.apiCall(API_ENDPOINTS.DEBT.CLEAR, {
            method: 'POST',
            data: { debt_id: debt.debt_id || debt.id }
          })
          if (response?.success) {
            await this.loadDebtList()
            await this.loadDebtStats()
          }
        },
        { successMessage: '债务处理成功' }
      )
    },

    /**
     * 打开还款模态框
     * @method openPaymentModal
     * @param {DebtRecord} debt - 债务记录对象
     * @description 设置选中债务并预填充还款表单，然后显示还款模态框
     * @returns {void}
     */
    openPaymentModal(debt) {
      this.selectedDebt = debt
      this.paymentForm = {
        totalAmount: debt.total_amount || debt.amount || 0,
        paidAmount: debt.paid_amount || 0,
        amount: 0,
        remark: ''
      }
      this.showModal('paymentModal')
    },

    /**
     * 提交还款
     * @async
     * @method submitPayment
     * @description 验证还款金额并提交还款记录到后端
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.DEBT.PAYMENT
     */
    async submitPayment() {
      if (!this.paymentForm.amount || this.paymentForm.amount <= 0) {
        this.showError('请输入有效的还款金额')
        return
      }

      const remainingAmount = this.paymentForm.totalAmount - this.paymentForm.paidAmount
      if (this.paymentForm.amount > remainingAmount) {
        this.showError(`还款金额不能超过剩余欠款 ¥${remainingAmount.toFixed(2)}`)
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(API_ENDPOINTS.DEBT.PAYMENT, {
          method: 'POST',
          data: {
            debt_id: this.selectedDebt.debt_id || this.selectedDebt.id,
            amount: this.paymentForm.amount,
            remark: this.paymentForm.remark
          }
        })

        if (response?.success) {
          this.showSuccess('还款记录已提交')
          this.hideModal('paymentModal')
          await this.loadDebtList()
          await this.loadDebtStats()
        }
      } catch (error) {
        this.showError('还款提交失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 债务核销
     * @async
     * @method writeOffDebt
     * @param {DebtRecord} debt - 债务记录对象
     * @description 确认后将债务标记为核销状态（不可恢复）
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.DEBT.WRITE_OFF
     */
    async writeOffDebt(debt) {
      await this.confirmAndExecute(
        `确认核销债务 ¥${(debt.amount || 0).toFixed(2)}？核销后将无法恢复。`,
        async () => {
          const response = await this.apiCall(API_ENDPOINTS.DEBT.WRITE_OFF, {
            method: 'POST',
            data: { debt_id: debt.debt_id || debt.id }
          })
          if (response?.success) {
            await this.loadDebtList()
            await this.loadDebtStats()
          }
        },
        { successMessage: '债务已核销', confirmText: '确认核销' }
      )
    },

    /**
     * 搜索债务记录
     * @method searchDebtList
     * @description 重置页码并重新加载债务列表
     * @returns {void}
     */
    searchDebtList() {
      this.page = 1
      this.loadDebtList()
    },

    /**
     * 重置债务筛选条件
     * @method resetDebtFilters
     * @description 清空所有筛选条件并重新加载债务列表
     * @returns {void}
     */
    resetDebtFilters() {
      this.debtFilters = { status: '', userId: '', startDate: '', endDate: '' }
      this.page = 1
      this.loadDebtList()
    },

    /**
     * 计算剩余欠款金额
     * @method getRemainingDebt
     * @param {DebtRecord} debt - 债务记录对象
     * @returns {number} 剩余欠款金额
     */
    getRemainingDebt(debt) {
      const total = debt.total_amount || debt.amount || 0
      const paid = debt.paid_amount || 0
      return Math.max(0, total - paid)
    },

    /**
     * 获取还款进度百分比
     * @method getPaymentProgress
     * @param {DebtRecord} debt - 债务记录对象
     * @returns {string} 还款进度百分比（保留1位小数）
     */
    getPaymentProgress(debt) {
      const total = debt.total_amount || debt.amount || 0
      if (total <= 0) return 0
      const paid = debt.paid_amount || 0
      return Math.min(100, (paid / total) * 100).toFixed(1)
    },

    /**
     * 获取债务状态对应的Bootstrap背景色类名
     * @method getDebtStatusClass
     * @param {string} status - 债务状态代码
     * @returns {string} Bootstrap背景色CSS类名
     */
    getDebtStatusClass(status) {
      const map = {
        pending: 'bg-warning',
        partial: 'bg-info',
        recovered: 'bg-success',
        written_off: 'bg-secondary',
        overdue: 'bg-danger'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取债务状态的中文显示文本
     * @method getDebtStatusText
     * @param {string} status - 债务状态代码
     * @returns {string} 状态中文文本
     */
    getDebtStatusText(status) {
      const map = {
        pending: '待处理',
        partial: '部分还款',
        recovered: '已回收',
        written_off: '已核销',
        overdue: '已逾期'
      }
      return map[status] || status
    },

    /**
     * 获取消费记录状态样式类
     * @param {string} status - 状态值
     * @returns {string} Tailwind CSS 类名
     */
    getConsumptionStatusClass(status) {
      const map = {
        pending: 'bg-yellow-100 text-yellow-700',
        approved: 'bg-green-100 text-green-700',
        rejected: 'bg-red-100 text-red-700'
      }
      return map[status] || 'bg-gray-100 text-gray-700'
    },

    /**
     * 获取消费记录状态文本
     * @param {string} status - 状态值
     * @returns {string} 中文状态文本
     */
    getConsumptionStatusText(status) {
      const map = {
        pending: '待审核',
        approved: '已通过',
        rejected: '已拒绝'
      }
      return map[status] || status || '-'
    },

    // ==================== 财务统计方法 ====================

    /**
     * 加载财务统计数据
     * @async
     * @method loadFinanceStats
     * @description 获取财务统计数据（今日收入、月收入、待处理数、总债务），用于活动预算页面显示
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.ASSETS.STATS
     */
    async loadFinanceStats() {
      try {
        // 尝试从后端获取财务统计数据
        const response = await this.apiGet(
          API_ENDPOINTS.ASSETS.STATS,
          {},
          { showError: false, showLoading: false }
        )

        if (response?.success && response.data) {
          const stats = response.data
          this.financeStats = {
            todayRevenue: stats.today_revenue ?? stats.todayRevenue ?? 0,
            monthRevenue: stats.month_revenue ?? stats.monthRevenue ?? 0,
            pendingCount: stats.pending_count ?? stats.pendingCount ?? 0,
            totalDebt: stats.total_debt ?? stats.totalDebt ?? 0
          }
        }
      } catch (error) {
        console.warn('加载财务统计失败，使用本地计算:', error.message)
        // 使用本地数据计算
        this.financeStats = {
          todayRevenue: this.consumptionStats.todayAmount || 0,
          monthRevenue: this.consumptionStats.totalAmount || 0,
          pendingCount: this.consumptionList.filter(r => r.status === 'pending').length,
          totalDebt: this.debtStats.pendingAmount || 0
        }
      }
    },

    // ==================== 活动预算方法 ====================

    /**
     * 加载活动预算列表
     * @async
     * @method loadBudgetList
     * @description 获取所有活动的预算配置数据
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.CAMPAIGN_BUDGET.BATCH_STATUS
     */
    async loadBudgetList() {
      try {
        // 使用正确的 API 端点：/api/v4/console/campaign-budget/batch-status
        const response = await this.apiGet(
          API_ENDPOINTS.CAMPAIGN_BUDGET.BATCH_STATUS,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          const budgetData = response.data?.budgets || response.data?.list || response.data
          this.budgetList = Array.isArray(budgetData) ? budgetData : []
        }
      } catch (error) {
        console.error('加载活动预算失败:', error)
        this.budgetList = []
      }
    },

    /**
     * 打开创建预算模态框
     * @method openCreateBudgetModal
     * @description 重置预算表单并显示创建模态框
     * @returns {void}
     */
    openCreateBudgetModal() {
      this.isEditBudget = false
      this.budgetForm = {
        budget_id: null,
        campaign_id: '',
        campaign_name: '',
        total_budget: 0,
        is_active: true
      }
      this.showModal('budgetModal')
    },

    /**
     * 编辑预算
     * @method editBudget
     * @param {BudgetConfig} budget - 预算配置对象
     * @description 填充预算数据到表单并显示编辑模态框
     * @returns {void}
     */
    editBudget(budget) {
      this.isEditBudget = true
      this.budgetForm = {
        budget_id: budget.budget_id || budget.id,
        campaign_id: budget.campaign_id,
        campaign_name: budget.campaign_name || '',
        total_budget: budget.total_budget,
        is_active: budget.is_active !== false
      }
      this.showModal('budgetModal')
    },

    /**
     * 提交预算表单
     * @async
     * @method submitBudgetForm
     * @description 验证预算数据并提交到后端（创建或更新）
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.CAMPAIGN_BUDGET.CAMPAIGN
     */
    async submitBudgetForm() {
      if (!this.budgetForm.campaign_id) {
        this.showError('请选择活动')
        return
      }
      if (!this.budgetForm.total_budget || this.budgetForm.total_budget <= 0) {
        this.showError('请输入有效的预算金额')
        return
      }

      try {
        this.saving = true
        // 使用正确的 API 端点：/api/v4/console/campaign-budget/campaigns/:campaign_id
        const url = API.buildURL(API_ENDPOINTS.CAMPAIGN_BUDGET.CAMPAIGN, {
          campaign_id: this.budgetForm.campaign_id
        })

        const response = await this.apiCall(url, {
          method: this.isEditBudget ? 'PUT' : 'POST',
          data: {
            total_budget: this.budgetForm.total_budget,
            is_active: this.budgetForm.is_active
          }
        })

        if (response?.success) {
          this.showSuccess(this.isEditBudget ? '预算更新成功' : '预算创建成功')
          this.hideModal('budgetModal')
          await this.loadBudgetList()
        }
      } catch (error) {
        this.showError('保存预算失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除预算
     * @async
     * @method deleteBudget
     * @param {BudgetConfig} budget - 预算配置对象
     * @description 确认后删除指定活动的预算配置
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.CAMPAIGN_BUDGET.CAMPAIGN
     */
    async deleteBudget(budget) {
      await this.confirmAndExecute(
        `确认删除活动"${budget.campaign_name || budget.campaign_id}"的预算配置？`,
        async () => {
          // 使用正确的 API 端点
          const campaignId = budget.campaign_id || budget.budget_id || budget.id
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.CAMPAIGN_BUDGET.CAMPAIGN, { campaign_id: campaignId }),
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadBudgetList()
          }
        },
        { successMessage: '预算删除成功', confirmText: '确认删除' }
      )
    },

    /**
     * 获取预算使用率
     * @method getBudgetUsageRate
     * @param {BudgetConfig} budget - 预算配置对象
     * @returns {number} 使用率百分比（整数）
     */
    getBudgetUsageRate(budget) {
      if (!budget.total_budget) return 0
      return Math.round(((budget.used_budget || 0) / budget.total_budget) * 100)
    },

    /**
     * 获取预算进度条对应的Bootstrap背景色类名
     * @method getBudgetProgressClass
     * @param {BudgetConfig} budget - 预算配置对象
     * @returns {string} Bootstrap背景色CSS类名
     */
    getBudgetProgressClass(budget) {
      const rate = this.getBudgetUsageRate(budget)
      if (rate >= 90) return 'bg-danger'
      if (rate >= 70) return 'bg-warning'
      return 'bg-success'
    },

    // ==================== 商户操作日志方法 ====================

    /**
     * 加载商户操作日志
     * @async
     * @method loadMerchantLogs
     * @description 使用 AUDIT_LOGS API 获取商户相关操作日志，支持分页和筛选
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.AUDIT_LOGS.LIST
     */
    async loadMerchantLogs() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.merchantLogPage)
        params.append('page_size', this.merchantLogPageSize)
        params.append('module', 'merchant')

        if (this.merchantLogFilters.merchantId) {
          params.append('target_id', this.merchantLogFilters.merchantId)
        }
        if (this.merchantLogFilters.actionType) {
          params.append('action_type', this.merchantLogFilters.actionType)
        }
        if (this.merchantLogFilters.startDate) {
          params.append('start_date', this.merchantLogFilters.startDate)
        }
        if (this.merchantLogFilters.endDate) {
          params.append('end_date', this.merchantLogFilters.endDate)
        }

        const response = await this.apiGet(`${API_ENDPOINTS.AUDIT_LOGS.LIST}?${params.toString()}`)

        if (response?.success) {
          const data = response.data?.list || response.data?.logs || response.data
          this.merchantLogs = Array.isArray(data) ? data : []
          this.merchantLogPagination = {
            total: response.data?.pagination?.total || response.data?.total || 0,
            totalPages:
              response.data?.pagination?.totalPages ||
              Math.ceil((response.data?.total || 0) / this.merchantLogPageSize)
          }
          console.log('[FinanceManagement] 商户操作日志数量:', this.merchantLogs.length)
        }
      } catch (error) {
        console.error('[FinanceManagement] 加载商户操作日志失败:', error)
        this.merchantLogs = []
      }
    },

    /**
     * 加载商户操作日志统计
     * @async
     * @method loadMerchantLogStats
     * @description 获取商户操作日志的统计数据（总日志数、今日日志数、错误日志数）
     * @returns {Promise<void>}
     * @fires API_ENDPOINTS.AUDIT_LOGS.STATISTICS
     */
    async loadMerchantLogStats() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.AUDIT_LOGS.STATISTICS, {
          module: 'merchant'
        })

        if (response?.success) {
          const stats = response.data || {}
          this.merchantLogStats = {
            totalLogs: stats.total_logs || stats.total || 0,
            todayLogs: stats.today_logs || stats.today || 0,
            errorLogs: stats.error_logs || stats.errors || 0
          }
        }
      } catch (error) {
        console.error('[FinanceManagement] 加载商户日志统计失败:', error)
        this.merchantLogStats = { totalLogs: 0, todayLogs: 0, errorLogs: 0 }
      }
    },

    /**
     * 搜索商户操作日志
     * @method searchMerchantLogs
     * @description 重置页码并根据当前筛选条件重新加载日志
     * @returns {void}
     */
    searchMerchantLogs() {
      this.merchantLogPage = 1
      this.loadMerchantLogs()
    },

    /**
     * 重置商户操作日志筛选条件
     * @method resetMerchantLogFilters
     * @description 清空所有筛选条件并重新加载日志列表
     * @returns {void}
     */
    resetMerchantLogFilters() {
      this.merchantLogFilters = { merchantId: '', actionType: '', startDate: '', endDate: '' }
      this.merchantLogPage = 1
      this.loadMerchantLogs()
    },

    /**
     * 切换商户操作日志分页
     * @method changeMerchantLogPage
     * @param {number} newPage - 目标页码
     * @description 验证页码有效性后切换到指定页并重新加载
     * @returns {void}
     */
    changeMerchantLogPage(newPage) {
      if (newPage < 1 || newPage > this.merchantLogPagination.totalPages) return
      this.merchantLogPage = newPage
      this.loadMerchantLogs()
    },

    /**
     * 查看日志详情
     * @method viewMerchantLogDetail
     * @param {Object} log - 日志对象
     * @description 设置选中日志并显示详情模态框
     * @returns {void}
     */
    viewMerchantLogDetail(log) {
      this.selectedMerchantLog = log
      this.showModal('merchantLogDetailModal')
    },

    /**
     * 获取操作类型对应的Bootstrap标签样式类名
     * @method getMerchantLogActionClass
     * @param {string} actionType - 操作类型代码
     * @returns {string} Bootstrap背景色CSS类名
     */
    getMerchantLogActionClass(actionType) {
      const classes = {
        create: 'bg-success',
        update: 'bg-info',
        delete: 'bg-danger',
        points_add: 'bg-primary',
        points_deduct: 'bg-warning text-dark',
        status_change: 'bg-secondary',
        login: 'bg-light text-dark',
        error: 'bg-danger'
      }
      return classes[actionType] || 'bg-secondary'
    },

    /**
     * 获取操作类型的中文显示文本
     * @method getMerchantLogActionText
     * @param {string} actionType - 操作类型代码
     * @returns {string} 操作类型中文文本
     */
    getMerchantLogActionText(actionType) {
      const labels = {
        create: '创建',
        update: '更新',
        delete: '删除',
        points_add: '积分增加',
        points_deduct: '积分扣减',
        status_change: '状态变更',
        login: '登录',
        error: '错误'
      }
      return labels[actionType] || actionType
    },

    /**
     * 格式化日志详情为JSON字符串
     * @method formatMerchantLogDetails
     * @param {Object} log - 日志对象
     * @returns {string} 格式化后的JSON字符串或占位符
     */
    formatMerchantLogDetails(log) {
      if (!log || !log.details) return '-'
      const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
      return JSON.stringify(details, null, 2)
    },

    // ==================== 工具方法 ====================

    /**
     * 安全格式化日期字符串
     * @method formatDateSafe
     * @param {string|Date} dateStr - 日期字符串或Date对象
     * @returns {string} 格式化后的日期字符串（中国时区），无效时返回占位符
     */
    formatDateSafe(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
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
    }
  }))

  console.log('✅ [FinanceManagement] Alpine 组件已注册')
})

console.log('📦 [FinanceManagement] 页面脚本已加载')
