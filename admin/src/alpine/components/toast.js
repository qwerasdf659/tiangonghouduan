/**
 * Toast 消息通知组件
 *
 * @file src/alpine/components/toast.js
 * @description 基于 Alpine.js 的 Toast 通知组件（仅组件定义）
 * @version 2.0.0
 * @date 2026-01-24
 *
 * 使用方式：
 * 1. 在页面中添加 <div x-data="toastContainer()">...</div>
 * 2. 通过 Alpine.store('notification').success('消息') 触发
 *
 * 注意：全局 showToast 函数已统一在 main.js 中定义，
 * 推荐直接使用 Alpine.store('notification') 的方法：
 * - Alpine.store('notification').success('成功消息')
 * - Alpine.store('notification').error('错误消息')
 * - Alpine.store('notification').warning('警告消息')
 * - Alpine.store('notification').info('提示消息')
 */

/* global Alpine */

import { logger } from '../../utils/logger.js'

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
     * 获取通知类型对应的样式类名
     * @param {string} type - 通知类型
     * @returns {string} CSS 类名
     */
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

    /**
     * 获取通知类型对应的图标类名
     * @param {string} type - 通知类型
     * @returns {string} Bootstrap Icon 类名
     */
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

// 默认导出
export default toastContainer

logger.debug('Toast 组件模块已加载')
