/**
 * Alpine.js 初始化入口（ES Module 版本）
 *
 * @description 初始化 Alpine.js，注册全局组件和指令，包含全局错误边界
 * @version 2.1.0
 * @date 2026-01-29
 *
 * 使用方式：在 main.js 中导入
 * import { initAlpine } from '@/alpine/index.js'
 * initAlpine()
 */

import Alpine from 'alpinejs'
import { logger } from '../utils/logger.js'

// 导入 Stores（确保在 Alpine 初始化前加载）
import '../alpine/stores/confirm-dialog.js'

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
  createFormMixin,
  withDraftAutoSave,
  createDraftFormMixin
} from './mixins/index.js'

// 导入布局组件
import { sidebarNav } from './components/sidebar-nav.js'
import { workspaceTabs } from './components/workspace-tabs.js'
import { themeSwitcher } from './components/theme-switcher.js'

// 导入交互增强组件
import { emptyState, quickEmptyState, emptyStateFactory } from './components/empty-state.js'
import {
  animatedCounter,
  currencyCounter,
  percentCounter,
  compactCounter,
  animatedStatsCard
} from './components/animated-counter.js'
import { modal } from './components/modal.js'
import { formValidation, rules as validationRules } from './components/form-validation.js'
import { pageTransition, tabTransition, staggerTransition } from './components/page-transitions.js'
import { miniChart, trendLine, trendBar, progressRing } from './components/mini-chart.js'

// 导入新增功能组件
import { imageLoader, blurLoader, initLazyImages } from './components/image-loader.js'
import { shortcutsStore, enterConfirm } from './components/keyboard-shortcuts.js'
import { infiniteScroll, virtualScroll } from './components/infinite-scroll.js'
import { fileUpload } from './components/file-upload.js'
import { resizableColumns } from './components/resizable-columns.js'

/**
 * 初始化 Alpine.js
 */
export function initAlpine() {
  // ========== 全局错误边界 ==========
  // 捕获 Alpine 组件中的所有未处理错误，防止页面崩溃
  Alpine.onError = (error, component, expression) => {
    // 记录错误日志
    logger.error('[Alpine Error]', {
      message: error.message,
      stack: error.stack,
      component: component?.$el?.tagName,
      expression: expression
    })

    // 显示用户友好的错误提示（仅在开发环境显示详情）
    const isDev = import.meta.env?.DEV || location.hostname === 'localhost'
    const errorMessage = isDev
      ? `组件错误: ${error.message}`
      : '页面组件出现异常，请刷新重试'

    // 使用 notification store 显示错误（如果已初始化）
    setTimeout(() => {
      if (Alpine.store('notification')) {
        Alpine.store('notification').error(errorMessage, 5000)
      }
    }, 100)

    // 阻止错误向上传播，防止页面崩溃
    return false
  }

  logger.debug('[Alpine] 全局错误边界已启用')

  // 注册全局 Magic Properties
  // $toast - 使用 Alpine.store('notification') 统一实现
  Alpine.magic('toast', () => {
    return {
      /**
       * 显示成功消息
       * @param {string} message - 消息内容
       * @param {number} duration - 显示时长（毫秒）
       */
      success(message, duration = 3000) {
        if (Alpine.store('notification')) {
          return Alpine.store('notification').success(message, duration)
        }
        logger.info(`[SUCCESS] ${message}`)
      },

      /**
       * 显示错误消息
       * @param {string} message - 消息内容
       * @param {number} duration - 显示时长（毫秒）
       */
      error(message, duration = 5000) {
        if (Alpine.store('notification')) {
          return Alpine.store('notification').error(message, duration)
        }
        logger.error(`[ERROR] ${message}`)
      },

      /**
       * 显示警告消息
       * @param {string} message - 消息内容
       * @param {number} duration - 显示时长（毫秒）
       */
      warning(message, duration = 4000) {
        if (Alpine.store('notification')) {
          return Alpine.store('notification').warning(message, duration)
        }
        logger.warn(`[WARNING] ${message}`)
      },

      /**
       * 显示提示消息
       * @param {string} message - 消息内容
       * @param {number} duration - 显示时长（毫秒）
       */
      info(message, duration = 3000) {
        if (Alpine.store('notification')) {
          return Alpine.store('notification').info(message, duration)
        }
        logger.info(`[INFO] ${message}`)
      },

      /**
       * 通用显示方法（兼容旧代码）
       * @param {string} message - 消息内容
       * @param {string} type - 消息类型
       * @param {number} duration - 显示时长（毫秒）
       */
      show(message, type = 'info', duration = 3000) {
        if (Alpine.store('notification')) {
          return Alpine.store('notification').showToast(message, type, duration)
        }
        logger.info(`[${type.toUpperCase()}] ${message}`)
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
        logger.warn('无法恢复用户信息')
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

  // 注册通知状态 store（Tailwind CSS 版本）
  Alpine.store('notification', {
    items: [],
    containerId: 'toastContainer',

    // 确保 Toast 容器存在
    ensureContainer() {
      let container = document.getElementById(this.containerId)
      if (!container) {
        container = document.createElement('div')
        container.id = this.containerId
        container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2'
        document.body.appendChild(container)
      }
      return container
    },

    // 显示 Toast
    showToast(message, type = 'info', duration = 3000) {
      const container = this.ensureContainer()
      const toastId = 'toast_' + Date.now()

      // 类型颜色配置
      const typeConfig = {
        success: { bg: 'bg-green-500', icon: '✅' },
        error: { bg: 'bg-red-500', icon: '❌' },
        warning: { bg: 'bg-yellow-500', icon: '⚠️' },
        info: { bg: 'bg-blue-500', icon: 'ℹ️' }
      }
      const config = typeConfig[type] || typeConfig.info

      // 创建 Toast 元素
      const toast = document.createElement('div')
      toast.id = toastId
      toast.className = `${config.bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in`
      toast.innerHTML = `
        <span>${config.icon}</span>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" class="ml-2 hover:opacity-80">×</button>
      `
      container.appendChild(toast)

      // 自动移除
      setTimeout(() => toast.remove(), duration)

      logger.debug(`[Toast-${type}] ${message}`)
    },

    success(message, duration = 3000) {
      this.showToast(message, 'success', duration)
    },

    error(message, duration = 5000) {
      this.showToast(message, 'error', duration)
    },

    warning(message, duration = 4000) {
      this.showToast(message, 'warning', duration)
    },

    info(message, duration = 3000) {
      this.showToast(message, 'info', duration)
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
        logger.warn('无法恢复管理员信息')
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

  // 挂载 Alpine 到 window（Alpine 框架自身需要）
  window.Alpine = Alpine

  // ========== window.xxx 已移除（方案 A：彻底 ES Module） ==========
  // Mixin 工具请使用 ES Module 导入：
  //   import { createPageMixin, paginationMixin } from '@/alpine/mixins/index.js'

  // ========== 注册布局组件 ==========
  Alpine.data('sidebarNav', sidebarNav)
  Alpine.data('workspaceTabs', workspaceTabs)
  Alpine.data('themeSwitcher', themeSwitcher)
  logger.debug('布局组件已注册: sidebarNav, workspaceTabs, themeSwitcher')

  // ========== 注册交互增强组件 ==========
  Alpine.data('emptyState', emptyState)
  Alpine.data('quickEmptyState', quickEmptyState)
  Alpine.data('animatedCounter', animatedCounter)
  Alpine.data('currencyCounter', currencyCounter)
  Alpine.data('percentCounter', percentCounter)
  Alpine.data('compactCounter', compactCounter)
  Alpine.data('animatedStatsCard', animatedStatsCard)
  Alpine.data('modal', modal)
  Alpine.data('formValidation', formValidation)
  Alpine.data('pageTransition', pageTransition)
  Alpine.data('tabTransition', tabTransition)
  Alpine.data('staggerTransition', staggerTransition)
  Alpine.data('miniChart', miniChart)
  Alpine.data('trendLine', trendLine)
  Alpine.data('trendBar', trendBar)
  Alpine.data('progressRing', progressRing)
  logger.debug(
    '交互增强组件已注册: emptyState, animatedCounter, modal, formValidation, pageTransition, miniChart'
  )

  // ========== 注册新增功能组件 ==========
  // 图片加载
  Alpine.data('imageLoader', imageLoader)
  Alpine.data('blurLoader', blurLoader)

  // 键盘快捷键
  Alpine.data('enterConfirm', enterConfirm)
  Alpine.store('shortcuts', shortcutsStore())

  // 无限滚动
  Alpine.data('infiniteScroll', infiniteScroll)
  Alpine.data('virtualScroll', virtualScroll)

  // 文件上传
  Alpine.data('fileUpload', fileUpload)

  // 表格列拖拽
  Alpine.data('resizableColumns', resizableColumns)

  logger.debug(
    '新增功能组件已注册: imageLoader, shortcuts, infiniteScroll, fileUpload, resizableColumns'
  )

  // 启动 Alpine
  Alpine.start()

  logger.info('Alpine.js 已初始化（ES Module 版本）')
}

/**
 * 注册自定义组件
 *
 * @param {string} name - 组件名称
 * @param {Function} component - 组件函数
 */
export function registerComponent(name, component) {
  Alpine.data(name, component)
  logger.debug(`注册组件: ${name}`)
}

/**
 * 注册自定义指令
 *
 * @param {string} name - 指令名称
 * @param {Function} handler - 指令处理函数
 */
export function registerDirective(name, handler) {
  Alpine.directive(name, handler)
  logger.debug(`注册指令: x-${name}`)
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
  createFormMixin,
  withDraftAutoSave,
  createDraftFormMixin
}

// 导出布局组件
export { sidebarNav, workspaceTabs, themeSwitcher }

// 导出交互增强组件
export {
  emptyState,
  quickEmptyState,
  emptyStateFactory,
  animatedCounter,
  currencyCounter,
  percentCounter,
  compactCounter,
  animatedStatsCard,
  modal,
  formValidation,
  validationRules,
  pageTransition,
  tabTransition,
  staggerTransition,
  miniChart,
  trendLine,
  trendBar,
  progressRing
}

// 导出新增功能组件
export {
  imageLoader,
  blurLoader,
  initLazyImages,
  shortcutsStore,
  enterConfirm,
  infiniteScroll,
  virtualScroll,
  fileUpload,
  resizableColumns
}
