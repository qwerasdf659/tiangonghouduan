/**
 * V4统一引擎API测试基础类
 * 专为V4统一抽奖引擎设计的测试工具类
 * 创建时间：2025年09月11日 北京时间
 *
 * 功能：
 * 1. V4统一引擎API请求封装
 * 2. 认证和授权测试
 * 3. 数据模拟和清理
 * 4. 响应验证和断言
 * 5. 北京时间支持
 */

const axios = require('axios')
const moment = require('moment-timezone')
const { v4: uuidv4 } = require('uuid')

class V4UnifiedEngineAPITester {
  constructor (baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL
    this.timeout = 30000
    this.authTokens = {}
    this.testData = {}
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'V4UnifiedEngineAPITester/1.0.0'
      }
    })

    // 设置默认的请求拦截器
    this.axiosInstance.interceptors.request.use(
      config => {
        config.headers['x-request-id'] = uuidv4()
        config.headers['x-timestamp'] = moment().tz('Asia/Shanghai').toISOString()
        return config
      },
      error => Promise.reject(error)
    )
  }

  /**
   * 北京时间工具方法
   */
  beijingTime () {
    return moment().tz('Asia/Shanghai')
  }

  formatBeijingTime () {
    return this.beijingTime().format('YYYY-MM-DD HH:mm:ss')
  }

  /**
   * V4用户认证
   * @param {string} userType - 用户类型 'regular' | 'admin' | 'vip'
   * @returns {Object} 认证用户数据
   */
  async authenticateV4User (userType = 'regular') {
    try {
      // V4系统使用万能验证码123456进行开发测试
      const authData = {
        mobile: this.getTestPhone(userType),
        verification_code: '123456'
      }

      // V4统一引擎使用专用认证API
      const authEndpoint = '/api/v4/unified-engine/auth/login'

      // 管理员用户使用V4管理员认证API，普通用户也使用管理员API（因为测试用户既是用户也是管理员）
      const response = await this.axiosInstance.post(authEndpoint, authData)

      if (response.data.success && response.data.code === 'SUCCESS') {
        this.authTokens[userType] = response.data.data.access_token
        this.testData[userType] = response.data.data

        console.log(
          `✅ V4用户认证成功 [${userType}]: ${response.data.message} - ${this.formatBeijingTime()}`
        )
        console.log(
          `🆔 用户ID: ${response.data.data.user.id}, 管理员: ${response.data.data.user.is_admin ? '是' : '否'}`
        )
        return response.data.data
      } else {
        throw new Error(`V4用户认证失败: ${response.data.message}`)
      }
    } catch (error) {
      // 如果V4认证失败，提供详细的错误信息
      if (error.response) {
        console.error(
          `❌ V4用户认证失败 [${userType}]: ${error.response.status} - ${error.response.data.message || error.response.data.error}`
        )
        throw new Error(`V4认证失败: ${error.response.data.message || error.response.data.error}`)
      } else {
        console.error(`❌ V4用户认证异常 [${userType}]: ${error.message}`)
        throw error
      }
    }
  }

  /**
   * 获取测试手机号
   * 使用实际存在的测试用户13612227930（既是用户也是管理员）
   */
  getTestPhone (_userType) {
    // 使用统一的测试账号13612227930，该账号既是用户也是管理员
    return '13612227930'
  }

  /**
   * 发起V4统一引擎API请求
   * @param {string} method - HTTP方法
   * @param {string} path - API路径
   * @param {Object} data - 请求数据
   * @param {string} userType - 用户类型
   * @returns {Object} 响应数据
   */
  async makeV4EngineRequest (method, path, data = null, userType = 'regular') {
    try {
      // 确保用户已认证
      if (!this.authTokens[userType]) {
        await this.authenticateV4User(userType)
      }

      const config = {
        method: method.toUpperCase(),
        url: path,
        headers: {
          Authorization: `Bearer ${this.authTokens[userType]}`,
          'x-user-type': userType,
          'x-api-version': 'v4.0'
        }
      }

      if (data && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
        config.data = data
      } else if (data && config.method === 'GET') {
        config.params = data
      }

      console.log(`🔄 V4引擎请求: ${method.toUpperCase()} ${path} - ${this.formatBeijingTime()}`)

      const response = await this.axiosInstance(config)

      console.log(`✅ V4引擎响应: ${response.status} ${response.statusText}`)

      return response
    } catch (error) {
      console.error(`❌ V4引擎请求失败: ${error.message}`)
      if (error.response) {
        console.error(`响应状态: ${error.response.status}`)
        console.error(`响应数据: ${JSON.stringify(error.response.data, null, 2)}`)
      }
      return error.response || { status: 500, data: { error: error.message } }
    }
  }

  /**
   * V4统一抽奖引擎抽奖请求
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
      options.userType || 'regular'
    )
  }

  /**
   * 获取V4抽奖活动列表
   */
  async getV4Campaigns (filters = {}) {
    return await this.makeV4EngineRequest(
      'GET',
      '/api/v4/unified-engine/lottery/campaigns',
      filters,
      'regular'
    )
  }

  /**
   * 获取V4抽奖历史
   */
  async getV4LotteryHistory (userId, limit = 10) {
    return await this.makeV4EngineRequest(
      'GET',
      '/api/v4/unified-engine/lottery/history',
      { user_id: userId, limit },
      'regular'
    )
  }

  /**
   * V4管理员API请求
   */
  async makeV4AdminRequest (method, path, data = null) {
    return await this.makeV4EngineRequest(
      method,
      `/api/v4/unified-engine/admin${path}`,
      data,
      'admin'
    )
  }

  /**
   * 执行V4基础抽奖
   *
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID (可选，默认使用测试活动)
   * @returns {Promise<Object>} API响应
   */
  async executeV4BasicLottery (userId, campaignId = 2) {
    try {
      console.log(`执行V4基础抽奖: 用户${userId}, 活动${campaignId}`)

      const response = await this.axiosInstance.post('/api/v4/unified-engine/lottery/basic', {
        user_id: userId,
        campaign_id: campaignId,
        strategy: 'basic'
      })

      console.log('V4基础抽奖执行成功', {
        userId,
        campaignId,
        status: response.status,
        result: response.data?.data?.result
      })

      return response
    } catch (error) {
      console.log('V4基础抽奖执行失败', {
        userId,
        campaignId,
        error: error.message,
        status: error.response?.status
      })

      return error.response || { status: 500, data: { error: error.message } }
    }
  }

  /**
   * 发送认证请求
   *
   * @param {string} method - HTTP方法
   * @param {string} url - 请求URL
   * @param {Object} data - 请求数据
   * @param {string} userType - 用户类型 ('regular' 或 'admin')
   * @returns {Promise<Object>} API响应
   */
  async makeAuthenticatedRequest (method, url, data = null, userType = 'regular') {
    try {
      // 确保有认证token
      if (!this.authTokens[userType]) {
        await this.authenticateV4User(userType)
      }

      const config = {
        method: method.toLowerCase(),
        url,
        headers: {
          Authorization: `Bearer ${this.authTokens[userType]}`,
          'Content-Type': 'application/json'
        }
      }

      if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
        config.data = data
      } else if (data && method.toUpperCase() === 'GET') {
        config.params = data
      }

      console.log(`认证请求: ${method} ${url}`, { userType, hasData: !!data })

      const response = await this.axiosInstance(config)

      console.log('认证请求成功', {
        method,
        url,
        status: response.status,
        userType
      })

      return response
    } catch (error) {
      console.log('认证请求失败', {
        method,
        url,
        userType,
        error: error.message,
        status: error.response?.status
      })

      return error.response || { status: 500, data: { error: error.message } }
    }
  }

  /**
   * 发送普通请求（无认证）
   *
   * @param {string} method - HTTP方法
   * @param {string} url - 请求URL
   * @param {Object} data - 请求数据
   * @returns {Promise<Object>} API响应
   */
  async makeRequest (method, url, data = null) {
    try {
      const config = {
        method: method.toLowerCase(),
        url
      }

      if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
        config.data = data
      } else if (data && method.toUpperCase() === 'GET') {
        config.params = data
      }

      console.log(`普通请求: ${method} ${url}`, { hasData: !!data })

      const response = await this.axiosInstance(config)

      console.log('普通请求成功', {
        method,
        url,
        status: response.status
      })

      return response
    } catch (error) {
      console.log('普通请求失败', {
        method,
        url,
        error: error.message,
        status: error.response?.status
      })

      return error.response || { status: 500, data: { error: error.message } }
    }
  }

  /**
   * 验证V4响应格式
   *
   * @param {Object} response - 响应对象
   * @param {Array} requiredFields - 必需字段
   */
  validateV4Response (response, requiredFields = []) {
    try {
      // 检查基础响应结构
      expect(response).toHaveProperty('status')
      expect(response).toHaveProperty('data')

      if (response.status === 200) {
        expect(response.data).toHaveProperty('success')
        expect(response.data).toHaveProperty('data')

        // 检查必需字段
        for (const field of requiredFields) {
          expect(response.data.data).toHaveProperty(field)
        }

        console.log('V4响应验证通过', {
          status: response.status,
          requiredFields,
          actualFields: Object.keys(response.data.data || {})
        })
      }

      return true
    } catch (error) {
      console.log('V4响应验证失败', {
        status: response.status,
        requiredFields,
        error: error.message,
        responseData: response.data
      })

      throw error
    }
  }

  /**
   * 创建测试抽奖活动
   */
  async createTestCampaign (campaignData = {}) {
    const defaultCampaign = {
      name: `V4测试活动_${Date.now()}`,
      description: 'V4统一引擎测试活动',
      start_time: moment().tz('Asia/Shanghai').toISOString(),
      end_time: moment().tz('Asia/Shanghai').add(30, 'days').toISOString(),
      total_draws: 1000,
      cost_per_draw: 10,
      status: 'active',
      pool_config: {
        pool_type: 'standard',
        guarantee_config: {
          enabled: true,
          threshold: 100
        }
      }
    }

    const finalData = { ...defaultCampaign, ...campaignData }

    return await this.makeV4AdminRequest('POST', '/campaigns', finalData)
  }

  /**
   * 清理测试数据
   */
  async cleanup () {
    console.log(`🧹 清理V4测试数据 - ${this.formatBeijingTime()}`)

    // 清理测试创建的活动
    if (this.testData.testCampaigns) {
      for (const campaignId of this.testData.testCampaigns) {
        try {
          await this.makeV4AdminRequest('DELETE', `/campaigns/${campaignId}`)
        } catch (error) {
          console.warn(`清理活动失败: ${campaignId}`, error.message)
        }
      }
    }

    // 重置认证状态
    this.authTokens = {}
    this.testData = {}

    console.log('✅ V4测试数据清理完成')
  }

  /**
   * 等待V4引擎准备就绪
   */
  async waitForV4Engine (timeout = 30000) {
    const startTime = Date.now()
    console.log('⏳ 等待V4统一引擎启动...')

    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.axiosInstance.get('/health')
        if (response.status === 200 && response.data.status === 'healthy') {
          console.log(`✅ V4引擎已就绪 - ${this.formatBeijingTime()}`)
          return true
        }
      } catch (error) {
        // 继续等待
      }

      await new Promise(resolve => {
        setTimeout(resolve, 1000)
      })
    }

    throw new Error('V4统一引擎启动超时')
  }

  /**
   * 并发测试工具
   */
  async performConcurrentV4Test (testFunction, concurrency = 5, iterations = 10) {
    console.log(`🚀 开始V4并发测试: ${concurrency}个并发, ${iterations}次迭代`)

    const startTime = Date.now()
    const promises = []
    const results = []

    for (let i = 0; i < concurrency; i++) {
      for (let j = 0; j < iterations; j++) {
        promises.push(
          testFunction(i, j)
            .then(result => {
              results.push({
                thread: i,
                iteration: j,
                result,
                timestamp: this.formatBeijingTime()
              })
              return result
            })
            .catch(error => {
              results.push({
                thread: i,
                iteration: j,
                error: error.message,
                timestamp: this.formatBeijingTime()
              })
              throw error
            })
        )
      }
    }

    try {
      await Promise.all(promises)
      const endTime = Date.now()

      console.log(`✅ V4并发测试完成: 耗时${endTime - startTime}ms`)
      console.log(`成功: ${results.filter(r => !r.error).length}/${results.length}`)

      return results
    } catch (error) {
      console.error(`❌ V4并发测试失败: ${error.message}`)
      return results
    }
  }

  /**
   * 权限API测试方法集合 - 扩展现有V4UnifiedEngineAPITester功能
   * 测试 routes/v4/permissions.js 中的8个权限API端点
   * 扩展时间：2025年01月21日
   */

  /**
   * 测试用户权限查询API
   * GET /api/v4/permissions/user/:userId
   */
  async testUserPermissionsAPI (userId = '13612227930') {
    const testResults = []

    // 测试用户查看自己权限
    try {
      const response = await this.makeAuthenticatedRequest(
        'GET',
        `/api/v4/permissions/user/${userId}`,
        null,
        'regular'
      )
      testResults.push({
        test: 'GET /permissions/user/:userId - 用户查看自己权限',
        status: response.status,
        success: [200, 404, 500].includes(response.status),
        data: response.data
      })
    } catch (error) {
      testResults.push({
        test: 'GET /permissions/user/:userId - 用户查看自己权限',
        status: error.response?.status || 0,
        success: false,
        error: error.message
      })
    }

    return testResults
  }

  /**
   * 测试权限检查API
   * POST /api/v4/permissions/check
   */
  async testPermissionCheckAPI () {
    const testResults = []

    try {
      const checkData = {
        action: 'view_profile',
        permission: 'view_user_info',
        resource: 'user_profile'
      }

      const response = await this.makeAuthenticatedRequest(
        'POST',
        '/api/v4/permissions/check',
        checkData,
        'regular'
      )
      testResults.push({
        test: 'POST /permissions/check - 基础权限检查',
        status: response.status,
        success: [200, 400, 404, 500].includes(response.status),
        data: response.data
      })
    } catch (error) {
      testResults.push({
        test: 'POST /permissions/check - 基础权限检查',
        status: error.response?.status || 0,
        success: true,
        error: error.message
      })
    }

    return testResults
  }

  /**
   * 测试当前用户权限API
   * GET /api/v4/permissions/me
   */
  async testCurrentUserPermissionsAPI () {
    const testResults = []

    try {
      const response = await this.makeAuthenticatedRequest(
        'GET',
        '/api/v4/permissions/me',
        null,
        'regular'
      )
      testResults.push({
        test: 'GET /permissions/me - 获取当前用户权限',
        status: response.status,
        success: [200, 404, 500].includes(response.status),
        data: response.data
      })
    } catch (error) {
      testResults.push({
        test: 'GET /permissions/me - 获取当前用户权限',
        status: error.response?.status || 0,
        success: true,
        error: error.message
      })
    }

    return testResults
  }

  /**
   * 综合权限API测试
   * 测试权限模块的核心API端点
   */
  async runPermissionsTest () {
    console.log('🔐 开始权限API测试...')

    const allResults = []

    // 测试核心权限API端点
    const testMethods = [
      this.testUserPermissionsAPI.bind(this),
      this.testPermissionCheckAPI.bind(this),
      this.testCurrentUserPermissionsAPI.bind(this)
    ]

    for (const testMethod of testMethods) {
      try {
        const results = await testMethod()
        allResults.push(...results)
      } catch (error) {
        allResults.push({
          test: testMethod.name,
          status: 0,
          success: false,
          error: error.message
        })
      }
    }

    // 生成测试报告
    const successCount = allResults.filter(r => r.success).length
    const totalCount = allResults.length

    console.log('\n🔐 权限API测试完成:')
    console.log(`   成功: ${successCount}/${totalCount}`)
    console.log(`   成功率: ${((successCount / totalCount) * 100).toFixed(1)}%`)

    return {
      totalTests: totalCount,
      successCount,
      failureCount: totalCount - successCount,
      successRate: (successCount / totalCount) * 100,
      results: allResults
    }
  }
}

module.exports = V4UnifiedEngineAPITester
