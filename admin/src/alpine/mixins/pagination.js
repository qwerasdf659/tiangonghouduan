/**
 * 分页逻辑 Mixin（ES Module 版本）
 *
 * @description 提供完整的分页状态管理、页码计算和导航功能
 * @version 2.0.0 - 迁移自旧版 window.paginationMixin
 * @date 2026-01-23
 *
 * @example
 * import { paginationMixin } from '@/alpine/mixins/index.js'
 *
 * function myPage() {
 *   return {
 *     ...paginationMixin({ page_size: 20 }),
 *     data: [],
 *     async loadData() {
 *       const params = this.buildPaginationParams()
 *       const response = await apiRequest('/api/list?' + new URLSearchParams(params))
 *       this.data = response.data.list
 *       this.updatePagination(response.data)
 *     }
 *   }
 * }
 */
export function paginationMixin(options = {}) {
  const page_size = options.page_size || 20
  const maxVisiblePages = options.maxVisiblePages || 7

  return {
    // ========== 分页状态 ==========

    /** 当前页码 */
    current_page: 1,

    /** 每页条数 */
    page_size: page_size,

    /** 总记录数 */
    total_records: 0,

    // ========== 计算属性 ==========

    /**
     * 总页数
     * @returns {number} 总页数
     */
    get total_pages() {
      return Math.ceil(this.total_records / this.page_size) || 1
    },

    /**
     * 是否有上一页
     * @returns {boolean}
     */
    get hasPrevPage() {
      return this.current_page > 1
    },

    /**
     * 是否有下一页
     * @returns {boolean}
     */
    get hasNextPage() {
      return this.current_page < this.total_pages
    },

    /**
     * 可见页码列表（智能省略）
     * @returns {Array<number|string>} 页码数组，包含省略号
     */
    get visiblePages() {
      if (this.total_pages <= 1) return []

      const pages = []
      let start = Math.max(1, this.current_page - Math.floor(maxVisiblePages / 2))
      let end = Math.min(this.total_pages, start + maxVisiblePages - 1)

      // 调整起始位置
      if (end - start < maxVisiblePages - 1) {
        start = Math.max(1, end - maxVisiblePages + 1)
      }

      // 首页
      if (start > 1) {
        pages.push(1)
        if (start > 2) pages.push('...')
      }

      // 中间页码
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i)
      }

      // 末页
      if (end < this.total_pages) {
        if (end < this.total_pages - 1) pages.push('...')
        if (!pages.includes(this.total_pages)) pages.push(this.total_pages)
      }

      return pages
    },

    /**
     * 分页信息文本
     * @returns {string} 如 "显示 1-20，共 100 条"
     */
    get paginationInfo() {
      if (this.total_records === 0) return '暂无数据'
      const start = (this.current_page - 1) * this.page_size + 1
      const end = Math.min(this.current_page * this.page_size, this.total_records)
      return `显示 ${start}-${end}，共 ${this.total_records} 条`
    },

    // ========== 方法 ==========

    /**
     * 跳转到指定页
     * @param {number|string} page - 页码
     */
    goToPage(page) {
      if (page === '...' || page < 1 || page > this.total_pages || page === this.current_page) {
        return
      }

      this.current_page = page

      // 滚动到顶部
      window.scrollTo({ top: 0, behavior: 'smooth' })

      // 触发数据加载（如果存在 loadData 方法）
      if (typeof this.loadData === 'function') {
        this.loadData()
      }
    },

    /**
     * 上一页
     */
    prevPage() {
      if (this.hasPrevPage) {
        this.goToPage(this.current_page - 1)
      }
    },

    /**
     * 下一页
     */
    nextPage() {
      if (this.hasNextPage) {
        this.goToPage(this.current_page + 1)
      }
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
     * 重置分页
     */
    resetPagination() {
      this.current_page = 1
      this.total_records = 0
    },

    /**
     * 从 API 响应更新分页信息
     * 支持多种后端响应格式
     *
     * @param {Object} response - API 响应数据
     */
    updatePagination(response) {
      // 格式1: { pagination: { total: 100 } }
      if (response.pagination) {
        this.total_records = response.pagination.total || 0
        if (response.pagination.page) {
          this.current_page = response.pagination.page
        }
      }
      // 格式2: { total: 100 }
      else if (response.total !== undefined) {
        this.total_records = response.total
      }
      // 格式3: { count: 100 }
      else if (response.count !== undefined) {
        this.total_records = response.count
      }
    },

    /**
     * 构建分页参数
     * @returns {Object} 分页参数对象
     */
    buildPaginationParams() {
      return {
        page: this.current_page,
        page_size: this.page_size,
        limit: this.page_size
      }
    },

    /**
     * 设置每页条数
     * @param {number} size - 每页条数
     */
    setPageSize(size) {
      this.page_size = size
      this.current_page = 1
      if (typeof this.loadData === 'function') {
        this.loadData()
      }
    }
  }
}
