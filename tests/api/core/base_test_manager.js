/**
 * 基础测试管理器
 * 提供HTTP请求封装、认证管理、通用工具等核心功能
 *
 * 重构说明：
 * - 使用 supertest 进行进程内测试（取代 axios 的外部HTTP请求）
 * - 进程内测试避免网络延迟，提高测试速度和可靠性
 * - 支持传入 Express app 实例进行测试
 *
 * 创建时间：2025年01月21日 北京时间
 * 重构时间：2025年12月22日 北京时间
 * 使用模型：Claude Sonnet 4.5
 */

const request = require('supertest')
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
   * @param {Object} app - Express应用实例（推荐）或基础URL字符串（兼容模式）
   */
  constructor(app = null) {
    /*
     * 支持两种初始化方式：
     * 1. 传入 Express app 实例（推荐，使用supertest进程内测试）
     * 2. 传入 URL 字符串（兼容模式，仍使用supertest但走网络）
     */
    if (typeof app === 'string') {
      this.baseUrl = app
      this.app = null
    } else {
      this.app = app
      this.baseUrl = null
    }

    this.timeout = 60000

    // 统一token管理
    this.tokens = {
      user: null,
      admin: null,
      super_admin: null
    }

    // 用户数据存储
    this.user_data = {}

    // 测试结果存储
    this.test_results = []
    this.performance_data = []

    // 健康检查缓存机制 - 解决重复调用问题
    this.health_check_cache = {
      result: null,
      timestamp: 0,
      ttl: 300000 // 5分钟缓存
    }

    const mode = this.app ? '进程内测试（supertest）' : `外部URL测试（${this.baseUrl}）`
    console.log(`[BaseTestManager] 初始化完成 - 模式: ${mode}`)
  }

  /**
   * 设置 Express app 实例（延迟初始化）
   * @param {Object} app - Express应用实例
   */
  setApp(app) {
    this.app = app
    console.log('[BaseTestManager] app 实例已设置')
  }

  /**
   * 获取 supertest request 对象
   * @returns {Object} supertest request 对象
   * @private
   */
  _getRequest() {
    if (this.app) {
      return request(this.app)
    } else if (this.baseUrl) {
      return request(this.baseUrl)
    } else {
      throw new Error(
        'BaseTestManager: 未设置 app 实例或 baseUrl，请先调用 setApp() 或在构造函数中传入参数'
      )
    }
  }

  /**
   * 记录性能数据
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {number} duration - 耗时（毫秒）
   * @param {number} status - HTTP状态码
   * @param {string} [error] - 错误信息
   * @private
   */
  _recordPerformance(url, method, duration, status, error = null) {
    const record = {
      url,
      method: method.toUpperCase(),
      duration: Math.round(duration),
      status,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
    if (error) {
      record.error = error
    }
    this.performance_data.push(record)
  }

  /**
   * 统一认证方法
   * @param {string} phone 手机号
   * @param {string} code 验证码
   * @param {string} user_type 用户类型
   * @returns {Promise<Object>} 登录数据（包含 access_token 和 user 对象）
   */
  async authenticate(phone, code = '123456', user_type = 'user') {
    const startTime = performance.now()

    try {
      console.log('[API请求] POST /api/v4/auth/login')

      const response = await this._getRequest()
        .post('/api/v4/auth/login')
        .send({
          mobile: phone,
          verification_code: code,
          timestamp: BeijingTimeHelper.apiTimestamp()
        })
        .timeout(this.timeout)

      const duration = performance.now() - startTime
      this._recordPerformance('/api/v4/auth/login', 'POST', duration, response.status)
      console.log(`[API响应] ${response.status} - ${Math.round(duration)}ms`)

      if (response.body.success === true && response.body.data?.access_token) {
        // 保存token
        this.tokens[user_type] = response.body.data.access_token

        // 保存完整的用户数据（包含user对象）
        this.user_data[user_type] = response.body.data

        console.log(`[认证成功] ${user_type}: ${phone}`)

        // 返回完整的登录数据，包含user对象
        return response.body.data
      }

      throw new Error(`认证失败: ${response.body.message || '未知错误'}`)
    } catch (error) {
      const duration = performance.now() - startTime
      this._recordPerformance('/api/v4/auth/login', 'POST', duration, 0, error.message)
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
   * @returns {Promise<Object>} 响应数据 { status, data, headers }
   */
  async make_authenticated_request(method, url, data = null, token_type = 'user') {
    const token = this.tokens[token_type]
    if (!token) {
      throw new Error(`请先进行${token_type}认证`)
    }

    const startTime = performance.now()

    try {
      console.log(`[API请求] ${method.toUpperCase()} ${url}`)

      const methodName = method.toLowerCase()
      const request = this._getRequest()
      let req = request[methodName](url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .timeout(this.timeout)

      // 根据方法类型处理数据
      if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
        req = req.send(data)
      } else if (data && method.toLowerCase() === 'get') {
        req = req.query(data)
      }

      const response = await req

      const duration = performance.now() - startTime
      this._recordPerformance(url, method, duration, response.status)
      console.log(`[API响应] ${response.status} - ${Math.round(duration)}ms`)

      return {
        status: response.status,
        data: response.body,
        headers: response.headers
      }
    } catch (error) {
      const duration = performance.now() - startTime
      this._recordPerformance(url, method, duration, 0, error.message)
      console.error(`[请求失败] ${method} ${url}: ${error.message}`)
      throw error
    }
  }

  /**
   * 普通请求（无认证）
   * @param {string} method HTTP方法
   * @param {string} url 请求路径
   * @param {any} data 请求数据
   * @returns {Promise<Object>} 响应数据 { status, data, headers }
   */
  async make_request(method, url, data = null) {
    const startTime = performance.now()

    try {
      console.log(`[API请求] ${method.toUpperCase()} ${url}`)

      const methodName = method.toLowerCase()
      const request = this._getRequest()
      let req = request[methodName](url)
        .set('Content-Type', 'application/json')
        .timeout(this.timeout)

      // 根据方法类型处理数据
      if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
        req = req.send(data)
      } else if (data && method.toLowerCase() === 'get') {
        req = req.query(data)
      }

      const response = await req

      const duration = performance.now() - startTime
      this._recordPerformance(url, method, duration, response.status)
      console.log(`[API响应] ${response.status} - ${Math.round(duration)}ms`)

      return {
        status: response.status,
        data: response.body,
        headers: response.headers
      }
    } catch (error) {
      const duration = performance.now() - startTime
      this._recordPerformance(url, method, duration, 0, error.message)
      console.error(`[请求失败] ${method} ${url}: ${error.message}`)
      throw error
    }
  }

  /**
   * 携带Cookie的请求（用于Token刷新等需要HttpOnly Cookie的场景）
   * @param {string} method HTTP方法
   * @param {string} url 请求路径
   * @param {Object} cookies Cookie对象 { name: value }
   * @param {any} data 请求数据
   * @returns {Promise<Object>} 响应数据 { status, data, headers }
   */
  async make_request_with_cookie(method, url, cookies = {}, data = null) {
    const startTime = performance.now()

    try {
      console.log(`[API请求+Cookie] ${method.toUpperCase()} ${url}`)

      // 构建Cookie字符串
      const cookieStr = Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')

      const methodName = method.toLowerCase()
      const request = this._getRequest()
      let req = request[methodName](url)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookieStr)
        .timeout(this.timeout)

      // 根据方法类型处理数据
      if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
        req = req.send(data)
      } else if (data && method.toLowerCase() === 'get') {
        req = req.query(data)
      }

      const response = await req

      const duration = performance.now() - startTime
      this._recordPerformance(url, method, duration, response.status)
      console.log(`[API响应] ${response.status} - ${Math.round(duration)}ms`)

      return {
        status: response.status,
        data: response.body,
        headers: response.headers
      }
    } catch (error) {
      const duration = performance.now() - startTime
      this._recordPerformance(url, method, duration, 0, error.message)
      console.error(`[请求失败] ${method} ${url}: ${error.message}`)
      throw error
    }
  }

  /**
   * 批量认证测试用户
   * @returns {Promise<Object>} 认证结果
   */
  async authenticate_test_users() {
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
  get_test_stats() {
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
  reset() {
    this.test_results = []
    this.performance_data = []
    console.log('[BaseTestManager] 测试数据已重置')
  }

  /**
   * 清理测试资源
   * @returns {Promise<void>} Promise对象
   */
  async cleanup() {
    try {
      console.log('🧹 开始清理测试资源...')

      // 清理tokens
      this.tokens = {
        user: null,
        admin: null,
        super_admin: null
      }

      // 清理用户数据
      this.user_data = {}

      // 清理测试数据
      this.test_results = []
      this.performance_data = []

      console.log('✅ 测试资源清理完成')
    } catch (error) {
      console.warn('⚠️ 测试资源清理失败:', error.message)
    }
  }

  /**
   * 用户认证（统一入口）
   * 自动处理 regular/user 类型映射，统一使用测试手机号
   * @param {string} user_type - 用户类型：'regular'/'user'/'admin'
   * @returns {Promise<Object>} 登录数据（包含 access_token 和 user 对象）
   */
  async authenticate_user(user_type = 'regular') {
    const mobile = '13612227930' // 测试账号：既是用户也是管理员
    const token_type = user_type === 'admin' ? 'admin' : 'user'

    const result = await this.authenticate(mobile, '123456', token_type)

    // 统一 regular 和 user 类型：都映射到 user
    if (user_type === 'regular' && this.tokens.user) {
      this.tokens.regular = this.tokens.user
      if (this.user_data?.user) {
        this.user_data.regular = this.user_data.user
      }
    }

    return result
  }

  /**
   * V4用户认证（authenticate_user 的别名）
   * @param {string} user_type - 用户类型
   * @returns {Promise<Object>} 登录数据
   */
  async authenticate_v4_user(user_type = 'regular') {
    return await this.authenticate_user(user_type)
  }

  /**
   * 测试授权级别验证
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {*} data - 请求数据
   * @param {Object} expected_results - 预期结果 { user_type: expected_status }
   * @returns {Promise<Array>} 测试结果数组
   */
  async test_authorization_levels(url, method, data, expected_results) {
    const results = []

    for (const [user_type, expected_status] of Object.entries(expected_results)) {
      try {
        const response = await this.make_authenticated_request(method, url, data, user_type)
        results.push({
          user_type,
          status: response.status,
          success: response.status === expected_status,
          expected: expected_status,
          actual: response.status
        })
      } catch (error) {
        results.push({
          user_type,
          status: 'error',
          success: false,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * 测试并发请求
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {*} data - 请求数据
   * @param {number} concurrency - 并发数
   * @returns {Promise<Object>} 并发测试结果
   */
  async test_concurrent_requests(url, method, data, concurrency = 5) {
    const promises = []
    const start_time = Date.now()

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        this.make_request(method, url, data)
          .then(response => ({ success: true, response, worker_id: i }))
          .catch(error => ({ success: false, error: error.message, worker_id: i }))
      )
    }

    const results = await Promise.all(promises)
    const success_count = results.filter(r => r.success).length
    const error_count = results.filter(r => !r.success).length
    const total_time = Date.now() - start_time

    return {
      total: concurrency,
      success_count,
      error_count,
      total_time,
      average_time: Math.round(total_time / concurrency),
      results
    }
  }

  /**
   * 测试参数验证
   * @param {string} url - 请求URL
   * @param {string} method - HTTP方法
   * @param {Object} valid_params - 有效参数
   * @param {Array} required_fields - 必需字段
   * @returns {Promise<Array>} 验证结果数组
   */
  async test_parameter_validation(url, method, valid_params, required_fields) {
    const results = []

    for (const field of required_fields) {
      const test_params = { ...valid_params }
      delete test_params[field]

      try {
        const response = await this.make_request(method, url, test_params)
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
   * 带缓存的健康检查方法 - 解决重复调用问题
   * @param {boolean} force_refresh - 是否强制刷新
   * @returns {Promise<Object>} 健康检查结果
   */
  async health_check_with_cache(force_refresh = false) {
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
      throw error
    }
  }

  /**
   * 清理健康检查缓存
   * @returns {void}
   */
  clear_health_cache() {
    this.health_check_cache = {
      result: null,
      timestamp: 0,
      ttl: 300000
    }
    console.log('🧹 健康检查缓存已清理')
  }

  /**
   * 生成测试报告
   * @returns {Object} 测试报告对象
   */
  generate_test_report() {
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
