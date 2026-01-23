/**
 * 全局确认对话框 Store
 * 解决：重复的 confirm() 调用、不美观的原生对话框
 *
 * @file public/admin/js/alpine/stores/confirm-dialog.js
 * @description 提供美观的 Bootstrap Modal 确认对话框
 * @version 1.0.0
 * @date 2026-01-23
 *
 * @example
 * // 在组件中使用
 * async deleteUser() {
 *   const confirmed = await Alpine.store('confirm').show({
 *     title: '确认删除',
 *     message: '确定要删除此用户吗？删除后不可恢复。',
 *     type: 'danger'
 *   })
 *
 *   if (confirmed) {
 *     // 执行删除操作
 *   }
 * }
 *
 * // 快捷方法
 * const confirmed = await Alpine.store('confirm').danger('确定要删除吗？')
 */


import { logger } from '../../utils/logger.js'
document.addEventListener('alpine:init', () => {
  logger.info('🔧 注册确认对话框 Store...')

  /**
   * 确认对话框 Store
   */
  Alpine.store('confirm', {
    // ========== 状态 ==========

    /** 是否显示对话框 */
    visible: false,

    /** 对话框配置 */
    config: {
      title: '确认',
      message: '确定要执行此操作吗？',
      type: 'primary', // primary, success, warning, danger, info
      confirmText: '确定',
      cancelText: '取消',
      showCancel: true,
      icon: null, // 自定义图标
      loading: false
    },

    /** Promise 回调 */
    _resolve: null,

    /** Modal 实例 */
    _modalInstance: null,

    // ========== 方法 ==========

    /**
     * 显示确认对话框
     *
     * @param {Object|string} options - 配置选项或消息字符串
     * @returns {Promise<boolean>} 用户选择结果
     */
    show(options = {}) {
      // 支持简写：show('确定要删除吗？')
      if (typeof options === 'string') {
        options = { message: options }
      }

      // 合并配置
      this.config = {
        title: options.title || '确认',
        message: options.message || '确定要执行此操作吗？',
        type: options.type || 'primary',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        showCancel: options.showCancel !== false,
        icon: options.icon || this._getDefaultIcon(options.type),
        loading: false
      }

      // 确保 Modal DOM 存在
      this._ensureModalDOM()

      // 返回 Promise
      return new Promise(resolve => {
        this._resolve = resolve
        this.visible = true

        // 显示 Bootstrap Modal
        if (this._modalInstance) {
          this._modalInstance.show()
        }
      })
    },

    /**
     * 确认操作
     */
    confirm() {
      this.visible = false

      if (this._modalInstance) {
        this._modalInstance.hide()
      }

      if (this._resolve) {
        this._resolve(true)
        this._resolve = null
      }
    },

    /**
     * 取消操作
     */
    cancel() {
      this.visible = false

      if (this._modalInstance) {
        this._modalInstance.hide()
      }

      if (this._resolve) {
        this._resolve(false)
        this._resolve = null
      }
    },

    // ========== 快捷方法 ==========

    /**
     * 危险操作确认（红色）
     */
    danger(message, title = '危险操作') {
      return this.show({
        title,
        message,
        type: 'danger',
        confirmText: '确定删除'
      })
    },

    /**
     * 警告确认（黄色）
     */
    warning(message, title = '警告') {
      return this.show({
        title,
        message,
        type: 'warning'
      })
    },

    /**
     * 成功确认（绿色）
     */
    success(message, title = '成功') {
      return this.show({
        title,
        message,
        type: 'success',
        showCancel: false,
        confirmText: '知道了'
      })
    },

    /**
     * 信息确认（蓝色）
     */
    info(message, title = '提示') {
      return this.show({
        title,
        message,
        type: 'info'
      })
    },

    // ========== 私有方法 ==========

    /**
     * 获取默认图标
     * @private
     */
    _getDefaultIcon(type) {
      const icons = {
        primary: 'bi-question-circle',
        success: 'bi-check-circle',
        warning: 'bi-exclamation-triangle',
        danger: 'bi-exclamation-circle',
        info: 'bi-info-circle'
      }
      return icons[type] || icons.primary
    },

    /**
     * 确保 Modal DOM 存在
     * @private
     */
    _ensureModalDOM() {
      const modalId = 'globalConfirmModal'

      if (document.getElementById(modalId)) {
        if (!this._modalInstance) {
          const el = document.getElementById(modalId)
          if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            this._modalInstance = new bootstrap.Modal(el, { backdrop: 'static' })
          }
        }
        return
      }

      // 创建 Modal HTML
      const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}Label" aria-hidden="true"
             x-data
             @keydown.escape.window="Alpine.store('confirm').cancel()">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header" :class="'border-' + Alpine.store('confirm').config.type">
                <h5 class="modal-title" id="${modalId}Label">
                  <i class="bi me-2" :class="Alpine.store('confirm').config.icon"></i>
                  <span x-text="Alpine.store('confirm').config.title"></span>
                </h5>
                <button type="button" class="btn-close" @click="Alpine.store('confirm').cancel()"></button>
              </div>
              <div class="modal-body">
                <p class="mb-0" x-text="Alpine.store('confirm').config.message" style="white-space: pre-wrap;"></p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" 
                        x-show="Alpine.store('confirm').config.showCancel"
                        @click="Alpine.store('confirm').cancel()"
                        x-text="Alpine.store('confirm').config.cancelText">
                </button>
                <button type="button" 
                        class="btn"
                        :class="'btn-' + Alpine.store('confirm').config.type"
                        @click="Alpine.store('confirm').confirm()"
                        x-text="Alpine.store('confirm').config.confirmText"
                        :disabled="Alpine.store('confirm').config.loading">
                </button>
              </div>
            </div>
          </div>
        </div>
      `

      document.body.insertAdjacentHTML('beforeend', modalHTML)

      // 初始化 Bootstrap Modal
      const el = document.getElementById(modalId)
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        this._modalInstance = new bootstrap.Modal(el, { backdrop: 'static' })

        // 监听 Modal 隐藏事件
        el.addEventListener('hidden.bs.modal', () => {
          // 如果用户点击了遮罩或按了 ESC，触发取消
          if (this.visible) {
            this.cancel()
          }
        })
      }
    }
  })

  logger.info('确认对话框 Store 已注册')
})

// ========== ES Module 导出（方案 A：彻底 ES Module） ==========

/**
 * 全局确认函数（替代 window.confirm）
 *
 * @param {string} message - 确认消息
 * @param {Object} [options={}] - 额外选项
 * @returns {Promise<boolean>}
 *
 * @example
 * import { $confirm } from '@/alpine/stores/confirm-dialog.js'
 * if (await $confirm('确定要删除吗？')) {
 *   // 用户点击了确定
 * }
 */
export async function $confirm(message, options = {}) {
  if (typeof Alpine !== 'undefined' && Alpine.store('confirm')) {
    return Alpine.store('confirm').show({ message, ...options })
  }

  // 降级到原生 confirm
  return confirm(message)
}

/**
 * 危险操作确认快捷方法
 * @param {string} message - 确认消息
 * @param {string} title - 对话框标题
 * @returns {Promise<boolean>}
 */
export async function $confirmDanger(message, title = '危险操作') {
  if (typeof Alpine !== 'undefined' && Alpine.store('confirm')) {
    return Alpine.store('confirm').danger(message, title)
  }
  return confirm(message)
}

logger.info('确认对话框模块已加载')
