/**
 * 会话管理页面 - Alpine.js 版本
 *
 * @file public/admin/js/pages/sessions.js
 * @description 会话列表、筛选、撤销、清理等功能
 * @version 2.0.0 (Alpine.js 重构版)
 * @date 2026-01-22
 */

/**
 * 会话管理页面 Alpine.js 组件
 */
function sessionsPage() {
  return {
    // ==================== 状态数据 ====================
    
    /** 用户信息 */
    userInfo: null,
    
    /** 会话列表 */
    sessions: [],
    
    /** 选中的会话ID列表 */
    selectedSessions: [],
    
    /** 当前选中查看的会话 */
    selectedSession: null,
    
    /** 加载状态 */
    loading: true,
    
    /** 全局加载状态 */
    globalLoading: false,
    
    /** 当前页码 */
    currentPage: 1,
    
    /** 每页显示数量 */
    pageSize: 20,
    
    /** 总页数 */
    totalPages: 1,
    
    /** 当前用户会话ID */
    currentSessionId: null,
    
    /** 筛选条件 */
    filters: {
      status: '',
      userType: '',
      userId: '',
      sortBy: 'last_activity'
    },
    
    /** 统计数据 */
    statistics: {
      onlineUsers: '-',
      activeSessions: '-',
      userSessions: '-',
      adminSessions: '-'
    },
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 会话管理页面 Alpine.js 组件初始化')
      
      // 获取用户信息
      this.userInfo = getCurrentUser()
      
      // 获取当前会话ID
      const token = localStorage.getItem('admin_token')
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          this.currentSessionId = payload.session_id
        } catch (e) {
          console.error('解析token失败:', e)
        }
      }
      
      // 加载会话列表
      this.loadSessions()
    },
    
    // ==================== 数据加载方法 ====================
    
    /**
     * 加载会话列表
     */
    async loadSessions(page = 1) {
      this.loading = true
      this.currentPage = page
      this.selectedSessions = []
      
      try {
        const params = new URLSearchParams()
        params.append('page', page)
        params.append('page_size', this.pageSize)
        params.append('sort_by', this.filters.sortBy)
        params.append('sort_order', 'desc')
        
        if (this.filters.status === 'active') {
          params.append('is_active', 'true')
        } else if (this.filters.status === 'expired') {
          params.append('is_active', 'false')
        }
        
        if (this.filters.userType) {
          params.append('user_type', this.filters.userType)
        }
        
        if (this.filters.userId) {
          params.append('user_id', this.filters.userId)
        }
        
        const url = API_ENDPOINTS.SESSIONS.LIST + '?' + params.toString()
        const response = await apiRequest(url)
        
        if (response && response.success) {
          this.sessions = response.data.sessions || response.data || []
          this.totalPages = response.data.pagination?.total_pages || 1
          this.loadStats()
        } else {
          this.showError('加载失败', response?.message || '获取会话列表失败')
        }
      } catch (error) {
        console.error('加载会话失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
      }
    },
    
    /**
     * 加载统计数据
     */
    async loadStats() {
      try {
        const response = await apiRequest(API_ENDPOINTS.SESSIONS.STATS)
        if (response && response.success) {
          const stats = response.data
          const userStats = stats.by_user_type?.user || { active_sessions: 0, unique_users: 0 }
          const adminStats = stats.by_user_type?.admin || { active_sessions: 0, unique_users: 0 }
          
          this.statistics = {
            onlineUsers: (userStats.unique_users || 0) + (adminStats.unique_users || 0),
            activeSessions: stats.total_active_sessions || 0,
            userSessions: userStats.active_sessions || 0,
            adminSessions: adminStats.active_sessions || 0
          }
        }
      } catch (error) {
        console.error('加载统计数据失败:', error)
      }
    },
    
    // ==================== 会话操作方法 ====================
    
    /**
     * 查看会话详情
     */
    viewSessionDetail(session) {
      this.selectedSession = session
      new bootstrap.Modal(this.$refs.sessionDetailModal).show()
    },
    
    /**
     * 从模态框撤销会话
     */
    revokeSessionFromModal() {
      if (this.selectedSession) {
        const sessionId = this.selectedSession.user_session_id || this.selectedSession.session_id
        bootstrap.Modal.getInstance(this.$refs.sessionDetailModal).hide()
        this.revokeSession(sessionId)
      }
    },
    
    /**
     * 撤销单个会话
     */
    async revokeSession(sessionId) {
      if (String(sessionId) === String(this.currentSessionId)) {
        alert('无法撤销当前会话')
        return
      }
      
      if (!confirm('确定要撤销此会话吗？用户将被强制下线。')) return
      
      this.globalLoading = true
      
      try {
        const url = `/api/v4/console/sessions/${sessionId}/deactivate`
        const response = await apiRequest(url, { method: 'POST' })
        
        if (response && response.success) {
          alert('✅ 会话已撤销')
          this.loadSessions(this.currentPage)
        } else {
          this.showError('撤销失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('撤销会话失败:', error)
        this.showError('撤销失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 批量撤销选中的会话
     */
    async revokeSelected() {
      const selected = this.selectedSessions.filter(id => String(id) !== String(this.currentSessionId))
      
      if (selected.length === 0) {
        alert('请选择要撤销的会话')
        return
      }
      
      if (!confirm(`确定要撤销选中的 ${selected.length} 个会话吗？`)) return
      
      this.globalLoading = true
      
      try {
        let successCount = 0
        for (const sessionId of selected) {
          try {
            const url = `/api/v4/console/sessions/${sessionId}/deactivate`
            const response = await apiRequest(url, { method: 'POST' })
            if (response && response.success) successCount++
          } catch (e) {
            console.error(`撤销会话 ${sessionId} 失败:`, e)
          }
        }
        
        alert(`✅ 批量撤销完成：成功 ${successCount}/${selected.length} 个`)
        this.loadSessions(this.currentPage)
      } catch (error) {
        console.error('批量撤销失败:', error)
        this.showError('撤销失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 清理过期会话
     */
    async revokeExpired() {
      if (!confirm('确定要清理所有已过期的会话吗？')) return
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API_ENDPOINTS.SESSIONS.CLEANUP, { method: 'POST' })
        
        if (response && response.success) {
          const count = response.data.deleted_count || response.data.count || 0
          alert(`✅ 已清理 ${count} 个过期会话`)
          this.loadSessions(this.currentPage)
        } else {
          this.showError('清理失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('清理过期会话失败:', error)
        this.showError('清理失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 强制下线其他设备
     */
    async revokeAllExceptCurrent() {
      if (!confirm('确定要强制下线所有其他设备吗？')) return
      
      if (!this.userInfo || !this.userInfo.user_id) {
        this.showError('操作失败', '无法获取当前用户信息')
        return
      }
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest('/api/v4/console/sessions/deactivate-user', {
          method: 'POST',
          body: JSON.stringify({
            user_type: this.userInfo.is_admin ? 'admin' : 'user',
            user_id: this.userInfo.user_id,
            reason: '用户主动下线其他设备'
          })
        })
        
        if (response && response.success) {
          const count = response.data.affected_count || response.data.count || 0
          alert(`✅ 已撤销 ${count} 个会话`)
          this.loadSessions(this.currentPage)
        } else {
          this.showError('操作失败', response?.message || '撤销失败')
        }
      } catch (error) {
        console.error('撤销其他会话失败:', error)
        this.showError('操作失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 判断是否为当前会话
     */
    isCurrentSession(session) {
      if (!session) return false
      const sessionId = session.user_session_id || session.session_id
      return String(sessionId) === String(this.currentSessionId)
    },
    
    /**
     * 获取会话状态
     */
    getSessionStatus(session) {
      if (!session) return 'active'
      if (session.is_expired === true) return 'expired'
      if (session.is_active === false) return 'revoked'
      if (session.is_active === true) return 'active'
      return session.status || 'active'
    },
    
    /**
     * 获取状态徽章类名
     */
    getStatusBadgeClass(status) {
      const classes = {
        active: 'bg-success',
        expired: 'bg-warning text-dark',
        revoked: 'bg-danger'
      }
      return classes[status] || 'bg-secondary'
    },
    
    /**
     * 获取状态标签
     */
    getStatusLabel(status) {
      const labels = {
        active: '活跃',
        expired: '已过期',
        revoked: '已撤销'
      }
      return labels[status] || status
    },
    
    /**
     * 获取分页页码数组
     */
    getPaginationPages() {
      const pages = []
      for (let i = 1; i <= this.totalPages; i++) {
        if (i === 1 || i === this.totalPages || (i >= this.currentPage - 2 && i <= this.currentPage + 2)) {
          pages.push(i)
        } else if (pages[pages.length - 1] !== '...') {
          pages.push('...')
        }
      }
      return pages
    },
    
    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },
    
    /**
     * 格式化相对时间
     */
    formatRelativeTime(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date
      
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
      return Math.floor(diff / 86400000) + '天前'
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
  Alpine.data('sessionsPage', sessionsPage)
})

