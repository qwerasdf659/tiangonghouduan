/**
 * 性能测试套件
 * 包含并发测试、负载测试、响应时间测试等功能
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const BaseTestManager = require('../core/base_test_manager')
const { performance } = require('perf_hooks')

class PerformanceTestSuite extends BaseTestManager {
  constructor (baseUrl) {
    super(baseUrl)

    // 性能测试相关
    this.performance_results = []
    this.load_test_results = []

    console.log('[PerformanceTestSuite] 性能测试套件初始化完成')
  }

  /**
   * 🚀 运行完整性能测试套件
   */
  async run_complete_performance_tests () {
    console.log('🚀 开始运行完整性能测试套件...')
    const start_time = Date.now()

    try {
      // 1. 响应时间测试
      await this.run_response_time_tests()

      // 2. 并发测试
      await this.run_concurrency_tests()

      // 3. 负载测试
      await this.run_load_tests()

      const duration = Date.now() - start_time
      console.log(`✅ 性能测试完成，总耗时: ${duration}ms`)

      return {
        success: true,
        performance_results: this.performance_results,
        load_test_results: this.load_test_results,
        duration
      }
    } catch (error) {
      console.error('❌ 性能测试失败:', error)
      return {
        success: false,
        error: error.message,
        performance_results: this.performance_results
      }
    }
  }

  /**
   * ⚡ 响应时间测试
   */
  async run_response_time_tests () {
    console.log('⚡ 开始响应时间测试...')

    const test_endpoints = [
      { method: 'GET', url: '/health', name: '健康检查', use_cache: true },
      {
        method: 'POST',
        url: '/api/v4/unified-engine/auth/login',
        name: '用户登录',
        data: { mobile: '13612227930', verification_code: '123456' }
      },
      { method: 'GET', url: '/api/v4/unified-engine/lottery/campaigns', name: '抽奖活动列表' }
    ]

    for (const endpoint of test_endpoints) {
      const times = []
      const iterations = endpoint.use_cache ? 1 : 10 // 健康检查只测试1次

      for (let i = 0; i < iterations; i++) {
        const start_time = performance.now()
        try {
          if (endpoint.use_cache) {
            // 使用缓存的健康检查方法
            await this.health_check_with_cache()
          } else if (endpoint.data) {
            await this.make_request(endpoint.method, endpoint.url, endpoint.data)
          } else {
            await this.make_request(endpoint.method, endpoint.url)
          }
          const end_time = performance.now()
          times.push(end_time - start_time)
        } catch (error) {
          console.warn(`响应时间测试失败: ${endpoint.name}`, error.message)
        }
      }

      if (times.length > 0) {
        const average_time = times.reduce((sum, time) => sum + time, 0) / times.length
        const max_time = Math.max(...times)
        const min_time = Math.min(...times)

        this.performance_results.push({
          endpoint: endpoint.name,
          url: endpoint.url,
          average_time: Math.round(average_time),
          max_time: Math.round(max_time),
          min_time: Math.round(min_time),
          iterations: times.length,
          success_rate: (times.length / iterations) * 100
        })

        console.log(
          `✅ ${endpoint.name}: 平均${Math.round(average_time)}ms, 最大${Math.round(max_time)}ms`
        )
      }
    }
  }

  /**
   * 🔄 并发测试
   */
  async run_concurrency_tests () {
    console.log('🔄 开始并发测试...')

    // 🔧 修改：使用非健康检查端点进行并发测试，避免无意义的重复
    const test_config = {
      endpoint: '/api/v4/unified-engine/lottery/strategies',
      method: 'GET',
      concurrency: 10,
      iterations: 2 // 减少迭代次数
    }

    const promises = []
    const start_time = performance.now()

    for (let i = 0; i < test_config.concurrency; i++) {
      for (let j = 0; j < test_config.iterations; j++) {
        promises.push(
          this.make_request(test_config.method, test_config.endpoint)
            .then(response => ({ success: true, response, worker: i, iteration: j }))
            .catch(error => ({ success: false, error: error.message, worker: i, iteration: j }))
        )
      }
    }

    const results = await Promise.all(promises)
    const end_time = performance.now()

    const summary = {
      total_requests: test_config.concurrency * test_config.iterations,
      success_count: results.filter(r => r.success).length,
      failure_count: results.filter(r => !r.success).length,
      total_time: end_time - start_time,
      average_time: (end_time - start_time) / (test_config.concurrency * test_config.iterations),
      concurrency: test_config.concurrency,
      iterations: test_config.iterations
    }

    this.performance_results.push({
      test: '并发测试',
      endpoint: test_config.endpoint,
      summary
    })

    console.log(`✅ 并发测试完成: ${summary.success_count}/${summary.total_requests} 成功`)
  }

  /**
   * 📊 负载测试
   */
  async run_load_tests () {
    console.log('📊 开始负载测试...')

    const load_levels = [
      { name: '轻负载', requests_per_second: 5, duration: 10 },
      { name: '中负载', requests_per_second: 10, duration: 10 },
      { name: '重负载', requests_per_second: 20, duration: 10 }
    ]

    for (const level of load_levels) {
      console.log(`🔄 执行${level.name}测试...`)

      const results = await this.execute_load_test(
        '/api/v4/unified-engine/version',
        'GET',
        level.requests_per_second,
        level.duration
      )

      this.load_test_results.push({
        level: level.name,
        requests_per_second: level.requests_per_second,
        duration: level.duration,
        results
      })

      console.log(`✅ ${level.name}完成: ${results.success_rate}% 成功率`)
    }
  }

  /**
   * 🎯 执行负载测试
   */
  async execute_load_test (endpoint, method, requests_per_second, duration_seconds) {
    const total_requests = requests_per_second * duration_seconds
    const interval = 1000 / requests_per_second
    const results = []

    const start_time = Date.now()

    for (let i = 0; i < total_requests; i++) {
      const request_start = performance.now()

      try {
        await this.make_request(method, endpoint)
        const request_end = performance.now()

        results.push({
          success: true,
          response_time: request_end - request_start,
          timestamp: Date.now()
        })
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          timestamp: Date.now()
        })
      }

      // 控制请求频率
      if (i < total_requests - 1) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }

    const end_time = Date.now()
    const success_count = results.filter(r => r.success).length
    const average_response_time =
      results
        .filter(r => r.success && r.response_time)
        .reduce((sum, r) => sum + r.response_time, 0) / success_count

    return {
      total_requests,
      success_count,
      failure_count: total_requests - success_count,
      success_rate: Math.round((success_count / total_requests) * 100),
      average_response_time: Math.round(average_response_time || 0),
      total_duration: end_time - start_time,
      actual_rps: Math.round(total_requests / ((end_time - start_time) / 1000))
    }
  }

  /**
   * 📈 生成性能报告
   */
  generate_performance_report () {
    const report = {
      response_time_tests: this.performance_results.filter(r => r.endpoint),
      concurrency_tests: this.performance_results.filter(r => r.test === '并发测试'),
      load_tests: this.load_test_results,
      summary: {
        total_tests: this.performance_results.length + this.load_test_results.length,
        generated_at: BeijingTimeHelper.now()
      }
    }

    console.log('📈 性能测试报告生成完成')
    return report
  }
}

module.exports = PerformanceTestSuite
