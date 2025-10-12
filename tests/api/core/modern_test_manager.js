/**
 * 现代化测试管理器
 * 提供更清晰的接口设计和更好的错误处理
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const BaseTestManager = require('./base_test_manager')

class ModernTestManager extends BaseTestManager {
  constructor (baseUrl = 'http://localhost:3000') {
    super(baseUrl)

    // 现代化配置
    this.config = {
      timeout: 30000,
      retries: 3,
      parallel_limit: 5,
      log_level: 'info'
    }

    console.log('[ModernTestManager] 现代化测试管理器初始化完成')
  }

  /**
   * 🚀 现代化HTTP请求方法
   */
  async makeRequest (method, url, data = null, options = {}) {
    return await this.make_request(method, url, data, options)
  }

  /**
   * 🔐 现代化认证方法
   */
  async authenticateUser (userType = 'regular') {
    const userConfig = {
      regular: { mobile: '13612227930', role: 'user' },
      admin: { mobile: '13612227930', role: 'admin' }
    }

    const config = userConfig[userType] || userConfig.regular
    return await this.authenticate(config.mobile, '123456', config.role)
  }

  /**
   * 🔐 V4认证方法别名
   */
  async authenticateV4User (userType = 'regular') {
    return await this.authenticateUser(userType)
  }

  /**
   * 🧪 现代化参数验证测试
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
          success: response.status === 400 || response.status === 422,
          message: `字段 ${field} 验证${response.status === 400 || response.status === 422 ? '通过' : '失败'}`
        })
      } catch (error) {
        results.push({
          field,
          status: 'error',
          success: false,
          error: error.message,
          message: `字段 ${field} 测试异常`
        })
      }
    }

    return {
      total: requiredFields.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  }

  /**
   * 🚀 现代化并发测试
   */
  async testConcurrentRequests (url, method, data, concurrency = 5) {
    const promises = []
    const startTime = Date.now()

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        this.make_request(method, url, data)
          .then(response => ({
            success: true,
            response,
            worker_id: i,
            response_time: Date.now() - startTime
          }))
          .catch(error => ({
            success: false,
            error: error.message,
            worker_id: i,
            response_time: Date.now() - startTime
          }))
      )
    }

    const results = await Promise.all(promises)
    const totalTime = Date.now() - startTime
    const successCount = results.filter(r => r.success).length

    return {
      summary: {
        total: concurrency,
        success: successCount,
        failure: concurrency - successCount,
        success_rate: Math.round((successCount / concurrency) * 100),
        total_time: totalTime,
        average_time: Math.round(totalTime / concurrency)
      },
      results
    }
  }

  /**
   * 🔒 现代化认证请求
   */
  async makeAuthenticatedRequest (method, url, data = null, userType = 'user') {
    return await this.make_authenticated_request(method, url, data, userType)
  }

  /**
   * 📊 现代化测试报告生成
   */
  generateTestReport () {
    const summary = {
      total: this.test_results.length,
      passed: this.test_results.filter(r => r.success).length,
      failed: this.test_results.filter(r => !r.success).length,
      success_rate: 0,
      total_time: 0
    }

    if (summary.total > 0) {
      summary.success_rate = Math.round((summary.passed / summary.total) * 100)
    }

    if (this.performance_data.length > 0) {
      summary.total_time = this.performance_data.reduce((sum, p) => sum + (p.duration || 0), 0)
      summary.average_time = Math.round(summary.total_time / this.performance_data.length)
    }

    return {
      metadata: {
        generated_at: BeijingTimeHelper.now(),
        generator: 'ModernTestManager',
        version: '1.0.0'
      },
      summary,
      results: this.test_results,
      performance: this.performance_data,
      recommendations: this.generateRecommendations(summary)
    }
  }

  /**
   * 💡 生成测试建议
   */
  generateRecommendations (summary) {
    const recommendations = []

    if (summary.success_rate < 80) {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        message: `测试成功率${summary.success_rate}%偏低，建议检查失败的测试用例`
      })
    }

    if (summary.average_time > 5000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: `平均响应时间${summary.average_time}ms较慢，建议优化API性能`
      })
    }

    if (summary.total < 10) {
      recommendations.push({
        type: 'coverage',
        priority: 'low',
        message: `测试用例数量${summary.total}较少，建议增加测试覆盖率`
      })
    }

    return recommendations
  }

  /**
   * 🎯 快速健康检查
   */
  async quickHealthCheck () {
    try {
      const response = await this.health_check_with_cache()
      return {
        healthy: response.status === 200,
        status: response.status,
        data: response.data,
        response_time: response.responseTime || 0,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      }
    }
  }

  /**
   * 🔧 批量API测试
   */
  async batchApiTest (endpoints) {
    const results = []

    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now()
        const response = await this.make_request(endpoint.method, endpoint.url, endpoint.data)
        const endTime = Date.now()

        results.push({
          endpoint: `${endpoint.method} ${endpoint.url}`,
          status: response.status,
          success: response.status >= 200 && response.status < 300,
          response_time: endTime - startTime,
          data: endpoint.validate ? endpoint.validate(response) : null
        })
      } catch (error) {
        results.push({
          endpoint: `${endpoint.method} ${endpoint.url}`,
          status: 'error',
          success: false,
          error: error.message
        })
      }
    }

    return {
      total: endpoints.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  }
}

module.exports = ModernTestManager
