/**
 * 统一API测试管理器 V4
 * 整合并优化原有的BaseAPITester和V4UnifiedEngineAPITester功能
 * 消除重复代码，提供统一的API测试体验
 * 创建时间：2025年01月21日 北京时间
 *
 * 核心功能：
 * 1. HTTP请求封装和管理
 * 2. 统一认证token管理
 * 3. 参数验证和权限测试
 * 4. 性能和并发测试
 * 5. 数据一致性验证
 * 6. V4统一引擎专用测试
 * 7. 北京时间支持
 */

const axios = require('axios')
const { performance } = require('perf_hooks')
const BeijingTimeHelper = require('../../utils/timeHelper')

class UnifiedAPITestManager {
  constructor (baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
    this.timeout = 30000

    // 统一token管理
    this.tokens = {
      user: null, // 普通用户token
      admin: null, // 管理员token
      superAdmin: null // 超级管理员token
    }

    // 测试数据和结果
    this.testResults = []
    this.performanceData = []
    this.testData = {}

    // 创建axios实例
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'UnifiedAPITestManager/1.0.0'
      }
    })

    // 请求和响应拦截器
    this.setupInterceptors()

    console.log(`[UnifiedAPITestManager] 初始化完成 - 基础URL: ${this.baseUrl}`)
  }

  /**
   * 设置请求和响应拦截器
   */
  setupInterceptors () {
    // 请求拦截器 - 性能监控
    this.axiosInstance.interceptors.request.use(
      config => {
        config.metadata = { startTime: performance.now() }
        console.log(`[API请求] ${config.method?.toUpperCase()} ${config.url}`)
        return config
      },
      error => Promise.reject(error)
    )

    // 响应拦截器 - 性能统计
    this.axiosInstance.interceptors.response.use(
      response => {
        const endTime = performance.now()
        const duration = endTime - response.config.metadata.startTime

        this.performanceData.push({
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
          const endTime = performance.now()
          const duration = endTime - error.config.metadata.startTime

          this.performanceData.push({
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
   * 统一认证 - 支持多种用户类型
   * @param {string} phone 手机号
   * @param {string} code 验证码
   * @param {string} userType 用户类型 (user|admin|superAdmin)
   * @returns {Promise<string>} token
   */
  async authenticate (phone, code = '123456', userType = 'user') {
    try {
      const response = await this.axiosInstance.post('/api/v4/unified-engine/auth/login', {
        phone,
        code,
        timestamp: BeijingTimeHelper.apiTimestamp()
      })

      if (response.data.code === 0 && response.data.data?.token) {
        this.tokens[userType] = response.data.data.token
        console.log(`[认证成功] ${userType}: ${phone}`)
        return this.tokens[userType]
      }

      throw new Error(`认证失败: ${response.data.msg || '未知错误'}`)
    } catch (error) {
      console.error(`[认证失败] ${userType}:`, error.message)
      throw error
    }
  }

  /**
   * V4用户认证 - 兼容方法
   * @param {string} userType 用户类型
   * @returns {Promise<Object>} 用户信息和token
   */
  async authenticateV4User (userType = 'regular') {
    try {
      // 根据用户类型选择不同的测试账号
      const testAccounts = {
        regular: '13612227930',
        admin: '13612227930',
        superAdmin: '13612227930'
      }

      const phone = testAccounts[userType] || testAccounts.regular
      const actualUserType = userType === 'regular' ? 'user' : userType

      const token = await this.authenticate(phone, '123456', actualUserType)

      // 返回兼容的用户信息结构
      return {
        success: true,
        user: {
          user_id: phone === '13612227930' ? 10 : 1, // 测试账号的真实user_id
          mobile: phone,
          display_name: `测试用户_${userType}`,
          is_admin: userType !== 'regular'
        },
        token: token
      }
    } catch (error) {
      console.error(`[V4用户认证失败] ${userType}:`, error.message)
      throw error
    }
  }

  /**
   * 带认证的请求
   * @param {string} method HTTP方法
   * @param {string} url 请求路径
   * @param {any} data 请求数据
   * @param {string} tokenType token类型
   * @returns {Promise<Object>} 响应数据
   */
  async makeAuthenticatedRequest (method, url, data = null, tokenType = 'user') {
    const token = this.tokens[tokenType]
    if (!token) {
      throw new Error(`请先进行${tokenType}认证`)
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
      const response = await this.axiosInstance(config)
      return response.data
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message
      console.error(`[请求失败] ${method} ${url}: ${errorMsg}`)
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
  async makeRequest (method, url, data = null) {
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
      const response = await this.axiosInstance(config)
      return response.data
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message
      console.error(`[请求失败] ${method} ${url}: ${errorMsg}`)
      throw error
    }
  }

  /**
   * V4统一引擎专用请求
   * @param {string} method HTTP方法
   * @param {string} endpoint 引擎端点
   * @param {any} data 请求数据
   * @param {string} tokenType token类型
   * @returns {Promise<Object>} 响应数据
   */
  async makeV4EngineRequest (method, endpoint, data = null, tokenType = 'user') {
    const fullUrl = endpoint.startsWith('/api/v4/unified-engine')
      ? endpoint
      : `/api/v4/unified-engine${endpoint}`

    return await this.makeAuthenticatedRequest(method, fullUrl, data, tokenType)
  }

  /**
   * 批量认证测试用户
   * @returns {Promise<Object>} 认证结果
   */
  async authenticateTestUsers () {
    const testUsers = {
      user: { phone: '13612227930', type: 'user' },
      admin: { phone: '13612227930', type: 'admin' }
    }

    const results = {}

    for (const [type, user] of Object.entries(testUsers)) {
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
   * 参数验证测试
   * @param {string} method HTTP方法
   * @param {string} url 请求URL
   * @param {Array} requiredParams 必需参数列表
   * @param {Object} validData 有效数据示例
   * @returns {Promise<Object>} 验证结果
   */
  async validateParameters (method, url, requiredParams, validData) {
    const results = {
      required: [],
      types: [],
      boundaries: []
    }

    // 测试必需参数
    for (const param of requiredParams) {
      const testData = { ...validData }
      delete testData[param]

      try {
        await this.makeAuthenticatedRequest(method, url, testData)
        results.required.push({ param, passed: false, reason: '缺少参数但请求成功' })
      } catch (error) {
        const is400Error = error.response?.status === 400
        results.required.push({ param, passed: is400Error, error: error.message })
      }
    }

    return results
  }

  /**
   * 权限测试
   * @param {string} method HTTP方法
   * @param {string} url 请求URL
   * @param {any} data 请求数据
   * @param {Array} allowedRoles 允许的角色
   * @returns {Promise<Object>} 权限测试结果
   */
  async testPermissions (method, url, data, allowedRoles = ['user', 'admin']) {
    const results = {}

    for (const role of ['user', 'admin', 'superAdmin']) {
      if (!this.tokens[role]) {
        continue
      }

      try {
        await this.makeAuthenticatedRequest(method, url, data, role)
        results[role] = {
          allowed: allowedRoles.includes(role),
          success: true
        }
      } catch (error) {
        const isForbidden = error.response?.status === 403
        results[role] = {
          allowed: allowedRoles.includes(role),
          success: false,
          forbidden: isForbidden,
          error: error.message
        }
      }
    }

    return results
  }

  /**
   * 🔧 性能测试
   */
  async performanceTest (method, url, data, options = {}) {
    const { iterations = 10, _maxResponseTime = 5000 } = options // 用下划线标记未使用的变量
    const _results = [] // 用下划线标记未使用的变量
    const times = []

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now()
      try {
        await this.makeAuthenticatedRequest(method, url, data)
        const endTime = performance.now()
        times.push(endTime - startTime)
      } catch (error) {
        console.error(`Performance test iteration ${i} failed:`, error.message)
      }
    }

    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length
    const maxTime = Math.max(...times)
    const minTime = Math.min(...times)

    const performanceReport = {
      averageTime,
      maxTime,
      minTime,
      iterations: times.length,
      successRate: (times.length / iterations) * 100
    }

    this.performanceData.push({
      method,
      url,
      timestamp: new Date().toISOString(),
      report: performanceReport
    })

    return performanceReport
  }

  /**
   * 生成测试数据
   * @param {string} type 数据类型
   * @param {Object} options 生成选项
   * @returns {Object} 测试数据
   */
  generateTestData (type, options = {}) {
    const generators = {
      user: () => ({
        phone: `136${Math.random().toString().slice(2, 10)}`,
        nickname: `测试用户_${Date.now()}`,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }),

      lottery: () => ({
        user_id: options.userId || 1,
        campaign_id: options.campaignId || 1,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }),

      points: () => ({
        user_id: options.userId || 1,
        points: options.points || 100,
        reason: options.reason || '测试积分',
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    }

    const generator = generators[type]
    if (!generator) {
      throw new Error(`未知的测试数据类型: ${type}`)
    }

    return generator()
  }

  /**
   * 清理测试数据
   * @param {string} type 数据类型
   * @param {any} identifier 标识符
   */
  async cleanupTestData (type, identifier) {
    const cleanupEndpoints = {
      user: id => `/api/v4/unified-engine/admin/users/${id}`,
      lottery: id => `/api/v4/unified-engine/admin/lottery-records/${id}`,
      points: id => `/api/v4/unified-engine/admin/points-records/${id}`
    }

    const endpoint = cleanupEndpoints[type]?.(identifier)
    if (!endpoint) {
      console.warn(`[数据清理] 不支持的类型: ${type}`)
      return
    }

    try {
      await this.makeAuthenticatedRequest('DELETE', endpoint, null, 'admin')
      console.log(`[数据清理] 成功清理 ${type}: ${identifier}`)
    } catch (error) {
      console.warn(`[数据清理] 清理失败 ${type}: ${identifier}`, error.message)
    }
  }

  /**
   * 获取测试统计信息
   * @returns {Object} 统计信息
   */
  getTestStats () {
    const stats = {
      totalRequests: this.performanceData.length,
      averageResponseTime: 0,
      successRate: 0,
      errorRate: 0,
      performanceData: this.performanceData.slice(-50), // 最近50个请求
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    if (stats.totalRequests > 0) {
      const totalTime = this.performanceData.reduce((sum, perf) => sum + (perf.duration || 0), 0)
      const successCount = this.performanceData.filter(
        perf => perf.status >= 200 && perf.status < 300
      ).length

      stats.averageResponseTime = Math.round(totalTime / stats.totalRequests)
      stats.successRate = Math.round((successCount / stats.totalRequests) * 100)
      stats.errorRate = 100 - stats.successRate
    }

    return stats
  }

  /**
   * 重置测试数据
   */
  reset () {
    this.testResults = []
    this.performanceData = []
    this.testData = {}
    console.log('[UnifiedAPITestManager] 测试数据已重置')
  }

  /**
   * 生成测试报告
   * @returns {Object} 测试报告
   */
  generateTestReport () {
    const stats = this.getTestStats()
    const report = {
      summary: {
        totalTests: this.testResults.length,
        totalRequests: stats.totalRequests,
        averageResponseTime: stats.averageResponseTime,
        successRate: stats.successRate
      },
      authentication: {
        user: !!this.tokens.user,
        admin: !!this.tokens.admin,
        superAdmin: !!this.tokens.superAdmin
      },
      performance: stats.performanceData,
      generatedAt: BeijingTimeHelper.apiTimestamp()
    }

    console.log(
      `[测试报告] 生成完成 - 总请求: ${stats.totalRequests}, 成功率: ${stats.successRate}%`
    )
    return report
  }

  /**
   * 🔧 参数验证测试 - 来自BaseAPITester
   */
  async testParameterValidation (endpoint, method, validParams, invalidParams, userType = 'user') {
    const testName = `参数验证-${endpoint}`
    const results = []

    try {
      // 测试有效参数
      const validResponse = await this.makeAuthenticatedRequest(method, endpoint, validParams, userType)
      if (validResponse.status >= 200 && validResponse.status < 300) {
        results.push({ type: 'valid_params', status: 'success', response: validResponse })
      } else {
        results.push({ type: 'valid_params', status: 'warning', response: validResponse })
      }

      // 测试无效参数组合
      for (const [paramName, invalidValue] of Object.entries(invalidParams)) {
        const testParams = { ...validParams, [paramName]: invalidValue }
        try {
          const invalidResponse = await this.makeAuthenticatedRequest(method, endpoint, testParams, userType)
          if (invalidResponse.status >= 400) {
            results.push({
              type: 'invalid_param',
              param: paramName,
              status: 'success',
              response: invalidResponse
            })
          } else {
            results.push({
              type: 'invalid_param',
              param: paramName,
              status: 'warning',
              message: '应该返回错误但返回成功',
              response: invalidResponse
            })
          }
        } catch (error) {
          results.push({
            type: 'invalid_param',
            param: paramName,
            status: 'success',
            message: '正确拒绝无效参数',
            error: error.message
          })
        }
      }
    } catch (error) {
      results.push({
        type: 'test_error',
        status: 'error',
        message: error.message
      })
    }

    this.testResults.push({
      test: testName,
      timestamp: new Date().toISOString(),
      results
    })

    return results
  }

  /**
   * 🔧 授权级别测试 - 来自BaseAPITester
   */
  async testAuthorizationLevels (endpoint, method, params = null, requiredUserTypes = ['user']) {
    const results = []
    const userTypes = ['guest', 'user', 'admin']

    for (const userType of userTypes) {
      try {
        let response
        if (userType === 'guest') {
          response = await this.makeRequest(method, endpoint, params)
        } else {
          response = await this.makeAuthenticatedRequest(method, endpoint, params, userType)
        }

        const shouldHaveAccess = requiredUserTypes.includes(userType)
        const hasAccess = response.status >= 200 && response.status < 300

        results.push({
          userType,
          shouldHaveAccess,
          hasAccess,
          status: response.status,
          success: shouldHaveAccess === hasAccess
        })
      } catch (error) {
        const shouldHaveAccess = requiredUserTypes.includes(userType)
        results.push({
          userType,
          shouldHaveAccess,
          hasAccess: false,
          error: error.message,
          success: !shouldHaveAccess
        })
      }
    }

    return results
  }

  /**
   * 🔧 并发请求测试 - 来自BaseAPITester
   */
  async testConcurrentRequests (endpoint, method, params, concurrency = 5, iterations = 10) {
    const promises = []
    const startTime = performance.now()

    for (let i = 0; i < concurrency; i++) {
      for (let j = 0; j < iterations; j++) {
        promises.push(
          this.makeAuthenticatedRequest(method, endpoint, params)
            .then(response => ({ success: true, response, iteration: j, worker: i }))
            .catch(error => ({ success: false, error: error.message, iteration: j, worker: i }))
        )
      }
    }

    const results = await Promise.all(promises)
    const endTime = performance.now()

    const summary = {
      totalRequests: concurrency * iterations,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      totalTime: endTime - startTime,
      averageTime: (endTime - startTime) / (concurrency * iterations),
      concurrency,
      iterations
    }

    this.performanceData.push({
      test: `并发测试-${endpoint}`,
      timestamp: new Date().toISOString(),
      summary,
      details: results
    })

    return summary
  }

  /**
   * 🔧 V4引擎抽奖方法 - 来自V4UnifiedEngineAPITester
   */
  async drawLotteryV4 (campaignId, drawType = 'single', options = {}) {
    const drawData = {
      campaign_id: campaignId,
      draw_type: drawType,
      draw_count: options.count || 1,
      use_guarantee: options.guarantee || false,
      pool_id: options.poolId || null,
      ...options
    }

    return await this.makeV4EngineRequest(
      'POST',
      '/api/v4/unified-engine/lottery/draw',
      drawData,
      options.userType || 'user'
    )
  }

  /**
   * 🔧 获取V4抽奖活动列表 - 来自V4UnifiedEngineAPITester
   */
  async getV4Campaigns (filters = {}) {
    return await this.makeV4EngineRequest(
      'GET',
      '/api/v4/unified-engine/lottery/campaigns',
      filters,
      'user'
    )
  }

  /**
   * 🔧 获取V4抽奖历史 - 来自V4UnifiedEngineAPITester
   */
  async getV4LotteryHistory (userId, limit = 10) {
    return await this.makeV4EngineRequest(
      'GET',
      '/api/v4/unified-engine/lottery/history',
      { user_id: userId, limit },
      'user'
    )
  }

  /**
   * 🔧 执行V4基础抽奖 - 来自V4UnifiedEngineAPITester
   */
  async executeV4BasicLottery (userId, campaignId = 2) {
    // 先获取用户token
    await this.authenticate(userId, '123456', 'user')

    // 执行抽奖
    const response = await this.drawLotteryV4(campaignId, 'single', {
      userType: 'user',
      count: 1
    })

    // 记录测试数据
    this.testData[`lottery_${userId}_${campaignId}`] = {
      response,
      timestamp: new Date().toISOString()
    }

    return response
  }

  /**
   * 🔧 创建测试活动 - 来自V4UnifiedEngineAPITester
   */
  async createTestCampaign (campaignData = {}) {
    const defaultData = {
      name: `测试活动_${Date.now()}`,
      description: '自动化测试活动',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7天后
      status: 'active',
      lottery_type: 'random',
      total_quota: 1000,
      single_quota: 1,
      ...campaignData
    }

    return await this.makeV4EngineRequest(
      'POST',
      '/api/v4/unified-engine/lottery/campaigns',
      defaultData,
      'admin'
    )
  }

  /**
    * 🔧 等待V4引擎准备就绪 - 来自V4UnifiedEngineAPITester
    */
  async waitForV4Engine (timeout = 30000) {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.makeRequest('GET', '/api/v4/unified-engine/health')
        if (response.status === 200 && response.data?.status === 'healthy') {
          return true
        }
      } catch (error) {
        // 继续等待
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error(`V4引擎在${timeout}ms内未准备就绪`)
  }

  /**
   * 🔧 V4并发测试 - 来自V4UnifiedEngineAPITester
   */
  async performConcurrentV4Test (testFunction, concurrency = 5, iterations = 10) {
    const promises = []
    const startTime = performance.now()

    for (let i = 0; i < concurrency; i++) {
      for (let j = 0; j < iterations; j++) {
        promises.push(
          testFunction(i, j)
            .then(result => ({ success: true, result, worker: i, iteration: j }))
            .catch(error => ({ success: false, error: error.message, worker: i, iteration: j }))
        )
      }
    }

    const results = await Promise.all(promises)
    const endTime = performance.now()

    return {
      totalTests: concurrency * iterations,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      totalTime: endTime - startTime,
      averageTime: (endTime - startTime) / (concurrency * iterations),
      results
    }
  }

  /**
   * 🔧 权限API测试 - 来自V4UnifiedEngineAPITester
   */
  async testUserPermissionsAPI (userId = '13612227930') {
    const testResults = []

    try {
      // 测试获取用户权限
      const permissionResponse = await this.makeV4EngineRequest(
        'GET',
        `/api/v4/unified-engine/permissions/user/${userId}`,
        null,
        'admin'
      )

      testResults.push({
        test: 'get_user_permissions',
        success: permissionResponse.status === 200,
        response: permissionResponse
      })
    } catch (error) {
      testResults.push({
        test: 'get_user_permissions',
        success: false,
        error: error.message
      })
    }

    return testResults
  }

  /**
   * 🔧 权限检查API测试 - 来自V4UnifiedEngineAPITester
   */
  async testPermissionCheckAPI () {
    const testResults = []

    try {
      const checkResponse = await this.makeV4EngineRequest(
        'POST',
        '/api/v4/unified-engine/permissions/check',
        { permission: 'lottery_draw', resource_id: 'campaign_1' },
        'user'
      )

      testResults.push({
        test: 'permission_check',
        success: checkResponse.status === 200,
        response: checkResponse
      })
    } catch (error) {
      testResults.push({
        test: 'permission_check',
        success: false,
        error: error.message
      })
    }

    return testResults
  }

  /**
   * 🔧 数据一致性测试 - 来自BaseAPITester
   */
  async testDataConsistency (writeEndpoint, readEndpoint, writeData, userType = 'user') {
    const results = []

    try {
      // 执行写操作
      const writeResponse = await this.makeAuthenticatedRequest(
        'POST',
        writeEndpoint,
        writeData,
        userType
      )

      if (writeResponse.status >= 200 && writeResponse.status < 300) {
        // 等待一小段时间确保数据同步
        await new Promise(resolve => setTimeout(resolve, 500))

        // 执行读操作验证
        const readResponse = await this.makeAuthenticatedRequest(
          'GET',
          readEndpoint,
          null,
          userType
        )

        results.push({
          type: 'consistency_check',
          writeSuccess: true,
          readSuccess: readResponse.status >= 200 && readResponse.status < 300,
          writeResponse,
          readResponse
        })
      } else {
        results.push({
          type: 'consistency_check',
          writeSuccess: false,
          writeResponse
        })
      }
    } catch (error) {
      results.push({
        type: 'consistency_check',
        error: error.message
      })
    }

    return results
  }

  /**
   * 清理测试资源
   */
  async cleanup () {
    try {
      console.log('🧹 开始清理测试资源...')

      // 清理tokens
      this.tokens = {}

      // 清理测试数据
      if (this.testData && Object.keys(this.testData).length > 0) {
        console.log(`清理 ${Object.keys(this.testData).length} 个测试数据`)
        this.testData = {}
      }

      console.log('✅ 测试资源清理完成')
    } catch (error) {
      console.warn('⚠️ 测试资源清理失败:', error.message)
    }
  }
}

module.exports = UnifiedAPITestManager
