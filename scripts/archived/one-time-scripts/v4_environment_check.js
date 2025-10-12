/**
 * V4统一抽奖引擎环境变量配置检查脚本
 * 检查所有必需的环境变量配置
 *
 * @description 环境变量检查和验证脚本，确保V4引擎运行环境配置正确
 * @version 4.0.0
 * @date 2025-09-11
 */

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const redis = require('redis')
const moment = require('moment-timezone')

/**
 * 必需的环境变量配置清单
 */
const REQUIRED_ENV_VARS = {
  // 数据库配置
  database: ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  // Redis配置
  redis: ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'],
  // Sealos对象存储配置
  sealos: ['SEALOS_ENDPOINT', 'SEALOS_ACCESS_KEY', 'SEALOS_SECRET_KEY', 'SEALOS_BUCKET'],
  // 应用配置
  application: ['NODE_ENV', 'PORT', 'JWT_SECRET'],
  // V4引擎专用配置
  v4_engine: ['V4_ENGINE_TIMEOUT', 'V4_ENGINE_RETRY_COUNT', 'V4_ENGINE_CACHE_TTL']
}

/**
 * 默认环境变量值
 */
const DEFAULT_ENV_VALUES = {
  DB_PORT: '3306',
  REDIS_PORT: '6379',
  NODE_ENV: 'development',
  PORT: '3000',
  V4_ENGINE_TIMEOUT: '30000',
  V4_ENGINE_RETRY_COUNT: '3',
  V4_ENGINE_CACHE_TTL: '300'
}

/**
 * 检查结果收集器
 */
class EnvChecker {
  constructor () {
    this.results = {
      timestamp: moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss'),
      overall_status: 'unknown',
      missing_vars: [],
      invalid_vars: [],
      warnings: [],
      connection_tests: {},
      recommendations: []
    }
  }

  /**
   * 执行完整的环境检查
   */
  async runCompleteCheck () {
    console.log('🔍 开始V4统一抽奖引擎环境配置检查...')
    console.log(`⏰ 检查时间: ${this.results.timestamp} (北京时间)`)
    console.log('=' * 60)

    try {
      // 1. 检查.env文件是否存在
      this.checkEnvFileExistence()

      // 2. 检查环境变量
      this.checkEnvironmentVariables()

      // 3. 验证配置格式
      this.validateConfigFormats()

      // 4. 测试数据库连接
      await this.testDatabaseConnection()

      // 5. 测试Redis连接
      await this.testRedisConnection()

      // 6. 测试Sealos存储连接
      await this.testSealosConnection()

      // 7. 检查V4引擎相关配置
      this.checkV4EngineConfig()

      // 8. 生成总体状态和建议
      this.generateOverallStatus()

      // 9. 输出检查结果
      this.outputResults()

      return this.results
    } catch (error) {
      this.results.overall_status = 'error'
      this.results.error = error.message
      console.error('❌ 环境检查过程中发生错误:', error)
      return this.results
    }
  }

  /**
   * 检查.env文件是否存在
   */
  checkEnvFileExistence () {
    const envPath = path.join(process.cwd(), '.env')
    if (!fs.existsSync(envPath)) {
      this.results.warnings.push('⚠️  .env文件不存在，请创建.env文件并配置环境变量')
      this.results.recommendations.push('创建.env文件并配置必需的环境变量')
    } else {
      console.log('✅ .env文件存在')
    }
  }

  /**
   * 检查环境变量
   */
  checkEnvironmentVariables () {
    console.log('\n📋 检查环境变量配置...')

    Object.keys(REQUIRED_ENV_VARS).forEach(category => {
      console.log(`\n🔸 ${category.toUpperCase()} 配置:`)

      REQUIRED_ENV_VARS[category].forEach(varName => {
        const value = process.env[varName]

        if (!value) {
          // 检查是否有默认值
          if (DEFAULT_ENV_VALUES[varName]) {
            process.env[varName] = DEFAULT_ENV_VALUES[varName]
            console.log(`  ⚠️  ${varName}: 使用默认值 ${DEFAULT_ENV_VALUES[varName]}`)
            this.results.warnings.push(
              `${varName} 未配置，使用默认值: ${DEFAULT_ENV_VALUES[varName]}`
            )
          } else {
            console.log(`  ❌ ${varName}: 未配置`)
            this.results.missing_vars.push(varName)
          }
        } else {
          // 隐藏敏感信息
          const displayValue = this.maskSensitiveValue(varName, value)
          console.log(`  ✅ ${varName}: ${displayValue}`)
        }
      })
    })
  }

  /**
   * 验证配置格式
   */
  validateConfigFormats () {
    console.log('\n🔎 验证配置格式...')

    // 验证端口号
    this.validatePort('DB_PORT', process.env.DB_PORT)
    this.validatePort('REDIS_PORT', process.env.REDIS_PORT)
    this.validatePort('PORT', process.env.PORT)

    // 验证V4引擎配置
    this.validateNumeric('V4_ENGINE_TIMEOUT', process.env.V4_ENGINE_TIMEOUT)
    this.validateNumeric('V4_ENGINE_RETRY_COUNT', process.env.V4_ENGINE_RETRY_COUNT)
    this.validateNumeric('V4_ENGINE_CACHE_TTL', process.env.V4_ENGINE_CACHE_TTL)

    // 验证URL格式
    if (process.env.SEALOS_ENDPOINT) {
      this.validateUrl('SEALOS_ENDPOINT', process.env.SEALOS_ENDPOINT)
    }

    // 验证JWT密钥长度
    if (process.env.JWT_SECRET) {
      if (process.env.JWT_SECRET.length < 32) {
        this.results.warnings.push('JWT_SECRET 长度少于32字符，建议使用更强的密钥')
      }
    }
  }

  /**
   * 测试数据库连接
   */
  async testDatabaseConnection () {
    console.log('\n🗄️  测试数据库连接...')

    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectTimeout: 10000
      })

      // 测试连接
      await connection.ping()

      // 检查数据库版本
      const [rows] = await connection.execute('SELECT VERSION() as version')
      const version = rows[0].version

      console.log('  ✅ 数据库连接成功')
      console.log(`  ℹ️  MySQL版本: ${version}`)

      this.results.connection_tests.database = {
        status: 'success',
        version,
        message: '数据库连接正常'
      }

      await connection.end()
    } catch (error) {
      console.log(`  ❌ 数据库连接失败: ${error.message}`)
      this.results.connection_tests.database = {
        status: 'failed',
        error: error.message,
        message: '数据库连接失败'
      }
    }
  }

  /**
   * 测试Redis连接
   */
  async testRedisConnection () {
    console.log('\n🔄 测试Redis连接...')

    try {
      const client = redis.createClient({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 10000
      })

      await client.connect()

      // 测试读写
      await client.set('v4_engine_test', 'test_value', { EX: 5 })
      const testValue = await client.get('v4_engine_test')

      if (testValue === 'test_value') {
        console.log('  ✅ Redis连接成功')
        this.results.connection_tests.redis = {
          status: 'success',
          message: 'Redis连接正常，读写测试通过'
        }
      } else {
        throw new Error('Redis读写测试失败')
      }

      await client.disconnect()
    } catch (error) {
      console.log(`  ❌ Redis连接失败: ${error.message}`)
      this.results.connection_tests.redis = {
        status: 'failed',
        error: error.message,
        message: 'Redis连接失败'
      }
    }
  }

  /**
   * 测试Sealos存储连接
   */
  async testSealosConnection () {
    console.log('\n☁️  测试Sealos对象存储连接...')

    try {
      // 这里应该使用实际的Sealos SDK测试连接
      // 由于没有具体的SDK，这里模拟检查配置完整性
      const requiredSealosVars = [
        'SEALOS_ENDPOINT',
        'SEALOS_ACCESS_KEY',
        'SEALOS_SECRET_KEY',
        'SEALOS_BUCKET'
      ]
      const missingSealosVars = requiredSealosVars.filter(varName => !process.env[varName])

      if (missingSealosVars.length > 0) {
        throw new Error(`缺少Sealos配置: ${missingSealosVars.join(', ')}`)
      }

      console.log('  ✅ Sealos配置检查通过')
      this.results.connection_tests.sealos = {
        status: 'success',
        message: 'Sealos配置完整（未测试实际连接）'
      }
    } catch (error) {
      console.log(`  ❌ Sealos配置检查失败: ${error.message}`)
      this.results.connection_tests.sealos = {
        status: 'failed',
        error: error.message,
        message: 'Sealos配置不完整'
      }
    }
  }

  /**
   * 检查V4引擎相关配置
   */
  checkV4EngineConfig () {
    console.log('\n🎯 检查V4引擎专用配置...')

    const timeout = parseInt(process.env.V4_ENGINE_TIMEOUT) || 30000
    const retryCount = parseInt(process.env.V4_ENGINE_RETRY_COUNT) || 3
    const cacheTTL = parseInt(process.env.V4_ENGINE_CACHE_TTL) || 300

    // 检查配置合理性
    if (timeout < 10000) {
      this.results.warnings.push('V4_ENGINE_TIMEOUT 设置过低，可能导致超时问题')
    }

    if (timeout > 60000) {
      this.results.warnings.push('V4_ENGINE_TIMEOUT 设置过高，可能影响用户体验')
    }

    if (retryCount < 1) {
      this.results.warnings.push('V4_ENGINE_RETRY_COUNT 设置过低，建议设置为2-5')
    }

    if (retryCount > 5) {
      this.results.warnings.push('V4_ENGINE_RETRY_COUNT 设置过高，可能导致响应延迟')
    }

    if (cacheTTL < 60) {
      this.results.warnings.push('V4_ENGINE_CACHE_TTL 设置过低，可能影响性能')
    }

    console.log(`  ✅ 超时设置: ${timeout}ms`)
    console.log(`  ✅ 重试次数: ${retryCount}次`)
    console.log(`  ✅ 缓存TTL: ${cacheTTL}秒`)
  }

  /**
   * 生成总体状态和建议
   */
  generateOverallStatus () {
    let status = 'success'

    if (this.results.missing_vars.length > 0) {
      status = 'failed'
      this.results.recommendations.push('请配置所有必需的环境变量')
    }

    if (this.results.invalid_vars.length > 0) {
      status = 'failed'
      this.results.recommendations.push('请修正格式错误的环境变量')
    }

    const failedConnections = Object.values(this.results.connection_tests).filter(
      test => test.status === 'failed'
    )

    if (failedConnections.length > 0) {
      status = 'failed'
      this.results.recommendations.push('请修复失败的连接配置')
    }

    if (this.results.warnings.length > 0 && status === 'success') {
      status = 'warning'
      this.results.recommendations.push('建议处理配置警告以获得更好的性能')
    }

    this.results.overall_status = status
  }

  /**
   * 输出检查结果
   */
  outputResults () {
    console.log('\n' + '=' * 60)
    console.log('📊 环境检查结果汇总')
    console.log('=' * 60)

    // 总体状态
    const statusIcon = {
      success: '✅',
      warning: '⚠️',
      failed: '❌',
      error: '💥'
    }

    console.log(
      `\n总体状态: ${statusIcon[this.results.overall_status]} ${this.results.overall_status.toUpperCase()}`
    )

    // 缺失的变量
    if (this.results.missing_vars.length > 0) {
      console.log(`\n❌ 缺失的环境变量 (${this.results.missing_vars.length}个):`)
      this.results.missing_vars.forEach(varName => {
        console.log(`  - ${varName}`)
      })
    }

    // 格式错误的变量
    if (this.results.invalid_vars.length > 0) {
      console.log(`\n❌ 格式错误的环境变量 (${this.results.invalid_vars.length}个):`)
      this.results.invalid_vars.forEach(info => {
        console.log(`  - ${info.varName}: ${info.error}`)
      })
    }

    // 警告信息
    if (this.results.warnings.length > 0) {
      console.log(`\n⚠️  警告信息 (${this.results.warnings.length}个):`)
      this.results.warnings.forEach(warning => {
        console.log(`  - ${warning}`)
      })
    }

    // 连接测试结果
    console.log('\n🔌 连接测试结果:')
    Object.keys(this.results.connection_tests).forEach(service => {
      const test = this.results.connection_tests[service]
      const icon = test.status === 'success' ? '✅' : '❌'
      console.log(`  ${icon} ${service}: ${test.message}`)
    })

    // 建议
    if (this.results.recommendations.length > 0) {
      console.log('\n💡 改进建议:')
      this.results.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`)
      })
    }

    console.log('\n' + '=' * 60)
    console.log(
      `检查完成时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
  }

  /**
   * 验证端口号
   */
  validatePort (varName, value) {
    if (value) {
      const port = parseInt(value)
      if (isNaN(port) || port < 1 || port > 65535) {
        this.results.invalid_vars.push({
          varName,
          error: '端口号必须是1-65535之间的数字'
        })
      }
    }
  }

  /**
   * 验证数字格式
   */
  validateNumeric (varName, value) {
    if (value) {
      const num = parseInt(value)
      if (isNaN(num) || num < 0) {
        this.results.invalid_vars.push({
          varName,
          error: '必须是非负整数'
        })
      }
    }
  }

  /**
   * 验证URL格式
   */
  validateUrl (varName, value) {
    try {
      // eslint-disable-next-line no-new
      new URL(value)
    } catch {
      this.results.invalid_vars.push({
        varName,
        error: '必须是有效的URL格式'
      })
    }
  }

  /**
   * 隐藏敏感值
   */
  maskSensitiveValue (varName, value) {
    const sensitiveVars = ['PASSWORD', 'SECRET', 'KEY']
    if (sensitiveVars.some(keyword => varName.includes(keyword))) {
      return '*'.repeat(Math.min(value.length, 8))
    }
    return value
  }
}

/**
 * 生成环境配置模板
 */
function generateEnvTemplate () {
  console.log('\n📝 生成.env配置模板...')

  const template = `# V4统一抽奖引擎环境配置模板
# 生成时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)

# ================================
# 数据库配置
# ================================
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=restaurant_lottery_v4

# ================================
# Redis配置
# ================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# ================================
# Sealos对象存储配置
# ================================
SEALOS_ENDPOINT=https://your-sealos-endpoint.com
SEALOS_ACCESS_KEY=your_access_key
SEALOS_SECRET_KEY=your_secret_key
SEALOS_BUCKET=your_bucket_name

# ================================
# 应用配置
# ================================
NODE_ENV=development
PORT=3000
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters_long

# ================================
# V4引擎专用配置
# ================================
V4_ENGINE_TIMEOUT=30000
V4_ENGINE_RETRY_COUNT=3
V4_ENGINE_CACHE_TTL=300

# ================================
# 其他配置
# ================================
# 添加其他需要的环境变量...
`

  const templatePath = path.join(process.cwd(), '.env.template')
  fs.writeFileSync(templatePath, template, 'utf8')
  console.log(`✅ 环境配置模板已生成: ${templatePath}`)
  console.log('💡 请复制为.env文件并修改为实际配置值')
}

// 主函数
async function main () {
  const args = process.argv.slice(2)

  if (args.includes('--template')) {
    generateEnvTemplate()
    return
  }

  try {
    require('dotenv').config()
  } catch {
    console.log('⚠️  未找到dotenv包，跳过.env文件加载')
  }

  const checker = new EnvChecker()
  const results = await checker.runCompleteCheck()

  // 退出码
  const exitCode = {
    success: 0,
    warning: 0,
    failed: 1,
    error: 1
  }

  process.exit(exitCode[results.overall_status] || 1)
}

// 只有在直接运行时才执行main函数
if (require.main === module) {
  main().catch(error => {
    console.error('💥 脚本执行失败:', error)
    process.exit(1)
  })
}

module.exports = { EnvChecker, generateEnvTemplate, REQUIRED_ENV_VARS }
