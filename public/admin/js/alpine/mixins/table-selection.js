/**
 * 表格选择 Mixin
 * 解决：重复的表格多选逻辑（约 25 行/页面）
 * 
 * @file public/admin/js/alpine/mixins/table-selection.js
 * @description 提供表格行多选、全选、选中状态管理功能
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * function myPage() {
 *   return {
 *     ...tableSelectionMixin('user_id'),  // 指定主键字段
 *     data: [],
 *     async batchDelete() {
 *       if (this.selectedCount === 0) {
 *         this.showWarning('请选择要删除的项目')
 *         return
 *       }
 *       const ids = this.selectedRows.join(',')
 *       await apiRequest('/api/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) })
 *       this.clearSelection()
 *       this.loadData()
 *     }
 *   }
 * }
 * 
 * // HTML 中使用：
 * // <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll($event.target.checked, data)">
 * // <input type="checkbox" :checked="isSelected(item.user_id)" @change="toggleSelect(item.user_id)">
 */
function tableSelectionMixin(primaryKey = 'id') {
  return {
    // ========== 选择状态 ==========
    
    /** 选中的行 ID 列表 */
    selectedRows: [],
    
    // ========== 计算属性 ==========
    
    /**
     * 是否全部选中
     * @returns {boolean}
     */
    get isAllSelected() {
      const data = this.data || []
      return data.length > 0 && this.selectedRows.length === data.length
    },
    
    /**
     * 是否部分选中（用于全选复选框的不确定状态）
     * @returns {boolean}
     */
    get isPartialSelected() {
      const data = this.data || []
      return this.selectedRows.length > 0 && this.selectedRows.length < data.length
    },
    
    /**
     * 选中数量
     * @returns {number}
     */
    get selectedCount() {
      return this.selectedRows.length
    },
    
    /**
     * 是否有选中项
     * @returns {boolean}
     */
    get hasSelection() {
      return this.selectedRows.length > 0
    },
    
    // ========== 方法 ==========
    
    /**
     * 全选/取消全选
     * 
     * @param {boolean} checked - 是否选中
     * @param {Array} [data] - 数据列表（默认使用 this.data）
     */
    toggleSelectAll(checked, data = this.data) {
      if (checked) {
        // 全选：提取所有数据的主键
        this.selectedRows = data.map(row => {
          // 支持嵌套主键，如 'user.id'
          return primaryKey.includes('.') 
            ? primaryKey.split('.').reduce((obj, key) => obj?.[key], row)
            : row[primaryKey]
        }).filter(id => id !== undefined && id !== null)
      } else {
        // 取消全选
        this.selectedRows = []
      }
      
      console.log(`[TableSelection] ${checked ? '全选' : '取消全选'}, 当前选中: ${this.selectedRows.length} 项`)
    },
    
    /**
     * 切换单行选择
     * 
     * @param {any} id - 行 ID（主键值）
     */
    toggleSelect(id) {
      const index = this.selectedRows.indexOf(id)
      if (index > -1) {
        // 已选中，移除
        this.selectedRows.splice(index, 1)
      } else {
        // 未选中，添加
        this.selectedRows.push(id)
      }
    },
    
    /**
     * 选中指定行
     * 
     * @param {any} id - 行 ID（主键值）
     */
    selectRow(id) {
      if (!this.selectedRows.includes(id)) {
        this.selectedRows.push(id)
      }
    },
    
    /**
     * 取消选中指定行
     * 
     * @param {any} id - 行 ID（主键值）
     */
    deselectRow(id) {
      const index = this.selectedRows.indexOf(id)
      if (index > -1) {
        this.selectedRows.splice(index, 1)
      }
    },
    
    /**
     * 检查行是否被选中
     * 
     * @param {any} id - 行 ID（主键值）
     * @returns {boolean}
     */
    isSelected(id) {
      return this.selectedRows.includes(id)
    },
    
    /**
     * 清空所有选择
     */
    clearSelection() {
      this.selectedRows = []
      console.log('[TableSelection] 清空选择')
    },
    
    /**
     * 获取选中的行数据
     * 
     * @param {Array} [data] - 数据列表（默认使用 this.data）
     * @returns {Array} 选中的数据对象数组
     */
    getSelectedData(data = this.data) {
      return data.filter(row => {
        const id = primaryKey.includes('.') 
          ? primaryKey.split('.').reduce((obj, key) => obj?.[key], row)
          : row[primaryKey]
        return this.selectedRows.includes(id)
      })
    },
    
    /**
     * 获取选中的 ID 列表（逗号分隔字符串）
     * 
     * @returns {string}
     */
    getSelectedIdsString() {
      return this.selectedRows.join(',')
    },
    
    /**
     * 批量选中指定的行
     * 
     * @param {Array} ids - 要选中的 ID 数组
     */
    selectRows(ids) {
      ids.forEach(id => {
        if (!this.selectedRows.includes(id)) {
          this.selectedRows.push(id)
        }
      })
    },
    
    /**
     * 批量取消选中指定的行
     * 
     * @param {Array} ids - 要取消选中的 ID 数组
     */
    deselectRows(ids) {
      this.selectedRows = this.selectedRows.filter(id => !ids.includes(id))
    },
    
    /**
     * 反选（选中未选中的，取消已选中的）
     * 
     * @param {Array} [data] - 数据列表（默认使用 this.data）
     */
    invertSelection(data = this.data) {
      const allIds = data.map(row => {
        return primaryKey.includes('.') 
          ? primaryKey.split('.').reduce((obj, key) => obj?.[key], row)
          : row[primaryKey]
      })
      
      this.selectedRows = allIds.filter(id => !this.selectedRows.includes(id))
    },
    
    /**
     * 在数据变化后清理无效的选中项
     * 当数据刷新后，某些选中的ID可能已不存在
     * 
     * @param {Array} [data] - 数据列表（默认使用 this.data）
     */
    cleanupSelection(data = this.data) {
      const validIds = data.map(row => {
        return primaryKey.includes('.') 
          ? primaryKey.split('.').reduce((obj, key) => obj?.[key], row)
          : row[primaryKey]
      })
      
      const originalCount = this.selectedRows.length
      this.selectedRows = this.selectedRows.filter(id => validIds.includes(id))
      
      if (originalCount !== this.selectedRows.length) {
        console.log(`[TableSelection] 清理无效选中项: ${originalCount} -> ${this.selectedRows.length}`)
      }
    }
  }
}

// 导出到全局作用域
window.tableSelectionMixin = tableSelectionMixin

console.log('✅ TableSelection Mixin 已加载')

