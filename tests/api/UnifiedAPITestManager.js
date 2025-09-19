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
   * 性能测试
   * @param {string} method HTTP方法
   * @param {string} url 请求URL
   * @param {any} data 请求数据
   * @param {Object} options 测试选项
   * @returns {Promise<Object>} 性能测试结果
   */
  async performanceTest (method, url, data, options = {}) {
    const { concurrent = 5, iterations = 10, maxResponseTime = 1000 } = options

    const startTime = performance.now()
    const promises = []
    const results = []

    // 并发测试
    for (let i = 0; i < concurrent; i++) {
      for (let j = 0; j < iterations; j++) {
        promises.push(
          this.makeAuthenticatedRequest(method, url, data)
            .then(response => ({ success: true, response }))
            .catch(error => ({ success: false, error: error.message }))
        )
      }
    }

    const responses = await Promise.allSettled(promises)
    const endTime = performance.now()

    const stats = {
      totalTime: Math.round(endTime - startTime),
      totalRequests: concurrent * iterations,
      successful: 0,
      failed: 0,
      averageResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Infinity
    }

    // 计算统计信息
    this.performanceData.slice(-promises.length).forEach(perf => {
      if (perf.duration) {
        stats.averageResponseTime += perf.duration
        stats.maxResponseTime = Math.max(stats.maxResponseTime, perf.duration)
        stats.minResponseTime = Math.min(stats.minResponseTime, perf.duration)
      }
    })

    responses.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        stats.successful++
      } else {
        stats.failed++
      }
    })

    stats.averageResponseTime = Math.round(stats.averageResponseTime / stats.totalRequests)
    stats.successRate = Math.round((stats.successful / stats.totalRequests) * 100)

    return stats
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
}

module.exports = UnifiedAPITestManager
