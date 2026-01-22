/**
 * 用户管理页面 - Alpine.js 版本
 *
 * @file public/admin/js/pages/users.js
 * @description 用户列表、详情、角色管理、封禁解封、概率调整等功能
 * @version 2.0.0 (Alpine.js 重构版)
 * @date 2026-01-22
 */

/**
 * 用户管理页面 Alpine.js 组件
 */
function usersPage() {
  return {
    // ==================== 状态数据 ====================
    
    /** 用户信息 */
    userInfo: null,
    
    /** 用户列表 */
    users: [],
    
    /** 加载状态 */
    loading: true,
    
    /** 全局加载状态（遮罩层） */
    globalLoading: false,
    
    /** 当前页码 */
    currentPage: 1,
    
    /** 每页显示数量 */
    pageSize: 20,
    
    /** 总记录数 */
    totalRecords: 0,
    
    /** 总页数 */
    totalPages: 0,
    
    /** 筛选条件 */
    filters: {
      userType: 'all',
      status: 'all',
      search: ''
    },
    
    /** 统计数据 */
    statistics: {
      totalUsers: 0,
      todayUsers: 0,
      activeUsers: 0,
      vipUsers: 0
    },
    
    /** 可用角色列表 */
    availableRoles: [],
    
    /** 当前操作的用户ID */
    currentUserId: null,
    
    /** 选中的用户详情 */
    selectedUser: null,
    
    /** 选中的角色名称 */
    selectedRoleName: '',
    
    /** 所有奖品数据 */
    allPrizes: [],
    
    /** 概率调整模态框数据 */
    probabilityModal: {
      userId: null,
      userMobile: '',
      mode: 'global',
      multiplier: 2.0,
      targetPrizeId: '',
      customProbability: 50,
      duration: 60,
      reason: ''
    },
    
    /** 概率预览HTML */
    probabilityPreviewHtml: '<p class="text-muted mb-0">请选择奖品并设置概率</p>',
    
    /** 默认头像 */
    defaultAvatar: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+',
    
    // ==================== 计算属性 ====================
    
    /** 分页页码数组 */
    get paginationPages() {
      if (this.totalPages <= 1) return []
      
      const pages = []
      const maxPages = 7
      let startPage = Math.max(1, this.currentPage - Math.floor(maxPages / 2))
      let endPage = Math.min(this.totalPages, startPage + maxPages - 1)
      
      if (endPage - startPage < maxPages - 1) {
        startPage = Math.max(1, endPage - maxPages + 1)
      }
      
      if (startPage > 1) {
        pages.push(1)
        if (startPage > 2) pages.push('...')
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i)
      }
      
      if (endPage < this.totalPages) {
        if (endPage < this.totalPages - 1) pages.push('...')
        pages.push(this.totalPages)
      }
      
      return pages
    },
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 用户管理页面 Alpine.js 组件初始化')
      
      // 获取用户信息
      this.userInfo = getCurrentUser()
      
      // Token和权限验证
      if (!getToken() || !checkAdminPermission()) {
        return
      }
      
      // 加载初始数据
      this.loadAvailableRoles()
      this.loadUsers()
    },
    
    // ==================== 数据加载方法 ====================
    
    /**
     * 加载可用角色列表
     */
    async loadAvailableRoles() {
      try {
        const response = await apiRequest(API_ENDPOINTS.ROLE.LIST)
        if (response && response.success) {
          this.availableRoles = response.data.roles || response.data.list || []
        }
      } catch (error) {
        console.error('加载角色列表失败:', error)
      }
    },
    
    /**
     * 加载用户列表
     */
    async loadUsers() {
      this.loading = true
      
      try {
        // 构建查询参数
        const params = new URLSearchParams({
          page: this.currentPage,
          limit: this.pageSize
        })
        
        if (this.filters.userType !== 'all') {
          params.append('type', this.filters.userType)
        }
        
        if (this.filters.status !== 'all') {
          params.append('status', this.filters.status)
        }
        
        if (this.filters.search) {
          params.append('search', this.filters.search)
        }
        
        const response = await apiRequest(API_ENDPOINTS.USER.LIST + '?' + params.toString())
        
        if (response && response.success) {
          this.users = response.data.users || response.data.list || []
          this.totalRecords = response.data.total || response.data.pagination?.total || this.users.length
          this.totalPages = Math.ceil(this.totalRecords / this.pageSize)
          
          // 更新统计数据
          this.updateStatistics(response.data)
        } else {
          this.showError(response?.message || '获取数据失败')
        }
      } catch (error) {
        console.error('加载用户失败:', error)
        this.showError(error.message)
      } finally {
        this.loading = false
      }
    },
    
    /**
     * 更新统计信息
     */
    updateStatistics(data) {
      const stats = data.statistics || {}
      this.statistics.totalUsers = stats.total_users ?? data.pagination?.total ?? 0
      this.statistics.todayUsers = stats.today_new ?? 0
      this.statistics.activeUsers = stats.active_users ?? 0
      this.statistics.vipUsers = stats.vip_users ?? 0
    },
    
    // ==================== 筛选和分页方法 ====================
    
    /**
     * 重置筛选器
     */
    resetFilters() {
      this.filters = {
        userType: 'all',
        status: 'all',
        search: ''
      }
      this.currentPage = 1
      this.loadUsers()
    },
    
    /**
     * 切换页码
     */
    changePage(page) {
      if (page < 1 || page > this.totalPages || page === this.currentPage) return
      this.currentPage = page
      this.loadUsers()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    
    // ==================== 用户操作方法 ====================
    
    /**
     * 查看用户详情
     */
    async viewUserDetail(userId) {
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER.DETAIL, { user_id: userId }))
        
        if (response && response.success) {
          this.selectedUser = response.data.user || response.data
          new bootstrap.Modal(this.$refs.userDetailModal).show()
        } else {
          this.showError(response?.message || '获取用户详情失败')
        }
      } catch (error) {
        console.error('获取用户详情失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 管理用户角色
     */
    async manageRoles(userId) {
      this.currentUserId = userId
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER.DETAIL, { user_id: userId }))
        
        if (response && response.success) {
          const user = response.data.user || response.data
          const userRoles = user.roles || []
          
          // 设置当前选中的角色
          if (userRoles.length > 0) {
            const firstRole = userRoles[0]
            this.selectedRoleName = typeof firstRole === 'string' ? firstRole : firstRole.role_name
          } else {
            this.selectedRoleName = ''
          }
          
          new bootstrap.Modal(this.$refs.roleModal).show()
        } else {
          this.showError(response?.message || '获取用户角色失败')
        }
      } catch (error) {
        console.error('获取用户角色失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 保存用户角色
     */
    async saveUserRoles() {
      if (!this.selectedRoleName) {
        this.showError('请选择一个角色')
        return
      }
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.USER.UPDATE_ROLE, { user_id: this.currentUserId }),
          {
            method: 'PUT',
            body: JSON.stringify({
              role_name: this.selectedRoleName,
              reason: '管理员手动更新角色'
            })
          }
        )
        
        if (response && response.success) {
          this.showSuccess('用户角色已更新')
          bootstrap.Modal.getInstance(this.$refs.roleModal).hide()
          this.loadUsers()
        } else {
          this.showError(response?.message || '操作失败')
        }
      } catch (error) {
        console.error('保存角色失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 封禁用户
     */
    async banUser(userId) {
      if (!confirm('确认封禁该用户？封禁后用户将无法登录和使用系统功能。')) {
        return
      }
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER.UPDATE_STATUS, { user_id: userId }), {
          method: 'PUT',
          body: JSON.stringify({
            status: 'banned',
            reason: '管理员手动封禁'
          })
        })
        
        if (response && response.success) {
          this.showSuccess('用户已被封禁')
          this.loadUsers()
        } else {
          this.showError(response?.message || '封禁失败')
        }
      } catch (error) {
        console.error('封禁用户失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 解封用户
     */
    async unbanUser(userId) {
      if (!confirm('确认解封该用户？解封后用户可以正常登录和使用系统功能。')) {
        return
      }
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER.UPDATE_STATUS, { user_id: userId }), {
          method: 'PUT',
          body: JSON.stringify({
            status: 'active',
            reason: '管理员手动解封'
          })
        })
        
        if (response && response.success) {
          this.showSuccess('用户已解封')
          this.loadUsers()
        } else {
          this.showError(response?.message || '解封失败')
        }
      } catch (error) {
        console.error('解封用户失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    // ==================== 概率调整方法 ====================
    
    /**
     * 打开概率调整模态框
     */
    async openProbabilityModal(userId, userMobile) {
      this.probabilityModal.userId = userId
      this.probabilityModal.userMobile = userMobile
      this.probabilityModal.mode = 'global'
      this.probabilityModal.multiplier = 2.0
      this.probabilityModal.targetPrizeId = ''
      this.probabilityModal.customProbability = 50
      this.probabilityModal.duration = 60
      this.probabilityModal.reason = ''
      this.probabilityPreviewHtml = '<p class="text-muted mb-0">请选择奖品并设置概率</p>'
      
      await this.loadPrizesForProbability()
      
      new bootstrap.Modal(this.$refs.probabilityModal).show()
    },
    
    /**
     * 加载奖品列表（用于特定奖品调整）
     */
    async loadPrizesForProbability() {
      try {
        const response = await apiRequest(API_ENDPOINTS.PRIZE.LIST + '?campaign_code=BASIC_LOTTERY')
        
        if (response && response.success) {
          this.allPrizes = response.data.prizes || []
        }
      } catch (error) {
        console.error('加载奖品列表失败:', error)
      }
    },
    
    /**
     * 更新概率预览
     */
    updateProbabilityPreview() {
      const selectedPrizeId = parseInt(this.probabilityModal.targetPrizeId)
      const newProbability = parseFloat(this.probabilityModal.customProbability) / 100
      
      if (!selectedPrizeId || !newProbability) {
        this.probabilityPreviewHtml = '<p class="text-muted mb-0">请选择奖品并设置概率</p>'
        return
      }
      
      const targetPrize = this.allPrizes.find(p => p.prize_id === selectedPrizeId)
      if (!targetPrize) return
      
      const otherPrizesTotalProb = this.allPrizes
        .filter(p => p.prize_id !== selectedPrizeId)
        .reduce((sum, p) => sum + parseFloat(p.win_probability || 0), 0)
      
      const remainingProb = 1.0 - newProbability
      const scaleFactor = otherPrizesTotalProb > 0 ? remainingProb / otherPrizesTotalProb : 0
      
      let previewHtml = '<table class="table table-sm mb-0">'
      previewHtml += '<thead><tr><th>奖品</th><th>原概率</th><th>→</th><th>新概率</th></tr></thead>'
      previewHtml += '<tbody>'
      
      this.allPrizes.forEach(prize => {
        const originalProb = parseFloat(prize.win_probability || 0)
        let adjustedProb
        let isTarget = false
        
        if (prize.prize_id === selectedPrizeId) {
          adjustedProb = newProbability
          isTarget = true
        } else {
          adjustedProb = originalProb * scaleFactor
        }
        
        const className = isTarget ? 'table-info' : ''
        previewHtml += `
          <tr class="${className}">
            <td>${prize.prize_name}${isTarget ? ' 🎯' : ''}</td>
            <td>${(originalProb * 100).toFixed(1)}%</td>
            <td><i class="bi bi-arrow-right"></i></td>
            <td class="fw-bold ${isTarget ? 'text-info' : ''}">${(adjustedProb * 100).toFixed(1)}%</td>
          </tr>
        `
      })
      
      const totalAdjusted = this.allPrizes.reduce((sum, prize) => {
        if (prize.prize_id === selectedPrizeId) return sum + newProbability
        const originalProb = parseFloat(prize.win_probability || 0)
        return sum + originalProb * scaleFactor
      }, 0)
      
      previewHtml += `
        <tr class="table-light fw-bold">
          <td>总计</td>
          <td>100%</td>
          <td></td>
          <td>${(totalAdjusted * 100).toFixed(1)}%</td>
        </tr>
      `
      previewHtml += '</tbody></table>'
      
      this.probabilityPreviewHtml = previewHtml
    },
    
    /**
     * 保存概率调整设置
     */
    async saveProbabilityAdjustment() {
      if (!this.probabilityModal.userId) {
        this.showError('未选择用户')
        return
      }
      
      let requestData = {
        user_id: this.probabilityModal.userId,
        duration_minutes: parseInt(this.probabilityModal.duration),
        reason: this.probabilityModal.reason || '管理员概率调整'
      }
      
      if (this.probabilityModal.mode === 'global') {
        const multiplier = parseFloat(this.probabilityModal.multiplier)
        if (!multiplier || multiplier < 0.1 || multiplier > 10) {
          this.showError('概率倍数必须在0.1-10之间')
          return
        }
        requestData.probability_multiplier = multiplier
      } else {
        const prizeId = parseInt(this.probabilityModal.targetPrizeId)
        const customProb = parseFloat(this.probabilityModal.customProbability) / 100
        
        if (!prizeId) {
          this.showError('请选择要调整的奖品')
          return
        }
        
      if (!customProb || customProb < 0.01 || customProb > 1.0) {
        this.showError('自定义概率必须在1%-100%之间')
        return
      }
        
        requestData.prize_id = prizeId
        requestData.custom_probability = customProb
      }
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API_ENDPOINTS.PROBABILITY.ADJUST, {
          method: 'POST',
          body: JSON.stringify(requestData)
        })
        
        if (response && response.success) {
          this.showSuccess(response.message || '用户概率调整成功')
          bootstrap.Modal.getInstance(this.$refs.probabilityModal).hide()
        } else {
          this.showError(response?.message || '概率调整失败')
        }
      } catch (error) {
        console.error('概率调整失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    // ==================== 渲染辅助方法 ====================
    
    /**
     * 渲染角色徽章
     */
    renderRoleBadges(roles, roleLevel = 0) {
      if (!roles || roles.length === 0) {
        return '<span class="text-muted small">无角色</span>'
      }
      
      const bgColor = roleLevel >= 100 ? 'bg-danger' : roleLevel >= 50 ? 'bg-warning' : 'bg-secondary'
      
      return roles
        .map(roleName => {
          const name = typeof roleName === 'string' ? roleName : roleName.role_name
          return `<span class="badge ${bgColor} role-badge">${name}</span>`
        })
        .join(' ')
    },
    
    /**
     * 渲染状态徽章
     */
    renderStatusBadge(status) {
      const badges = {
        active: '<span class="badge bg-success"><i class="bi bi-check-circle"></i> 正常</span>',
        banned: '<span class="badge bg-danger"><i class="bi bi-x-circle"></i> 已封禁</span>'
      }
      return badges[status] || '<span class="badge bg-secondary">未知</span>'
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 格式化数字
     */
    formatNumber(num) {
      if (num === null || num === undefined || num === '-') return '-'
      return Number(num).toLocaleString()
    },
    
    /**
     * 格式化日期
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return typeof window.formatDate === 'function' ? window.formatDate(dateStr) : new Date(dateStr).toLocaleString('zh-CN')
    },
    
    /**
     * 格式化相对时间
     */
    formatRelativeTime(dateStr) {
      if (!dateStr) return ''
      return typeof window.formatRelativeTime === 'function' ? window.formatRelativeTime(dateStr) : ''
    },
    
    /**
     * 手机号脱敏
     */
    maskPhone(phone) {
      if (!phone || phone === '-') return '-'
      return typeof window.maskPhone === 'function' ? window.maskPhone(phone) : phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
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
    logout() {
      if (typeof window.logout === 'function') {
        window.logout()
      }
    }
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('usersPage', usersPage)
})
