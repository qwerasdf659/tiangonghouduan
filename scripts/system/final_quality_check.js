#!/usr/bin/env node
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 最终项目质量检查脚本
 *
 * @description 执行完整的项目质量检查，包括代码质量、功能测试、健康状态等
 * @version 4.0.0
 * @date 2025-09-27
 */

require('dotenv').config()
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)
const axios = require('axios')

class FinalQualityChecker {
  constructor () {
    this.results = {
      codeQuality: null,
      apiHealth: null,
      databaseHealth: null,
      serviceHealth: null,
      securityCheck: null,
      performanceCheck: null
    }
    this.startTime = Date.now()
  }

  // 运行所有质量检查
  async runAllChecks () {
    console.log('�� === 开始最终项目质量检查 ===')
    console.log(`📅 开始时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log('')

    try {
      // 1. 代码质量检查
      await this.checkCodeQuality()

      // 2. API健康检查
      await this.checkAPIHealth()

      // 3. 数据库健康检查
      await this.checkDatabaseHealth()

      // 4. 服务健康检查
      await this.checkServiceHealth()

      // 5. 安全检查
      await this.checkSecurity()

      // 6. 性能检查
      await this.checkPerformance()

      // 生成最终报告
      this.generateFinalReport()
    } catch (error) {
      console.error('💥 质量检查失败:', error.message)
      throw error
    }
  }

  // 1. 代码质量检查
  async checkCodeQuality () {
    console.log('📋 === 代码质量检查 ===')

    try {
      // ESLint检查
      console.log('🔍 运行ESLint检查...')
      const lintResult = await execAsync('npm run lint 2>&1 || true')

      // Prettier检查
      console.log('🎨 检查代码格式...')
      const prettierResult = await execAsync('npx prettier --check . 2>&1 || true')

      this.results.codeQuality = {
        eslint: {
          success: !lintResult.stderr && !lintResult.stdout.includes('error'),
          output: lintResult.stdout.substring(0, 500)
        },
        prettier: {
          success: !prettierResult.stderr,
          output: prettierResult.stdout.substring(0, 200)
        }
      }

      console.log(`✅ ESLint: ${this.results.codeQuality.eslint.success ? '通过' : '有问题'}`)
      console.log(`✅ Prettier: ${this.results.codeQuality.prettier.success ? '通过' : '有问题'}`)
    } catch (error) {
      console.error('❌ 代码质量检查失败:', error.message)
      this.results.codeQuality = { error: error.message }
    }

    console.log('')
  }

  // 2. API健康检查
  async checkAPIHealth () {
    console.log('�� === API健康检查 ===')

    const endpoints = [
      { name: '健康检查', url: 'http://localhost:3000/health', method: 'GET' },
      { name: 'V4基础', url: 'http://localhost:3000/api/v4', method: 'GET' },
      { name: '认证登录', url: 'http://localhost:3000/api/v4/unified-engine/auth/login', method: 'POST', data: { mobile: '13612227930', verification_code: '123456' } }
    ]

    const results = []

    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now()
        const config = {
          method: endpoint.method,
          url: endpoint.url,
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' }
        }

        if (endpoint.data) {
          config.data = endpoint.data
        }

        const response = await axios(config)
        const responseTime = Date.now() - startTime

        results.push({
          name: endpoint.name,
          success: true,
          status: response.status,
          responseTime,
          data: response.data
        })

        console.log(`✅ ${endpoint.name}: ${response.status} (${responseTime}ms)`)
      } catch (error) {
        results.push({
          name: endpoint.name,
          success: false,
          error: error.message,
          status: error.response?.status || 'timeout'
        })

        console.log(`❌ ${endpoint.name}: ${error.message}`)
      }
    }

    this.results.apiHealth = results
    console.log('')
  }

  // 3. 数据库健康检查
  async checkDatabaseHealth () {
    console.log('��️ === 数据库健康检查 ===')

    try {
      const dbCheck = await execAsync('node scripts/database_check.js 2>&1')

      this.results.databaseHealth = {
        success: !dbCheck.stderr && dbCheck.stdout.includes('✅'),
        output: dbCheck.stdout.substring(0, 1000)
      }

      console.log(`✅ 数据库连接: ${this.results.databaseHealth.success ? '正常' : '异常'}`)
    } catch (error) {
      console.error('❌ 数据库检查失败:', error.message)
      this.results.databaseHealth = { error: error.message }
    }

    console.log('')
  }

  // 4. 服务健康检查
  async checkServiceHealth () {
    console.log('⚙️ === 服务健康检查 ===')

    try {
      // 检查PM2状态
      const pm2Status = await execAsync('npm run pm:status 2>&1')

      // 检查端口占用
      const portCheck = await execAsync('netstat -tlnp | grep :3000 2>&1 || echo "端口未监听"')

      // 检查Redis
      const redisCheck = await execAsync('redis-cli ping 2>&1 || echo "Redis未连接"')

      this.results.serviceHealth = {
        pm2: pm2Status.stdout.includes('online'),
        port: portCheck.stdout.includes('3000'),
        redis: redisCheck.stdout.includes('PONG')
      }

      console.log(`✅ PM2服务: ${this.results.serviceHealth.pm2 ? '运行中' : '异常'}`)
      console.log(`✅ 端口3000: ${this.results.serviceHealth.port ? '监听中' : '未监听'}`)
      console.log(`✅ Redis: ${this.results.serviceHealth.redis ? '连接正常' : '连接异常'}`)
    } catch (error) {
      console.error('❌ 服务检查失败:', error.message)
      this.results.serviceHealth = { error: error.message }
    }

    console.log('')
  }

  // 5. 安全检查
  async checkSecurity () {
    console.log('🔒 === 安全检查 ===')

    try {
      // 检查环境变量
      const envVars = ['DB_PASSWORD', 'JWT_SECRET', 'SEALOS_ACCESS_KEY']
      const envCheck = envVars.map(varName => ({
        name: varName,
        exists: !!process.env[varName],
        hasValue: !!(process.env[varName] && process.env[varName].length > 0)
      }))

      // 检查敏感文件权限
      const fileCheck = await execAsync('ls -la .env* 2>&1 || echo "无.env文件"')

      this.results.securityCheck = {
        envVars: envCheck,
        filePermissions: fileCheck.stdout
      }

      envCheck.forEach(env => {
        console.log(`${env.hasValue ? '✅' : '❌'} ${env.name}: ${env.hasValue ? '已设置' : '未设置'}`)
      })
    } catch (error) {
      console.error('❌ 安全检查失败:', error.message)
      this.results.securityCheck = { error: error.message }
    }

    console.log('')
  }

  // 6. 性能检查
  async checkPerformance () {
    console.log('⚡ === 性能检查 ===')

    try {
      // 检查内存使用
      const memCheck = await execAsync('free -h 2>&1')

      // 检查磁盘使用
      const diskCheck = await execAsync('df -h . 2>&1')

      // 检查进程资源使用
      const processCheck = await execAsync('ps aux | grep "node.*app.js" | grep -v grep 2>&1 || echo "进程未找到"')

      this.results.performanceCheck = {
        memory: memCheck.stdout,
        disk: diskCheck.stdout,
        process: processCheck.stdout
      }

      console.log('✅ 系统资源检查完成')
      console.log('✅ 进程资源检查完成')
    } catch (error) {
      console.error('❌ 性能检查失败:', error.message)
      this.results.performanceCheck = { error: error.message }
    }

    console.log('')
  }

  // 生成最终报告
  generateFinalReport () {
    const endTime = Date.now()
    const duration = Math.round((endTime - this.startTime) / 1000)

    console.log('�� === 最终质量检查报告 ===')
    console.log(`📅 完成时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log(`⏱️ 检查耗时: ${duration}秒`)
    console.log('')

    // 计算总体评分
    let totalScore = 0
    let maxScore = 0

    // 代码质量评分 (20分)
    maxScore += 20
    if (this.results.codeQuality?.eslint?.success) totalScore += 10
    if (this.results.codeQuality?.prettier?.success) totalScore += 10

    // API健康评分 (25分)
    maxScore += 25
    const successfulAPIs = this.results.apiHealth?.filter(api => api.success).length || 0
    const totalAPIs = this.results.apiHealth?.length || 1
    totalScore += Math.round((successfulAPIs / totalAPIs) * 25)

    // 数据库健康评分 (20分)
    maxScore += 20
    if (this.results.databaseHealth?.success) totalScore += 20

    // 服务健康评分 (20分)
    maxScore += 20
    const serviceHealth = this.results.serviceHealth
    if (serviceHealth?.pm2) totalScore += 7
    if (serviceHealth?.port) totalScore += 7
    if (serviceHealth?.redis) totalScore += 6

    // 安全检查评分 (15分)
    maxScore += 15
    const secureEnvVars = this.results.securityCheck?.envVars?.filter(env => env.hasValue).length || 0
    const totalEnvVars = this.results.securityCheck?.envVars?.length || 1
    totalScore += Math.round((secureEnvVars / totalEnvVars) * 15)

    const scorePercentage = Math.round((totalScore / maxScore) * 100)

    console.log(`�� 总体评分: ${totalScore}/${maxScore} (${scorePercentage}%)`)

    // 评级
    let grade = 'F'
    if (scorePercentage >= 90) grade = 'A'
    else if (scorePercentage >= 80) grade = 'B'
    else if (scorePercentage >= 70) grade = 'C'
    else if (scorePercentage >= 60) grade = 'D'

    console.log(`📈 质量等级: ${grade}`)

    // 详细结果
    console.log('')
    console.log('📋 详细检查结果:')
    console.log(`  📋 代码质量: ${this.results.codeQuality?.eslint?.success && this.results.codeQuality?.prettier?.success ? '✅ 通过' : '❌ 需要改进'}`)
    console.log(`  🌐 API健康: ${successfulAPIs}/${totalAPIs} 端点正常`)
    console.log(`  🗄️ 数据库: ${this.results.databaseHealth?.success ? '✅ 正常' : '❌ 异常'}`)
    console.log(`  ⚙️ 服务状态: PM2:${serviceHealth?.pm2 ? '✅' : '❌'} 端口:${serviceHealth?.port ? '✅' : '❌'} Redis:${serviceHealth?.redis ? '✅' : '❌'}`)
    console.log(`  🔒 安全配置: ${secureEnvVars}/${totalEnvVars} 环境变量已配置`)

    // 改进建议
    console.log('')
    console.log('💡 改进建议:')

    if (!this.results.codeQuality?.eslint?.success) {
      console.log('  - 修复ESLint代码质量问题')
    }

    if (!this.results.codeQuality?.prettier?.success) {
      console.log('  - 统一代码格式化')
    }

    if (successfulAPIs < totalAPIs) {
      console.log('  - 修复API端点问题')
    }

    if (!this.results.databaseHealth?.success) {
      console.log('  - 检查数据库连接和配置')
    }

    if (!serviceHealth?.pm2 || !serviceHealth?.port || !serviceHealth?.redis) {
      console.log('  - 检查服务运行状态')
    }

    if (secureEnvVars < totalEnvVars) {
      console.log('  - 配置缺失的环境变量')
    }

    console.log('')
    console.log(`${scorePercentage >= 80 ? '��' : '⚠️'} 项目质量检查完成！`)

    return {
      score: totalScore,
      maxScore,
      percentage: scorePercentage,
      grade,
      duration
    }
  }
}

// 如果直接运行此文件，执行质量检查
if (require.main === module) {
  const checker = new FinalQualityChecker()
  checker.runAllChecks()
    .then(result => {
      process.exit(result?.percentage >= 70 ? 0 : 1)
    })
    .catch(error => {
      console.error('💥 质量检查失败:', error)
      process.exit(1)
    })
}

module.exports = FinalQualityChecker
