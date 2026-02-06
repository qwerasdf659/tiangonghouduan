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
import { Alpine, createPageMixin } from '../../../alpine/index.js'
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
              await Promise.all([this.loadCampaignOptions(), this.loadDebts(), this.loadDebtStats()])
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

  logger.info('[FinanceManagement] Alpine 组件注册完成')
})

export { SUB_PAGES }
