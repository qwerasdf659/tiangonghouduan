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

// 导入 Toast Store 工厂和容器组件（包含完整 API：show/success/error/warning/info）
import { createToastStore, toastContainer } from './components/toast.js'

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
import { appearanceSettings } from './components/appearance-settings.js'
import { notificationCenter } from './components/notification-center.js'

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

// 导入数据表格组件（#9 标准表格组件）
import { dataTable } from './components/data-table.js'

// 导入虚拟列表组件（#9 大数据列表）— 自注册，仅需导入以确保打包
import './components/virtual-list.js'

// 导入新增功能组件
import { imageLoader, blurLoader, initLazyImages } from './components/image-loader.js'
import { shortcutsStore, enterConfirm } from './components/keyboard-shortcuts.js'
import { infiniteScroll, virtualScroll } from './components/infinite-scroll.js'
import { fileUpload } from './components/file-upload.js'
import { resizableColumns } from './components/resizable-columns.js'
import { exportModal } from './components/export-modal.js'

/**
 * 初始化 Alpine.js
 * 幂等设计：多次调用只执行一次，防止 Alpine.start() 被重复调用导致事件监听器重复、状态异常
 */
let _alpineInitialized = false

export function initAlpine() {
  if (_alpineInitialized) {
    logger.warn('[Alpine] initAlpine 已执行过，跳过重复初始化')
    return
  }
  _alpineInitialized = true

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
    const errorMessage = isDev ? `组件错误: ${error.message}` : '页面组件出现异常，请刷新重试'

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
      } catch (_e) {
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

  // 注册通知状态 store（使用 createToastStore 包含完整 API：show/success/error/warning/info）
  Alpine.store('notification', createToastStore())

  // 注册认证状态 store（与 login.js 的 setUser/setToken 对齐，读取 admin_user/admin_token）
  Alpine.store('auth', {
    token: localStorage.getItem('admin_token'),
    user: JSON.parse(localStorage.getItem('admin_user') || 'null'),

    get isLoggedIn() {
      return !!this.token
    },

    get isAdmin() {
      if (!this.user) return false
      if (this.user.role_level >= 100) return true
      if (Array.isArray(this.user.roles)) {
        return this.user.roles.some(r => r.role_name === 'admin' || r.role_level >= 100)
      }
      return false
    },

    /** 用户显示名称：优先 nickname，其次 mobile */
    get displayName() {
      return this.user?.nickname || this.user?.mobile || '未登录'
    },

    /** 用户权限等级数值 */
    get roleLevel() {
      return this.user?.role_level || 0
    },

    /** 用户权限等级中文描述（与 permission-rules.js getUserRoleLevelDescription 对齐） */
    get roleLevelDescription() {
      const level = this.roleLevel
      if (level >= 100) return '超级管理员'
      if (level >= 80) return '高级运营'
      if (level >= 30) return '运营'
      if (level >= 1) return '客服'
      return '普通用户'
    },

    /** 用户手机号（管理后台不做脱敏处理） */
    get mobileDisplay() {
      return this.user?.mobile || ''
    },

    /** 用户等级（normal/vip/merchant → 中文显示） */
    get userLevelDisplay() {
      const levelMap = { normal: '普通用户', vip: 'VIP用户', merchant: '商户' }
      return levelMap[this.user?.user_level] || this.user?.user_level || ''
    },

    /** 用户头像首字（取 nickname 或 mobile 首字符） */
    get avatarInitial() {
      if (this.user?.nickname) return this.user.nickname.charAt(0).toUpperCase()
      if (this.user?.mobile) return this.user.mobile.charAt(0)
      return '?'
    },

    login(token, user) {
      this.token = token
      this.user = user
      localStorage.setItem('admin_token', token)
      localStorage.setItem('admin_user', JSON.stringify(user))
    },

    logout() {
      this.token = null
      this.user = null
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login.html'
    },

    updateUser(userData) {
      this.user = { ...this.user, ...userData }
      localStorage.setItem('admin_user', JSON.stringify(this.user))
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
  Alpine.data('appearanceSettings', appearanceSettings)
  Alpine.data('notificationCenter', notificationCenter)
  logger.debug('布局组件已注册: sidebarNav, workspaceTabs, appearanceSettings, notificationCenter')

  // ========== 注册 Toast 容器组件（notification store 动态创建 DOM 时需要） ==========
  Alpine.data('toastContainer', toastContainer)

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

  // ========== 注册标准数据表格组件（#9 data-table 增强） ==========
  Alpine.data('dataTable', dataTable)
  logger.debug('标准数据表格组件已注册: dataTable')

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

  // 导出弹窗组件
  Alpine.data('exportModal', exportModal)

  logger.debug(
    '新增功能组件已注册: imageLoader, shortcuts, infiniteScroll, fileUpload, resizableColumns, exportModal'
  )

  // ========== 注册 x-tooltip 指令（P3 #11 帮助提示） ==========
  Alpine.directive('tooltip', (el, { expression }, { evaluate }) => {
    const text = evaluate(expression)
    if (text) {
      el.setAttribute('title', text)
      el.classList.add('tooltip-trigger')

      const tooltip = document.createElement('div')
      tooltip.className =
        'tooltip-content absolute hidden px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg z-50 whitespace-nowrap pointer-events-none'
      tooltip.textContent = text

      el.style.position = 'relative'
      el.appendChild(tooltip)

      el.addEventListener('mouseenter', () => {
        tooltip.classList.remove('hidden')
        tooltip.style.bottom = '100%'
        tooltip.style.left = '50%'
        tooltip.style.transform = 'translateX(-50%) translateY(-4px)'
      })

      el.addEventListener('mouseleave', () => {
        tooltip.classList.add('hidden')
      })
    }
  })
  logger.debug('x-tooltip 指令已注册')

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
export { sidebarNav, workspaceTabs, appearanceSettings, notificationCenter }

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

// 导出数据表格组件
export { dataTable }

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
  resizableColumns,
  exportModal
}
