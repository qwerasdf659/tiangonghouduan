/**
 * 异步数据加载 Mixin
 * 解决：重复的 try-catch-finally 模式、加载状态管理
 * 
 * @file public/admin/js/alpine/mixins/async-data.js
 * @description 提供统一的异步操作包装、加载状态管理和错误处理
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * function myPage() {
 *   return {
 *     ...asyncDataMixin(),
 *     data: [],
 *     async loadData() {
 *       const result = await this.withLoading(async () => {
 *         const response = await apiRequest('/api/list')
 *         return response.data
 *       })
 *       if (result.success) {
 *         this.data = result.data
 *       }
 *     }
 *   }
 * }
 */
function asyncDataMixin() {
  return {
    // ========== 加载状态 ==========
    
    /** 普通加载状态（表格等局部加载） */
    loading: false,
    
    /** 全局加载状态（遮罩层） */
    globalLoading: false,
    
    /** 最后一次错误信息 */
    error: null,
    
    // ========== 核心方法 ==========
    
    /**
     * 带加载状态的异步操作包装器
     * 自动管理 loading 状态和错误处理
     * 
     * @param {Function} asyncFn - 异步函数
     * @param {Object} options - 配置选项
     * @param {boolean} [options.global=false] - 是否使用全局加载状态
     * @param {string} [options.errorMessage='操作失败'] - 错误提示消息
     * @param {boolean} [options.showError=true] - 是否显示错误 Toast
     * @param {boolean} [options.showSuccess=false] - 是否显示成功 Toast
     * @param {string} [options.successMessage='操作成功'] - 成功提示消息
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     * 
     * @example
     * const result = await this.withLoading(async () => {
     *   return await apiRequest('/api/save', { method: 'POST', body: data })
     * }, { showSuccess: true, successMessage: '保存成功' })
     */
    async withLoading(asyncFn, options = {}) {
      const { 
        global = false, 
        errorMessage = '操作失败', 
        showError = true,
        showSuccess = false,
        successMessage = '操作成功'
      } = options
      
      const loadingKey = global ? 'globalLoading' : 'loading'
      this[loadingKey] = true
      this.error = null
      
      try {
        const result = await asyncFn()
        
        if (showSuccess) {
          this.$toast?.success(successMessage)
        }
        
        return { success: true, data: result }
      } catch (error) {
        console.error(`${errorMessage}:`, error)
        this.error = error.message
        
        if (showError) {
          this.$toast?.error(error.message || errorMessage)
        }
        
        return { success: false, error }
      } finally {
        this[loadingKey] = false
      }
    },
    
    /**
     * 标准 API 请求包装器
     * 自动处理响应格式和错误
     * 
     * @param {string} url - API 地址
     * @param {Object} fetchOptions - fetch 配置
     * @param {Object} loadingOptions - 加载状态配置
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async apiCall(url, fetchOptions = {}, loadingOptions = {}) {
      return this.withLoading(async () => {
        const response = await apiRequest(url, fetchOptions)
        
        if (response && response.success) {
          return response.data
        } else {
          throw new Error(response?.message || '请求失败')
        }
      }, loadingOptions)
    },
    
    /**
     * GET 请求快捷方法
     * 
     * @param {string} url - API 地址
     * @param {Object} params - 查询参数
     * @param {Object} loadingOptions - 加载状态配置
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async apiGet(url, params = {}, loadingOptions = {}) {
      const queryString = new URLSearchParams(params).toString()
      const fullUrl = queryString ? `${url}?${queryString}` : url
      return this.apiCall(fullUrl, {}, loadingOptions)
    },
    
    /**
     * POST 请求快捷方法
     * 
     * @param {string} url - API 地址
     * @param {Object} data - 请求数据
     * @param {Object} loadingOptions - 加载状态配置
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async apiPost(url, data = {}, loadingOptions = {}) {
      return this.apiCall(url, {
        method: 'POST',
        body: JSON.stringify(data)
      }, loadingOptions)
    },
    
    /**
     * PUT 请求快捷方法
     * 
     * @param {string} url - API 地址
     * @param {Object} data - 请求数据
     * @param {Object} loadingOptions - 加载状态配置
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async apiPut(url, data = {}, loadingOptions = {}) {
      return this.apiCall(url, {
        method: 'PUT',
        body: JSON.stringify(data)
      }, loadingOptions)
    },
    
    /**
     * DELETE 请求快捷方法
     * 
     * @param {string} url - API 地址
     * @param {Object} loadingOptions - 加载状态配置
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async apiDelete(url, loadingOptions = {}) {
      return this.apiCall(url, { method: 'DELETE' }, loadingOptions)
    },
    
    /**
     * 带确认对话框的危险操作
     * 
     * @param {string} message - 确认消息
     * @param {Function} asyncFn - 异步函数
     * @param {Object} options - 配置选项
     * @returns {Promise<{success: boolean, data?: any, error?: Error, cancelled?: boolean}>}
     * 
     * @example
     * const result = await this.confirmAndExecute(
     *   '确定要删除吗？此操作不可撤销。',
     *   async () => await apiRequest('/api/delete/' + id, { method: 'DELETE' })
     * )
     */
    async confirmAndExecute(message, asyncFn, options = {}) {
      // 使用全局确认对话框（如果存在）
      if (Alpine?.store?.('ui')?.confirm) {
        const confirmed = await Alpine.store('ui').confirm({
          message,
          type: options.type || 'warning',
          ...options
        })
        if (!confirmed) {
          return { success: false, cancelled: true }
        }
      } else {
        // 降级为原生 confirm
        if (!confirm(message)) {
          return { success: false, cancelled: true }
        }
      }
      
      return this.withLoading(asyncFn, { global: true, ...options })
    },
    
    /**
     * 显示成功消息
     * @param {string} message - 消息内容
     */
    showSuccess(message) {
      this.$toast?.success(message)
    },
    
    /**
     * 显示错误消息
     * @param {string} message - 消息内容
     */
    showError(message) {
      this.$toast?.error(message)
    },
    
    /**
     * 显示警告消息
     * @param {string} message - 消息内容
     */
    showWarning(message) {
      this.$toast?.warning(message)
    },
    
    /**
     * 显示信息消息
     * @param {string} message - 消息内容
     */
    showInfo(message) {
      this.$toast?.info(message)
    }
  }
}

// 导出到全局作用域
window.asyncDataMixin = asyncDataMixin

console.log('✅ AsyncData Mixin 已加载')

