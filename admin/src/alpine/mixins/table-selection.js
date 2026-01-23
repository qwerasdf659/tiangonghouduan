/**
 * 表格选择 Mixin（ES Module 版本）
 *
 * @description 提供表格全选、单选和批量操作功能
 * @version 2.0.0
 * @date 2026-01-23
 *
 * @example
 * import { tableSelectionMixin } from '@/alpine/mixins/index.js'
 *
 * function myPage() {
 *   return {
 *     ...tableSelectionMixin('id'),
 *     data: [],
 *     deleteSelected() {
 *       const ids = this.selectedIds
 *       // 删除逻辑...
 *     }
 *   }
 * }
 */
export function tableSelectionMixin(idField = 'id') {
  return {
    // ========== 选择状态 ==========

    /** 已选择的 ID 列表 */
    selectedIds: [],

    /** 是否全选 */
    selectAll: false,

    // ========== 计算属性 ==========

    /**
     * 是否有选中的项目
     * @returns {boolean}
     */
    get hasSelected() {
      return this.selectedIds.length > 0
    },

    /**
     * 选中数量
     * @returns {number}
     */
    get selectedCount() {
      return this.selectedIds.length
    },

    /**
     * 是否全部选中
     * @returns {boolean}
     */
    get isAllSelected() {
      if (!this.data || this.data.length === 0) return false
      return this.data.every(item => this.isSelected(item))
    },

    /**
     * 是否部分选中（用于全选复选框的 indeterminate 状态）
     * @returns {boolean}
     */
    get isPartialSelected() {
      return this.hasSelected && !this.isAllSelected
    },

    // ========== 方法 ==========

    /**
     * 检查项目是否被选中
     * @param {Object} item - 项目数据
     * @returns {boolean}
     */
    isSelected(item) {
      const id = item[idField]
      return this.selectedIds.includes(id)
    },

    /**
     * 切换单个项目的选择状态
     * @param {Object} item - 项目数据
     */
    toggleSelect(item) {
      const id = item[idField]
      const index = this.selectedIds.indexOf(id)

      if (index === -1) {
        this.selectedIds.push(id)
      } else {
        this.selectedIds.splice(index, 1)
      }

      // 更新全选状态
      this.selectAll = this.isAllSelected
    },

    /**
     * 切换全选状态
     */
    toggleSelectAll() {
      if (this.isAllSelected) {
        // 取消全选
        this.selectedIds = []
        this.selectAll = false
      } else {
        // 全选
        this.selectedIds = (this.data || []).map(item => item[idField])
        this.selectAll = true
      }
    },

    /**
     * 选择指定项目
     * @param {Object} item - 项目数据
     */
    select(item) {
      const id = item[idField]
      if (!this.selectedIds.includes(id)) {
        this.selectedIds.push(id)
      }
    },

    /**
     * 取消选择指定项目
     * @param {Object} item - 项目数据
     */
    deselect(item) {
      const id = item[idField]
      const index = this.selectedIds.indexOf(id)
      if (index !== -1) {
        this.selectedIds.splice(index, 1)
      }
    },

    /**
     * 清空所有选择
     */
    clearSelection() {
      this.selectedIds = []
      this.selectAll = false
    },

    /**
     * 获取选中的项目对象列表
     * @returns {Array} 选中的项目列表
     */
    getSelectedItems() {
      return (this.data || []).filter(item => this.isSelected(item))
    },

    /**
     * 批量选择操作后重置
     * 用于批量删除等操作完成后清理状态
     */
    afterBatchOperation() {
      this.clearSelection()
      if (typeof this.loadData === 'function') {
        this.loadData()
      }
    }
  }
}
