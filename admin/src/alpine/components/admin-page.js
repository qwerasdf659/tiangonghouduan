/**
 * Admin Page 管理页面组件
 *
 * @file public/admin/js/alpine/components/admin-page.js
 * @description 替代原有 AdminPageFramework 的 Alpine.js 版本
 * @version 1.0.0
 * @date 2026-01-22
 *
 * 使用方式：
 * <div x-data="adminPage({
 *   pageId: 'users',
 *   title: '用户管理',
 *   apiEndpoint: USER_ENDPOINTS.LIST
 * })">
 *   ...
 * </div>
 */

import { logger } from '../../utils/logger.js'
/**
 * Admin Page 组件数据
 * @param {Object} config - 页面配置
 * @param {string} config.pageId - 页面ID
 * @param {string} config.title - 页面标题
 * @param {string} config.icon - 页面图标
 * @param {string} config.apiEndpoint - API端点
 * @param {string} config.primaryKey - 主键字段名
 * @param {string} config.dataField - 数据字段名（响应中的数据数组字段）
 * @param {Array} config.columns - 表格列配置
 * @param {Array} config.filters - 筛选器配置
 * @param {Array} config.stats - 统计卡片配置
 * @param {number} config.pageSize - 每页条数
 */
function adminPage(config = {}) {
  return {
    // ========== 基础配置 ==========
    pageId: config.pageId || 'page',
    title: config.title || '数据管理',
    subtitle: config.subtitle || '',
    icon: config.icon || 'bi-file-earmark',
    apiEndpoint: config.apiEndpoint || '',
    primaryKey: config.primaryKey || 'id',
    dataField: config.dataField || null,
    statsEndpoint: config.statsEndpoint || null,

    // ========== 列配置 ==========
    columns: config.columns || [],

    // ========== 筛选配置 ==========
    filters: config.filters || [],
    filterValues: {},

    // ========== 统计配置 ==========
    stats: config.stats || [],
    statsData: {},

    // ========== 分页配置 ==========
    pagination: config.pagination !== false,
    pageSize: config.pageSize || 20,
    currentPage: 1,
    totalPages: 1,
    total: 0,

    // ========== 数据状态 ==========
    data: [],
    loading: false,
    error: null,
    selectedRows: [],

    // ========== 回调函数 ==========
    onDataLoaded: config.onDataLoaded || null,
    onRowClick: config.onRowClick || null,
    customRenders: config.customRenders || {},

    // ========== 初始化 ==========
    async init() {
      logger.info(`[AdminPage] 初始化页面: ${this.pageId}`)

      // 设置页面标题
      Alpine.store('ui').setPageTitle(this.title, this.icon)

      // 初始化筛选值
      this.initFilterValues()

      // 加载数据
      await this.loadData()
    },

    // 初始化筛选值
    initFilterValues() {
      this.filters.forEach(filter => {
        this.filterValues[filter.key] = filter.default || ''
      })
    },

    // ========== 数据加载 ==========
    async loadData() {
      if (!this.apiEndpoint) {
        logger.warn('[AdminPage] 未配置 API 端点')
        return
      }

      this.loading = true
      this.error = null

      try {
        // 构建查询参数
        const params = new URLSearchParams()

        if (this.pagination) {
          params.append('page', this.currentPage)
          params.append('page_size', this.pageSize)
        }

        // 添加筛选参数
        Object.entries(this.filterValues).forEach(([key, value]) => {
          if (value !== '' && value !== undefined && value !== null) {
            params.append(key, value)
          }
        })

        const url = `${this.apiEndpoint}${params.toString() ? '?' + params.toString() : ''}`
        logger.info(`[AdminPage] 加载数据: ${url}`)

        const response = await apiRequest(url)

        if (response && response.success) {
          this.data = this.extractData(response.data)

          // 更新分页信息
          if (response.data.pagination) {
            this.totalPages = response.data.pagination.total_pages || 1
            this.total = response.data.pagination.total || this.data.length
          } else {
            this.total = this.data.length
            this.totalPages = Math.ceil(this.total / this.pageSize) || 1
          }

          // 加载统计数据
          if (this.statsEndpoint) {
            await this.loadStats()
          } else {
            this.updateStats(response.data)
          }

          // 触发回调
          if (this.onDataLoaded) {
            this.onDataLoaded(this.data, response.data)
          }

          logger.info(`[AdminPage] 数据加载成功: ${this.data.length} 条`)
        } else {
          this.error = response?.message || '加载失败'
          logger.error('[AdminPage] 数据加载失败:', this.error)
        }
      } catch (error) {
        this.error = error.message
        logger.error('[AdminPage] 数据加载异常:', error)
      } finally {
        this.loading = false
      }
    },

    // 从响应中提取数据数组
    extractData(data) {
      if (this.dataField && data[this.dataField]) {
        return data[this.dataField]
      }
      if (Array.isArray(data)) return data
      if (data.list) return data.list
      if (data.items) return data.items
      if (data.orders) return data.orders
      if (data.records) return data.records
      if (data.users) return data.users
      if (data.data && Array.isArray(data.data)) return data.data
      return []
    },

    // 加载统计数据
    async loadStats() {
      if (!this.statsEndpoint) return

      try {
        const response = await apiRequest(this.statsEndpoint)
        if (response && response.success) {
          this.statsData = response.data
          this.updateStats(response.data)
        }
      } catch (error) {
        logger.warn('[AdminPage] 统计数据加载失败:', error)
      }
    },

    // 更新统计数据
    updateStats(responseData) {
      this.stats.forEach(stat => {
        if (stat.compute) {
          this.statsData[stat.key] = stat.compute(this.data, responseData)
        } else if (stat.field) {
          this.statsData[stat.key] = this.getNestedValue(responseData, stat.field)
        } else {
          this.statsData[stat.key] = this.data.length
        }
      })
    },

    // 获取嵌套属性值
    getNestedValue(obj, path) {
      return path.split('.').reduce((current, key) => current?.[key], obj)
    },

    // ========== 筛选操作 ==========
    handleSearch() {
      this.currentPage = 1
      this.loadData()
    },

    resetFilters() {
      this.initFilterValues()
      this.currentPage = 1
      this.loadData()
    },

    // ========== 分页操作 ==========
    goToPage(page) {
      if (page < 1 || page > this.totalPages || page === this.currentPage) {
        return
      }
      this.currentPage = page
      this.loadData()
    },

    prevPage() {
      if (this.currentPage > 1) {
        this.goToPage(this.currentPage - 1)
      }
    },

    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.goToPage(this.currentPage + 1)
      }
    },

    // 获取页码列表
    get pageList() {
      const pages = []
      const total = this.totalPages
      const current = this.currentPage
      const maxPages = 5

      if (total <= maxPages) {
        for (let i = 1; i <= total; i++) {
          pages.push(i)
        }
      } else {
        let start = Math.max(1, current - 2)
        let end = Math.min(total, start + maxPages - 1)

        if (end - start < maxPages - 1) {
          start = Math.max(1, end - maxPages + 1)
        }

        if (start > 1) {
          pages.push(1)
          if (start > 2) pages.push('...')
        }

        for (let i = start; i <= end; i++) {
          if (i !== 1 && i !== total) pages.push(i)
        }

        if (end < total) {
          if (end < total - 1) pages.push('...')
          pages.push(total)
        }
      }

      return pages
    },

    // ========== 单元格渲染 ==========
    renderCell(row, column) {
      let value = this.getNestedValue(row, column.key)

      // 使用自定义渲染器
      if (column.render) {
        return column.render(value, row)
      }
      if (this.customRenders[column.key]) {
        return this.customRenders[column.key](value, row)
      }

      // 默认渲染
      return this.defaultCellRender(value, column)
    },

    // 默认单元格渲染
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
        case 'currency':
          return `<span class="text-${column.color || 'primary'} fw-bold">${value}</span>`
        case 'image':
          return value
            ? `<img src="${value}" style="max-width: 50px; max-height: 50px;" class="rounded">`
            : '-'
        default:
          return this.escapeHtml(String(value))
      }
    },

    // 渲染状态徽章
    renderStatusBadge(value, statusMap = {}) {
      const defaultMap = {
        1: { class: 'success', label: '已启用' },
        0: { class: 'secondary', label: '已禁用' },
        true: { class: 'success', label: '是' },
        false: { class: 'secondary', label: '否' },
        active: { class: 'success', label: '正常' },
        inactive: { class: 'secondary', label: '禁用' },
        pending: { class: 'warning', label: '待处理' },
        completed: { class: 'info', label: '已完成' }
      }
      const config = statusMap[value] || defaultMap[value] || { class: 'secondary', label: value }
      return `<span class="badge bg-${config.class}">${config.label}</span>`
    },

    // ========== 工具方法 ==========
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

    // ========== 刷新 ==========
    refresh() {
      return this.loadData()
    },

    // ========== 选择操作 ==========
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

    // 获取选中的行数据
    getSelectedRows() {
      return this.data.filter(row => this.selectedRows.includes(row[this.primaryKey]))
    }
  }
}

logger.info('AdminPage 组件已加载')
