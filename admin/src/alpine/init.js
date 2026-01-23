/**
 * Alpine.js 初始化配置
 *
 * 必须在 alpine.min.js 之前加载
 *
 * @file public/admin/js/alpine/init.js
 * @description Alpine.js 全局配置、Store 注册和 Magic 属性定义
 * @version 1.0.0
 * @date 2026-01-22
 */


import { logger } from '../utils/logger.js'
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
   * 通知状态 Store
   * 管理 Toast 消息通知，自动创建和显示 DOM Toast
   */
  Alpine.store('notification', {
    items: [],
    unreadCount: 0,
    containerId: 'alpineToastContainer',

    // 确保 Toast 容器存在
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

    // 创建并显示 Toast DOM 元素
    showToastDOM(type, message, duration) {
      const container = this.ensureContainer()
      const toastId = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)

      // 类型配置映射
      const typeConfig = {
        success: { bg: 'bg-success', icon: 'bi-check-circle-fill' },
        danger: { bg: 'bg-danger', icon: 'bi-x-circle-fill' },
        warning: { bg: 'bg-warning text-dark', icon: 'bi-exclamation-triangle-fill' },
        info: { bg: 'bg-info', icon: 'bi-info-circle-fill' }
      }
      const config = typeConfig[type] || typeConfig.info

      // 创建 Toast HTML
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
      container.insertAdjacentHTML('beforeend', toastHTML)

      const toastEl = document.getElementById(toastId)
      if (toastEl && typeof bootstrap !== 'undefined' && bootstrap.Toast) {
        const toast = new bootstrap.Toast(toastEl, { delay: duration, autohide: true })
        toast.show()
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove())
      } else {
        // 降级方案：简单显示后移除
        setTimeout(() => toastEl?.remove(), duration)
      }
    },

    // HTML 转义防 XSS
    escapeHTML(text) {
      const div = document.createElement('div')
      div.textContent = text
      return div.innerHTML
    },

    // 添加通知（同时显示 DOM Toast）
    add(type, message, duration = 3000) {
      const id = Date.now() + Math.random()
      this.items.push({ id, type, message, timestamp: new Date() })

      // 自动显示 DOM Toast
      this.showToastDOM(type, message, duration)

      if (duration > 0) {
        setTimeout(() => this.remove(id), duration)
      }

      return id
    },

    // 移除通知
    remove(id) {
      this.items = this.items.filter(item => item.id !== id)
    },

    // 清空所有通知
    clear() {
      this.items = []
    },

    // 便捷方法
    success(message, duration = 3000) {
      return this.add('success', message, duration)
    },
    error(message, duration = 5000) {
      return this.add('danger', message, duration)
    },
    warning(message, duration = 4000) {
      return this.add('warning', message, duration)
    },
    info(message, duration = 3000) {
      return this.add('info', message, duration)
    },

    /**
     * 兼容方法 - 支持两种参数格式
     * 格式1: showToast(message, type) - 如 consumption.js, campaigns.js 等使用
     * 格式2: showToast(type, message) - 如 lottery-quota.js 使用
     * 自动识别参数格式并调用正确的方法
     */
    showToast(arg1, arg2 = 'info', duration = 3000) {
      const validTypes = ['success', 'error', 'warning', 'info', 'danger']

      // 判断参数格式
      let type, message
      if (validTypes.includes(arg1)) {
        // 格式2: showToast(type, message)
        type = arg1
        message = arg2
      } else if (validTypes.includes(arg2)) {
        // 格式1: showToast(message, type)
        type = arg2
        message = arg1
      } else {
        // 默认: arg1 是消息, arg2 是类型或默认 info
        type = 'info'
        message = arg1
      }

      // 标准化 type
      if (type === 'error') type = 'danger'

      return this.add(type, message, duration)
    }
  })

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
   * x-tooltip 指令
   * 使用方式：<span x-tooltip="'这是提示文字'">悬停显示</span>
   */
  Alpine.directive('tooltip', (el, { expression }, { evaluate }) => {
    const text = evaluate(expression)
    if (text) {
      el.setAttribute('title', text)
      el.setAttribute('data-bs-toggle', 'tooltip')
      el.setAttribute('data-bs-placement', 'top')

      // 初始化 Bootstrap Tooltip
      if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
        new bootstrap.Tooltip(el)
      }
    }
  })

  /**
   * x-confirm 指令
   * 使用方式：<button x-confirm="'确定要删除吗？'" @confirmed="handleDelete">删除</button>
   */
  Alpine.directive('confirm', (el, { expression }, { evaluate }) => {
    const message = evaluate(expression) || '确定要执行此操作吗？'

    el.addEventListener('click', e => {
      if (!confirm(message)) {
        e.stopImmediatePropagation()
        e.preventDefault()
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
 * 确保加载遮罩 DOM 元素存在
 * @returns {HTMLElement} 加载遮罩容器元素
 */
function ensureLoadingContainer() {
  let container = document.getElementById(LOADING_CONTAINER_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = LOADING_CONTAINER_ID
    container.className =
      'position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center'
    container.style.cssText = 'background: rgba(255, 255, 255, 0.8); z-index: 9998; display: none;'
    container.innerHTML = `
      <div class="text-center">
        <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
          <span class="visually-hidden">加载中...</span>
        </div>
        <div class="mt-2 text-muted" id="loadingText">加载中...</div>
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
function showLoading(message = '加载中...') {
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
function hideLoading() {
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

// ========== window.xxx 已移除（方案 A：彻底 ES Module） ==========
// 请使用 ES Module 导入：
//   import { showLoading, hideLoading } from '@/alpine/init.js'

logger.info('Alpine.js 初始化配置已加载')
