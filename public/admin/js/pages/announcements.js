/**
 * 公告管理页面 - Alpine.js 版本
 * @file public/admin/js/pages/announcements.js
 */

function announcementsPage() {
  return {
    // ========== 状态 ==========
    userInfo: null,
    loading: false,
    globalLoading: false,
    saving: false,
    
    announcements: [],
    currentPage: 1,
    pageSize: 20,
    editingId: null,
    
    // 分页信息
    pagination: {
      totalPages: 1,
      total: 0
    },
    
    // 筛选条件
    filters: {
      status: '',
      type: '',
      keyword: ''
    },
    
    // 表单数据
    form: {
      title: '',
      type: 'notice',
      status: 'active',
      content: '',
      priority: 'medium',
      expiresAt: ''
    },
    
    // 模态框实例
    modalInstance: null,

    // ========== 初始化 ==========
    init() {
      console.log('[AnnouncementsPage] 初始化')
      
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
        this.modalInstance = new bootstrap.Modal(this.$refs.announcementModal)
      })
      
      this.loadAnnouncements()
    },

    // ========== 数据加载 ==========
    handleSearch() {
      this.currentPage = 1
      this.loadAnnouncements()
    },

    async loadAnnouncements() {
      this.loading = true

      try {
        const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize
        })

        if (this.filters.status) params.append('status', this.filters.status)
        if (this.filters.type) params.append('type', this.filters.type)
        if (this.filters.keyword) params.append('keyword', this.filters.keyword)

        const response = await apiRequest(`${API_ENDPOINTS.ANNOUNCEMENT.LIST}?${params}`)

        if (response?.success) {
          this.announcements = response.data?.announcements || response.data?.list || []
          
          if (response.data?.pagination) {
            this.pagination = {
              totalPages: response.data.pagination.total_pages || 1,
              total: response.data.pagination.total || 0
            }
          }
        } else {
          alert('❌ ' + (response?.message || '加载失败'))
        }
      } catch (error) {
        console.error('加载公告列表失败', error)
        alert('❌ 加载失败，请稍后重试')
      } finally {
        this.loading = false
      }
    },

    changePage(page) {
      this.currentPage = page
      this.loadAnnouncements()
    },

    // ========== 新增/编辑 ==========
    openAddModal() {
      this.editingId = null
      this.form = {
        title: '',
        type: 'notice',
        status: 'active',
        content: '',
        priority: 'medium',
        expiresAt: ''
      }
      this.modalInstance.show()
    },

    async editAnnouncement(item) {
      this.globalLoading = true

      try {
        const id = item.announcement_id || item.id
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.ANNOUNCEMENT.DETAIL, { id }))

        if (response?.success) {
          const data = response.data?.announcement || response.data
          this.editingId = id
          this.form = {
            title: data.title || '',
            type: data.type || 'notice',
            status: data.is_active ? 'active' : 'inactive',
            content: data.content || '',
            priority: data.priority || 'medium',
            expiresAt: this.formatDateTimeLocal(data.expires_at)
          }
          this.modalInstance.show()
        } else {
          alert('❌ ' + (response?.message || '获取公告详情失败'))
        }
      } catch (error) {
        console.error('获取公告详情失败', error)
        alert('❌ 获取失败，请稍后重试')
      } finally {
        this.globalLoading = false
      }
    },

    async handleSubmit() {
      if (!this.form.title.trim()) {
        alert('❌ 请输入公告标题')
        return
      }
      if (!this.form.content.trim()) {
        alert('❌ 请输入公告内容')
        return
      }

      this.saving = true

      try {
        const payload = {
          title: this.form.title.trim(),
          content: this.form.content.trim(),
          type: this.form.type,
          priority: this.form.priority,
          is_active: this.form.status === 'active',
          expires_at: this.form.expiresAt || null
        }

        let response
        if (this.editingId) {
          response = await apiRequest(API.buildURL(API_ENDPOINTS.ANNOUNCEMENT.UPDATE, { id: this.editingId }), {
            method: 'PUT',
            body: JSON.stringify(payload)
          })
        } else {
          response = await apiRequest(API_ENDPOINTS.ANNOUNCEMENT.CREATE, {
            method: 'POST',
            body: JSON.stringify(payload)
          })
        }

        if (response?.success) {
          alert('✅ ' + (this.editingId ? '更新成功' : '发布成功'))
          this.modalInstance.hide()
          this.loadAnnouncements()
        } else {
          alert('❌ ' + (response?.message || '操作失败'))
        }
      } catch (error) {
        console.error('保存公告失败', error)
        alert('❌ 保存失败，请稍后重试')
      } finally {
        this.saving = false
      }
    },

    // ========== 删除 ==========
    async deleteAnnouncement(item) {
      if (!confirm('确定要删除这条公告吗？此操作不可恢复。')) {
        return
      }

      this.globalLoading = true

      try {
        const id = item.announcement_id || item.id
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.ANNOUNCEMENT.DELETE, { id }), {
          method: 'DELETE'
        })

        if (response?.success) {
          alert('✅ 删除成功')
          this.loadAnnouncements()
        } else {
          alert('❌ ' + (response?.message || '删除失败'))
        }
      } catch (error) {
        console.error('删除公告失败', error)
        alert('❌ 删除失败，请稍后重试')
      } finally {
        this.globalLoading = false
      }
    },

    // ========== 工具方法 ==========
    getStatusBadge(isActive) {
      if (isActive === true) {
        return '<span class="badge bg-success">已发布</span>'
      }
      return '<span class="badge bg-secondary">已下线</span>'
    },

    getTypeBadge(type) {
      const map = {
        system: '<span class="badge bg-primary">系统</span>',
        activity: '<span class="badge bg-success">活动</span>',
        maintenance: '<span class="badge bg-warning">维护</span>',
        notice: '<span class="badge bg-info">通知</span>'
      }
      return map[type] || `<span class="badge bg-secondary">${type || '-'}</span>`
    },

    getPriorityBadge(priority) {
      const map = {
        high: '<span class="badge bg-danger">高</span>',
        medium: '<span class="badge bg-warning">中</span>',
        low: '<span class="badge bg-secondary">低</span>'
      }
      return map[priority] || `<span class="badge bg-secondary">${priority || '-'}</span>`
    },

    formatDateSafe(dateStr) {
      if (!dateStr) return '-'
      
      // 如果是中文格式，简化显示
      if (typeof dateStr === 'string' && dateStr.includes('年')) {
        return dateStr.replace(/星期[一二三四五六日]/, '').trim()
      }
      
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return dateStr
      }
    },

    formatDateTimeLocal(dateStr) {
      if (!dateStr) return ''
      
      // 处理中文格式日期
      if (typeof dateStr === 'string' && dateStr.includes('年')) {
        const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日.*?(\d{1,2}):(\d{1,2})/)
        if (match) {
          const [, year, month, day, hour, minute] = match
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
        }
        return ''
      }
      
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return ''
        return date.toISOString().slice(0, 16)
      } catch {
        return ''
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
  Alpine.data('announcementsPage', announcementsPage)
  console.log('✅ [AnnouncementsPage] Alpine 组件已注册')
})

console.log('📦 公告管理页面 (Alpine.js) 已加载')
