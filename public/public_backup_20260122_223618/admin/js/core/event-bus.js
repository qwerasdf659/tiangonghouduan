/**
 * 事件总线模块
 * 解决：组件间通信困难、事件管理混乱
 * 
 * @file public/admin/js/core/event-bus.js
 * @description 提供发布/订阅模式的事件通信机制
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // 订阅事件
 * EventBus.on('user:updated', (data) => {
 *   console.log('用户已更新:', data)
 * })
 * 
 * // 发布事件
 * EventBus.emit('user:updated', { user_id: 123, name: 'New Name' })
 * 
 * // 取消订阅
 * EventBus.off('user:updated', handler)
 */

const EventBus = {
  // ========== 私有属性 ==========
  
  /** 事件监听器映射 */
  _listeners: new Map(),
  
  /** 调试模式 */
  _debug: false,
  
  // ========== 核心方法 ==========
  
  /**
   * 订阅事件
   * 
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   * @param {Object} [options={}] - 选项
   * @param {boolean} [options.once=false] - 是否只触发一次
   * @returns {Function} 取消订阅的函数
   * 
   * @example
   * const unsubscribe = EventBus.on('data:loaded', (data) => {
   *   console.log('数据已加载')
   * })
   * // 之后取消订阅
   * unsubscribe()
   */
  on(event, handler, options = {}) {
    const { once = false } = options
    
    if (!this._listeners.has(event)) {
      this._listeners.set(event, [])
    }
    
    const listener = { handler, once }
    this._listeners.get(event).push(listener)
    
    this._log(`订阅事件: ${event}`)
    
    // 返回取消订阅函数
    return () => this.off(event, handler)
  },
  
  /**
   * 订阅事件（只触发一次）
   * 
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   * @returns {Function} 取消订阅的函数
   * 
   * @example
   * EventBus.once('init:complete', () => {
   *   console.log('初始化完成（只触发一次）')
   * })
   */
  once(event, handler) {
    return this.on(event, handler, { once: true })
  },
  
  /**
   * 取消订阅事件
   * 
   * @param {string} event - 事件名称
   * @param {Function} [handler] - 事件处理函数（可选，不传则移除该事件所有监听器）
   * 
   * @example
   * // 移除特定处理函数
   * EventBus.off('user:updated', myHandler)
   * 
   * // 移除事件的所有监听器
   * EventBus.off('user:updated')
   */
  off(event, handler) {
    if (!this._listeners.has(event)) return
    
    if (handler) {
      const listeners = this._listeners.get(event)
      const index = listeners.findIndex(l => l.handler === handler)
      if (index > -1) {
        listeners.splice(index, 1)
        this._log(`取消订阅: ${event}`)
      }
    } else {
      this._listeners.delete(event)
      this._log(`移除所有监听器: ${event}`)
    }
  },
  
  /**
   * 发布事件
   * 
   * @param {string} event - 事件名称
   * @param {...any} args - 传递给处理函数的参数
   * @returns {number} 触发的监听器数量
   * 
   * @example
   * EventBus.emit('user:updated', { user_id: 123 }, { source: 'api' })
   */
  emit(event, ...args) {
    if (!this._listeners.has(event)) {
      this._log(`无监听器: ${event}`)
      return 0
    }
    
    const listeners = this._listeners.get(event)
    let count = 0
    
    // 复制一份数组，避免在遍历时修改
    const listenersCopy = [...listeners]
    
    listenersCopy.forEach(listener => {
      try {
        listener.handler(...args)
        count++
        
        // 移除一次性监听器
        if (listener.once) {
          this.off(event, listener.handler)
        }
      } catch (error) {
        console.error(`[EventBus] 事件处理出错: ${event}`, error)
      }
    })
    
    this._log(`触发事件: ${event} (${count} 个监听器)`)
    return count
  },
  
  /**
   * 检查是否有监听器
   * 
   * @param {string} event - 事件名称
   * @returns {boolean}
   */
  hasListeners(event) {
    const listeners = this._listeners.get(event)
    return listeners && listeners.length > 0
  },
  
  /**
   * 获取事件的监听器数量
   * 
   * @param {string} event - 事件名称
   * @returns {number}
   */
  listenerCount(event) {
    const listeners = this._listeners.get(event)
    return listeners ? listeners.length : 0
  },
  
  /**
   * 获取所有已注册的事件名称
   * 
   * @returns {string[]}
   */
  eventNames() {
    return Array.from(this._listeners.keys())
  },
  
  /**
   * 清除所有事件监听器
   */
  clear() {
    this._listeners.clear()
    this._log('清除所有事件监听器')
  },
  
  /**
   * 启用/禁用调试模式
   * 
   * @param {boolean} enabled
   */
  debug(enabled) {
    this._debug = enabled
    console.log(`[EventBus] 调试模式: ${enabled ? '开启' : '关闭'}`)
  },
  
  /**
   * 打印统计信息
   */
  stats() {
    const events = this.eventNames()
    console.log('\n📊 EventBus 统计信息:')
    console.log(`   事件总数: ${events.length}`)
    
    events.forEach(event => {
      console.log(`   - ${event}: ${this.listenerCount(event)} 个监听器`)
    })
  },
  
  // ========== 私有方法 ==========
  
  _log(message) {
    if (this._debug) {
      console.log(`[EventBus] ${message}`)
    }
  }
}

// ========== 预定义事件常量 ==========

/**
 * 预定义的事件名称常量
 * 便于统一管理和避免拼写错误
 */
EventBus.Events = {
  // 认证相关
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_EXPIRED: 'auth:expired',
  
  // 数据相关
  DATA_LOADED: 'data:loaded',
  DATA_UPDATED: 'data:updated',
  DATA_DELETED: 'data:deleted',
  
  // 用户相关
  USER_CREATED: 'user:created',
  USER_UPDATED: 'user:updated',
  USER_DELETED: 'user:deleted',
  USER_BANNED: 'user:banned',
  
  // UI 相关
  UI_LOADING_START: 'ui:loading:start',
  UI_LOADING_END: 'ui:loading:end',
  UI_TOAST: 'ui:toast',
  UI_MODAL_OPEN: 'ui:modal:open',
  UI_MODAL_CLOSE: 'ui:modal:close',
  
  // 缓存相关
  CACHE_CLEARED: 'cache:cleared',
  CACHE_UPDATED: 'cache:updated',
  
  // 表单相关
  FORM_SUBMIT: 'form:submit',
  FORM_RESET: 'form:reset',
  FORM_VALIDATE: 'form:validate',
  
  // 页面相关
  PAGE_INIT: 'page:init',
  PAGE_READY: 'page:ready',
  PAGE_DESTROY: 'page:destroy'
}

// 导出到全局作用域
window.EventBus = EventBus

console.log('✅ EventBus 事件总线模块已加载')

