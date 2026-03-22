/**
 * 字典管理独立页面模块（data-table 迁移版）
 *
 * @file admin/src/modules/operations/pages/dict-management.js
 * @description 从 system-settings.js 分离的字典管理独立页面
 * @version 2.0.0
 * @date 2026-02-07
 *
 * data-table 迁移：
 * - 表格渲染由 data-table 组件统一处理
 * - 字典类型切换通过 dt-search 事件联动 data-table
 * - 分页/排序/空状态/错误状态由 data-table 内置
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

// 复用 system 模块的字典 composables
import { useDictState, useDictMethods } from '../../system/composables/dict.js'

// 模块级字典类型端点映射（fetchTableData 通过闭包访问）
const DICT_TYPE_ENDPOINTS = {
  categories: SYSTEM_ENDPOINTS.DICT_CATEGORY_LIST,
  rarities: SYSTEM_ENDPOINTS.DICT_RARITY_LIST,
  'asset-groups': SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_LIST
}

// 模块级字典类型唯一标识字段映射（用于 data-table 的 primaryKey）
const DICT_TYPE_ID_FIELDS = {
  categories: 'category_code',
  rarities: 'rarity_code',
  'asset-groups': 'group_code'
}

// 模块级当前字典类型（供 fetchTableData 闭包使用）
let _currentDictType = 'categories'

// 标记是否已注册，避免重复注册
let _registered = false

/**
 * 注册字典管理页面组件
 */
function registerDictManagementComponents() {
  if (_registered) {
    logger.debug('[DictManagement] 组件已注册，跳过')
    return
  }

  logger.debug('[DictManagement] 注册 Alpine 组件...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[DictManagement] 关键依赖未加载', {
      Alpine: !!Alpine,
      createPageMixin: typeof createPageMixin
    })
    return
  }

  /**
   * 字典管理页面组件
   */
  Alpine.data('dictManagement', () => ({
    // 基础混入（不需要 pagination/tableSelection，data-table 内置）
    ...createPageMixin({ pagination: false, tableSelection: false }),

    // 从 composables 导入状态和方法
    ...useDictState(),
    ...useDictMethods(),

    // 页面状态
    saving: false,

    // ========== 分类树形管理 ==========
    categoryTree: [],
    subcategoryForm: {
      parent_category_id: null,
      parent_name: '',
      category_code: '',
      display_name: '',
      description: ''
    },

    /** 加载分类树 */
    async loadCategoryTree() {
      try {
        const { SystemAdminAPI } = await import('../../../api/system/admin.js')
        const res = await SystemAdminAPI.getCategoryTree()
        const payload = res.data || res || {}
        this.categoryTree = payload.tree || payload || []
        logger.debug('[DictManagement] 分类树加载完成:', this.categoryTree.length, '个一级分类')
      } catch (error) {
        logger.error('[DictManagement] 分类树加载失败:', error)
        this.categoryTree = []
      }
    },

    /** 打开添加子分类弹窗 */
    openAddSubcategoryModal(parent) {
      this.subcategoryForm = {
        parent_category_id: parent.category_id,
        parent_name: parent.category_name,
        category_code: '',
        display_name: '',
        description: ''
      }
      this.showModal('subcategoryModal')
    },

    /** 提交添加子分类 */
    async submitSubcategory() {
      if (!this.subcategoryForm.category_code || !this.subcategoryForm.display_name) {
        Alpine.store('notification').show('请填写分类代码和名称', 'warning')
        return
      }
      try {
        this.saving = true
        const { request } = await import('../../../api/base.js')
        const { SYSTEM_ADMIN_ENDPOINTS } = await import('../../../api/system/admin.js')
        await request({
          url: SYSTEM_ADMIN_ENDPOINTS.DICT_CATEGORY_TREE.replace('/tree', ''),
          method: 'POST',
          data: {
            category_code: this.subcategoryForm.category_code,
            display_name: this.subcategoryForm.display_name,
            description: this.subcategoryForm.description,
            parent_category_id: this.subcategoryForm.parent_category_id,
            is_enabled: true
          }
        })
        Alpine.store('notification').show('子分类添加成功', 'success')
        this.hideModal('subcategoryModal')
        await this.loadCategoryTree()
      } catch (error) {
        Alpine.store('notification').show('添加失败: ' + error.message, 'error')
      } finally {
        this.saving = false
      }
    },

    // ========== data-table 列配置 ==========
    tableColumns: [
      {
        key: '_code',
        label: '字典代码',
        sortable: true,
        render: (_val, row) => {
          const code = row.category_code || row.rarity_code || row.group_code || '-'
          return `<code class="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">${code}</code>`
        }
      },
      {
        key: 'display_name',
        label: '字典名称',
        sortable: true
      },
      {
        key: 'description',
        label: '描述',
        type: 'truncate',
        maxLength: 40
      },
      {
        key: 'is_enabled',
        label: '状态',
        type: 'status',
        statusMap: {
          true: { class: 'green', label: '启用' },
          false: { class: 'gray', label: '禁用' }
        }
      },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '120px',
        actions: [
          {
            name: 'edit',
            label: '编辑',
            icon: '✏️',
            class: 'text-green-600 hover:text-green-800'
          },
          {
            name: 'delete',
            label: '删除',
            icon: '🗑️',
            class: 'text-red-500 hover:text-red-700'
          }
        ]
      }
    ],

    /**
     * data-table 数据源
     * 通过闭包访问 _currentDictType 和 DICT_TYPE_ENDPOINTS
     */
    async fetchTableData(params) {
      const endpoint = DICT_TYPE_ENDPOINTS[_currentDictType]
      if (!endpoint) throw new Error(`未知字典类型: ${_currentDictType}`)

      const queryParams = new URLSearchParams()
      if (params.keyword) queryParams.append('keyword', params.keyword)
      if (params.status) queryParams.append('status', params.status)

      const queryString = queryParams.toString()
      const url = queryString ? `${endpoint}?${queryString}` : endpoint

      const response = await request({ url })
      if (response?.success) {
        const items =
          response.data?.items ||
          response.data?.list ||
          (Array.isArray(response.data) ? response.data : [])

        // 为每行添加 _row_id：使用当前字典类型的唯一标识字段
        // 避免 display_name 重复导致 x-for :key 冲突（如两个稀有度都叫"普通"）
        const idField = DICT_TYPE_ID_FIELDS[_currentDictType] || 'display_name'
        items.forEach(item => {
          item._row_id = item[idField] || item.display_name || ''
        })

        return { items, total: items.length }
      }
      throw new Error(response?.message || '加载字典失败')
    },

    /**
     * 处理表格操作事件
     */
    handleTableAction(detail) {
      const { action, row } = detail
      switch (action) {
        case 'edit':
          this.editDict(row)
          break
        case 'delete':
          this.deleteDict(row)
          break
        default:
          logger.warn('[DictManagement] 未知操作:', action)
      }
    },

    /**
     * 覆写 composable 的 switchDictType：同步模块变量 + 刷新 data-table
     */
    async switchDictType(dictType) {
      if (this.dictTypes[dictType]) {
        _currentDictType = dictType
        this.currentDictType = dictType
        // 清空列表防止闪烁
        window.dispatchEvent(new CustomEvent('dt-refresh'))
      }
    },

    /**
     * 覆写 composable 的 loadDictList：刷新 data-table
     */
    async loadDictList() {
      window.dispatchEvent(new CustomEvent('dt-refresh'))
    },

    /**
     * 初始化
     */
    async init() {
      logger.debug('[DictManagement] 字典管理页面初始化开始')

      if (!this.checkAuth()) {
        logger.warn('[DictManagement] 认证检查失败')
        return
      }

      // 同步初始字典类型
      _currentDictType = this.currentDictType || 'categories'

      // 数据加载由 data-table 的 init() 自动完成
      logger.info('[DictManagement] 页面初始化完成（data-table 模式）')

      // 加载分类树（分类 Tab 使用）
      await this.loadCategoryTree()
    }
  }))

  _registered = true
  logger.info('[DictManagement] Alpine 组件注册完成')
}

// 直接注册
registerDictManagementComponents()

// 后备注册
document.addEventListener('alpine:init', () => {
  registerDictManagementComponents()
})

export { registerDictManagementComponents }
export default registerDictManagementComponents
