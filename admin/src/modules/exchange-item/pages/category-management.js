/**
 * 统一商品中心 — 品类树管理页面
 *
 * @file admin/src/modules/exchange-item/pages/category-management.js
 * @description 品类树形表格、CRUD、品类与属性绑定
 */

import { logger } from '@/utils/logger.js'
import { Alpine, createPageMixin, dataTable } from '@/alpine/index.js'
import { request, buildURL, buildQueryString, API_PREFIX } from '@/api/base.js'

/** @type {string} 品类 API 根路径 */
const CAT_API = `${API_PREFIX}/console/categories`
/** @type {string} 属性 API 根路径（用于加载可选属性列表） */
const ATTR_API = `${API_PREFIX}/console/attributes`

/**
 * 将品类树拍平为带缩进深度的行列表
 *
 * @param {Array<Object>} nodes - 树节点
 * @param {number} depth - 当前深度
 * @returns {Array<Object>} 扁平行
 */
function flattenCategoryTree(nodes, depth = 0) {
  if (!Array.isArray(nodes)) return []
  const out = []
  for (const n of nodes) {
    const { children, ...rest } = n
    out.push({ ...rest, _depth: depth })
    if (children?.length) {
      out.push(...flattenCategoryTree(children, depth + 1))
    }
  }
  return out
}

/**
 * HTML 转义（表格单元格渲染）
 *
 * @param {string} s - 原始文本
 * @returns {string}
 */
function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

let _registered = false

function registerCategoryManagement() {
  if (_registered) return
  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[CategoryManagement] 依赖未就绪')
    return
  }

  Alpine.data('categoryManagement', () => ({
    ...createPageMixin({ pagination: false, tableSelection: false }),

    saving: false,
    /** @type {number|null} 编辑中的品类 ID */
    editingCategoryId: null,
    /** @type {Array<Object>} 扁平品类（用于父级下拉） */
    categoryFlatItems: [],
    /** @type {Array<Object>} 全部属性（绑定弹窗） */
    allAttributesForBind: [],
    /** @type {number|null} 当前绑定弹窗的品类 ID */
    attrBindCategoryId: null,
    /** @type {number[]} 已选属性 ID（顺序即绑定顺序） */
    selectedAttrIds: [],

    categoryForm: {
      category_name: '',
      category_code: '',
      parent_category_id: '',
      level: 1,
      sort_order: 0,
      is_enabled: true
    },

    tableColumns: [
      {
        key: 'category_name',
        label: '品类名称',
        sortable: false,
        render: (_v, row) => {
          const pad = (row._depth || 0) * 18
          return `<span class="inline-block text-gray-900" style="padding-left:${pad}px">${esc(row.category_name)}</span>`
        }
      },
      {
        key: 'category_code',
        label: '编码',
        render: (_v, row) =>
          `<code class="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">${esc(row.category_code)}</code>`
      },
      { key: 'level', label: '层级', sortable: true },
      { key: 'sort_order', label: '排序', sortable: true },
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
        width: '200px',
        actions: [
          {
            name: 'edit',
            label: '编辑',
            icon: '✏️',
            class: 'text-emerald-600 hover:text-emerald-800'
          },
          {
            name: 'bindAttrs',
            label: '属性',
            icon: '🔗',
            class: 'text-indigo-600 hover:text-indigo-800'
          },
          { name: 'delete', label: '删除', icon: '🗑️', class: 'text-red-500 hover:text-red-700' }
        ]
      }
    ],

    /**
     * 生成 data-table 子组件（dataSource 绑定父级列配置）
     *
     * @returns {Object} dataTable 配置
     */
    makeCategoryTable() {
      const parent = this
      return dataTable({
        columns: parent.tableColumns,
        dataSource: async () => {
          const res = await request({ url: `${CAT_API}${buildQueryString({ tree: 'true' })}` })
          const tree = res.data?.tree || []
          const items = flattenCategoryTree(tree)
          return { items, total: items.length }
        },
        primaryKey: 'category_id',
        sortable: true,
        selectable: false,
        exportable: false,
        page_size: 200,
        emptyText: '暂无品类数据'
      })
    },

    /**
     * 拉取扁平列表（父级下拉）
     */
    async loadCategoryFlatItems() {
      const res = await request({ url: CAT_API })
      this.categoryFlatItems = res.data?.items || []
    },

    /**
     * 父级下拉选项（编辑时排除自身）
     *
     * @returns {Array<Object>}
     */
    get parentSelectOptions() {
      const id = this.editingCategoryId
      if (!id) return this.categoryFlatItems
      return this.categoryFlatItems.filter(c => c.category_id !== id)
    },

    /**
     * 绑定弹窗：按全量属性列表顺序生成已选 ID 序
     *
     * @returns {number[]}
     */
    get orderedSelectedAttrIds() {
      const set = new Set(this.selectedAttrIds)
      const order = []
      for (const a of this.allAttributesForBind) {
        if (set.has(a.attribute_id)) order.push(a.attribute_id)
      }
      return order
    },

    /**
     * 表格行操作
     *
     * @param {{ action: string, row: Object }} detail - 事件详情
     */
    handleTableAction(detail) {
      const { action, row } = detail
      if (action === 'edit') this.openEditCategory(row)
      else if (action === 'delete') this.confirmDeleteCategory(row)
      else if (action === 'bindAttrs') this.openAttrBindModal(row)
    },

    openCreateCategory() {
      this.editingCategoryId = null
      this.categoryForm = {
        category_name: '',
        category_code: '',
        parent_category_id: '',
        level: 1,
        sort_order: 0,
        is_enabled: true
      }
      this.showModal('categoryModal')
    },

    openEditCategory(row) {
      this.editingCategoryId = row.category_id
      this.categoryForm = {
        category_name: row.category_name || '',
        category_code: row.category_code || '',
        parent_category_id:
          row.parent_category_id === null || row.parent_category_id === undefined
            ? ''
            : String(row.parent_category_id),
        level: row.level ?? 1,
        sort_order: row.sort_order ?? 0,
        is_enabled: row.is_enabled !== false
      }
      this.showModal('categoryModal')
    },

    async submitCategoryForm() {
      const f = this.categoryForm
      if (!f.category_name?.trim() || !f.category_code?.trim()) {
        Alpine.store('notification').show('请填写品类名称与编码', 'warning')
        return
      }
      const payload = {
        category_name: f.category_name.trim(),
        category_code: f.category_code.trim(),
        parent_category_id: f.parent_category_id === '' ? null : Number(f.parent_category_id),
        level: Number(f.level) || 1,
        sort_order: Number(f.sort_order) || 0,
        is_enabled: Boolean(f.is_enabled)
      }
      try {
        this.saving = true
        if (this.editingCategoryId) {
          await request({
            url: buildURL(`${CAT_API}/:id`, { id: this.editingCategoryId }),
            method: 'PUT',
            data: payload
          })
          Alpine.store('notification').show('品类已更新', 'success')
        } else {
          await request({ url: CAT_API, method: 'POST', data: payload })
          Alpine.store('notification').show('品类已创建', 'success')
        }
        this.hideModal('categoryModal')
        await this.loadCategoryFlatItems()
        window.dispatchEvent(new CustomEvent('dt-refresh'))
      } catch (e) {
        Alpine.store('notification').show(e.message || '保存失败', 'error')
      } finally {
        this.saving = false
      }
    },

    confirmDeleteCategory(row) {
      if (!window.confirm(`确定删除品类「${row.category_name}」？若有子品类将无法删除。`)) return
      this.deleteCategory(row.category_id)
    },

    async deleteCategory(categoryId) {
      try {
        await request({ url: buildURL(`${CAT_API}/:id`, { id: categoryId }), method: 'DELETE' })
        Alpine.store('notification').show('已删除', 'success')
        await this.loadCategoryFlatItems()
        window.dispatchEvent(new CustomEvent('dt-refresh'))
      } catch (e) {
        Alpine.store('notification').show(e.message || '删除失败', 'error')
      }
    },

    async loadAllAttributesForBind() {
      const res = await request({ url: ATTR_API })
      this.allAttributesForBind = res.data?.items || []
    },

    async openAttrBindModal(row) {
      this.attrBindCategoryId = row.category_id
      await this.loadAllAttributesForBind()
      try {
        const res = await request({
          url: buildURL(`${CAT_API}/:id/attributes`, { id: row.category_id })
        })
        const attrs = res.data?.attributes || []
        this.selectedAttrIds = attrs.map(a => a.attribute_id)
        this.showModal('categoryAttrModal')
      } catch (e) {
        Alpine.store('notification').show(e.message || '加载绑定失败', 'error')
      }
    },

    async saveCategoryAttributes() {
      if (this.attrBindCategoryId == null) return
      try {
        this.saving = true
        await request({
          url: buildURL(`${CAT_API}/:id/attributes`, { id: this.attrBindCategoryId }),
          method: 'PUT',
          data: { attribute_ids: this.orderedSelectedAttrIds }
        })
        Alpine.store('notification').show('属性绑定已保存', 'success')
        this.hideModal('categoryAttrModal')
      } catch (e) {
        Alpine.store('notification').show(e.message || '保存失败', 'error')
      } finally {
        this.saving = false
      }
    },

    async init() {
      if (!this.checkAuth()) return
      await this.loadCategoryFlatItems()
      logger.info('[CategoryManagement] 初始化完成')
    }
  }))

  _registered = true
  logger.info('[CategoryManagement] 组件已注册')
}

registerCategoryManagement()
document.addEventListener('alpine:init', () => {
  registerCategoryManagement()
})

export { registerCategoryManagement }
export default registerCategoryManagement
