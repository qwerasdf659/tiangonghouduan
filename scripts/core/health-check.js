/**
 * 系统健康检查脚本
 * 检查数据库、Redis、服务启动状态等
 * 支持北京时间显示
 */

const { sequelize } = require('../../config/database')
const moment = require('moment-timezone')
const { execSync } = require('child_process')
require('dotenv').config()

class SystemHealthChecker {
  constructor () {
    this.results = {
      database: { status: 'unknown', details: null },
      redis: { status: 'unknown', details: null },
      environment: { status: 'unknown', details: null },
      testAccount: { status: 'unknown', details: null },
      services: { status: 'unknown', details: null }
    }
    this.overallHealth = 'unknown'
  }

  /**
   * 执行完整的健康检查
   */
  async performHealthCheck () {
    const startTime = Date.now()
    console.log('🔍 系统健康检查开始...')
    console.log('='.repeat(60))
    console.log(
      `📅 检查时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
    console.log('')

    try {
      // 并行执行各项检查
      await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkEnvironmentVariables(),
        this.checkTestAccount()
      ])

      // 评估总体健康状态
      this.evaluateOverallHealth()

      const duration = Date.now() - startTime
      console.log('\n' + '='.repeat(60))
      console.log(`✅ 健康检查完成，总耗时: ${duration}ms`)
      console.log(
        `🏥 总体健康状态: ${this.getHealthIcon(this.overallHealth)} ${this.overallHealth.toUpperCase()}`
      )

      this.generateHealthReport()
      return this.results
    } catch (error) {
      console.error('❌ 健康检查失败:', error.message)
      throw error
    }
  }

  /**
   * 检查数据库连接和状态
   */
  async checkDatabase () {
    console.log('🔍 检查数据库连接...')

    try {
      // 测试数据库连接
      await sequelize.authenticate()

      // 检查关键表
      const [tables] = await sequelize.query(`
        SELECT TABLE_NAME, TABLE_ROWS
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_ROWS DESC
        LIMIT 10
      `)

      // 检查测试用户是否存在
      const [users] = await sequelize.query(`
        SELECT COUNT(*) as user_count
        FROM users
        WHERE mobile = '13612227930'
      `)

      this.results.database = {
        status: 'healthy',
        details: {
          connection: '✅ 正常',
          database: process.env.DB_NAME,
          tableCount: tables.length,
          topTables: tables.slice(0, 5),
          testUserExists: users[0].user_count > 0
        }
      }

      console.log('  ✅ 数据库连接正常')
      console.log(`  📊 数据库: ${process.env.DB_NAME}`)
      console.log(`  📋 表数量: ${tables.length}+`)
      console.log(`  👤 测试用户(13612227930): ${users[0].user_count > 0 ? '存在' : '不存在'}`)
    } catch (error) {
      this.results.database = {
        status: 'unhealthy',
        details: { error: error.message }
      }
      console.error('  ❌ 数据库检查失败:', error.message)
    }
  }

  /**
   * 检查Redis连接
   */
  async checkRedis () {
    console.log('\n🔍 检查Redis连接...')

    try {
      const result = execSync('redis-cli ping', {
        encoding: 'utf8',
        timeout: 5000
      }).trim()

      if (result === 'PONG') {
        // 获取Redis信息
        const info = execSync('redis-cli info server', {
          encoding: 'utf8',
          timeout: 5000
        })

        const version = info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown'

        this.results.redis = {
          status: 'healthy',
          details: {
            connection: '✅ 正常',
            response: result,
            version
          }
        }

        console.log('  ✅ Redis连接正常')
        console.log(`  📦 版本: ${version}`)
      } else {
        throw new Error('Redis响应异常: ' + result)
      }
    } catch (error) {
      this.results.redis = {
        status: 'unhealthy',
        details: { error: error.message }
      }
      console.error('  ❌ Redis检查失败:', error.message)
    }
  }

  /**
   * 检查环境变量配置
   */
  async checkEnvironmentVariables () {
    console.log('\n🔍 检查环境变量配置...')

    const requiredVars = [
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'NODE_ENV',
      'DB_TIMEZONE'
    ]

    const missingVars = []
    const presentVars = {}

    requiredVars.forEach(varName => {
      const value = process.env[varName]
      if (!value) {
        missingVars.push(varName)
      } else {
        // 隐藏敏感信息
        if (varName.includes('PASSWORD')) {
          presentVars[varName] = '***'
        } else {
          presentVars[varName] = value
        }
      }
    })

    if (missingVars.length === 0) {
      this.results.environment = {
        status: 'healthy',
        details: {
          allRequired: '✅ 完整',
          timezone: process.env.DB_TIMEZONE || '+08:00',
          nodeEnv: process.env.NODE_ENV,
          database: process.env.DB_NAME,
          variables: presentVars
        }
      }

      console.log('  ✅ 环境变量配置完整')
      console.log(`  🌍 环境: ${process.env.NODE_ENV}`)
      console.log(`  ⏰ 时区: ${process.env.DB_TIMEZONE || '+08:00'}`)
      console.log(`  🗄️ 数据库: ${process.env.DB_NAME}`)
    } else {
      this.results.environment = {
        status: 'unhealthy',
        details: {
          missingVariables: missingVars
        }
      }
      console.error('  ❌ 缺少必需的环境变量:', missingVars.join(', '))
    }
  }

  /**
   * 检查测试账号状态
   */
  async checkTestAccount () {
    console.log('\n🔍 检查测试账号(13612227930)...')

    try {
      const [userResult] = await sequelize.query(`
        SELECT
          user_id, mobile, status, is_admin,
          CONVERT_TZ(created_at, '+00:00', '+08:00') as created_at_bj,
          CONVERT_TZ(last_login, '+00:00', '+08:00') as last_login_bj
        FROM users
        WHERE mobile = '13612227930'
      `)

      if (userResult.length > 0) {
        const user = userResult[0]

        // 检查用户积分账户
        const [pointsResult] = await sequelize.query(
          `
           SELECT available_points, total_earned
           FROM user_points_accounts 
           WHERE user_id = ?
         `,
          {
            replacements: [user.user_id]
          }
        )

        this.results.testAccount = {
          status: 'healthy',
          details: {
            exists: true,
            userId: user.user_id,
            mobile: user.mobile,
            isAdmin: user.is_admin === 1,
            status: user.status,
            createdAt: user.created_at_bj,
            lastLogin: user.last_login_bj,
            points: pointsResult.length > 0 ? pointsResult[0] : null
          }
        }

        console.log('  ✅ 测试账号存在')
        console.log(`  👤 用户ID: ${user.user_id}`)
        console.log(`  🏷️ 状态: ${user.status}`)
        console.log(`  👑 管理员权限: ${user.is_admin === 1 ? '是' : '否'}`)
        console.log(`  📅 创建时间: ${user.created_at_bj}`)
        if (pointsResult.length > 0) {
          console.log(`  💰 可用积分: ${pointsResult[0].available_points}`)
        }
      } else {
        this.results.testAccount = {
          status: 'warning',
          details: {
            exists: false,
            message: '测试账号不存在，可能需要创建'
          }
        }
        console.warn('  ⚠️ 测试账号不存在')
      }
    } catch (error) {
      this.results.testAccount = {
        status: 'unhealthy',
        details: { error: error.message }
      }
      console.error('  ❌ 测试账号检查失败:', error.message)
    }
  }

  /**
   * 评估总体健康状态
   */
  evaluateOverallHealth () {
    const statuses = Object.values(this.results).map(r => r.status)

    if (statuses.every(s => s === 'healthy')) {
      this.overallHealth = 'healthy'
    } else if (statuses.some(s => s === 'unhealthy')) {
      this.overallHealth = 'unhealthy'
    } else {
      this.overallHealth = 'warning'
    }
  }

  /**
   * 获取健康状态图标
   */
  getHealthIcon (status) {
    switch (status) {
    case 'healthy':
      return '✅'
    case 'warning':
      return '⚠️'
    case 'unhealthy':
      return '❌'
    default:
      return '❓'
    }
  }

  /**
   * 生成健康报告
   */
  generateHealthReport () {
    console.log('\n📋 健康检查报告:')
    console.log('-'.repeat(40))

    Object.entries(this.results).forEach(([component, result]) => {
      const icon = this.getHealthIcon(result.status)
      const status = result.status.toUpperCase()
      console.log(`${icon} ${component.toUpperCase()}: ${status}`)

      if (result.status === 'unhealthy' && result.details?.error) {
        console.log(`   错误: ${result.details.error}`)
      }
    })

    console.log('-'.repeat(40))

    // 提供修复建议
    if (this.overallHealth !== 'healthy') {
      console.log('\n🔧 修复建议:')

      if (this.results.database.status === 'unhealthy') {
        console.log('1. 检查数据库连接配置和服务状态')
      }

      if (this.results.redis.status === 'unhealthy') {
        console.log('2. 启动Redis服务: redis-server')
      }

      if (this.results.environment.status === 'unhealthy') {
        console.log('3. 检查.env文件配置')
      }

      if (this.results.testAccount.status === 'warning') {
        console.log('4. 创建测试账号或检查用户数据')
      }
    } else {
      console.log('\n🎉 所有系统组件运行正常！')
    }
  }

  /**
   * 生成详细的Markdown报告
   */
  async generateMarkdownReport () {
    const timestamp = moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
    const fs = require('fs')

    let report = '# 系统健康检查报告\n\n'
    report += `**检查时间**: ${timestamp} (北京时间)\n`
    report += `**数据库**: ${process.env.DB_NAME}\n`
    report += `**环境**: ${process.env.NODE_ENV}\n`
    report += `**总体状态**: ${this.getHealthIcon(this.overallHealth)} ${this.overallHealth.toUpperCase()}\n\n`

    // 各组件状态
    report += '## 🔍 组件状态详情\n\n'
    Object.entries(this.results).forEach(([component, result]) => {
      const icon = this.getHealthIcon(result.status)
      report += `### ${icon} ${component.toUpperCase()}\n\n`
      report += `**状态**: ${result.status.toUpperCase()}\n\n`

      if (result.details) {
        report += '**详情**:\n'
        Object.entries(result.details).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            report += `- **${key}**: ${JSON.stringify(value, null, 2)}\n`
          } else {
            report += `- **${key}**: ${value}\n`
          }
        })
      }
      report += '\n'
    })

    // 保存报告
    const reportPath = `reports/health-check-${moment().tz('Asia/Shanghai').format('YYYY-MM-DD-HH-mm')}.md`

    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true })
    }

    fs.writeFileSync(reportPath, report, 'utf8')
    console.log(`\n📄 详细报告已保存: ${reportPath}`)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const checker = new SystemHealthChecker()

  checker
    .performHealthCheck()
    .then(async _results => {
      await checker.generateMarkdownReport()

      console.log('\n✅ 系统健康检查完成')
      process.exit(checker.overallHealth === 'healthy' ? 0 : 1)
    })
    .catch(error => {
      console.error('\n❌ 系统健康检查失败:', error.message)
      process.exit(1)
    })
}

module.exports = SystemHealthChecker
