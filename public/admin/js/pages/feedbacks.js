/**
 * 用户反馈管理页面 - Alpine.js 版本
 * @file public/admin/js/pages/feedbacks.js
 */

function feedbacksPage() {
  return {
    // ========== 状态 ==========
    userInfo: null,
    loading: false,
    globalLoading: false,
    submitting: false,
    
    feedbacks: [],
    currentFeedback: null,
    currentPage: 1,
    pageSize: 20,
    
    // 统计数据
    stats: {
      total: null,
      pending: null,
      processing: null,
      resolved: null
    },
    
    // 分页信息
    pagination: {
      totalPages: 1,
      total: 0
    },
    
    // 筛选条件
    filters: {
      status: '',
      category: '',
      userId: ''
    },
    
    // 操作相关
    replyFeedbackId: null,
    replyContent: '',
    statusFeedbackId: null,
    newStatus: '',
    
    // 模态框实例
    detailModalInstance: null,
    replyModalInstance: null,
    statusModalInstance: null,

    // ========== 初始化 ==========
    init() {
      console.log('[FeedbacksPage] 初始化')
      
      // 检查登录
      const token = getToken()
      if (!token) {
        window.location.href = '/admin/login.html'
        return
      }
      
      this.userInfo = getCurrentUser()
      checkAdminPermission()
      
      // 初始化模态框
      this.$nextTick(() => {
        this.detailModalInstance = new bootstrap.Modal(this.$refs.detailModal)
        this.replyModalInstance = new bootstrap.Modal(this.$refs.replyModal)
        this.statusModalInstance = new bootstrap.Modal(this.$refs.statusModal)
      })
      
      this.loadFeedbacks()
      this.loadStats()
    },

    // ========== 数据加载 ==========
    handleSearch() {
      this.currentPage = 1
      this.loadFeedbacks()
    },

    async loadFeedbacks() {
      this.loading = true

      try {
        const params = new URLSearchParams({
          limit: this.pageSize,
          offset: (this.currentPage - 1) * this.pageSize
        })

        if (this.filters.status) params.append('status', this.filters.status)
        if (this.filters.category) params.append('category', this.filters.category)
        if (this.filters.userId) params.append('user_id', this.filters.userId)

        const response = await apiRequest(`${API_ENDPOINTS.FEEDBACK.LIST}?${params}`)

        if (response?.success) {
          this.feedbacks = response.data?.feedbacks || response.data?.list || []
          const total = response.data?.total || this.feedbacks.length
          
          this.pagination = {
            total: total,
            totalPages: Math.ceil(total / this.pageSize)
          }
        } else {
          alert('❌ ' + (response?.message || '加载失败'))
        }
      } catch (error) {
        console.error('加载反馈列表失败', error)
        alert('❌ 加载失败，请稍后重试')
      } finally {
        this.loading = false
      }
    },

    async loadStats() {
      try {
        const response = await apiRequest(`${API_ENDPOINTS.FEEDBACK.LIST}?limit=1000&offset=0`)
        
        if (response?.success) {
          const feedbacks = response.data?.feedbacks || []
          this.stats = {
            total: response.data?.total || feedbacks.length,
            pending: feedbacks.filter(f => f.status === 'pending').length,
            processing: feedbacks.filter(f => f.status === 'processing').length,
            resolved: feedbacks.filter(f => f.status === 'replied' || f.status === 'closed').length
          }
        }
      } catch (error) {
        console.error('加载统计数据失败', error)
      }
    },

    changePage(page) {
      this.currentPage = page
      this.loadFeedbacks()
    },

    // ========== 查看详情 ==========
    async viewFeedback(item) {
      this.globalLoading = true

      try {
        const id = item.feedback_id || item.id
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.FEEDBACK.DETAIL, { id }))

        if (response?.success) {
          this.currentFeedback = response.data?.feedback || response.data
          this.detailModalInstance.show()
        } else {
          alert('❌ ' + (response?.message || '获取详情失败'))
        }
      } catch (error) {
        console.error('获取反馈详情失败', error)
        alert('❌ 获取失败，请稍后重试')
      } finally {
        this.globalLoading = false
      }
    },

    // ========== 回复反馈 ==========
    openReplyModal(item) {
      this.replyFeedbackId = item.feedback_id || item.id
      this.replyContent = ''
      this.replyModalInstance.show()
    },

    async handleReply() {
      if (!this.replyContent.trim()) {
        alert('❌ 请输入回复内容')
        return
      }

      this.submitting = true

      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.FEEDBACK.REPLY, { id: this.replyFeedbackId }), {
          method: 'POST',
          body: JSON.stringify({ reply_content: this.replyContent.trim() })
        })

        if (response?.success) {
          alert('✅ 回复成功')
          this.replyModalInstance.hide()
          this.loadFeedbacks()
          this.loadStats()
        } else {
          alert('❌ ' + (response?.message || '回复失败'))
        }
      } catch (error) {
        console.error('回复反馈失败', error)
        alert('❌ 回复失败，请稍后重试')
      } finally {
        this.submitting = false
      }
    },

    // ========== 更新状态 ==========
    openStatusModal(item) {
      this.statusFeedbackId = item.feedback_id || item.id
      this.newStatus = ''
      this.statusModalInstance.show()
    },

    async handleUpdateStatus() {
      if (!this.newStatus) {
        alert('❌ 请选择新状态')
        return
      }

      this.submitting = true

      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.FEEDBACK.STATUS, { id: this.statusFeedbackId }), {
          method: 'PUT',
          body: JSON.stringify({ status: this.newStatus })
        })

        if (response?.success) {
          alert('✅ 状态更新成功')
          this.statusModalInstance.hide()
          this.loadFeedbacks()
          this.loadStats()
        } else {
          alert('❌ ' + (response?.message || '更新失败'))
        }
      } catch (error) {
        console.error('更新状态失败', error)
        alert('❌ 更新失败，请稍后重试')
      } finally {
        this.submitting = false
      }
    },

    // ========== 工具方法 ==========
    getStatusBadge(status, displayName) {
      const colorMap = {
        pending: 'bg-warning',
        processing: 'bg-info',
        replied: 'bg-success',
        closed: 'bg-secondary'
      }
      const statusKey = (status || '').toLowerCase()
      const badgeColor = colorMap[statusKey] || 'bg-secondary'
      const text = displayName || this.getStatusText(status)
      return `<span class="badge ${badgeColor}">${text}</span>`
    },

    getStatusText(status) {
      const map = {
        pending: '待处理',
        processing: '处理中',
        replied: '已回复',
        closed: '已关闭'
      }
      return map[status] || status || '未知'
    },

    getCategoryBadge(category) {
      const map = {
        technical: '<span class="badge" style="background-color:#6f42c1">技术问题</span>',
        feature: '<span class="badge bg-primary">功能建议</span>',
        bug: '<span class="badge bg-danger">Bug报告</span>',
        complaint: '<span class="badge bg-warning text-dark">投诉</span>',
        suggestion: '<span class="badge bg-info">建议</span>',
        other: '<span class="badge bg-secondary">其他</span>'
      }
      return map[category] || `<span class="badge bg-secondary">${category || '未知'}</span>`
    },

    formatDate(dateStr) {
      if (!dateStr) return '-'
      if (typeof formatDate === 'function') {
        return formatDate(dateStr)
      }
      try {
        return new Date(dateStr).toLocaleString('zh-CN')
      } catch {
        return dateStr
      }
    },

    logout() {
      if (typeof logout === 'function') {
        logout()
      }
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('feedbacksPage', feedbacksPage)
  console.log('✅ [FeedbacksPage] Alpine 组件已注册')
})

console.log('📦 用户反馈管理页面 (Alpine.js) 已加载')
