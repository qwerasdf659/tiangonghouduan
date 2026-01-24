/**
 * Mixin 统一聚合入口（ES Module 版本）
 *
 * @description 聚合所有 Mixin 并提供统一导出和组合工具
 * @version 2.0.0 - 从全局变量迁移到 ES Module
 * @date 2026-01-23
 *
 * @example
 * // 按需导入
 * import { paginationMixin, modalMixin } from '@/alpine/mixins/index.js'
 *
 * // 或使用组合工具创建页面
 * import { createPageMixin } from '@/alpine/mixins/index.js'
 *
 * function userPage() {
 *   return createPageMixin({
 *     pagination: { pageSize: 20 },
 *     modal: true,
 *     tableSelection: 'user_id'
 *   }, {
 *     // 页面自定义属性和方法
 *     users: [],
 *     async loadData() { ... }
 *   })
 * }
 */

// ========== Mixin 导入 ==========
export { paginationMixin } from './pagination.js'
export { asyncDataMixin, createDataLoaderConfig } from './async-data.js'
export { modalMixin } from './modal.js'
export { tableSelectionMixin } from './table-selection.js'
export { formValidationMixin } from './form-validation.js'
export { authGuardMixin } from './auth-guard.js'
export { withDraftAutoSave, createDraftFormMixin } from './draft-auto-save.js'

// ========== 组合工具 ==========

import { paginationMixin } from './pagination.js'
import { asyncDataMixin, createDataLoaderConfig } from './async-data.js'
import { modalMixin } from './modal.js'
import { tableSelectionMixin } from './table-selection.js'
import { formValidationMixin } from './form-validation.js'
import { authGuardMixin } from './auth-guard.js'

/**
 * 创建页面 Mixin
 * 组合多个 Mixin 并与自定义属性合并
 *
 * @param {Object} mixinConfig - Mixin 配置
 * @param {Object|boolean} [mixinConfig.pagination] - 分页配置或 true
 * @param {boolean} [mixinConfig.asyncData=true] - 是否启用异步数据
 * @param {boolean} [mixinConfig.modal=true] - 是否启用 Modal
 * @param {string|boolean} [mixinConfig.tableSelection] - 表格选择配置（ID字段名或 true）
 * @param {boolean} [mixinConfig.formValidation=false] - 是否启用表单验证
 * @param {boolean} [mixinConfig.authGuard=false] - 是否启用认证守卫
 * @param {Object} customProps - 自定义属性和方法
 * @returns {Object} 组合后的 Alpine data 对象
 *
 * @example
 * function userManagementPage() {
 *   return createPageMixin({
 *     pagination: { pageSize: 20 },
 *     modal: true,
 *     tableSelection: 'user_id',
 *     authGuard: true
 *   }, {
 *     users: [],
 *     searchKeyword: '',
 *
 *     async init() {
 *       if (!this.checkAuth()) return
 *       await this.loadUsers()
 *     },
 *
 *     async loadUsers() {
 *       const params = {
 *         ...this.buildPaginationParams(),
 *         keyword: this.searchKeyword
 *       }
 *       const result = await this.apiGet('/api/v4/users', params)
 *       if (result.success) {
 *         this.users = result.data.list
 *         this.updatePagination(result.data)
 *       }
 *     }
 *   })
 * }
 */
export function createPageMixin(mixinConfig = {}, customProps = {}) {
  const {
    pagination = false,
    asyncData = true,
    modal = true,
    tableSelection = false,
    formValidation = false,
    authGuard = true // 默认启用认证守卫（管理后台页面通常需要）
  } = mixinConfig

  const composed = {}

  // 1. 异步数据（通常都需要）
  if (asyncData) {
    Object.assign(composed, asyncDataMixin())
  }

  // 2. 分页
  if (pagination) {
    const paginationConfig = typeof pagination === 'object' ? pagination : {}
    Object.assign(composed, paginationMixin(paginationConfig))
  }

  // 3. Modal
  if (modal) {
    Object.assign(composed, modalMixin())
  }

  // 4. 表格选择
  if (tableSelection) {
    const idField = typeof tableSelection === 'string' ? tableSelection : 'id'
    Object.assign(composed, tableSelectionMixin(idField))
  }

  // 5. 表单验证
  if (formValidation) {
    Object.assign(composed, formValidationMixin())
  }

  // 6. 认证守卫
  if (authGuard) {
    Object.assign(composed, authGuardMixin())
  }

  // 7. 合并自定义属性（自定义优先级最高）
  Object.assign(composed, customProps)

  return composed
}

/**
 * 创建 CRUD 页面 Mixin
 * 预设标准的增删改查功能
 *
 * @param {Object} config - CRUD 配置
 * @param {string} config.apiBase - API 基础路径
 * @param {string} [config.idField='id'] - ID 字段名
 * @param {string} [config.listKey='list'] - 列表数据字段名
 * @param {Object} customProps - 自定义属性和方法
 * @returns {Object} CRUD 页面 Mixin
 */
export function createCrudPageMixin(config, customProps = {}) {
  const { apiBase, idField = 'id', listKey = 'list' } = config

  return createPageMixin(
    {
      pagination: true,
      modal: true,
      tableSelection: idField,
      formValidation: true,
      asyncData: true,
      authGuard: true
    },
    {
      // 数据列表
      data: [],

      // 搜索关键词
      searchKeyword: '',

      // 新增/编辑表单
      form: {},

      // 编辑模式标记
      isEditMode: false,
      editingId: null,

      // 删除确认项
      itemToDelete: null,

      /**
       * 页面初始化
       */
      async init() {
        if (!this.checkAuth()) return
        await this.loadData()
      },

      /**
       * 加载数据列表
       */
      async loadData() {
        const params = {
          ...this.buildPaginationParams(),
          keyword: this.searchKeyword
        }

        const result = await this.apiGet(apiBase, params)
        if (result.success) {
          this.data = result.data[listKey] || result.data
          this.updatePagination(result.data)
        }
      },

      /**
       * 搜索
       */
      search() {
        this.currentPage = 1
        this.loadData()
      },

      /**
       * 打开新增模态框
       */
      openAddModal() {
        this.isEditMode = false
        this.editingId = null
        this.form = {}
        this.clearFormErrors()
        this.showModal('formModal')
      },

      /**
       * 打开编辑模态框
       */
      openEditModal(item) {
        this.isEditMode = true
        this.editingId = item[idField]
        this.form = JSON.parse(JSON.stringify(item))
        this.clearFormErrors()
        this.showModal('formModal')
      },

      /**
       * 保存（新增/编辑）
       */
      async save() {
        if (!this.validateForm(this.form, this.rules || {})) {
          return
        }

        const url = this.isEditMode ? `${apiBase}/${this.editingId}` : apiBase
        const method = this.isEditMode ? 'apiPut' : 'apiPost'

        const result = await this[method](url, this.form, {
          showSuccess: true,
          successMessage: this.isEditMode ? '更新成功' : '添加成功'
        })

        if (result.success) {
          this.hideModal('formModal')
          this.loadData()
        }
      },

      /**
       * 打开删除确认
       */
      confirmDelete(item) {
        this.itemToDelete = item
        this.showModal('deleteModal')
      },

      /**
       * 执行删除
       */
      async doDelete() {
        if (!this.itemToDelete) return

        const result = await this.apiDelete(`${apiBase}/${this.itemToDelete[idField]}`, {
          showSuccess: true,
          successMessage: '删除成功'
        })

        if (result.success) {
          this.hideModal('deleteModal')
          this.itemToDelete = null
          this.loadData()
        }
      },

      /**
       * 批量删除
       */
      async batchDelete() {
        if (!this.hasSelected) return

        const result = await this.confirmAndExecute(
          `确定要删除选中的 ${this.selectedCount} 条记录吗？`,
          async () => {
            const response = await fetch(`${apiBase}/batch`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: this.selectedIds })
            })
            return response.json()
          },
          { successMessage: '批量删除成功' }
        )

        if (result.success) {
          this.afterBatchOperation()
        }
      },

      // 合并自定义属性
      ...customProps
    }
  )
}

/**
 * 创建 CRUD 页面 Mixin（简化版）
 * 适用于标准的增删改查页面
 *
 * @param {Object} options - 配置选项
 * @param {number} [options.pageSize=20] - 分页大小
 * @param {boolean} [options.enableFormValidation=false] - 是否启用表单验证
 * @param {boolean} [options.enablePagination=true] - 是否启用分页
 * @returns {Object} Mixin 对象
 */
export function createCrudMixin(options = {}) {
  const { pageSize = 20, enableFormValidation = false, enablePagination = true } = options

  return createPageMixin({
    pagination: enablePagination ? { pageSize } : false,
    asyncData: true,
    modal: true,
    tableSelection: true,
    formValidation: enableFormValidation,
    authGuard: true
  })
}

/**
 * 创建批量操作页面 Mixin
 * 适用于需要批量选择和操作的页面
 *
 * @param {Object} options - 配置选项
 * @param {number} [options.pageSize=20] - 分页大小
 * @param {string} [options.primaryKey='id'] - 主键字段名
 * @returns {Object} Mixin 对象
 */
export function createBatchOperationMixin(options = {}) {
  const { pageSize = 20, primaryKey = 'id' } = options

  return createPageMixin({
    pagination: { pageSize },
    asyncData: true,
    modal: true,
    tableSelection: primaryKey,
    formValidation: false,
    authGuard: true
  })
}

/**
 * 创建仪表盘/统计页面 Mixin
 * 适用于数据展示和统计类页面
 *
 * @returns {Object} Mixin 对象
 */
export function createDashboardMixin() {
  return createPageMixin({
    pagination: false,
    asyncData: true,
    modal: false,
    tableSelection: false,
    formValidation: false,
    authGuard: true
  })
}

/**
 * 创建简单列表页面 Mixin
 * 适用于只读列表展示页面
 *
 * @param {Object} options - 配置选项
 * @param {number} [options.pageSize=20] - 分页大小
 * @returns {Object} Mixin 对象
 */
export function createSimpleListMixin(options = {}) {
  const { pageSize = 20 } = options

  return createPageMixin({
    pagination: { pageSize },
    asyncData: true,
    modal: false,
    tableSelection: false,
    formValidation: false,
    authGuard: true
  })
}

/**
 * 创建表单页面 Mixin
 * 适用于纯表单编辑页面
 *
 * @returns {Object} Mixin 对象
 */
export function createFormMixin() {
  return createPageMixin({
    pagination: false,
    asyncData: true,
    modal: false,
    tableSelection: false,
    formValidation: true,
    authGuard: true
  })
}

// ========== 草稿自动保存 ==========
import { withDraftAutoSave, createDraftFormMixin } from './draft-auto-save.js'

// ========== 导出所有 ==========
export default {
  paginationMixin,
  asyncDataMixin,
  createDataLoaderConfig,
  modalMixin,
  tableSelectionMixin,
  formValidationMixin,
  authGuardMixin,
  createPageMixin,
  createCrudPageMixin,
  createCrudMixin,
  createBatchOperationMixin,
  createDashboardMixin,
  createSimpleListMixin,
  createFormMixin,
  withDraftAutoSave,
  createDraftFormMixin
}
