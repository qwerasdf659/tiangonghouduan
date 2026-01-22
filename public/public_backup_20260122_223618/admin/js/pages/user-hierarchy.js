/**
 * User Hierarchy Page - Alpine.js Mixin 重构版
 * 用户层级管理页面组件
 * 
 * @file public/admin/js/pages/user-hierarchy.js
 * @description 用户层级关系管理、下级查看、激活/停用等功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * 
 * 重构说明：
 * - 使用 createCrudMixin 组合多个 Mixin
 * - 减少约 80 行重复代码
 * - 保留所有原有业务功能
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('userHierarchyPage', () => ({
    // ==================== Mixin 组合 ====================
    ...createCrudMixin({ pageSize: 20 }),
    
    // ==================== 页面特有状态 ====================
    
    /** 层级列表 */
    hierarchyList: [],
    
    /** 角色列表 */
    rolesList: [],
    
    /** 筛选条件 */
    filters: {
      roleLevel: '',
      status: '',
      superiorId: ''
    },
    
    /** 统计数据 */
    stats: {
      total: 0,
      active: 0,
      inactive: 0,
      storeAssigned: 0
    },
    
    /** 创建表单 */
    form: {
      userId: '',
      roleId: '',
      superiorId: '',
      storeId: ''
    },
    
    /** 停用表单 */
    deactivateForm: {
      userId: null,
      userInfo: '',
      reason: '',
      includeSubordinates: false
    },
    
    /** 下级列表 */
    subordinates: [],
    
    /** 下级加载状态 */
    subordinatesLoading: false,

    // ==================== 生命周期 ====================

    init() {
      console.log('✅ 用户层级管理页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }
      
      this.loadRoles()
      this.loadData()
    },

    // ==================== 数据加载方法 ====================

    /**
     * 加载角色列表
     */
    async loadRoles() {
      const result = await this.apiGet(API_ENDPOINTS.USER_HIERARCHY.ROLES, {}, { showError: false })
      if (result.success) {
        this.rolesList = result.data || []
      }
    },

    /**
     * 加载层级列表（主数据加载方法）
     */
    async loadData() {
      const result = await this.withLoading(async () => {
        const params = {
          ...this.buildPaginationParams()
        }

        if (this.filters.roleLevel) params.role_level = this.filters.roleLevel
        if (this.filters.status) params.is_active = this.filters.status
        if (this.filters.superiorId) params.superior_user_id = this.filters.superiorId

        const response = await apiRequest(
          `${API_ENDPOINTS.USER_HIERARCHY.LIST}?${new URLSearchParams(params)}`
        )

        if (response && response.success) {
          return response.data
        } else {
          throw new Error(response?.message || '加载层级列表失败')
        }
      })

      if (result.success) {
        this.hierarchyList = result.data.rows || []
        
        // 更新分页信息
        this.totalRecords = result.data.count || 0
        if (result.data.pagination?.total_pages) {
          // 后端直接提供了总页数
        }
        
        this._updateStatistics(result.data)
      }
    },

    /**
     * 更新统计信息（私有方法）
     */
    _updateStatistics(data) {
      const rows = data.rows || []
      this.stats.total = data.count || 0
      this.stats.active = rows.filter(r => r.is_active).length
      this.stats.inactive = rows.filter(r => !r.is_active).length
      this.stats.storeAssigned = rows.filter(r => r.store_id).length
    },

    // ==================== 筛选方法 ====================

    /**
     * 应用筛选
     */
    applyFilters() {
      this.resetPagination()
      this.loadData()
    },

    /**
     * 重置筛选
     */
    resetFilters() {
      this.filters = {
        roleLevel: '',
        status: '',
        superiorId: ''
      }
      this.resetPagination()
      this.loadData()
    },

    // ==================== 业务方法 ====================

    /**
     * 格式化日期
     */
    formatDate(dateValue) {
      if (!dateValue) return '-'
      if (typeof dateValue === 'object' && dateValue.beijing) {
        return dateValue.beijing
      }
      if (typeof dateValue === 'string') {
        return new Date(dateValue).toLocaleString('zh-CN')
      }
      return '-'
    },

    /**
     * 打开创建模态框
     */
    openCreateModal() {
      this.form = { userId: '', roleId: '', superiorId: '', storeId: '' }
      this.showModal('hierarchyModal')
    },

    /**
     * 保存层级关系
     */
    async saveHierarchy() {
      if (!this.form.userId || !this.form.roleId) {
        this.showWarning('请填写必填字段')
        return
      }

      const result = await this.apiPost(
        API_ENDPOINTS.USER_HIERARCHY.CREATE,
        {
          user_id: parseInt(this.form.userId),
          role_id: parseInt(this.form.roleId),
          superior_user_id: this.form.superiorId ? parseInt(this.form.superiorId) : null,
          store_id: this.form.storeId ? parseInt(this.form.storeId) : null
        },
        { showSuccess: true, successMessage: '创建层级关系成功' }
      )

      if (result.success) {
        this.hideModal('hierarchyModal')
        this.loadData()
      }
    },

    /**
     * 查看下级
     */
    async viewSubordinates(userId) {
      this.subordinatesLoading = true
      this.subordinates = []
      this.showModal('subordinatesModal')

      const result = await this.withLoading(async () => {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.USER_HIERARCHY.SUBORDINATES, { user_id: userId })
        )
        if (response.success) {
          return response.data.subordinates || []
        }
        throw new Error(response.message || '加载下级失败')
      }, { showError: true })

      this.subordinatesLoading = false
      
      if (result.success) {
        this.subordinates = result.data
      }
    },

    /**
     * 打开停用模态框
     */
    openDeactivateModal(userId, userInfo) {
      this.deactivateForm = {
        userId: userId,
        userInfo: `${userInfo} (ID: ${userId})`,
        reason: '',
        includeSubordinates: false
      }
      this.showModal('deactivateModal')
    },

    /**
     * 确认停用
     */
    async confirmDeactivate() {
      if (!this.deactivateForm.reason.trim()) {
        this.showWarning('请填写停用原因')
        return
      }

      const result = await this.apiPost(
        API.buildURL(API_ENDPOINTS.USER_HIERARCHY.DEACTIVATE, { user_id: this.deactivateForm.userId }),
        {
          reason: this.deactivateForm.reason,
          include_subordinates: this.deactivateForm.includeSubordinates
        },
        { global: true }
      )

      if (result.success) {
        this.showSuccess(`成功停用 ${result.data.deactivated_count} 个用户的权限`)
        this.hideModal('deactivateModal')
        this.loadData()
      }
    },

    /**
     * 激活用户
     */
    async activateUser(userId) {
      const result = await this.confirmAndExecute(
        '确定要激活该用户的层级权限吗？',
        async () => {
          const response = await apiRequest(
            API.buildURL(API_ENDPOINTS.USER_HIERARCHY.ACTIVATE, { user_id: userId }),
            {
              method: 'POST',
              body: JSON.stringify({ include_subordinates: false })
            }
          )
          if (response.success) {
            return response.data
          }
          throw new Error(response.message || '激活失败')
        },
        { showSuccess: true, successMessage: '激活成功' }
      )

      if (result.success) {
        this.loadData()
      }
    },

    /**
     * 导出数据 - 导出用户层级数据为CSV
     */
    exportData() {
      try {
        if (!this.hierarchyList || this.hierarchyList.length === 0) {
          this.showWarning('没有可导出的数据')
          return
        }
        
        // 构建导出数据
        const exportData = []
        
        // 添加汇总统计
        exportData.push(['====== 用户层级统计 ======'])
        exportData.push(['指标', '数值'])
        exportData.push(['总数', this.stats.total || 0])
        exportData.push(['活跃', this.stats.active || 0])
        exportData.push(['停用', this.stats.inactive || 0])
        exportData.push(['已分配门店', this.stats.storeAssigned || 0])
        exportData.push([''])
        
        // 添加明细数据
        exportData.push(['====== 用户层级明细 ======'])
        exportData.push(['用户ID', '用户名', '昵称', '角色', '上级ID', '上级名称', '门店', '状态', '创建时间'])
        
        this.hierarchyList.forEach(item => {
          exportData.push([
            item.user_id || item.userId || '-',
            item.username || '-',
            item.nickname || item.user_nickname || '-',
            item.role_name || item.roleName || '-',
            item.superior_id || item.superiorId || '-',
            item.superior_name || item.superiorName || '-',
            item.store_name || item.storeName || '-',
            item.status === 'active' ? '活跃' : '停用',
            item.created_at || item.createdAt || '-'
          ])
        })
        
        // 生成CSV内容
        const csvContent = exportData.map(row => 
          row.map(cell => {
            // 处理包含逗号或引号的单元格
            const cellStr = String(cell)
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`
            }
            return cellStr
          }).join(',')
        ).join('\n')
        
        // 添加BOM以支持中文Excel打开
        const BOM = '\uFEFF'
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
        
        // 生成下载链接
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        const now = new Date()
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
        
        link.setAttribute('href', url)
        link.setAttribute('download', `用户层级数据_${dateStr}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        
        this.showSuccess('导出成功')
      } catch (error) {
        console.error('导出失败:', error)
        this.showError('导出失败: ' + error.message)
      }
    }
  }))

  console.log('✅ [UserHierarchy] Alpine 组件已注册 (Mixin v3.0)')
})
