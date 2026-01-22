/**
 * 键盘快捷键管理模块
 * 提供统一的快捷键注册和管理
 * 
 * @file public/admin/js/core/keyboard.js
 * @description 支持组合键、上下文感知、快捷键帮助面板
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // 注册快捷键
 * KeyboardManager.register('ctrl+s', () => saveData(), { description: '保存' })
 * 
 * // 显示快捷键帮助
 * KeyboardManager.showHelp()
 */

const KeyboardManager = {
  // ========== 私有属性 ==========
  
  /** 快捷键映射表 */
  _shortcuts: new Map(),
  
  /** 是否已初始化 */
  _initialized: false,
  
  /** 是否启用 */
  _enabled: true,
  
  // ========== 初始化 ==========
  
  /**
   * 初始化键盘监听
   */
  init() {
    if (this._initialized) return
    
    document.addEventListener('keydown', (e) => this._handleKeydown(e))
    this._initialized = true
    
    // 注册默认快捷键
    this._registerDefaults()
    
    console.log('✅ 快捷键管理器已初始化')
  },
  
  // ========== 公开方法 ==========
  
  /**
   * 注册快捷键
   * 
   * @param {string} shortcut - 快捷键（如 'ctrl+s', 'ctrl+shift+f', 'escape'）
   * @param {Function} callback - 回调函数
   * @param {Object} options - 配置选项
   * @param {string} [options.description=''] - 快捷键描述
   * @param {string} [options.context='global'] - 上下文（全局或特定页面）
   * @param {boolean} [options.preventDefault=true] - 是否阻止默认行为
   * @param {boolean} [options.allowInInput=false] - 是否在输入框中也触发
   * 
   * @example
   * KeyboardManager.register('ctrl+s', saveDocument, {
   *   description: '保存文档',
   *   preventDefault: true
   * })
   */
  register(shortcut, callback, options = {}) {
    const { 
      description = '', 
      context = 'global',
      preventDefault = true,
      allowInInput = false
    } = options
    
    const key = this._normalizeShortcut(shortcut)
    
    this._shortcuts.set(key, {
      callback,
      description,
      context,
      preventDefault,
      allowInInput,
      shortcut: shortcut  // 保存原始格式用于显示
    })
    
    console.log(`[KeyboardManager] 注册快捷键: ${shortcut} (${description || '无描述'})`)
  },
  
  /**
   * 取消注册快捷键
   * 
   * @param {string} shortcut - 快捷键
   */
  unregister(shortcut) {
    const key = this._normalizeShortcut(shortcut)
    if (this._shortcuts.delete(key)) {
      console.log(`[KeyboardManager] 取消快捷键: ${shortcut}`)
    }
  },
  
  /**
   * 启用快捷键管理器
   */
  enable() {
    this._enabled = true
    console.log('[KeyboardManager] 已启用')
  },
  
  /**
   * 禁用快捷键管理器
   */
  disable() {
    this._enabled = false
    console.log('[KeyboardManager] 已禁用')
  },
  
  /**
   * 切换启用状态
   */
  toggle() {
    this._enabled = !this._enabled
    console.log(`[KeyboardManager] ${this._enabled ? '已启用' : '已禁用'}`)
  },
  
  /**
   * 获取所有已注册的快捷键
   * 
   * @returns {Array<{shortcut: string, description: string, context: string}>}
   */
  getAll() {
    const shortcuts = []
    for (const [key, value] of this._shortcuts) {
      shortcuts.push({
        shortcut: value.shortcut || key,
        description: value.description,
        context: value.context
      })
    }
    return shortcuts.sort((a, b) => a.shortcut.localeCompare(b.shortcut))
  },
  
  /**
   * 显示快捷键帮助（在控制台和返回数据）
   * 
   * @returns {Array}
   */
  showHelp() {
    const shortcuts = this.getAll()
    
    console.log('\n📋 快捷键列表:')
    console.log('━'.repeat(50))
    
    shortcuts.forEach(({ shortcut, description }) => {
      const formattedShortcut = shortcut.toUpperCase().replace(/\+/g, ' + ')
      console.log(`  ${formattedShortcut.padEnd(20)} ${description || '-'}`)
    })
    
    console.log('━'.repeat(50))
    console.log(`  共 ${shortcuts.length} 个快捷键\n`)
    
    return shortcuts
  },
  
  /**
   * 显示快捷键帮助弹窗
   */
  showHelpModal() {
    const shortcuts = this.getAll()
    
    let html = `
      <div class="modal fade" id="keyboardHelpModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-keyboard me-2"></i>快捷键帮助
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>快捷键</th>
                    <th>功能</th>
                  </tr>
                </thead>
                <tbody>
    `
    
    shortcuts.forEach(({ shortcut, description }) => {
      const formattedShortcut = shortcut.toUpperCase().replace(/\+/g, ' + ')
      html += `
        <tr>
          <td><kbd>${formattedShortcut}</kbd></td>
          <td>${description || '-'}</td>
        </tr>
      `
    })
    
    html += `
                </tbody>
              </table>
            </div>
            <div class="modal-footer">
              <small class="text-muted">按 ? 可再次打开此帮助</small>
            </div>
          </div>
        </div>
      </div>
    `
    
    // 移除旧的弹窗
    const old = document.getElementById('keyboardHelpModal')
    if (old) old.remove()
    
    // 添加新弹窗
    document.body.insertAdjacentHTML('beforeend', html)
    
    // 显示弹窗
    const modal = new bootstrap.Modal(document.getElementById('keyboardHelpModal'))
    modal.show()
  },
  
  // ========== 私有方法 ==========
  
  /**
   * 处理键盘事件
   * @private
   */
  _handleKeydown(e) {
    if (!this._enabled) return
    
    // 检查是否在输入框内
    const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
                      e.target.isContentEditable
    
    const key = this._eventToKey(e)
    const shortcut = this._shortcuts.get(key)
    
    if (!shortcut) return
    
    // 检查是否允许在输入框中触发
    if (isInInput && !shortcut.allowInInput) {
      // 只允许 Escape 和特定组合键在输入框中触发
      if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) {
        return
      }
    }
    
    // 阻止默认行为
    if (shortcut.preventDefault) {
      e.preventDefault()
    }
    
    // 执行回调
    console.log(`[KeyboardManager] 触发: ${shortcut.shortcut || key}`)
    shortcut.callback(e)
  },
  
  /**
   * 标准化快捷键字符串
   * @private
   */
  _normalizeShortcut(shortcut) {
    return shortcut
      .toLowerCase()
      .replace('command', 'ctrl')
      .replace('cmd', 'ctrl')
      .replace('control', 'ctrl')
      .replace('option', 'alt')
      .split('+')
      .map(s => s.trim())
      .sort()
      .join('+')
  },
  
  /**
   * 从事件生成快捷键字符串
   * @private
   */
  _eventToKey(e) {
    const parts = []
    
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.altKey) parts.push('alt')
    if (e.shiftKey) parts.push('shift')
    
    // 获取实际按键
    let key = e.key.toLowerCase()
    
    // 标准化特殊键名
    const keyMap = {
      'escape': 'escape',
      'esc': 'escape',
      'enter': 'enter',
      'return': 'enter',
      'tab': 'tab',
      'backspace': 'backspace',
      'delete': 'delete',
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right',
      ' ': 'space'
    }
    
    key = keyMap[key] || key
    
    // 不添加修饰键本身
    if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
      parts.push(key)
    }
    
    return parts.sort().join('+')
  },
  
  /**
   * 注册默认快捷键
   * @private
   */
  _registerDefaults() {
    // Ctrl+S - 保存（阻止浏览器默认保存，触发页面保存按钮）
    this.register('ctrl+s', (e) => {
      const saveBtn = document.querySelector('[data-shortcut="save"]')
      if (saveBtn) {
        saveBtn.click()
      }
    }, { description: '保存', allowInInput: true })
    
    // Escape - 关闭模态框
    this.register('escape', () => {
      const modal = document.querySelector('.modal.show')
      if (modal) {
        bootstrap.Modal.getInstance(modal)?.hide()
      }
    }, { description: '关闭弹窗', allowInInput: true })
    
    // Ctrl+F - 聚焦搜索框（覆盖浏览器查找）
    this.register('ctrl+f', () => {
      const searchInput = document.querySelector('[data-shortcut="search"]') ||
                         document.querySelector('input[type="search"]') ||
                         document.querySelector('input[placeholder*="搜索"]')
      if (searchInput) {
        searchInput.focus()
        searchInput.select()
      }
    }, { description: '搜索', allowInInput: false })
    
    // Ctrl+R - 刷新数据（阻止页面刷新）
    this.register('ctrl+r', () => {
      const refreshBtn = document.querySelector('[data-shortcut="refresh"]')
      if (refreshBtn) {
        refreshBtn.click()
      }
    }, { description: '刷新数据' })
    
    // Ctrl+N - 新增
    this.register('ctrl+n', () => {
      const addBtn = document.querySelector('[data-shortcut="add"]')
      if (addBtn) {
        addBtn.click()
      }
    }, { description: '新增' })
    
    // ? - 显示快捷键帮助
    this.register('shift+/', () => {
      this.showHelpModal()
    }, { description: '快捷键帮助', allowInInput: false })
    
    // Ctrl+Home - 回到顶部
    this.register('ctrl+home', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, { description: '回到顶部' })
    
    // Ctrl+End - 到底部
    this.register('ctrl+end', () => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }, { description: '到底部' })
  }
}

// 导出到全局作用域
window.KeyboardManager = KeyboardManager

// DOM 加载完成后自动初始化
document.addEventListener('DOMContentLoaded', () => {
  KeyboardManager.init()
})

console.log('✅ KeyboardManager 快捷键模块已加载')

