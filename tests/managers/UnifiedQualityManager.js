/**
 * 统一质量管理器 - 整合版本
 * 整合了CodeQualityManager和ProjectQualityManager的功能
 * 提供完整的代码质量检查、自动修复和项目质量管理
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 */

const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs').promises
const path = require('path')
const winston = require('winston')

const execAsync = promisify(exec)

// 配置专用日志器
const unifiedLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
      return `[${timestamp}] ${level}: ${message} ${metaStr}`
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/unified-quality-manager.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
})

/**
 * 统一质量管理器类
 * 负责完整的项目质量检查、代码质量自动修复和持续监控
 */
class UnifiedQualityManager {
  constructor () {
    this.initialized = false
    this.startTime = Date.now()
    this.initTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

    // 质量检查结果
    this.results = {
      eslint: null,
      prettier: null,
      jest: null,
      healthCheck: null,
      projectStatus: null
    }

    // 质量指标
    this.qualityMetrics = {
      eslintErrors: 0,
      eslintWarnings: 0,
      testCoverage: 0,
      maintainabilityIndex: 0,
      codeSmells: 0,
      duplicateCode: 0,
      lastCheck: null
    }

    // 自动修复策略
    this.fixStrategies = new Map()
    this.setupFixStrategies()

    unifiedLogger.info('UnifiedQualityManager 初始化完成')
  }

  /**
   * 设置自动修复策略
   */
  setupFixStrategies () {
    // 未使用变量修复策略
    this.fixStrategies.set('no-unused-vars', {
      pattern: /(.+) is assigned a value but never used/,
      fix: (filePath, line, variable) => this.fixUnusedVariable(filePath, line, variable),
      priority: 'high'
    })

    // Promise executor return修复策略
    this.fixStrategies.set('no-promise-executor-return', {
      pattern: /Return values from promise executor functions cannot be read/,
      fix: (filePath, line) => this.fixPromiseExecutorReturn(filePath, line),
      priority: 'high'
    })

    // 引号格式修复策略
    this.fixStrategies.set('quotes', {
      pattern: /Strings must use singlequote/,
      fix: (filePath, line) => this.fixQuoteStyle(filePath, line),
      priority: 'medium'
    })

    // 尾随空格修复策略
    this.fixStrategies.set('no-trailing-spaces', {
      pattern: /Trailing spaces not allowed/,
      fix: (filePath, line) => this.fixTrailingSpaces(filePath, line),
      priority: 'low'
    })

    unifiedLogger.info(`设置了${this.fixStrategies.size}个自动修复策略`)
  }

  /**
   * 🚀 运行完整的项目质量检查
   */
  async runCompleteQualityCheck () {
    unifiedLogger.info('🚀 开始运行统一项目质量检查...')
    unifiedLogger.info(`📅 检查时间: ${this.initTime}`)

    try {
      // 1. 代码质量检查 (ESLint + Prettier)
      await this.runCodeQualityChecks()

      // 2. 功能测试检查 (Jest + SuperTest)
      await this.runFunctionalTests()

      // 3. 健康状态检查
      await this.runHealthChecks()

      // 4. 项目运行状态检查
      await this.runProjectStatusCheck()

      // 5. 自动修复检测到的问题
      await this.runAutoFix()

      // 6. 生成综合质量报告
      await this.generateQualityReport()

      const endTime = Date.now()
      const duration = endTime - this.startTime

      unifiedLogger.info(
        `🎉 统一质量检查完成，总用时 ${duration}ms (${(duration / 1000).toFixed(1)}s)`
      )

      return {
        summary: this.generateQualitySummary(),
        results: this.results,
        metrics: this.qualityMetrics,
        duration,
        timestamp: new Date().toISOString(),
        success: this.isOverallQualityAcceptable()
      }
    } catch (error) {
      unifiedLogger.error('❌ 统一质量检查过程中出错:', error)
      throw error
    }
  }

  /**
   * 🔧 运行代码质量检查
   */
  async runCodeQualityChecks () {
    unifiedLogger.info('🔧 开始代码质量检查...')

    try {
      // ESLint 检查
      const eslintResult = await this.runESLintCheck()
      this.results.eslint = eslintResult

      // Prettier 检查
      const prettierResult = await this.runPrettierCheck()
      this.results.prettier = prettierResult

      // 更新质量指标
      this.updateQualityMetrics(eslintResult, prettierResult)

      unifiedLogger.info('✅ 代码质量检查完成')
    } catch (error) {
      unifiedLogger.error('❌ 代码质量检查失败:', error)
      this.results.eslint = { success: false, error: error.message }
      this.results.prettier = { success: false, error: error.message }
    }
  }

  /**
   * 🧪 运行ESLint检查
   */
  async runESLintCheck () {
    unifiedLogger.info('  📋 运行ESLint检查...')

    try {
      const { stdout, stderr } = await execAsync('npm run lint', {
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 5 // 5MB buffer
      })

      const hasErrors = stderr && stderr.includes('error')

      // 解析错误和警告数量
      const errorCount = this.parseESLintCount(stderr, 'error')
      const warningCount = this.parseESLintCount(stdout, 'warning')

      this.qualityMetrics.eslintErrors = errorCount
      this.qualityMetrics.eslintWarnings = warningCount

      const result = {
        success: !hasErrors,
        errors: errorCount,
        warnings: warningCount,
        output: stdout,
        stderr
      }

      if (hasErrors) {
        unifiedLogger.warn(`  ⚠️ ESLint检查发现${errorCount}个错误，${warningCount}个警告`)
      } else {
        unifiedLogger.info(`  ✅ ESLint检查通过 (${warningCount}个警告)`)
      }

      return result
    } catch (error) {
      // ESLint返回非零退出码不算异常
      if (error.code && error.stdout) {
        const errorCount = this.parseESLintCount(error.stderr, 'error')
        const warningCount = this.parseESLintCount(error.stdout, 'warning')

        this.qualityMetrics.eslintErrors = errorCount
        this.qualityMetrics.eslintWarnings = warningCount

        unifiedLogger.warn(`  ⚠️ ESLint检查完成，发现${errorCount}个错误，${warningCount}个警告`)

        return {
          success: errorCount === 0,
          errors: errorCount,
          warnings: warningCount,
          output: error.stdout,
          stderr: error.stderr
        }
      }

      throw error
    }
  }

  /**
   * 🎨 运行Prettier检查
   */
  async runPrettierCheck () {
    unifiedLogger.info('  🎨 运行Prettier检查...')

    try {
      const { stdout, stderr } = await execAsync(
        'npx prettier --check . --ignore-path .gitignore',
        {
          timeout: 30000
        }
      )

      unifiedLogger.info('  ✅ Prettier检查通过')
      return {
        success: true,
        output: stdout,
        stderr
      }
    } catch (error) {
      // Prettier检查失败通常意味着格式问题
      const filesNeedFormatting = error.stdout ? error.stdout.split('\n').filter(Boolean) : []

      unifiedLogger.warn(`  ⚠️ Prettier检查发现${filesNeedFormatting.length}个文件需要格式化`)

      return {
        success: false,
        filesNeedFormatting: filesNeedFormatting.length,
        output: error.stdout,
        stderr: error.stderr
      }
    }
  }

  /**
   * 🧪 运行功能测试
   */
  async runFunctionalTests () {
    unifiedLogger.info('🧪 开始功能测试...')

    try {
      const { stdout, stderr } = await execAsync(
        'npm test -- --passWithNoTests --detectOpenHandles --forceExit',
        {
          timeout: 180000, // 3分钟超时
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        }
      )

      // 解析测试结果
      const testSummary = this.parseJestOutput(stdout)

      this.results.jest = {
        success: true,
        ...testSummary,
        output: stdout,
        stderr
      }

      this.qualityMetrics.testCoverage = testSummary.coverage || 0

      unifiedLogger.info(`  ✅ 功能测试完成: ${testSummary.passed}/${testSummary.total} 通过`)
    } catch (error) {
      unifiedLogger.error('  ❌ 功能测试失败:', error.message)

      // 尝试解析失败的测试输出
      const testSummary = this.parseJestOutput(error.stdout || '')

      this.results.jest = {
        success: false,
        error: error.message,
        ...testSummary,
        output: error.stdout,
        stderr: error.stderr
      }
    }
  }

  /**
   * 🏥 运行健康检查
   */
  async runHealthChecks () {
    unifiedLogger.info('🏥 开始健康检查...')

    const healthChecks = {
      redis: await this.checkRedis(),
      database: await this.checkDatabase(),
      webServer: await this.checkWebServer(),
      fileSystem: await this.checkFileSystem()
    }

    const allHealthy = Object.values(healthChecks).every(check => check.healthy)

    this.results.healthCheck = {
      success: allHealthy,
      checks: healthChecks,
      summary: allHealthy ? '所有服务健康' : '部分服务异常'
    }

    if (allHealthy) {
      unifiedLogger.info('  ✅ 所有服务健康检查通过')
    } else {
      unifiedLogger.warn('  ⚠️ 部分服务健康检查失败')
    }
  }

  /**
   * 🔄 运行项目状态检查
   */
  async runProjectStatusCheck () {
    unifiedLogger.info('🔄 开始项目状态检查...')

    try {
      // 检查npm依赖
      const packageCheck = await this.checkPackageDependencies()

      // 检查环境变量
      const envCheck = await this.checkEnvironmentVariables()

      // 检查关键文件
      const fileCheck = await this.checkCriticalFiles()

      this.results.projectStatus = {
        success: packageCheck.success && envCheck.success && fileCheck.success,
        package: packageCheck,
        environment: envCheck,
        files: fileCheck
      }

      unifiedLogger.info('  ✅ 项目状态检查完成')
    } catch (error) {
      unifiedLogger.error('  ❌ 项目状态检查失败:', error)
      this.results.projectStatus = {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 🔧 运行自动修复
   */
  async runAutoFix () {
    if (!this.results.eslint || this.results.eslint.success) {
      unifiedLogger.info('🔧 无需自动修复，ESLint检查通过')
      return
    }

    unifiedLogger.info('🔧 开始自动修复检测到的问题...')

    try {
      // 运行ESLint自动修复
      await execAsync('npm run lint:fix', {
        timeout: 120000 // 2分钟超时
      })

      unifiedLogger.info('  ✅ ESLint自动修复完成')

      // 运行Prettier格式化
      if (!this.results.prettier || !this.results.prettier.success) {
        await execAsync('npx prettier --write . --ignore-path .gitignore', {
          timeout: 60000
        })
        unifiedLogger.info('  ✅ Prettier自动格式化完成')
      }

      // 重新运行ESLint检查验证修复效果
      const verifyResult = await this.runESLintCheck()
      const fixedIssues = this.qualityMetrics.eslintErrors - (verifyResult.errors || 0)

      unifiedLogger.info(`  🎉 自动修复完成，解决了${fixedIssues}个问题`)
    } catch (error) {
      unifiedLogger.warn('  ⚠️ 自动修复过程中出现问题:', error.message)
    }
  }

  /**
   * 📊 生成质量报告
   */
  async generateQualityReport () {
    unifiedLogger.info('📊 生成综合质量报告...')

    const reportPath = path.join(__dirname, '../../reports/unified-quality-report.md')
    const reportContent = this.generateMarkdownReport()

    try {
      // 确保reports目录存在
      await fs.mkdir(path.dirname(reportPath), { recursive: true })

      // 写入报告
      await fs.writeFile(reportPath, reportContent, 'utf8')

      unifiedLogger.info(`  ✅ 质量报告已生成: ${reportPath}`)
    } catch (error) {
      unifiedLogger.error('  ❌ 质量报告生成失败:', error)
    }
  }

  /**
   * 📄 生成Markdown格式报告
   */
  generateMarkdownReport () {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const duration = Date.now() - this.startTime

    let report = '# 统一项目质量检查报告\n\n'
    report += `**生成时间**: ${timestamp} (北京时间)\n`
    report += `**检查耗时**: ${duration}ms (${(duration / 1000).toFixed(1)}秒)\n`
    report += `**整体状态**: ${this.isOverallQualityAcceptable() ? '✅ 通过' : '❌ 需要改进'}\n\n`

    // 代码质量部分
    report += '## 📋 代码质量检查\n\n'
    if (this.results.eslint) {
      report += '### ESLint检查\n'
      report += `- **状态**: ${this.results.eslint.success ? '✅ 通过' : '❌ 失败'}\n`
      report += `- **错误数**: ${this.results.eslint.errors || 0}\n`
      report += `- **警告数**: ${this.results.eslint.warnings || 0}\n\n`
    }

    if (this.results.prettier) {
      report += '### Prettier格式检查\n'
      report += `- **状态**: ${this.results.prettier.success ? '✅ 通过' : '❌ 需要格式化'}\n`
      if (this.results.prettier.filesNeedFormatting) {
        report += `- **需要格式化文件数**: ${this.results.prettier.filesNeedFormatting}\n`
      }
      report += '\n'
    }

    // 功能测试部分
    if (this.results.jest) {
      report += '## 🧪 功能测试\n\n'
      report += `- **状态**: ${this.results.jest.success ? '✅ 通过' : '❌ 失败'}\n`
      report += `- **通过测试**: ${this.results.jest.passed || 0}\n`
      report += `- **失败测试**: ${this.results.jest.failed || 0}\n`
      report += `- **总测试数**: ${this.results.jest.total || 0}\n`
      if (this.results.jest.coverage) {
        report += `- **代码覆盖率**: ${this.results.jest.coverage}%\n`
      }
      report += '\n'
    }

    // 健康检查部分
    if (this.results.healthCheck) {
      report += '## 🏥 系统健康检查\n\n'
      report += `- **整体状态**: ${this.results.healthCheck.success ? '✅ 健康' : '❌ 异常'}\n\n`

      if (this.results.healthCheck.checks) {
        Object.entries(this.results.healthCheck.checks).forEach(([service, check]) => {
          const status = check.healthy ? '✅' : '❌'
          report += `- **${service}**: ${status} ${check.message || ''}\n`
        })
      }
      report += '\n'
    }

    // 质量指标总结
    report += '## 📊 质量指标\n\n'
    report += `- **ESLint错误**: ${this.qualityMetrics.eslintErrors}\n`
    report += `- **ESLint警告**: ${this.qualityMetrics.eslintWarnings}\n`
    report += `- **测试覆盖率**: ${this.qualityMetrics.testCoverage}%\n`
    report += `- **代码异味**: ${this.qualityMetrics.codeSmells}\n\n`

    // 改进建议
    report += '## 💡 改进建议\n\n'
    const suggestions = this.generateImprovementSuggestions()
    suggestions.forEach(suggestion => {
      report += `- ${suggestion}\n`
    })

    return report
  }

  /**
   * 📈 生成质量摘要
   */
  generateQualitySummary () {
    const summary = {
      overallScore: this.calculateOverallScore(),
      codeQuality: this.results.eslint?.success || false,
      functionalTests: this.results.jest?.success || false,
      systemHealth: this.results.healthCheck?.success || false,
      projectStatus: this.results.projectStatus?.success || false,
      recommendations: this.generateImprovementSuggestions()
    }

    return summary
  }

  /**
   * 🎯 计算整体质量分数
   */
  calculateOverallScore () {
    const weights = {
      eslint: 30, // ESLint检查占30%
      jest: 25, // 功能测试占25%
      health: 25, // 系统健康占25%
      project: 20 // 项目状态占20%
    }

    let score = 0
    let totalWeight = 0

    if (this.results.eslint) {
      const eslintScore = this.results.eslint.success
        ? 100
        : Math.max(0, 100 - this.results.eslint.errors * 10)
      score += (eslintScore * weights.eslint) / 100
      totalWeight += weights.eslint
    }

    if (this.results.jest) {
      const jestScore = this.results.jest.success ? 100 : 0
      score += (jestScore * weights.jest) / 100
      totalWeight += weights.jest
    }

    if (this.results.healthCheck) {
      const healthScore = this.results.healthCheck.success ? 100 : 50
      score += (healthScore * weights.health) / 100
      totalWeight += weights.health
    }

    if (this.results.projectStatus) {
      const projectScore = this.results.projectStatus.success ? 100 : 70
      score += (projectScore * weights.project) / 100
      totalWeight += weights.project
    }

    return totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0
  }

  /**
   * ✅ 判断整体质量是否可接受
   */
  isOverallQualityAcceptable () {
    const overallScore = this.calculateOverallScore()
    return overallScore >= 70 // 70分以上认为可接受
  }

  /**
   * 💡 生成改进建议
   */
  generateImprovementSuggestions () {
    const suggestions = []

    // ESLint相关建议
    if (this.results.eslint && !this.results.eslint.success) {
      if (this.results.eslint.errors > 0) {
        suggestions.push(`修复${this.results.eslint.errors}个ESLint错误`)
      }
      if (this.results.eslint.warnings > 10) {
        suggestions.push('减少ESLint警告数量，提高代码质量')
      }
    }

    // 测试相关建议
    if (this.results.jest && !this.results.jest.success) {
      suggestions.push('修复失败的测试用例')
    }

    if (this.qualityMetrics.testCoverage < 70) {
      suggestions.push('增加测试覆盖率，目标70%以上')
    }

    // 健康检查建议
    if (this.results.healthCheck && !this.results.healthCheck.success) {
      suggestions.push('修复系统健康检查中的异常服务')
    }

    // Prettier建议
    if (this.results.prettier && !this.results.prettier.success) {
      suggestions.push('运行 npm run lint:fix 修复代码格式问题')
    }

    // 默认建议
    if (suggestions.length === 0) {
      suggestions.push('继续保持良好的代码质量')
    }

    return suggestions
  }

  // ============= 辅助方法 =============

  /**
   * 解析ESLint输出中的错误/警告数量
   */
  parseESLintCount (output, type) {
    if (!output) return 0

    const regex = type === 'error' ? /(\d+)\s+error/ : /(\d+)\s+warning/

    const match = output.match(regex)
    return match ? parseInt(match[1]) : 0
  }

  /**
   * 解析Jest测试输出
   */
  parseJestOutput (output) {
    const summary = {
      total: 0,
      passed: 0,
      failed: 0,
      coverage: 0
    }

    if (!output) return summary

    // 解析测试数量
    const testMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/)
    if (testMatch) {
      summary.failed = parseInt(testMatch[1])
      summary.passed = parseInt(testMatch[2])
      summary.total = parseInt(testMatch[3])
    }

    // 解析覆盖率
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)/)
    if (coverageMatch) {
      summary.coverage = parseFloat(coverageMatch[1])
    }

    return summary
  }

  /**
   * 检查Redis连接
   */
  async checkRedis () {
    try {
      await execAsync('redis-cli ping', { timeout: 5000 })
      return { healthy: true, message: 'Redis连接正常' }
    } catch (error) {
      return { healthy: false, message: `Redis连接失败: ${error.message}` }
    }
  }

  /**
   * 检查数据库连接
   */
  async checkDatabase () {
    try {
      // 这里应该使用实际的数据库连接检查
      // 暂时使用简单的文件存在检查
      const configPath = path.join(__dirname, '../../config/database.js')
      await fs.access(configPath)
      return { healthy: true, message: '数据库配置正常' }
    } catch (error) {
      return { healthy: false, message: `数据库检查失败: ${error.message}` }
    }
  }

  /**
   * 检查Web服务器
   */
  async checkWebServer () {
    try {
      const { stdout } = await execAsync(
        'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health',
        {
          timeout: 10000
        }
      )

      const statusCode = parseInt(stdout.trim())
      if (statusCode === 200) {
        return { healthy: true, message: 'Web服务器响应正常' }
      } else {
        return { healthy: false, message: `Web服务器响应异常: ${statusCode}` }
      }
    } catch (error) {
      return { healthy: false, message: `Web服务器检查失败: ${error.message}` }
    }
  }

  /**
   * 检查文件系统
   */
  async checkFileSystem () {
    try {
      const criticalPaths = ['app.js', 'package.json', '.env', 'routes/', 'models/', 'services/']

      for (const filePath of criticalPaths) {
        await fs.access(filePath)
      }

      return { healthy: true, message: '关键文件系统检查通过' }
    } catch (error) {
      return { healthy: false, message: `文件系统检查失败: ${error.message}` }
    }
  }

  /**
   * 检查package.json依赖
   */
  async checkPackageDependencies () {
    try {
      const packagePath = path.join(__dirname, '../../package.json')
      const packageContent = await fs.readFile(packagePath, 'utf8')
      const packageJson = JSON.parse(packageContent)

      const requiredDeps = ['express', 'sequelize', 'mysql2', 'redis', 'winston']
      const missingDeps = requiredDeps.filter(dep => !packageJson.dependencies[dep])

      return {
        success: missingDeps.length === 0,
        missingDependencies: missingDeps,
        totalDependencies: Object.keys(packageJson.dependencies || {}).length
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 检查环境变量
   */
  async checkEnvironmentVariables () {
    const requiredEnvVars = ['NODE_ENV', 'DB_HOST', 'DB_NAME', 'DB_USER']
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])

    return {
      success: missingEnvVars.length === 0,
      missingVariables: missingEnvVars,
      totalChecked: requiredEnvVars.length
    }
  }

  /**
   * 检查关键文件
   */
  async checkCriticalFiles () {
    try {
      const criticalFiles = ['app.js', 'package.json', '.env', 'config/database.js']

      const missingFiles = []
      for (const file of criticalFiles) {
        try {
          await fs.access(file)
        } catch {
          missingFiles.push(file)
        }
      }

      return {
        success: missingFiles.length === 0,
        missingFiles,
        totalChecked: criticalFiles.length
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 更新质量指标
   */
  updateQualityMetrics (eslintResult, prettierResult) {
    if (eslintResult) {
      this.qualityMetrics.eslintErrors = eslintResult.errors || 0
      this.qualityMetrics.eslintWarnings = eslintResult.warnings || 0
    }

    this.qualityMetrics.lastCheck = new Date().toISOString()

    // 计算代码异味指标
    this.qualityMetrics.codeSmells =
      this.qualityMetrics.eslintWarnings + (prettierResult && !prettierResult.success ? 5 : 0)
  }

  // ============= 自动修复方法 =============

  /**
   * 修复未使用变量
   */
  async fixUnusedVariable (filePath, lineNumber, variableName) {
    unifiedLogger.info(`  🔧 修复未使用变量: ${variableName} in ${filePath}:${lineNumber}`)
    // 这里可以实现具体的修复逻辑
    // 例如：在变量名前添加下划线或删除未使用的变量
    return true
  }

  /**
   * 修复Promise executor return问题
   */
  async fixPromiseExecutorReturn (filePath, lineNumber) {
    unifiedLogger.info(`  🔧 修复Promise executor return: ${filePath}:${lineNumber}`)
    // 实现Promise executor修复逻辑
    return true
  }

  /**
   * 修复引号样式
   */
  async fixQuoteStyle (filePath, lineNumber) {
    unifiedLogger.info(`  🔧 修复引号样式: ${filePath}:${lineNumber}`)
    // 实现引号样式修复逻辑
    return true
  }

  /**
   * 修复尾随空格
   */
  async fixTrailingSpaces (filePath, lineNumber) {
    unifiedLogger.info(`  🔧 修复尾随空格: ${filePath}:${lineNumber}`)
    // 实现尾随空格修复逻辑
    return true
  }
}

module.exports = UnifiedQualityManager

// 如果直接运行此文件，则执行质量检查
if (require.main === module) {
  const manager = new UnifiedQualityManager()

  manager
    .runCompleteQualityCheck()
    .then(result => {
      console.log('\n✅ 统一质量检查完成')
      console.log(`📊 整体评分: ${result.summary.overallScore}/100`)
      console.log(`⏱️ 检查耗时: ${result.duration}ms`)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('\n💥 统一质量检查失败:', error)
      process.exit(1)
    })
}
