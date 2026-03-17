/**
 * 拖拽排序公共 Mixin（useSortable）
 *
 * @file admin/src/alpine/mixins/sortable.js
 * @description 三个管理页面（兑换商品/交易市场/活动管理）复用排序逻辑
 * @version 1.0.0
 * @date 2026-03-17
 *
 * 使用方式：
 *   import { useSortable } from '@/alpine/mixins/sortable.js'
 *
 *   // 在 Alpine 组件中混入
 *   const sortableMixin = useSortable({
 *     listKey: 'items',
 *     idKey: 'exchange_item_id',
 *     onSave: async (sortedItems) => { await api.batchSort(sortedItems) }
 *   })
 */

import { logger } from '../../utils/logger.js'

/**
 * 创建可排序 Mixin
 *
 * @param {Object} config - 排序配置
 * @param {string} config.listKey - 列表数据在组件中的属性名（如 'items'）
 * @param {string} config.idKey - 主键字段名（如 'exchange_item_id'）
 * @param {string} [config.sortKey='sort_order'] - 排序字段名
 * @param {Function} config.onSave - 保存排序回调，接收 [{id, sort_order}] 数组
 * @returns {Object} Mixin 状态和方法
 */
export function useSortable(config = {}) {
  const { listKey, idKey, sortKey = 'sort_order', onSave } = config

  return {
    /** @type {boolean} 是否处于排序模式 */
    sortMode: false,
    /** @type {Array<Object>} 排序模式下的临时列表副本 */
    sortableList: [],
    /** @type {boolean} 排序是否有变更 */
    sortDirty: false,
    /** @type {boolean} 排序保存中 */
    sortSaving: false,

    /**
     * 进入排序模式（复制当前列表到临时变量）
     */
    enterSortMode() {
      const source = this[listKey] || []
      this.sortableList = source.map((item, idx) => ({
        ...item,
        _original_sort: item[sortKey],
        _idx: idx
      }))
      this.sortMode = true
      this.sortDirty = false
      logger.debug('[Sortable] 进入排序模式', { count: this.sortableList.length })
    },

    /**
     * 退出排序模式（不保存）
     */
    exitSortMode() {
      this.sortMode = false
      this.sortableList = []
      this.sortDirty = false
    },

    /**
     * 上移一项
     * @param {number} index - 当前索引
     */
    moveSortItemUp(index) {
      if (index <= 0) return
      const list = this.sortableList
      ;[list[index - 1], list[index]] = [list[index], list[index - 1]]
      this.sortDirty = true
    },

    /**
     * 下移一项
     * @param {number} index - 当前索引
     */
    moveSortItemDown(index) {
      if (index >= this.sortableList.length - 1) return
      const list = this.sortableList
      ;[list[index], list[index + 1]] = [list[index + 1], list[index]]
      this.sortDirty = true
    },

    /**
     * 保存排序结果
     */
    async saveSortOrder() {
      if (!this.sortDirty || !onSave) {
        this.exitSortMode()
        return
      }

      const sortedItems = this.sortableList.map((item, idx) => ({
        [idKey]: item[idKey],
        [sortKey]: (idx + 1) * 10
      }))

      try {
        this.sortSaving = true
        await onSave.call(this, sortedItems)
        this.exitSortMode()
      } catch (e) {
        logger.error('[Sortable] 保存排序失败:', e)
        this.showError?.('保存排序失败')
      } finally {
        this.sortSaving = false
      }
    }
  }
}

export default { useSortable }
