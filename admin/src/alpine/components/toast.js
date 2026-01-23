/**
 * Toast 消息通知组件
 *
 * @file public/admin/js/alpine/components/toast.js
 * @description 基于 Alpine.js 的 Toast 通知组件
 * @version 1.0.0
 * @date 2026-01-22
 *
 * 使用方式：
 * 1. 在页面中添加 <div x-data="toastContainer()">...</div>
 * 2. 通过 Alpine.store('notification').success('消息') 触发
 */

/**
 * Toast 容器组件
 * 负责渲染和管理所有 Toast 消息
 */
function toastContainer() {
  return {
    // 获取通知列表
    get notifications() {
      return Alpine.store('notification').items
    },

    // 移除通知
    remove(id) {
      Alpine.store('notification').remove(id)
    },

    // 获取通知类型对应的样式
    getTypeClass(type) {
      const classMap = {
        success: 'bg-success text-white',
        danger: 'bg-danger text-white',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-white',
        primary: 'bg-primary text-white',
        secondary: 'bg-secondary text-white'
      }
      return classMap[type] || classMap.info
    },

    // 获取通知类型对应的图标
    getTypeIcon(type) {
      const iconMap = {
        success: 'bi-check-circle-fill',
        danger: 'bi-x-circle-fill',
        warning: 'bi-exclamation-triangle-fill',
        info: 'bi-info-circle-fill',
        primary: 'bi-bell-fill',
        secondary: 'bi-chat-dots-fill'
      }
      return iconMap[type] || iconMap.info
    }
  }
}

/**
 * 全局 Toast 帮助函数
 * 用于在任意位置快速显示 Toast
 */
window.showToast = function (type, message, duration = 3000) {
  if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
    return Alpine.store('notification').add(type, message, duration)
  } else {
    // 降级方案：使用 alert
    alert(message)
  }
}

window.showSuccessToast = function (message, duration = 3000) {
  return showToast('success', message, duration)
}

window.showErrorToast = function (message, duration = 5000) {
  return showToast('danger', message, duration)
}

window.showWarningToast = function (message, duration = 4000) {
  return showToast('warning', message, duration)
}

window.showInfoToast = function (message, duration = 3000) {
  return showToast('info', message, duration)
}

console.log('📦 Toast 组件已加载')
