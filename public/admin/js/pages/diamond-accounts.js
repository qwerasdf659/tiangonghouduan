/**
 * 钻石账户管理页面 - Alpine.js 版本
 * @description 查询和管理用户的钻石账户，包括余额查询和调整功能
 * @version 2.0.0
 */

function diamondAccountsPage() {
  return {
    // ============================================================
    // 响应式数据
    // ============================================================
    userInfo: {},
    loading: false,
    submitting: false,

    // 搜索
    searchUserId: '',
    searchMobile: '',

    // 当前用户信息
    currentUserId: null,
    currentUser: {
      user_id: '',
      nickname: '',
      mobile: ''
    },

    // 钻石余额信息
    diamondInfo: {
      balance: 0,
      totalIncome: 0,
      totalExpense: 0,
      frozenAmount: 0,
      updatedAt: ''
    },

    // 流水记录
    transactions: [],
    txTypeFilter: '',

    // 分页
    currentPage: 1,
    pageSize: 20,
    pagination: {
      total: 0,
      totalPages: 0,
      hasPrev: false,
      hasNext: false
    },

    // 调整表单
    adjustForm: {
      adjust_type: 'increase',
      amount: 0,
      business_type: 'manual_adjust',
      reason: ''
    },

    // 模态框实例
    adjustModalInstance: null,

    // Toast 使用全局 $toast

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
    },

    // ============================================================
    // 搜索功能
    // ============================================================

    /**
     * 处理搜索
     */
    async handleSearch() {
      if (!this.searchUserId && !this.searchMobile) {
        this.showError('请输入用户ID或手机号')
        return
      }

      this.loading = true

      try {
        let targetUserId = this.searchUserId

        // 如果提供了手机号，先通过手机号查询用户ID
        if (this.searchMobile && !this.searchUserId) {
          const userResponse = await apiRequest(
            `${API_ENDPOINTS.USER.LIST}?search=${this.searchMobile}`
          )
          if (userResponse && userResponse.success && userResponse.data) {
            const users = userResponse.data.users || userResponse.data
            if (users.length > 0) {
              targetUserId = users[0].user_id
            } else {
              this.showError('未找到该手机号对应的用户')
              this.loading = false
              return
            }
          } else {
            this.showError('查询用户失败')
            this.loading = false
            return
          }
        }

        // 加载用户钻石账户信息
        await this.loadUserDiamondAccount(targetUserId)
      } catch (error) {
        console.error('搜索失败:', error)
        this.showError(error.message)
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 数据加载
    // ============================================================

    /**
     * 加载用户钻石账户信息
     */
    async loadUserDiamondAccount(userId) {
      this.currentUserId = userId
      this.currentPage = 1

      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.ASSET_ADJUSTMENT.USER_BALANCES, { user_id: userId })
        )

        if (response && response.success) {
          const { user, balances } = response.data

          // 更新用户信息
          this.currentUser = {
            user_id: user.user_id,
            nickname: user.nickname || '未设置',
            mobile: this.maskPhone(user.mobile) || '-'
          }

          // 从 balances 数组中找到 DIAMOND 资产的余额
          const diamondBalance = balances.find(b => b.asset_code === 'DIAMOND')
          this.diamondInfo = {
            balance: diamondBalance?.available_amount || 0,
            totalIncome: diamondBalance?.total || 0,
            totalExpense: diamondBalance?.frozen_amount || 0,
            frozenAmount: diamondBalance?.frozen_amount || 0,
            updatedAt: '最近更新'
          }

          // 加载流水记录
          await this.loadTransactions()
        } else {
          this.showError(response?.message || '查询失败')
        }
      } catch (error) {
        console.error('加载用户钻石账户失败:', error)
        this.showError(error.message)
      }
    },

    /**
     * 加载钻石流水记录
     */
    async loadTransactions() {
      if (!this.currentUserId) return

      try {
        const params = new URLSearchParams()
        params.append('user_id', this.currentUserId)
        params.append('page', this.currentPage)
        params.append('page_size', this.pageSize)
        params.append('asset_code', 'DIAMOND')

        if (this.txTypeFilter) {
          params.append('tx_type', this.txTypeFilter)
        }

        const response = await apiRequest(`${API_ENDPOINTS.ASSETS.TRANSACTIONS}?${params.toString()}`)

        if (response && response.success) {
          const { transactions, pagination } = response.data
          this.transactions = transactions || []
          this.pagination = {
            total: pagination?.total || 0,
            totalPages: pagination?.total_pages || 0,
            hasPrev: pagination?.has_prev || false,
            hasNext: pagination?.has_next || false
          }
        } else {
          this.showError(response?.message || '加载流水失败')
        }
      } catch (error) {
        console.error('加载钻石流水失败:', error)
        this.showError(error.message)
      }
    },

    /**
     * 筛选流水类型
     */
    filterByTxType(type) {
      this.txTypeFilter = type
      this.currentPage = 1
      this.loadTransactions()
    },

    /**
     * 切换页码
     */
    changePage(page) {
      if (page < 1 || page > this.pagination.totalPages) return
      this.currentPage = page
      this.loadTransactions()
    },

    // ============================================================
    // 余额调整功能
    // ============================================================

    /**
     * 打开调整余额模态框
     */
    openAdjustModal() {
      this.resetAdjustForm()
      if (!this.adjustModalInstance) {
        this.adjustModalInstance = new bootstrap.Modal(this.$refs.adjustModal)
      }
      this.adjustModalInstance.show()
    },

    /**
     * 重置调整表单
     */
    resetAdjustForm() {
      this.adjustForm = {
        adjust_type: 'increase',
        amount: 0,
        business_type: 'manual_adjust',
        reason: ''
      }
    },

    /**
     * 提交调整余额
     */
    async submitAdjust() {
      if (!this.currentUserId) {
        this.showError('未选择用户')
        return
      }

      if (!this.adjustForm.amount || this.adjustForm.amount <= 0) {
        this.showError('请输入有效的调整金额')
        return
      }

      if (!this.adjustForm.reason.trim()) {
        this.showError('请输入调整原因')
        return
      }

      this.submitting = true

      try {
        const adjustData = {
          user_id: this.currentUserId,
          asset_code: 'DIAMOND',
          adjust_type: this.adjustForm.adjust_type,
          amount: this.adjustForm.amount,
          reason: this.adjustForm.reason,
          idempotency_key: `diamond_adjust_${this.currentUserId}_${Date.now()}`
        }

        const response = await apiRequest(API_ENDPOINTS.ASSET_ADJUSTMENT.ADJUST, {
          method: 'POST',
          body: JSON.stringify(adjustData)
        })

        if (response && response.success) {
          this.showSuccess('调整成功')
          this.adjustModalInstance.hide()
          this.resetAdjustForm()
          await this.loadUserDiamondAccount(this.currentUserId)
        } else {
          this.showError(response?.message || '调整失败')
        }
      } catch (error) {
        console.error('调整余额失败:', error)
        this.showError(error.message)
      } finally {
        this.submitting = false
      }
    },

    // ============================================================
    // 工具方法
    // ============================================================

    /**
     * 获取交易类型标签
     */
    getTxTypeLabel(txType) {
      const labels = {
        increase: '收入',
        decrease: '支出'
      }
      return labels[txType] || txType
    },

    /**
     * 获取业务类型标签
     */
    getBusinessTypeLabel(businessType) {
      const labels = {
        manual_adjust: '手动调整',
        compensation: '补偿',
        penalty: '扣除',
        refund: '退款',
        lottery: '抽奖',
        exchange: '兑换',
        market_sale: '市场出售',
        market_purchase: '市场购买'
      }
      return labels[businessType] || businessType
    },

    /**
     * 手机号脱敏
     */
    maskPhone(phone) {
      if (!phone || phone.length !== 11) return phone
      return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
    },

    /**
     * 格式化日期
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    },

    /**
     * 获取分页数组
     */
    getPageNumbers() {
      const pages = []
      const total = this.pagination.totalPages
      const current = this.currentPage
      const maxVisible = 5

      let start = Math.max(1, current - Math.floor(maxVisible / 2))
      let end = Math.min(total, start + maxVisible - 1)

      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1)
      }

      if (start > 1) {
        pages.push(1)
        if (start > 2) pages.push('...')
      }

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (end < total) {
        if (end < total - 1) pages.push('...')
        pages.push(total)
      }

      return pages
    },

    /**
     * 显示成功提示
     */
    showSuccess(message) {
      this.$toast.success(message)
    },

    /**
     * 显示错误提示
     */
    showError(message) {
      this.$toast.error(message)
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
  Alpine.data('diamondAccountsPage', diamondAccountsPage)
  console.log('✅ [DiamondAccountsPage] Alpine 组件已注册')
})
