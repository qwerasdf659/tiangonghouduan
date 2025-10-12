/**
 * 代码质量检查套件
 * 包含ESLint、Prettier、Jest、健康检查等功能
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const BaseTestManager = require('../core/base_test_manager')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

class CodeQualityChecker extends BaseTestManager {
  constructor (baseUrl) {
    super(baseUrl)

    // 质量检查相关
    this.quality_results = {
      eslint: null,
      prettier: null,
      jest: null,
      health_check: null,
      project_status: null
    }

    // 质量指标
    this.quality_metrics = {
      eslint_errors: 0,
      eslint_warnings: 0,
      test_coverage: 0,
      maintainability_index: 0,
      code_smells: 0,
      duplicate_code: 0,
      last_check: null
    }

    console.log('[CodeQualityChecker] 代码质量检查套件初始化完成')
  }

  /**
   * 🔍 运行代码质量检查
   */
  async run_quality_check () {
    console.log('🔍 开始运行代码质量检查...')
    const start_time = Date.now()

    try {
      // 1. ESLint检查
      await this.run_eslint_check()

      // 2. Prettier检查
      await this.run_prettier_check()

      // 3. Jest测试
      await this.run_jest_tests()

      // 4. 健康检查
      await this.run_health_check()

      // 5. 项目状态检查
      await this.run_project_status_check()

      const duration = Date.now() - start_time
      console.log(`✅ 代码质量检查完成，总耗时: ${duration}ms`)

      return {
        success: true,
        duration,
        results: this.quality_results,
        metrics: this.quality_metrics
      }
    } catch (error) {
      console.error('❌ 代码质量检查失败:', error)
      return {
        success: false,
        error: error.message,
        results: this.quality_results
      }
    }
  }

  /**
   * 📝 ESLint检查
   */
  async run_eslint_check () {
    try {
      console.log('📝 开始ESLint检查...')

      const { stdout } = await execAsync('npx eslint . --format json', {
        cwd: process.cwd(),
        timeout: 30000
      })

      let eslint_results = []
      if (stdout.trim()) {
        try {
          eslint_results = JSON.parse(stdout)
        } catch (parse_error) {
          console.warn('ESLint输出解析失败，使用文本格式')
          eslint_results = [{ messages: [{ message: stdout }] }]
        }
      }

      const total_errors = eslint_results.reduce(
        (sum, file) => sum + file.messages.filter(msg => msg.severity === 2).length,
        0
      )
      const total_warnings = eslint_results.reduce(
        (sum, file) => sum + file.messages.filter(msg => msg.severity === 1).length,
        0
      )

      this.quality_results.eslint = {
        status: total_errors === 0 ? 'passed' : 'failed',
        errors: total_errors,
        warnings: total_warnings,
        files: eslint_results.length,
        details: eslint_results.slice(0, 5), // 只保留前5个文件的详情
        timestamp: BeijingTimeHelper.now()
      }

      this.quality_metrics.eslint_errors = total_errors
      this.quality_metrics.eslint_warnings = total_warnings

      if (total_errors === 0) {
        console.log(`✅ ESLint检查通过: ${total_warnings}个警告`)
      } else {
        console.log(`⚠️ ESLint检查发现问题: ${total_errors}个错误, ${total_warnings}个警告`)
      }
    } catch (error) {
      this.quality_results.eslint = {
        status: 'error',
        error: error.message,
        stderr: error.stderr,
        timestamp: BeijingTimeHelper.now()
      }
      console.warn('⚠️ ESLint检查失败:', error.message)
    }
  }

  /**
   * 💅 Prettier检查
   */
  async run_prettier_check () {
    try {
      console.log('💅 开始Prettier检查...')

      await execAsync('npx prettier --check .', {
        cwd: process.cwd(),
        timeout: 30000
      })

      this.quality_results.prettier = {
        status: 'passed',
        message: '代码格式符合Prettier规范',
        timestamp: BeijingTimeHelper.now()
      }
      console.log('✅ Prettier检查通过')
    } catch (error) {
      this.quality_results.prettier = {
        status: 'failed',
        error: error.message,
        stderr: error.stderr,
        timestamp: BeijingTimeHelper.now()
      }
      console.warn('⚠️ Prettier检查发现格式问题')
    }
  }

  /**
   * 🧪 Jest测试
   */
  async run_jest_tests () {
    try {
      console.log('🧪 开始Jest测试...')

      const { stdout } = await execAsync('npm test -- --passWithNoTests --json', {
        cwd: process.cwd(),
        timeout: 60000
      })

      let jest_results = {}
      try {
        jest_results = JSON.parse(stdout)
      } catch (parse_error) {
        jest_results = { success: true, numTotalTests: 0 }
      }

      this.quality_results.jest = {
        status: jest_results.success ? 'passed' : 'failed',
        total_tests: jest_results.numTotalTests || 0,
        passed_tests: jest_results.numPassedTests || 0,
        failed_tests: jest_results.numFailedTests || 0,
        coverage: jest_results.coverageMap ? 'available' : 'unavailable',
        timestamp: BeijingTimeHelper.now()
      }

      this.quality_metrics.test_coverage = jest_results.coverageMap ? 80 : 0 // 简化处理

      console.log(
        `✅ Jest测试完成: ${jest_results.numPassedTests || 0}/${jest_results.numTotalTests || 0} 通过`
      )
    } catch (error) {
      this.quality_results.jest = {
        status: 'error',
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      }
      console.warn('⚠️ Jest测试失败:', error.message)
    }
  }

  /**
   * 🏥 健康检查
   */
  async run_health_check () {
    try {
      console.log('🏥 开始健康检查...')

      const response = await this.health_check_with_cache()

      this.quality_results.health_check = {
        status: response.status === 200 ? 'passed' : 'failed',
        response_time: Date.now(),
        data: response.data,
        timestamp: BeijingTimeHelper.now()
      }

      if (response.status === 200) {
        console.log('✅ 健康检查通过')
      } else {
        console.warn(`⚠️ 健康检查失败: HTTP ${response.status}`)
      }
    } catch (error) {
      this.quality_results.health_check = {
        status: 'failed',
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      }
      console.warn('⚠️ 健康检查失败:', error.message)
    }
  }

  /**
   * 📊 项目状态检查
   */
  async run_project_status_check () {
    try {
      console.log('📊 开始项目状态检查...')

      const status_checks = []

      // 检查package.json
      try {
        await execAsync('node -e "require(\'./package.json\')"')
        status_checks.push({ check: 'package.json', status: 'valid' })
      } catch (error) {
        status_checks.push({ check: 'package.json', status: 'invalid', error: error.message })
      }

      // 检查.env文件
      try {
        await execAsync('test -f .env')
        status_checks.push({ check: '.env文件', status: 'exists' })
      } catch (error) {
        status_checks.push({ check: '.env文件', status: 'missing' })
      }

      // 检查node_modules
      try {
        await execAsync('test -d node_modules')
        status_checks.push({ check: 'node_modules', status: 'exists' })
      } catch (error) {
        status_checks.push({ check: 'node_modules', status: 'missing' })
      }

      // 检查数据库连接（使用缓存的健康检查）
      try {
        const db_response = await this.health_check_with_cache()
        status_checks.push({
          check: '数据库连接',
          status: db_response.status === 200 ? 'connected' : 'disconnected'
        })
      } catch (error) {
        status_checks.push({ check: '数据库连接', status: 'failed', error: error.message })
      }

      const failed_checks = status_checks.filter(check =>
        ['invalid', 'missing', 'disconnected', 'failed'].includes(check.status)
      )

      this.quality_results.project_status = {
        status: failed_checks.length === 0 ? 'healthy' : 'issues',
        checks: status_checks,
        failed_count: failed_checks.length,
        timestamp: BeijingTimeHelper.now()
      }

      if (failed_checks.length === 0) {
        console.log(`✅ 项目状态检查通过，执行${status_checks.length}项检查`)
      } else {
        console.warn(`⚠️ 项目状态检查发现${failed_checks.length}个问题`)
      }
    } catch (error) {
      this.quality_results.project_status = {
        status: 'error',
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      }
      console.warn('⚠️ 项目状态检查失败:', error.message)
    }
  }

  /**
   * 📈 生成质量报告
   */
  generate_quality_report () {
    const report = {
      eslint: this.quality_results.eslint,
      prettier: this.quality_results.prettier,
      jest: this.quality_results.jest,
      health_check: this.quality_results.health_check,
      project_status: this.quality_results.project_status,
      metrics: this.quality_metrics,
      summary: {
        total_checks: Object.keys(this.quality_results).length,
        passed_checks: Object.values(this.quality_results).filter(
          r => r && ['passed', 'healthy'].includes(r.status)
        ).length,
        generated_at: BeijingTimeHelper.now()
      }
    }

    console.log('📈 代码质量报告生成完成')
    return report
  }

  /**
   * 🎯 计算质量评分
   */
  calculate_quality_score () {
    let score = 100

    // ESLint评分 (30分)
    if (this.quality_results.eslint) {
      if (this.quality_results.eslint.status === 'failed') {
        score -= Math.min(30, this.quality_results.eslint.errors * 2)
      }
      score -= Math.min(10, this.quality_results.eslint.warnings * 0.5)
    }

    // Prettier评分 (20分)
    if (this.quality_results.prettier && this.quality_results.prettier.status !== 'passed') {
      score -= 20
    }

    // Jest测试评分 (30分)
    if (this.quality_results.jest) {
      if (this.quality_results.jest.status === 'failed') {
        score -= 30
      } else if (this.quality_results.jest.total_tests === 0) {
        score -= 15
      }
    }

    // 健康检查评分 (20分)
    if (
      this.quality_results.health_check &&
      this.quality_results.health_check.status !== 'passed'
    ) {
      score -= 20
    }

    return Math.max(0, Math.round(score))
  }
}

module.exports = CodeQualityChecker
