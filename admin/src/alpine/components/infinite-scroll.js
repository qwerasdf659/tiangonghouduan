/**
 * 无限滚动组件
 *
 * @file src/alpine/components/infinite-scroll.js
 * @description 使用 IntersectionObserver 实现无限滚动加载
 * @version 1.0.0
 * @date 2026-01-27
 *
 * @example
 * <div x-data="infiniteScroll({ loadMore: fetchNextPage })">
 *   <div x-ref="items">
 *     <!-- 列表项 -->
 *   </div>
 *   <div x-ref="sentinel" class="h-4"></div>
 *   <div x-show="loading" class="text-center py-4">加载中...</div>
 *   <div x-show="!hasMore && !loading" class="text-center py-4 text-gray-500">没有更多了</div>
 * </div>
 */

import { logger } from '../../utils/logger.js'

/**
 * 无限滚动组件
 * @param {Object} config - 配置选项
 * @param {Function} config.loadMore - 加载更多数据的函数
 * @param {number} config.threshold - 触发加载的阈值（像素）
 * @param {boolean} config.immediate - 是否立即加载第一页
 * @returns {Object} Alpine 组件数据
 */
export function infiniteScroll(config = {}) {
  return {
    loading: false,
    hasMore: true,
    page: 1,
    error: null,
    observer: null,
    threshold: config.threshold || 200,
    _loadMore: config.loadMore || null,

    /**
     * 初始化组件
     */
    init() {
      this.$nextTick(() => {
        const sentinel = this.$refs.sentinel
        if (!sentinel) {
          logger.warn('[InfiniteScroll] 未找到 sentinel 元素')
          return
        }

        this.observer = new IntersectionObserver(
          entries => {
            entries.forEach(entry => {
              if (entry.isIntersecting && !this.loading && this.hasMore) {
                this.loadNextPage()
              }
            })
          },
          {
            rootMargin: `${this.threshold}px 0px`,
            threshold: 0
          }
        )

        this.observer.observe(sentinel)

        // 立即加载第一页
        if (config.immediate !== false) {
          this.loadNextPage()
        }
      })
    },

    /**
     * 加载下一页数据
     */
    async loadNextPage() {
      if (this.loading || !this.hasMore) return

      this.loading = true
      this.error = null

      try {
        if (this._loadMore) {
          const result = await this._loadMore(this.page)

          // 处理返回结果
          if (result) {
            // 如果返回 hasMore 字段
            if (typeof result.hasMore !== 'undefined') {
              this.hasMore = result.hasMore
            }
            // 如果返回空数组或 false
            if (result === false || (Array.isArray(result.data) && result.data.length === 0)) {
              this.hasMore = false
            }
          }

          this.page++
          logger.debug('[InfiniteScroll] 加载第', this.page - 1, '页完成')
        }
      } catch (error) {
        this.error = error.message || '加载失败'
        logger.error('[InfiniteScroll] 加载失败:', error)
      } finally {
        this.loading = false
      }
    },

    /**
     * 重置并重新加载
     */
    reset() {
      this.page = 1
      this.hasMore = true
      this.error = null
      this.loading = false

      // 清空现有内容
      const items = this.$refs.items
      if (items) {
        items.innerHTML = ''
      }

      this.loadNextPage()
    },

    /**
     * 手动触发加载
     */
    triggerLoad() {
      if (!this.loading && this.hasMore) {
        this.loadNextPage()
      }
    },

    /**
     * 销毁组件
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect()
      }
    }
  }
}

/**
 * 虚拟滚动增强（用于大列表）
 * @param {Object} config - 配置选项
 * @returns {Object} Alpine 组件数据
 */
export function virtualScroll(config = {}) {
  return {
    items: config.items || [],
    visibleItems: [],
    itemHeight: config.itemHeight || 50,
    containerHeight: config.containerHeight || 400,
    scrollTop: 0,
    startIndex: 0,
    endIndex: 0,
    overscan: config.overscan || 5,

    /**
     * 初始化
     */
    init() {
      this.updateVisibleItems()

      this.$watch('items', () => {
        this.updateVisibleItems()
      })
    },

    /**
     * 更新可见项
     */
    updateVisibleItems() {
      const visibleCount = Math.ceil(this.containerHeight / this.itemHeight)

      this.startIndex = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.overscan)

      this.endIndex = Math.min(this.items.length, this.startIndex + visibleCount + this.overscan * 2)

      this.visibleItems = this.items.slice(this.startIndex, this.endIndex)
    },

    /**
     * 处理滚动
     * @param {Event} event - 滚动事件
     */
    handleScroll(event) {
      this.scrollTop = event.target.scrollTop
      this.updateVisibleItems()
    },

    /**
     * 获取总高度
     * @returns {number} 总高度（像素）
     */
    get totalHeight() {
      return this.items.length * this.itemHeight
    },

    /**
     * 获取偏移量
     * @returns {number} 偏移量（像素）
     */
    get offsetY() {
      return this.startIndex * this.itemHeight
    }
  }
}

export default { infiniteScroll, virtualScroll }

