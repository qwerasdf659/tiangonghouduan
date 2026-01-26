/**
 * Modal 模态框组件（纯 Alpine.js + Tailwind CSS 版本）
 *
 * @file src/alpine/components/modal.js
 * @description 基于 Alpine.js + Tailwind CSS 的模态框组件（无 Bootstrap 依赖）
 * @version 2.0.0
 * @date 2026-01-26
 *
 * @example
 * // 基础用法
 * <div x-data="modal({ id: 'myModal' })">
 *   <button @click="open()">打开</button>
 *   <template x-teleport="body">
 *     <div x-show="isOpen" class="modal-backdrop" @click="close()">
 *       <div class="modal-dialog" @click.stop>
 *         <div class="modal-content">...</div>
 *       </div>
 *     </div>
 *   </template>
 * </div>
 *
 * // 使用 Store
 * Alpine.store('modal').open({ id: 'editUser', title: '编辑用户', data: userData })
 */

import { logger } from '../../utils/logger.js'

/**
 * Modal 组件数据
 * @param {Object} config - 配置选项
 * @param {string} config.id - 模态框 ID
 * @param {string} config.size - 尺寸 ('sm' | 'md' | 'lg' | 'xl' | 'full')
 * @param {boolean} config.static - 是否静态背景（点击外部不关闭）
 * @param {boolean} config.closable - 是否显示关闭按钮
 * @param {Function} config.onOpen - 打开时的回调
 * @param {Function} config.onClose - 关闭时的回调
 */
export function modal(config = {}) {
  return {
    id: config.id || 'modal-' + Date.now(),
    isOpen: false,
    isStatic: config.static || false,
    closable: config.closable !== false,
    size: config.size || 'md',
    title: config.title || '',
    data: null,
    _onOpen: config.onOpen || null,
    _onClose: config.onClose || null,

    /**
     * 初始化
     */
    init() {
      // 监听 ESC 键关闭
      this.$watch('isOpen', value => {
        if (value) {
          document.body.style.overflow = 'hidden'
          if (this._onOpen) this._onOpen(this.data)
        } else {
          document.body.style.overflow = ''
          if (this._onClose) this._onClose()
        }
      })
    },

    /**
     * 打开模态框
     * @param {Object} options - 打开选项
     * @param {any} options.data - 传递给模态框的数据
     * @param {string} options.title - 动态标题
     */
    open(options = {}) {
      if (options.data !== undefined) {
        this.data = options.data
      }
      if (options.title) {
        this.title = options.title
      }
      this.isOpen = true
      logger.debug(`[Modal] 打开模态框: ${this.id}`)
      return this.data
    },

    /**
     * 关闭模态框
     */
    close() {
      this.isOpen = false
      logger.debug(`[Modal] 关闭模态框: ${this.id}`)
    },

    /**
     * 切换模态框
     */
    toggle() {
      if (this.isOpen) {
        this.close()
      } else {
        this.open()
      }
    },

    /**
     * 点击背景处理
     */
    handleBackdropClick() {
      if (!this.isStatic) {
        this.close()
      }
    },

    /**
     * 键盘事件处理
     */
    handleKeydown(e) {
      if (e.key === 'Escape' && this.isOpen && !this.isStatic) {
        this.close()
      }
    },

    /**
     * 获取尺寸样式类
     */
    get sizeClass() {
      const sizes = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        full: 'max-w-full mx-4'
      }
      return sizes[this.size] || sizes.md
    },

    /**
     * Modal 容器属性绑定
     */
    get containerAttrs() {
      return {
        'x-show': 'isOpen',
        'x-transition:enter': 'transition ease-out duration-200',
        'x-transition:enter-start': 'opacity-0',
        'x-transition:enter-end': 'opacity-100',
        'x-transition:leave': 'transition ease-in duration-150',
        'x-transition:leave-start': 'opacity-100',
        'x-transition:leave-end': 'opacity-0',
        '@keydown.escape.window': 'handleKeydown($event)',
        class: 'fixed inset-0 z-50 overflow-y-auto',
        style: 'display: none;'
      }
    },

    /**
     * Modal 对话框属性绑定
     */
    get dialogAttrs() {
      return {
        'x-show': 'isOpen',
        'x-transition:enter': 'transition ease-out duration-200',
        'x-transition:enter-start': 'opacity-0 scale-95 translate-y-4',
        'x-transition:enter-end': 'opacity-100 scale-100 translate-y-0',
        'x-transition:leave': 'transition ease-in duration-150',
        'x-transition:leave-start': 'opacity-100 scale-100 translate-y-0',
        'x-transition:leave-end': 'opacity-0 scale-95 translate-y-4',
        '@click.stop': '',
        class: `relative themed-card rounded-lg shadow-xl w-full ${this.sizeClass} transform`
      }
    }
  }
}

/**
 * 确认对话框组件
 * 用于显示确认/取消的模态框
 */
export function confirmModal(config = {}) {
  return {
    ...modal({ id: config.id || 'confirmModal', static: true, size: 'sm' }),

    title: config.title || '确认操作',
    message: config.message || '确定要执行此操作吗？',
    confirmText: config.confirmText || '确定',
    cancelText: config.cancelText || '取消',
    confirmType: config.confirmType || 'primary', // primary, danger, warning, success
    loading: false,
    _resolvePromise: null,

    /**
     * 显示确认对话框（返回 Promise）
     */
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

    /**
     * 确认
     */
    async confirm() {
      this.loading = true
      if (this._resolvePromise) {
        this._resolvePromise(true)
        this._resolvePromise = null
      }
      this.loading = false
      this.close()
    },

    /**
     * 取消
     */
    cancel() {
      if (this._resolvePromise) {
        this._resolvePromise(false)
        this._resolvePromise = null
      }
      this.close()
    },

    /**
     * 获取确认按钮样式类
     */
    get confirmButtonClass() {
      const classes = {
        primary: 'bg-blue-500 hover:bg-blue-600 text-white',
        danger: 'bg-red-500 hover:bg-red-600 text-white',
        warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
        success: 'bg-green-500 hover:bg-green-600 text-white'
      }
      return classes[this.confirmType] || classes.primary
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
  // 优先使用 Alpine Store
  if (typeof Alpine !== 'undefined' && Alpine.store('confirm')) {
    return Alpine.store('confirm').show({ message, title })
  }
  // 降级到原生 confirm
  return confirm(message)
}

// 默认导出
export default modal

logger.info('Modal 组件已加载 (纯 Alpine.js + Tailwind 版本)')
