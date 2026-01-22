/**
 * 统一错误处理模块
 * 解决：分散的错误处理逻辑、错误日志不统一
 * 
 * @file public/admin/js/utils/error-handler.js
 * @description 提供统一的错误捕获、分类、报告和用户提示
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // 包装异步函数
 * const safeLoadData = ErrorHandler.wrap(loadData, { 
 *   fallback: [], 
 *   showToast: true 
 * })
 * 
 * // 手动报告错误
 * ErrorHandler.report(error, { context: 'user_list_load' })
 */

const ErrorHandler = {
  // ========== 配置 ==========
  
  /** 是否在控制台显示错误 */
  logToConsole: true,
  
  /** 是否显示用户提示 */
  showUserToast: true,
  
  /** 错误报告回调 */
  reportCallback: null,
  
  /** 错误历史（用于调试） */
  _errorHistory: [],
  
  /** 最大历史记录数 */
  _maxHistory: 50,
  
  // ========== 错误分类 ==========
  
  /**
   * 错误类型枚举
   */
  ErrorTypes: {
    NETWORK: 'network',       // 网络错误
    API: 'api',               // API 错误
    AUTH: 'auth',             // 认证错误
    VALIDATION: 'validation', // 验证错误
    PERMISSION: 'permission', // 权限错误
    TIMEOUT: 'timeout',       // 超时错误
    UNKNOWN: 'unknown'        // 未知错误
  },
  
  /**
   * 根据错误对象判断错误类型
   * 
   * @param {Error|Object} error - 错误对象
   * @returns {string} 错误类型
   */
  classify(error) {
    const message = error?.message?.toLowerCase() || ''
    const status = error?.status || error?.response?.status
    
    // 网络错误
    if (error instanceof TypeError && message.includes('fetch')) {
      return this.ErrorTypes.NETWORK
    }
    
    if (message.includes('network') || message.includes('断网') || message.includes('offline')) {
      return this.ErrorTypes.NETWORK
    }
    
    // 认证错误
    if (status === 401 || message.includes('unauthorized') || message.includes('登录')) {
      return this.ErrorTypes.AUTH
    }
    
    // 权限错误
    if (status === 403 || message.includes('forbidden') || message.includes('权限')) {
      return this.ErrorTypes.PERMISSION
    }
    
    // 超时错误
    if (message.includes('timeout') || message.includes('超时')) {
      return this.ErrorTypes.TIMEOUT
    }
    
    // 验证错误
    if (status === 400 || message.includes('invalid') || message.includes('验证')) {
      return this.ErrorTypes.VALIDATION
    }
    
    // API 错误
    if (status >= 400 && status < 600) {
      return this.ErrorTypes.API
    }
    
    return this.ErrorTypes.UNKNOWN
  },
  
  // ========== 核心方法 ==========
  
  /**
   * 包装异步函数，自动处理错误
   * 
   * @param {Function} fn - 异步函数
   * @param {Object} options - 选项
   * @param {any} [options.fallback=null] - 出错时的返回值
   * @param {boolean} [options.showToast=true] - 是否显示提示
   * @param {boolean} [options.rethrow=false] - 是否重新抛出错误
   * @param {string} [options.context=''] - 错误上下文
   * @returns {Function} 包装后的函数
   * 
   * @example
   * const safeLoadUsers = ErrorHandler.wrap(loadUsers, { 
   *   fallback: [],
   *   context: 'user_list'
   * })
   * 
   * const users = await safeLoadUsers()
   */
  wrap(fn, options = {}) {
    const { 
      fallback = null, 
      showToast = true, 
      rethrow = false,
      context = ''
    } = options
    
    return async (...args) => {
      try {
        return await fn(...args)
      } catch (error) {
        this.handle(error, { showToast, context })
        
        if (rethrow) {
          throw error
        }
        
        return fallback
      }
    }
  },
  
  /**
   * 处理错误
   * 
   * @param {Error|Object} error - 错误对象
   * @param {Object} options - 选项
   * @param {boolean} [options.showToast=true] - 是否显示提示
   * @param {string} [options.context=''] - 错误上下文
   */
  handle(error, options = {}) {
    const { showToast = this.showUserToast, context = '' } = options
    
    // 分类错误
    const errorType = this.classify(error)
    
    // 构建错误信息
    const errorInfo = {
      type: errorType,
      message: this._extractMessage(error),
      timestamp: new Date().toISOString(),
      context,
      stack: error?.stack,
      raw: error
    }
    
    // 记录错误历史
    this._recordHistory(errorInfo)
    
    // 控制台日志
    if (this.logToConsole) {
      console.error(`[ErrorHandler] ${errorType}:`, errorInfo.message, {
        context,
        error
      })
    }
    
    // 用户提示
    if (showToast) {
      this._showUserToast(errorType, errorInfo.message)
    }
    
    // 报告错误
    this._report(errorInfo)
  },
  
  /**
   * 报告错误（不显示提示）
   * 
   * @param {Error|Object} error - 错误对象
   * @param {Object} extra - 额外信息
   */
  report(error, extra = {}) {
    this.handle(error, { showToast: false, ...extra })
  },
  
  // ========== 特定错误处理 ==========
  
  /**
   * 处理 API 错误
   * 
   * @param {Object} response - API 响应
   * @returns {boolean} 是否有错误
   */
  handleApiResponse(response) {
    if (!response || response.success === false) {
      const message = response?.message || response?.msg || '请求失败'
      
      this.handle({
        message,
        status: response?.code,
        response
      }, { context: 'api_response' })
      
      return true
    }
    return false
  },
  
  /**
   * 处理认证错误（自动跳转登录）
   * 
   * @param {Error|Object} error - 错误对象
   */
  handleAuthError(error) {
    const errorType = this.classify(error)
    
    if (errorType === this.ErrorTypes.AUTH) {
      console.log('[ErrorHandler] 认证失败，跳转登录页...')
      
      // 清除 Token
      localStorage.removeItem('adminToken')
      
      // 提示用户
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').warning('登录已过期，请重新登录')
      }
      
      // 延迟跳转
      setTimeout(() => {
        window.location.href = '/admin/login.html'
      }, 1500)
      
      return true
    }
    
    return false
  },
  
  // ========== 辅助方法 ==========
  
  /**
   * 提取错误消息
   * @private
   */
  _extractMessage(error) {
    if (!error) return '未知错误'
    
    // 字符串
    if (typeof error === 'string') return error
    
    // API 响应
    if (error.message) return error.message
    if (error.msg) return error.msg
    if (error.error) return error.error
    
    // Response 对象
    if (error.response?.data?.message) return error.response.data.message
    
    return '操作失败，请稍后重试'
  },
  
  /**
   * 显示用户提示
   * @private
   */
  _showUserToast(errorType, message) {
    // 获取友好的错误消息
    const friendlyMessage = this._getFriendlyMessage(errorType, message)
    
    // 使用 Alpine Store 的通知
    if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
      Alpine.store('notification').error(friendlyMessage)
      return
    }
    
    // 降级到 alert
    console.warn('[ErrorHandler] 提示:', friendlyMessage)
  },
  
  /**
   * 获取友好的错误消息
   * @private
   */
  _getFriendlyMessage(errorType, originalMessage) {
    // 特定类型的友好消息
    const typeMessages = {
      [this.ErrorTypes.NETWORK]: '网络连接失败，请检查网络设置',
      [this.ErrorTypes.TIMEOUT]: '请求超时，请稍后重试',
      [this.ErrorTypes.AUTH]: '登录已过期，请重新登录',
      [this.ErrorTypes.PERMISSION]: '您没有权限执行此操作'
    }
    
    // 如果有特定类型消息且原消息是英文，使用友好消息
    if (typeMessages[errorType] && /^[a-zA-Z\s]+$/.test(originalMessage)) {
      return typeMessages[errorType]
    }
    
    return originalMessage
  },
  
  /**
   * 记录错误历史
   * @private
   */
  _recordHistory(errorInfo) {
    this._errorHistory.unshift(errorInfo)
    
    // 保持历史记录数量限制
    if (this._errorHistory.length > this._maxHistory) {
      this._errorHistory = this._errorHistory.slice(0, this._maxHistory)
    }
  },
  
  /**
   * 报告错误到服务端或监控系统
   * @private
   */
  _report(errorInfo) {
    if (this.reportCallback) {
      try {
        this.reportCallback(errorInfo)
      } catch (e) {
        console.error('[ErrorHandler] 错误报告失败:', e)
      }
    }
  },
  
  // ========== 调试方法 ==========
  
  /**
   * 获取错误历史
   * @returns {Array}
   */
  getHistory() {
    return [...this._errorHistory]
  },
  
  /**
   * 清除错误历史
   */
  clearHistory() {
    this._errorHistory = []
  },
  
  /**
   * 打印错误历史
   */
  printHistory() {
    console.log('\n📋 错误历史:')
    console.log('━'.repeat(50))
    
    if (this._errorHistory.length === 0) {
      console.log('  无错误记录')
    } else {
      this._errorHistory.forEach((error, index) => {
        console.log(`  ${index + 1}. [${error.type}] ${error.message}`)
        console.log(`     时间: ${error.timestamp}`)
        if (error.context) {
          console.log(`     上下文: ${error.context}`)
        }
      })
    }
    
    console.log('━'.repeat(50))
  },
  
  /**
   * 设置错误报告回调
   * 
   * @param {Function} callback - 回调函数，接收 errorInfo 参数
   */
  setReportCallback(callback) {
    this.reportCallback = callback
  }
}

// ========== 全局错误捕获 ==========

// 捕获未处理的 Promise rejection
window.addEventListener('unhandledrejection', (event) => {
  console.error('[ErrorHandler] 未处理的 Promise rejection:', event.reason)
  
  ErrorHandler.handle(event.reason, {
    showToast: false,
    context: 'unhandled_rejection'
  })
  
  // 阻止默认处理
  event.preventDefault()
})

// 捕获全局错误
window.addEventListener('error', (event) => {
  // 忽略脚本加载错误
  if (event.filename) {
    ErrorHandler.handle(event.error || event.message, {
      showToast: false,
      context: `global_error: ${event.filename}:${event.lineno}`
    })
  }
})

// 导出到全局作用域
window.ErrorHandler = ErrorHandler

console.log('✅ ErrorHandler 错误处理模块已加载')

