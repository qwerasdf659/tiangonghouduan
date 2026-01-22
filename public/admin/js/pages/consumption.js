/**
 * 消费记录审核页面 - Alpine.js 组件
 *
 * API端点：
 * - GET  /api/v4/shop/consumption/admin/records     - 获取消费记录列表
 * - POST /api/v4/shop/consumption/approve/:id       - 审核通过
 * - POST /api/v4/shop/consumption/reject/:id        - 审核拒绝
 */

function consumptionPage() {
  return {
    // ========== 状态数据 ==========
    loading: false,
    userInfo: {},

    // 筛选条件
    filters: {
      status: 'pending',
      search: ''
    },

    // 记录列表
    records: [],

    // 分页
    pagination: {
      currentPage: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0
    },

    // 统计数据
    stats: {
      pending: 0,
      today: 0,
      approved: 0,
      rejected: 0
    },

    // 当前操作的记录
    currentRecordId: null,
    currentAction: null,
    remarkInput: '',

    // Modal 实例
    remarkModal: null,

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
        this.remarkModal = new bootstrap.Modal(this.$refs.remarkModal)
      })

      // 加载数据
      this.loadRecords()
    },

    // ========== 数据加载 ==========
    async loadRecords(silent = false) {
      if (!silent) {
        this.loading = true
      }

      try {
        const params = new URLSearchParams({
          page: this.pagination.currentPage,
          page_size: this.pagination.pageSize,
          status: this.filters.status
        })

        if (this.filters.search) {
          params.append('search', this.filters.search)
        }

        const response = await apiRequest(`${API_ENDPOINTS.CONSUMPTION.ADMIN_RECORDS}?${params.toString()}`)

        if (response && response.success) {
          this.records = response.data.records || response.data.list || []
          
          // 更新分页
          const paginationData = response.data.pagination || {}
          this.pagination.total = paginationData.total || this.records.length
          this.pagination.totalPages = Math.ceil(this.pagination.total / this.pagination.pageSize)

          // 更新统计
          if (response.data.statistics) {
            this.stats = {
              pending: response.data.statistics.pending || 0,
              today: response.data.statistics.today || 0,
              approved: response.data.statistics.approved || 0,
              rejected: response.data.statistics.rejected || 0
            }
          }
        } else {
          Alpine.store('notification').showToast(response?.message || '获取数据失败', 'error')
        }
      } catch (error) {
        console.error('加载记录失败:', error)
        Alpine.store('notification').showToast(error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    // ========== 筛选和分页 ==========
    resetAndLoad() {
      this.pagination.currentPage = 1
      this.loadRecords()
    },

    resetFilters() {
      this.filters.status = 'pending'
      this.filters.search = ''
      this.pagination.currentPage = 1
      this.loadRecords()
    },

    changePage(page) {
      if (page < 1 || page > this.pagination.totalPages) return
      this.pagination.currentPage = page
      this.loadRecords()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },

    getPageNumbers() {
      const pages = []
      const total = this.pagination.totalPages
      const current = this.pagination.currentPage
      const maxPages = 7

      if (total <= maxPages) {
        for (let i = 1; i <= total; i++) {
          pages.push(i)
        }
      } else {
        let startPage = Math.max(1, current - Math.floor(maxPages / 2))
        let endPage = Math.min(total, startPage + maxPages - 1)

        if (endPage - startPage < maxPages - 1) {
          startPage = Math.max(1, endPage - maxPages + 1)
        }

        if (startPage > 1) {
          pages.push(1)
          if (startPage > 2) pages.push('...')
        }

        for (let i = startPage; i <= endPage; i++) {
          if (i !== 1 && i !== total) pages.push(i)
        }

        if (endPage < total) {
          if (endPage < total - 1) pages.push('...')
          pages.push(total)
        }
      }

      return pages
    },

    // ========== 审核操作 ==========
    reviewRecord(recordId, action) {
      this.currentRecordId = recordId
      this.currentAction = action
      this.remarkInput = ''
      this.remarkModal.show()
    },

    async submitReview() {
      if (this.currentAction === 'reject' && !this.remarkInput) {
        Alpine.store('notification').showToast('拒绝审核时建议填写拒绝原因', 'warning')
        return
      }

      this.loading = true

      try {
        const endpoint =
          this.currentAction === 'approve'
            ? API.buildURL(API_ENDPOINTS.CONSUMPTION.APPROVE, { id: this.currentRecordId })
            : API.buildURL(API_ENDPOINTS.CONSUMPTION.REJECT, { id: this.currentRecordId })

        const response = await apiRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify({ admin_notes: this.remarkInput })
        })

        if (response && response.success) {
          Alpine.store('notification').showToast(
            this.currentAction === 'approve' ? '记录已审核通过' : '记录已拒绝',
            'success'
          )

          // 关闭模态框
          this.remarkModal.hide()

          // 重新加载数据
          this.loadRecords(true)
        } else {
          Alpine.store('notification').showToast(response?.message || '操作失败', 'error')
        }
      } catch (error) {
        console.error('审核失败:', error)
        Alpine.store('notification').showToast(error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    // ========== 工具方法 ==========
    getStatusText(status) {
      const statusMap = {
        pending: '待审核',
        approved: '已通过',
        rejected: '已拒绝'
      }
      return statusMap[status] || '未知'
    },

    formatApiDate(dateValue) {
      if (!dateValue) return '-'
      // 后端返回对象格式 { iso, beijing, timestamp, relative }
      if (typeof dateValue === 'object' && dateValue.beijing) {
        return dateValue.beijing
      }
      // 兼容字符串格式
      return formatDate(dateValue)
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
  Alpine.data('consumptionPage', consumptionPage)
})
