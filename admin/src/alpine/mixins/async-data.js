/**
 * 异步数据加载 Mixin（ES Module 版本）
 *
 * @description 提供统一的异步操作包装、加载状态管理、错误处理和标准化数据加载模式
 * @version 3.0.0 - 增加标准化 loadData 模式，减少 24 处重复代码
 * @date 2026-01-23
 *
 * @example 基础用法
 * import { asyncDataMixin } from '@/alpine/mixins/index.js'
 *
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
 *
 * @example 使用标准化数据加载器
 * import { asyncDataMixin, createDataLoaderConfig } from '@/alpine/mixins/async-data.js'
 *
 * function userPage() {
 *   const loaderConfig = createDataLoaderConfig({
 *     endpoint: USER_ENDPOINTS.LIST,
 *     dataKey: 'users',
 *     listField: 'users'
 *   })
 *
 *   return {
 *     ...asyncDataMixin(),
 *     ...loaderConfig,
 *     users: [],
 *
 *     async init() {
 *       await this.loadListData()
 *     }
 *   }
 * }
 */

import { logger } from '../../utils/logger.js'
import { request } from '@/api/base.js'

/**
 * 创建标准化数据加载器配置
 * 解决 24 处重复的 loadData 模式问题
 *
 * @param {Object} config - 加载器配置
 * @param {string} config.endpoint - API 端点
 * @param {string} [config.dataKey='data'] - 组件中存储数据的属性名
 * @param {string} [config.listField='list'] - API 响应中列表数据的字段名
 * @param {string} [config.totalField='total'] - API 响应中总数的字段名
 * @param {Object} [config.defaultFilters={}] - 默认筛选条件
 * @param {Function} [config.transformResponse] - 响应数据转换函数
 * @param {Function} [config.buildParams] - 自定义参数构建函数
 * @returns {Object} 数据加载器配置对象
 *
 * @example
 * const loaderConfig = createDataLoaderConfig({
 *   endpoint: '/api/v4/console/users',
 *   dataKey: 'users',
 *   listField: 'users',
 *   defaultFilters: { status: 'active' },
 *   transformResponse: (data) => data.map(u => ({ ...u, fullName: `${u.first_name} ${u.last_name}` }))
 * })
 */
export function createDataLoaderConfig(config) {
  const {
    endpoint,
    dataKey = 'data',
    listField = 'list',
    totalField = 'total',
    defaultFilters = {},
    transformResponse = null,
    buildParams = null
  } = config

  return {
    // 加载器配置
    _loaderConfig: {
      endpoint,
      dataKey,
      listField,
      totalField,
      defaultFilters,
      transformResponse,
      buildParams
    }
  }
}

export function asyncDataMixin() {
  return {
    // ========== 加载状态 ==========

    /** 普通加载状态（表格等局部加载） */
    loading: false,

    /** 全局加载状态（遮罩层） */
    globalLoading: false,

    /** 表单提交状态（按钮禁用等） */
    submitting: false,

    /** 保存操作状态 */
    saving: false,

    /** 删除操作状态 */
    deleting: false,

    /** 导出操作状态 */
    exporting: false,

    /** 导入操作状态 */
    importing: false,

    /** 上传操作状态 */
    uploading: false,

    /** 处理中状态 */
    processing: false,

    /** 刷新操作状态 */
    refreshing: false,

    /** 编辑模式状态 */
    editing: false,

    /** 最后一次错误信息 */
    error: null,

    // ========== P1-19: 网络超时分阶段提示状态 ==========
    /** 
     * 加载阶段：
     * - 'normal': 正常加载 (0-5秒)
     * - 'slow': 加载较慢 (5-15秒)
     * - 'timeout': 请求超时 (>15秒)
     * - 'idle': 空闲状态
     */
    loadingPhase: 'idle',

    /** 加载开始时间戳 */
    _loadingStartTime: null,

    /** 加载阶段定时器ID */
    _loadingPhaseTimers: [],

    /** 最后一次失败的请求函数（用于重试） */
    _lastFailedRequest: null,

    /** 超时阈值配置（毫秒） */
    loadingPhaseThresholds: {
      slow: 5000,    // 5秒后显示"加载较慢"
      timeout: 15000 // 15秒后显示"请求超时"
    },

    // ========== 核心方法 ==========

    // ========== P1-19: 加载阶段管理方法 ==========

    /**
     * 开始跟踪加载阶段
     * @private
     */
    _startLoadingPhaseTracking() {
      // 清除之前的定时器
      this._clearLoadingPhaseTimers()
      
      // 设置开始时间
      this._loadingStartTime = Date.now()
      this.loadingPhase = 'normal'
      
      // 设置"加载较慢"阶段定时器 (5秒)
      const slowTimer = setTimeout(() => {
        if (this.loading || this.globalLoading) {
          this.loadingPhase = 'slow'
          logger.debug('[P1-19] 加载阶段切换: slow (>5秒)')
        }
      }, this.loadingPhaseThresholds.slow)
      this._loadingPhaseTimers.push(slowTimer)
      
      // 设置"请求超时"阶段定时器 (15秒)
      const timeoutTimer = setTimeout(() => {
        if (this.loading || this.globalLoading) {
          this.loadingPhase = 'timeout'
          logger.warn('[P1-19] 加载阶段切换: timeout (>15秒)')
        }
      }, this.loadingPhaseThresholds.timeout)
      this._loadingPhaseTimers.push(timeoutTimer)
    },

    /**
     * 停止跟踪加载阶段
     * @private
     */
    _stopLoadingPhaseTracking() {
      this._clearLoadingPhaseTimers()
      this.loadingPhase = 'idle'
      this._loadingStartTime = null
    },

    /**
     * 清除所有加载阶段定时器
     * @private
     */
    _clearLoadingPhaseTimers() {
      this._loadingPhaseTimers.forEach(timerId => clearTimeout(timerId))
      this._loadingPhaseTimers = []
    },

    /**
     * 获取当前加载阶段的提示文本
     * @returns {string}
     */
    getLoadingPhaseText() {
      switch (this.loadingPhase) {
        case 'normal':
          return '正在加载...'
        case 'slow':
          return '加载较慢，请稍候...'
        case 'timeout':
          return '请求超时，点击重试'
        default:
          return ''
      }
    },

    /**
     * 获取当前加载阶段的样式类
     * @returns {string}
     */
    getLoadingPhaseClass() {
      switch (this.loadingPhase) {
        case 'normal':
          return 'text-gray-600'
        case 'slow':
          return 'text-yellow-600 bg-yellow-50'
        case 'timeout':
          return 'text-red-600 bg-red-50'
        default:
          return ''
      }
    },

    /**
     * 判断是否显示重试按钮
     * @returns {boolean}
     */
    shouldShowRetryButton() {
      return this.loadingPhase === 'timeout'
    },

    /**
     * 重试上一次失败的请求
     */
    async retryLastRequest() {
      if (typeof this._lastFailedRequest === 'function') {
        this._stopLoadingPhaseTracking()
        await this._lastFailedRequest()
      } else {
        logger.warn('[P1-19] 没有可重试的请求')
      }
    },

    /**
     * 带加载状态的异步操作包装器
     * 自动管理 loading 状态和错误处理
     * P1-19: 支持分阶段加载提示
     *
     * @param {Function} asyncFn - 异步函数
     * @param {Object} options - 配置选项
     * @param {boolean} [options.global=false] - 是否使用全局加载状态
     * @param {string} [options.errorMessage='操作失败'] - 错误提示消息
     * @param {boolean} [options.showError=true] - 是否显示错误 Toast
     * @param {boolean} [options.showSuccess=false] - 是否显示成功 Toast
     * @param {string} [options.successMessage='操作成功'] - 成功提示消息
     * @param {boolean} [options.trackPhase=true] - 是否启用分阶段提示 (P1-19)
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async withLoading(asyncFn, options = {}) {
      const {
        global = false,
        errorMessage = '操作失败',
        showError = true,
        showSuccess = false,
        successMessage = '操作成功',
        trackPhase = true // P1-19: 默认启用分阶段提示
      } = options

      const loadingKey = global ? 'globalLoading' : 'loading'
      this[loadingKey] = true
      this.error = null
      
      // P1-19: 保存请求函数用于重试
      this._lastFailedRequest = () => this.withLoading(asyncFn, options)
      
      // P1-19: 开始跟踪加载阶段
      if (trackPhase) {
        this._startLoadingPhaseTracking()
      }

      try {
        const result = await asyncFn()

        if (showSuccess) {
          this.showSuccess(successMessage)
        }
        
        // P1-19: 成功后清除重试函数
        this._lastFailedRequest = null

        return { success: true, data: result }
      } catch (error) {
        logger.error(`${errorMessage}:`, error)
        this.error = error.message

        if (showError) {
          this.showError(error.message || errorMessage)
        }

        return { success: false, error }
      } finally {
        this[loadingKey] = false
        
        // P1-19: 停止跟踪加载阶段
        if (trackPhase) {
          this._stopLoadingPhaseTracking()
        }
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
        const response = await request({ url, ...fetchOptions })

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
      return this.apiCall(fullUrl, { method: 'GET' }, loadingOptions)
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
      return this.apiCall(
        url,
        {
          method: 'POST',
          data: data
        },
        loadingOptions
      )
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
      return this.apiCall(
        url,
        {
          method: 'PUT',
          data: data
        },
        loadingOptions
      )
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
     * 带表单提交状态的异步操作包装器
     * 自动管理 submitting 状态，用于表单提交按钮禁用
     *
     * @param {Function} asyncFn - 异步函数
     * @param {Object} options - 配置选项
     * @param {string} [options.errorMessage='提交失败'] - 错误提示消息
     * @param {boolean} [options.showError=true] - 是否显示错误 Toast
     * @param {boolean} [options.showSuccess=true] - 是否显示成功 Toast
     * @param {string} [options.successMessage='提交成功'] - 成功提示消息
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async withSubmitting(asyncFn, options = {}) {
      const {
        errorMessage = '提交失败',
        showError = true,
        showSuccess = true,
        successMessage = '提交成功'
      } = options

      this.submitting = true
      this.error = null

      try {
        const result = await asyncFn()

        if (showSuccess) {
          this.showSuccess(successMessage)
        }

        return { success: true, data: result }
      } catch (error) {
        logger.error(`${errorMessage}:`, error)
        this.error = error.message

        if (showError) {
          this.showError(error.message || errorMessage)
        }

        return { success: false, error }
      } finally {
        this.submitting = false
      }
    },

    /**
     * 通用状态管理的异步操作包装器
     * 支持 saving, deleting, exporting, importing, uploading, processing, refreshing 等状态
     *
     * @param {string} stateKey - 状态变量名 (如 'saving', 'deleting')
     * @param {Function} asyncFn - 异步函数
     * @param {Object} options - 配置选项
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     *
     * @example
     * // 保存操作
     * await this.withState('saving', async () => {
     *   await this.apiPost('/api/save', data)
     * }, { successMessage: '保存成功' })
     *
     * // 删除操作
     * await this.withState('deleting', async () => {
     *   await this.apiDelete('/api/item/123')
     * }, { successMessage: '删除成功' })
     */
    async withState(stateKey, asyncFn, options = {}) {
      const {
        errorMessage = '操作失败',
        showError = true,
        showSuccess = true,
        successMessage = '操作成功'
      } = options

      // 设置状态为 true
      if (Object.hasOwn(this, stateKey)) {
        this[stateKey] = true
      }
      this.error = null

      try {
        const result = await asyncFn()

        if (showSuccess) {
          this.showSuccess(successMessage)
        }

        return { success: true, data: result }
      } catch (error) {
        logger.error(`${errorMessage}:`, error)
        this.error = error.message

        if (showError) {
          this.showError(error.message || errorMessage)
        }

        return { success: false, error }
      } finally {
        // 重置状态为 false
        if (Object.hasOwn(this, stateKey)) {
          this[stateKey] = false
        }
      }
    },

    /**
     * 带确认对话框的危险操作
     *
     * @param {string} message - 确认消息
     * @param {Function} asyncFn - 异步函数
     * @param {Object} options - 配置选项
     * @returns {Promise<{success: boolean, data?: any, error?: Error, cancelled?: boolean}>}
     */
    async confirmAndExecute(message, asyncFn, options = {}) {
      // 使用原生 confirm
      if (!confirm(message)) {
        return { success: false, cancelled: true }
      }

      return this.withLoading(asyncFn, { global: true, ...options })
    },

    /**
     * 显示成功消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    showSuccess(message, duration = 3000) {
      // 优先使用 Alpine.store('notification')
      if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('notification')) {
        return Alpine.store('notification').success(message, duration)
      }
      // 降级：使用 logger（window.showToast 已移除 - 方案 A）
      logger.info(`✅ ${message}`)
    },

    /**
     * 显示错误消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    showError(message, duration = 5000) {
      if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('notification')) {
        return Alpine.store('notification').error(message, duration)
      }
      logger.error(`❌ ${message}`)
    },

    /**
     * 显示警告消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    showWarning(message, duration = 4000) {
      if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('notification')) {
        return Alpine.store('notification').warning(message, duration)
      }
      logger.warn(`⚠️ ${message}`)
    },

    /**
     * 显示信息消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    showInfo(message, duration = 3000) {
      if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('notification')) {
        return Alpine.store('notification').info(message, duration)
      }
      logger.info(`ℹ️ ${message}`)
    },

    // ========== 标准化数据加载方法（解决 24 处重复 loadData 模式）==========

    /**
     * 标准化列表数据加载方法
     * 提取自 24 个不同的 loadData 实现，统一处理：
     * - 分页参数构建
     * - 筛选条件处理
     * - 加载状态管理
     * - 响应数据处理
     * - 分页信息更新
     *
     * @param {Object} options - 加载选项
     * @param {string} options.endpoint - API 端点（必需，或使用 _loaderConfig.endpoint）
     * @param {Object} [options.filters={}] - 筛选条件
     * @param {string} [options.dataKey] - 存储数据的属性名
     * @param {string} [options.listField='list'] - 响应中列表字段名
     * @param {string} [options.totalField] - 响应中总数字段名
     * @param {Object} [options.extraParams={}] - 额外请求参数
     * @param {boolean} [options.showLoading=true] - 是否显示加载状态
     * @param {Function} [options.transformResponse] - 响应数据转换函数
     * @param {Function} [options.onSuccess] - 成功回调
     * @param {Function} [options.onError] - 错误回调
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     *
     * @example 基本用法
     * await this.loadListData({
     *   endpoint: USER_ENDPOINTS.LIST,
     *   filters: this.filters,
     *   dataKey: 'users',
     *   listField: 'users'
     * })
     *
     * @example 使用预配置
     * // 页面初始化时设置 _loaderConfig
     * this._loaderConfig = { endpoint: USER_ENDPOINTS.LIST, dataKey: 'users', listField: 'users' }
     * // 后续只需调用
     * await this.loadListData({ filters: this.filters })
     */
    async loadListData(options = {}) {
      // 合并预配置和传入选项
      const config = { ...(this._loaderConfig || {}), ...options }

      const {
        endpoint,
        filters = {},
        dataKey = 'data',
        listField = 'list',
        totalField = 'total',
        extraParams = {},
        showLoading = true,
        transformResponse = null,
        onSuccess = null,
        onError = null
      } = config

      if (!endpoint) {
        logger.error('[asyncDataMixin] loadListData: endpoint 是必需的')
        return { success: false, error: new Error('endpoint is required') }
      }

      const loadFn = async () => {
        // 1. 构建分页参数
        const params = new URLSearchParams()

        // 分页参数
        if (typeof this.current_page !== 'undefined') {
          params.append('page', this.current_page || 1)
        }
        if (typeof this.page_size !== 'undefined') {
          params.append('page_size', this.page_size || 20)
        }

        // 2. 添加筛选条件
        this._appendFiltersToParams(params, filters)

        // 3. 添加额外参数
        Object.entries(extraParams).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') {
            params.append(key, value)
          }
        })

        // 4. 发起请求
        const queryString = params.toString()
        const fullUrl = queryString ? `${endpoint}?${queryString}` : endpoint

        const response = await request({ url: fullUrl, method: 'GET' })

        if (response && response.success) {
          return response.data
        } else {
          throw new Error(response?.message || '加载数据失败')
        }
      }

      // 执行加载（带或不带 loading 状态）
      const result = showLoading
        ? await this.withLoading(loadFn)
        : await this._executeWithoutLoading(loadFn)

      // 处理结果
      if (result.success) {
        const responseData = result.data

        // 提取列表数据
        let listData = responseData
        if (typeof responseData === 'object' && !Array.isArray(responseData)) {
          // 尝试从常见字段名获取列表
          listData =
            responseData[listField] ||
            responseData.rows ||
            responseData.items ||
            responseData.records ||
            responseData.list ||
            []
        }

        // 应用数据转换
        if (typeof transformResponse === 'function') {
          listData = transformResponse(listData, responseData)
        }

        // 更新组件数据
        if (dataKey && Object.hasOwn(this, dataKey)) {
          this[dataKey] = listData
        }

        // 更新分页信息
        this._updatePaginationFromResponse(responseData, totalField, listData)

        // 成功回调
        if (typeof onSuccess === 'function') {
          onSuccess(listData, responseData)
        }
      } else if (typeof onError === 'function') {
        onError(result.error)
      }

      return result
    },

    /**
     * 将筛选条件对象添加到 URLSearchParams
     * 支持嵌套对象和特殊处理
     *
     * @private
     * @param {URLSearchParams} params - URL 参数对象
     * @param {Object} filters - 筛选条件
     */
    _appendFiltersToParams(params, filters) {
      if (!filters || typeof filters !== 'object') return

      Object.entries(filters).forEach(([key, value]) => {
        // 跳过空值
        if (value === null || value === undefined || value === '') return

        // 处理嵌套对象（如 dateRange: { start, end }）
        if (typeof value === 'object' && !Array.isArray(value)) {
          Object.entries(value).forEach(([subKey, subValue]) => {
            if (subValue !== null && subValue !== undefined && subValue !== '') {
              params.append(`${key}_${subKey}`, subValue)
            }
          })
        } else if (Array.isArray(value)) {
          // 数组处理
          if (value.length > 0) {
            params.append(key, value.join(','))
          }
        } else {
          // 基本类型
          params.append(key, value)
        }
      })
    },

    /**
     * 从响应数据更新分页信息
     *
     * @private
     * @param {Object} responseData - API 响应数据
     * @param {string} totalField - 总数字段名
     * @param {Array} listData - 列表数据
     */
    _updatePaginationFromResponse(responseData, totalField, listData) {
      if (typeof this.total_records !== 'undefined') {
        // 尝试从多种可能的字段获取总数
        this.total_records =
          responseData.pagination?.total ||
          responseData[totalField] ||
          responseData.count ||
          responseData.total_count ||
          listData.length ||
          0
      }

      if (typeof this.total !== 'undefined') {
        this.total =
          responseData.pagination?.total ||
          responseData[totalField] ||
          responseData.count ||
          responseData.total_count ||
          listData.length ||
          0
      }

      // 更新总页数（如果使用 paginationMixin）
      if (typeof this.total_pages !== 'undefined' && responseData.pagination?.total_pages) {
        this.total_pages = responseData.pagination.total_pages
      }
    },

    /**
     * 不带 loading 状态执行异步函数
     *
     * @private
     * @param {Function} asyncFn - 异步函数
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async _executeWithoutLoading(asyncFn) {
      try {
        const result = await asyncFn()
        return { success: true, data: result }
      } catch (error) {
        logger.error('操作失败:', error)
        return { success: false, error }
      }
    },

    /**
     * 刷新数据（重新加载当前页）
     * 使用预配置的 _loaderConfig
     *
     * @param {Object} [overrideOptions={}] - 覆盖选项
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async refreshData(overrideOptions = {}) {
      return this.loadListData({
        filters: this.filters || {},
        ...overrideOptions
      })
    },

    /**
     * 搜索数据（重置到第一页并加载）
     *
     * @param {Object} [overrideOptions={}] - 覆盖选项
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async searchData(overrideOptions = {}) {
      // 重置到第一页
      if (typeof this.current_page !== 'undefined') {
        this.current_page = 1
      }
      if (typeof this.resetPagination === 'function') {
        this.resetPagination()
      }

      return this.loadListData({
        filters: this.filters || {},
        ...overrideOptions
      })
    },

    /**
     * 加载单条数据详情
     *
     * @param {string} endpoint - API 端点（含 ID）
     * @param {Object} [options={}] - 选项
     * @param {boolean} [options.showLoading=true] - 是否显示加载状态
     * @param {Function} [options.onSuccess] - 成功回调
     * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
     */
    async loadDetailData(endpoint, options = {}) {
      const { showLoading = true, onSuccess = null } = options

      const loadFn = async () => {
        const response = await request({ url: endpoint, method: 'GET' })
        if (response && response.success) {
          return response.data
        }
        throw new Error(response?.message || '加载详情失败')
      }

      const result = showLoading
        ? await this.withLoading(loadFn)
        : await this._executeWithoutLoading(loadFn)

      if (result.success && typeof onSuccess === 'function') {
        onSuccess(result.data)
      }

      return result
    },

    /**
     * 批量加载多个数据源
     * 用于页面初始化时并行加载多个数据
     *
     * @param {Array<Object>} loaders - 加载器配置数组
     * @param {Object} [options={}] - 全局选项
     * @returns {Promise<Object>} 所有加载结果
     *
     * @example
     * await this.loadMultipleData([
     *   { endpoint: USER_ENDPOINTS.LIST, dataKey: 'users', listField: 'users' },
     *   { endpoint: USER_ENDPOINTS.ROLE_LIST, dataKey: 'roles', listField: 'roles' }
     * ])
     */
    async loadMultipleData(loaders, options = {}) {
      const { showLoading = true } = options

      const loadAll = async () => {
        const results = await Promise.allSettled(
          loaders.map(loaderConfig =>
            this.loadListData({
              ...loaderConfig,
              showLoading: false // 单个加载不显示 loading
            })
          )
        )

        return results.reduce((acc, result, index) => {
          const key = loaders[index].dataKey || `loader_${index}`
          acc[key] =
            result.status === 'fulfilled' ? result.value : { success: false, error: result.reason }
          return acc
        }, {})
      }

      if (showLoading) {
        this.loading = true
        try {
          return await loadAll()
        } finally {
          this.loading = false
        }
      }

      return loadAll()
    }
  }
}
