/**
 * Alpine.js 初始化入口（ES Module 版本）
 *
 * @description 初始化 Alpine.js，注册全局组件和指令
 * @version 2.0.0
 * @date 2026-01-23
 *
 * 使用方式：在 main.js 中导入
 * import { initAlpine } from '@/alpine/index.js'
 * initAlpine()
 */

import Alpine from 'alpinejs'

// 导入 Mixin
import {
  paginationMixin,
  asyncDataMixin,
  modalMixin,
  tableSelectionMixin,
  formValidationMixin,
  authGuardMixin,
  createPageMixin,
  createCrudPageMixin,
  createCrudMixin,
  createBatchOperationMixin,
  createDashboardMixin,
  createSimpleListMixin,
  createFormMixin
} from './mixins/index.js'

/**
 * 初始化 Alpine.js
 */
export function initAlpine() {
  // 注册全局 Magic Properties
  Alpine.magic('toast', () => {
    return (message, type = 'info') => {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type)
      } else {
        console.log(`[${type.toUpperCase()}] ${message}`)
      }
    }
  })

  // 注册全局 store（可选）
  Alpine.store('app', {
    loading: false,
    user: null,

    init() {
      // 从 localStorage 恢复用户信息
      try {
        const userInfo = localStorage.getItem('user_info')
        if (userInfo) {
          this.user = JSON.parse(userInfo)
        }
      } catch (e) {
        console.warn('无法恢复用户信息')
      }
    },

    setLoading(status) {
      this.loading = status
    },

    setUser(user) {
      this.user = user
      if (user) {
        localStorage.setItem('user_info', JSON.stringify(user))
      } else {
        localStorage.removeItem('user_info')
      }
    }
  })

  // 注册模态框状态 store
  Alpine.store('modal', {
    // 通用模态框状态
    hierarchyModal: false,
    deactivateModal: false,
    subordinatesModal: false,
    sessionDetailModal: false,

    // 打开指定模态框
    open(name) {
      this[name] = true
    },

    // 关闭指定模态框
    close(name) {
      this[name] = false
    },

    // 关闭所有模态框
    closeAll() {
      Object.keys(this).forEach(key => {
        if (typeof this[key] === 'boolean') {
          this[key] = false
        }
      })
    }
  })

  // 注册认证状态 store
  Alpine.store('auth', {
    userInfo: null,

    init() {
      try {
        const userInfo = localStorage.getItem('admin_user_info')
        if (userInfo) {
          this.userInfo = JSON.parse(userInfo)
        }
      } catch (e) {
        console.warn('无法恢复管理员信息')
      }
    },

    setUserInfo(info) {
      this.userInfo = info
      if (info) {
        localStorage.setItem('admin_user_info', JSON.stringify(info))
      } else {
        localStorage.removeItem('admin_user_info')
      }
    }
  })

  // 挂载到 window 供页面脚本使用
  window.Alpine = Alpine

  // 挂载 Mixin 工具（兼容旧代码）
  window.createPageMixin = createPageMixin
  window.createCrudPageMixin = createCrudPageMixin
  window.createCrudMixin = createCrudMixin
  window.createBatchOperationMixin = createBatchOperationMixin
  window.createDashboardMixin = createDashboardMixin
  window.createSimpleListMixin = createSimpleListMixin
  window.createFormMixin = createFormMixin

  // 挂载单个 Mixin（兼容旧代码）
  window.paginationMixin = paginationMixin
  window.asyncDataMixin = asyncDataMixin
  window.modalMixin = modalMixin
  window.tableSelectionMixin = tableSelectionMixin
  window.formValidationMixin = formValidationMixin
  window.authGuardMixin = authGuardMixin

  // 启动 Alpine
  Alpine.start()

  console.log('✅ Alpine.js 已初始化（ES Module 版本）')
}

/**
 * 注册自定义组件
 *
 * @param {string} name - 组件名称
 * @param {Function} component - 组件函数
 */
export function registerComponent(name, component) {
  Alpine.data(name, component)
  console.log(`✅ 注册组件: ${name}`)
}

/**
 * 注册自定义指令
 *
 * @param {string} name - 指令名称
 * @param {Function} handler - 指令处理函数
 */
export function registerDirective(name, handler) {
  Alpine.directive(name, handler)
  console.log(`✅ 注册指令: x-${name}`)
}

// 导出 Alpine 实例供高级用法
export { Alpine }

// 导出所有 Mixin
export {
  paginationMixin,
  asyncDataMixin,
  modalMixin,
  tableSelectionMixin,
  formValidationMixin,
  authGuardMixin,
  createPageMixin,
  createCrudPageMixin,
  createCrudMixin,
  createBatchOperationMixin,
  createDashboardMixin,
  createSimpleListMixin,
  createFormMixin
}
