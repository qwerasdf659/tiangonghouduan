/**
 * 全局快捷键系统
 *
 * @file src/alpine/components/keyboard-shortcuts.js
 * @description 全局快捷键管理，支持 Ctrl+K 搜索、ESC 关闭、Enter 确认等
 * @version 1.0.0
 * @date 2026-01-27
 *
 * @example
 * // 在 Alpine 初始化时注册
 * Alpine.store('shortcuts', shortcutsStore())
 *
 * // 组件内使用
 * <input @keydown="$store.shortcuts.handleKey($event, 'search')">
 */

import { logger } from '../../utils/logger.js'

/**
 * 全局快捷键配置
 */
const DEFAULT_SHORTCUTS = {
  // 全局搜索
  'ctrl+k': {
    action: 'openSearch',
    description: '打开全局搜索',
    scope: 'global'
  },
  'ctrl+/': {
    action: 'openSearch',
    description: '打开全局搜索（备选）',
    scope: 'global'
  },
  '/': {
    action: 'openSearch',
    description: '快速搜索',
    scope: 'global'
  },
  // 关闭/取消
  escape: {
    action: 'closeModal',
    description: '关闭弹窗/取消操作',
    scope: 'global'
  },
  // 保存
  'ctrl+s': {
    action: 'save',
    description: '保存',
    scope: 'form'
  },
  // 刷新数据
  'ctrl+r': {
    action: 'refresh',
    description: '刷新数据',
    scope: 'table',
    preventDefault: true
  },
  // P1-7: 强制刷新（跳过缓存）
  'ctrl+shift+r': {
    action: 'forceRefresh',
    description: '强制刷新（跳过缓存）',
    scope: 'global',
    preventDefault: true
  },
  // 新建
  'ctrl+n': {
    action: 'create',
    description: '新建',
    scope: 'page'
  }
}

/**
 * P1-7: G键组合快捷键配置
 * 按下G后500ms内按第二个键触发
 */
const G_KEY_SHORTCUTS = {
  p: {
    action: 'gotoPending',
    url: '/admin/pending-center.html',
    description: '跳转待处理中心'
  },
  d: {
    action: 'gotoDashboard',
    url: '/admin/dashboard-panel.html',
    description: '跳转数据驾驶舱'
  },
  u: {
    action: 'gotoUsers',
    url: '/admin/user-management.html',
    description: '跳转用户管理'
  },
  l: {
    action: 'gotoLottery',
    url: '/admin/lottery-management.html',
    description: '跳转抽奖管理'
  },
  s: {
    action: 'gotoSettings',
    url: '/admin/system-settings.html',
    description: '跳转系统设置'
  }
}

/**
 * 快捷键 Store
 * @returns {Object} Alpine Store 数据
 */
export function shortcutsStore() {
  return {
    shortcuts: { ...DEFAULT_SHORTCUTS },
    gKeyShortcuts: { ...G_KEY_SHORTCUTS },
    enabled: true,
    activeScope: 'global',
    searchOpen: false,
    handlers: new Map(),

    // P1-7: G键组合状态
    waitingForGKey: false,
    gKeyTimeout: null,

    /**
     * 初始化全局快捷键监听
     */
    _globalKeyHandler: null,

    init() {
      this._globalKeyHandler = this.handleGlobalKey.bind(this)
      document.addEventListener('keydown', this._globalKeyHandler)
      logger.info('[Shortcuts] 全局快捷键系统已初始化')
      logger.info('[Shortcuts] G键组合: G+P=待处理, G+D=仪表盘, G+U=用户, G+L=抽奖, G+S=设置')
    },

    /**
     * 处理全局按键
     * @param {KeyboardEvent} event - 键盘事件
     */
    handleGlobalKey(event) {
      if (!this.enabled) return

      // 忽略输入框内的大部分快捷键（除了特定的）
      const isInput =
        event.target.tagName === 'INPUT' ||
        event.target.tagName === 'TEXTAREA' ||
        event.target.isContentEditable

      const key = this.getKeyCombo(event)
      const singleKey = event.key.toLowerCase()

      // Escape 总是有效
      if (key === 'escape') {
        this.executeAction('closeModal', event)
        return
      }

      // 在输入框中，只处理特定快捷键
      if (isInput) {
        if (key === 'ctrl+k' || key === 'ctrl+/') {
          event.preventDefault()
          this.executeAction('openSearch', event)
          return
        }
        if (key === 'ctrl+s') {
          event.preventDefault()
          this.executeAction('save', event)
          return
        }
        // Enter 键确认（表单提交）
        if (key === 'enter' && event.target.tagName !== 'TEXTAREA') {
          this.executeAction('enterConfirm', event)
          return
        }
        return
      }

      // P1-7: 处理G键组合快捷键
      if (this.waitingForGKey) {
        const gShortcut = this.gKeyShortcuts[singleKey]
        if (gShortcut) {
          event.preventDefault()
          this.clearGKeyWaiting()
          this.handleGKeyNavigation(gShortcut)
          return
        }
        // 如果按了其他键，取消G键等待状态
        this.clearGKeyWaiting()
      }

      // P1-7: 检测G键按下，开始等待第二个键
      if (singleKey === 'g' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        this.startGKeyWaiting()
        return
      }

      // 查找对应的快捷键配置
      const shortcut = this.shortcuts[key]
      if (shortcut) {
        if (shortcut.preventDefault) {
          event.preventDefault()
        }
        this.executeAction(shortcut.action, event)
      }
    },

    /**
     * P1-7: 开始等待G键组合的第二个键
     */
    startGKeyWaiting() {
      this.waitingForGKey = true
      // 500ms内未按第二个键则取消
      this.gKeyTimeout = setTimeout(() => {
        this.waitingForGKey = false
        logger.debug('[Shortcuts] G键组合超时取消')
      }, 500)
      logger.debug('[Shortcuts] 等待G键组合...')
    },

    /**
     * P1-7: 清除G键等待状态
     */
    clearGKeyWaiting() {
      this.waitingForGKey = false
      if (this.gKeyTimeout) {
        clearTimeout(this.gKeyTimeout)
        this.gKeyTimeout = null
      }
    },

    /**
     * P1-7: 处理G键导航
     * @param {Object} shortcut - 快捷键配置
     */
    handleGKeyNavigation(shortcut) {
      logger.info(`[Shortcuts] G键导航: ${shortcut.description} -> ${shortcut.url}`)

      // 显示导航提示
      const notification = Alpine.store('notification')
      if (notification) {
        notification.show(`⌨️ ${shortcut.description}`, 'info')
      }

      // 延迟跳转，让用户看到提示
      setTimeout(() => {
        window.location.href = shortcut.url
      }, 200)
    },

    /**
     * 获取按键组合字符串
     * @param {KeyboardEvent} event - 键盘事件
     * @returns {string} 按键组合
     */
    getKeyCombo(event) {
      const parts = []
      if (event.ctrlKey || event.metaKey) parts.push('ctrl')
      if (event.altKey) parts.push('alt')
      if (event.shiftKey) parts.push('shift')

      const key = event.key.toLowerCase()
      if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
        parts.push(key)
      }

      return parts.join('+')
    },

    /**
     * 执行快捷键动作
     * @param {string} action - 动作名称
     * @param {KeyboardEvent} event - 键盘事件
     */
    executeAction(action, event) {
      // 检查自定义处理器
      if (this.handlers.has(action)) {
        const handler = this.handlers.get(action)
        handler(event)
        return
      }

      // 默认动作
      switch (action) {
        case 'openSearch':
          this.openGlobalSearch()
          break
        case 'closeModal':
          this.closeActiveModal()
          break
        case 'save':
          this.triggerSave()
          break
        case 'refresh':
          this.triggerRefresh()
          break
        case 'forceRefresh':
          this.triggerForceRefresh()
          break
        case 'create':
          this.triggerCreate()
          break
        case 'enterConfirm':
          this.handleEnterConfirm(event)
          break
        default:
          logger.debug('[Shortcuts] 未处理的动作:', action)
      }
    },

    /**
     * 注册自定义快捷键处理器
     * @param {string} action - 动作名称
     * @param {Function} handler - 处理函数
     */
    register(action, handler) {
      this.handlers.set(action, handler)
      logger.debug('[Shortcuts] 注册处理器:', action)
    },

    /**
     * 取消注册处理器
     * @param {string} action - 动作名称
     */
    unregister(action) {
      this.handlers.delete(action)
    },

    /**
     * 打开全局搜索
     */
    openGlobalSearch() {
      // 尝试使用 commandPalette store
      const commandPalette = Alpine.store('commandPalette')
      if (commandPalette && commandPalette.open) {
        commandPalette.open()
        return
      }

      // 回退：聚焦页面搜索框
      const searchInput =
        document.querySelector('[data-global-search]') ||
        document.querySelector('input[type="search"]') ||
        document.querySelector('input[placeholder*="搜索"]')

      if (searchInput) {
        searchInput.focus()
        searchInput.select()
        logger.debug('[Shortcuts] 聚焦搜索框')
      }
    },

    /**
     * 关闭活动的模态框
     */
    closeActiveModal() {
      // 尝试使用 Alpine modal store
      const modalStore = Alpine.store('modal')
      if (modalStore && modalStore.activeModal) {
        modalStore.close()
        return
      }

      // 尝试使用 confirm store
      const confirmStore = Alpine.store('confirm')
      if (confirmStore && confirmStore.isOpen) {
        confirmStore.cancel()
        return
      }

      // 触发自定义事件
      document.dispatchEvent(new CustomEvent('shortcuts:close-modal'))
    },

    /**
     * 触发保存
     */
    triggerSave() {
      // 查找活动表单
      const activeForm =
        document.querySelector('form:focus-within') || document.querySelector('form')

      if (activeForm) {
        const submitBtn =
          activeForm.querySelector('button[type="submit"]') ||
          activeForm.querySelector('button.btn-primary')
        if (submitBtn) {
          submitBtn.click()
          return
        }
      }

      // 触发自定义事件
      document.dispatchEvent(new CustomEvent('shortcuts:save'))
    },

    /**
     * 触发刷新
     */
    triggerRefresh() {
      document.dispatchEvent(new CustomEvent('shortcuts:refresh'))
    },

    /**
     * P1-7: 触发强制刷新（跳过缓存）
     */
    triggerForceRefresh() {
      logger.info('[Shortcuts] 触发强制刷新（跳过缓存）')

      // 显示刷新提示
      const notification = Alpine.store('notification')
      if (notification) {
        notification.show('🔄 正在强制刷新...', 'info')
      }

      // 清除sessionStorage缓存
      const keysToRemove = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (
          key &&
          (key.includes('cache') ||
            key.includes('pending') ||
            key.includes('dashboard') ||
            key.includes('stats'))
        ) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key))

      // 触发强制刷新事件
      document.dispatchEvent(new CustomEvent('shortcuts:force-refresh'))

      // 如果没有处理器监听，则重新加载页面
      setTimeout(() => {
        // 检查是否有页面组件处理了刷新
        const pageComponent = document.querySelector('[x-data]')
        if (
          pageComponent &&
          pageComponent.__x &&
          typeof pageComponent.__x.$data.refreshAll === 'function'
        ) {
          pageComponent.__x.$data.refreshAll()
        } else {
          // 回退：强制重新加载页面
          window.location.reload(true)
        }
      }, 100)
    },

    /**
     * 触发新建
     */
    triggerCreate() {
      document.dispatchEvent(new CustomEvent('shortcuts:create'))
    },

    /**
     * 处理 Enter 键确认
     * @param {KeyboardEvent} event - 键盘事件
     */
    handleEnterConfirm(event) {
      const target = event.target

      // 如果在表单中，检查是否应该提交
      const form = target.closest('form')
      if (form) {
        // 不阻止正常的表单提交
        return
      }

      // 如果在对话框中，点击主按钮
      const dialog = target.closest('[role="dialog"]') || target.closest('.modal')
      if (dialog) {
        const primaryBtn =
          dialog.querySelector('button[data-confirm]') ||
          dialog.querySelector('button.btn-primary') ||
          dialog.querySelector('button[type="submit"]')
        if (primaryBtn) {
          primaryBtn.click()
        }
      }
    },

    /**
     * 临时禁用快捷键
     */
    disable() {
      this.enabled = false
    },

    /**
     * 启用快捷键
     */
    enable() {
      this.enabled = true
    },

    /**
     * 获取快捷键帮助列表
     * @returns {Array} 快捷键帮助
     */
    getHelp() {
      // 普通快捷键
      const shortcuts = Object.entries(this.shortcuts).map(([key, config]) => ({
        key: key.replace('ctrl', '⌘/Ctrl').replace('+', ' + ').toUpperCase(),
        description: config.description,
        scope: config.scope
      }))

      // P1-7: G键组合快捷键
      const gShortcuts = Object.entries(this.gKeyShortcuts).map(([key, config]) => ({
        key: `G + ${key.toUpperCase()}`,
        description: config.description,
        scope: 'global'
      }))

      return [...shortcuts, ...gShortcuts]
    },

    /**
     * P1-7: 显示快捷键帮助弹窗
     */
    showHelp() {
      const help = this.getHelp()
      const modal = Alpine.store('modal')

      if (modal) {
        // 使用modal store显示帮助
        const helpHtml = `
          <div class="space-y-4">
            <h3 class="text-lg font-semibold themed-text">⌨️ 快捷键列表</h3>
            <div class="divide-y themed-divide">
              ${help
                .map(
                  item => `
                <div class="py-2 flex justify-between">
                  <span class="themed-text-muted">${item.description}</span>
                  <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">${item.key}</kbd>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        `
        // 可以触发自定义事件让页面处理
        document.dispatchEvent(
          new CustomEvent('shortcuts:show-help', { detail: { help, helpHtml } })
        )
      } else {
        // 简单的console输出
        logger.info('[Shortcuts] 快捷键帮助:')
        help.forEach(item => logger.info(`  ${item.key}: ${item.description}`))
      }
    },

    /**
     * 清理事件监听器
     */
    destroy() {
      if (this._globalKeyHandler) {
        document.removeEventListener('keydown', this._globalKeyHandler)
      }
      if (this.gKeyTimeout) {
        clearTimeout(this.gKeyTimeout)
      }
      logger.debug('[Shortcuts] 事件监听器已清理')
    }
  }
}

/**
 * Enter 键确认组件（用于表单/对话框）
 * @returns {Object} Alpine 组件数据
 */
export function enterConfirm() {
  return {
    /**
     * 处理按键事件
     * @param {KeyboardEvent} event - 键盘事件
     * @param {Function} callback - 确认回调
     */
    handleKeydown(event, callback) {
      if (event.key === 'Enter' && !event.shiftKey) {
        // 不在 textarea 中
        if (event.target.tagName !== 'TEXTAREA') {
          event.preventDefault()
          if (typeof callback === 'function') {
            callback()
          }
        }
      }
    }
  }
}

export default { shortcutsStore, enterConfirm }
