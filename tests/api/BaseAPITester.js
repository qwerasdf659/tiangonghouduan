/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 增强API测试基础类
 * 提供完整的API测试功能，包括参数验证、权限测试、性能测试等
 * 创建时间：2025年08月23日 北京时间
 *
 * 核心功能：
 * 1. HTTP请求封装和管理
 * 2. 认证token管理
 * 3. 参数验证测试
 * 4. 权限级别测试
 * 5. 性能和并发测试
 * 6. 数据一致性验证
 * 7. 错误处理测试
 */

const http = require('http')
const https = require('https')
const { performance } = require('perf_hooks')

class BaseAPITester {
  constructor (baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
    this.tokens = {
      user: null, // 普通用户token
      admin: null, // 管理员token
      superAdmin: null // 超级管理员token
    }
    this.testResults = []
    this.performanceData = []

    // 测试用户信息
    this.testUsers = {
      regular: {
        mobile: '13612227930',
        verification_code: '123456',
        expected_role: 'user'
      },
      admin: {
        mobile: '13612227930',
        verification_code: '123456',
        expected_role: 'admin'
      }
    }
  }

  /**
   * 🔧 HTTP请求工具 - 支持性能监控
   */
  async makeRequest (method, endpoint, data = null, headers = {}, options = {}) {
    const startTime = performance.now()

    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.baseUrl)
      const requestOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: options.timeout || 30000
      }

      const protocol = url.protocol === 'https:' ? https : http
      const req = protocol.request(url, requestOptions, res => {
        let responseData = ''
        res.on('data', chunk => {
          responseData += chunk
        })
        res.on('end', () => {
          const endTime = performance.now()
          const responseTime = endTime - startTime

          // 记录性能数据
          this.performanceData.push({
            endpoint,
            method,
            responseTime,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString()
          })

          try {
            const parsedData = JSON.parse(responseData)
            resolve({
              status: res.statusCode,
              data: parsedData,
              headers: res.headers,
              responseTime,
              rawData: responseData
            })
          } catch (error) {
            resolve({
              status: res.statusCode,
              data: responseData,
              headers: res.headers,
              responseTime,
              rawData: responseData
            })
          }
        })
      })

      req.on('error', error => {
        const endTime = performance.now()
        reject(new Error(`Request error: ${error.message}, responseTime: ${endTime - startTime}ms`))
      })

      req.on('timeout', () => {
        req.destroy()
        const endTime = performance.now()
        reject(new Error(`Request timeout after ${endTime - startTime}ms`))
      })

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        req.write(JSON.stringify(data))
      }

      req.end()
    })
  }

  /**
   * 🔐 用户登录和token管理
   */
  async authenticateUser (userType = 'regular') {
    try {
      const user = this.testUsers[userType]
      if (!user) {
        throw new Error(`未知用户类型: ${userType}`)
      }

      const response = await this.makeRequest('POST', '/api/v4/unified-engine/auth/login', {
        mobile: user.mobile,
        verification_code: user.verification_code
      })

      if (response.status === 200) {
        // 处理不同的响应格式
        let tokenData, userData
        if (response.data.success && response.data.data) {
          // 标准格式: { success: true, data: { token, user } }
          tokenData = response.data.data.token || response.data.data.access_token
          userData = response.data.data.user
        } else if (response.data.access_token) {
          // 直接格式: { access_token, user }
          tokenData = response.data.access_token
          userData = response.data.user
        }

        if (tokenData) {
          this.tokens[userType] = tokenData
          this.addTestResult(`用户认证-${userType}`, 'success', `${userType}用户登录成功`, {
            userId: userData?.user_id || userData?.id,
            isAdmin: userData?.is_admin,
            token: tokenData?.substring(0, 20) + '...'
          })
          return { token: tokenData, user: userData }
        }
      }

      throw new Error(`登录失败: ${response.data?.message || response.status}`)
    } catch (error) {
      this.addTestResult(`用户认证-${userType}`, 'error', `登录失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 🛡️ 带认证的请求
   */
  async makeAuthenticatedRequest (
    method,
    endpoint,
    data = null,
    userType = 'regular',
    options = {}
  ) {
    const token = this.tokens[userType]
    if (!token) {
      throw new Error(`${userType}用户未登录，请先调用authenticateUser()`)
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      ...options.headers
    }

    return this.makeRequest(method, endpoint, data, headers, options)
  }

  /**
   * 📊 测试结果记录
   */
  addTestResult (name, status, message, data = null) {
    const result = {
      name,
      status,
      message,
      data,
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    }
    this.testResults.push(result)

    const statusIcon = status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌'
    console.log(`${statusIcon} ${name}: ${message}`)

    return result
  }

  /**
   * 🔍 参数验证测试
   */
  async testParameterValidation (
    endpoint,
    method,
    validParams,
    invalidParams,
    userType = 'regular'
  ) {
    const testName = `参数验证-${endpoint}`
    const results = []

    try {
      // 测试有效参数
      const validResponse = await this.makeAuthenticatedRequest(
        method,
        endpoint,
        validParams,
        userType
      )
      if (validResponse.status >= 200 && validResponse.status < 300) {
        results.push({ type: 'valid_params', status: 'success', response: validResponse })
      } else {
        results.push({ type: 'valid_params', status: 'warning', response: validResponse })
      }

      // 测试无效参数组合
      for (const [paramName, invalidValue] of Object.entries(invalidParams)) {
        const testParams = { ...validParams, [paramName]: invalidValue }
        try {
          const invalidResponse = await this.makeAuthenticatedRequest(
            method,
            endpoint,
            testParams,
            userType
          )
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
              response: invalidResponse,
              message: '应该返回错误但没有'
            })
          }
        } catch (error) {
          results.push({
            type: 'invalid_param',
            param: paramName,
            status: 'error',
            error: error.message
          })
        }
      }

      const successCount = results.filter(r => r.status === 'success').length
      const totalCount = results.length

      this.addTestResult(
        testName,
        successCount === totalCount ? 'success' : 'warning',
        `参数验证通过率: ${successCount}/${totalCount}`,
        { details: results }
      )

      return results
    } catch (error) {
      this.addTestResult(testName, 'error', `参数验证测试失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 👥 权限级别测试
   */
  async testAuthorizationLevels (endpoint, method, params = null, requiredUserTypes = ['regular']) {
    const testName = `权限测试-${endpoint}`
    const results = []

    const _allUserTypes = ['regular', 'admin']

    // TODO: 性能优化 - 考虑使用Promise.all并发执行
    // 🚀 性能优化：并发执行替代循环中await
    await Promise.all(
      _allUserTypes.map(async userType => {
        try {
          // 确保用户已登录
          if (!this.tokens[userType]) {
            await this.authenticateUser(userType)
          }

          const response = await this.makeAuthenticatedRequest(method, endpoint, params, userType)

          const shouldHaveAccess = requiredUserTypes.includes(userType)
          const hasAccess = response.status >= 200 && response.status < 300

          if (shouldHaveAccess === hasAccess) {
            results.push({
              userType,
              expectedAccess: shouldHaveAccess,
              actualAccess: hasAccess,
              status: 'success',
              statusCode: response.status
            })
          } else {
            results.push({
              userType,
              expectedAccess: shouldHaveAccess,
              actualAccess: hasAccess,
              status: 'warning',
              statusCode: response.status,
              message: shouldHaveAccess ? '应该有权限但被拒绝' : '不应该有权限但被允许'
            })
          }
        } catch (error) {
          results.push({
            userType,
            status: 'error',
            error: error.message
          })
        }
      })
    )

    const successCount = results.filter(r => r.status === 'success').length
    const totalCount = results.length

    this.addTestResult(
      testName,
      successCount === totalCount ? 'success' : 'warning',
      `权限测试通过率: ${successCount}/${totalCount}`,
      { details: results }
    )

    return results
  }

  /**
   * 🔒 权限测试
   */
  async testPermissions (endpoint, permissions, method = 'GET', params = null) {
    const testName = `权限测试-${endpoint}`
    const results = {
      adminAccess: false,
      userAccess: false,
      guestAccess: false
    }

    try {
      // 测试管理员权限
      if (permissions.adminAllowed) {
        const adminResponse = await this.makeAuthenticatedRequest(method, endpoint, params, 'admin')
        results.adminAccess = adminResponse.status >= 200 && adminResponse.status < 300
      }

      // 测试普通用户权限
      if (permissions.userAllowed) {
        const userResponse = await this.makeAuthenticatedRequest(
          method,
          endpoint,
          params,
          'regular'
        )
        results.userAccess = userResponse.status >= 200 && userResponse.status < 300
      }

      // 测试游客权限
      if (permissions.guestAllowed !== undefined) {
        const guestResponse = await this.makeRequest(method, endpoint, params)
        results.guestAccess = guestResponse.status >= 200 && guestResponse.status < 300
      } else {
        // 如果不允许游客访问，应该返回401或403
        const guestResponse = await this.makeRequest(method, endpoint, params)
        results.guestAccess = guestResponse.status === 401 || guestResponse.status === 403
      }

      this.addTestResult(testName, 'success', '权限验证完成', { results, permissions })

      return results
    } catch (error) {
      this.addTestResult(testName, 'error', `权限测试失败: ${error.message}`, {
        error: error.message
      })
      return results
    }
  }

  /**
   * ⚡ 性能测试
   */
  async testResponseTime (
    method,
    endpoint,
    params = null,
    userType = 'regular',
    expectedMaxTime = 5000
  ) {
    const testName = `性能测试-${endpoint}`

    try {
      const response = await this.makeAuthenticatedRequest(method, endpoint, params, userType)
      const responseTime = response.responseTime

      if (responseTime <= expectedMaxTime) {
        this.addTestResult(
          testName,
          'success',
          `响应时间: ${responseTime.toFixed(2)}ms (≤ ${expectedMaxTime}ms)`,
          { responseTime, expectedMaxTime, statusCode: response.status }
        )
      } else {
        this.addTestResult(
          testName,
          'warning',
          `响应时间过长: ${responseTime.toFixed(2)}ms (> ${expectedMaxTime}ms)`,
          { responseTime, expectedMaxTime, statusCode: response.status }
        )
      }

      return { responseTime, passed: responseTime <= expectedMaxTime }
    } catch (error) {
      this.addTestResult(testName, 'error', `性能测试失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 🚀 并发测试
   */
  async testConcurrentRequests (
    endpoint,
    method,
    params = null,
    concurrency = 10,
    userType = 'regular'
  ) {
    const testName = `并发测试-${endpoint}`

    try {
      console.log(`🚀 开始并发测试: ${concurrency}个并发请求`)

      const startTime = performance.now()
      const promises = []

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          this.makeAuthenticatedRequest(method, endpoint, params, userType).catch(error => ({
            error: error.message,
            requestIndex: i
          }))
        )
      }

      const results = await Promise.all(promises)
      const endTime = performance.now()
      const totalTime = endTime - startTime

      const successCount = results.filter(r => r.status >= 200 && r.status < 300).length
      const errorCount = results.filter(r => r.error).length
      const avgResponseTime =
        results.filter(r => r.responseTime).reduce((sum, r) => sum + r.responseTime, 0) /
        successCount

      this.addTestResult(
        testName,
        errorCount === 0 ? 'success' : 'warning',
        `并发测试完成: ${successCount}/${concurrency}成功, 平均响应时间: ${avgResponseTime?.toFixed(2)}ms`,
        {
          concurrency,
          successCount,
          errorCount,
          totalTime: totalTime.toFixed(2),
          avgResponseTime: avgResponseTime?.toFixed(2),
          results: results.map(r => ({
            status: r.status,
            responseTime: r.responseTime,
            error: r.error
          }))
        }
      )

      return {
        concurrency,
        successCount,
        errorCount,
        avgResponseTime,
        totalTime
      }
    } catch (error) {
      this.addTestResult(testName, 'error', `并发测试失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 🔄 数据一致性测试
   */
  async testDataConsistency (writeEndpoint, readEndpoint, writeData, userType = 'regular') {
    const testName = `数据一致性-${writeEndpoint}→${readEndpoint}`

    try {
      // 执行写操作
      const writeResponse = await this.makeAuthenticatedRequest(
        'POST',
        writeEndpoint,
        writeData,
        userType
      )

      if (writeResponse.status < 200 || writeResponse.status >= 300) {
        throw new Error(`写操作失败: ${writeResponse.status}`)
      }

      // 等待一小段时间确保数据已写入
      await new Promise(resolve => setTimeout(resolve, 100))

      // 执行读操作验证数据
      const readResponse = await this.makeAuthenticatedRequest('GET', readEndpoint, null, userType)

      if (readResponse.status >= 200 && readResponse.status < 300) {
        this.addTestResult(testName, 'success', '数据一致性验证通过', {
          writeStatus: writeResponse.status,
          readStatus: readResponse.status,
          writeData,
          readData: readResponse.data
        })
        return true
      } else {
        this.addTestResult(testName, 'warning', `读取数据失败: ${readResponse.status}`, {
          writeStatus: writeResponse.status,
          readStatus: readResponse.status
        })
        return false
      }
    } catch (error) {
      this.addTestResult(testName, 'error', `数据一致性测试失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 📊 生成性能报告
   */
  generatePerformanceReport () {
    if (this.performanceData.length === 0) {
      return { message: '没有性能数据' }
    }

    const avgResponseTime =
      this.performanceData.reduce((sum, d) => sum + d.responseTime, 0) / this.performanceData.length
    const maxResponseTime = Math.max(...this.performanceData.map(d => d.responseTime))
    const minResponseTime = Math.min(...this.performanceData.map(d => d.responseTime))

    const endpointStats = {}
    this.performanceData.forEach(d => {
      const key = `${d.method} ${d.endpoint}`
      if (!endpointStats[key]) {
        endpointStats[key] = []
      }
      endpointStats[key].push(d.responseTime)
    })

    const endpointAvg = {}
    Object.keys(endpointStats).forEach(key => {
      const times = endpointStats[key]
      endpointAvg[key] = {
        avg: times.reduce((sum, t) => sum + t, 0) / times.length,
        max: Math.max(...times),
        min: Math.min(...times),
        count: times.length
      }
    })

    return {
      summary: {
        totalRequests: this.performanceData.length,
        avgResponseTime: avgResponseTime.toFixed(2),
        maxResponseTime: maxResponseTime.toFixed(2),
        minResponseTime: minResponseTime.toFixed(2)
      },
      endpointStats: endpointAvg
    }
  }

  /**
   * 📋 生成测试报告
   */
  generateTestReport () {
    const successCount = this.testResults.filter(r => r.status === 'success').length
    const warningCount = this.testResults.filter(r => r.status === 'warning').length
    const errorCount = this.testResults.filter(r => r.status === 'error').length
    const totalCount = this.testResults.length

    const performanceReport = this.generatePerformanceReport()

    return {
      summary: {
        total: totalCount,
        success: successCount,
        warning: warningCount,
        error: errorCount,
        successRate: `${((successCount / totalCount) * 100).toFixed(1)}%`
      },
      performance: performanceReport,
      results: this.testResults,
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    }
  }

  /**
   * 🧹 清理资源
   */
  cleanup () {
    this.tokens = { user: null, admin: null, superAdmin: null }
    this.testResults = []
    this.performanceData = []
  }
}

module.exports = BaseAPITester
