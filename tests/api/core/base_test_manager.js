/**
 * 基础测试管理器
 * 提供HTTP请求封装、认证管理、通用工具等核心功能
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 */

const axios = require('axios')
const { performance } = require('perf_hooks')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { TestConfig } = require('../../helpers/test-setup')

/**
 * 基础测试管理器类
 * @class BaseTestManager
 */
class BaseTestManager {
  /**
   * 创建基础测试管理器实例
   * @param {string} baseUrl - API基础URL
   */
  constructor (baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
    this.timeout = 60000

    // 统一token管理
    this.tokens = {
      user: null,
      admin: null,
      super_admin: null
    }

    // 测试结果存储
    this.test_results = []
    this.performance_data = []

    // 健康检查缓存机制 - 解决重复调用问题
    this.health_check_cache = {
      result: null,
      timestamp: 0,
      ttl: 300000 // 5分钟缓存
    }

    // 创建axios实例
    this.axios_instance = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BaseTestManager/1.0.0'
      },
      // 接受所有HTTP状态码，不抛出错误
      validateStatus: () => true
    })

    // 设置拦截器
    this.setup_interceptors()

    console.log(`[BaseTestManager] 初始化完成 - 基础URL: ${this.baseUrl}`)
  }

  /**
   * 设置请求和响应拦截器
   * @returns {void}
   */
  setup_interceptors () {
    // 请求拦截器 - 性能监控
    this.axios_instance.interceptors.request.use(
      config => {
        config.metadata = { start_time: performance.now() }
        console.log(`[API请求] ${config.method?.toUpperCase()} ${config.url}`)
        return config
      },
      error => Promise.reject(error)
    )

    // 响应拦截器 - 性能统计
    this.axios_instance.interceptors.response.use(
      response => {
        const end_time = performance.now()
        const duration = end_time - response.config.metadata.start_time

        this.performance_data.push({
          url: response.config.url,
          method: response.config.method?.toUpperCase(),
          duration: Math.round(duration),
          status: response.status,
          timestamp: BeijingTimeHelper.apiTimestamp()
        })

        console.log(`[API响应] ${response.status} - ${Math.round(duration)}ms`)
        return response
      },
      error => {
        if (error.config && error.config.metadata) {
          const end_time = performance.now()
          const duration = end_time - error.config.metadata.start_time

          this.performance_data.push({
            url: error.config.url,
            method: error.config.method?.toUpperCase(),
            duration: Math.round(duration),
            status: error.response?.status || 0,
            error: error.message,
            timestamp: BeijingTimeHelper.apiTimestamp()
          })
        }
        return Promise.reject(error)
      }
    )
  }

  /**
   * 统一认证方法
   * @param {string} phone 手机号
   * @param {string} code 验证码
   * @param {string} user_type 用户类型
   * @returns {Promise<string>} token
   */
  async authenticate (phone, code = '123456', user_type = 'user') {
    try {
      const response = await this.axios_instance.post('/api/v4/auth/login', {
        mobile: phone,
        verification_code: code,
        timestamp: BeijingTimeHelper.apiTimestamp()
      })

      if (response.data.success === true && response.data.data?.access_token) {
        // 保存token
        this.tokens[user_type] = response.data.data.access_token

        // 保存完整的用户数据（包含user对象）- 修复测试兼容性问题
        this.user_data = this.user_data || {}
        this.user_data[user_type] = response.data.data

        console.log(`[认证成功] ${user_type}: ${phone}`)

        // 返回完整的登录数据，包含user对象
        return response.data.data
      }

      throw new Error(`认证失败: ${response.data.message || '未知错误'}`)
    } catch (error) {
      console.error(`[认证失败] ${user_type}:`, error.message)
      throw error
    }
  }

  /**
   * 带认证的请求
   * @param {string} method HTTP方法
   * @param {string} url 请求路径
   * @param {any} data 请求数据
   * @param {string} token_type token类型
   * @returns {Promise<Object>} 响应数据
   */
  async make_authenticated_request (method, url, data = null, token_type = 'user') {
    const token = this.tokens[token_type]
    if (!token) {
      throw new Error(`请先进行${token_type}认证`)
    }

    const config = {
      method: method.toLowerCase(),
      url,
      headers: {
        Authorization: `Bearer ${token}`
      }
    }

    if (data && ['post', 'put', 'patch'].includes(config.method)) {
      config.data = data
    } else if (data && config.method === 'get') {
      config.params = data
    }

    try {
      const response = await this.axios_instance(config)
      return {
        status: response.status,
        data: response.data,
        headers: response.headers
      }
    } catch (error) {
      const error_msg = error.response?.data?.msg || error.message
      console.error(`[请求失败] ${method} ${url}: ${error_msg}`)
      throw error
    }
  }

  /**
   * 普通请求（无认证）
   * @param {string} method HTTP方法
   * @param {string} url 请求路径
   * @param {any} data 请求数据
   * @returns {Promise<Object>} 响应数据
   */
  async make_request (method, url, data = null) {
    const config = {
      method: method.toLowerCase(),
      url
    }

    if (data && ['post', 'put', 'patch'].includes(config.method)) {
      config.data = data
    } else if (data && config.method === 'get') {
      config.params = data
    }

    try {
      const response = await this.axios_instance(config)
      return {
        status: response.status,
        data: response.data,
        headers: response.headers
      }
    } catch (error) {
      const error_msg = error.response?.data?.msg || error.message
      console.error(`[请求失败] ${method} ${url}: ${error_msg}`)
      throw error
    }
  }

  /**
   * 批量认证测试用户
   * @returns {Promise<Object>} 认证结果
   */
  async authenticate_test_users () {
    const test_users = {
      user: { phone: TestConfig.realData.testUser.mobile, type: 'user' },
      admin: { phone: TestConfig.realData.adminUser.mobile, type: 'admin' }
    }

    const results = {}

    for (const [type, user] of Object.entries(test_users)) {
      try {
        await this.authenticate(user.phone, '123456', type)
        results[type] = { success: true, token: this.tokens[type] }
      } catch (error) {
        results[type] = { success: false, error: error.message }
      }
    }

    console.log(`[批量认证] 完成 - 用户: ${results.user.success}, 管理员: ${results.admin.success}`)
    return results
  }

  /**
   * 获取测试统计信息
   * @returns {Object} 统计信息
   */
  get_test_stats () {
    const stats = {
      total_requests: this.performance_data.length,
      average_response_time: 0,
      success_rate: 0,
      error_rate: 0,
      performance_data: this.performance_data.slice(-50),
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    if (stats.total_requests > 0) {
      const total_time = this.performance_data.reduce((sum, perf) => sum + (perf.duration || 0), 0)
      const success_count = this.performance_data.filter(
        perf => perf.status >= 200 && perf.status < 300
      ).length

      stats.average_response_time = Math.round(total_time / stats.total_requests)
      stats.success_rate = Math.round((success_count / stats.total_requests) * 100)
      stats.error_rate = 100 - stats.success_rate
    }

    return stats
  }

  /**
   * 重置测试数据
   * @returns {void}
   */
  reset () {
    this.test_results = []
    this.performance_data = []
    console.log('[BaseTestManager] 测试数据已重置')
  }

  /**
   * 清理测试资源
   * @returns {Promise<void>} Promise对象
   */
  async cleanup () {
    try {
      console.log('🧹 开始清理测试资源...')

      // 清理tokens
      this.tokens = {}

      // 清理测试数据
      this.test_results = []
      this.performance_data = []

      console.log('✅ 测试资源清理完成')
    } catch (error) {
      console.warn('⚠️ 测试资源清理失败:', error.message)
    }
  }

  /*
   * ============================================
   * V4兼容性方法 - 支持现有测试文件，避免大规模重构
   * 注意：这些方法仅为向后兼容，新测试应使用snake_case方法
   * ============================================
   */

  /**
   * 兼容旧版makeRequest方法
   * @param {string} method - HTTP方法
   * @param {string} url - 请求URL
   * @param {*} data - 请求数据
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 响应数据
   */
  async makeRequest (method, url, data = null, options = {}) {
    return await this.make_request(method, url, data, options)
  }

  /**
   * 兼容旧版authenticateUser方法
   * 保留原始userType作为token key，避免'regular'和'user'不匹配问题
   * @param {string} userType - 用户类型
   * @returns {Promise<Object>} 登录数据
   */
  async authenticateUser (userType = 'regular') {
    const mobile = userType === 'admin' ? '13612227930' : '13612227930'
    const result = await this.authenticate(
      mobile,
      '123456',
      userType === 'admin' ? 'admin' : userType
    )

    // 如果是'regular'，同时保存一份到'user' key，保持向后兼容
    if (userType === 'regular' && this.tokens[userType]) {
      this.tokens.user = this.tokens[userType]
      if (this.user_data && this.user_data[userType]) {
        this.user_data.user = this.user_data[userType]
      }
    }

    return result
  }

  /**
   * 兼容旧版makeAuthenticatedRequest方法
   * @param {string} method - HTTP方法
   * @param {string} url - 请求URL
   * @param {*} data - 请求数据
   * @param {string} userType - 用户类型
   * @returns {Promise<Object>} 响应数据
   */
  async makeAuthenticatedRequest (method, url, data = null, userType = 'user') {
    return await this.make_authenticated_request(method, url, data, userType)
  }

  /**
   * 兼容旧版testAuthorizationLevels方法
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {*} data - 请求数据
   * @param {Object} expectedResults - 预期结果
   * @returns {Promise<Array>} 测试结果数组
   */
  async testAuthorizationLevels (url, method, data, expectedResults) {
    const results = []

    for (const [userType, expectedStatus] of Object.entries(expectedResults)) {
      try {
        const response = await this.make_authenticated_request(method, url, data, userType)
        results.push({
          userType,
          status: response.status,
          success: response.status === expectedStatus,
          expected: expectedStatus,
          actual: response.status
        })
      } catch (error) {
        results.push({
          userType,
          status: 'error',
          success: false,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * 兼容旧版testConcurrentRequests方法 (重命名避免重复)
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {*} data - 请求数据
   * @param {number} concurrency - 并发数
   * @returns {Promise<Object>} 并发测试结果
   */
  async testConcurrentRequestsCompat (url, method, data, concurrency = 5) {
    const promises = []
    const startTime = Date.now()

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        this.make_request(method, url, data)
          .then(response => ({ success: true, response, workerId: i }))
          .catch(error => ({ success: false, error: error.message, workerId: i }))
      )
    }

    const results = await Promise.all(promises)
    const successCount = results.filter(r => r.success).length
    const errorCount = results.filter(r => !r.success).length
    const totalTime = Date.now() - startTime

    return {
      total: concurrency,
      successCount,
      errorCount,
      totalTime,
      averageTime: Math.round(totalTime / concurrency),
      results
    }
  }

  /**
   * 兼容旧版testConcurrentRequests方法别名
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {*} data - 请求数据
   * @param {number} concurrency - 并发数
   * @returns {Promise<Object>} 并发测试结果
   */
  async testConcurrentRequests (url, method, data, concurrency = 5) {
    return await this.testConcurrentRequestsCompat(url, method, data, concurrency)
  }

  /**
   * 兼容旧版authenticateV4User方法
   * @param {string} userType - 用户类型
   * @returns {Promise<Object>} 登录数据
   */
  async authenticateV4User (userType = 'regular') {
    return await this.authenticateUser(userType)
  }

  /**
   * 兼容旧版testParameterValidation方法
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {Object} validParams - 有效参数
   * @param {Array} requiredFields - 必需字段
   * @returns {Promise<Array>} 验证结果数组
   */
  async testParameterValidation (url, method, validParams, requiredFields) {
    const results = []

    for (const field of requiredFields) {
      const testParams = { ...validParams }
      delete testParams[field]

      try {
        const response = await this.make_request(method, url, testParams)
        results.push({
          field,
          status: response.status,
          success: response.status === 400 || response.status === 422
        })
      } catch (error) {
        results.push({
          field,
          status: 'error',
          success: false,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * 🏥 带缓存的健康检查方法 - 解决重复调用问题
   * @param {boolean} force_refresh - 是否强制刷新
   * @returns {Promise<Object>} 健康检查结果
   */
  async health_check_with_cache (force_refresh = false) {
    const now = Date.now()

    // 检查缓存是否有效
    if (
      !force_refresh &&
      this.health_check_cache.result &&
      now - this.health_check_cache.timestamp < this.health_check_cache.ttl
    ) {
      console.log('✅ 使用缓存的健康检查结果')
      return this.health_check_cache.result
    }

    console.log('🔄 执行新的健康检查...')

    try {
      const result = await this.make_request('GET', '/health')

      // 更新缓存
      this.health_check_cache = {
        result,
        timestamp: now,
        ttl: 300000 // 5分钟
      }

      console.log('✅ 健康检查完成，结果已缓存')
      return result
    } catch (error) {
      console.error('❌ 健康检查失败:', error.message)
      // 如果检查失败，不缓存结果
      throw error
    }
  }

  /**
   * 🧹 清理健康检查缓存
   * @returns {void}
   */
  clear_health_cache () {
    this.health_check_cache = {
      result: null,
      timestamp: 0,
      ttl: 300000
    }
    console.log('🧹 健康检查缓存已清理')
  }

  /**
   * 兼容旧版generateTestReport方法
   * @returns {Object} 测试报告对象
   */
  generateTestReport () {
    return {
      summary: {
        total: this.test_results.length,
        passed: this.test_results.filter(r => r.success).length,
        failed: this.test_results.filter(r => !r.success).length
      },
      results: this.test_results,
      performance: this.performance_data,
      generated_at: BeijingTimeHelper.now()
    }
  }
}

module.exports = BaseTestManager
