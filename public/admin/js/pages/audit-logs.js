/**
 * 审计日志页面 - Alpine.js 版本
 *
 * @file public/admin/js/pages/audit-logs.js
 * @description 审计日志列表、筛选、详情查看等功能
 * @version 2.0.0 (Alpine.js 重构版)
 * @date 2026-01-22
 */

/**
 * 审计日志页面 Alpine.js 组件
 */
function auditLogsPage() {
  return {
    // ==================== 状态数据 ====================
    
    /** 用户信息 */
    userInfo: null,
    
    /** 日志列表 */
    logs: [],
    
    /** 选中的日志详情 */
    selectedLog: null,
    
    /** 加载状态 */
    loading: true,
    
    /** 全局加载状态 */
    globalLoading: false,
    
    /** 当前页码 */
    currentPage: 1,
    
    /** 每页显示数量 */
    pageSize: 30,
    
    /** 总页数 */
    totalPages: 1,
    
    /** 筛选条件 */
    filters: {
      operationType: '',
      targetType: '',
      operatorId: '',
      startDate: '',
      endDate: ''
    },
    
    /** 统计数据 */
    statistics: {
      todayLogs: '-',
      weekLogs: '-',
      successLogs: '-',
      failedLogs: '-'
    },
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 审计日志页面 Alpine.js 组件初始化')
      
      // 获取用户信息
      this.userInfo = getCurrentUser()
      
      // 初始化日期筛选（默认最近一周）
      this.initDateFilters()
      
      // 加载数据
      this.loadAuditLogs()
      this.loadStatistics()
    },
    
    /**
     * 初始化日期筛选器
     */
    initDateFilters() {
      const today = new Date()
      const weekAgo = new Date(today)
      weekAgo.setDate(today.getDate() - 7)
      
      this.filters.endDate = today.toISOString().split('T')[0]
      this.filters.startDate = weekAgo.toISOString().split('T')[0]
    },
    
    // ==================== 数据加载方法 ====================
    
    /**
     * 加载审计日志列表
     */
    async loadAuditLogs() {
      this.loading = true
      
      try {
        const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize
        })
        
        if (this.filters.operationType) params.append('operation_type', this.filters.operationType)
        if (this.filters.targetType) params.append('target_type', this.filters.targetType)
        if (this.filters.operatorId) params.append('operator_id', this.filters.operatorId)
        if (this.filters.startDate) params.append('start_date', this.filters.startDate)
        if (this.filters.endDate) params.append('end_date', this.filters.endDate)
        
        const url = `${API_ENDPOINTS.AUDIT_LOGS.LIST}?${params}`
        const response = await apiRequest(url)
        
        if (response && response.success) {
          this.logs = response.data.logs || response.data.list || []
          this.totalPages = response.data.pagination?.total_pages || 1
        } else {
          this.showError('加载失败', response?.message || '获取审计日志失败')
        }
      } catch (error) {
        console.error('加载审计日志失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
      }
    },
    
    /**
     * 加载统计数据
     */
    async loadStatistics() {
      try {
        const response = await apiRequest(API_ENDPOINTS.AUDIT_LOGS.STATISTICS)
        
        if (response && response.success) {
          const stats = response.data || {}
          this.statistics = {
            todayLogs: stats.today_count || 0,
            weekLogs: stats.week_count || 0,
            successLogs: stats.success_count || 0,
            failedLogs: stats.failed_count || 0
          }
        }
      } catch (error) {
        console.error('加载统计数据失败:', error)
        this.statistics = {
          todayLogs: '-',
          weekLogs: '-',
          successLogs: '-',
          failedLogs: '-'
        }
      }
    },
    
    // ==================== 业务方法 ====================
    
    /**
     * 搜索处理
     */
    handleSearch() {
      this.currentPage = 1
      this.loadAuditLogs()
    },
    
    /**
     * 切换页码
     */
    changePage(page) {
      this.currentPage = page
      this.loadAuditLogs()
    },
    
    /**
     * 查看日志详情
     */
    async viewLogDetail(id) {
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.AUDIT_LOGS.DETAIL, { id }))
        
        if (response && response.success) {
          this.selectedLog = response.data.log || response.data
          new bootstrap.Modal(this.$refs.logDetailModal).show()
        } else {
          this.showError('获取详情失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('获取日志详情失败:', error)
        this.showError('获取失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 获取分页页码数组
     */
    getPaginationPages() {
      const pages = []
      const maxPages = Math.min(this.totalPages, 10)
      
      for (let i = 1; i <= maxPages; i++) {
        pages.push(i)
      }
      
      if (this.totalPages > 10) {
        pages.push('...')
      }
      
      return pages
    },
    
    /**
     * 获取操作类型徽章HTML
     */
    getOperationTypeBadge(type, displayName) {
      const colorMap = {
        user_create: 'bg-success',
        user_update: 'bg-info',
        user_delete: 'bg-danger',
        user_status_change: 'bg-warning',
        user_ban: 'bg-danger',
        user_unban: 'bg-success',
        points_adjust: 'bg-warning',
        asset_adjustment: 'bg-warning',
        asset_orphan_cleanup: 'bg-secondary',
        prize_config: 'bg-primary',
        prize_create: 'bg-primary',
        prize_update: 'bg-info',
        product_create: 'bg-primary',
        product_update: 'bg-info',
        system_config: 'bg-dark',
        system_update: 'bg-dark',
        session_login: 'bg-secondary',
        login_success: 'bg-success',
        login_failed: 'bg-danger',
        exchange_audit: 'bg-info',
        consumption_audit: 'bg-info',
        market_listing_create: 'bg-primary',
        market_trade_complete: 'bg-success'
      }
      
      const typeKey = (type || '').toLowerCase()
      const badgeColor = colorMap[typeKey] || 'bg-secondary'
      const text = displayName || type || '-'
      
      return `<span class="badge ${badgeColor}">${this.escapeHtml(text)}</span>`
    },
    
    /**
     * 获取结果徽章HTML
     */
    getResultBadge(result, displayName) {
      const colorMap = {
        success: 'bg-success',
        completed: 'bg-success',
        failed: 'bg-danger',
        error: 'bg-danger',
        pending: 'bg-warning',
        processing: 'bg-info'
      }
      
      const resultKey = (result || '').toLowerCase()
      const badgeColor = colorMap[resultKey] || 'bg-secondary'
      const text = displayName || result || '-'
      
      return `<span class="badge ${badgeColor}">${this.escapeHtml(text)}</span>`
    },
    
    /**
     * 格式化变更详情
     */
    formatChanges(log) {
      if (!log) return '无变更记录'
      const changes = log.changes || log.before_data || log.after_data
      return changes ? JSON.stringify(changes, null, 2) : '无变更记录'
    },
    
    /**
     * 格式化日期
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },
    
    /**
     * HTML转义
     */
    escapeHtml(text) {
      if (!text) return ''
      const div = document.createElement('div')
      div.textContent = text
      return div.innerHTML
    },
    
    /**
     * 显示错误提示
     */
    showError(title, message) {
      alert(`❌ ${title}\n${message}`)
    },
    
    /**
     * 退出登录
     */
    logout() {
      if (typeof window.logout === 'function') {
        window.logout()
      }
    }
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('auditLogsPage', auditLogsPage)
})
