/**
 * Finance Management Page - Alpine.js Mixin 重构版
 * 财务管理整合页面组件
 * 
 * @file public/admin/js/pages/finance-management.js
 * @version 3.0.0
 * @date 2026-01-23
 * 
 * 包含子模块：
 * - 消费记录 (consumption)
 * - 钻石账户 (diamond-accounts)
 * - 商户积分 (merchant-points)
 * - 债务管理 (debt-management)
 * - 活动预算 (campaign-budget)
 */

document.addEventListener('alpine:init', () => {
  console.log('[FinanceManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 全局 Store
  Alpine.store('financePage', 'consumption')

  // 导航组件
  Alpine.data('financeNavigation', () => ({
    ...createPageMixin(),
    currentPage: 'consumption',
    subPages: [
      { id: 'consumption', title: '消费记录', icon: 'bi-receipt' },
      { id: 'diamond-accounts', title: '钻石账户', icon: 'bi-gem' },
      { id: 'merchant-points', title: '商户积分', icon: 'bi-coin' },
      { id: 'debt-management', title: '债务管理', icon: 'bi-file-earmark-minus' },
      { id: 'campaign-budget', title: '活动预算', icon: 'bi-piggy-bank' }
    ],

    init() {
      console.log('✅ 财务管理导航初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'consumption'
      Alpine.store('financePage', this.currentPage)
    },

    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('financePage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // 页面内容组件
  Alpine.data('financePageContent', () => ({
    ...createPageMixin(),

    // 消费记录
    consumptionList: [],
    consumptionStats: { totalCount: 0, totalAmount: 0, todayAmount: 0, avgAmount: 0 },
    consumptionFilters: { startDate: '', endDate: '', keyword: '' },

    // 钻石账户
    diamondAccounts: [],
    diamondFilters: { keyword: '', balanceRange: '' },

    // 商户积分
    merchantPoints: [],

    // 债务管理
    debtList: [],
    debtStats: { pendingCount: 0, pendingAmount: 0, recoveredAmount: 0 },

    // 活动预算
    budgetList: [],
    budgetForm: { budget_id: null, campaign_id: '', campaign_name: '', total_budget: 0, is_active: true },
    isEditBudget: false,

    // 选中的数据项
    selectedConsumption: null,
    selectedAccount: null,
    selectedDebt: null,
    selectedMerchant: null,

    // 钻石调整表单
    adjustDiamondForm: {
      user_id: '',
      nickname: '',
      adjust_type: 'increase',
      amount: 0,
      reason: ''
    },

    // 钻石变动历史
    diamondHistory: [],

    // 商户积分历史
    merchantPointHistory: [],

    // 通用状态
    saving: false,

    get currentPage() {
      return Alpine.store('financePage')
    },

    init() {
      console.log('✅ 财务管理内容初始化')

      this.loadPageData()
      this.$watch('$store.financePage', () => this.loadPageData())
    },

    async loadPageData() {
      const page = this.currentPage
      await this.withLoading(async () => {
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
            break
        }
      }, { loadingText: '加载数据...' })
    },

    // ==================== 消费记录方法 ====================

    async loadConsumption() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.consumptionFilters.startDate) params.append('start_date', this.consumptionFilters.startDate)
        if (this.consumptionFilters.endDate) params.append('end_date', this.consumptionFilters.endDate)
        if (this.consumptionFilters.keyword) params.append('keyword', this.consumptionFilters.keyword)

        const response = await this.apiGet(
          `${API_ENDPOINTS.CONSUMPTION?.LIST || '/api/v4/admin/consumption'}?${params}`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.consumptionList = response.data?.records || response.data?.list || []
        }
      } catch (error) {
        console.error('加载消费记录失败:', error)
        this.consumptionList = []
      }
    },

    async loadConsumptionStats() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.CONSUMPTION?.STATS || '/api/v4/admin/consumption/stats',
          {}, { showError: false, showLoading: false }
        )
        if (response?.success) {
          const stats = response.data?.statistics || response.data || {}
          this.consumptionStats = {
            totalCount: stats.total_count ?? 0,
            totalAmount: stats.total_amount ?? 0,
            todayAmount: stats.today_amount ?? 0,
            avgAmount: stats.avg_amount ?? 0
          }
        }
      } catch (error) {
        console.error('加载消费统计失败:', error)
      }
    },

    /**
     * 查看消费详情
     */
    viewConsumptionDetail(record) {
      this.selectedConsumption = record
      this.showModal('consumptionDetailModal')
    },

    getPaymentMethodText(method) {
      const map = { wechat: '微信支付', alipay: '支付宝', cash: '现金', card: '银行卡', points: '积分' }
      return map[method] || method
    },

    // ==================== 钻石账户方法 ====================

    async loadDiamondAccounts() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.diamondFilters.keyword) params.append('keyword', this.diamondFilters.keyword)
        if (this.diamondFilters.balanceRange) params.append('balance_range', this.diamondFilters.balanceRange)

        const response = await this.apiGet(
          `${API_ENDPOINTS.DIAMOND_ACCOUNT?.LIST || '/api/v4/admin/diamond-accounts'}?${params}`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.diamondAccounts = response.data?.accounts || response.data?.list || []
        }
      } catch (error) {
        console.error('加载钻石账户失败:', error)
        this.diamondAccounts = []
      }
    },

    /**
     * 打开调整钻石模态框
     */
    openAdjustDiamondModal(account = null) {
      this.selectedAccount = account
      this.adjustDiamondForm = {
        user_id: account ? account.user_id : '',
        nickname: account ? (account.nickname || '') : '',
        adjust_type: 'increase',
        amount: 0,
        reason: ''
      }
      this.showModal('adjustDiamondModal')
    },

    /**
     * 提交钻石调整
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
        const adjustAmount = this.adjustDiamondForm.adjust_type === 'increase' 
          ? Math.abs(this.adjustDiamondForm.amount) 
          : -Math.abs(this.adjustDiamondForm.amount)
        
        const response = await this.apiCall(
          API_ENDPOINTS.DIAMOND_ACCOUNT?.ADJUST || '/api/v4/admin/diamond-accounts/adjust',
          {
            method: 'POST',
            data: {
              user_id: this.adjustDiamondForm.user_id,
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
     */
    async viewDiamondHistory(account) {
      this.selectedAccount = account
      this.diamondHistory = []
      
      try {
        const response = await this.apiGet(
          `${API_ENDPOINTS.DIAMOND_ACCOUNT?.HISTORY || '/api/v4/admin/diamond-accounts'}/${account.user_id}/history`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.diamondHistory = response.data?.records || response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载钻石历史失败:', error)
      }
      
      this.showModal('diamondHistoryModal')
    },

    /**
     * 调整钻石（快捷入口）
     */
    adjustDiamond(account) {
      this.openAdjustDiamondModal(account)
    },

    // ==================== 商户积分方法 ====================

    async loadMerchantPoints() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.MERCHANT_POINTS?.LIST || '/api/v4/admin/merchant-points',
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.merchantPoints = response.data?.merchants || response.data?.list || []
        }
      } catch (error) {
        console.error('加载商户积分失败:', error)
        this.merchantPoints = []
      }
    },

    /**
     * 查看商户积分历史
     */
    async viewMerchantPointHistory(merchant) {
      this.selectedMerchant = merchant
      this.merchantPointHistory = []
      
      try {
        const response = await this.apiGet(
          `${API_ENDPOINTS.MERCHANT_POINTS?.HISTORY || '/api/v4/admin/merchant-points'}/${merchant.merchant_id}/history`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.merchantPointHistory = response.data?.records || response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载商户积分历史失败:', error)
      }
      
      this.showModal('merchantPointHistoryModal')
    },

    // ==================== 债务管理方法 ====================

    async loadDebtList() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.DEBT?.LIST || '/api/v4/admin/debts',
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.debtList = response.data?.debts || response.data?.list || []
        }
      } catch (error) {
        console.error('加载债务记录失败:', error)
        this.debtList = []
      }
    },

    async loadDebtStats() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.DEBT?.STATS || '/api/v4/admin/debts/stats',
          {}, { showError: false, showLoading: false }
        )
        if (response?.success) {
          const stats = response.data?.statistics || response.data || {}
          this.debtStats = {
            pendingCount: stats.pending_count ?? 0,
            pendingAmount: stats.pending_amount ?? 0,
            recoveredAmount: stats.recovered_amount ?? 0
          }
        }
      } catch (error) {
        // 使用本地数据计算
        this.debtStats = {
          pendingCount: this.debtList.filter(d => d.status === 'pending').length,
          pendingAmount: this.debtList.filter(d => d.status === 'pending').reduce((sum, d) => sum + (d.amount || 0), 0),
          recoveredAmount: this.debtList.filter(d => d.status === 'recovered').reduce((sum, d) => sum + (d.amount || 0), 0)
        }
      }
    },

    /**
     * 查看债务详情
     */
    viewDebtDetail(debt) {
      this.selectedDebt = debt
      this.showModal('debtDetailModal')
    },

    async processDebt(debt) {
      await this.confirmAndExecute(
        `确认处理债务 ${debt.debt_id}？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.DEBT?.PROCESS || '/api/v4/admin/debts/:id/process', { id: debt.debt_id }),
            { method: 'PUT' }
          )
          if (response?.success) {
            this.loadDebtList()
            this.loadDebtStats()
          }
        },
        { successMessage: '债务处理成功' }
      )
    },

    getDebtStatusClass(status) {
      const map = { pending: 'bg-warning', recovered: 'bg-success', written_off: 'bg-secondary' }
      return map[status] || 'bg-secondary'
    },

    getDebtStatusText(status) {
      const map = { pending: '待处理', recovered: '已回收', written_off: '已核销' }
      return map[status] || status
    },

    // ==================== 活动预算方法 ====================

    async loadBudgetList() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.CAMPAIGN_BUDGET?.LIST || '/api/v4/admin/campaign-budgets',
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.budgetList = response.data?.budgets || response.data?.list || []
        }
      } catch (error) {
        console.error('加载活动预算失败:', error)
        this.budgetList = []
      }
    },

    /**
     * 打开创建预算模态框
     */
    openCreateBudgetModal() {
      this.isEditBudget = false
      this.budgetForm = { budget_id: null, campaign_id: '', campaign_name: '', total_budget: 0, is_active: true }
      this.showModal('budgetModal')
    },

    /**
     * 编辑预算
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
        const url = this.isEditBudget 
          ? `${API_ENDPOINTS.CAMPAIGN_BUDGET?.UPDATE || '/api/v4/admin/campaign-budgets'}/${this.budgetForm.budget_id}`
          : API_ENDPOINTS.CAMPAIGN_BUDGET?.CREATE || '/api/v4/admin/campaign-budgets'
        
        const response = await this.apiCall(url, {
          method: this.isEditBudget ? 'PUT' : 'POST',
          data: {
            campaign_id: this.budgetForm.campaign_id,
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
     */
    async deleteBudget(budget) {
      await this.confirmAndExecute(
        `确认删除活动"${budget.campaign_name || budget.campaign_id}"的预算配置？`,
        async () => {
          const response = await this.apiCall(
            `${API_ENDPOINTS.CAMPAIGN_BUDGET?.DELETE || '/api/v4/admin/campaign-budgets'}/${budget.budget_id || budget.id}`,
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadBudgetList()
          }
        },
        { successMessage: '预算删除成功', confirmText: '确认删除' }
      )
    },

    getBudgetUsageRate(budget) {
      if (!budget.total_budget) return 0
      return Math.round((budget.used_budget || 0) / budget.total_budget * 100)
    },

    getBudgetProgressClass(budget) {
      const rate = this.getBudgetUsageRate(budget)
      if (rate >= 90) return 'bg-danger'
      if (rate >= 70) return 'bg-warning'
      return 'bg-success'
    },

    // ==================== 工具方法 ====================

    formatDateSafe(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        })
      } catch {
        return dateStr
      }
    }
  }))

  console.log('✅ [FinanceManagement] Alpine 组件已注册')
})

console.log('📦 [FinanceManagement] 页面脚本已加载')

