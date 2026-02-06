/**
 * Data Table 数据表格组件（增强版）
 *
 * @file admin/src/alpine/components/data-table.js
 * @description 标准表格组件，内置分页/排序/选择/导出/筛选联动/URL同步/错误状态
 * @version 2.0.0
 * @date 2026-02-07
 *
 * 使用方式（声明式配置）：
 * <div x-data="dataTable({
 *   columns: [
 *     { key: 'user_id', label: '用户ID', sortable: true },
 *     { key: 'nickname', label: '昵称' },
 *     { key: 'status', label: '状态', type: 'status', statusMap: {...} },
 *     { key: 'created_at', label: '创建时间', type: 'datetime', sortable: true }
 *   ],
 *   dataSource: async (params) => {
 *     const res = await request({ url: '/api/v4/users?' + new URLSearchParams(params) })
 *     return { items: res.data.list, total: res.data.pagination.total }
 *   },
 *   primaryKey: 'user_id',
 *   sortable: true,
 *   selectable: true,
 *   exportable: true,
 *   page_size: 20
 * })">
 *   <!-- 表格由 data-table EJS partial 渲染 -->
 * </div>
 *
 * 关联问题：#3 筛选重置、#4 分页统一、#5 错误状态、#7 URL同步、
 *           #9 组件接入、#10 排序、#12 导出、#13 批量操作
 */

import { logger } from '../../utils/logger.js'
import {
  formatDate as formatDateUtil,
  formatDateTime as formatDateTimeUtil
} from '../../utils/index.js'

/**
 * Data Table 组件
 * @param {Object} config - 配置选项
 * @param {Array} config.columns - 列配置数组
 * @param {Function} config.dataSource - 异步数据源函数，接收 params 返回 { items, total }
 * @param {string} [config.primaryKey='id'] - 主键字段名
 * @param {boolean} [config.sortable=true] - 是否启用列排序
 * @param {boolean} [config.selectable=false] - 是否启用行选择
 * @param {boolean} [config.exportable=false] - 是否启用导出
 * @param {boolean} [config.serverSort=false] - 是否使用服务端排序
 * @param {boolean} [config.urlSync=false] - 是否同步状态到 URL
 * @param {number} [config.page_size=20] - 每页条数
 * @param {string} [config.emptyText='暂无数据'] - 空数据提示
 * @param {string} [config.emptyType='no-data'] - 空状态预设类型
 * @param {string} [config.exportType=''] - 导出类型（对应 export-modal 配置）
 * @param {Function} [config.onRowClick] - 行点击回调
 * @param {Function} [config.onSelectionChange] - 选择变更回调
 * @returns {Object} Alpine 组件数据
 */
export function dataTable(config = {}) {
  return {
    // ========== 配置 ==========
    columns: config.columns || [],
    primaryKey: config.primaryKey || 'id',
    sortable: config.sortable ?? true,
    selectable: config.selectable ?? false,
    exportable: config.exportable ?? false,
    serverSort: config.serverSort ?? false,
    urlSync: config.urlSync ?? false,
    emptyText: config.emptyText || '暂无数据',
    emptyType: config.emptyType || 'no-data',
    exportType: config.exportType || '',
    _dataSource: config.dataSource || null,
    _onRowClick: config.onRowClick || null,
    _onSelectionChange: config.onSelectionChange || null,

    // ========== 数据状态 ==========
    data: [],
    loading: false,
    error: null,
    initialized: false,

    // ========== 分页状态 ==========
    current_page: 1,
    page_size: config.page_size || 20,
    total_records: 0,

    // ========== 排序状态 ==========
    sortColumn: null,
    sortDirection: 'asc',

    // ========== 选择状态 ==========
    selectedRows: [],

    // ========== 筛选状态（由 filter-bar 联动） ==========
    activeFilters: config.initialFilters || {},

    // ========== 上次更新时间（#2） ==========
    lastUpdateTime: null,

    // ========== 生命周期 ==========

    /**
     * 初始化组件
     */
    async init() {
      logger.debug('[DataTable] 初始化', {
        columns: this.columns.length,
        sortable: this.sortable,
        selectable: this.selectable,
        exportable: this.exportable,
        page_size: this.page_size
      })

      // 从 URL 恢复状态（#7）
      if (this.urlSync) {
        this._restoreFromURL()
      }

      // 自动加载数据
      if (this._dataSource) {
        await this.loadData()
      }

      this.initialized = true
    },

    // ========== 分页计算属性 ==========

    /**
     * 总页数（自动计算）
     */
    get total_pages() {
      return Math.ceil(this.total_records / this.page_size) || 1
    },

    /**
     * 是否有上一页
     */
    get hasPrevPage() {
      return this.current_page > 1
    },

    /**
     * 是否有下一页
     */
    get hasNextPage() {
      return this.current_page < this.total_pages
    },

    /**
     * 分页信息文本
     */
    get paginationInfo() {
      if (this.total_records === 0) return '暂无数据'
      const start = (this.current_page - 1) * this.page_size + 1
      const end = Math.min(this.current_page * this.page_size, this.total_records)
      return `显示 ${start}-${end}，共 ${this.total_records} 条`
    },

    /**
     * 可见页码列表（智能省略）
     */
    get visiblePages() {
      if (this.total_pages <= 1) return []
      const maxVisible = 7
      const pages = []
      let start = Math.max(1, this.current_page - Math.floor(maxVisible / 2))
      const end = Math.min(this.total_pages, start + maxVisible - 1)

      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1)
      }

      if (start > 1) {
        pages.push(1)
        if (start > 2) pages.push('...')
      }

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i)
      }

      if (end < this.total_pages) {
        if (end < this.total_pages - 1) pages.push('...')
        if (!pages.includes(this.total_pages)) pages.push(this.total_pages)
      }

      return pages
    },

    // ========== 数据状态计算属性 ==========

    /**
     * 是否为空
     */
    get isEmpty() {
      return !this.loading && !this.error && this.data.length === 0
    },

    /**
     * 是否有数据
     */
    get hasData() {
      return !this.loading && this.data.length > 0
    },

    /**
     * 是否有错误
     */
    get hasError() {
      return !this.loading && !!this.error
    },

    /**
     * 列跨度（用于 colspan）
     */
    get colSpan() {
      let span = this.columns.length
      if (this.selectable) span++
      return span
    },

    // ========== 选择计算属性 ==========

    /**
     * 是否全选
     */
    get isAllSelected() {
      return this.data.length > 0 && this.selectedRows.length === this.data.length
    },

    /**
     * 是否部分选中
     */
    get isPartialSelected() {
      return this.selectedRows.length > 0 && this.selectedRows.length < this.data.length
    },

    /**
     * 选中数量
     */
    get selectedCount() {
      return this.selectedRows.length
    },

    /**
     * 是否有选中
     */
    get hasSelected() {
      return this.selectedRows.length > 0
    },

    // ========== 数据加载 ==========

    /**
     * 加载数据（核心方法）
     */
    async loadData() {
      if (!this._dataSource) {
        logger.warn('[DataTable] 未配置 dataSource')
        return
      }

      this.loading = true
      this.error = null

      try {
        // 构建请求参数
        const params = this._buildParams()

        // 调用数据源
        const result = await this._dataSource(params)

        // 解析结果
        if (result && typeof result === 'object') {
          this.data = result.items || result.list || result.rows || result.data || []
          this.total_records = result.total ?? result.count ?? result.total_records ?? this.data.length
        } else {
          this.data = []
          this.total_records = 0
        }

        // 更新时间（#2）
        this.lastUpdateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

        // 清空选择
        this.selectedRows = []

        // URL 同步（#7）
        if (this.urlSync) {
          this._syncToURL()
        }

        logger.debug('[DataTable] 数据加载完成', {
          count: this.data.length,
          total: this.total_records,
          page: this.current_page
        })
      } catch (err) {
        this.error = err.message || '数据加载失败'
        this.data = []
        logger.error('[DataTable] 数据加载失败:', err.message)
      } finally {
        this.loading = false
      }
    },

    /**
     * 刷新数据（保持当前页）
     */
    async refresh() {
      await this.loadData()
    },

    /**
     * 重新搜索（回到第一页）
     */
    async search() {
      this.current_page = 1
      await this.loadData()
    },

    // ========== 分页方法 ==========

    /**
     * 跳转到指定页
     */
    goToPage(page) {
      if (page === '...' || page < 1 || page > this.total_pages || page === this.current_page) {
        return
      }
      this.current_page = page
      this.loadData()
    },

    /**
     * 上一页
     */
    prevPage() {
      if (this.hasPrevPage) this.goToPage(this.current_page - 1)
    },

    /**
     * 下一页
     */
    nextPage() {
      if (this.hasNextPage) this.goToPage(this.current_page + 1)
    },

    /**
     * 首页
     */
    firstPage() {
      this.goToPage(1)
    },

    /**
     * 末页
     */
    lastPage() {
      this.goToPage(this.total_pages)
    },

    /**
     * 修改每页条数
     */
    setPageSize(size) {
      this.page_size = size
      this.current_page = 1
      this.loadData()
    },

    // ========== 排序方法 ==========

    /**
     * 排序
     */
    sort(column) {
      if (!this.sortable || !column.sortable) return

      if (this.sortColumn === column.key) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
      } else {
        this.sortColumn = column.key
        this.sortDirection = 'asc'
      }

      if (this.serverSort) {
        // 服务端排序 - 重新加载数据
        this.current_page = 1
        this.loadData()
      } else {
        // 客户端排序
        this._clientSort()
      }
    },

    /**
     * 获取排序图标
     */
    getSortIcon(column) {
      if (!column.sortable) return ''
      if (this.sortColumn !== column.key) return '↕'
      return this.sortDirection === 'asc' ? '↑' : '↓'
    },

    /**
     * 客户端排序
     * @private
     */
    _clientSort() {
      if (!this.sortColumn) return

      this.data.sort((a, b) => {
        const aVal = this._getNestedValue(a, this.sortColumn)
        const bVal = this._getNestedValue(b, this.sortColumn)

        let comparison = 0
        if (aVal == null && bVal == null) comparison = 0
        else if (aVal == null) comparison = -1
        else if (bVal == null) comparison = 1
        else if (aVal < bVal) comparison = -1
        else if (aVal > bVal) comparison = 1

        return this.sortDirection === 'asc' ? comparison : -comparison
      })
    },

    // ========== 选择方法 ==========

    /**
     * 切换全选
     */
    toggleSelectAll(checked) {
      if (checked) {
        this.selectedRows = this.data.map(row => row[this.primaryKey])
      } else {
        this.selectedRows = []
      }
      this._emitSelectionChange()
    },

    /**
     * 切换行选择
     */
    toggleSelect(id) {
      const index = this.selectedRows.indexOf(id)
      if (index > -1) {
        this.selectedRows.splice(index, 1)
      } else {
        this.selectedRows.push(id)
      }
      this._emitSelectionChange()
    },

    /**
     * 检查行是否选中
     */
    isSelected(id) {
      return this.selectedRows.includes(id)
    },

    /**
     * 获取选中的行数据
     */
    getSelectedRows() {
      return this.data.filter(row => this.selectedRows.includes(row[this.primaryKey]))
    },

    /**
     * 清空选择
     */
    clearSelection() {
      this.selectedRows = []
      this._emitSelectionChange()
    },

    /**
     * 批量操作完成后（清空选择 + 刷新数据）
     */
    afterBatchOperation() {
      this.clearSelection()
      this.loadData()
    },

    // ========== 筛选联动（#3） ==========

    /**
     * 处理 filter-bar 的搜索事件
     */
    handleFilterSearch(filters) {
      this.activeFilters = filters || {}
      this.current_page = 1
      this.loadData()
    },

    /**
     * 处理 filter-bar 的重置事件
     */
    handleFilterReset() {
      this.activeFilters = {}
      this.current_page = 1
      this.sortColumn = null
      this.sortDirection = 'asc'
      this.selectedRows = []
      this.loadData()
    },

    // ========== 导出（#12） ==========

    /**
     * 打开导出弹窗
     */
    openExport() {
      if (typeof Alpine !== 'undefined' && Alpine.store('exportModal')) {
        Alpine.store('exportModal').open({
          exportType: this.exportType,
          currentPageCount: this.data.length,
          filteredCount: this.total_records,
          totalCount: this.total_records,
          onExport: async (options) => {
            return this._handleExport(options)
          }
        })
      } else {
        logger.warn('[DataTable] exportModal store 未注册')
      }
    },

    // ========== 行操作 ==========

    /**
     * 行点击
     */
    handleRowClick(row, index) {
      if (this._onRowClick) {
        this._onRowClick(row, index)
      }
      this.$dispatch('row-click', { row, index })
    },

    // ========== 单元格渲染 ==========

    /**
     * 渲染单元格
     */
    renderCell(row, column) {
      const value = this._getNestedValue(row, column.key)

      // 自定义渲染函数
      if (column.render && typeof column.render === 'function') {
        return column.render(value, row)
      }

      return this._defaultCellRender(value, column)
    },

    /**
     * 默认单元格渲染
     * @private
     */
    _defaultCellRender(value, column) {
      if (value === null || value === undefined) return '<span class="text-gray-400">-</span>'

      switch (column.type) {
        case 'code':
          return `<code class="text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">${this._escapeHtml(String(value))}</code>`

        case 'badge': {
          const badgeClass = column.badgeMap?.[value] || 'gray'
          const badgeText = column.labelMap?.[value] || value
          return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${badgeClass}-100 text-${badgeClass}-800">${badgeText}</span>`
        }

        case 'status':
          return this._renderStatusBadge(value, column.statusMap)

        case 'date':
          return formatDateUtil(value) || '-'

        case 'datetime':
          return formatDateTimeUtil(value) || '-'

        case 'boolean':
          return value
            ? '<span class="text-green-600">✅ 是</span>'
            : '<span class="text-gray-400">❌ 否</span>'

        case 'currency':
          return `<span class="font-medium ${column.colorClass || 'text-blue-600'}">¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>`

        case 'number':
          return Number(value).toLocaleString()

        case 'image':
          return value
            ? `<img src="${this._escapeHtml(value)}" style="max-width: ${column.width || '40px'}; max-height: ${column.height || '40px'};" class="rounded" loading="lazy">`
            : '<span class="text-gray-400">-</span>'

        case 'link':
          return `<a href="${this._escapeHtml(value)}" target="_blank" class="text-blue-600 hover:underline">${this._escapeHtml(column.linkText || value)}</a>`

        case 'tags': {
          if (!Array.isArray(value)) return this._escapeHtml(String(value))
          return value
            .map(tag => `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 mr-1">${this._escapeHtml(tag)}</span>`)
            .join('')
        }

        case 'truncate': {
          const maxLen = column.maxLength || 30
          const text = String(value)
          if (text.length <= maxLen) return this._escapeHtml(text)
          return `<span title="${this._escapeHtml(text)}">${this._escapeHtml(text.substring(0, maxLen))}...</span>`
        }

        default:
          return this._escapeHtml(String(value))
      }
    },

    /**
     * 渲染状态徽章
     * @private
     */
    _renderStatusBadge(value, statusMap = {}) {
      const defaultMap = {
        active: { class: 'green', label: '正常' },
        inactive: { class: 'gray', label: '禁用' },
        pending: { class: 'yellow', label: '待处理' },
        completed: { class: 'blue', label: '已完成' },
        cancelled: { class: 'gray', label: '已取消' },
        expired: { class: 'red', label: '已过期' },
        approved: { class: 'green', label: '已通过' },
        rejected: { class: 'red', label: '已拒绝' },
        enabled: { class: 'green', label: '已启用' },
        disabled: { class: 'gray', label: '已禁用' },
        1: { class: 'green', label: '启用' },
        0: { class: 'gray', label: '禁用' },
        true: { class: 'green', label: '是' },
        false: { class: 'gray', label: '否' }
      }
      const cfg = statusMap[value] || defaultMap[value] || { class: 'gray', label: value }
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${cfg.class}-100 text-${cfg.class}-800">${cfg.label}</span>`
    },

    // ========== URL 状态同步（#7） ==========

    /**
     * 同步当前状态到 URL
     * @private
     */
    _syncToURL() {
      const params = new URLSearchParams()

      if (this.current_page > 1) params.set('page', this.current_page)
      if (this.page_size !== (config.page_size || 20)) params.set('page_size', this.page_size)
      if (this.sortColumn) {
        params.set('sort', this.sortColumn)
        params.set('order', this.sortDirection)
      }

      // 同步筛选条件
      Object.entries(this.activeFilters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          params.set(key, value)
        }
      })

      const queryString = params.toString()
      const newUrl = queryString
        ? `${window.location.pathname}?${queryString}`
        : window.location.pathname

      window.history.replaceState(null, '', newUrl)
    },

    /**
     * 从 URL 恢复状态
     * @private
     */
    _restoreFromURL() {
      const params = new URLSearchParams(window.location.search)

      if (params.has('page')) {
        this.current_page = parseInt(params.get('page'), 10) || 1
      }
      if (params.has('page_size')) {
        this.page_size = parseInt(params.get('page_size'), 10) || config.page_size || 20
      }
      if (params.has('sort')) {
        this.sortColumn = params.get('sort')
        this.sortDirection = params.get('order') || 'asc'
      }

      // 恢复筛选条件
      const reservedKeys = ['page', 'page_size', 'sort', 'order']
      params.forEach((value, key) => {
        if (!reservedKeys.includes(key)) {
          this.activeFilters[key] = value
        }
      })

      logger.debug('[DataTable] 从 URL 恢复状态', {
        page: this.current_page,
        sort: this.sortColumn,
        filters: Object.keys(this.activeFilters).length
      })
    },

    // ========== 内部辅助方法 ==========

    /**
     * 构建请求参数
     * @private
     */
    _buildParams() {
      const params = {
        page: this.current_page,
        page_size: this.page_size
      }

      // 排序参数
      if (this.sortColumn) {
        params.sort_by = this.sortColumn
        params.sort_order = this.sortDirection
      }

      // 合并筛选条件
      Object.entries(this.activeFilters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          params[key] = value
        }
      })

      return params
    },

    /**
     * 获取嵌套对象值
     * @private
     */
    _getNestedValue(obj, path) {
      if (!path) return undefined
      return path.split('.').reduce((current, key) => current?.[key], obj)
    },

    /**
     * HTML 转义
     * @private
     */
    _escapeHtml(text) {
      if (!text) return ''
      const div = document.createElement('div')
      div.textContent = text
      return div.innerHTML
    },

    /**
     * 发射选择变更事件
     * @private
     */
    _emitSelectionChange() {
      if (this._onSelectionChange) {
        this._onSelectionChange(this.selectedRows, this.getSelectedRows())
      }
      this.$dispatch('selection-change', {
        ids: this.selectedRows,
        rows: this.getSelectedRows()
      })
    },

    /**
     * 处理导出
     * @private
     */
    async _handleExport(options) {
      logger.info('[DataTable] 导出', options)
      // 由 export-modal 组件处理具体导出逻辑
      this.$dispatch('export', { ...options, filters: this.activeFilters })
    },

    // ========== 兼容旧 API ==========

    /**
     * 设置数据（手动模式，不使用 dataSource）
     */
    setData(data, total) {
      this.data = data || []
      this.total_records = total ?? this.data.length
      this.selectedRows = []
      this.lastUpdateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    },

    /**
     * 设置加载状态
     */
    setLoading(loading) {
      this.loading = loading
    },

    /**
     * 设置错误
     */
    setError(error) {
      this.error = error
    }
  }
}

logger.info('[DataTable] 数据表格组件已加载（增强版 v2.0.0）')
