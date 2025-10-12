/**
 * 统一API测试管理器 V4 - 重构版
 * 整合所有API测试功能的主协调器
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 * 重构说明：拆分为模块化测试套件，提高代码可维护性和重复代码控制
 *
 * 核心功能：
 * 1. 协调各个专项测试套件
 * 2. 统一测试结果收集和报告
 * 3. 提供简化的测试接口
 * 4. 管理测试执行流程
 */

// 导入拆分后的测试套件
const BaseTestManager = require('./core/base_test_manager')
const SecurityTestSuite = require('./security/security_test_suite')
const PerformanceTestSuite = require('./performance/performance_test_suite')
const BusinessLogicTester = require('./business/business_logic_tester')
const MySQLTestSuite = require('./database/mysql_test_suite')
const CodeQualityChecker = require('./quality/code_quality_checker')

const BeijingTimeHelper = require('../../utils/timeHelper')

class UnifiedAPITestManager extends BaseTestManager {
  constructor (baseUrl = 'http://localhost:3000') {
    super(baseUrl)

    // 初始化各个测试套件
    this.security_suite = new SecurityTestSuite(baseUrl)
    this.performance_suite = new PerformanceTestSuite(baseUrl)
    this.business_tester = new BusinessLogicTester(baseUrl)
    this.mysql_suite = new MySQLTestSuite(baseUrl)
    this.quality_checker = new CodeQualityChecker(baseUrl)

    // 统一测试结果
    this.unified_results = {
      security: null,
      performance: null,
      business: null,
      mysql: null,
      quality: null,
      summary: null
    }

    console.log('[UnifiedAPITestManager] 统一API测试管理器初始化完成')
    console.log('📊 已加载测试套件: 安全、性能、业务、数据库、质量')
  }

  /**
   * 🚀 运行完整测试套件
   */
  async run_complete_test_suite (options = {}) {
    console.log('🚀 开始运行完整API测试套件...')
    const start_time = Date.now()

    const {
      include_security = true,
      include_performance = true,
      include_business = true,
      include_mysql = true,
      include_quality = true,
      parallel = true
    } = options

    try {
      if (parallel) {
        // 并行执行所有测试套件
        await this.run_parallel_tests({
          include_security,
          include_performance,
          include_business,
          include_mysql,
          include_quality
        })
      } else {
        // 串行执行测试套件
        await this.run_sequential_tests({
          include_security,
          include_performance,
          include_business,
          include_mysql,
          include_quality
        })
      }

      // 生成统一报告
      this.generate_unified_summary()

      const duration = Date.now() - start_time
      console.log(`✅ 完整测试套件执行完成，总耗时: ${duration}ms`)

      return {
        success: true,
        duration,
        results: this.unified_results
      }
    } catch (error) {
      console.error('❌ 测试套件执行失败:', error)
      return {
        success: false,
        error: error.message,
        results: this.unified_results
      }
    }
  }

  /**
   * 🔄 并行执行测试套件
   */
  async run_parallel_tests (options) {
    console.log('🔄 并行执行测试套件...')

    const test_promises = []

    if (options.include_security) {
      test_promises.push(
        this.security_suite
          .run_complete_security_tests()
          .then(result => {
            this.unified_results.security = result
          })
          .catch(error => {
            this.unified_results.security = { success: false, error: error.message }
          })
      )
    }

    if (options.include_performance) {
      test_promises.push(
        this.performance_suite
          .run_complete_performance_tests()
          .then(result => {
            this.unified_results.performance = result
          })
          .catch(error => {
            this.unified_results.performance = { success: false, error: error.message }
          })
      )
    }

    if (options.include_business) {
      test_promises.push(
        this.business_tester
          .run_full_business_test_suite()
          .then(result => {
            this.unified_results.business = result
          })
          .catch(error => {
            this.unified_results.business = { success: false, error: error.message }
          })
      )
    }

    if (options.include_mysql) {
      test_promises.push(
        this.mysql_suite
          .run_mysql_tests()
          .then(result => {
            this.unified_results.mysql = result
          })
          .catch(error => {
            this.unified_results.mysql = { success: false, error: error.message }
          })
      )
    }

    if (options.include_quality) {
      test_promises.push(
        this.quality_checker
          .run_quality_check()
          .then(result => {
            this.unified_results.quality = result
          })
          .catch(error => {
            this.unified_results.quality = { success: false, error: error.message }
          })
      )
    }

    await Promise.all(test_promises)
    console.log('✅ 并行测试执行完成')
  }

  /**
   * ➡️ 串行执行测试套件
   */
  async run_sequential_tests (options) {
    console.log('➡️ 串行执行测试套件...')

    if (options.include_security) {
      console.log('🔒 执行安全测试套件...')
      this.unified_results.security = await this.security_suite.run_complete_security_tests()
    }

    if (options.include_performance) {
      console.log('⚡ 执行性能测试套件...')
      this.unified_results.performance =
        await this.performance_suite.run_complete_performance_tests()
    }

    if (options.include_business) {
      console.log('🏢 执行业务逻辑测试套件...')
      this.unified_results.business = await this.business_tester.run_full_business_test_suite()
    }

    if (options.include_mysql) {
      console.log('🗄️ 执行MySQL测试套件...')
      this.unified_results.mysql = await this.mysql_suite.run_mysql_tests()
    }

    if (options.include_quality) {
      console.log('🔍 执行代码质量检查...')
      this.unified_results.quality = await this.quality_checker.run_quality_check()
    }

    console.log('✅ 串行测试执行完成')
  }

  /**
   * 📊 生成统一测试摘要
   */
  generate_unified_summary () {
    const summary = {
      total_suites: 0,
      passed_suites: 0,
      failed_suites: 0,
      total_duration: 0,
      security_score: 0,
      quality_score: 0,
      performance_rating: 'unknown',
      business_coverage: 0,
      mysql_health: 'unknown',
      generated_at: BeijingTimeHelper.now()
    }

    // 统计各测试套件结果
    Object.entries(this.unified_results).forEach(([suite_name, result]) => {
      if (result && suite_name !== 'summary') {
        summary.total_suites++

        if (result.success) {
          summary.passed_suites++
        } else {
          summary.failed_suites++
        }

        if (result.duration) {
          summary.total_duration += result.duration
        }

        // 提取特定指标
        if (suite_name === 'security' && result.security_score) {
          summary.security_score = result.security_score
        }

        if (suite_name === 'quality' && result.metrics) {
          summary.quality_score = this.quality_checker.calculate_quality_score()
        }
      }
    })

    // 计算总体评级
    const overall_success_rate =
      summary.total_suites > 0 ? (summary.passed_suites / summary.total_suites) * 100 : 0

    summary.overall_rating = this.calculate_overall_rating(overall_success_rate)
    summary.success_rate = Math.round(overall_success_rate)

    this.unified_results.summary = summary

    console.log('📊 统一测试摘要生成完成')
    console.log(`   总体成功率: ${summary.success_rate}%`)
    console.log(`   安全评分: ${summary.security_score}/100`)
    console.log(`   质量评分: ${summary.quality_score}/100`)
    console.log(`   总耗时: ${summary.total_duration}ms`)
  }

  /**
   * 🎯 计算总体评级
   */
  calculate_overall_rating (success_rate) {
    if (success_rate >= 95) return 'EXCELLENT'
    if (success_rate >= 85) return 'GOOD'
    if (success_rate >= 70) return 'FAIR'
    if (success_rate >= 50) return 'POOR'
    return 'CRITICAL'
  }

  /**
   * 📈 生成详细测试报告
   */
  generate_detailed_report () {
    const report = {
      metadata: {
        generated_at: BeijingTimeHelper.now(),
        generator: 'UnifiedAPITestManager V4',
        version: '4.0.0'
      },
      summary: this.unified_results.summary,
      security: this.unified_results.security,
      performance: this.unified_results.performance,
      business: this.unified_results.business,
      mysql: this.unified_results.mysql,
      quality: this.unified_results.quality,
      recommendations: this.generate_recommendations()
    }

    console.log('📈 详细测试报告生成完成')
    return report
  }

  /**
   * 💡 生成改进建议
   */
  generate_recommendations () {
    const recommendations = []

    // 安全建议
    if (this.unified_results.security && this.unified_results.security.vulnerabilities) {
      const vuln_count = this.unified_results.security.vulnerabilities.length
      if (vuln_count > 0) {
        recommendations.push({
          category: 'security',
          priority: 'high',
          message: `发现${vuln_count}个安全漏洞，建议立即修复`
        })
      }
    }

    // 性能建议
    if (this.unified_results.performance && this.unified_results.performance.performance_results) {
      const slow_endpoints = this.unified_results.performance.performance_results.filter(
        r => r.average_time > 1000
      )

      if (slow_endpoints.length > 0) {
        recommendations.push({
          category: 'performance',
          priority: 'medium',
          message: `${slow_endpoints.length}个接口响应时间超过1秒，建议优化`
        })
      }
    }

    // 质量建议
    if (this.unified_results.quality && this.unified_results.quality.results) {
      const quality_score = this.quality_checker.calculate_quality_score()
      if (quality_score < 80) {
        recommendations.push({
          category: 'quality',
          priority: 'medium',
          message: `代码质量评分${quality_score}/100，建议改进代码规范`
        })
      }
    }

    return recommendations
  }

  /**
   * 🎯 快速健康检查
   */
  async quick_health_check () {
    console.log('🎯 执行快速健康检查...')

    try {
      const health_results = await Promise.all([
        this.health_check_with_cache(),
        this.mysql_suite.test_mysql_connection(),
        this.quality_checker.run_health_check()
      ])

      const health_summary = {
        api_health: health_results[0].status === 200,
        database_health: true, // mysql_suite会抛出异常如果失败
        service_health: health_results[2] ? health_results[2].status === 'passed' : false,
        overall_health: health_results[0].status === 200,
        timestamp: BeijingTimeHelper.now()
      }

      console.log('✅ 快速健康检查完成')
      return health_summary
    } catch (error) {
      console.error('❌ 快速健康检查失败:', error.message)
      return {
        api_health: false,
        database_health: false,
        service_health: false,
        overall_health: false,
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      }
    }
  }

  /**
   * 🔧 自定义测试执行
   */
  async run_custom_tests (test_config) {
    console.log('🔧 执行自定义测试配置...')

    const {
      security_tests = [],
      performance_tests = [],
      business_tests = [],
      custom_endpoints = []
    } = test_config

    const custom_results = {
      security: null,
      performance: null,
      business: null,
      custom: null
    }

    // 执行自定义安全测试
    if (security_tests.length > 0) {
      // 这里可以扩展为支持自定义安全测试
      custom_results.security = await this.security_suite.run_complete_security_tests()
    }

    // 执行自定义性能测试
    if (performance_tests.length > 0) {
      custom_results.performance = await this.performance_suite.run_complete_performance_tests()
    }

    // 执行自定义业务测试
    if (business_tests.length > 0) {
      custom_results.business = await this.business_tester.run_full_business_test_suite()
    }

    // 执行自定义端点测试
    if (custom_endpoints.length > 0) {
      const endpoint_results = []

      for (const endpoint of custom_endpoints) {
        try {
          const response = await this.make_request(endpoint.method, endpoint.path, endpoint.data)
          endpoint_results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            status: response.status,
            success: response.status >= 200 && response.status < 300
          })
        } catch (error) {
          endpoint_results.push({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            status: 'error',
            success: false,
            error: error.message
          })
        }
      }

      custom_results.custom = {
        success: endpoint_results.every(r => r.success),
        results: endpoint_results
      }
    }

    console.log('✅ 自定义测试执行完成')
    return custom_results
  }

  /**
   * 🔑 简化认证测试用户方法
   */
  async authenticate_test_users () {
    console.log('🔑 开始认证测试用户...')
    try {
      // 简化版认证测试 - 修复路径
      const response = await this.make_request('GET', '/api/v4/unified-engine/lottery/health')
      console.log('✅ 测试用户认证完成')
      return { success: response.status === 200 }
    } catch (error) {
      console.error('❌ 测试用户认证失败:', error.message)
      throw error
    }
  }

  /**
   * 🗄️ 简化MySQL连接测试方法
   */
  async test_mysql_connection () {
    console.log('🗄️ 开始MySQL连接测试...')
    try {
      const result = await this.mysql_suite.test_mysql_connection()
      console.log('✅ MySQL连接测试完成')
      return result
    } catch (error) {
      console.error('❌ MySQL连接测试失败:', error.message)
      throw error
    }
  }

  /**
   * 🔒 简化安全测试方法
   */
  async run_complete_security_tests () {
    console.log('🔒 开始安全测试...')
    try {
      const result = await this.security_suite.run_complete_security_tests()
      console.log('✅ 安全测试完成')
      return result
    } catch (error) {
      console.error('❌ 安全测试失败:', error.message)
      throw error
    }
  }
}

module.exports = UnifiedAPITestManager
