/**
 * 活动预算配置页面 - Alpine.js 版本
 * @description 管理抽奖活动的预算分配和使用情况
 * @version 2.0.0
 */

function campaignBudgetPage() {
  return {
    // ============================================================
    // 响应式数据
    // ============================================================
    userInfo: {},
    loading: false,
    submitting: false,
    
    // 数据
    campaigns: [],
    activities: [],
    summary: {
      total_budget: 0,
      total_used: 0,
      total_remaining: 0,
      total_campaigns: 0
    },
    
    // 筛选条件
    filters: {
      status: '',
      budgetType: ''
    },
    
    // 表单数据
    budgetForm: {
      campaign_id: '',
      budget_mode: 'pool',
      pool_budget_total: 0,
      alert_threshold: 80,
      remark: ''
    },
    
    // 分页
    currentPage: 1,
    pageSize: 20,
    
    // 模态框实例
    setBudgetModalInstance: null,

    // ============================================================
    // 初始化
    // ============================================================
    init() {
      // 获取用户信息
      this.userInfo = getCurrentUser() || {}

      // Token和权限验证
      if (!getToken() || !checkAdminPermission()) {
        return
      }

      // 加载数据
      this.loadActivities()
      this.loadBudgetData()
    },

    // ============================================================
    // 数据加载方法
    // ============================================================

    /**
     * 加载活动列表
     */
    async loadActivities() {
      try {
        const response = await apiRequest(`${API_ENDPOINTS.CAMPAIGN_BUDGET.BATCH_STATUS}?limit=50`)

        if (response && response.success) {
          this.activities = response.data.campaigns || []
        }
      } catch (error) {
        console.error('加载活动列表失败:', error)
      }
    },

    /**
     * 加载预算数据
     */
    async loadBudgetData() {
      this.loading = true

      try {
        const params = new URLSearchParams({
          limit: this.pageSize
        })

        const response = await apiRequest(
          API_ENDPOINTS.CAMPAIGN_BUDGET.BATCH_STATUS + '?' + params.toString()
        )

        if (response && response.success) {
          const { campaigns, summary } = response.data

          // 更新汇总数据
          this.summary = {
            total_budget: summary?.total_budget || 0,
            total_used: summary?.total_used || 0,
            total_remaining: summary?.total_remaining || 0,
            total_campaigns: summary?.total_campaigns || 0
          }

          // 前端筛选
          let filteredCampaigns = campaigns || []
          if (this.filters.status) {
            filteredCampaigns = filteredCampaigns.filter(c => c.status === this.filters.status)
          }
          if (this.filters.budgetType) {
            filteredCampaigns = filteredCampaigns.filter(c => c.budget_mode === this.filters.budgetType)
          }

          this.campaigns = filteredCampaigns
        } else {
          this.showError(response?.message || '加载失败')
        }
      } catch (error) {
        console.error('加载预算数据失败:', error)
        this.showError('加载失败：' + error.message)
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 操作方法
    // ============================================================

    /**
     * 打开设置预算模态框
     */
    openSetBudgetModal() {
      this.resetBudgetForm()
      if (!this.setBudgetModalInstance) {
        this.setBudgetModalInstance = new bootstrap.Modal(this.$refs.setBudgetModal)
      }
      this.setBudgetModalInstance.show()
    },

    /**
     * 编辑预算
     */
    editBudget(campaignId) {
      this.budgetForm.campaign_id = campaignId
      if (!this.setBudgetModalInstance) {
        this.setBudgetModalInstance = new bootstrap.Modal(this.$refs.setBudgetModal)
      }
      this.setBudgetModalInstance.show()
    },

    /**
     * 重置表单
     */
    resetBudgetForm() {
      this.budgetForm = {
        campaign_id: '',
        budget_mode: 'pool',
        pool_budget_total: 0,
        alert_threshold: 80,
        remark: ''
      }
    },

    /**
     * 提交预算设置
     */
    async submitBudget() {
      if (!this.budgetForm.campaign_id) {
        this.showError('请选择活动')
        return
      }

      this.submitting = true

      try {
        const data = {
          budget_mode: this.budgetForm.budget_mode,
          pool_budget_total: this.budgetForm.pool_budget_total
        }

        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.CAMPAIGN_BUDGET.CAMPAIGN, { campaign_id: this.budgetForm.campaign_id }), 
          {
            method: 'PUT',
            body: JSON.stringify(data)
          }
        )

        if (response && response.success) {
          this.showSuccess('预算设置成功')
          this.setBudgetModalInstance.hide()
          this.resetBudgetForm()
          this.loadBudgetData()
        } else {
          this.showError(response?.message || '设置失败')
        }
      } catch (error) {
        console.error('预算设置失败:', error)
        this.showError(error.message)
      } finally {
        this.submitting = false
      }
    },

    // ============================================================
    // 工具方法
    // ============================================================

    /**
     * 获取预算模式文本
     */
    getBudgetModeText(mode) {
      const modeMap = {
        pool: '总预算',
        user: '用户预算',
        daily: '每日预算',
        none: '无预算'
      }
      return modeMap[mode] || mode || '未设置'
    },

    /**
     * 获取使用率
     */
    getUsageRate(campaign) {
      const total = campaign.pool_budget?.total || 0
      const used = campaign.pool_budget?.used || 0
      return total > 0 ? ((used / total) * 100).toFixed(1) : 0
    },

    /**
     * 获取使用率样式类
     */
    getUsageClass(campaign) {
      const rate = this.getUsageRate(campaign)
      if (rate >= 90) return 'bg-danger'
      if (rate >= 70) return 'bg-warning'
      return 'bg-success'
    },

    /**
     * 获取状态文本
     */
    getStatusText(status) {
      const statusMap = {
        active: '进行中',
        pending: '待开始',
        ended: '已结束',
        draft: '草稿'
      }
      return statusMap[status] || '未知'
    },

    /**
     * 获取状态徽章样式类
     */
    getStatusBadgeClass(status) {
      const classMap = {
        active: 'bg-success',
        pending: 'bg-warning',
        ended: 'bg-secondary',
        draft: 'bg-info'
      }
      return classMap[status] || 'bg-secondary'
    },

    /**
     * 格式化日期
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleDateString('zh-CN')
    },

    /**
     * 显示成功消息
     */
    showSuccess(message) {
      this.$toast.success(message);
    },

    /**
     * 显示错误消息
     */
    showError(message) {
      this.$toast.error(message);
    },

    /**
     * 退出登录
     */
    handleLogout() {
      logout()
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('campaignBudgetPage', campaignBudgetPage)
  console.log('✅ [CampaignBudgetPage] Alpine 组件已注册')
})
