/**
 * Data Table 数据表格组件
 *
 * @file public/admin/js/alpine/components/data-table.js
 * @description 基于 Alpine.js 的数据表格组件
 * @version 1.0.0
 * @date 2026-01-22
 *
 * 使用方式：
 * <div x-data="dataTable({ columns: [...], data: [...] })">
 *   <table>...</table>
 * </div>
 */

import { logger } from '../../utils/logger.js'
/**
 * Data Table 组件数据
 * @param {Object} config - 配置选项
 * @param {Array} config.columns - 列配置
 * @param {Array} config.data - 数据数组
 * @param {string} config.primaryKey - 主键字段
 * @param {boolean} config.selectable - 是否可选择
 * @param {boolean} config.sortable - 是否可排序
 */
function dataTable(config = {}) {
  return {
    columns: config.columns || [],
    data: config.data || [],
    primaryKey: config.primaryKey || 'id',
    selectable: config.selectable || false,
    sortable: config.sortable || false,
    loading: false,
    error: null,

    // 选择状态
    selectedRows: [],

    // 排序状态
    sortColumn: null,
    sortDirection: 'asc',

    // 初始化
    init() {
      logger.info('[DataTable] 初始化')
    },

    // 设置数据
    setData(data) {
      this.data = data || []
      this.selectedRows = []
    },

    // 设置加载状态
    setLoading(loading) {
      this.loading = loading
    },

    // 设置错误
    setError(error) {
      this.error = error
    },

    // ========== 排序 ==========
    sort(column) {
      if (!this.sortable || !column.sortable) return

      if (this.sortColumn === column.key) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
      } else {
        this.sortColumn = column.key
        this.sortDirection = 'asc'
      }

      this.data.sort((a, b) => {
        const aVal = this.getNestedValue(a, column.key)
        const bVal = this.getNestedValue(b, column.key)

        let comparison = 0
        if (aVal < bVal) comparison = -1
        if (aVal > bVal) comparison = 1

        return this.sortDirection === 'asc' ? comparison : -comparison
      })
    },

    getSortIcon(column) {
      if (this.sortColumn !== column.key) {
        return 'bi-chevron-expand'
      }
      return this.sortDirection === 'asc' ? 'bi-chevron-up' : 'bi-chevron-down'
    },

    // ========== 选择 ==========
    toggleSelectAll(checked) {
      if (checked) {
        this.selectedRows = this.data.map(row => row[this.primaryKey])
      } else {
        this.selectedRows = []
      }
    },

    toggleSelect(id) {
      const index = this.selectedRows.indexOf(id)
      if (index > -1) {
        this.selectedRows.splice(index, 1)
      } else {
        this.selectedRows.push(id)
      }
    },

    isSelected(id) {
      return this.selectedRows.includes(id)
    },

    get isAllSelected() {
      return this.data.length > 0 && this.selectedRows.length === this.data.length
    },

    get selectedCount() {
      return this.selectedRows.length
    },

    getSelectedRows() {
      return this.data.filter(row => this.selectedRows.includes(row[this.primaryKey]))
    },

    clearSelection() {
      this.selectedRows = []
    },

    // ========== 单元格渲染 ==========
    renderCell(row, column) {
      let value = this.getNestedValue(row, column.key)

      if (column.render) {
        return column.render(value, row)
      }

      return this.defaultCellRender(value, column)
    },

    defaultCellRender(value, column) {
      if (value === null || value === undefined) return '-'

      switch (column.type) {
        case 'code':
          return `<code>${this.escapeHtml(value)}</code>`
        case 'badge':
          const badgeClass = column.badgeMap?.[value] || 'secondary'
          const badgeText = column.labelMap?.[value] || value
          return `<span class="badge bg-${badgeClass}">${badgeText}</span>`
        case 'status':
          return this.renderStatusBadge(value, column.statusMap)
        case 'date':
          return this.formatDate(value)
        case 'datetime':
          return this.formatDateTime(value)
        case 'boolean':
          return value
            ? '<i class="bi bi-check-circle-fill text-success"></i>'
            : '<i class="bi bi-x-circle-fill text-secondary"></i>'
        case 'currency':
          return `<span class="text-${column.color || 'primary'} fw-bold">¥${Number(value).toLocaleString()}</span>`
        case 'number':
          return Number(value).toLocaleString()
        case 'image':
          return value
            ? `<img src="${value}" style="max-width: ${column.width || '50px'}; max-height: ${column.height || '50px'};" class="rounded">`
            : '-'
        case 'link':
          return `<a href="${value}" target="_blank" class="text-decoration-none">${this.escapeHtml(value)}</a>`
        default:
          return this.escapeHtml(String(value))
      }
    },

    renderStatusBadge(value, statusMap = {}) {
      const defaultMap = {
        1: { class: 'success', label: '已启用' },
        0: { class: 'secondary', label: '已禁用' },
        true: { class: 'success', label: '是' },
        false: { class: 'secondary', label: '否' },
        active: { class: 'success', label: '正常' },
        inactive: { class: 'secondary', label: '禁用' },
        pending: { class: 'warning', label: '待处理' },
        completed: { class: 'info', label: '已完成' },
        shipped: { class: 'success', label: '已发货' },
        cancelled: { class: 'secondary', label: '已取消' }
      }
      const config = statusMap[value] || defaultMap[value] || { class: 'secondary', label: value }
      return `<span class="badge bg-${config.class}">${config.label}</span>`
    },

    // ========== 工具方法 ==========
    getNestedValue(obj, path) {
      return path.split('.').reduce((current, key) => current?.[key], obj)
    },

    formatDate(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString('zh-CN')
    },

    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    },

    escapeHtml(text) {
      if (!text) return ''
      const div = document.createElement('div')
      div.textContent = text
      return div.innerHTML
    },

    // ========== 计算属性 ==========
    get isEmpty() {
      return !this.loading && this.data.length === 0
    },

    get hasData() {
      return !this.loading && this.data.length > 0
    },

    get colSpan() {
      let span = this.columns.length
      if (this.selectable) span++
      return span
    }
  }
}

logger.info('DataTable 组件已加载')
