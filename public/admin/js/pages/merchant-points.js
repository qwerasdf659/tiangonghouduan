/**
 * 商家积分审核页面 - Alpine.js 版本
 * @description 审核商家提交的用户积分发放申请
 * @version 3.0.0
 *
 * 后端API端点:
 * - GET  /api/v4/console/merchant-points - 获取申请列表
 * - GET  /api/v4/console/merchant-points/:audit_id - 获取详情
 * - POST /api/v4/console/merchant-points/:audit_id/approve - 审核通过
 * - POST /api/v4/console/merchant-points/:audit_id/reject - 审核拒绝
 * - GET  /api/v4/console/merchant-points/stats/pending - 待审核统计
 */

function merchantPointsPage() {
  return {
    // ============================================================
    // 响应式数据
    // ============================================================
    userInfo: {},
    loading: false,
    globalLoading: false,
    submitting: false,

    // 统计数据
    stats: {
      pending_count: 0,
      approved_count: 0,
      rejected_count: 0,
      today_points: 0
    },

    // 申请列表
    applications: [],

    // 筛选条件
    filters: {
      status: 'pending',
      priority: '',
      timeRange: ''
    },

    // 分页
    pagination: {
      current_page: 1,
      total_pages: 1,
      total: 0
    },
    currentPage: 1,
    pageSize: 20,

    // 选择项
    selectedItems: [],

    // 当前审核的申请
    currentApp: {},
    reviewComment: '',

    // 模态框实例
    reviewModalInstance: null,

    // ============================================================
    // 计算属性
    // ============================================================
    get isAllSelected() {
      const pendingApps = this.applications.filter(app => app.status === 'pending')
      return pendingApps.length > 0 && pendingApps.every(app => this.selectedItems.includes(app.audit_id))
    },

    // ============================================================
    // 初始化
    // ============================================================
    init() {
      this.userInfo = getCurrentUser() || {}

      if (!getToken() || !checkAdminPermission()) {
        return
      }

      // 初始化模态框
      this.reviewModalInstance = new bootstrap.Modal(this.$refs.reviewModal)

      // 加载数据
      this.loadData()
      this.loadPendingStats()
    },

    // ============================================================
    // 数据加载
    // ============================================================

    /**
     * 加载待审核统计
     */
    async loadPendingStats() {
      try {
        const response = await apiRequest(API_ENDPOINTS.MERCHANT_POINTS.STATS_PENDING)
        if (response && response.success) {
          this.stats = {
            pending_count: response.data.pending_count || 0,
            approved_count: response.data.approved_count || 0,
            rejected_count: response.data.rejected_count || 0,
            today_points: response.data.today_points || 0
          }
        }
      } catch (error) {
        console.error('加载统计失败:', error)
      }
    },

    /**
     * 加载数据列表
     */
    async loadData() {
      this.loading = true
      this.applications = []

      try {
        const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize
        })

        if (this.filters.status) params.append('status', this.filters.status)
        if (this.filters.timeRange) params.append('time_range', this.filters.timeRange)
        if (this.filters.priority) params.append('priority', this.filters.priority)

        const url = API_ENDPOINTS.MERCHANT_POINTS.LIST + '?' + params.toString()
        const response = await apiRequest(url)

        if (response && response.success) {
          const { rows, pagination } = response.data
          this.applications = rows || []
          this.pagination = pagination || { current_page: 1, total_pages: 1, total: 0 }

          // 重新加载统计数据
          this.loadPendingStats()
        } else {
          this.showErrorToast(response?.message || '加载数据失败')
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        this.showErrorToast('加载失败：' + error.message)
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 事件处理
    // ============================================================

    /**
     * 筛选条件变化
     */
    handleFilterChange() {
      this.currentPage = 1
      this.selectedItems = []
      this.loadData()
    },

    /**
     * 切换页码
     * @param {number} page - 目标页码
     */
    changePage(page) {
      if (page >= 1 && page <= this.pagination.total_pages && page !== this.currentPage) {
        this.currentPage = page
        this.selectedItems = []
        this.loadData()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },

    /**
     * 获取可见页码数组
     */
    getPageNumbers() {
      const totalPages = this.pagination.total_pages
      const currentPage = this.currentPage
      const maxVisible = 5

      let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
      let endPage = Math.min(totalPages, startPage + maxVisible - 1)

      if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, totalPages - maxVisible + 1)
      }

      const pages = []
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i)
      }
      return pages
    },

    /**
     * 切换行选择
     * @param {number} auditId - 审核ID
     */
    toggleRowSelection(auditId) {
      const index = this.selectedItems.indexOf(auditId)
      if (index > -1) {
        this.selectedItems.splice(index, 1)
      } else {
        this.selectedItems.push(auditId)
      }
    },

    /**
     * 切换全选
     */
    toggleSelectAll() {
      const pendingApps = this.applications.filter(app => app.status === 'pending')

      if (this.isAllSelected) {
        // 取消全选
        this.selectedItems = []
      } else {
        // 全选待审核项
        this.selectedItems = pendingApps.map(app => app.audit_id)
      }
    },

    /**
     * 显示审核模态框
     * @param {Object} app - 申请对象
     */
    showReviewModal(app) {
      this.currentApp = app
      this.reviewComment = ''
      this.reviewModalInstance.show()
    },

    /**
     * 显示详情模态框（复用审核模态框）
     * @param {Object} app - 申请对象
     */
    showDetailModal(app) {
      this.currentApp = app
      this.reviewComment = app.audit_reason || ''
      this.reviewModalInstance.show()
    },

    /**
     * 审核单个申请
     * @param {string} action - 审核操作 (approve/reject)
     */
    async reviewSingle(action) {
      if (!this.currentApp.audit_id) return

      // 如果是拒绝，检查是否填写了原因
      if (action === 'reject' && !this.reviewComment.trim()) {
        this.showWarningToast('请填写拒绝原因')
        return
      }

      this.submitting = true

      try {
        const endpoint = action === 'approve'
          ? API.buildURL(API_ENDPOINTS.MERCHANT_POINTS.APPROVE, { id: this.currentApp.audit_id })
          : API.buildURL(API_ENDPOINTS.MERCHANT_POINTS.REJECT, { id: this.currentApp.audit_id })

        const response = await apiRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            reason: this.reviewComment.trim()
          })
        })

        if (response && response.success) {
          this.showSuccessToast(action === 'approve' ? '审核通过' : '审核拒绝')
          this.reviewModalInstance.hide()
          this.loadData()
          this.loadPendingStats()
        } else {
          this.showErrorToast(response?.message || '审核失败')
        }
      } catch (error) {
        console.error('审核失败:', error)
        this.showErrorToast('审核失败：' + error.message)
      } finally {
        this.submitting = false
      }
    },

    /**
     * 批量通过
     */
    async batchApprove() {
      if (this.selectedItems.length === 0) return

      if (!confirm(`确定要批量通过 ${this.selectedItems.length} 条申请吗？`)) {
        return
      }

      this.globalLoading = true

      let successCount = 0
      let failCount = 0

      try {
        for (const auditId of this.selectedItems) {
          try {
            const response = await apiRequest(
              API.buildURL(API_ENDPOINTS.MERCHANT_POINTS.APPROVE, { id: auditId }),
              {
                method: 'POST',
                body: JSON.stringify({ reason: '批量审核通过' })
              }
            )

            if (response && response.success) {
              successCount++
            } else {
              failCount++
            }
          } catch (error) {
            failCount++
            console.error(`审核 ${auditId} 失败:`, error)
          }
        }

        if (successCount > 0) {
          this.showSuccessToast(
            `成功通过 ${successCount} 条申请${failCount > 0 ? `，${failCount} 条失败` : ''}`
          )
        } else {
          this.showErrorToast('批量操作失败')
        }

        this.selectedItems = []
        this.loadData()
        this.loadPendingStats()
      } catch (error) {
        console.error('批量操作失败:', error)
        this.showErrorToast('批量操作失败：' + error.message)
      } finally {
        this.globalLoading = false
      }
    },

    /**
     * 批量拒绝
     */
    async batchReject() {
      if (this.selectedItems.length === 0) return

      const reason = prompt('请输入拒绝原因（必填）：')
      if (!reason || reason.trim() === '') {
        this.showWarningToast('拒绝原因不能为空')
        return
      }

      this.globalLoading = true

      let successCount = 0
      let failCount = 0

      try {
        for (const auditId of this.selectedItems) {
          try {
            const response = await apiRequest(
              API.buildURL(API_ENDPOINTS.MERCHANT_POINTS.REJECT, { id: auditId }),
              {
                method: 'POST',
                body: JSON.stringify({ reason: reason.trim() })
              }
            )

            if (response && response.success) {
              successCount++
            } else {
              failCount++
            }
          } catch (error) {
            failCount++
            console.error(`审核 ${auditId} 失败:`, error)
          }
        }

        if (successCount > 0) {
          this.showSuccessToast(
            `成功拒绝 ${successCount} 条申请${failCount > 0 ? `，${failCount} 条失败` : ''}`
          )
        } else {
          this.showErrorToast('批量操作失败')
        }

        this.selectedItems = []
        this.loadData()
        this.loadPendingStats()
      } catch (error) {
        console.error('批量操作失败:', error)
        this.showErrorToast('批量操作失败：' + error.message)
      } finally {
        this.globalLoading = false
      }
    },

    // ============================================================
    // 辅助函数
    // ============================================================

    /**
     * 获取申请人名称
     * @param {Object} app - 申请对象
     * @returns {string} 申请人名称
     */
    getApplicantName(app) {
      if (!app) return '-'
      if (app.applicant) {
        return app.applicant.nickname || app.applicant.mobile || `用户${app.applicant.user_id}`
      }
      return `用户${app.user_id || '-'}`
    },

    /**
     * 获取审核员名称
     * @param {Object} app - 申请对象
     * @returns {string} 审核员名称
     */
    getAuditorName(app) {
      if (!app || !app.auditor) return '-'
      return app.auditor.nickname || app.auditor.mobile || `管理员${app.auditor.user_id}`
    },

    /**
     * 获取状态徽章样式
     * @param {string} status - 状态
     * @returns {string} CSS类
     */
    getStatusBadgeClass(status) {
      const classMap = {
        pending: 'bg-warning',
        approved: 'bg-success',
        rejected: 'bg-danger',
        cancelled: 'bg-secondary'
      }
      return classMap[status] || 'bg-secondary'
    },

    /**
     * 获取状态文本
     * @param {string} status - 状态
     * @returns {string} 文本
     */
    getStatusText(status) {
      const textMap = {
        pending: '待审核',
        approved: '已通过',
        rejected: '已拒绝',
        cancelled: '已取消'
      }
      return textMap[status] || '未知'
    },

    /**
     * 截断文本
     * @param {string} text - 文本
     * @param {number} length - 最大长度
     * @returns {string} 截断后的文本
     */
    truncateText(text, length) {
      if (!text) return '-'
      return text.length > length ? text.substring(0, length) + '...' : text
    },

    /**
     * 格式化日期
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的日期
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
     * 显示成功提示
     * @param {string} message - 提示消息
     */
    showSuccessToast(message) {
      this.$toast.success(message)
    },

    /**
     * 显示错误提示
     * @param {string} message - 错误消息
     */
    showErrorToast(message) {
      this.$toast.error(message)
    },

    /**
     * 显示警告提示
     * @param {string} message - 警告消息
     */
    showWarningToast(message) {
      this.$toast.warning(message)
    },

    /**
     * 退出登录
     */
    logout() {
      logout()
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('merchantPointsPage', merchantPointsPage)
  console.log('✅ [MerchantPointsPage] Alpine 组件已注册')
})
