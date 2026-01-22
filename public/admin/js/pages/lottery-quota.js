/**
 * 抽奖配额管理页面 - Alpine.js 版本
 * 
 * 2026-01-22 重构：迁移到 Alpine.js 声明式架构
 * 保留原有业务逻辑和数据展示，使用 Alpine.js 替代原生 DOM 操作
 */

/**
 * 抽奖配额页面 Alpine.js 组件
 */
function lotteryQuotaPage() {
  return {
    // ========== 用户信息 ==========
    userInfo: JSON.parse(localStorage.getItem('admin_user') || '{}'),
    
    // ========== 状态 ==========
    loading: false,
    submitting: false,
    
    // ========== 筛选条件 ==========
    filters: {
      campaignId: '',
      period: 'week'
    },
    
    // ========== 配额统计 ==========
    quotaStats: {
      totalRules: 0,
      usedQuota: 0,
      remainingQuota: 0,
      usageRate: '0%'
    },
    
    // ========== 活动列表 ==========
    activities: [],
    
    // ========== 规则列表 ==========
    rules: [],
    
    // ========== 分页 ==========
    pagination: {
      currentPage: 1,
      pageSize: 20,
      totalPages: 1,
      total: 0
    },
    
    // ========== 表单数据 ==========
    formData: {
      ruleType: '',
      campaignId: '',
      limitValue: 5,
      reason: ''
    },
    
    // ========== 初始化 ==========
    async init() {
      // Token 和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载初始数据
      await this.loadActivities()
      await this.loadStatistics()
      await this.loadQuotaData()
    },
    
    // ========== 加载活动列表 ==========
    async loadActivities() {
      try {
        const response = await apiRequest(API_ENDPOINTS.ACTIVITIES.LIST)
        
        if (response && response.success) {
          this.activities = response.data.activities || response.data || []
        }
      } catch (error) {
        console.error('加载活动列表失败:', error)
      }
    },
    
    // ========== 加载配额统计 ==========
    async loadStatistics() {
  try {
    const params = new URLSearchParams()

        if (this.filters.campaignId) {
          params.append('campaign_id', this.filters.campaignId)
    }

    const url = params.toString()
      ? API_ENDPOINTS.LOTTERY_QUOTA.STATISTICS + '?' + params.toString()
      : API_ENDPOINTS.LOTTERY_QUOTA.STATISTICS

    const response = await apiRequest(url)

    if (response && response.success) {
      const { rules, quotas } = response.data

          this.quotaStats.totalRules = rules?.total || 0
          this.quotaStats.usedQuota = quotas?.today_used || 0
          this.quotaStats.remainingQuota = quotas?.today_remaining || 0

      const totalLimit = quotas?.today_limit || 0
      const usedCount = quotas?.today_used || 0
          this.quotaStats.usageRate = totalLimit > 0 
            ? Math.round((usedCount / totalLimit) * 100) + '%' 
            : '0%'
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
    },

    // ========== 刷新所有数据 ==========
    async refreshAll() {
      await this.loadStatistics()
      await this.loadQuotaData()
    },
    
    // ========== 加载配额规则数据 ==========
    async loadQuotaData() {
      this.loading = true
      
      try {
    const params = new URLSearchParams({
          page: this.pagination.currentPage,
          page_size: this.pagination.pageSize,
          period: this.filters.period
    })

        if (this.filters.campaignId) {
          params.append('campaign_id', this.filters.campaignId)
    }

    const response = await apiRequest(API_ENDPOINTS.LOTTERY_QUOTA.RULES + '?' + params.toString())

    if (response && response.success) {
      const { rules, pagination } = response.data

          this.rules = rules || []

      if (pagination) {
            this.pagination.totalPages = pagination.total_pages || 1
            this.pagination.total = pagination.total || 0
      }
    } else {
          this.showToast('error', response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载配额数据失败:', error)
        this.rules = []
        this.showToast('error', error.message)
  } finally {
        this.loading = false
  }
    },
    
    // ========== 获取规则类型文字 ==========
    getScopeTypeText(type) {
  const types = {
    global: '全局规则',
    campaign: '活动规则',
    role: '角色规则',
    user: '用户规则'
  }
  return types[type] || type
    },
    
    // ========== 获取作用范围文字 ==========
    getScopeText(rule) {
      if (rule.scope_type === 'global') return '全局'
      if (rule.scope_type === 'campaign') return `活动ID: ${rule.scope_id}`
      if (rule.scope_type === 'role') return `角色: ${rule.scope_id}`
      if (rule.scope_type === 'user') return `用户ID: ${rule.scope_id}`
      return '-'
    },
    
    // ========== 获取生效时间文字 ==========
    getEffectiveText(rule) {
      if (!rule.effective_from && !rule.effective_to) {
        return '永久有效'
      }
      const from = rule.effective_from ? formatDate(rule.effective_from) : '开始'
      const to = rule.effective_to ? formatDate(rule.effective_to) : '永久'
      return `${from} ~ ${to}`
    },
    
    // ========== 禁用规则 ==========
    async disableRule(ruleId) {
  if (!confirm('确定要禁用此规则吗？')) {
    return
  }

  try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.LOTTERY_QUOTA.DISABLE_RULE, { id: ruleId }), 
          { method: 'PUT' }
        )

    if (response && response.success) {
          this.showToast('success', '规则已禁用')
          await this.loadQuotaData()
          await this.loadStatistics()
    } else {
          this.showToast('error', response?.message || '禁用失败')
    }
  } catch (error) {
    console.error('禁用规则失败:', error)
        this.showToast('error', error.message)
  }
    },

    // ========== 提交创建规则 ==========
    async submitCreateRule() {
      // 验证
      if (!this.formData.ruleType) {
        this.showToast('error', '请选择规则类型')
    return
  }

      if (!this.formData.limitValue || this.formData.limitValue <= 0) {
        this.showToast('error', '请输入有效的每日上限次数')
    return
  }

      if (this.formData.ruleType === 'campaign' && !this.formData.campaignId) {
        this.showToast('error', '活动规则必须选择一个活动')
    return
  }

  const data = {
        rule_type: this.formData.ruleType,
        limit_value: this.formData.limitValue,
        reason: this.formData.reason?.trim() || null
  }

      if (this.formData.ruleType === 'campaign') {
        data.campaign_id = parseInt(this.formData.campaignId)
      }
      
      this.submitting = true
      
      try {
    const response = await apiRequest(API_ENDPOINTS.LOTTERY_QUOTA.RULES, {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
          this.showToast('success', '配额规则创建成功')
          
          // 关闭模态框
          const modal = bootstrap.Modal.getInstance(this.$refs.adjustModal)
          if (modal) modal.hide()
          
          // 重置表单
          this.resetForm()
          
          // 刷新数据
          await this.refreshAll()
    } else {
          this.showToast('error', response?.message || '创建失败')
    }
  } catch (error) {
    console.error('配额规则创建失败:', error)
        this.showToast('error', error.message)
  } finally {
        this.submitting = false
      }
    },
    
    // ========== 重置表单 ==========
    resetForm() {
      this.formData = {
        ruleType: '',
        campaignId: '',
        limitValue: 5,
        reason: ''
      }
    },
    
    // ========== 分页 ==========
    goToPage(page) {
      if (page < 1 || page > this.pagination.totalPages) return
      this.pagination.currentPage = page
      this.loadQuotaData()
    },
    
    // ========== 获取页码数组 ==========
    getPageNumbers() {
      const pages = []
      const current = this.pagination.currentPage
      const total = this.pagination.totalPages
      
      for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
          pages.push(i)
        } else if (i === current - 3 || i === current + 3) {
          pages.push('...')
}
      }
      
      return pages
    },
    
    // ========== 显示 Toast ==========
    showToast(type, message) {
      if (type === 'success') {
        this.$toast.success(message)
      } else if (type === 'error') {
        this.$toast.error(message)
      } else if (type === 'warning') {
        this.$toast.warning(message)
      } else {
        this.$toast.info(message)
      }
    },
    
    // ========== 退出登录 ==========
    logout() {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login.html'
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('lotteryQuotaPage', lotteryQuotaPage)
  console.log('✅ [LotteryQuotaPage] Alpine 组件已注册')
})
