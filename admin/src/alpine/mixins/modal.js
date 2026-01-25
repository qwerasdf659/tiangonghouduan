/**
 * Modal 管理 Mixin（ES Module 版本 - x-ref + Alpine.js 响应式状态）
 *
 * @description 提供统一的 Modal 显示/隐藏/切换 API，支持 x-show 指令
 * @version 2.1.0 - 添加响应式状态支持，兼容 x-show 指令
 * @date 2026-01-23
 *
 * @example
 * import { modalMixin } from '@/alpine/mixins/index.js'
 *
 * function myPage() {
 *   return {
 *     ...modalMixin(),
 *     openAddForm() {
 *       this.resetForm()
 *       this.showModal('addModal')
 *     },
 *     async saveForm() {
 *       // 保存逻辑...
 *       this.hideModal('addModal')
 *     }
 *   }
 * }
 *
 * // HTML 中使用（两种方式均可）：
 *
 * // 方式1：使用 isModalOpen() 响应式检查（推荐）
 * // <div x-ref="addModal" x-show="isModalOpen('addModal')" x-cloak>...</div>
 *
 * // 方式2：使用纯 CSS 控制（适用于需要遮罩层的场景）
 * // <div x-ref="addModal" style="display:none">...</div>
 *
 * // <button @click="openAddForm()">新增</button>
 */

import { logger } from '../../utils/logger.js'
export function modalMixin() {
  return {
    // ========== 响应式状态 ==========

    /** 当前打开的 Modal 集合（响应式，供 x-show 使用） */
    _modalStates: {},

    /** 当前打开的 Modal 列表（支持多 Modal 同时打开） */
    _openModals: [],

    // ========== 方法 ==========

    /**
     * 检查 Modal 是否打开（响应式，用于 x-show）
     * @param {string} refName - x-ref 名称
     * @returns {boolean}
     */
    isModalOpen(refName) {
      return this._modalStates[refName] === true
    },

    /**
     * 显示 Modal
     * @param {string} refName - x-ref 名称
     * @param {Object} options - 配置选项
     */
    showModal(refName, options = {}) {
      // 更新响应式状态（供 x-show 使用）
      this._modalStates = { ...this._modalStates, [refName]: true }

      // 操作 DOM 元素（兼容旧实现）
      const modalEl = this.$refs?.[refName]
      if (modalEl) {
        modalEl.classList.add('show')
        // 不强制设置 display:block，让 x-show 控制
      }

      // 设置 body 样式
      document.body.classList.add('modal-open')
      document.body.style.overflow = 'hidden'

      // 检查 Modal 内是否已有遮罩层（子元素中有 bg-black/50 类）
      const hasInlineBackdrop = modalEl?.querySelector('[class*="bg-black"]')

      // 仅当 Modal 没有内置遮罩层且明确需要时才创建
      if (options.backdrop === true && !hasInlineBackdrop) {
        this._createBackdrop(refName)
      }

      // 记录打开状态
      if (!this._openModals.includes(refName)) {
        this._openModals.push(refName)
      }

      // 触发事件
      if (this.$dispatch) {
        this.$dispatch('modal-shown', { name: refName })
      }

      logger.debug(`[ModalMixin] 显示 Modal: ${refName}`)
      return true
    },

    /**
     * 隐藏 Modal
     * @param {string} refName - x-ref 名称
     */
    hideModal(refName) {
      // 更新响应式状态（供 x-show 使用）
      this._modalStates = { ...this._modalStates, [refName]: false }

      // 操作 DOM 元素（兼容旧实现）
      const modalEl = this.$refs?.[refName]
      if (modalEl) {
        modalEl.classList.remove('show')
        // 不强制设置 display:none，让 x-show 控制
      }

      // 移除可能创建的遮罩层
      this._removeBackdrop(refName)

      // 更新打开状态
      this._openModals = this._openModals.filter(name => name !== refName)

      // 如果没有其他 Modal 打开，移除 body 类
      if (this._openModals.length === 0) {
        document.body.classList.remove('modal-open')
        document.body.style.overflow = ''
      }

      // 触发事件
      if (this.$dispatch) {
        this.$dispatch('modal-hidden', { name: refName })
      }

      logger.debug(`[ModalMixin] 隐藏 Modal: ${refName}`)
      return true
    },

    /**
     * 切换 Modal
     * @param {string} refName - x-ref 名称
     */
    toggleModal(refName) {
      if (this._openModals.includes(refName)) {
        return this.hideModal(refName)
      } else {
        return this.showModal(refName)
      }
    },

    /**
     * 检查 Modal 是否正在显示
     * @param {string} refName - x-ref 名称
     * @returns {boolean}
     */
    isModalShown(refName) {
      return this._modalStates[refName] === true || this._openModals.includes(refName)
    },

    /**
     * 创建遮罩层
     * @private
     */
    _createBackdrop(refName) {
      // 检查是否已存在
      if (document.querySelector(`.modal-backdrop[data-modal-ref="${refName}"]`)) {
        return
      }

      const backdrop = document.createElement('div')
      backdrop.className = 'modal-backdrop fade show'
      backdrop.dataset.modalRef = refName
      backdrop.style.cssText =
        'position: fixed; inset: 0; z-index: 1040; background-color: rgba(0,0,0,0.5);'
      backdrop.addEventListener('click', () => this.hideModal(refName))
      document.body.appendChild(backdrop)
    },

    /**
     * 移除遮罩层
     * @private
     */
    _removeBackdrop(refName) {
      const backdrop = document.querySelector(`.modal-backdrop[data-modal-ref="${refName}"]`)
      if (backdrop) {
        backdrop.remove()
      }
    },

    /**
     * 快捷方法：显示确认删除模态框
     *
     * @param {Object} item - 要删除的项目数据
     * @param {string} [modalRef='deleteModal'] - Modal 引用名
     */
    showDeleteConfirm(item, modalRef = 'deleteModal') {
      this.itemToDelete = item
      this.showModal(modalRef)
    },

    /**
     * 快捷方法：显示编辑模态框
     *
     * @param {Object} item - 要编辑的项目数据
     * @param {string} [modalRef='editModal'] - Modal 引用名
     */
    showEditModal(item, modalRef = 'editModal') {
      // 深拷贝避免直接修改原数据
      this.editForm = JSON.parse(JSON.stringify(item))
      this.editingId = item.id || item[Object.keys(item)[0]]
      this.showModal(modalRef)
    },

    /**
     * 销毁所有 Modal（页面卸载时调用）
     */
    destroyAllModals() {
      this._openModals.forEach(refName => {
        this.hideModal(refName)
      })
      this._openModals = []
    }
  }
}
