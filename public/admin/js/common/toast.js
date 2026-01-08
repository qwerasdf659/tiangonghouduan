/**
 * Toast 提示组件
 * 提供统一的消息提示功能
 *
 * @file public/admin/js/common/toast.js
 * @description 基于 Bootstrap 5 Toast 的封装组件
 * @version 1.0.0
 * @date 2026-01-09
 *
 * 使用方式：
 * 1. 在HTML中引入此文件：<script src="/admin/js/common/toast.js"></script>
 * 2. 调用：showSuccessToast('操作成功')
 */

/**
 * Toast 工具类
 * 提供成功、错误、警告、信息四种类型的提示
 */
const ToastUtils = {
  /**
   * Toast容器ID
   */
  containerId: 'toastContainer',

  /**
   * Toast配置
   */
  config: {
    duration: 3000, // 默认显示时长（毫秒）
    position: 'top-end' // 默认位置
  },

  /**
   * 确保Toast容器存在
   * @returns {HTMLElement} Toast容器元素
   */
  ensureContainer() {
    let container = document.getElementById(this.containerId)

    if (!container) {
      container = document.createElement('div')
      container.id = this.containerId
      container.className = 'toast-container position-fixed top-0 end-0 p-3'
      container.style.zIndex = '9999'
      document.body.appendChild(container)
    }

    return container
  },

  /**
   * 创建并显示Toast
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型 (success/error/warning/info)
   * @param {Object} options - 可选配置
   * @returns {HTMLElement} Toast元素
   */
  show(message, type = 'info', options = {}) {
    const container = this.ensureContainer()
    const duration = options.duration || this.config.duration

    // 类型配置映射
    const typeConfig = {
      success: {
        bg: 'bg-success',
        icon: 'bi-check-circle-fill',
        title: '成功'
      },
      error: {
        bg: 'bg-danger',
        icon: 'bi-x-circle-fill',
        title: '错误'
      },
      warning: {
        bg: 'bg-warning',
        icon: 'bi-exclamation-triangle-fill',
        title: '警告'
      },
      info: {
        bg: 'bg-info',
        icon: 'bi-info-circle-fill',
        title: '提示'
      }
    }

    const config = typeConfig[type] || typeConfig.info

    // 创建Toast HTML结构
    const toastId = 'toast_' + Date.now()
    const toastHTML = `
      <div id="${toastId}" class="toast align-items-center text-white ${config.bg} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">
            <i class="bi ${config.icon} me-2"></i>
            ${this.escapeHTML(message)}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="关闭"></button>
        </div>
      </div>
    `

    // 插入Toast
    container.insertAdjacentHTML('beforeend', toastHTML)

    const toastElement = document.getElementById(toastId)

    // 初始化Bootstrap Toast
    const toast = new bootstrap.Toast(toastElement, {
      delay: duration,
      autohide: true
    })

    // 显示Toast
    toast.show()

    // Toast隐藏后自动移除DOM
    toastElement.addEventListener('hidden.bs.toast', () => {
      toastElement.remove()
    })

    return toastElement
  },

  /**
   * HTML转义，防止XSS
   * @param {string} text - 原始文本
   * @returns {string} 转义后的文本
   */
  escapeHTML(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

/**
 * 显示成功提示
 * @param {string} message - 消息内容
 * @param {Object} options - 可选配置
 */
function showSuccessToast(message, options = {}) {
  return ToastUtils.show(message, 'success', options)
}

/**
 * 显示错误提示
 * @param {string} message - 消息内容
 * @param {Object} options - 可选配置
 */
function showErrorToast(message, options = {}) {
  return ToastUtils.show(message, 'error', options)
}

/**
 * 显示警告提示
 * @param {string} message - 消息内容
 * @param {Object} options - 可选配置
 */
function showWarningToast(message, options = {}) {
  return ToastUtils.show(message, 'warning', options)
}

/**
 * 显示信息提示
 * @param {string} message - 消息内容
 * @param {Object} options - 可选配置
 */
function showInfoToast(message, options = {}) {
  return ToastUtils.show(message, 'info', options)
}

/**
 * 显示成功提示（别名）
 * @param {string} title - 标题
 * @param {string} message - 消息内容
 */
function showSuccess(title, message) {
  return showSuccessToast(message || title)
}

/**
 * 显示错误提示（别名）
 * @param {string} title - 标题
 * @param {string} message - 消息内容
 */
function showError(title, message) {
  return showErrorToast(message || title)
}

// 暴露到全局作用域
if (typeof window !== 'undefined') {
  window.ToastUtils = ToastUtils
  window.showSuccessToast = showSuccessToast
  window.showErrorToast = showErrorToast
  window.showWarningToast = showWarningToast
  window.showInfoToast = showInfoToast
  window.showSuccess = showSuccess
  window.showError = showError
  console.log('✅ Toast组件已加载')
}
