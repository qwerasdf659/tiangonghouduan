/**
 * 全局确认对话框 Store
 * 解决：重复的 confirm() 调用、不美观的原生对话框
 *
 * @file admin/src/alpine/stores/confirm-dialog.js
 * @description 提供美观的 Tailwind CSS + Alpine.js 确认对话框（不依赖 Bootstrap）
 * @version 2.0.0
 * @date 2026-01-26
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
  logger.info('🔧 注册确认对话框 Store (Tailwind 版本)...')

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

    /** DOM 是否已初始化 */
    _domInitialized: false,

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
        logger.debug('[ConfirmDialog] 显示对话框', this.config)
      })
    },

    /**
     * 确认操作
     */
    confirm() {
      logger.debug('[ConfirmDialog] 用户点击确认')
      this.visible = false

      if (this._resolve) {
        this._resolve(true)
        this._resolve = null
      }
    },

    /**
     * 取消操作
     */
    cancel() {
      logger.debug('[ConfirmDialog] 用户点击取消')
      this.visible = false

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
        confirmText: '确定'
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
     * 获取默认图标（使用 emoji 替代 Bootstrap Icons）
     * @private
     */
    _getDefaultIcon(type) {
      const icons = {
        primary: '❓',
        success: '✅',
        warning: '⚠️',
        danger: '🚨',
        info: 'ℹ️'
      }
      return icons[type] || icons.primary
    },

    /**
     * 获取按钮样式类
     * @private
     */
    _getButtonClass(type) {
      const classes = {
        primary: 'bg-blue-500 hover:bg-blue-600 text-white',
        success: 'bg-green-500 hover:bg-green-600 text-white',
        warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
        danger: 'bg-red-500 hover:bg-red-600 text-white',
        info: 'bg-blue-400 hover:bg-blue-500 text-white'
      }
      return classes[type] || classes.primary
    },

    /**
     * 获取标题样式类
     * @private
     */
    _getTitleClass(type) {
      const classes = {
        primary: 'text-blue-600',
        success: 'text-green-600',
        warning: 'text-yellow-600',
        danger: 'text-red-600',
        info: 'text-blue-500'
      }
      return classes[type] || classes.primary
    },

    /**
     * 确保 Modal DOM 存在（纯 Tailwind CSS 实现）
     * @private
     */
    _ensureModalDOM() {
      const modalId = 'globalConfirmModal'

      if (document.getElementById(modalId)) {
        return
      }

      // 创建 Tailwind CSS Modal HTML
      const modalHTML = `
        <div id="${modalId}" 
             x-data="{ get store() { return Alpine.store('confirm') } }"
             x-show="store.visible"
             x-transition:enter="transition ease-out duration-200"
             x-transition:enter-start="opacity-0"
             x-transition:enter-end="opacity-100"
             x-transition:leave="transition ease-in duration-150"
             x-transition:leave-start="opacity-100"
             x-transition:leave-end="opacity-0"
             @keydown.escape.window="store.visible && store.cancel()"
             class="fixed inset-0 z-[9999] overflow-y-auto"
             style="display: none;">
          
          <!-- 背景遮罩 -->
          <div class="fixed inset-0 bg-black bg-opacity-50 transition-opacity" 
               @click="store.cancel()"></div>
          
          <!-- 对话框容器 -->
          <div class="flex min-h-full items-center justify-center p-4">
            <!-- 对话框内容 -->
            <div x-show="store.visible"
                 x-transition:enter="transition ease-out duration-200"
                 x-transition:enter-start="opacity-0 scale-95"
                 x-transition:enter-end="opacity-100 scale-100"
                 x-transition:leave="transition ease-in duration-150"
                 x-transition:leave-start="opacity-100 scale-100"
                 x-transition:leave-end="opacity-0 scale-95"
                 class="relative bg-white rounded-lg shadow-xl w-full max-w-md transform"
                 @click.stop>
              
              <!-- 头部 -->
              <div class="px-6 py-4 border-b border-gray-200">
                <h3 class="text-lg font-semibold flex items-center gap-2"
                    :class="{
                      'text-blue-600': store.config.type === 'primary',
                      'text-green-600': store.config.type === 'success',
                      'text-yellow-600': store.config.type === 'warning',
                      'text-red-600': store.config.type === 'danger',
                      'text-blue-500': store.config.type === 'info'
                    }">
                  <span x-text="store.config.icon"></span>
                  <span x-text="store.config.title"></span>
                </h3>
              </div>
              
              <!-- 内容 -->
              <div class="px-6 py-4">
                <p class="text-gray-700 whitespace-pre-wrap" x-text="store.config.message"></p>
              </div>
              
              <!-- 底部按钮 -->
              <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button x-show="store.config.showCancel"
                        @click="store.cancel()"
                        class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        x-text="store.config.cancelText">
                </button>
                <button @click="store.confirm()"
                        class="px-4 py-2 rounded-lg transition-colors"
                        :class="{
                          'bg-blue-500 hover:bg-blue-600 text-white': store.config.type === 'primary',
                          'bg-green-500 hover:bg-green-600 text-white': store.config.type === 'success',
                          'bg-yellow-500 hover:bg-yellow-600 text-white': store.config.type === 'warning',
                          'bg-red-500 hover:bg-red-600 text-white': store.config.type === 'danger',
                          'bg-blue-400 hover:bg-blue-500 text-white': store.config.type === 'info'
                        }"
                        :disabled="store.config.loading"
                        x-text="store.config.confirmText">
                </button>
              </div>
            </div>
          </div>
        </div>
      `

      document.body.insertAdjacentHTML('beforeend', modalHTML)
      this._domInitialized = true
      logger.info('[ConfirmDialog] Tailwind Modal DOM 已创建')
    }
  })

  logger.info('✅ 确认对话框 Store 已注册 (Tailwind 版本)')
})

// ========== ES Module 导出 ==========

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

logger.info('确认对话框模块已加载 (Tailwind 版本)')
