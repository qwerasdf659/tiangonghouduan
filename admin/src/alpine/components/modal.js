/**
 * Modal 模态框组件
 *
 * @file public/admin/js/alpine/components/modal.js
 * @description 基于 Alpine.js + Bootstrap 的模态框组件
 * @version 1.0.0
 * @date 2026-01-22
 *
 * 使用方式：
 * <div x-data="modal({ id: 'myModal' })">
 *   <button @click="open()">打开</button>
 *   <template x-teleport="body">
 *     <div class="modal" x-bind="modalAttrs">...</div>
 *   </template>
 * </div>
 */


import { logger } from '../../utils/logger.js'
/**
 * Modal 组件数据
 * @param {Object} config - 配置选项
 * @param {string} config.id - 模态框 ID
 * @param {boolean} config.static - 是否静态背景（点击外部不关闭）
 * @param {Function} config.onOpen - 打开时的回调
 * @param {Function} config.onClose - 关闭时的回调
 */
function modal(config = {}) {
  return {
    id: config.id || 'modal-' + Date.now(),
    isOpen: false,
    isStatic: config.static || false,
    _bsModal: null,

    // 初始化
    init() {
      // 监听 Bootstrap Modal 事件
      this.$nextTick(() => {
        const modalEl = document.getElementById(this.id)
        if (modalEl) {
          modalEl.addEventListener('hidden.bs.modal', () => {
            this.isOpen = false
            if (config.onClose) config.onClose()
          })
          modalEl.addEventListener('shown.bs.modal', () => {
            this.isOpen = true
            if (config.onOpen) config.onOpen()
          })
        }
      })
    },

    // 打开模态框
    open(data = {}) {
      const modalEl = document.getElementById(this.id)
      if (modalEl && typeof bootstrap !== 'undefined') {
        if (!this._bsModal) {
          this._bsModal = new bootstrap.Modal(modalEl, {
            backdrop: this.isStatic ? 'static' : true,
            keyboard: !this.isStatic
          })
        }
        this._bsModal.show()
      }
      return data
    },

    // 关闭模态框
    close() {
      if (this._bsModal) {
        this._bsModal.hide()
      }
    },

    // 切换模态框
    toggle() {
      if (this.isOpen) {
        this.close()
      } else {
        this.open()
      }
    },

    // Modal 属性绑定
    get modalAttrs() {
      return {
        id: this.id,
        class: 'modal fade',
        tabindex: '-1',
        'aria-labelledby': `${this.id}Label`,
        'aria-hidden': !this.isOpen
      }
    }
  }
}

/**
 * 确认对话框组件
 * 用于显示确认/取消的模态框
 */
function confirmModal(config = {}) {
  return {
    ...modal({ id: config.id || 'confirmModal', static: true }),

    title: config.title || '确认操作',
    message: config.message || '确定要执行此操作吗？',
    confirmText: config.confirmText || '确定',
    cancelText: config.cancelText || '取消',
    confirmType: config.confirmType || 'primary',
    loading: false,
    _resolvePromise: null,

    // 显示确认对话框（返回 Promise）
    async show(options = {}) {
      this.title = options.title || this.title
      this.message = options.message || this.message
      this.confirmText = options.confirmText || this.confirmText
      this.cancelText = options.cancelText || this.cancelText
      this.confirmType = options.confirmType || this.confirmType

      return new Promise(resolve => {
        this._resolvePromise = resolve
        this.open()
      })
    },

    // 确认
    async confirm() {
      this.loading = true
      if (this._resolvePromise) {
        this._resolvePromise(true)
        this._resolvePromise = null
      }
      this.loading = false
      this.close()
    },

    // 取消
    cancel() {
      if (this._resolvePromise) {
        this._resolvePromise(false)
        this._resolvePromise = null
      }
      this.close()
    }
  }
}

/**
 * 确认对话框帮助函数
 * @param {string} message - 确认消息
 * @param {string} title - 对话框标题
 * @returns {Promise<boolean>} 用户选择结果
 */
export async function showConfirm(message, title = '确认操作') {
  return new Promise(resolve => {
    if (confirm(message)) {
      resolve(true)
    } else {
      resolve(false)
    }
  })
}

// ========== window.xxx 已移除（方案 A：彻底 ES Module） ==========
// 请使用 ES Module 导入：
//   import { showConfirm } from '@/alpine/components/modal.js'

logger.info('Modal 组件已加载')
