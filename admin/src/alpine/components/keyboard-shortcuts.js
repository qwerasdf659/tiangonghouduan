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
  // 新建
  'ctrl+n': {
    action: 'create',
    description: '新建',
    scope: 'page'
  }
}

/**
 * 快捷键 Store
 * @returns {Object} Alpine Store 数据
 */
export function shortcutsStore() {
  return {
    shortcuts: { ...DEFAULT_SHORTCUTS },
    enabled: true,
    activeScope: 'global',
    searchOpen: false,
    handlers: new Map(),

    /**
     * 初始化全局快捷键监听
     */
    init() {
      document.addEventListener('keydown', this.handleGlobalKey.bind(this))
      logger.info('[Shortcuts] 全局快捷键系统已初始化')
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
      const activeForm = document.querySelector('form:focus-within') || document.querySelector('form')

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
      return Object.entries(this.shortcuts).map(([key, config]) => ({
        key: key.replace('ctrl', '⌘/Ctrl').replace('+', ' + ').toUpperCase(),
        description: config.description,
        scope: config.scope
      }))
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

