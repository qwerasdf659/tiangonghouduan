/**
 * 统一商品中心 — EAV 属性定义管理页面
 *
 * @file admin/src/modules/exchange-item/pages/attribute-management.js
 * @description 属性列表筛选、CRUD、选项增删改
 */

import { logger } from '@/utils/logger.js'
import { Alpine, createPageMixin, dataTable } from '@/alpine/index.js'
import { request, buildURL, buildQueryString, API_PREFIX } from '@/api/base.js'

/** @type {string} 属性 API 根路径 */
const ATTR_API = `${API_PREFIX}/console/attributes`

/**
 * 列表筛选（供 dataSource 闭包读取，筛选变更后 dispatch dt-refresh）
 *
 * @type {{ is_sale_attr: string, is_searchable: string, is_enabled: string }}
 */
const ATTR_FILTERS = { is_sale_attr: '', is_searchable: '', is_enabled: '' }

let _registered = false

function registerAttributeManagement() {
  if (_registered) return
  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[AttributeManagement] 依赖未就绪')
    return
  }

  Alpine.data('attributeManagement', () => ({
    ...createPageMixin({ pagination: false, tableSelection: false }),

    saving: false,
    /** 与 ATTR_FILTERS 同一引用，模板 x-model 双向绑定 */
    attrFilters: ATTR_FILTERS,

    /** @type {number|null} 编辑中的属性 ID */
    editingAttributeId: null,

    attributeForm: {
      attribute_name: '',
      attribute_code: '',
      input_type: 'select',
      is_required: false,
      is_sale_attr: false,
      is_searchable: false,
      sort_order: 0,
      is_enabled: true
    },

    /** @type {Array<Object>} 当前编辑属性的选项列表 */
    attributeOptions: [],

    newOption: {
      option_value: '',
      sort_order: 0
    },

    /** @type {{ option_id: number, option_value: string, sort_order: number }|null} */
    editingOption: null,

    tableColumns: [
      {
        key: 'attribute_name',
        label: '属性名称',
        sortable: true
      },
      {
        key: 'attribute_code',
        label: '编码',
        render: (_v, row) =>
          `<code class="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">${String(row.attribute_code || '').replace(/</g, '&lt;')}</code>`
      },
      { key: 'input_type', label: '输入类型', sortable: true },
      {
        key: 'is_required',
        label: '必填',
        type: 'status',
        statusMap: {
          true: { class: 'amber', label: '是' },
          false: { class: 'gray', label: '否' }
        }
      },
      {
        key: 'is_sale_attr',
        label: '销售属性',
        type: 'status',
        statusMap: {
          true: { class: 'blue', label: '是' },
          false: { class: 'gray', label: '否' }
        }
      },
      {
        key: 'is_searchable',
        label: '可搜索',
        type: 'status',
        statusMap: {
          true: { class: 'green', label: '是' },
          false: { class: 'gray', label: '否' }
        }
      },
      {
        key: 'is_enabled',
        label: '启用',
        type: 'status',
        statusMap: {
          true: { class: 'green', label: '启用' },
          false: { class: 'gray', label: '禁用' }
        }
      },
      { key: 'options_count', label: '选项数', sortable: false },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '140px',
        actions: [
          { name: 'edit', label: '编辑', icon: '✏️', class: 'text-emerald-600 hover:text-emerald-800' },
          { name: 'delete', label: '删除', icon: '🗑️', class: 'text-red-500 hover:text-red-700' }
        ]
      }
    ],

    /**
     * 生成 data-table 子组件
     *
     * @returns {Object} dataTable 配置
     */
    makeAttrTable() {
      return dataTable({
        columns: this.tableColumns,
        dataSource: async () => {
          const q = {}
          if (ATTR_FILTERS.is_sale_attr === 'true') q.is_sale_attr = true
          if (ATTR_FILTERS.is_sale_attr === 'false') q.is_sale_attr = false
          if (ATTR_FILTERS.is_searchable === 'true') q.is_searchable = true
          if (ATTR_FILTERS.is_searchable === 'false') q.is_searchable = false
          if (ATTR_FILTERS.is_enabled === 'true') q.is_enabled = true
          if (ATTR_FILTERS.is_enabled === 'false') q.is_enabled = false
          const qs = buildQueryString(q)
          const res = await request({ url: `${ATTR_API}${qs}` })
          const items = res.data?.items || []
          return { items, total: items.length }
        },
        primaryKey: 'attribute_id',
        sortable: true,
        selectable: false,
        exportable: false,
        page_size: 200,
        emptyText: '暂无属性数据'
      })
    },

    /**
     * 筛选变更后刷新表格
     */
    onAttrFilterChange() {
      window.dispatchEvent(new CustomEvent('dt-refresh'))
    },

    /**
     * 表格行操作
     *
     * @param {{ action: string, row: Object }} detail - 事件详情
     */
    handleTableAction(detail) {
      const { action, row } = detail
      if (action === 'edit') this.openEditAttribute(row)
      else if (action === 'delete') this.confirmDeleteAttribute(row)
    },

    openCreateAttribute() {
      this.editingAttributeId = null
      this.attributeOptions = []
      this.attributeForm = {
        attribute_name: '',
        attribute_code: '',
        input_type: 'select',
        is_required: false,
        is_sale_attr: false,
        is_searchable: false,
        sort_order: 0,
        is_enabled: true
      }
      this.newOption = { option_value: '', sort_order: 0 }
      this.editingOption = null
      this.showModal('attributeModal')
    },

    async openEditAttribute(row) {
      this.editingAttributeId = row.attribute_id
      try {
        const res = await request({
          url: buildURL(`${ATTR_API}/:id`, { id: row.attribute_id })
        })
        const d = res.data || {}
        this.attributeForm = {
          attribute_name: d.attribute_name || '',
          attribute_code: d.attribute_code || '',
          input_type: d.input_type || 'select',
          is_required: Boolean(d.is_required),
          is_sale_attr: Boolean(d.is_sale_attr),
          is_searchable: Boolean(d.is_searchable),
          sort_order: d.sort_order ?? 0,
          is_enabled: d.is_enabled !== false
        }
        this.attributeOptions = Array.isArray(d.options) ? [...d.options] : []
        this.newOption = { option_value: '', sort_order: 0 }
        this.editingOption = null
        this.showModal('attributeModal')
      } catch (e) {
        Alpine.store('notification').show(e.message || '加载属性失败', 'error')
      }
    },

    async submitAttributeForm() {
      const f = this.attributeForm
      if (!f.attribute_name?.trim() || !f.attribute_code?.trim()) {
        Alpine.store('notification').show('请填写属性名称与编码', 'warning')
        return
      }
      const payload = {
        attribute_name: f.attribute_name.trim(),
        attribute_code: f.attribute_code.trim(),
        input_type: f.input_type || 'select',
        is_required: Boolean(f.is_required),
        is_sale_attr: Boolean(f.is_sale_attr),
        is_searchable: Boolean(f.is_searchable),
        sort_order: Number(f.sort_order) || 0,
        is_enabled: Boolean(f.is_enabled)
      }
      try {
        this.saving = true
        if (this.editingAttributeId) {
          await request({
            url: buildURL(`${ATTR_API}/:id`, { id: this.editingAttributeId }),
            method: 'PUT',
            data: payload
          })
          Alpine.store('notification').show('属性已更新', 'success')
        } else {
          const res = await request({ url: ATTR_API, method: 'POST', data: payload })
          const created = res.data || {}
          this.editingAttributeId = created.attribute_id
          Alpine.store('notification').show('属性已创建，可继续添加选项', 'success')
        }
        window.dispatchEvent(new CustomEvent('dt-refresh'))
      } catch (e) {
        Alpine.store('notification').show(e.message || '保存失败', 'error')
      } finally {
        this.saving = false
      }
    },

    confirmDeleteAttribute(row) {
      if (!window.confirm(`确定删除属性「${row.attribute_name}」？`)) return
      this.deleteAttribute(row.attribute_id)
    },

    async deleteAttribute(attributeId) {
      try {
        await request({ url: buildURL(`${ATTR_API}/:id`, { id: attributeId }), method: 'DELETE' })
        Alpine.store('notification').show('已删除', 'success')
        window.dispatchEvent(new CustomEvent('dt-refresh'))
      } catch (e) {
        Alpine.store('notification').show(e.message || '删除失败', 'error')
      }
    },

    async addOptionRow() {
      if (!this.editingAttributeId) {
        Alpine.store('notification').show('请先保存属性定义', 'warning')
        return
      }
      const v = (this.newOption.option_value || '').trim()
      if (!v) {
        Alpine.store('notification').show('请填写选项值', 'warning')
        return
      }
      try {
        this.saving = true
        if (this.editingOption) {
          await request({
            url: buildURL(`${ATTR_API}/options/:option_id`, { option_id: this.editingOption.option_id }),
            method: 'PUT',
            data: {
              option_value: v,
              sort_order: Number(this.newOption.sort_order) || 0
            }
          })
          Alpine.store('notification').show('选项已更新', 'success')
        } else {
          await request({
            url: buildURL(`${ATTR_API}/:id/options`, { id: this.editingAttributeId }),
            method: 'POST',
            data: {
              option_value: v,
              sort_order: Number(this.newOption.sort_order) || 0
            }
          })
          Alpine.store('notification').show('选项已添加', 'success')
        }
        this.newOption = { option_value: '', sort_order: 0 }
        this.editingOption = null
        await this.reloadAttributeDetail()
        window.dispatchEvent(new CustomEvent('dt-refresh'))
      } catch (e) {
        Alpine.store('notification').show(e.message || '保存选项失败', 'error')
      } finally {
        this.saving = false
      }
    },

    startEditOption(opt) {
      this.editingOption = {
        option_id: opt.option_id,
        option_value: opt.option_value,
        sort_order: opt.sort_order ?? 0
      }
      this.newOption = {
        option_value: opt.option_value,
        sort_order: opt.sort_order ?? 0
      }
    },

    cancelEditOption() {
      this.editingOption = null
      this.newOption = { option_value: '', sort_order: 0 }
    },

    async deleteOptionRow(opt) {
      if (!window.confirm(`删除选项「${opt.option_value}」？`)) return
      try {
        await request({
          url: buildURL(`${ATTR_API}/options/:option_id`, { option_id: opt.option_id }),
          method: 'DELETE'
        })
        Alpine.store('notification').show('选项已删除', 'success')
        await this.reloadAttributeDetail()
        window.dispatchEvent(new CustomEvent('dt-refresh'))
      } catch (e) {
        Alpine.store('notification').show(e.message || '删除失败', 'error')
      }
    },

    async reloadAttributeDetail() {
      if (!this.editingAttributeId) return
      const res = await request({
        url: buildURL(`${ATTR_API}/:id`, { id: this.editingAttributeId })
      })
      const d = res.data || {}
      this.attributeOptions = Array.isArray(d.options) ? [...d.options] : []
    },

    async init() {
      if (!this.checkAuth()) return
      logger.info('[AttributeManagement] 初始化完成')
    }
  }))

  _registered = true
  logger.info('[AttributeManagement] 组件已注册')
}

registerAttributeManagement()
document.addEventListener('alpine:init', () => {
  registerAttributeManagement()
})

export { registerAttributeManagement }
export default registerAttributeManagement
