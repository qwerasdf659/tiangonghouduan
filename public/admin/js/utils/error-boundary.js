/**
 * 错误边界模块
 * 为 Alpine.js 组件提供错误边界功能
 * 
 * @file public/admin/js/utils/error-boundary.js
 * @description 捕获组件渲染错误，显示友好的错误界面
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // 在页面组件中使用
 * function myPage() {
 *   return ErrorBoundary.wrap({
 *     data: [],
 *     async loadData() {
 *       // 可能出错的代码
 *     }
 *   })
 * }
 */

const ErrorBoundary = {
  // ========== 配置 ==========
  
  /** 默认错误界面 HTML */
  defaultErrorHTML: `
    <div class="error-boundary-fallback d-flex flex-column align-items-center justify-content-center py-5">
      <div class="text-danger mb-3">
        <i class="bi bi-exclamation-triangle fs-1"></i>
      </div>
      <h5 class="text-muted mb-2">页面加载出错</h5>
      <p class="text-muted small mb-3" x-text="$data.errorMessage || '发生了意外错误'"></p>
      <button class="btn btn-outline-primary btn-sm" @click="$data.retryLoad && $data.retryLoad()">
        <i class="bi bi-arrow-clockwise me-1"></i>重试
      </button>
    </div>
  `,
  
  // ========== 核心方法 ==========
  
  /**
   * 包装 Alpine 组件，添加错误边界
   * 
   * @param {Object} component - Alpine 组件定义
   * @param {Object} [options={}] - 选项
   * @param {Function} [options.onError] - 错误回调
   * @param {boolean} [options.showFallback=true] - 是否显示降级界面
   * @returns {Object} 包装后的组件
   * 
   * @example
   * function myPage() {
   *   return ErrorBoundary.wrap({
   *     users: [],
   *     async init() {
   *       await this.loadUsers()
   *     },
   *     async loadUsers() {
   *       // ...
   *     }
   *   })
   * }
   */
  wrap(component, options = {}) {
    const { onError, showFallback = true } = options
    
    return {
      // ========== 错误边界状态 ==========
      _hasError: false,
      _errorMessage: '',
      _errorStack: '',
      
      // 获取错误消息（用于模板）
      get errorMessage() {
        return this._errorMessage
      },
      
      // ========== 原组件属性和方法 ==========
      ...component,
      
      // ========== 生命周期包装 ==========
      async init() {
        try {
          // 调用原始 init
          if (component.init) {
            await component.init.call(this)
          }
        } catch (error) {
          this._handleError(error, 'init')
        }
      },
      
      // ========== 错误处理 ==========
      
      /**
       * 处理错误
       * @private
       */
      _handleError(error, context = '') {
        console.error(`[ErrorBoundary] 组件错误 (${context}):`, error)
        
        this._hasError = true
        this._errorMessage = error?.message || '发生了意外错误'
        this._errorStack = error?.stack || ''
        
        // 调用错误回调
        if (onError) {
          onError(error, context)
        }
        
        // 报告错误
        if (window.ErrorHandler) {
          window.ErrorHandler.report(error, { context: `component_${context}` })
        }
        
        // 显示降级界面
        if (showFallback) {
          this._showFallbackUI()
        }
      },
      
      /**
       * 显示降级界面
       * @private
       */
      _showFallbackUI() {
        // 在 Alpine 下一个 tick 更新 UI
        this.$nextTick?.(() => {
          // UI 会自动根据 _hasError 状态显示
        })
      },
      
      /**
       * 重试加载
       */
      async retryLoad() {
        this._hasError = false
        this._errorMessage = ''
        this._errorStack = ''
        
        try {
          if (component.init) {
            await component.init.call(this)
          }
        } catch (error) {
          this._handleError(error, 'retry')
        }
      },
      
      /**
       * 安全执行异步方法
       * 
       * @param {Function} fn - 异步函数
       * @param {string} [context=''] - 上下文描述
       * @returns {Promise<any>}
       */
      async safeExecute(fn, context = '') {
        try {
          return await fn.call(this)
        } catch (error) {
          this._handleError(error, context)
          return null
        }
      }
    }
  },
  
  /**
   * 创建安全的方法包装器
   * 用于包装组件中的异步方法
   * 
   * @param {Function} method - 原方法
   * @param {Object} options - 选项
   * @returns {Function} 包装后的方法
   * 
   * @example
   * function myPage() {
   *   return {
   *     loadData: ErrorBoundary.safeMethod(async function() {
   *       // 可能出错的代码
   *     }, { fallback: [] })
   *   }
   * }
   */
  safeMethod(method, options = {}) {
    const { fallback = null, showToast = true, context = '' } = options
    
    return async function(...args) {
      try {
        return await method.apply(this, args)
      } catch (error) {
        console.error(`[ErrorBoundary] 方法执行错误:`, error)
        
        // 显示提示
        if (showToast && window.ErrorHandler) {
          window.ErrorHandler.handle(error, { showToast: true, context })
        }
        
        return fallback
      }
    }
  },
  
  /**
   * 创建错误边界组件指令
   * 用于在 HTML 中添加错误边界
   * 
   * @example
   * // HTML 中使用
   * <div x-error-boundary>
   *   <div x-if="!$data._hasError">
   *     <!-- 正常内容 -->
   *   </div>
   *   <div x-if="$data._hasError">
   *     <!-- 错误界面 -->
   *   </div>
   * </div>
   */
  registerDirective() {
    if (typeof Alpine === 'undefined') {
      console.warn('[ErrorBoundary] Alpine.js 未加载，无法注册指令')
      return
    }
    
    Alpine.directive('error-boundary', (el, { expression }, { evaluate }) => {
      const config = expression ? evaluate(expression) : {}
      
      // 添加错误边界样式
      el.classList.add('error-boundary')
      
      // 监听错误
      el.addEventListener('error', (event) => {
        console.error('[ErrorBoundary] 捕获到 DOM 错误:', event)
        
        // 显示错误界面
        const fallback = document.createElement('div')
        fallback.innerHTML = ErrorBoundary.defaultErrorHTML
        fallback.classList.add('error-boundary-fallback-container')
        
        el.innerHTML = ''
        el.appendChild(fallback)
      }, true)
    })
    
    console.log('[ErrorBoundary] Alpine 指令已注册')
  },
  
  /**
   * 获取错误边界的 CSS 样式
   * @returns {string}
   */
  getStyles() {
    return `
      .error-boundary {
        position: relative;
      }
      
      .error-boundary-fallback {
        min-height: 200px;
        background-color: #fff;
        border: 1px solid #dee2e6;
        border-radius: 0.375rem;
      }
      
      .error-boundary-fallback-container {
        animation: errorFadeIn 0.3s ease-out;
      }
      
      @keyframes errorFadeIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `
  },
  
  /**
   * 注入错误边界样式
   */
  injectStyles() {
    const styleId = 'error-boundary-styles'
    
    if (document.getElementById(styleId)) {
      return
    }
    
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = this.getStyles()
    document.head.appendChild(style)
    
    console.log('[ErrorBoundary] 样式已注入')
  }
}

// 自动注入样式
ErrorBoundary.injectStyles()

// DOM 加载后注册指令
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Alpine !== 'undefined') {
    ErrorBoundary.registerDirective()
  }
})

// 导出到全局作用域
window.ErrorBoundary = ErrorBoundary

console.log('✅ ErrorBoundary 错误边界模块已加载')

