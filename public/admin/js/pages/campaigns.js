/**
 * 抽奖活动管理页面 - Alpine.js 组件
 */

function campaignsPage() {
  return {
    // ========== 状态数据 ==========
    loading: false,
    userInfo: {},

    // 筛选条件
    filters: {
      status: '',
      budgetMode: '',
      search: ''
    },

    // 活动列表
    campaigns: [],

    // 选中的活动详情
    selectedCampaign: null,

    // 统计数据
    stats: {
      totalCampaigns: 0,
      activeCampaigns: 0,
      totalPrizes: 0,
      budgetUsed: 0
    },

    // Modal 实例
    detailModal: null,

    // ========== 生命周期 ==========
    init() {
      // 获取用户信息
      this.userInfo = getCurrentUser() || {}

      // 检查权限
      if (!getToken() || !checkAdminPermission()) {
        return
      }

      // 初始化 Modal
      this.$nextTick(() => {
        this.detailModal = new bootstrap.Modal(this.$refs.detailModal)
      })

      // 加载数据
      this.loadCampaigns()
    },

    // ========== 数据加载 ==========
    async loadCampaigns() {
      this.loading = true

      try {
        const params = {}
        if (this.filters.status) params.status = this.filters.status
        if (this.filters.budgetMode) params.budget_mode = this.filters.budgetMode
        if (this.filters.search) params.search = this.filters.search

        const response = await apiRequest(API.buildURL(API_ENDPOINTS.CAMPAIGN.LIST, {}), {
          method: 'GET',
          queryParams: params
        })

        if (response && response.success) {
          this.campaigns = response.data.campaigns || response.data || []
          this.updateStats()
        } else {
          Alpine.store('notification').showToast(response?.message || '获取活动列表失败', 'error')
        }
      } catch (error) {
        console.error('加载活动失败:', error)
        Alpine.store('notification').showToast('加载失败：' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    // 更新统计数据
    updateStats() {
      this.stats.totalCampaigns = this.campaigns.length
      this.stats.activeCampaigns = this.campaigns.filter(c => c.status === 'active').length
      this.stats.totalPrizes = this.campaigns.reduce((sum, c) => sum + (c.prizes ? c.prizes.length : 0), 0)
      this.stats.budgetUsed = this.campaigns.reduce((sum, c) => {
        const total = Number(c.pool_budget_total) || 0
        const remaining = Number(c.pool_budget_remaining) || 0
        return sum + (total - remaining)
      }, 0)
    },

    // 查看活动详情
    async viewCampaignDetail(campaignId) {
      this.loading = true

      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.CAMPAIGN.DETAIL, { campaign_id: campaignId }))

        if (response && response.success) {
          this.selectedCampaign = response.data
          this.detailModal.show()
        } else {
          Alpine.store('notification').showToast(response?.message || '获取活动详情失败', 'error')
        }
      } catch (error) {
        console.error('加载活动详情失败:', error)
        Alpine.store('notification').showToast('加载失败：' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    // ========== 工具方法 ==========
    getStatusText(status) {
      const statusMap = {
        'active': '进行中',
        'paused': '已暂停',
        'ended': '已结束',
        'pending': '待开始'
      }
      return statusMap[status] || '未知'
    },

    getBudgetModeText(mode) {
      const modeMap = {
        'user': '用户预算',
        'pool': '奖池预算',
        'none': '无限制'
      }
      return modeMap[mode] || '未知'
    },

    calculateBudgetProgress(campaign) {
      const totalBudget = Number(campaign.pool_budget_total) || 0
      const remainingBudget = Number(campaign.pool_budget_remaining) || 0
      const usedBudget = totalBudget - remainingBudget
      if (totalBudget === 0) return 0
      return Math.min(100, (usedBudget / totalBudget) * 100)
    },

    getBudgetProgressColor(campaign) {
      const progress = this.calculateBudgetProgress(campaign)
      if (progress >= 90) return 'bg-danger'
      if (progress >= 70) return 'bg-warning'
      return 'bg-success'
    },

    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleDateString('zh-CN')
    },

    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },

    formatNumber(num) {
      if (num === undefined || num === null) return '-'
      return Number(num).toLocaleString()
    },

    logout
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('campaignsPage', campaignsPage)
})



