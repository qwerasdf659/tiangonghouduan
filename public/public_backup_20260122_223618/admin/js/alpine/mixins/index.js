/**
 * Alpine.js Mixin 汇总导出
 * 
 * 统一导出所有可复用的 Mixin，减少页面代码重复
 * 
 * @file public/admin/js/alpine/mixins/index.js
 * @description Mixin 汇总文件，提供组合 Mixin 的工厂函数
 * @version 2.0.0
 * @date 2026-01-23
 * 
 * 📋 包含的 Mixin：
 * - authGuard: 认证守卫（Token 检查、权限验证）
 * - pagination: 分页逻辑（页码计算、导航控制）
 * - asyncData: 异步数据加载（加载状态、错误处理）
 * - modal: Modal 管理（显示/隐藏、实例缓存）
 * - tableSelection: 表格选择（多选、全选）
 * - formValidation: 表单验证（规则验证、错误管理）
 * 
 * @example
 * // 在页面中使用组合 Mixin
 * function myPage() {
 *   return {
 *     ...createPageMixin({ pageSize: 20, enableSelection: true }),
 *     // 页面特有逻辑...
 *   }
 * }
 */

// ========== Mixin 导出 ==========

/**
 * 所有可用的 Mixin 集合
 * @type {Object}
 */
const Mixins = {
  authGuard: window.authGuardMixin,
  pagination: window.paginationMixin,
  asyncData: window.asyncDataMixin,
  modal: window.modalMixin,
  tableSelection: window.tableSelectionMixin,
  formValidation: window.formValidationMixin
}

// ========== 组合工厂函数 ==========

/**
 * 创建页面通用 Mixin 组合
 * 
 * 根据配置选项自动组合所需的 Mixin，简化页面初始化代码
 * 
 * @param {Object} options - 配置选项
 * @param {number} [options.pageSize=20] - 每页条数
 * @param {string} [options.primaryKey='id'] - 主键字段名
 * @param {boolean} [options.enableAuth=true] - 是否启用认证检查
 * @param {boolean} [options.enablePagination=true] - 是否启用分页
 * @param {boolean} [options.enableModal=true] - 是否启用 Modal 管理
 * @param {boolean} [options.enableSelection=false] - 是否启用表格多选
 * @param {boolean} [options.enableFormValidation=false] - 是否启用表单验证
 * @returns {Object} 合并后的 Mixin 对象
 * 
 * @example
 * // 基础 CRUD 页面
 * function usersPage() {
 *   return {
 *     ...createPageMixin({ pageSize: 20 }),
 *     users: [],
 *     async loadData() { ... }
 *   }
 * }
 * 
 * @example
 * // 带多选功能的页面
 * function ordersPage() {
 *   return {
 *     ...createPageMixin({ 
 *       pageSize: 50, 
 *       primaryKey: 'order_id',
 *       enableSelection: true 
 *     }),
 *     orders: [],
 *     async batchDelete() { ... }
 *   }
 * }
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
  if (typeof asyncDataMixin === 'function') {
    mixins.push(asyncDataMixin())
  }
  
  // 认证守卫
  if (enableAuth && typeof authGuardMixin === 'function') {
    mixins.push(authGuardMixin())
  }
  
  // 分页
  if (enablePagination && typeof paginationMixin === 'function') {
    mixins.push(paginationMixin({ pageSize }))
  }
  
  // Modal 管理
  if (enableModal && typeof modalMixin === 'function') {
    mixins.push(modalMixin())
  }
  
  // 表格多选
  if (enableSelection && typeof tableSelectionMixin === 'function') {
    mixins.push(tableSelectionMixin(primaryKey))
  }
  
  // 表单验证
  if (enableFormValidation && typeof formValidationMixin === 'function') {
    mixins.push(formValidationMixin())
  }
  
  // 合并所有 Mixin
  return Object.assign({}, ...mixins)
}

/**
 * 创建简单列表页面 Mixin
 * 只包含认证、分页和异步数据加载
 * 
 * @param {number} [pageSize=20] - 每页条数
 * @returns {Object} Mixin 对象
 * 
 * @example
 * function logsPage() {
 *   return {
 *     ...createSimpleListMixin(50),
 *     logs: [],
 *     async loadData() { ... }
 *   }
 * }
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
 * 包含认证、分页、Modal 和异步数据加载
 * 
 * @param {Object} options - 配置选项
 * @returns {Object} Mixin 对象
 * 
 * @example
 * function productsPage() {
 *   return {
 *     ...createCrudMixin({ pageSize: 15 }),
 *     products: [],
 *     addForm: {},
 *     editForm: {},
 *     async loadData() { ... },
 *     async submitAdd() { ... },
 *     async submitEdit() { ... }
 *   }
 * }
 */
function createCrudMixin(options = {}) {
  return createPageMixin({
    pageSize: 20,
    enableAuth: true,
    enablePagination: true,
    enableModal: true,
    enableSelection: false,
    enableFormValidation: true,  // CRUD 页面默认启用表单验证
    ...options
  })
}

/**
 * 创建批量操作页面 Mixin
 * 包含所有功能：认证、分页、Modal、多选、异步数据加载
 * 
 * @param {Object} options - 配置选项
 * @returns {Object} Mixin 对象
 * 
 * @example
 * function messagesPage() {
 *   return {
 *     ...createBatchOperationMixin({ primaryKey: 'message_id' }),
 *     messages: [],
 *     async batchDelete() {
 *       if (!this.hasSelection) return
 *       // 批量删除逻辑...
 *     },
 *     async batchMarkRead() {
 *       const ids = this.getSelectedIdsString()
 *       // 批量标记已读...
 *     }
 *   }
 * }
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
 * 只包含认证和异步数据加载，不需要分页
 * 
 * @returns {Object} Mixin 对象
 * 
 * @example
 * function dashboardPage() {
 *   return {
 *     ...createDashboardMixin(),
 *     statistics: {},
 *     charts: {},
 *     async loadData() { ... }
 *   }
 * }
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
 * 包含认证、Modal、表单验证和异步数据加载
 * 
 * @param {Object} options - 配置选项
 * @returns {Object} Mixin 对象
 * 
 * @example
 * function settingsPage() {
 *   return {
 *     ...createFormMixin(),
 *     form: { ... },
 *     rules: { ... },
 *     async loadSettings() { ... },
 *     async saveSettings() {
 *       if (!this.validateForm(this.form, this.rules)) return
 *       // 保存逻辑...
 *     }
 *   }
 * }
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

// ========== 导出到全局 ==========

window.Mixins = Mixins
window.createPageMixin = createPageMixin
window.createSimpleListMixin = createSimpleListMixin
window.createCrudMixin = createCrudMixin
window.createBatchOperationMixin = createBatchOperationMixin
window.createDashboardMixin = createDashboardMixin
window.createFormMixin = createFormMixin

console.log('✅ Alpine Mixins 汇总模块已加载 (v2.0.0)')
console.log('📦 可用 Mixin:', Object.keys(Mixins).join(', '))
