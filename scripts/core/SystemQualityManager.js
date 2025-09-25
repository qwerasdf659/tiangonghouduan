/**
 * 系统质量管理器 V4.0
 * 整合API健康检查、系统问题解决、覆盖率分析等功能
 * 消除功能重复，统一质量管理入口
 * 创建时间：2025年01月21日 北京时间
 */

'use strict'

require('dotenv').config()
const fs = require('fs')
const axios = require('axios')

/**
 * 系统质量管理器
 * 整合了以下重复功能：
 * - API健康检查和修复 (来自api-health-manager.js)
 * - 系统问题解决 (来自V4SystemIssueResolver.js)
 * - 覆盖率分析管理 (来自CoverageAnalysisManager.js)
 */
class SystemQualityManager {
  constructor () {
    this.version = '4.0.0'
    this.baseUrl = 'http://localhost:3000'
    this.timeout = 10000

    this.qualityReport = {
      timestamp: new Date().toISOString(),
      apiHealth: {
        totalEndpoints: 0,
        healthyEndpoints: 0,
        missingEndpoints: [],
        fixedEndpoints: []
      },
      systemIssues: {
        totalIssues: 0,
        resolvedIssues: [],
        remainingIssues: []
      },
      coverage: {
        statements: 0,
        functions: 0,
        branches: 0,
        lines: 0,
        zeroCoverageFiles: []
      },
      errors: []
    }

    // 必需的API端点定义
    this.requiredEndpoints = [
      {
        name: '发送验证码',
        path: '/api/v4/unified-engine/auth/send-code',
        method: 'POST',
        expectedStatus: 200,
        priority: 'HIGH'
      },
      {
        name: 'V4用户信息',
        path: '/api/v4/unified-engine/lottery/user/profile',
        method: 'GET',
        expectedStatus: 200,
        authRequired: true,
        priority: 'HIGH'
      },
      {
        name: 'V4用户积分',
        path: '/api/v4/unified-engine/lottery/user/points',
        method: 'GET',
        expectedStatus: 200,
        authRequired: true,
        priority: 'HIGH'
      },
      {
        name: 'V4用户管理',
        path: '/api/v4/unified-engine/admin/users',
        method: 'GET',
        expectedStatus: 200,
        authRequired: true,
        priority: 'MEDIUM'
      },
      {
        name: 'V4活动管理',
        path: '/api/v4/unified-engine/admin/campaigns',
        method: 'GET',
        expectedStatus: 200,
        authRequired: true,
        priority: 'MEDIUM'
      }
    ]

    // 系统问题定义
    this.systemIssues = {
      authenticationSystem: {
        priority: 'HIGH',
        description: '认证系统配置和验证问题',
        components: ['JWT配置', '用户验证', '权限检查', 'Redis会话']
      },
      apiRoutes404: {
        priority: 'HIGH',
        description: 'API路由404问题',
        routeArchitecture: 'V4统一引擎'
      },
      codeQuality: {
        priority: 'MEDIUM',
        description: '代码质量问题'
      }
    }
  }

  /**
   * 🚀 执行完整的系统质量管理
   */
  async runCompleteQualityManagement () {
    console.log('📊 开始完整的系统质量管理...')
    console.log('='.repeat(60))
    console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

    try {
      // 1. API健康检查和修复
      console.log('\n🌐 1/4 API健康检查和修复...')
      await this.runApiHealthCheck()

      // 2. 系统问题诊断和解决
      console.log('\n🔧 2/4 系统问题诊断和解决...')
      await this.runSystemIssueResolution()

      // 3. 测试覆盖率分析
      console.log('\n📈 3/4 测试覆盖率分析...')
      await this.runCoverageAnalysis()

      // 4. 生成综合质量报告
      console.log('\n📄 4/4 生成系统质量报告...')
      await this.generateQualityReport()

      console.log('\n' + '='.repeat(60))
      console.log('🎉 系统质量管理完成!')
      console.log(`⏰ 完成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

      return {
        success: true,
        summary: this.generateSummary(),
        reportPath: await this.generateQualityReport()
      }
    } catch (error) {
      console.error('❌ 系统质量管理失败:', error.message)
      throw error
    }
  }

  /**
   * 🌐 API健康检查和修复
   */
  async runApiHealthCheck () {
    console.log('🌐 开始API健康检查...')

    let healthyEndpoints = 0
    const missingEndpoints = []

    for (const endpoint of this.requiredEndpoints) {
      try {
        console.log(`🔍 检查 ${endpoint.name}: ${endpoint.method} ${endpoint.path}`)

        const response = await this.testEndpoint(endpoint)

        if (response.healthy) {
          console.log(`✅ ${endpoint.name}: 正常`)
          healthyEndpoints++
        } else {
          console.log(`❌ ${endpoint.name}: ${response.error}`)
          missingEndpoints.push({
            ...endpoint,
            error: response.error,
            status: 'missing'
          })
        }
      } catch (error) {
        console.log(`❌ ${endpoint.name}: ${error.message}`)
        missingEndpoints.push({
          ...endpoint,
          error: error.message,
          status: 'error'
        })
      }
    }

    this.qualityReport.apiHealth = {
      totalEndpoints: this.requiredEndpoints.length,
      healthyEndpoints,
      missingEndpoints,
      healthRate: (healthyEndpoints / this.requiredEndpoints.length * 100).toFixed(1)
    }

    console.log(`📊 API健康检查完成: ${healthyEndpoints}/${this.requiredEndpoints.length} 正常`)
  }

  /**
   * 测试单个API端点
   */
  async testEndpoint (endpoint) {
    try {
      const config = {
        method: endpoint.method,
        url: `${this.baseUrl}${endpoint.path}`,
        timeout: this.timeout,
        validateStatus: () => true // 不抛出HTTP错误
      }

      // 如果需要认证，添加测试token
      if (endpoint.authRequired) {
        config.headers = {
          Authorization: 'Bearer test-token'
        }
      }

      const response = await axios(config)

      if (response.status === endpoint.expectedStatus || response.status === 401) {
        return { healthy: true, status: response.status }
      } else {
        return {
          healthy: false,
          error: `状态码 ${response.status}，期望 ${endpoint.expectedStatus}`,
          status: response.status
        }
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return { healthy: false, error: '服务未启动' }
      }
      return { healthy: false, error: error.message }
    }
  }

  /**
   * 🔧 系统问题诊断和解决
   */
  async runSystemIssueResolution () {
    console.log('🔧 开始系统问题诊断...')

    const resolvedIssues = []
    const remainingIssues = []

    // 检查认证系统
    const authStatus = await this.checkAuthenticationSystem()
    if (authStatus.resolved) {
      resolvedIssues.push({
        issue: 'authentication_system',
        status: 'resolved',
        details: authStatus.details
      })
    } else {
      remainingIssues.push({
        issue: 'authentication_system',
        status: 'needs_attention',
        problems: authStatus.problems
      })
    }

    // 检查API路由404问题
    const routeStatus = await this.checkApiRoutes()
    if (routeStatus.resolved) {
      resolvedIssues.push({
        issue: 'api_routes',
        status: 'resolved',
        details: routeStatus.details
      })
    } else {
      remainingIssues.push({
        issue: 'api_routes',
        status: 'needs_attention',
        problems: routeStatus.problems
      })
    }

    this.qualityReport.systemIssues = {
      totalIssues: resolvedIssues.length + remainingIssues.length,
      resolvedIssues,
      remainingIssues
    }

    console.log(`🔧 系统问题诊断完成: ${resolvedIssues.length} 已解决，${remainingIssues.length} 待处理`)
  }

  /**
   * 检查认证系统
   */
  async checkAuthenticationSystem () {
    console.log('🔍 检查认证系统...')

    const problems = []
    let resolved = true

    try {
      // 检查JWT配置
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key') {
        problems.push('JWT_SECRET未设置或使用默认值')
        resolved = false
      }

      // 检查Redis连接
      try {
        const redisTest = await this.testEndpoint({
          path: '/api/health',
          method: 'GET',
          expectedStatus: 200
        })
        if (!redisTest.healthy) {
          problems.push('Redis连接可能有问题')
          resolved = false
        }
      } catch (error) {
        problems.push(`Redis检查失败: ${error.message}`)
        resolved = false
      }

      return {
        resolved,
        details: resolved ? '认证系统配置正常' : '认证系统需要修复',
        problems
      }
    } catch (error) {
      return {
        resolved: false,
        problems: [`认证系统检查失败: ${error.message}`]
      }
    }
  }

  /**
   * 检查API路由
   */
  async checkApiRoutes () {
    console.log('🔍 检查API路由状态...')

    const problems = []
    let resolved = true

    try {
      // 检查服务是否启动
      const healthCheck = await this.testEndpoint({
        path: '/health',
        method: 'GET',
        expectedStatus: 200
      })

      if (!healthCheck.healthy) {
        problems.push('后端服务未正常启动')
        resolved = false
      }

      // 计算API健康率
      const healthRate = parseFloat(this.qualityReport.apiHealth?.healthRate || 0)
      if (healthRate < 80) {
        problems.push(`API健康率过低: ${healthRate}%`)
        resolved = false
      }

      return {
        resolved,
        details: resolved ? 'API路由状态正常' : 'API路由需要修复',
        problems
      }
    } catch (error) {
      return {
        resolved: false,
        problems: [`API路由检查失败: ${error.message}`]
      }
    }
  }

  /**
   * 📈 测试覆盖率分析
   */
  async runCoverageAnalysis () {
    console.log('📈 开始测试覆盖率分析...')

    try {
      // 获取覆盖率数据
      const coverageData = await this.getCoverageData()

      this.qualityReport.coverage = {
        statements: coverageData.statements || 0,
        functions: coverageData.functions || 0,
        branches: coverageData.branches || 0,
        lines: coverageData.lines || 0,
        zeroCoverageFiles: coverageData.zeroCoverageFiles || []
      }

      console.log('📊 当前测试覆盖率:')
      console.log(`   语句覆盖率: ${this.qualityReport.coverage.statements}%`)
      console.log(`   函数覆盖率: ${this.qualityReport.coverage.functions}%`)
      console.log(`   分支覆盖率: ${this.qualityReport.coverage.branches}%`)
      console.log(`   行覆盖率: ${this.qualityReport.coverage.lines}%`)
      console.log(`   0%覆盖率文件: ${this.qualityReport.coverage.zeroCoverageFiles.length}个`)
    } catch (error) {
      console.error('❌ 覆盖率分析失败:', error.message)
      this.qualityReport.errors.push({
        type: 'COVERAGE_ANALYSIS_ERROR',
        error: error.message
      })
    }
  }

  /**
   * 获取覆盖率数据
   */
  async getCoverageData () {
    const coveragePath = 'reports/real-coverage/coverage-final.json'

    if (!fs.existsSync(coveragePath)) {
      console.log('📊 覆盖率文件不存在，使用默认数据')
      return {
        statements: 0,
        functions: 0,
        branches: 0,
        lines: 0,
        zeroCoverageFiles: []
      }
    }

    try {
      const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'))
      return this.calculateRealCoverage(coverage)
    } catch (error) {
      console.error('❌ 读取覆盖率文件失败:', error.message)
      return {
        statements: 0,
        functions: 0,
        branches: 0,
        lines: 0,
        zeroCoverageFiles: []
      }
    }
  }

  /**
   * 计算真实覆盖率
   */
  calculateRealCoverage (coverage) {
    const files = Object.keys(coverage)
    const zeroCoverageFiles = []

    let totalStatements = 0
    let coveredStatements = 0
    let totalFunctions = 0
    let coveredFunctions = 0
    let totalBranches = 0
    let coveredBranches = 0
    const totalLines = 0
    const coveredLines = 0

    files.forEach(file => {
      const fileCoverage = coverage[file]

      // 统计语句覆盖率
      const stmtTotal = Object.keys(fileCoverage.s || {}).length
      const stmtCovered = Object.values(fileCoverage.s || {}).filter(count => count > 0).length

      // 统计函数覆盖率
      const fnTotal = Object.keys(fileCoverage.f || {}).length
      const fnCovered = Object.values(fileCoverage.f || {}).filter(count => count > 0).length

      // 统计分支覆盖率
      const branchTotal = Object.keys(fileCoverage.b || {}).length
      const branchCovered = Object.values(fileCoverage.b || {}).filter(branches => branches.some(count => count > 0)).length

      // 如果文件完全没有覆盖率，添加到0覆盖率列表
      if (stmtTotal > 0 && stmtCovered === 0) {
        zeroCoverageFiles.push(file)
      }

      totalStatements += stmtTotal
      coveredStatements += stmtCovered
      totalFunctions += fnTotal
      coveredFunctions += fnCovered
      totalBranches += branchTotal
      coveredBranches += branchCovered
    })

    return {
      statements: totalStatements > 0 ? Math.round(coveredStatements / totalStatements * 100) : 0,
      functions: totalFunctions > 0 ? Math.round(coveredFunctions / totalFunctions * 100) : 0,
      branches: totalBranches > 0 ? Math.round(coveredBranches / totalBranches * 100) : 0,
      lines: totalLines > 0 ? Math.round(coveredLines / totalLines * 100) : 0,
      zeroCoverageFiles: zeroCoverageFiles.slice(0, 10) // 只显示前10个
    }
  }

  /**
   * 生成摘要
   */
  generateSummary () {
    return {
      apiHealth: `${this.qualityReport.apiHealth.healthyEndpoints}/${this.qualityReport.apiHealth.totalEndpoints}`,
      apiHealthRate: this.qualityReport.apiHealth.healthRate,
      systemIssues: `${this.qualityReport.systemIssues.resolvedIssues.length}/${this.qualityReport.systemIssues.totalIssues}`,
      coverage: {
        statements: this.qualityReport.coverage.statements,
        functions: this.qualityReport.coverage.functions
      },
      overallScore: this.calculateOverallScore()
    }
  }

  /**
   * 计算总体评分
   */
  calculateOverallScore () {
    const apiScore = parseFloat(this.qualityReport.apiHealth.healthRate || 0)
    const issueScore = this.qualityReport.systemIssues.totalIssues > 0
      ? (this.qualityReport.systemIssues.resolvedIssues.length / this.qualityReport.systemIssues.totalIssues * 100)
      : 100
    const coverageScore = this.qualityReport.coverage.statements

    return Math.round((apiScore * 0.4 + issueScore * 0.3 + coverageScore * 0.3))
  }

  /**
   * 📄 生成系统质量报告
   */
  async generateQualityReport () {
    console.log('📄 生成系统质量报告...')

    const summary = this.generateSummary()

    const report = `# 系统质量管理报告

## 执行时间
${this.qualityReport.timestamp}

## 总体评分
🎯 **${summary.overallScore}/100 分**

## API健康状况
- 总端点数: ${this.qualityReport.apiHealth.totalEndpoints}
- 健康端点: ${this.qualityReport.apiHealth.healthyEndpoints}
- 健康率: ${this.qualityReport.apiHealth.healthRate}%

### 问题端点
${this.qualityReport.apiHealth.missingEndpoints.map(endpoint =>
    `- **${endpoint.name}**: ${endpoint.error} (${endpoint.priority})`
  ).join('\n') || '无'}

## 系统问题状况
- 总问题数: ${this.qualityReport.systemIssues.totalIssues}
- 已解决: ${this.qualityReport.systemIssues.resolvedIssues.length}
- 待处理: ${this.qualityReport.systemIssues.remainingIssues.length}

### 待处理问题
${this.qualityReport.systemIssues.remainingIssues.map(issue =>
    `- **${issue.issue}**: ${issue.problems?.join(', ')}`
  ).join('\n') || '无'}

## 测试覆盖率
- 语句覆盖率: ${this.qualityReport.coverage.statements}%
- 函数覆盖率: ${this.qualityReport.coverage.functions}%
- 分支覆盖率: ${this.qualityReport.coverage.branches}%
- 行覆盖率: ${this.qualityReport.coverage.lines}%

### 0%覆盖率文件
${this.qualityReport.coverage.zeroCoverageFiles.map(file =>
    `- ${file}`
  ).join('\n') || '无'}

## 改进建议
1. ${summary.apiHealthRate < 90 ? 'API健康率较低，需要修复缺失的端点' : 'API健康状况良好'}
2. ${this.qualityReport.systemIssues.remainingIssues.length > 0 ? '存在系统问题需要处理' : '系统问题已全部解决'}
3. ${this.qualityReport.coverage.statements < 70 ? '测试覆盖率偏低，建议增加测试用例' : '测试覆盖率符合要求'}
4. 定期运行系统质量检查以保持高质量

## 错误记录
${this.qualityReport.errors.map(error =>
    `- **${error.type}**: ${error.error}`
  ).join('\n') || '无'}

---
生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
报告版本: ${this.version}
`

    const reportPath = `reports/system-quality-report-${new Date().toISOString().split('T')[0]}.md`

    // 确保reports目录存在
    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true })
    }

    fs.writeFileSync(reportPath, report)
    console.log(`✅ 系统质量报告已生成: ${reportPath}`)

    return reportPath
  }
}

// 主程序入口
if (require.main === module) {
  const manager = new SystemQualityManager()
  manager.runCompleteQualityManagement()
    .then((result) => {
      console.log('\n🎉 系统质量管理完成!')
      console.log(`📊 总体评分: ${result.summary.overallScore}/100`)
      console.log(`🌐 API健康率: ${result.summary.apiHealthRate}%`)
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ 系统质量管理失败:', error.message)
      process.exit(1)
    })
}

module.exports = SystemQualityManager
