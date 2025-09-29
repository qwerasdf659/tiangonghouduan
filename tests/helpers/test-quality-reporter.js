/**
 * 测试质量报告器
 * 用于生成测试执行报告和质量分析
 */

class TestQualityReporter {
  constructor (globalConfig, options) {
    this.globalConfig = globalConfig
    this.options = options
    this.qualityIssues = []
    this.testResults = []
  }

  /**
   * Jest报告器接口：测试运行开始
   */
  onRunStart () {
    console.log('🔍 测试质量检查启动...')
    this.qualityIssues = []
  }

  /**
   * Jest报告器接口：测试套件完成
   */
  onTestResult (test, testResult) {
    // 分析测试结果
    this.analyzeTestResult(test, testResult)
  }

  /**
   * Jest报告器接口：所有测试完成
   */
  onRunComplete () {
    this.generateQualityReport()
  }

  /**
   * 分析单个测试结果
   */
  analyzeTestResult (test, testResult) {
    const testFilePath = test.path

    testResult.testResults.forEach(result => {
      // 检查测试名称中的危险模式
      this.checkTestNamePattern(result.title, testFilePath)

      // 检查失败的断言
      if (result.status === 'failed' && result.failureMessages) {
        this.analyzeFailureMessages(result.failureMessages, testFilePath)
      }

      // 检查测试执行时间
      if (result.duration && result.duration > 5000) {
        this.qualityIssues.push({
          type: 'PERFORMANCE',
          level: 'WARNING',
          file: testFilePath,
          test: result.title,
          message: `测试执行时间过长: ${result.duration}ms`,
          suggestion: '检查是否有不必要的等待或网络请求'
        })
      }
    })
  }

  /**
   * 检查测试名称中的危险模式
   */
  checkTestNamePattern (testTitle, filePath) {
    const dangerousPatterns = [
      {
        pattern: /应该.*返回.*basic/i,
        type: 'LOWERED_STANDARD',
        message: '测试标准可能被降低：验证简化策略名而非完整类名'
      },
      {
        pattern: /应该.*completed/i,
        type: 'BUSINESS_SEMANTIC',
        message: '可能使用技术术语而非业务术语'
      },
      {
        pattern: /临时.*测试|hack.*测试|修复.*测试/i,
        type: 'TEMPORARY_FIX',
        message: '发现临时测试，可能掩盖实现问题'
      }
    ]

    dangerousPatterns.forEach(({ pattern, type, message }) => {
      if (pattern.test(testTitle)) {
        this.qualityIssues.push({
          type,
          level: 'WARNING',
          file: filePath,
          test: testTitle,
          message,
          suggestion: this.getSuggestionForType(type)
        })
      }
    })
  }

  /**
   * 分析失败消息
   */
  analyzeFailureMessages (failureMessages, filePath) {
    failureMessages.forEach(message => {
      // 检查是否是因为业务语义不匹配而失败
      if (message.includes('distributed') && message.includes('completed')) {
        this.qualityIssues.push({
          type: 'SEMANTIC_MISMATCH',
          level: 'ERROR',
          file: filePath,
          message: '检测到业务语义不匹配问题',
          suggestion: '使用TestAssertions.validateBusinessSemantics()检查业务术语'
        })
      }

      // 检查是否是API格式不一致
      if (message.includes('success') && message.includes('code')) {
        this.qualityIssues.push({
          type: 'API_FORMAT_INCONSISTENCY',
          level: 'ERROR',
          file: filePath,
          message: 'API响应格式不一致',
          suggestion: '使用TestAssertions.validateApiResponseConsistency()检查格式'
        })
      }
    })
  }

  /**
   * 生成质量报告
   */
  generateQualityReport () {
    if (this.qualityIssues.length === 0) {
      console.log('✅ 测试质量检查通过，未发现问题')
      return
    }

    console.log('\n📋 测试质量检查报告')
    console.log('='.repeat(50))

    // 按严重程度分组
    const issues = this.qualityIssues
    const errors = issues.filter(i => i.level === 'ERROR')
    const warnings = issues.filter(i => i.level === 'WARNING')

    if (errors.length > 0) {
      console.log(`🔴 严重问题 (${errors.length}个):`)
      errors.forEach(issue => {
        console.log(`   ❌ ${issue.type}: ${issue.message}`)
        if (issue.file) console.log(`      文件: ${issue.file}`)
        if (issue.test) console.log(`      测试: ${issue.test}`)
        if (issue.suggestion) console.log(`      建议: ${issue.suggestion}`)
        console.log()
      })
    }

    if (warnings.length > 0) {
      console.log(`⚠️  警告 (${warnings.length}个):`)
      warnings.forEach(issue => {
        console.log(`   ⚠️  ${issue.type}: ${issue.message}`)
        if (issue.file) console.log(`      文件: ${issue.file}`)
        if (issue.test) console.log(`      测试: ${issue.test}`)
        if (issue.suggestion) console.log(`      建议: ${issue.suggestion}`)
        console.log()
      })
    }

    // 总结和建议
    console.log('💡 质量改进建议:')
    console.log('1. 使用 TestAssertions.validateBusinessSemantics() 检查业务术语')
    console.log('2. 使用 TestAssertions.validateApiResponseConsistency() 检查API格式')
    console.log('3. 使用 TestAssertions.validateTestStandards() 检查测试标准')
    console.log('4. 参考 docs/提示词-避免测试适配错误实现.md 获取更多指导')

    console.log('='.repeat(50))
  }

  /**
   * 根据问题类型获取建议
   */
  getSuggestionForType (type) {
    const suggestions = {
      LOWERED_STANDARD: '验证完整的业务对象属性，而不是简化的标识符',
      BUSINESS_SEMANTIC: '检查业务文档，确保使用正确的业务术语',
      TEMPORARY_FIX: '审查测试逻辑，确保测试真实的业务需求',
      PERFORMANCE: '优化测试执行效率，移除不必要的等待',
      SEMANTIC_MISMATCH: '统一业务术语和技术实现',
      API_FORMAT_INCONSISTENCY: '统一API响应格式规范'
    }

    return suggestions[type] || '参考开发质量规范文档'
  }
}

module.exports = TestQualityReporter
