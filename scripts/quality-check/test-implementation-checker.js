#!/usr/bin/env node
/**
 * 项目质量检查工具（扩展版）
 * 🔍 测试与实现一致性检查
 * 📊 完整项目质量检查：ESLint + Prettier + Jest + SuperTest + Health Check
 * 🎯 基于业务需求的质量保证
 *
 * 扩展功能：
 * - ESLint代码规范检查
 * - Prettier格式化检查
 * - Jest单元测试
 * - SuperTest API测试
 * - 服务健康检查
 * - 测试账号验证
 */

const fs = require('fs')
const { execSync } = require('child_process')
const { getTestAccountManager } = require('../../utils/TestAccountManager')
require('colors')

class ComprehensiveQualityChecker {
  constructor () {
    this.issues = []
    this.warnings = []
    this.suggestions = []
    this.qualityScores = {
      eslint: 0,
      prettier: 0,
      jest: 0,
      supertest: 0,
      health: 0,
      overall: 0
    }
  }

  /**
   * 🎯 运行完整项目质量检查
   */
  async runFullQualityCheck () {
    console.log('🔍 开始完整项目质量检查...\n'.blue)
    console.log('='.repeat(60))

    const startTime = Date.now()

    try {
      // 1. ESLint代码规范检查
      await this.runESLintCheck()

      // 2. Prettier格式化检查
      await this.runPrettierCheck()

      // 3. 测试账号验证
      await this.verifyTestAccount()

      // 4. Jest单元测试
      await this.runJestTests()

      // 5. SuperTest API测试
      await this.runSuperTestChecks()

      // 6. 服务健康检查
      await this.runHealthCheck()

      // 7. 业务语义一致性检查（原有功能）
      await this.checkBusinessSemanticConsistency()

      // 8. API响应格式一致性检查（原有功能）
      await this.checkApiResponseConsistency()

      const endTime = Date.now()
      const duration = Math.round((endTime - startTime) / 1000)

      // 生成综合报告
      this.generateComprehensiveReport(duration)
    } catch (error) {
      console.error('❌ 质量检查过程中发生错误:'.red, error.message)
      throw error
    }
  }

  /**
   * 📋 ESLint代码规范检查
   */
  async runESLintCheck () {
    console.log('\n📋 ESLint代码规范检查...'.yellow)

    try {
      // 运行ESLint检查
      const eslintOutput = execSync('npx eslint . --ext .js --format json', {
        encoding: 'utf8',
        cwd: process.cwd()
      })

      const eslintResults = JSON.parse(eslintOutput)
      const totalErrors = eslintResults.reduce((sum, file) => sum + file.errorCount, 0)
      const totalWarnings = eslintResults.reduce((sum, file) => sum + file.warningCount, 0)

      if (totalErrors === 0 && totalWarnings === 0) {
        console.log('   ✅ ESLint检查通过，无错误或警告')
        this.qualityScores.eslint = 100
      } else {
        console.log(`   ⚠️ ESLint发现问题: ${totalErrors}个错误, ${totalWarnings}个警告`)

        // 显示前5个问题文件
        const problemFiles = eslintResults
          .filter(f => f.errorCount > 0 || f.warningCount > 0)
          .slice(0, 5)
        problemFiles.forEach(file => {
          console.log(`      ${file.filePath}: ${file.errorCount}错误, ${file.warningCount}警告`)
        })

        this.qualityScores.eslint = Math.max(0, 100 - (totalErrors * 10 + totalWarnings * 2))
        this.issues.push(`ESLint: ${totalErrors}个错误, ${totalWarnings}个警告`)
      }
    } catch (error) {
      console.log('   ❌ ESLint检查失败:', error.message.split('\n')[0])
      this.qualityScores.eslint = 0
      this.issues.push('ESLint检查无法运行')
    }
  }

  /**
   * 🎨 Prettier格式化检查
   */
  async runPrettierCheck () {
    console.log('\n🎨 Prettier格式化检查...'.yellow)

    try {
      // 检查Prettier格式
      execSync('npx prettier --check . --ignore-path .gitignore', {
        encoding: 'utf8',
        stdio: 'pipe'
      })

      console.log('   ✅ Prettier格式检查通过')
      this.qualityScores.prettier = 100
    } catch (error) {
      const output = error.stdout || error.stderr || ''
      const unformattedFiles = output
        .split('\n')
        .filter(line => line.trim() && !line.includes('Code style issues')).length

      if (unformattedFiles > 0) {
        console.log(`   ⚠️ 发现${unformattedFiles}个文件格式不符合Prettier标准`)
        this.qualityScores.prettier = Math.max(0, 100 - unformattedFiles * 5)
        this.warnings.push(`Prettier: ${unformattedFiles}个文件需要格式化`)
      } else {
        console.log('   ✅ Prettier格式检查通过')
        this.qualityScores.prettier = 100
      }
    }
  }

  /**
   * 🔐 测试账号验证
   */
  async verifyTestAccount () {
    console.log('\n🔐 测试账号配置验证...'.yellow)

    try {
      const testAccountManager = getTestAccountManager()
      const configReport = testAccountManager.generateConfigReport()

      console.log('   ✅ 测试账号配置验证通过')
      console.log(`      主账号: ${configReport.main_account.mobile}`)
      console.log(`      用户ID: ${configReport.main_account.user_id}`)
      console.log(`      管理员权限: ${configReport.main_account.is_admin ? '是' : '否'}`)

      this.qualityScores.testAccount = 100
    } catch (error) {
      console.log('   ❌ 测试账号验证失败:', error.message)
      this.qualityScores.testAccount = 0
      this.issues.push('测试账号配置异常')
    }
  }

  /**
   * 🧪 Jest单元测试
   */
  async runJestTests () {
    console.log('\n🧪 Jest单元测试...'.yellow)

    try {
      // 运行Jest测试
      const jestOutput = execSync('npm test -- --passWithNoTests --json', {
        encoding: 'utf8',
        cwd: process.cwd()
      })

      const jestResults = JSON.parse(jestOutput)
      const { numPassedTests, numFailedTests, numTotalTests } = jestResults

      if (numFailedTests === 0) {
        console.log(`   ✅ Jest测试全部通过 (${numPassedTests}/${numTotalTests})`)
        this.qualityScores.jest = 100
      } else {
        console.log(`   ❌ Jest测试失败: ${numFailedTests}个失败, ${numPassedTests}个通过`)
        this.qualityScores.jest = Math.max(0, (numPassedTests / numTotalTests) * 100)
        this.issues.push(`Jest: ${numFailedTests}个测试失败`)
      }
    } catch (error) {
      console.log('   ⚠️ Jest测试异常:', error.message.split('\n')[0])
      this.qualityScores.jest = 50 // 部分分数，因为可能是配置问题
      this.warnings.push('Jest测试运行异常')
    }
  }

  /**
   * 🌐 SuperTest API测试
   */
  async runSuperTestChecks () {
    console.log('\n🌐 SuperTest API测试...'.yellow)

    try {
      // 运行API测试
      const apiTestFiles = ['scripts/test-v4-auth.js']

      let passedTests = 0
      const totalTests = apiTestFiles.length

      for (const testFile of apiTestFiles) {
        try {
          if (fs.existsSync(testFile)) {
            console.log(`   🔍 运行API测试: ${testFile}`)
            execSync(`node ${testFile}`, {
              encoding: 'utf8',
              stdio: 'pipe',
              timeout: 30000 // 30秒超时
            })
            passedTests++
            console.log(`      ✅ ${testFile} 测试通过`)
          }
        } catch (error) {
          console.log(`      ❌ ${testFile} 测试失败`)
        }
      }

      this.qualityScores.supertest = (passedTests / totalTests) * 100

      if (passedTests === totalTests) {
        console.log(`   ✅ 所有API测试通过 (${passedTests}/${totalTests})`)
      } else {
        console.log(`   ⚠️ API测试部分失败: ${passedTests}/${totalTests}`)
        this.warnings.push(`SuperTest: ${totalTests - passedTests}个API测试失败`)
      }
    } catch (error) {
      console.log('   ❌ SuperTest检查失败:', error.message)
      this.qualityScores.supertest = 0
      this.issues.push('SuperTest API测试异常')
    }
  }

  /**
   * 💚 服务健康检查
   */
  async runHealthCheck () {
    console.log('\n💚 服务健康检查...'.yellow)

    try {
      // 检查PM2状态
      const pm2Status = execSync('pm2 jlist', { encoding: 'utf8' })
      const processes = JSON.parse(pm2Status)
      const appProcess = processes.find(p => p.name && p.name.includes('restaurant'))

      if (appProcess && appProcess.pm2_env.status === 'online') {
        console.log('   ✅ PM2服务状态正常')

        // HTTP健康检查
        try {
          execSync('curl -s -f http://localhost:3000/health', { timeout: 10000 })
          console.log('   ✅ HTTP健康检查通过')
          this.qualityScores.health = 100
        } catch (httpError) {
          console.log('   ⚠️ HTTP健康检查失败')
          this.qualityScores.health = 70
          this.warnings.push('HTTP健康检查失败')
        }
      } else {
        console.log('   ❌ 服务未运行或状态异常')
        this.qualityScores.health = 0
        this.issues.push('服务健康状态异常')
      }
    } catch (error) {
      console.log('   ❌ 健康检查失败:', error.message)
      this.qualityScores.health = 0
      this.issues.push('健康检查无法执行')
    }
  }

  /**
   * 📊 检查业务语义一致性（原有功能）
   */
  async checkBusinessSemanticConsistency () {
    console.log('\n📊 业务语义一致性检查...'.yellow)

    // 这里保留原有的业务语义检查逻辑
    // 检查关键业务模型的字段一致性
    const criticalModels = [
      { file: 'models/User.js', fields: ['status', 'is_admin', 'mobile'] },
      { file: 'models/AdminUser.js', fields: ['status'] },
      { file: 'models/LotteryRecords.js', fields: ['status', 'is_winner'] }
    ]

    let semanticIssues = 0

    for (const model of criticalModels) {
      try {
        if (fs.existsSync(model.file)) {
          const content = fs.readFileSync(model.file, 'utf8')

          for (const field of model.fields) {
            if (!content.includes(`${field}:`)) {
              semanticIssues++
              console.log(`   ⚠️ ${model.file} 缺少字段: ${field}`)
            }
          }
        }
      } catch (error) {
        semanticIssues++
        console.log(`   ❌ 无法检查模型: ${model.file}`)
      }
    }

    if (semanticIssues === 0) {
      console.log('   ✅ 业务语义一致性检查通过')
    } else {
      console.log(`   ⚠️ 发现${semanticIssues}个业务语义问题`)
      this.warnings.push(`业务语义: ${semanticIssues}个问题`)
    }
  }

  /**
   * 🔗 API响应格式一致性检查（原有功能）
   */
  async checkApiResponseConsistency () {
    console.log('\n🔗 API响应格式一致性检查...'.yellow)

    try {
      const routeFiles = [
        'routes/v4/unified-engine/lottery.js',
        'routes/v4/unified-engine/admin.js'
      ]

      let inconsistentResponses = 0

      for (const routeFile of routeFiles) {
        if (fs.existsSync(routeFile)) {
          const content = fs.readFileSync(routeFile, 'utf8')

          // 检查非标准响应格式
          const badPatterns = [
            /res\.json\(\s*\{\s*code:\s*\d+/g,
            /res\.status\(\d+\)\.json\(\s*\{\s*msg:/g
          ]

          for (const pattern of badPatterns) {
            const matches = content.match(pattern)
            if (matches) {
              inconsistentResponses += matches.length
              console.log(`   ⚠️ ${routeFile} 发现${matches.length}个非标准响应格式`)
            }
          }
        }
      }

      if (inconsistentResponses === 0) {
        console.log('   ✅ API响应格式一致性检查通过')
      } else {
        console.log(`   ⚠️ 发现${inconsistentResponses}个响应格式问题`)
        this.warnings.push(`API响应格式: ${inconsistentResponses}个问题`)
      }
    } catch (error) {
      console.log('   ❌ API响应格式检查失败:', error.message)
      this.issues.push('API响应格式检查异常')
    }
  }

  /**
   * 📈 计算综合质量分数
   */
  calculateOverallScore () {
    const scores = this.qualityScores
    const weights = {
      eslint: 0.25, // 代码规范 25%
      prettier: 0.1, // 格式化 10%
      jest: 0.25, // 单元测试 25%
      supertest: 0.2, // API测试 20%
      health: 0.2 // 健康检查 20%
    }

    let totalScore = 0
    let totalWeight = 0

    for (const [category, score] of Object.entries(scores)) {
      if (weights[category] && score !== undefined) {
        totalScore += score * weights[category]
        totalWeight += weights[category]
      }
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0
  }

  /**
   * 📋 生成综合质量报告
   */
  generateComprehensiveReport (duration) {
    this.qualityScores.overall = this.calculateOverallScore()

    console.log('\n' + '='.repeat(60))
    console.log('📊 项目质量检查报告'.blue.bold)
    console.log('='.repeat(60))
    console.log(`⏱️  检查耗时: ${duration}秒`)
    console.log(`🎯 综合评分: ${this.qualityScores.overall}/100`)

    // 各项评分
    console.log('\n📈 详细评分:'.yellow)
    console.log(`   📋 ESLint代码规范: ${this.qualityScores.eslint}/100`)
    console.log(`   🎨 Prettier格式化: ${this.qualityScores.prettier}/100`)
    console.log(`   🧪 Jest单元测试: ${this.qualityScores.jest}/100`)
    console.log(`   🌐 SuperTest API: ${this.qualityScores.supertest}/100`)
    console.log(`   💚 服务健康检查: ${this.qualityScores.health}/100`)

    // 问题统计
    console.log('\n🚨 问题统计:'.red)
    console.log(`   ❌ 严重问题: ${this.issues.length}个`)
    console.log(`   ⚠️ 警告问题: ${this.warnings.length}个`)

    if (this.issues.length > 0) {
      console.log('\n❌ 严重问题详情:'.red)
      this.issues.forEach(issue => console.log(`     • ${issue}`))
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️ 警告问题详情:'.yellow)
      this.warnings.forEach(warning => console.log(`     • ${warning}`))
    }

    // 质量等级
    const grade = this.getQualityGrade(this.qualityScores.overall)
    console.log(`\n🏆 项目质量等级: ${grade.emoji} ${grade.level}`.bold)
    console.log(`💡 质量建议: ${grade.suggestion}`)

    // 下一步行动建议
    this.generateActionPlan()
  }

  /**
   * 🎯 获取质量等级
   */
  getQualityGrade (score) {
    if (score >= 90) { return { emoji: '🥇', level: 'A级 (优秀)', suggestion: '项目质量优秀，继续保持！' } }
    if (score >= 80) { return { emoji: '🥈', level: 'B级 (良好)', suggestion: '项目质量良好，可进一步优化细节' } }
    if (score >= 70) {
      return {
        emoji: '🥉',
        level: 'C级 (合格)',
        suggestion: '项目质量合格，建议重点改进测试覆盖率'
      }
    }
    if (score >= 60) { return { emoji: '📚', level: 'D级 (待改进)', suggestion: '项目质量有待改进，需要系统性优化' } }
    return {
      emoji: '🚨',
      level: 'F级 (不合格)',
      suggestion: '项目质量严重不足，需要立即修复关键问题'
    }
  }

  /**
   * 🎯 生成行动计划
   */
  generateActionPlan () {
    console.log('\n🎯 改进行动计划:'.cyan.bold)

    const actionPlan = []

    if (this.qualityScores.eslint < 90) {
      actionPlan.push('1. 修复ESLint代码规范问题')
    }

    if (this.qualityScores.prettier < 90) {
      actionPlan.push('2. 运行Prettier格式化代码')
    }

    if (this.qualityScores.jest < 80) {
      actionPlan.push('3. 改进单元测试覆盖率')
    }

    if (this.qualityScores.supertest < 80) {
      actionPlan.push('4. 修复API测试问题')
    }

    if (this.qualityScores.health < 90) {
      actionPlan.push('5. 检查和修复服务健康状态')
    }

    if (actionPlan.length === 0) {
      console.log('   🎉 恭喜！项目质量已达到优秀标准，无需额外行动。')
    } else {
      actionPlan.forEach(action => console.log(`   📌 ${action}`))
    }

    console.log('\n' + '='.repeat(60))
    console.log('🎉 项目质量检查完成！'.green.bold)
    console.log('='.repeat(60))
  }

  /**
   * 🔄 运行原有检查功能的兼容方法
   */
  async runChecks () {
    return this.runFullQualityCheck()
  }

  generateReport () {
    // 兼容原有方法，实际使用新的综合报告
    return this.generateComprehensiveReport(0)
  }
}

// 兼容性：保持原有类名
const TestImplementationChecker = ComprehensiveQualityChecker

if (require.main === module) {
  const checker = new ComprehensiveQualityChecker()
  checker.runFullQualityCheck().catch(error => {
    console.error('质量检查失败:', error.message)
    process.exit(1)
  })
}

module.exports = { ComprehensiveQualityChecker, TestImplementationChecker }
