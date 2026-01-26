/**
 * Toast 消息通知组件（纯 Tailwind CSS 版本）
 *
 * @file src/alpine/components/toast.js
 * @description 基于 Alpine.js + Tailwind CSS 的 Toast 通知组件（无 Bootstrap 依赖）
 * @version 3.0.0
 * @date 2026-01-26
 *
 * @example
 * // 在页面中添加容器
 * <div x-data="toastContainer()">...</div>
 *
 * // 通过 Alpine.store('notification') 触发
 * Alpine.store('notification').success('操作成功')
 * Alpine.store('notification').error('操作失败')
 * Alpine.store('notification').warning('警告信息')
 * Alpine.store('notification').info('提示信息')
 */

/* global Alpine */

import { logger } from '../../utils/logger.js'

/**
 * Toast 类型配置
 * 使用固定的状态色（根据用户交互升级方案决策）
 */
export const TOAST_TYPES = {
  success: {
    icon: '✓',
    bgClass: 'bg-green-50 border-green-200',
    textClass: 'text-green-800',
    iconClass: 'text-green-500',
    darkBgClass: 'dark:bg-green-900/90 dark:border-green-700',
    darkTextClass: 'dark:text-green-100'
  },
  error: {
    icon: '✕',
    bgClass: 'bg-red-50 border-red-200',
    textClass: 'text-red-800',
    iconClass: 'text-red-500',
    darkBgClass: 'dark:bg-red-900/90 dark:border-red-700',
    darkTextClass: 'dark:text-red-100'
  },
  danger: {
    icon: '✕',
    bgClass: 'bg-red-50 border-red-200',
    textClass: 'text-red-800',
    iconClass: 'text-red-500',
    darkBgClass: 'dark:bg-red-900/90 dark:border-red-700',
    darkTextClass: 'dark:text-red-100'
  },
  warning: {
    icon: '⚠',
    bgClass: 'bg-yellow-50 border-yellow-200',
    textClass: 'text-yellow-800',
    iconClass: 'text-yellow-500',
    darkBgClass: 'dark:bg-yellow-900/90 dark:border-yellow-700',
    darkTextClass: 'dark:text-yellow-100'
  },
  info: {
    icon: 'ℹ',
    bgClass: 'bg-blue-50 border-blue-200',
    textClass: 'text-blue-800',
    iconClass: 'text-blue-500',
    darkBgClass: 'dark:bg-blue-900/90 dark:border-blue-700',
    darkTextClass: 'dark:text-blue-100'
  }
}

/**
 * Toast 容器组件
 * 负责渲染和管理所有 Toast 消息
 *
 * @returns {Object} Alpine.js 组件对象
 */
export function toastContainer() {
  return {
    /**
     * 获取通知列表
     * @type {Array}
     */
    get notifications() {
      return Alpine.store('notification').items
    },

    /**
     * 移除通知
     * @param {number|string} id - 通知ID
     * @returns {void}
     */
    remove(id) {
      Alpine.store('notification').remove(id)
    },

    /**
     * 获取通知类型配置
     * @param {string} type - 通知类型
     * @returns {Object} 类型配置
     */
    getTypeConfig(type) {
      return TOAST_TYPES[type] || TOAST_TYPES.info
    },

    /**
     * 获取 Toast 容器样式类
     * @param {string} type - 通知类型
     * @returns {string} CSS 类名
     */
    getContainerClass(type) {
      const config = this.getTypeConfig(type)
      return `${config.bgClass} ${config.textClass}`
    },

    /**
     * 获取图标样式类
     * @param {string} type - 通知类型
     * @returns {string} CSS 类名
     */
    getIconClass(type) {
      const config = this.getTypeConfig(type)
      return config.iconClass
    },

    /**
     * 获取图标字符
     * @param {string} type - 通知类型
     * @returns {string} 图标字符
     */
    getIcon(type) {
      const config = this.getTypeConfig(type)
      return config.icon
    }
  }
}

/**
 * 创建 Toast 通知 Store
 * 在 alpine:init 时调用注册
 */
export function createToastStore() {
  return {
    items: [],
    unreadCount: 0,
    containerId: 'toastContainer',
    maxItems: 5, // 最大显示数量

    /**
     * 确保 Toast 容器存在
     * @returns {HTMLElement} Toast 容器元素
     */
    ensureContainer() {
      let container = document.getElementById(this.containerId)
      if (!container) {
        container = document.createElement('div')
        container.id = this.containerId
        container.setAttribute('x-data', 'toastContainer()')
        container.className =
          'fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none'

        // Toast 模板
        container.innerHTML = `
          <template x-for="toast in notifications" :key="toast.id">
            <div 
              class="toast pointer-events-auto flex items-start gap-3 p-4 rounded-lg shadow-lg backdrop-blur-sm border transform transition-all duration-300"
              :class="getContainerClass(toast.type)"
              x-transition:enter="transition ease-out duration-300"
              x-transition:enter-start="opacity-0 translate-x-full"
              x-transition:enter-end="opacity-100 translate-x-0"
              x-transition:leave="transition ease-in duration-200"
              x-transition:leave-start="opacity-100 translate-x-0"
              x-transition:leave-end="opacity-0 translate-x-full"
            >
              <!-- 图标 -->
              <span 
                class="toast-icon text-xl flex-shrink-0 font-bold"
                :class="getIconClass(toast.type)"
                x-text="getIcon(toast.type)"
              ></span>
              
              <!-- 内容 -->
              <div class="toast-content flex-1 min-w-0">
                <div class="toast-title font-medium text-sm" x-text="toast.title || toast.message"></div>
                <div 
                  class="toast-message text-xs opacity-80 mt-0.5" 
                  x-show="toast.description"
                  x-text="toast.description"
                ></div>
              </div>
              
              <!-- 关闭按钮 -->
              <button 
                class="toast-close p-1 rounded transition-colors flex-shrink-0 cursor-pointer hover:bg-black/5"
                @click="remove(toast.id)"
              >✕</button>
              
              <!-- 进度条 -->
              <div 
                class="toast-progress absolute bottom-0 left-0 h-1 bg-current opacity-20 rounded-b-lg"
                x-show="toast.autoClose !== false"
                :style="'animation: shrink ' + (toast.duration || 3000) + 'ms linear forwards'"
              ></div>
            </div>
          </template>
        `

        document.body.appendChild(container)
        logger.debug('[Toast] 容器已创建')
      }
      return container
    },

    /**
     * HTML 转义防 XSS
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    escapeHTML(text) {
      const div = document.createElement('div')
      div.textContent = text
      return div.innerHTML
    },

    /**
     * 添加通知
     * @param {string} type - 通知类型
     * @param {string} message - 消息内容
     * @param {Object} options - 额外选项
     * @returns {string} 通知ID
     */
    add(type, message, options = {}) {
      const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
      const duration = options.duration !== undefined ? options.duration : 3000

      // 确保容器存在
      this.ensureContainer()

      // 限制最大数量
      if (this.items.length >= this.maxItems) {
        this.items.shift()
      }

      const toast = {
        id,
        type: type === 'error' ? 'danger' : type, // 标准化 error -> danger
        message: this.escapeHTML(message),
        title: options.title ? this.escapeHTML(options.title) : null,
        description: options.description ? this.escapeHTML(options.description) : null,
        timestamp: new Date(),
        duration,
        autoClose: duration > 0
      }

      this.items.push(toast)
      logger.debug(`[Toast] 添加通知: ${type} - ${message}`)

      // 自动移除
      if (duration > 0) {
        setTimeout(() => this.remove(id), duration)
      }

      return id
    },

    /**
     * 移除通知
     * @param {string} id - 通知ID
     */
    remove(id) {
      this.items = this.items.filter(item => item.id !== id)
    },

    /**
     * 清空所有通知
     */
    clear() {
      this.items = []
    },

    // ========== 便捷方法 ==========

    /**
     * 成功通知
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    success(message, duration = 3000) {
      return this.add('success', message, { duration })
    },

    /**
     * 错误通知
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    error(message, duration = 5000) {
      return this.add('error', message, { duration })
    },

    /**
     * 警告通知
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    warning(message, duration = 4000) {
      return this.add('warning', message, { duration })
    },

    /**
     * 信息通知
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    info(message, duration = 3000) {
      return this.add('info', message, { duration })
    },

    /**
     * 兼容方法 - 支持两种参数格式
     * 格式1: showToast(message, type) - 如 consumption.js 等使用
     * 格式2: showToast(type, message) - 如 lottery-quota.js 使用
     */
    showToast(arg1, arg2 = 'info', duration = 3000) {
      const validTypes = ['success', 'error', 'warning', 'info', 'danger']

      let type, message
      if (validTypes.includes(arg1)) {
        type = arg1
        message = arg2
      } else if (validTypes.includes(arg2)) {
        type = arg2
        message = arg1
      } else {
        type = 'info'
        message = arg1
      }

      if (type === 'error') type = 'danger'

      return this.add(type, message, { duration })
    }
  }
}

// 默认导出
export default toastContainer

logger.debug('Toast 组件模块已加载 (Tailwind CSS 版本)')
