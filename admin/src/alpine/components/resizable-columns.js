/**
 * 表格列宽拖拽组件
 *
 * @file src/alpine/components/resizable-columns.js
 * @description 支持拖拽调整表格列宽度
 * @version 1.0.0
 * @date 2026-01-27
 *
 * @example
 * <table x-data="resizableColumns({ minWidth: 80, maxWidth: 400 })">
 *   <thead>
 *     <tr>
 *       <th class="resizable-header">
 *         <span>列标题</span>
 *         <div class="resize-handle" @mousedown="startResize($event, 0)"></div>
 *       </th>
 *     </tr>
 *   </thead>
 * </table>
 */

import { logger } from '../../utils/logger.js'

/**
 * 可调整列宽组件
 * @param {Object} config - 配置选项
 * @param {number} config.minWidth - 最小列宽
 * @param {number} config.maxWidth - 最大列宽
 * @param {boolean} config.persistWidths - 是否持久化列宽
 * @param {string} config.storageKey - 存储键名
 * @returns {Object} Alpine 组件数据
 */
export function resizableColumns(config = {}) {
  return {
    columnWidths: [],
    resizing: false,
    activeColumn: -1,
    startX: 0,
    startWidth: 0,
    minWidth: config.minWidth || 60,
    maxWidth: config.maxWidth || 500,
    persistWidths: config.persistWidths || false,
    storageKey: config.storageKey || 'table-column-widths',

    /**
     * 初始化组件
     */
    init() {
      this.$nextTick(() => {
        const table = this.$el
        const headers = table.querySelectorAll('th')

        // 初始化列宽
        headers.forEach((header, index) => {
          const width = header.offsetWidth
          this.columnWidths[index] = width

          // 添加 resize handle
          if (!header.querySelector('.resize-handle')) {
            const handle = document.createElement('div')
            handle.className = 'resize-handle'
            handle.addEventListener('mousedown', e => this.startResize(e, index))
            header.appendChild(handle)
            header.classList.add('resizable-header')
          }
        })

        // 恢复保存的列宽
        if (this.persistWidths) {
          this.loadWidths()
        }

        // 监听全局鼠标事件
        document.addEventListener('mousemove', this.doResize.bind(this))
        document.addEventListener('mouseup', this.stopResize.bind(this))
      })
    },

    /**
     * 开始调整大小
     * @param {MouseEvent} event - 鼠标事件
     * @param {number} columnIndex - 列索引
     */
    startResize(event, columnIndex) {
      event.preventDefault()
      event.stopPropagation()

      this.resizing = true
      this.activeColumn = columnIndex
      this.startX = event.pageX
      this.startWidth = this.columnWidths[columnIndex]

      // 添加调整中的样式
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      logger.debug('[ResizableColumns] 开始调整列', columnIndex)
    },

    /**
     * 执行调整
     * @param {MouseEvent} event - 鼠标事件
     */
    doResize(event) {
      if (!this.resizing) return

      const diff = event.pageX - this.startX
      let newWidth = this.startWidth + diff

      // 限制宽度范围
      newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth))

      // 更新列宽
      this.columnWidths[this.activeColumn] = newWidth

      // 应用到表格
      this.applyWidth(this.activeColumn, newWidth)
    },

    /**
     * 停止调整
     */
    stopResize() {
      if (!this.resizing) return

      this.resizing = false
      this.activeColumn = -1

      // 移除调整中的样式
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      // 持久化
      if (this.persistWidths) {
        this.saveWidths()
      }

      logger.debug('[ResizableColumns] 停止调整')
    },

    /**
     * 应用列宽
     * @param {number} index - 列索引
     * @param {number} width - 宽度
     */
    applyWidth(index, width) {
      const table = this.$el
      const headers = table.querySelectorAll('th')
      const cells = table.querySelectorAll(`td:nth-child(${index + 1})`)

      if (headers[index]) {
        headers[index].style.width = `${width}px`
        headers[index].style.minWidth = `${width}px`
      }

      cells.forEach(cell => {
        cell.style.width = `${width}px`
        cell.style.minWidth = `${width}px`
      })
    },

    /**
     * 保存列宽到 localStorage
     */
    saveWidths() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.columnWidths))
      } catch (error) {
        logger.warn('[ResizableColumns] 保存列宽失败:', error)
      }
    },

    /**
     * 从 localStorage 加载列宽
     */
    loadWidths() {
      try {
        const saved = localStorage.getItem(this.storageKey)
        if (saved) {
          const widths = JSON.parse(saved)
          widths.forEach((width, index) => {
            if (typeof width === 'number' && width >= this.minWidth) {
              this.columnWidths[index] = width
              this.applyWidth(index, width)
            }
          })
        }
      } catch (error) {
        logger.warn('[ResizableColumns] 加载列宽失败:', error)
      }
    },

    /**
     * 重置所有列宽
     */
    resetWidths() {
      const table = this.$el
      const headers = table.querySelectorAll('th')

      headers.forEach((header, index) => {
        header.style.width = ''
        header.style.minWidth = ''
        this.columnWidths[index] = header.offsetWidth
      })

      if (this.persistWidths) {
        localStorage.removeItem(this.storageKey)
      }
    },

    /**
     * 销毁组件
     */
    destroy() {
      document.removeEventListener('mousemove', this.doResize)
      document.removeEventListener('mouseup', this.stopResize)
    }
  }
}

// 添加必要的 CSS 样式（内联）
const style = document.createElement('style')
style.textContent = `
.resizable-header {
  position: relative;
  user-select: none;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background-color 0.2s;
}

.resize-handle:hover,
.resize-handle:active {
  background-color: rgba(59, 130, 246, 0.5);
}
`
document.head.appendChild(style)

export default { resizableColumns }
