/**
 * 用户反馈管理页面 - Alpine.js Mixin 重构版
 * 
 * @file public/admin/js/pages/feedbacks.js
 * @description 用户反馈列表、查看、回复、状态管理
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 */

function feedbacksPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createCrudMixin({ pageSize: 20 }),
    
    // ==================== 页面特有状态 ====================
    
    /** 反馈列表 */
    feedbacks: [],
    
    /** 当前查看的反馈 */
    currentFeedback: null,
    
    /** 统计数据 */
    stats: {
      total: null,
      pending: null,
      processing: null,
      resolved: null
    },
    
    /** 筛选条件 */
    filters: {
      status: '',
      category: '',
      userId: ''
    },
    
    /** 回复相关 */
    replyFeedbackId: null,
    replyContent: '',
    
    /** 状态变更相关 */
    statusFeedbackId: null,
    newStatus: '',
    
    /** 全局加载 */
    globalLoading: false,
    
    /** 提交中 */
    submitting: false,
    

    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 用户反馈管理页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }
      
      this.loadData()
      this.loadStats()
    },

    // ==================== 数据加载 ====================
    
    /**
     * 搜索处理
     */
    handleSearch() {
      this.currentPage = 1
      this.loadData()
    },

    /**
     * 加载反馈列表
     */
    async loadData() {
      await this.withLoading(async () => {
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
          this.total = response.data?.total || this.feedbacks.length
        } else {
          this.showError(response?.message || '加载失败')
        }
      }, '加载反馈列表...')
    },

    /**
     * 加载统计数据
     */
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

    // ==================== 查看详情 ====================
    
    /**
     * 查看反馈详情
     */
    async viewFeedback(item) {
      this.globalLoading = true

      try {
        const id = item.feedback_id || item.id
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.FEEDBACK.DETAIL, { id }))

        if (response?.success) {
          this.currentFeedback = response.data?.feedback || response.data
          this.showModal('detailModal')
        } else {
          this.showError(response?.message || '获取详情失败')
        }
      } catch (error) {
        console.error('获取反馈详情失败', error)
        this.showError('获取失败，请稍后重试')
      } finally {
        this.globalLoading = false
      }
    },

    // ==================== 回复反馈 ====================
    
    /**
     * 打开回复模态框
     */
    openReplyModal(item) {
      this.replyFeedbackId = item.feedback_id || item.id
      this.replyContent = ''
      this.showModal('replyModal')
    },

    /**
     * 提交回复
     */
    async handleReply() {
      if (!this.replyContent.trim()) {
        this.showError('请输入回复内容')
        return
      }

      this.submitting = true

      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.FEEDBACK.REPLY, { id: this.replyFeedbackId }),
          {
            method: 'POST',
            body: JSON.stringify({ reply_content: this.replyContent.trim() })
          }
        )

        if (response?.success) {
          this.showSuccess('回复成功')
          this.hideModal('replyModal')
          this.loadData()
          this.loadStats()
        } else {
          this.showError(response?.message || '回复失败')
        }
      } catch (error) {
        console.error('回复反馈失败', error)
        this.showError('回复失败，请稍后重试')
      } finally {
        this.submitting = false
      }
    },

    // ==================== 更新状态 ====================
    
    /**
     * 打开状态模态框
     */
    openStatusModal(item) {
      this.statusFeedbackId = item.feedback_id || item.id
      this.newStatus = ''
      this.showModal('statusModal')
    },

    /**
     * 提交状态更新
     */
    async handleUpdateStatus() {
      if (!this.newStatus) {
        this.showError('请选择新状态')
        return
      }

      this.submitting = true

      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.FEEDBACK.STATUS, { id: this.statusFeedbackId }),
          {
            method: 'PUT',
            body: JSON.stringify({ status: this.newStatus })
          }
        )

        if (response?.success) {
          this.showSuccess('状态更新成功')
          this.hideModal('statusModal')
          this.loadData()
          this.loadStats()
        } else {
          this.showError(response?.message || '更新失败')
        }
      } catch (error) {
        console.error('更新状态失败', error)
        this.showError('更新失败，请稍后重试')
      } finally {
        this.submitting = false
      }
    },

    // ==================== 工具方法 ====================
    
    /**
     * 获取状态徽章 HTML
     */
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

    /**
     * 获取状态文本
     */
    getStatusText(status) {
      const map = {
        pending: '待处理',
        processing: '处理中',
        replied: '已回复',
        closed: '已关闭'
      }
      return map[status] || status || '未知'
    },

    /**
     * 获取分类徽章 HTML
     */
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

    /**
     * 格式化日期
     */
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
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('feedbacksPage', feedbacksPage)
  console.log('✅ [FeedbacksPage] Alpine 组件已注册 (Mixin v3.0)')
})
