/**
 * Pagination 分页组件
 *
 * @file public/admin/js/alpine/components/pagination.js
 * @description 基于 Alpine.js 的分页组件
 * @version 1.0.0
 * @date 2026-01-22
 *
 * 使用方式：
 * <div x-data="pagination({ total: 100, pageSize: 20 })" x-init="onChange = (page) => loadData(page)">
 *   <template x-for="page in pages">...</template>
 * </div>
 */

/**
 * Pagination 组件数据
 * @param {Object} config - 配置选项
 * @param {number} config.total - 总条数
 * @param {number} config.pageSize - 每页条数
 * @param {number} config.current - 当前页码
 * @param {number} config.maxPages - 最大显示页码数
 */
function pagination(config = {}) {
  return {
    total: config.total || 0,
    pageSize: config.pageSize || 20,
    current: config.current || 1,
    maxPages: config.maxPages || 5,
    onChange: config.onChange || null,

    // 计算属性：总页数
    get totalPages() {
      return Math.ceil(this.total / this.pageSize) || 1
    },

    // 计算属性：是否有上一页
    get hasPrev() {
      return this.current > 1
    },

    // 计算属性：是否有下一页
    get hasNext() {
      return this.current < this.totalPages
    },

    // 计算属性：页码列表
    get pages() {
      const pages = []
      const total = this.totalPages
      const current = this.current
      const max = this.maxPages

      if (total <= max) {
        // 总页数小于最大显示数，显示全部
        for (let i = 1; i <= total; i++) {
          pages.push({ number: i, type: 'page' })
        }
      } else {
        // 计算显示范围
        let start = Math.max(1, current - Math.floor(max / 2))
        let end = Math.min(total, start + max - 1)

        if (end - start < max - 1) {
          start = Math.max(1, end - max + 1)
        }

        // 第一页
        if (start > 1) {
          pages.push({ number: 1, type: 'page' })
          if (start > 2) {
            pages.push({ number: null, type: 'ellipsis' })
          }
        }

        // 中间页码
        for (let i = start; i <= end; i++) {
          if (i !== 1 && i !== total) {
            pages.push({ number: i, type: 'page' })
          }
        }

        // 最后一页
        if (end < total) {
          if (end < total - 1) {
            pages.push({ number: null, type: 'ellipsis' })
          }
          pages.push({ number: total, type: 'page' })
        }
      }

      return pages
    },

    // 计算属性：显示范围文本
    get rangeText() {
      const start = (this.current - 1) * this.pageSize + 1
      const end = Math.min(this.current * this.pageSize, this.total)
      return `显示 ${start}-${end} 条，共 ${this.total} 条`
    },

    // 跳转到指定页
    goTo(page) {
      if (page < 1 || page > this.totalPages || page === this.current) {
        return
      }
      this.current = page
      if (this.onChange) {
        this.onChange(page)
      }
    },

    // 上一页
    prev() {
      if (this.hasPrev) {
        this.goTo(this.current - 1)
      }
    },

    // 下一页
    next() {
      if (this.hasNext) {
        this.goTo(this.current + 1)
      }
    },

    // 更新分页数据
    update(options = {}) {
      if (options.total !== undefined) this.total = options.total
      if (options.pageSize !== undefined) this.pageSize = options.pageSize
      if (options.current !== undefined) this.current = options.current

      // 确保当前页不超过总页数
      if (this.current > this.totalPages) {
        this.current = this.totalPages
      }
    },

    // 重置到第一页
    reset() {
      this.current = 1
    }
  }
}

console.log('📦 Pagination 组件已加载')
