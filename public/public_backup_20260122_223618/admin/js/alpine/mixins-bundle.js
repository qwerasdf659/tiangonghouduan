/**
 * Alpine.js Mixin 打包文件
 * 
 * 按正确顺序加载所有 Mixin，确保依赖关系正确
 * 
 * @file public/admin/js/alpine/mixins-bundle.js
 * @description 统一加载所有 Mixin 文件
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * 使用方式:
 * <script defer src="/admin/js/alpine/mixins-bundle.js"></script>
 * <script defer src="/admin/js/alpine/init.js"></script>
 * <script defer src="/admin/js/vendor/alpine.min.js"></script>
 */

// ========== 1. 异步数据 Mixin ==========
/**
 * 异步数据加载 Mixin
 * 提供统一的 loading、error、data 状态管理
 * 
 * 重要更新 (2026-01-23):
 * - withLoading 现在始终返回 { success: boolean, data?: any, error?: Error }
 * - 这与 mixins/async-data.js 保持一致
 * - 调用者检查 result.success 来判断是否成功
 */
function asyncDataMixin() {
  return {
    // 状态
    loading: false,
    loadingMessage: '',
    error: null,
    dataLoaded: false,

    // 设置加载状态
    setLoading(loading, message = '加载中...') {
      this.loading = loading
      this.loadingMessage = message
      if (loading) {
        this.error = null
      }
    },

    // 设置错误
    setError(error) {
      this.error = error
      this.loading = false
      console.error('[AsyncData] Error:', error)
    },

    // 清除错误
    clearError() {
      this.error = null
    },

    /**
     * 异步数据加载包装器
     * 
     * @param {Function} asyncFn - 异步函数
     * @param {Object|string} options - 配置选项或加载消息字符串
     * @param {boolean} [options.showError=true] - 是否显示错误 Toast
     * @param {boolean} [options.showSuccess=false] - 是否显示成功 Toast
     * @param {string} [options.successMessage='操作成功'] - 成功提示消息
     * @param {string} [options.errorMessage='操作失败'] - 错误提示消息
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     * 
     * @example
     * const result = await this.withLoading(async () => {
     *   const response = await apiRequest('/api/list')
     *   if (response.success) return response.data
     *   throw new Error(response.message)
     * })
     * if (result.success) {
     *   this.items = result.data
     * }
     */
    async withLoading(asyncFn, options = {}) {
      // 兼容旧版本的字符串参数
      const config = typeof options === 'string' 
        ? { loadingMessage: options }
        : options
      
      const {
        loadingMessage = '加载中...',
        showError = true,
        showSuccess = false,
        successMessage = '操作成功',
        errorMessage = '操作失败'
      } = config
      
      this.setLoading(true, loadingMessage)
      
      try {
        const result = await asyncFn()
        this.dataLoaded = true
        
        if (showSuccess) {
          this.showSuccess(successMessage)
        }
        
        // 返回标准格式 { success: true, data: result }
        return { success: true, data: result }
      } catch (error) {
        this.setError(error.message || errorMessage)
        
        if (showError) {
          this.showError(error.message || errorMessage)
        }
        
        // 返回标准格式 { success: false, error }
        return { success: false, error }
      } finally {
        this.setLoading(false)
      }
    },

    // 显示成功提示
    showSuccess(message) {
      if (this.$toast) {
        this.$toast.success(message)
      } else if (Alpine.store('notification')) {
        Alpine.store('notification').success(message)
      }
    },

    // 显示错误提示
    showError(message) {
      if (this.$toast) {
        this.$toast.error(message)
      } else if (Alpine.store('notification')) {
        Alpine.store('notification').error(message)
      }
    }
  }
}

window.asyncDataMixin = asyncDataMixin

// ========== 2. 认证守卫 Mixin ==========
/**
 * 认证守卫 Mixin
 * 提供统一的认证检查、权限验证和用户信息管理
 */
function authGuardMixin() {
  return {
    // 状态
    userInfo: null,
    authChecked: false,

    // 执行认证检查
    checkAuth() {
      // 获取用户信息
      this.userInfo = typeof getCurrentUser === 'function' 
        ? getCurrentUser() 
        : JSON.parse(localStorage.getItem('admin_user') || 'null')
      
      // Token 检查
      const token = typeof getToken === 'function' 
        ? getToken() 
        : localStorage.getItem('admin_token')
        
      if (!token) {
        console.warn('[AuthGuard] 未登录，跳转到登录页')
        window.location.href = '/admin/login.html'
        return false
      }
      
      // 权限检查
      if (!this._checkAdminPermission()) {
        console.warn('[AuthGuard] 无管理员权限')
        if (Alpine.store('notification')) {
          Alpine.store('notification').error('您没有访问此页面的权限')
        }
        return false
      }
      
      this.authChecked = true
      console.log('[AuthGuard] 认证检查通过')
      return true
    },

    // 检查管理员权限
    _checkAdminPermission() {
      if (!this.userInfo) return false
      
      // 检查 role_level
      if (this.userInfo.role_level >= 100) return true
      
      // 检查 roles 数组
      if (this.userInfo.roles && Array.isArray(this.userInfo.roles)) {
        return this.userInfo.roles.some(role => 
          role.role_name === 'admin' || role.role_level >= 100
        )
      }
      
      return false
    },

    // 退出登录
    logout() {
      if (typeof window.logout === 'function') {
        window.logout()
      } else {
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_user')
        window.location.href = '/admin/login.html'
      }
    },

    // 格式化数字
    formatNumber(val) {
      if (val === null || val === undefined || val === '-') return '-'
      return Number(val).toLocaleString('zh-CN')
    }
  }
}

window.authGuardMixin = authGuardMixin

// ========== 3. 分页 Mixin ==========
/**
 * 分页逻辑 Mixin
 * 提供统一的分页状态和计算方法
 */
function paginationMixin(options = {}) {
  const { pageSize = 20 } = options
  
  return {
    // 分页状态
    currentPage: 1,
    pageSize: pageSize,
    total: 0,

    // 计算属性
    get totalPages() {
      return Math.ceil(this.total / this.pageSize)
    },

    get hasNextPage() {
      return this.currentPage < this.totalPages
    },

    get hasPrevPage() {
      return this.currentPage > 1
    },

    get pageInfo() {
      return `第 ${this.currentPage} / ${this.totalPages} 页，共 ${this.total} 条`
    },

    get pageNumbers() {
      const pages = []
      const total = this.totalPages
      const current = this.currentPage
      
      // 显示逻辑：始终显示首页、末页和当前页附近的页码
      for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
          pages.push(i)
        } else if (pages[pages.length - 1] !== '...') {
          pages.push('...')
        }
      }
      
      return pages
    },

    // 跳转到指定页
    goToPage(page) {
      if (page === '...') return
      if (page >= 1 && page <= this.totalPages) {
        this.currentPage = page
        if (typeof this.loadData === 'function') {
          this.loadData()
        }
      }
    },

    // 下一页
    nextPage() {
      if (this.hasNextPage) {
        this.goToPage(this.currentPage + 1)
      }
    },

    // 上一页
    prevPage() {
      if (this.hasPrevPage) {
        this.goToPage(this.currentPage - 1)
      }
    },

    // 重置分页
    resetPagination() {
      this.currentPage = 1
      this.total = 0
    }
  }
}

window.paginationMixin = paginationMixin

// ========== 4. Modal 管理 Mixin ==========
/**
 * Modal 管理 Mixin
 * 提供统一的 Modal 显示、隐藏和数据管理
 */
function modalMixin() {
  return {
    // Modal 实例缓存
    _modalInstances: {},

    // 显示 Modal
    showModal(modalId) {
      const modalEl = document.getElementById(modalId)
      if (!modalEl) {
        console.warn(`[Modal] 未找到 Modal: ${modalId}`)
        return
      }

      // 缓存并显示 Modal
      if (!this._modalInstances[modalId]) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          this._modalInstances[modalId] = new bootstrap.Modal(modalEl)
        }
      }

      if (this._modalInstances[modalId]) {
        this._modalInstances[modalId].show()
      } else {
        // 降级：直接添加显示类
        modalEl.classList.add('show')
        modalEl.style.display = 'block'
        document.body.classList.add('modal-open')
      }
    },

    // 隐藏 Modal
    hideModal(modalId) {
      if (this._modalInstances[modalId]) {
        this._modalInstances[modalId].hide()
      } else {
        const modalEl = document.getElementById(modalId)
        if (modalEl) {
          modalEl.classList.remove('show')
          modalEl.style.display = 'none'
          document.body.classList.remove('modal-open')
        }
      }
    },

    // 切换 Modal
    toggleModal(modalId) {
      const modalEl = document.getElementById(modalId)
      if (modalEl && modalEl.classList.contains('show')) {
        this.hideModal(modalId)
      } else {
        this.showModal(modalId)
      }
    }
  }
}

window.modalMixin = modalMixin

// ========== 5. 表格选择 Mixin ==========
/**
 * 表格多选 Mixin
 * 提供统一的表格选择状态和批量操作支持
 */
function tableSelectionMixin(primaryKey = 'id') {
  return {
    // 选择状态
    selectedIds: [],
    selectAll: false,
    _primaryKey: primaryKey,

    // 计算属性
    get hasSelection() {
      return this.selectedIds.length > 0
    },

    get selectionCount() {
      return this.selectedIds.length
    },

    // 切换单个选择
    toggleSelection(id) {
      const index = this.selectedIds.indexOf(id)
      if (index > -1) {
        this.selectedIds.splice(index, 1)
      } else {
        this.selectedIds.push(id)
      }
      this._updateSelectAllState()
    },

    // 切换全选
    toggleSelectAll(items) {
      if (this.selectAll) {
        this.selectedIds = items.map(item => item[this._primaryKey])
      } else {
        this.selectedIds = []
      }
    },

    // 检查是否选中
    isSelected(id) {
      return this.selectedIds.includes(id)
    },

    // 清除选择
    clearSelection() {
      this.selectedIds = []
      this.selectAll = false
    },

    // 获取选中 ID 字符串
    getSelectedIdsString() {
      return this.selectedIds.join(',')
    },

    // 更新全选状态
    _updateSelectAllState(items) {
      if (items && items.length > 0) {
        this.selectAll = this.selectedIds.length === items.length
      }
    }
  }
}

window.tableSelectionMixin = tableSelectionMixin

// ========== 6. 表单验证 Mixin ==========
/**
 * 表单验证 Mixin
 * 提供统一的表单验证规则和错误管理
 */
function formValidationMixin() {
  return {
    // 验证错误
    formErrors: {},

    // 验证表单
    validateForm(formData, rules) {
      this.formErrors = {}
      let isValid = true

      for (const [field, fieldRules] of Object.entries(rules)) {
        const value = formData[field]
        
        for (const rule of fieldRules) {
          const error = this._validateField(value, rule, field)
          if (error) {
            this.formErrors[field] = error
            isValid = false
            break
          }
        }
      }

      return isValid
    },

    // 验证单个字段
    _validateField(value, rule, field) {
      if (rule.required && !value && value !== 0) {
        return rule.message || `${field} 是必填项`
      }
      
      if (rule.min !== undefined && value < rule.min) {
        return rule.message || `${field} 不能小于 ${rule.min}`
      }
      
      if (rule.max !== undefined && value > rule.max) {
        return rule.message || `${field} 不能大于 ${rule.max}`
      }
      
      if (rule.minLength && (!value || value.length < rule.minLength)) {
        return rule.message || `${field} 长度不能少于 ${rule.minLength}`
      }
      
      if (rule.maxLength && value && value.length > rule.maxLength) {
        return rule.message || `${field} 长度不能超过 ${rule.maxLength}`
      }
      
      if (rule.pattern && !rule.pattern.test(value)) {
        return rule.message || `${field} 格式不正确`
      }
      
      if (rule.validator && typeof rule.validator === 'function') {
        const error = rule.validator(value)
        if (error) return error
      }
      
      return null
    },

    // 获取字段错误
    getFieldError(field) {
      return this.formErrors[field]
    },

    // 检查字段是否有错误
    hasFieldError(field) {
      return !!this.formErrors[field]
    },

    // 清除所有错误
    clearFormErrors() {
      this.formErrors = {}
    },

    // 清除指定字段错误
    clearFieldError(field) {
      delete this.formErrors[field]
    }
  }
}

window.formValidationMixin = formValidationMixin

// ========== 7. 组合工厂函数 ==========

/**
 * 创建页面通用 Mixin 组合
 */
function createPageMixin(options = {}) {
  const {
    pageSize = 20,
    primaryKey = 'id',
    enableAuth = true,
    enablePagination = true,
    enableModal = true,
    enableSelection = false,
    enableFormValidation = false
  } = options
  
  // 收集需要合并的 Mixin
  const mixins = []
  
  // 异步数据加载（始终包含）
  mixins.push(asyncDataMixin())
  
  // 认证守卫
  if (enableAuth) {
    mixins.push(authGuardMixin())
  }
  
  // 分页
  if (enablePagination) {
    mixins.push(paginationMixin({ pageSize }))
  }
  
  // Modal 管理
  if (enableModal) {
    mixins.push(modalMixin())
  }
  
  // 表格多选
  if (enableSelection) {
    mixins.push(tableSelectionMixin(primaryKey))
  }
  
  // 表单验证
  if (enableFormValidation) {
    mixins.push(formValidationMixin())
  }
  
  // 合并所有 Mixin
  return Object.assign({}, ...mixins)
}

/**
 * 创建简单列表页面 Mixin
 */
function createSimpleListMixin(pageSize = 20) {
  return createPageMixin({
    pageSize,
    enableAuth: true,
    enablePagination: true,
    enableModal: false,
    enableSelection: false
  })
}

/**
 * 创建 CRUD 页面 Mixin
 */
function createCrudMixin(options = {}) {
  return createPageMixin({
    pageSize: 20,
    enableAuth: true,
    enablePagination: true,
    enableModal: true,
    enableSelection: false,
    enableFormValidation: true,
    ...options
  })
}

/**
 * 创建批量操作页面 Mixin
 */
function createBatchOperationMixin(options = {}) {
  return createPageMixin({
    pageSize: 20,
    enableAuth: true,
    enablePagination: true,
    enableModal: true,
    enableSelection: true,
    ...options
  })
}

/**
 * 创建统计/仪表盘页面 Mixin
 */
function createDashboardMixin() {
  return createPageMixin({
    enableAuth: true,
    enablePagination: false,
    enableModal: false,
    enableSelection: false
  })
}

/**
 * 创建表单页面 Mixin
 */
function createFormMixin(options = {}) {
  return createPageMixin({
    enableAuth: true,
    enablePagination: false,
    enableModal: true,
    enableSelection: false,
    enableFormValidation: true,
    ...options
  })
}

// 导出到全局
window.createPageMixin = createPageMixin
window.createSimpleListMixin = createSimpleListMixin
window.createCrudMixin = createCrudMixin
window.createBatchOperationMixin = createBatchOperationMixin
window.createDashboardMixin = createDashboardMixin
window.createFormMixin = createFormMixin

// 兼容 Mixins 对象
window.Mixins = {
  authGuard: authGuardMixin,
  pagination: paginationMixin,
  asyncData: asyncDataMixin,
  modal: modalMixin,
  tableSelection: tableSelectionMixin,
  formValidation: formValidationMixin
}

console.log('✅ Alpine Mixin Bundle 已加载 (v1.0.0)')
console.log('📦 可用工厂函数: createPageMixin, createDashboardMixin, createCrudMixin, createBatchOperationMixin, createSimpleListMixin, createFormMixin')

