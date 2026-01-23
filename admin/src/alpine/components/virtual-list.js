/**
 * 虚拟列表组件
 * 解决：大数据量列表渲染性能问题（1000+条记录）
 *
 * @file public/admin/js/alpine/components/virtual-list.js
 * @description 通过只渲染可视区域内的元素，大幅减少 DOM 节点数量
 * @version 1.0.0
 * @date 2026-01-23
 *
 * @example
 * <!-- 基础用法 -->
 * <div x-data="virtualList({ itemHeight: 50 })" x-init="setItems(largeDataArray)">
 *   <div x-ref="container" class="virtual-list-container" @scroll="handleScroll($event)"
 *        style="height: 400px; overflow-y: auto;">
 *     <div :style="{ height: totalHeight + 'px', position: 'relative' }">
 *       <div :style="{ transform: 'translateY(' + offsetY + 'px)' }">
 *         <template x-for="(item, index) in visibleItems" :key="item.id || (startIndex + index)">
 *           <div class="virtual-list-item" :style="{ height: itemHeight + 'px' }">
 *             <span x-text="item.name"></span>
 *           </div>
 *         </template>
 *       </div>
 *     </div>
 *   </div>
 * </div>
 *
 * @example
 * <!-- 表格形式 -->
 * <div x-data="virtualTable({ itemHeight: 48, columns: [...] })">
 *   ...
 * </div>
 */

// ========== 基础虚拟列表组件 ==========

/**
 * 虚拟列表组件
 *
 * @param {Object} config - 配置选项
 * @param {number} [config.itemHeight=50] - 每项高度（像素）
 * @param {number} [config.bufferSize=5] - 缓冲区大小（上下各渲染额外的项数）
 * @param {number} [config.containerHeight=400] - 容器默认高度
 * @param {boolean} [config.dynamicHeight=false] - 是否支持动态行高
 * @returns {Object} Alpine 组件数据
 */
function virtualList(config = {}) {
  return {
    // ========== 配置 ==========

    /** 每项高度（像素） */
    itemHeight: config.itemHeight || 50,

    /** 缓冲区大小 */
    bufferSize: config.bufferSize || 5,

    /** 是否支持动态行高 */
    dynamicHeight: config.dynamicHeight || false,

    /** 动态行高映射 */
    itemHeights: {},

    // ========== 状态 ==========

    /** 所有数据项 */
    items: [],

    /** 可见数据项 */
    visibleItems: [],

    /** 当前滚动位置 */
    scrollTop: 0,

    /** 容器高度 */
    containerHeight: config.containerHeight || 400,

    /** 是否正在加载更多 */
    loadingMore: false,

    /** 是否已到达底部 */
    reachedEnd: false,

    /** 选中的项 ID 集合 */
    selectedIds: new Set(),

    /** 滚动节流标志 */
    _scrollRAF: null,

    // ========== 计算属性 ==========

    /**
     * 总高度（用于创建滚动空间）
     * @returns {number}
     */
    get totalHeight() {
      if (this.dynamicHeight) {
        return (
          Object.values(this.itemHeights).reduce((sum, h) => sum + h, 0) ||
          this.items.length * this.itemHeight
        )
      }
      return this.items.length * this.itemHeight
    },

    /**
     * 可见区域起始索引
     * @returns {number}
     */
    get startIndex() {
      if (this.dynamicHeight) {
        return this._findStartIndexDynamic()
      }
      return Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.bufferSize)
    },

    /**
     * 可见区域结束索引
     * @returns {number}
     */
    get endIndex() {
      const visibleCount = Math.ceil(this.containerHeight / this.itemHeight)
      return Math.min(this.items.length, this.startIndex + visibleCount + this.bufferSize * 2)
    },

    /**
     * Y 轴偏移量（用于定位可见区域）
     * @returns {number}
     */
    get offsetY() {
      if (this.dynamicHeight) {
        return this._calculateOffsetDynamic()
      }
      return this.startIndex * this.itemHeight
    },

    /**
     * 总项数
     * @returns {number}
     */
    get totalCount() {
      return this.items.length
    },

    /**
     * 可见项数
     * @returns {number}
     */
    get visibleCount() {
      return this.visibleItems.length
    },

    /**
     * 是否有数据
     * @returns {boolean}
     */
    get hasItems() {
      return this.items.length > 0
    },

    /**
     * 是否全部选中
     * @returns {boolean}
     */
    get isAllSelected() {
      return this.items.length > 0 && this.selectedIds.size === this.items.length
    },

    /**
     * 是否部分选中
     * @returns {boolean}
     */
    get isPartialSelected() {
      return this.selectedIds.size > 0 && this.selectedIds.size < this.items.length
    },

    // ========== 生命周期 ==========

    /**
     * 初始化
     */
    init() {
      this.$nextTick(() => {
        // 获取容器高度
        if (this.$refs.container) {
          this.containerHeight = this.$refs.container.clientHeight || this.containerHeight

          // 监听容器大小变化
          if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(entries => {
              for (const entry of entries) {
                this.containerHeight = entry.contentRect.height
                this.updateVisibleItems()
              }
            })
            observer.observe(this.$refs.container)
          }
        }

        this.updateVisibleItems()
        console.log(`[VirtualList] 初始化完成，容器高度: ${this.containerHeight}px`)
      })
    },

    // ========== 数据管理 ==========

    /**
     * 设置数据
     *
     * @param {Array} items - 数据数组
     */
    setItems(items) {
      this.items = items || []
      this.scrollTop = 0
      this.selectedIds.clear()

      // 重置滚动位置
      if (this.$refs.container) {
        this.$refs.container.scrollTop = 0
      }

      this.updateVisibleItems()
      console.log(`[VirtualList] 设置数据: ${this.items.length} 项`)
    },

    /**
     * 追加数据（用于无限滚动）
     *
     * @param {Array} newItems - 新数据数组
     */
    appendItems(newItems) {
      this.items = [...this.items, ...newItems]
      this.loadingMore = false
      this.updateVisibleItems()
      console.log(`[VirtualList] 追加数据: ${newItems.length} 项，总计: ${this.items.length} 项`)
    },

    /**
     * 更新单项数据
     *
     * @param {number|string} id - 项 ID
     * @param {Object} data - 新数据
     */
    updateItem(id, data) {
      const index = this.items.findIndex(item => item.id === id)
      if (index !== -1) {
        this.items[index] = { ...this.items[index], ...data }
        this.updateVisibleItems()
      }
    },

    /**
     * 删除项
     *
     * @param {number|string} id - 项 ID
     */
    removeItem(id) {
      const index = this.items.findIndex(item => item.id === id)
      if (index !== -1) {
        this.items.splice(index, 1)
        this.selectedIds.delete(id)
        this.updateVisibleItems()
      }
    },

    /**
     * 清空数据
     */
    clearItems() {
      this.items = []
      this.visibleItems = []
      this.selectedIds.clear()
      this.scrollTop = 0
    },

    // ========== 滚动处理 ==========

    /**
     * 滚动事件处理（使用 requestAnimationFrame 优化）
     *
     * @param {Event} e - 滚动事件
     */
    handleScroll(e) {
      // 取消之前的 RAF
      if (this._scrollRAF) {
        cancelAnimationFrame(this._scrollRAF)
      }

      // 使用 RAF 节流
      this._scrollRAF = requestAnimationFrame(() => {
        this.scrollTop = e.target.scrollTop
        this.updateVisibleItems()

        // 检查是否接近底部（触发加载更多）
        this._checkLoadMore(e.target)
      })
    },

    /**
     * 更新可见项
     */
    updateVisibleItems() {
      this.visibleItems = this.items.slice(this.startIndex, this.endIndex)
    },

    /**
     * 滚动到指定索引
     *
     * @param {number} index - 目标索引
     * @param {string} [behavior='smooth'] - 滚动行为 'smooth' | 'instant'
     */
    scrollToIndex(index, behavior = 'smooth') {
      if (!this.$refs.container) return

      const targetIndex = Math.max(0, Math.min(index, this.items.length - 1))
      const scrollTop = this.dynamicHeight
        ? this._calculateScrollTopDynamic(targetIndex)
        : targetIndex * this.itemHeight

      this.$refs.container.scrollTo({
        top: scrollTop,
        behavior
      })

      console.log(`[VirtualList] 滚动到索引: ${targetIndex}`)
    },

    /**
     * 滚动到指定项
     *
     * @param {number|string} id - 项 ID
     * @param {string} [behavior='smooth'] - 滚动行为
     */
    scrollToItem(id, behavior = 'smooth') {
      const index = this.items.findIndex(item => item.id === id)
      if (index !== -1) {
        this.scrollToIndex(index, behavior)
      }
    },

    /**
     * 滚动到顶部
     */
    scrollToTop() {
      this.scrollToIndex(0, 'smooth')
    },

    /**
     * 滚动到底部
     */
    scrollToBottom() {
      this.scrollToIndex(this.items.length - 1, 'smooth')
    },

    // ========== 选择功能 ==========

    /**
     * 切换选择状态
     *
     * @param {number|string} id - 项 ID
     */
    toggleSelect(id) {
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id)
      } else {
        this.selectedIds.add(id)
      }
      // 触发响应式更新
      this.selectedIds = new Set(this.selectedIds)
    },

    /**
     * 选中项
     *
     * @param {number|string} id - 项 ID
     */
    selectItem(id) {
      this.selectedIds.add(id)
      this.selectedIds = new Set(this.selectedIds)
    },

    /**
     * 取消选中项
     *
     * @param {number|string} id - 项 ID
     */
    deselectItem(id) {
      this.selectedIds.delete(id)
      this.selectedIds = new Set(this.selectedIds)
    },

    /**
     * 检查是否选中
     *
     * @param {number|string} id - 项 ID
     * @returns {boolean}
     */
    isSelected(id) {
      return this.selectedIds.has(id)
    },

    /**
     * 全选/取消全选
     *
     * @param {boolean} selected - 是否选中
     */
    toggleSelectAll(selected) {
      if (selected) {
        this.selectedIds = new Set(this.items.map(item => item.id))
      } else {
        this.selectedIds = new Set()
      }
    },

    /**
     * 获取选中的项
     *
     * @returns {Array}
     */
    getSelectedItems() {
      return this.items.filter(item => this.selectedIds.has(item.id))
    },

    /**
     * 清除选择
     */
    clearSelection() {
      this.selectedIds = new Set()
    },

    // ========== 无限滚动 ==========

    /**
     * 检查是否需要加载更多
     * @private
     */
    _checkLoadMore(container) {
      if (this.loadingMore || this.reachedEnd) return

      const threshold = 100 // 距离底部 100px 时触发
      const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight

      if (scrollBottom < threshold) {
        this.$dispatch('load-more')
      }
    },

    /**
     * 开始加载更多
     */
    startLoadMore() {
      this.loadingMore = true
    },

    /**
     * 结束加载更多
     *
     * @param {boolean} [hasMore=true] - 是否还有更多数据
     */
    endLoadMore(hasMore = true) {
      this.loadingMore = false
      this.reachedEnd = !hasMore
    },

    // ========== 动态行高支持 ==========

    /**
     * 设置项高度（动态行高模式）
     *
     * @param {number|string} id - 项 ID
     * @param {number} height - 高度
     */
    setItemHeight(id, height) {
      this.itemHeights[id] = height
    },

    /**
     * 计算动态行高的起始索引
     * @private
     */
    _findStartIndexDynamic() {
      let accHeight = 0
      for (let i = 0; i < this.items.length; i++) {
        const height = this.itemHeights[this.items[i].id] || this.itemHeight
        if (accHeight + height > this.scrollTop) {
          return Math.max(0, i - this.bufferSize)
        }
        accHeight += height
      }
      return 0
    },

    /**
     * 计算动态行高的偏移量
     * @private
     */
    _calculateOffsetDynamic() {
      let offset = 0
      for (let i = 0; i < this.startIndex; i++) {
        offset += this.itemHeights[this.items[i]?.id] || this.itemHeight
      }
      return offset
    },

    /**
     * 计算动态行高的滚动位置
     * @private
     */
    _calculateScrollTopDynamic(targetIndex) {
      let scrollTop = 0
      for (let i = 0; i < targetIndex; i++) {
        scrollTop += this.itemHeights[this.items[i]?.id] || this.itemHeight
      }
      return scrollTop
    },

    // ========== 键盘导航 ==========

    /** 当前焦点索引 */
    focusIndex: -1,

    /**
     * 处理键盘事件
     *
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeydown(e) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          this.focusNext()
          break
        case 'ArrowUp':
          e.preventDefault()
          this.focusPrev()
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          this.activateFocused()
          break
        case 'Home':
          e.preventDefault()
          this.focusFirst()
          break
        case 'End':
          e.preventDefault()
          this.focusLast()
          break
      }
    },

    /**
     * 聚焦下一项
     */
    focusNext() {
      if (this.focusIndex < this.items.length - 1) {
        this.focusIndex++
        this._ensureFocusVisible()
      }
    },

    /**
     * 聚焦上一项
     */
    focusPrev() {
      if (this.focusIndex > 0) {
        this.focusIndex--
        this._ensureFocusVisible()
      }
    },

    /**
     * 聚焦第一项
     */
    focusFirst() {
      this.focusIndex = 0
      this._ensureFocusVisible()
    },

    /**
     * 聚焦最后一项
     */
    focusLast() {
      this.focusIndex = this.items.length - 1
      this._ensureFocusVisible()
    },

    /**
     * 激活当前焦点项
     */
    activateFocused() {
      if (this.focusIndex >= 0 && this.focusIndex < this.items.length) {
        const item = this.items[this.focusIndex]
        this.toggleSelect(item.id)
        this.$dispatch('item-activate', { item, index: this.focusIndex })
      }
    },

    /**
     * 确保焦点项可见
     * @private
     */
    _ensureFocusVisible() {
      if (this.focusIndex < this.startIndex || this.focusIndex >= this.endIndex) {
        this.scrollToIndex(this.focusIndex, 'instant')
      }
    },

    /**
     * 检查项是否获得焦点
     *
     * @param {number} index - 相对于 visibleItems 的索引
     * @returns {boolean}
     */
    isFocused(index) {
      return this.startIndex + index === this.focusIndex
    }
  }
}

// ========== 虚拟表格组件（表格专用版本）==========

/**
 * 虚拟表格组件
 * 专为后台管理表格优化的虚拟列表
 *
 * @param {Object} config - 配置选项
 * @param {number} [config.rowHeight=48] - 行高
 * @param {Array} [config.columns=[]] - 列配置
 * @returns {Object} Alpine 组件数据
 */
function virtualTable(config = {}) {
  const base = virtualList({
    itemHeight: config.rowHeight || 48,
    bufferSize: config.bufferSize || 5,
    containerHeight: config.containerHeight || 400
  })

  return {
    ...base,

    // ========== 表格配置 ==========

    /** 列配置 */
    columns: config.columns || [],

    /** 行高 */
    rowHeight: config.rowHeight || 48,

    /** 是否显示行号 */
    showRowNumber: config.showRowNumber !== false,

    /** 是否显示选择列 */
    showSelection: config.showSelection !== false,

    /** 主键字段名 */
    primaryKey: config.primaryKey || 'id',

    // ========== 表格方法 ==========

    /**
     * 获取单元格值
     *
     * @param {Object} row - 行数据
     * @param {Object} column - 列配置
     * @returns {any}
     */
    getCellValue(row, column) {
      if (column.render && typeof column.render === 'function') {
        return column.render(row, column)
      }

      // 支持嵌套属性 (如 'user.name')
      if (column.field && column.field.includes('.')) {
        return column.field.split('.').reduce((obj, key) => obj?.[key], row)
      }

      return row[column.field]
    },

    /**
     * 格式化单元格显示
     *
     * @param {any} value - 单元格值
     * @param {Object} column - 列配置
     * @returns {string}
     */
    formatCell(value, column) {
      if (column.formatter && typeof column.formatter === 'function') {
        return column.formatter(value)
      }

      if (value === null || value === undefined) {
        return '-'
      }

      return String(value)
    },

    /**
     * 获取实际行号
     *
     * @param {number} index - 可见项索引
     * @returns {number}
     */
    getRowNumber(index) {
      return this.startIndex + index + 1
    },

    /**
     * 获取行 CSS 类
     *
     * @param {Object} row - 行数据
     * @param {number} index - 索引
     * @returns {string}
     */
    getRowClass(row, index) {
      const classes = []

      // 斑马纹
      if ((this.startIndex + index) % 2 === 1) {
        classes.push('table-row-striped')
      }

      // 选中状态
      if (this.isSelected(row[this.primaryKey])) {
        classes.push('table-row-selected')
      }

      // 焦点状态
      if (this.isFocused(index)) {
        classes.push('table-row-focused')
      }

      return classes.join(' ')
    },

    /**
     * 处理行点击
     *
     * @param {Object} row - 行数据
     * @param {number} index - 索引
     * @param {Event} event - 点击事件
     */
    handleRowClick(row, index, event) {
      this.focusIndex = this.startIndex + index

      // Ctrl/Cmd + Click: 切换选择
      if (event.ctrlKey || event.metaKey) {
        this.toggleSelect(row[this.primaryKey])
      }
      // Shift + Click: 范围选择
      else if (event.shiftKey && this._lastClickIndex !== undefined) {
        this._selectRange(this._lastClickIndex, this.focusIndex)
      }
      // 普通点击
      else {
        this.$dispatch('row-click', { row, index: this.startIndex + index })
      }

      this._lastClickIndex = this.focusIndex
    },

    /**
     * 处理行双击
     *
     * @param {Object} row - 行数据
     * @param {number} index - 索引
     */
    handleRowDblClick(row, index) {
      this.$dispatch('row-dblclick', { row, index: this.startIndex + index })
    },

    /**
     * 范围选择
     * @private
     */
    _selectRange(startIndex, endIndex) {
      const start = Math.min(startIndex, endIndex)
      const end = Math.max(startIndex, endIndex)

      for (let i = start; i <= end; i++) {
        if (this.items[i]) {
          this.selectedIds.add(this.items[i][this.primaryKey])
        }
      }

      this.selectedIds = new Set(this.selectedIds)
    },

    /** 上次点击索引（用于范围选择） */
    _lastClickIndex: undefined
  }
}

// ========== 注册为 Alpine 组件 ==========

document.addEventListener('alpine:init', () => {
  console.log('🔧 注册虚拟列表组件...')

  // 注册基础虚拟列表
  Alpine.data('virtualList', virtualList)

  // 注册虚拟表格
  Alpine.data('virtualTable', virtualTable)

  console.log('✅ 虚拟列表组件已注册')
})

// ========== 导出到全局 ==========

window.virtualList = virtualList
window.virtualTable = virtualTable

// ========== CSS 样式（可选，也可放入外部 CSS） ==========

// 注入基础样式
const virtualListStyles = `
  .virtual-list-container {
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
  
  .virtual-list-item {
    box-sizing: border-box;
  }
  
  .virtual-table-container {
    overflow: auto;
    position: relative;
  }
  
  .virtual-table {
    width: 100%;
    border-collapse: collapse;
  }
  
  .virtual-table th,
  .virtual-table td {
    padding: 0.75rem;
    border-bottom: 1px solid #dee2e6;
  }
  
  .virtual-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fff;
  }
  
  .table-row-striped {
    background-color: rgba(0, 0, 0, 0.02);
  }
  
  .table-row-selected {
    background-color: rgba(13, 110, 253, 0.1) !important;
  }
  
  .table-row-focused {
    outline: 2px solid rgba(13, 110, 253, 0.5);
    outline-offset: -2px;
  }
  
  .virtual-list-loading {
    text-align: center;
    padding: 1rem;
    color: #6c757d;
  }
  
  .virtual-list-empty {
    text-align: center;
    padding: 2rem;
    color: #6c757d;
  }
`

// 注入样式
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style')
  styleEl.id = 'virtual-list-styles'
  styleEl.textContent = virtualListStyles

  // 避免重复注入
  if (!document.getElementById('virtual-list-styles')) {
    document.head.appendChild(styleEl)
  }
}

console.log('✅ VirtualList 虚拟列表组件已加载')
