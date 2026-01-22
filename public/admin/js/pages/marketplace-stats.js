/**
 * 用户上架状态统计页面 - Alpine.js 版本
 * @description 统计用户商品上架情况
 * @version 2.0.0
 */

function marketplaceStatsPage() {
  return {
    // ============================================================
    // 响应式数据
    // ============================================================
    userInfo: {},
    loading: false,
    globalLoading: false,

    // 统计概览
    summary: {
      total_users_with_listings: 0,
      users_near_limit: 0,
      users_at_limit: 0
    },

    // 表格数据
    stats: [],
    maxListings: 10, // 最大上架限制

    // 筛选条件
    filters: {
      status: 'all'
    },

    // 分页
    pagination: {
      current_page: 1,
      total_pages: 1,
      total: 0
    },
    currentPage: 1,
    pageSize: 20,

    // Toast 使用全局 $toast

    // ============================================================
    // 初始化
    // ============================================================
    init() {
      this.userInfo = getCurrentUser() || {}

      if (!getToken() || !checkAdminPermission()) {
        return
      }

      // 加载数据
      this.fetchStats()
    },

    // ============================================================
    // 数据获取
    // ============================================================

    /**
     * 获取统计数据
     */
    async fetchStats() {
      this.loading = true
      this.stats = []

      try {
        const params = new URLSearchParams({
          page: this.currentPage,
          limit: this.pageSize,
          filter: this.filters.status
        })

        const response = await apiRequest(`${API_ENDPOINTS.MARKETPLACE_STATS.LISTING_STATS}?${params}`)

        if (response && response.success) {
          this.summary = response.data.summary || {
            total_users_with_listings: 0,
            users_near_limit: 0,
            users_at_limit: 0
          }
          this.stats = response.data.stats || []
          this.pagination = response.data.pagination || { current_page: 1, total_pages: 1, total: 0 }
        } else {
          this.showErrorToast(response?.message || '获取数据失败')
        }
      } catch (error) {
        console.error('获取统计数据失败', error)
        this.showErrorToast('获取数据失败，请稍后重试')
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 事件处理
    // ============================================================

    /**
     * 处理搜索
     */
    handleSearch() {
      this.currentPage = 1
      this.fetchStats()
    },

    /**
     * 处理重置
     */
    handleReset() {
      this.filters.status = 'all'
      this.currentPage = 1
      this.fetchStats()
    },

    /**
     * 处理筛选变化
     */
    handleFilterChange() {
      this.currentPage = 1
      this.fetchStats()
    },

    /**
     * 切换页码
     * @param {number} page - 目标页码
     */
    changePage(page) {
      if (page >= 1 && page <= this.pagination.total_pages && page !== this.currentPage) {
        this.currentPage = page
        this.fetchStats()
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
     * 查看用户商品
     * @param {number} userId - 用户ID
     */
    viewUserListings(userId) {
      window.location.href = `/admin/users.html?user_id=${userId}&tab=inventory`
    },

    // ============================================================
    // 辅助函数
    // ============================================================

    /**
     * 获取上架状态
     * @param {Object} item - 用户数据
     * @returns {string} 状态
     */
    getListingStatus(item) {
      if (item.is_at_limit) return 'at_limit'
      if (item.listing_count >= this.maxListings * 0.8) return 'near_limit'
      return 'normal'
    },

    /**
     * 计算上架百分比
     * @param {Object} item - 用户数据
     * @returns {number} 百分比
     */
    getPercentage(item) {
      return Math.min(100, Math.round((item.listing_count / this.maxListings) * 100))
    },

    /**
     * 获取状态徽章样式
     * @param {string} status - 状态
     * @returns {string} CSS类
     */
    getStatusBadgeClass(status) {
      const classMap = {
        at_limit: 'bg-danger',
        near_limit: 'bg-warning',
        normal: 'bg-success'
      }
      return classMap[status] || 'bg-secondary'
    },

    /**
     * 获取进度条样式
     * @param {number} percentage - 百分比
     * @returns {string} CSS类
     */
    getProgressClass(percentage) {
      if (percentage >= 100) return 'bg-danger'
      if (percentage >= 80) return 'bg-warning'
      return 'bg-success'
    },

    /**
     * 获取状态标签样式
     * @param {string} status - 状态
     * @returns {string} CSS类
     */
    getStatusTagClass(status) {
      const classMap = {
        at_limit: 'bg-danger',
        near_limit: 'bg-warning',
        normal: 'bg-success'
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
        at_limit: '已满',
        near_limit: '接近',
        normal: '正常'
      }
      return textMap[status] || '未知'
    },

    /**
     * 获取用户状态样式
     * @param {string} status - 用户状态
     * @returns {string} CSS类
     */
    getUserStatusClass(status) {
      const classMap = {
        active: 'bg-success',
        inactive: 'bg-danger',
        suspended: 'bg-warning'
      }
      return classMap[status] || 'bg-secondary'
    },

    /**
     * 获取用户状态文本
     * @param {string} status - 用户状态
     * @returns {string} 文本
     */
    getUserStatusText(status) {
      const textMap = {
        active: '正常',
        inactive: '禁用',
        suspended: '暂停'
      }
      return textMap[status] || status || '未知'
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
     * 退出登录
     */
    logout() {
      logout()
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('marketplaceStatsPage', marketplaceStatsPage)
  console.log('✅ [MarketplaceStatsPage] Alpine 组件已注册')
})
