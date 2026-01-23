/**
 * Lottery Management Page - Alpine.js Mixin 重构版
 * 抽奖管理整合页面组件
 * 
 * @file public/admin/js/pages/lottery-management.js
 * @version 3.0.0
 * @date 2026-01-23
 */

document.addEventListener('alpine:init', () => {
  console.log('[LotteryManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 全局 Store
  Alpine.store('lotteryPage', 'campaigns')

  // 导航组件
  Alpine.data('lotteryNavigation', () => ({
    ...createPageMixin(),
    currentPage: 'campaigns',
    subPages: [
      { id: 'campaigns', title: '活动管理', icon: 'bi-gift' },
      { id: 'prizes', title: '奖品管理', icon: 'bi-trophy' },
      { id: 'campaign-budget', title: '预算管理', icon: 'bi-cash-stack' },
      { id: 'lottery-strategy', title: '策略配置', icon: 'bi-gear' },
      { id: 'lottery-quota', title: '配额管理', icon: 'bi-bar-chart-steps' },
      { id: 'lottery-metrics', title: '抽奖指标', icon: 'bi-speedometer' },
      { id: 'redemption-codes', title: '核销码管理', icon: 'bi-ticket-perforated' }
    ],

    init() {
      console.log('✅ 抽奖管理导航初始化')
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

  // 页面内容组件
  Alpine.data('lotteryPageContent', () => ({
    ...createPageMixin(),

    // 活动管理
    campaigns: [],
    campaignStats: { total: 0, active: 0, todayParticipants: 0, todayWinners: 0 },
    campaignFilters: { status: '', keyword: '' },
    campaignForm: { name: '', description: '', start_time: '', end_time: '', status: 'pending', rules: '' },
    editingCampaignId: null,

    // 奖品管理
    prizes: [],
    prizeFilters: { type: '', status: '', keyword: '' },
    prizeForm: { name: '', type: 'virtual', probability: 0, stock: -1, is_active: true, image_url: '', description: '' },
    editingPrizeId: null,
    stockForm: { prizeId: null, prizeName: '', quantity: 1 },

    // 预算管理
    budgetCampaigns: [],
    budgetSummary: { total_budget: 0, total_used: 0, total_remaining: 0, total_campaigns: 0 },
    budgetFilters: { status: '', budgetType: '' },
    budgetForm: { campaign_id: '', budget_mode: 'pool', pool_budget_total: 0, alert_threshold: 80, remark: '' },
    editingBudgetCampaignId: null,

    // 策略配置
    strategyGroups: {},
    tierMatrix: [],
    budgetTiers: ['低', '中', '高', '特高'],
    pressureTiers: ['低压', '中压', '高压'],

    // 配额管理
    quotas: [],
    quotaForm: { campaign_id: '', prize_id: '', total_quota: 0, period_type: 'daily' },
    editingQuotaId: null,
    isEditQuota: false,

    // 抽奖指标
    lotteryMetrics: { totalDraws: 0, totalWins: 0, winRate: 0, totalUsers: 0 },
    campaignMetrics: [],

    // 核销码管理
    redemptionCodes: [],
    redemptionStats: { total: 0, pending: 0, fulfilled: 0, expired: 0 },
    redemptionFilters: { status: '', prizeType: '', code: '', userId: '' },
    redemptionSelectedIds: [],
    redemptionDetail: null,
    redeemForm: { orderId: '', codeDisplay: '', storeId: '', remark: '' },
    stores: [],

    // 选中的数据项
    selectedCampaign: null,
    editingMatrixCell: null,

    // Modal 由 modalMixin 统一管理

    // 通用状态
    saving: false,
    isEditMode: false,
    submitting: false,

    get currentPage() {
      return Alpine.store('lotteryPage')
    },

    init() {
      console.log('✅ 抽奖管理内容初始化')

      this.loadPageData()
      this.$watch('$store.lotteryPage', () => this.loadPageData())
    },

    async loadPageData() {
      const page = this.currentPage
      await this.withLoading(async () => {
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
          case 'lottery-metrics':
            await this.loadLotteryMetrics()
            break
          case 'redemption-codes':
            await this.loadStores()
            await this.loadRedemptionCodes()
            break
        }
      }, { loadingText: '加载数据...' })
    },

    // 活动管理方法
    async loadCampaigns() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.campaignFilters.status) params.append('status', this.campaignFilters.status)
        if (this.campaignFilters.keyword) params.append('keyword', this.campaignFilters.keyword)

        const response = await this.apiGet(
          `${API_ENDPOINTS.CAMPAIGN?.LIST || '/api/v4/console/campaigns'}?${params}`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.campaigns = response.data?.campaigns || response.data?.list || []
        }
      } catch (error) {
        console.error('加载活动失败:', error)
        this.campaigns = []
      }
    },

    async loadCampaignStats() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.CAMPAIGN?.STATS || '/api/v4/console/campaigns/stats',
          {}, { showError: false, showLoading: false }
        )
        if (response?.success) {
          const stats = response.data?.statistics || response.data || {}
          this.campaignStats = {
            total: stats.total ?? this.campaigns.length,
            active: stats.active ?? this.campaigns.filter(c => c.status === 'active').length,
            todayParticipants: stats.today_participants ?? 0,
            todayWinners: stats.today_winners ?? 0
          }
        }
      } catch (error) {
        this.campaignStats = {
          total: this.campaigns.length,
          active: this.campaigns.filter(c => c.status === 'active').length,
          todayParticipants: 0,
          todayWinners: 0
        }
      }
    },

    openCreateCampaignModal() {
      this.editingCampaignId = null
      this.isEditMode = false
      this.campaignForm = { name: '', description: '', start_time: '', end_time: '', status: 'pending', rules: '' }
      this.showModal('campaignModal')
    },

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
     */
    viewCampaignDetail(campaign) {
      this.selectedCampaign = campaign
      this.showModal('campaignDetailModal')
    },

    /**
     * 提交活动表单
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
          ? `${API_ENDPOINTS.CAMPAIGN?.UPDATE || '/api/v4/console/campaigns'}/${this.editingCampaignId}`
          : API_ENDPOINTS.CAMPAIGN?.CREATE || '/api/v4/console/campaigns'

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
     */
    async deleteCampaign(campaign) {
      await this.confirmAndExecute(
        `确认删除活动「${campaign.name}」？此操作不可恢复`,
        async () => {
          const response = await this.apiCall(
            `${API_ENDPOINTS.CAMPAIGN?.DELETE || '/api/v4/console/campaigns'}/${campaign.campaign_id || campaign.id}`,
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
     */
    async toggleCampaign(campaign) {
      const newStatus = campaign.status === 'active' ? 'inactive' : 'active'
      await this.confirmAndExecute(
        `确认${newStatus === 'active' ? '启用' : '停用'}活动「${campaign.name}」？`,
        async () => {
          const response = await this.apiCall(
            `${API_ENDPOINTS.CAMPAIGN?.TOGGLE || '/api/v4/console/campaigns'}/${campaign.campaign_id || campaign.id}/status`,
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

    getCampaignStatusClass(status) {
      const map = { active: 'bg-success', inactive: 'bg-secondary', pending: 'bg-warning', ended: 'bg-dark' }
      return map[status] || 'bg-secondary'
    },

    getCampaignStatusText(status) {
      const map = { active: '进行中', inactive: '已结束', pending: '待开始', ended: '已结束' }
      return map[status] || status
    },

    // 奖品管理方法
    async loadPrizes() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.prizeFilters.type) params.append('type', this.prizeFilters.type)
        if (this.prizeFilters.status) params.append('is_active', this.prizeFilters.status === 'active')
        if (this.prizeFilters.keyword) params.append('keyword', this.prizeFilters.keyword)

        const response = await this.apiGet(
          `${API_ENDPOINTS.PRIZE?.LIST || '/api/v4/console/prizes'}?${params}`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.prizes = response.data?.prizes || response.data?.list || []
        }
      } catch (error) {
        console.error('加载奖品失败:', error)
        this.prizes = []
      }
    },

    openCreatePrizeModal() {
      this.editingPrizeId = null
      this.isEditMode = false
      this.prizeForm = { name: '', type: 'virtual', probability: 0, stock: -1, is_active: true, image_url: '', description: '' }
      this.showModal('prizeModal')
    },

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

    async togglePrize(prize) {
      const newStatus = !prize.is_active
      await this.confirmAndExecute(
        `确认${newStatus ? '启用' : '禁用'}奖品「${prize.name}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.PRIZE?.TOGGLE || '/api/v4/console/prizes/:id/toggle', { id: prize.prize_id }),
            { method: 'PUT' }
          )
          if (response?.success) this.loadPrizes()
        },
        { successMessage: `奖品已${newStatus ? '启用' : '禁用'}` }
      )
    },

    async deletePrize(prize) {
      await this.confirmAndExecute(
        `确认删除奖品「${prize.name}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.PRIZE?.DELETE || '/api/v4/console/prizes/:id', { id: prize.prize_id }),
            { method: 'DELETE' }
          )
          if (response?.success) this.loadPrizes()
        },
        { successMessage: '奖品已删除' }
      )
    },

    /**
     * 提交奖品表单
     */
    async submitPrizeForm() {
      if (!this.prizeForm.name) {
        this.showError('请输入奖品名称')
        return
      }

      try {
        this.saving = true
        const url = this.isEditMode
          ? `${API_ENDPOINTS.PRIZE?.UPDATE || '/api/v4/console/prizes'}/${this.editingPrizeId}`
          : API_ENDPOINTS.PRIZE?.CREATE || '/api/v4/console/prizes'

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

    getPrizeTypeText(type) {
      const map = { physical: '实物', virtual: '虚拟', coupon: '优惠券', points: '积分' }
      return map[type] || type
    },

    /**
     * 打开奖品补货模态框
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
          API.buildURL(API_ENDPOINTS.PRIZE?.ADD_STOCK || '/api/v4/console/prizes/:id/stock', { id: this.stockForm.prizeId }),
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
     */
    async loadBudgetData() {
      try {
        const params = new URLSearchParams()
        params.append('limit', 50)
        if (this.budgetFilters.status) params.append('status', this.budgetFilters.status)

        const response = await this.apiGet(
          `${API_ENDPOINTS.CAMPAIGN_BUDGET?.BATCH_STATUS || '/api/v4/console/campaign-budgets'}?${params}`,
          {}, { showLoading: false }
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
            filteredCampaigns = filteredCampaigns.filter(c => c.status === this.budgetFilters.status)
          }
          if (this.budgetFilters.budgetType) {
            filteredCampaigns = filteredCampaigns.filter(c => c.budget_mode === this.budgetFilters.budgetType)
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
          API.buildURL(API_ENDPOINTS.CAMPAIGN_BUDGET?.CAMPAIGN || '/api/v4/console/campaigns/:campaign_id/budget', { campaign_id: campaignId }),
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
     */
    getBudgetUsageRate(campaign) {
      const total = campaign.pool_budget?.total || 0
      const used = campaign.pool_budget?.used || 0
      return total > 0 ? ((used / total) * 100).toFixed(1) : 0
    },

    /**
     * 获取预算使用率样式类
     */
    getBudgetUsageClass(campaign) {
      const rate = this.getBudgetUsageRate(campaign)
      if (rate >= 90) return 'bg-danger'
      if (rate >= 70) return 'bg-warning'
      return 'bg-success'
    },

    /**
     * 获取预算模式文本
     */
    getBudgetModeText(mode) {
      const modeMap = { pool: '总预算', user: '用户预算', daily: '每日预算', none: '无预算' }
      return modeMap[mode] || mode || '未设置'
    },

    // 策略配置方法
    async loadStrategies() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.LOTTERY_STRATEGY?.LIST || '/api/v4/console/lottery/strategies',
          {}, { showLoading: false }
        )
        if (response?.success) {
          const strategies = response.data?.strategies || response.data?.list || []
          this.strategyGroups = strategies.reduce((groups, strategy) => {
            const groupName = strategy.group || strategy.category || 'other'
            if (!groups[groupName]) groups[groupName] = []
            groups[groupName].push(strategy)
            return groups
          }, {})
        }
      } catch (error) {
        console.error('加载策略失败:', error)
        this.strategyGroups = {}
      }
    },

    async loadTierMatrix() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.TIER_MATRIX?.LIST || '/api/v4/console/lottery/tier-matrix',
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.tierMatrix = response.data?.matrix || response.data || []
        }
      } catch (error) {
        console.error('加载层级矩阵失败:', error)
        this.tierMatrix = []
      }
    },

    getMatrixConfig(budgetTier, pressureTier) {
      return this.tierMatrix.find(item => item.budget_tier === budgetTier && item.pressure_tier === pressureTier)
    },

    /**
     * 编辑矩阵单元格
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
     */
    async submitMatrixConfig() {
      try {
        this.saving = true
        const response = await this.apiCall(
          API_ENDPOINTS.TIER_MATRIX?.UPDATE || '/api/v4/console/lottery/tier-matrix',
          {
            method: 'PUT',
            data: this.editingMatrixCell
          }
        )

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

    getStrategyGroupIcon(groupName) {
      const icons = { probability: 'bi-percent', frequency: 'bi-clock', budget: 'bi-cash', user: 'bi-person', other: 'bi-gear' }
      return icons[groupName] || 'bi-gear'
    },

    getStrategyGroupName(groupName) {
      const names = { probability: '概率策略', frequency: '频率控制', budget: '预算管理', user: '用户限制', other: '其他策略' }
      return names[groupName] || groupName
    },

    // 配额管理方法
    async loadQuotas() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.LOTTERY_QUOTA?.LIST || '/api/v4/console/lottery/quotas',
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.quotas = response.data?.quotas || response.data?.list || []
        }
      } catch (error) {
        console.error('加载配额失败:', error)
        this.quotas = []
      }
    },

    openCreateQuotaModal() {
      this.editingQuotaId = null
      this.isEditQuota = false
      this.quotaForm = { campaign_id: '', prize_id: '', total_quota: 0, period_type: 'daily' }
      this.showModal('quotaModal')
    },

    editQuota(quota) {
      this.editingQuotaId = quota.quota_id || quota.id
      this.isEditQuota = true
      this.quotaForm = {
        campaign_id: quota.campaign_id,
        prize_id: quota.prize_id,
        total_quota: quota.total_quota,
        period_type: quota.period_type || 'daily'
      }
      this.showModal('quotaModal')
    },

    /**
     * 提交配额表单
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
          ? `${API_ENDPOINTS.LOTTERY_QUOTA?.UPDATE || '/api/v4/console/lottery/quotas'}/${this.editingQuotaId}`
          : API_ENDPOINTS.LOTTERY_QUOTA?.CREATE || '/api/v4/console/lottery/quotas'

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
     */
    async deleteQuota(quota) {
      await this.confirmAndExecute(
        `确认删除此配额配置？`,
        async () => {
          const response = await this.apiCall(
            `${API_ENDPOINTS.LOTTERY_QUOTA?.DELETE || '/api/v4/console/lottery/quotas'}/${quota.quota_id || quota.id}`,
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadQuotas()
          }
        },
        { successMessage: '配额已删除' }
      )
    },

    // 抽奖指标方法
    async loadLotteryMetrics() {
      try {
        const [metricsRes, campaignMetricsRes] = await Promise.all([
          this.apiGet(API_ENDPOINTS.LOTTERY_METRICS?.SUMMARY || '/api/v4/console/lottery/metrics', {}, { showLoading: false, showError: false }),
          this.apiGet(API_ENDPOINTS.LOTTERY_METRICS?.BY_CAMPAIGN || '/api/v4/console/lottery/metrics/by-campaign', {}, { showLoading: false, showError: false })
        ])

        if (metricsRes?.success) {
          const data = metricsRes.data || {}
          this.lotteryMetrics = {
            totalDraws: data.total_draws ?? 0,
            totalWins: data.total_wins ?? 0,
            winRate: data.win_rate ? (data.win_rate * 100).toFixed(2) : 0,
            totalUsers: data.total_users ?? 0
          }
        }

        if (campaignMetricsRes?.success) {
          this.campaignMetrics = campaignMetricsRes.data?.metrics || campaignMetricsRes.data || []
        }
      } catch (error) {
        console.error('加载抽奖指标失败:', error)
        this.lotteryMetrics = { totalDraws: 0, totalWins: 0, winRate: 0, totalUsers: 0 }
        this.campaignMetrics = []
      }
    },

    // 工具方法
    formatDateTimeLocal(dateStr) {
      if (!dateStr) return ''
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return ''
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

    formatDateSafe(dateStr) {
      if (!dateStr) return '-'
      if (typeof dateStr === 'string' && dateStr.includes('年')) {
        return dateStr.replace(/星期[一二三四五六日]/, '').trim()
      }
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
    },

    // ==================== 核销码管理方法 ====================

    /**
     * 加载门店列表
     */
    async loadStores() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.STORE?.LIST || '/api/v4/console/stores',
          {}, { showLoading: false, showError: false }
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
     */
    async loadRedemptionCodes(pageNum = 1) {
      try {
        this.page = pageNum
        this.redemptionSelectedIds = []

        const params = new URLSearchParams()
        params.append('page', pageNum)
        params.append('limit', this.pageSize)
        if (this.redemptionFilters.status) params.append('status', this.redemptionFilters.status)
        if (this.redemptionFilters.prizeType) params.append('prize_type', this.redemptionFilters.prizeType)
        if (this.redemptionFilters.code) params.append('code', this.redemptionFilters.code)
        if (this.redemptionFilters.userId) params.append('user_id', this.redemptionFilters.userId)

        const response = await this.apiGet(
          `${API_ENDPOINTS.BUSINESS_RECORDS?.LIST || '/api/v4/console/business-records/redemption-orders'}?${params}`,
          {}, { showLoading: false }
        )

        if (response?.success) {
          this.redemptionCodes = response.data?.orders || response.data?.records || response.data?.codes || []
          this.total = response.data?.pagination?.total || this.redemptionCodes.length
          this.totalPages = response.data?.pagination?.total_pages || Math.ceil(this.total / this.pageSize)

          // 更新统计
          this.redemptionStats = {
            total: this.total,
            pending: this.redemptionCodes.filter(c => c.status === 'pending').length,
            fulfilled: this.redemptionCodes.filter(c => c.status === 'fulfilled' || c.status === 'redeemed').length,
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
     */
    searchRedemptionCodes() {
      this.loadRedemptionCodes(1)
    },

    /**
     * 查看核销码详情
     */
    async viewRedemptionDetail(orderId) {
      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.BUSINESS_RECORDS?.DETAIL || '/api/v4/console/business-records/redemption-orders/:order_id', { order_id: orderId }),
          {}, { showLoading: true }
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
     */
    openRedeemModal(orderId, codeDisplay) {
      this.redeemForm = {
        orderId: orderId,
        codeDisplay: codeDisplay,
        storeId: '',
        remark: ''
      }
      this.showModal('redeemModal')
    },

    /**
     * 提交核销
     */
    async submitRedeem() {
      if (this.submitting) return
      this.submitting = true

      try {
        const response = await this.apiCall(
          API.buildURL(API_ENDPOINTS.BUSINESS_RECORDS?.REDEEM || '/api/v4/console/business-records/redemption-orders/:order_id/redeem', { order_id: this.redeemForm.orderId }),
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
     */
    async cancelRedemptionCode(orderId) {
      await this.confirmAndExecute(
        '确定要取消此核销码吗？',
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.BUSINESS_RECORDS?.CANCEL || '/api/v4/console/business-records/redemption-orders/:order_id/cancel', { order_id: orderId }),
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
     */
    get isAllRedemptionSelected() {
      return this.redemptionCodes.length > 0 && this.redemptionSelectedIds.length === this.redemptionCodes.length
    },

    /**
     * 批量过期
     */
    async batchExpireRedemption() {
      if (this.redemptionSelectedIds.length === 0) {
        this.showWarning('请先选择要处理的核销码')
        return
      }

      await this.confirmAndExecute(
        `确定要将选中的 ${this.redemptionSelectedIds.length} 个核销码设为过期吗？`,
        async () => {
          const response = await this.apiCall(
            API_ENDPOINTS.BUSINESS_RECORDS?.BATCH_EXPIRE || '/api/v4/console/business-records/redemption-orders/batch-expire',
            {
              method: 'POST',
              data: { order_ids: this.redemptionSelectedIds }
            }
          )
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
     */
    exportRedemptionCodes() {
      const params = new URLSearchParams()
      if (this.redemptionFilters.status) params.append('status', this.redemptionFilters.status)
      params.append('format', 'csv')

      const exportUrl = (API_ENDPOINTS.BUSINESS_RECORDS?.EXPORT || '/api/v4/console/business-records/redemption-orders/export') + '?' + params.toString()
      window.open(exportUrl, '_blank')
    },

    // 核销码工具函数
    getCodeDisplay(codeHash) {
      if (!codeHash) return '-'
      return codeHash.substring(0, 8) + '...'
    },

    getRedeemerName(item) {
      if (!item) return ''
      const redeemer = item.redeemer || {}
      return redeemer.nickname || redeemer.mobile || ''
    },

    getRedemptionPrizeName(item) {
      if (!item) return '-'
      const itemInfo = item.item_instance || {}
      const itemMeta = itemInfo.meta || {}
      return itemMeta.prize_name || itemMeta.name || itemInfo.item_type || '-'
    },

    getRedemptionCampaignName(item) {
      if (!item) return '-'
      const itemInfo = item.item_instance || {}
      const itemMeta = itemInfo.meta || {}
      return itemMeta.campaign_name || '-'
    },

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
})

console.log('📦 [LotteryManagement] 页面脚本已加载')

