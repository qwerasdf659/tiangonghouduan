/**
 * Finance Management Page - Alpine.js Mixin 重构版
 * 财务管理整合页面组件
 *
 * @file admin/src/modules/analytics/pages/finance-management.js
 * @module FinanceManagementPage
 * @version 4.0.0
 * @date 2026-01-24
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
 * @requires createPageMixin - 页面基础功能混入
 * @requires composables - 各子模块的状态和方法
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin, dataTable } from '../../../alpine/index.js'
import { request, API_PREFIX } from '../../../api/base.js'
import {
  useConsumptionState,
  useConsumptionMethods,
  useDiamondAccountsState,
  useDiamondAccountsMethods,
  useMerchantPointsState,
  useMerchantPointsMethods,
  useDebtManagementState,
  useDebtManagementMethods,
  useCampaignBudgetState,
  useCampaignBudgetMethods,
  useMerchantLogsState,
  useMerchantLogsMethods
} from '../composables/index.js'

/**
 * 子页面配置
 */
const SUB_PAGES = [
  { id: 'consumption', title: '消费记录', icon: 'bi-receipt' },
  { id: 'diamond-accounts', title: '钻石账户', icon: 'bi-gem' },
  { id: 'merchant-points', title: '商户积分', icon: 'bi-coin' },
  { id: 'debt-management', title: '债务管理', icon: 'bi-cash-stack' },
  { id: 'campaign-budget', title: '活动预算', icon: 'bi-piggy-bank' },
  { id: 'merchant-logs', title: '商户日志', icon: 'bi-journal-text' }
]

document.addEventListener('alpine:init', () => {
  logger.info('[FinanceManagement] 注册 Alpine 组件 (Mixin v4.0 - Composables)...')

  // 全局 Store - 存储当前激活的子页面ID
  Alpine.store('financePage', 'consumption')

  /**
   * 财务管理导航组件
   */
  Alpine.data('financeNavigation', () => ({
    subPages: SUB_PAGES,

    get current_page() {
      return Alpine.store('financePage')
    },

    /**
     * 初始化导航组件
     */
    init() {
      logger.debug('[FinanceNav] 导航组件初始化')
    },

    switchPage(pageId) {
      Alpine.store('financePage', pageId)
      logger.debug('[FinanceNav] 切换到页面:', pageId)
    },

    isActive(pageId) {
      return this.current_page === pageId
    }
  }))

  /**
   * 财务管理页面内容组件
   * 使用 composables 模式管理各子模块的状态和方法
   */
  Alpine.data('financePageContent', () => {
    const pageMixin = createPageMixin({
      pageTitle: '财务管理',
      loadDataOnInit: false,
      pagination: { page_size: 20 }, // 启用分页功能，为各子模块提供 page/page_size
      userResolver: true // 手机号主导搜索：启用用户解析能力
    })

    return {
      ...pageMixin,

      // ========== 基础状态 ==========
      subPages: SUB_PAGES,
      saving: false,

      // ========== 分页状态 - 单一对象模式 ==========
      financePagination: {
        page: 1,
        page_size: 20,
        total: 0
      },

      // ========== 财务统计 ==========
      financeStats: {
        todayRevenue: '0.00',
        monthRevenue: '0.00',
        pendingCount: 0,
        totalDebt: '0.00'
      },

      // ========== 拒绝表单 ==========
      rejectForm: {
        reason: ''
      },

      // ========== 欠账还款表单 ==========
      debtRepayForm: {
        amount: 0,
        note: ''
      },

      // ========== 钻石调整表单 ==========
      diamondAdjustForm: {
        type: 'add',
        amount: 0,
        reason: ''
      },

      // ========== 预算表单（fallback，composable 会覆盖） ==========
      budgetForm: {
        type: 'daily',
        amount: 0,
        alert_threshold: 80,
        campaign_id: '',
        budget_mode: 'UNLIMITED',
        pool_budget_remaining: 0
      },

      // ========== 消费筛选（fallback，composable 会覆盖） ==========
      consumptionFilters: {
        mobile: '',
        status: '',
        start_date: '',
        end_date: ''
      },

      // ========== 选中项 ==========
      selectedConsumption: null,
      selectedDebt: null,
      selectedDiamondAccount: null,
      selectedMerchant: null,

      // ========== 各模块状态 ==========
      ...useConsumptionState(),
      ...useDiamondAccountsState(),
      ...useMerchantPointsState(),
      ...useDebtManagementState(),
      ...useCampaignBudgetState(),
      ...useMerchantLogsState(),

      // ========== 计算属性 ==========
      get current_page() {
        return Alpine.store('financePage')
      },
      /** 总页数 - 单一对象模式 Getter */
      get financeTotalPages() {
        return Math.ceil(this.financePagination.total / this.financePagination.page_size) || 1
      },

      // ========== 生命周期 ==========
      async init() {
        logger.info('[FinanceContent] 初始化财务管理页面...')

        if (typeof pageMixin.init === 'function') {
          await pageMixin.init.call(this)
        }

        // 监听页面切换
        this.$watch('current_page', async newPage => {
          logger.debug('[FinanceContent] 页面切换:', newPage)
          this.financePagination.page = 1
          await this.loadCurrentPageData()
        })

        // 加载初始页面数据
        await this.loadCurrentPageData()
      },

      /**
       * 根据当前页面加载数据
       */
      async loadCurrentPageData() {
        const page = this.current_page
        logger.debug('[FinanceContent] 加载页面数据:', page)

        try {
          switch (page) {
            case 'consumption':
              await Promise.all([this.loadConsumptions(), this.loadConsumptionStats()])
              break
            case 'diamond-accounts':
              await Promise.all([this.loadDiamondAccounts(), this.loadDiamondStats()])
              break
            case 'merchant-points':
              await Promise.all([this.loadMerchantPoints(), this.loadMerchantStats()])
              break
            case 'debt-management':
              // 加载活动列表供下拉框使用 + 债务数据 + 统计
              await Promise.all([
                this.loadCampaignOptions(),
                this.loadDebts(),
                this.loadDebtStats()
              ])
              break
            case 'campaign-budget':
              await Promise.all([this.loadBudgets(), this.loadBudgetStats()])
              break
            case 'merchant-logs':
              await Promise.all([this.loadMerchantLogs(), this.loadLogStats()])
              break
          }
        } catch (error) {
          logger.error('[FinanceContent] 加载数据失败:', error)
          this.showError('加载数据失败')
        }
      },

      // ========== 页面切换 ==========
      switchPage(pageId) {
        Alpine.store('financePage', pageId)
      },

      isActive(pageId) {
        return this.current_page === pageId
      },

      // ========== 分页处理 ==========
      async changePage(newPage) {
        this.financePagination.page = newPage
        await this.loadCurrentPageData()
      },

      // ========== 各模块方法 ==========
      ...useConsumptionMethods(),
      ...useDiamondAccountsMethods(),
      ...useMerchantPointsMethods(),
      ...useDebtManagementMethods(),
      ...useCampaignBudgetMethods(),
      ...useMerchantLogsMethods(),

      // ========== 通用工具方法 ==========

      /**
       * 格式化金额
       * @param {number} amount - 金额
       * @returns {string} 格式化后的金额
       */
      formatAmount(amount) {
        if (amount === null || amount === undefined) return '¥0.00'
        return (
          '¥' +
          Number(amount)
            .toFixed(2)
            .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        )
      },

      /**
       * 格式化数字
       * @param {number} num - 数字
       * @returns {string} 格式化后的数字
       */
      formatNumber(num) {
        if (num === null || num === undefined) return '0'
        return Number(num).toLocaleString('zh-CN')
      },

      /**
       * 格式化百分比
       * @param {number} value - 数值
       * @param {number} decimal - 小数位数
       * @returns {string} 格式化后的百分比
       */
      formatPercent(value, decimal = 1) {
        if (value === null || value === undefined) return '0%'
        return Number(value).toFixed(decimal) + '%'
      }
    }
  })

  // ==================== data-table 组件注册 ====================

  /** 消费记录 */
  Alpine.data('consumptionDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'record_id', label: '记录ID', sortable: true },
        { key: 'user_id', label: '用户ID' },
        {
          key: 'store_name',
          label: '门店',
          render: (val, row) => val || row.merchant_nickname || `商户${row.merchant_id || '-'}`
        },
        { key: 'consumption_amount', label: '消费金额', type: 'currency', sortable: true },
        {
          key: 'status',
          label: '状态',
          type: 'status',
          statusMap: {
            pending: { class: 'yellow', label: '待审核' },
            approved: { class: 'green', label: '已通过' },
            rejected: { class: 'red', label: '已拒绝' }
          }
        },
        { key: 'created_at', label: '消费时间', type: 'datetime', sortable: true }
      ],
      dataSource: async params => {
        const res = await request({
          url: `${API_PREFIX}/console/consumption/records`,
          method: 'GET',
          params
        })
        return {
          items: res.data?.records || res.data?.list || [],
          total: res.data?.pagination?.total || res.data?.count || 0
        }
      },
      primaryKey: 'record_id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-consumption', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  /** 钻石账户 - 使用 /console/system-data/accounts */
  Alpine.data('diamondAccountsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'account_id', label: '账户ID', sortable: true },
        { key: 'user_id', label: '用户ID', sortable: true },
        { key: 'nickname', label: '昵称', render: (val, row) => row.user?.nickname || val || '-' },
        { key: 'account_type', label: '账户类型' },
        {
          key: 'status',
          label: '状态',
          type: 'status',
          statusMap: {
            active: { class: 'green', label: '正常' },
            frozen: { class: 'red', label: '冻结' }
          }
        },
        { key: 'updated_at', label: '更新时间', type: 'datetime', sortable: true }
      ],
      dataSource: async params => {
        const res = await request({
          url: `${API_PREFIX}/console/system-data/accounts`,
          method: 'GET',
          params
        })
        return {
          items: res.data?.accounts || res.data?.list || [],
          total: res.data?.pagination?.total || 0
        }
      },
      primaryKey: 'account_id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-diamond-accounts', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  /** 商户积分 - 适配后端 /console/merchant-points API，启用行选择支持批量审核 */
  Alpine.data('merchantPointsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'audit_id', label: '审核ID', sortable: true },
        {
          key: 'applicant',
          label: '申请人',
          render: (val, row) => {
            const name = val?.nickname || `用户${row.user_id || '-'}`
            const mobile = val?.mobile
              ? `<span class="text-xs text-gray-400 ml-1">${val.mobile}</span>`
              : ''
            return `<span class="font-medium">${name}</span>${mobile}`
          }
        },
        {
          key: 'points_amount',
          label: '积分数量',
          sortable: true,
          render: val =>
            `<span class="font-semibold text-blue-600">${Number(val || 0).toLocaleString()}</span>`
        },
        { key: 'description', label: '申请说明', type: 'truncate', maxLength: 30 },
        {
          key: 'status',
          label: '审核状态',
          type: 'status',
          statusMap: {
            pending: { class: 'yellow', label: '⏳ 待审核' },
            approved: { class: 'green', label: '✅ 已通过' },
            rejected: { class: 'red', label: '❌ 已拒绝' },
            cancelled: { class: 'gray', label: '🚫 已取消' }
          }
        },
        { key: 'submitted_at', label: '申请时间', type: 'datetime', sortable: true }
      ],
      dataSource: async params => {
        const res = await request({
          url: `${API_PREFIX}/console/merchant-points`,
          method: 'GET',
          params
        })
        return {
          items: res.data?.rows || res.data?.list || [],
          total: res.data?.pagination?.total || res.data?.count || 0
        }
      },
      primaryKey: 'audit_id',
      selectable: true,
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-merchant-points', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  /** 债务管理 - 使用后端 /pending 端点（后端无根路径 GET） */
  Alpine.data('debtDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'debt_id', label: '债务ID', sortable: true },
        {
          key: 'debt_type',
          label: '类型',
          render: val =>
            val === 'inventory' ? '库存欠账' : val === 'budget' ? '预算欠账' : val || '-'
        },
        {
          key: 'campaign_name',
          label: '活动',
          render: (val, row) => val || 'ID: ' + (row.lottery_campaign_id || row.campaign_id || '-')
        },
        {
          key: 'owed_quantity',
          label: '欠账数量/金额',
          sortable: true,
          render: (val, row) =>
            row.debt_type === 'budget' ? '¥' + (row.owed_amount || val || 0) : val || 0
        },
        {
          key: 'remaining_quantity',
          label: '待清偿',
          render: (val, row) =>
            row.debt_type === 'budget' ? '¥' + (row.remaining_amount || val || 0) : val || 0
        },
        { key: 'created_at', label: '创建时间', type: 'datetime', sortable: true }
      ],
      dataSource: async params => {
        const res = await request({
          url: `${API_PREFIX}/console/debt-management/pending`,
          method: 'GET',
          params
        })
        const items =
          res.data?.items || res.data?.pending_debts || res.data?.list || res.data?.rows || []
        const total =
          res.data?.pagination?.total || res.data?.total || res.data?.count || items.length
        return { items, total }
      },
      primaryKey: 'debt_id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-debts', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  /** 活动预算 - 使用后端 /batch-status 端点（后端无根路径 GET） */
  Alpine.data('budgetDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'lottery_campaign_id', label: '活动ID', sortable: true },
        { key: 'campaign_name', label: '活动名称', render: (val, row) => val || row.name || '-' },
        {
          key: 'budget_mode',
          label: '预算模式',
          render: val =>
            val === 'pool'
              ? '活动池'
              : val === 'user'
                ? '用户预算'
                : val === 'none'
                  ? '无预算'
                  : val || '-'
        },
        {
          key: 'pool_budget_total',
          label: '总预算',
          render: (val, row) => row.pool_budget?.total ?? val ?? 0
        },
        {
          key: 'pool_budget_remaining',
          label: '剩余',
          render: (val, row) => row.pool_budget?.remaining ?? val ?? 0
        },
        {
          key: 'status',
          label: '活动状态',
          type: 'status',
          statusMap: {
            active: { class: 'green', label: '运行中' },
            draft: { class: 'gray', label: '草稿' },
            paused: { class: 'yellow', label: '暂停' },
            ended: { class: 'blue', label: '已结束' },
            cancelled: { class: 'red', label: '已取消' }
          }
        }
      ],
      dataSource: async params => {
        const res = await request({
          url: `${API_PREFIX}/console/campaign-budget/batch-status`,
          method: 'GET',
          params
        })
        const items = res.data?.campaigns || res.data?.list || res.data?.budgets || []
        const total = res.data?.total_count || res.data?.pagination?.total || items.length
        return { items, total }
      },
      primaryKey: 'lottery_campaign_id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-budgets', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  /** 商户操作日志 - 适配后端 /console/audit-logs API */
  Alpine.data('merchantLogsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'id', label: '日志ID', sortable: true },
        {
          key: 'operator_info',
          label: '操作人',
          render: (val, row) => {
            const info = row.operator_info
            if (!info) return '-'
            const name = info.nickname || '-'
            const mobile = info.mobile
              ? `<span class="text-xs themed-text-muted ml-1">${info.mobile}</span>`
              : ''
            return `${name}${mobile}`
          }
        },
        {
          key: 'operation_type_name',
          label: '操作类型',
          render: (val, row) => val || row.operation_type || '-'
        },
        {
          key: 'store_info',
          label: '门店',
          render: (val, row) => row.store_info?.store_name || '-'
        },
        {
          key: 'result',
          label: '结果',
          render: (val, row) => {
            if (val === 'success') return '<span class="text-green-600">✅ 成功</span>'
            if (val === 'failed') return '<span class="text-red-600">❌ 失败</span>'
            if (val === 'blocked') return '<span class="text-yellow-600">⚠️ 被阻断</span>'
            return row.result_name || val || '-'
          }
        },
        { key: 'created_at', label: '操作时间', type: 'datetime', sortable: true }
      ],
      dataSource: async params => {
        // 手机号搜索：解析为 operator_id（后端不支持直接按手机号筛选）
        const queryParams = { ...params }
        if (queryParams.operator_mobile) {
          try {
            const userRes = await request({
              url: `${API_PREFIX}/console/user-management/users/resolve`,
              method: 'GET',
              params: { mobile: queryParams.operator_mobile }
            })
            if (userRes?.success && userRes?.data?.user_id) {
              queryParams.operator_id = userRes.data.user_id
            }
          } catch (e) {
            logger.warn('[MerchantLogs] 手机号解析失败:', e.message)
          }
          delete queryParams.operator_mobile
        }
        const res = await request({
          url: `${API_PREFIX}/console/audit-logs`,
          method: 'GET',
          params: queryParams
        })
        return {
          items: res.data?.items || res.data?.logs || res.data?.list || [],
          total: res.data?.pagination?.total || res.data?.count || 0
        }
      },
      primaryKey: 'id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-merchant-logs', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  /** 钻石交易明细 - 需要 user_id（通过页面搜索功能提供） */
  Alpine.data('diamondTransactionsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'asset_transaction_id', label: '交易ID', sortable: true },
        { key: 'asset_code', label: '资产类型' },
        { key: 'tx_type', label: '类型', render: (val, row) => row.tx_type_display || val || '-' },
        // delta_amount：与后端数据库字段名一致（正数=增加，负数=扣减）
        { key: 'delta_amount', label: '变动金额', type: 'number', sortable: true },
        { key: 'balance_after', label: '变动后余额', type: 'number' },
        { key: 'description', label: '描述', render: val => val || '-' },
        { key: 'created_at', label: '时间', type: 'datetime', sortable: true }
      ],
      dataSource: async params => {
        // 后端 /console/assets/transactions 要求 user_id 必填
        if (!params.user_id) {
          return { items: [], total: 0 }
        }
        const res = await request({
          url: `${API_PREFIX}/console/assets/transactions`,
          method: 'GET',
          params: { ...params, asset_code: 'DIAMOND' }
        })
        return {
          items: res.data?.transactions || res.data?.list || [],
          total: res.data?.pagination?.total || 0
        }
      },
      primaryKey: 'asset_transaction_id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-diamond-transactions', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  logger.info('[FinanceManagement] Alpine 组件注册完成（含 7 data-table）')
})

export { SUB_PAGES }
