/**
 * Alpine.js 初始化配置
 *
 * 必须在 alpine.min.js 之前加载
 *
 * @file src/alpine/init.js
 * @description Alpine.js 全局配置、Store 注册和 Magic 属性定义（无 Bootstrap 依赖）
 * @version 2.0.0
 * @date 2026-01-26
 */

import { logger } from '../utils/logger.js'
import { createToastStore, TOAST_TYPES } from './components/toast.js'
import {
  hasMenuAccess,
  hasPageAccess,
  checkCurrentPageAccess,
  getAccessibleMenuIds,
  getUserRoleLevelDescription,
  ROLE_LEVEL_THRESHOLDS
} from '../config/permission-rules.js'

document.addEventListener('alpine:init', () => {
  logger.info('🔧 Alpine.js 初始化开始...')

  // ========== 全局 Store 注册 ==========

  /**
   * 认证状态 Store
   * 管理用户登录状态、Token 和用户信息
   */
  Alpine.store('auth', {
    token: localStorage.getItem('admin_token'),
    user: JSON.parse(localStorage.getItem('admin_user') || 'null'),

    // 计算属性：是否已登录
    get isLoggedIn() {
      return !!this.token
    },

    // 计算属性：是否是管理员
    get isAdmin() {
      if (!this.user) return false
      // 检查 role_level
      if (this.user.role_level >= 100) return true
      // 检查 roles 数组
      if (this.user.roles && Array.isArray(this.user.roles)) {
        return this.user.roles.some(role => role.role_name === 'admin' || role.role_level >= 100)
      }
      return false
    },

    // 计算属性：用户显示名称
    get displayName() {
      return this.user?.nickname || this.user?.mobile || '未登录'
    },

    // 登录
    login(token, user) {
      this.token = token
      this.user = user
      localStorage.setItem('admin_token', token)
      localStorage.setItem('admin_user', JSON.stringify(user))
    },

    // 登出
    logout() {
      this.token = null
      this.user = null
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login.html'
    },

    // 更新用户信息
    updateUser(userData) {
      this.user = { ...this.user, ...userData }
      localStorage.setItem('admin_user', JSON.stringify(this.user))
    },

    // ========== 权限控制方法（基于 role_level）==========

    /**
     * 获取用户权限等级
     * @returns {number} role_level，未登录返回 0
     */
    get roleLevel() {
      return this.user?.role_level || 0
    },

    /**
     * 获取用户权限等级描述
     * @returns {string} 如 '客服'、'运营'、'管理员'
     */
    get roleLevelDescription() {
      return getUserRoleLevelDescription()
    },

    /**
     * 判断是否有菜单访问权限
     * @param {string} menuId - 菜单ID（如 'operations.customer'）
     * @returns {boolean}
     */
    hasMenuAccess(menuId) {
      return hasMenuAccess(menuId)
    },

    /**
     * 判断是否有页面访问权限
     * @param {string} pagePath - 页面路径
     * @returns {boolean}
     */
    hasPageAccess(pagePath) {
      return hasPageAccess(pagePath)
    },

    /**
     * 检查当前页面权限，无权限则跳转
     * @param {Object} options - 配置选项
     * @returns {boolean} 是否有权限
     */
    checkPageAccess(options = {}) {
      return checkCurrentPageAccess(options)
    },

    /**
     * 获取可访问的菜单ID列表
     * @returns {string[]}
     */
    getAccessibleMenuIds() {
      return getAccessibleMenuIds()
    }
  })

  /**
   * UI 状态 Store
   * 管理侧边栏、主题、加载状态等 UI 相关状态
   */
  Alpine.store('ui', {
    sidebarCollapsed: localStorage.getItem('sidebar_collapsed') === 'true',
    theme: localStorage.getItem('theme') || 'light',
    loading: false,
    pageTitle: '',
    pageIcon: '',

    // 全局确认对话框状态
    confirmDialog: {
      show: false,
      title: '',
      message: '',
      type: 'warning', // info, warning, danger
      confirmText: '确定',
      cancelText: '取消',
      onConfirm: null,
      onCancel: null
    },

    // 全局加载状态（带文字）
    loadingState: {
      show: false,
      message: '加载中...'
    },

    // 切换侧边栏
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
      localStorage.setItem('sidebar_collapsed', this.sidebarCollapsed)
    },

    // 设置主题
    setTheme(theme) {
      this.theme = theme
      localStorage.setItem('theme', theme)
      document.documentElement.setAttribute('data-theme', theme)
    },

    // 设置加载状态
    setLoading(loading) {
      this.loading = loading
    },

    // 设置页面标题
    setPageTitle(title, icon = '') {
      this.pageTitle = title
      this.pageIcon = icon
      document.title = `${title} - 管理后台`
    },

    /**
     * 显示确认对话框
     * @param {Object} options - 配置选项
     * @returns {Promise<boolean>} 用户选择结果
     */
    confirm(options) {
      return new Promise(resolve => {
        this.confirmDialog = {
          show: true,
          title: options.title || '确认操作',
          message: options.message || '确定要执行此操作吗？',
          type: options.type || 'warning',
          confirmText: options.confirmText || '确定',
          cancelText: options.cancelText || '取消',
          onConfirm: () => {
            this.confirmDialog.show = false
            resolve(true)
          },
          onCancel: () => {
            this.confirmDialog.show = false
            resolve(false)
          }
        }
      })
    },

    /**
     * 显示全局加载
     * @param {string} message - 加载提示文字
     */
    showLoading(message = '加载中...') {
      this.loadingState = { show: true, message }
    },

    /**
     * 隐藏全局加载
     */
    hideLoading() {
      this.loadingState.show = false
    }
  })

  /**
   * 通知状态 Store（纯 Tailwind CSS 版本）
   * 管理 Toast 消息通知
   */
  Alpine.store('notification', createToastStore())

  // ========== 全局 Magic 属性 ==========

  /**
   * $api - API 请求快捷方式
   * 使用方式：await $api.get('/api/v4/users')
   */
  Alpine.magic('api', () => {
    return {
      async get(url, params = {}) {
        const queryString = new URLSearchParams(params).toString()
        const fullUrl = queryString ? `${url}?${queryString}` : url
        return await apiRequest(fullUrl)
      },
      async post(url, data = {}) {
        return await apiRequest(url, {
          method: 'POST',
          body: JSON.stringify(data)
        })
      },
      async put(url, data = {}) {
        return await apiRequest(url, {
          method: 'PUT',
          body: JSON.stringify(data)
        })
      },
      async delete(url) {
        return await apiRequest(url, { method: 'DELETE' })
      }
    }
  })

  /**
   * $format - 格式化工具
   * 使用方式：$format.number(12345) => "12,345"
   */
  Alpine.magic('format', () => {
    return {
      // 数字格式化（千分位）
      number(val) {
        if (val === null || val === undefined) return '-'
        return Number(val).toLocaleString('zh-CN')
      },
      // 日期格式化
      date(val, options = {}) {
        if (!val) return '-'
        const date = new Date(val)
        if (isNaN(date.getTime())) return val
        return date.toLocaleDateString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          ...options
        })
      },
      // 日期时间格式化
      datetime(val) {
        if (!val) return '-'
        const date = new Date(val)
        if (isNaN(date.getTime())) return val
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      },
      // 货币格式化
      currency(val) {
        if (val === null || val === undefined) return '-'
        return `¥${Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
      },
      // 相对时间
      relative(val) {
        if (!val) return '-'
        const date = new Date(val)
        if (isNaN(date.getTime())) return val

        const now = new Date()
        const diffMs = now - date
        const diffSeconds = Math.floor(diffMs / 1000)
        const diffMinutes = Math.floor(diffSeconds / 60)
        const diffHours = Math.floor(diffMinutes / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffDays > 0) return `${diffDays}天前`
        if (diffHours > 0) return `${diffHours}小时前`
        if (diffMinutes > 0) return `${diffMinutes}分钟前`
        return '刚刚'
      },
      // 手机号脱敏
      phone(val) {
        if (!val || val.length !== 11) return val || '-'
        return val.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      },
      // 百分比格式化
      percent(val, decimals = 1) {
        if (val === null || val === undefined) return '-'
        return `${(Number(val) * 100).toFixed(decimals)}%`
      }
    }
  })

  /**
   * $toast - 快捷消息提示
   * 使用方式：$toast.success('操作成功')
   */
  Alpine.magic('toast', () => {
    return Alpine.store('notification')
  })

  // ========== 全局指令注册 ==========

  /**
   * x-tooltip 指令（纯 CSS 实现）
   * 使用方式：<span x-tooltip="'这是提示文字'">悬停显示</span>
   */
  Alpine.directive('tooltip', (el, { expression }, { evaluate }) => {
    const text = evaluate(expression)
    if (text) {
      el.setAttribute('title', text)
      el.classList.add('tooltip-trigger')

      // 创建 Tooltip 元素
      const tooltip = document.createElement('div')
      tooltip.className =
        'tooltip-content absolute hidden px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg z-50 whitespace-nowrap'
      tooltip.textContent = text

      el.style.position = 'relative'
      el.appendChild(tooltip)

      // 显示/隐藏逻辑
      el.addEventListener('mouseenter', () => {
        tooltip.classList.remove('hidden')
        // 定位在元素上方
        tooltip.style.bottom = '100%'
        tooltip.style.left = '50%'
        tooltip.style.transform = 'translateX(-50%) translateY(-4px)'
      })

      el.addEventListener('mouseleave', () => {
        tooltip.classList.add('hidden')
      })
    }
  })

  /**
   * x-confirm 指令
   * 使用方式：<button x-confirm="'确定要删除吗？'" @confirmed="handleDelete">删除</button>
   */
  Alpine.directive('confirm', (el, { expression }, { evaluate }) => {
    const message = evaluate(expression) || '确定要执行此操作吗？'

    el.addEventListener('click', async e => {
      // 使用 Alpine Store 的确认对话框
      if (typeof Alpine !== 'undefined' && Alpine.store('confirm')) {
        e.stopImmediatePropagation()
        e.preventDefault()

        const confirmed = await Alpine.store('confirm').show({ message })
        if (confirmed) {
          // 触发 confirmed 事件
          el.dispatchEvent(new CustomEvent('confirmed'))
        }
      } else {
        // 降级到原生 confirm
        if (!confirm(message)) {
          e.stopImmediatePropagation()
          e.preventDefault()
        }
      }
    })
  })

  logger.info('Alpine.js 初始化完成')
})

// 页面加载完成后的检查
document.addEventListener('DOMContentLoaded', () => {
  // 检查 Alpine 是否正确加载
  if (typeof Alpine === 'undefined') {
    logger.error('❌ Alpine.js 未加载')
    return
  }

  // 初始化主题
  const theme = localStorage.getItem('theme') || 'light'
  document.documentElement.setAttribute('data-theme', theme)
})

// ========== 全局辅助函数 ==========

/**
 * 全局加载遮罩容器 ID
 */
const LOADING_CONTAINER_ID = 'globalLoadingOverlay'

/**
 * 确保加载遮罩 DOM 元素存在（纯 Tailwind CSS 版本）
 * @returns {HTMLElement} 加载遮罩容器元素
 */
function ensureLoadingContainer() {
  let container = document.getElementById(LOADING_CONTAINER_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = LOADING_CONTAINER_ID
    container.className =
      'fixed inset-0 flex justify-center items-center bg-white/80 dark:bg-gray-900/80 z-[9998]'
    container.style.display = 'none'
    container.innerHTML = `
      <div class="text-center">
        <div class="inline-block w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <div class="mt-3 text-gray-600 dark:text-gray-300" id="loadingText">加载中...</div>
      </div>
    `
    document.body.appendChild(container)
  }
  return container
}

/**
 * 显示全局加载遮罩
 * @param {string} [message='加载中...'] - 加载提示文字
 */
export function showLoading(message = '加载中...') {
  const container = ensureLoadingContainer()
  const textEl = container.querySelector('#loadingText')
  if (textEl) {
    textEl.textContent = message
  }
  container.style.display = 'flex'

  // 同步 Alpine.js UI Store 状态（如果 Alpine 已初始化）
  if (typeof Alpine !== 'undefined' && Alpine.store) {
    try {
      Alpine.store('ui').setLoading(true)
    } catch (e) {
      // Alpine 未完全初始化时忽略
    }
  }
}

/**
 * 隐藏全局加载遮罩
 */
export function hideLoading() {
  const container = document.getElementById(LOADING_CONTAINER_ID)
  if (container) {
    container.style.display = 'none'
  }

  // 同步 Alpine.js UI Store 状态（如果 Alpine 已初始化）
  if (typeof Alpine !== 'undefined' && Alpine.store) {
    try {
      Alpine.store('ui').setLoading(false)
    } catch (e) {
      // Alpine 未完全初始化时忽略
    }
  }
}

logger.info('Alpine.js 初始化配置已加载 (无 Bootstrap 依赖)')
