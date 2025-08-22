/**
 * 新需求测试协议脚本
 * 用于验证新功能的完整性和兼容性
 */

const { testConnection } = require('../models/index.js')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

/**
 * 测试协议配置
 */
const _TEST_CONFIG = {
  // 基础测试
  basic: {
    database_connection: true,
    model_loading: true,
    api_health: true
  },

  // 功能测试
  functional: {
    unit_tests: true,
    integration_tests: true,
    api_tests: true
  },

  // 兼容性测试
  compatibility: {
    existing_data: true,
    existing_apis: true,
    user_scenarios: true
  },

  // 性能测试
  performance: {
    response_time: true,
    memory_usage: true,
    database_queries: true
  }
}

/**
 * 基础测试 - 数据库连接
 */
async function testDatabaseConnection () {
  console.log('🔄 测试数据库连接...')
  try {
    const connected = await testConnection()
    if (connected) {
      console.log('✅ 数据库连接正常')
      return true
    } else {
      console.log('❌ 数据库连接失败')
      return false
    }
  } catch (error) {
    console.error('❌ 数据库连接异常:', error.message)
    return false
  }
}

/**
 * 基础测试 - 模型加载
 */
async function testModelLoading () {
  console.log('🔄 测试模型加载...')
  try {
    const models = require('../models/index.js')
    const requiredModels = ['User', 'Product', 'LotteryRecord', 'PointsRecord', 'ExchangeRecord']

    for (const modelName of requiredModels) {
      if (!models[modelName]) {
        console.error(`❌ 模型加载失败: ${modelName}`)
        return false
      }
    }

    console.log('✅ 所有核心模型加载正常')
    return true
  } catch (error) {
    console.error('❌ 模型加载异常:', error.message)
    return false
  }
}

/**
 * 基础测试 - API健康检查
 */
async function testApiHealth () {
  console.log('🔄 测试API健康状态...')
  try {
    const { stdout } = await execAsync('curl -f -s http://localhost:3000/health')
    const healthData = JSON.parse(stdout)

    if (healthData.status === 'healthy') {
      console.log('✅ API健康检查通过')
      return true
    } else {
      console.log('❌ API健康检查失败:', healthData)
      return false
    }
  } catch (error) {
    console.error('❌ API健康检查异常:', error.message)
    return false
  }
}

/**
 * 功能测试 - 单元测试
 */
async function runUnitTests () {
  console.log('🔄 运行单元测试...')
  try {
    const { stdout, stderr } = await execAsync('npm test')

    if (stdout.includes('passing')) {
      console.log('✅ 单元测试通过')
      return true
    } else {
      console.log('❌ 单元测试失败')
      console.log('输出:', stdout)
      console.log('错误:', stderr)
      return false
    }
  } catch (error) {
    console.error('❌ 单元测试异常:', error.message)
    return false
  }
}

/**
 * 兼容性测试 - 现有数据验证
 */
async function testExistingData () {
  console.log('🔄 验证现有数据完整性...')
  try {
    const { User, Product, LotteryRecord, PointsRecord } = require('../models/index.js')

    // 检查关键数据是否存在
    const userCount = await User.count()
    const productCount = await Product.count()
    const lotteryCount = await LotteryRecord.count()
    const pointsCount = await PointsRecord.count()

    console.log('📊 数据统计:')
    console.log(`  - 用户数量: ${userCount}`)
    console.log(`  - 商品数量: ${productCount}`)
    console.log(`  - 抽奖记录: ${lotteryCount}`)
    console.log(`  - 积分记录: ${pointsCount}`)

    if (userCount > 0 && productCount > 0) {
      console.log('✅ 现有数据完整性验证通过')
      return true
    } else {
      console.log('⚠️ 现有数据可能不完整')
      return false
    }
  } catch (error) {
    console.error('❌ 现有数据验证异常:', error.message)
    return false
  }
}

/**
 * 兼容性测试 - 现有API验证
 */
async function testExistingApis () {
  console.log('🔄 验证现有API兼容性...')
  try {
    const criticalApis = [
      '/api/auth/login',
      '/api/lottery/draw',
      '/api/products',
      '/api/user/profile'
    ]

    let passCount = 0

    for (const api of criticalApis) {
      try {
        const { stdout } = await execAsync(
          `curl -f -s -o /dev/null -w "%{http_code}" http://localhost:3000${api}`
        )
        const statusCode = parseInt(stdout.trim())

        // 200-299 或 401(需要认证) 都算正常
        if ((statusCode >= 200 && statusCode < 300) || statusCode === 401) {
          console.log(`✅ API ${api}: ${statusCode}`)
          passCount++
        } else {
          console.log(`❌ API ${api}: ${statusCode}`)
        }
      } catch (error) {
        console.log(`❌ API ${api}: 连接失败`)
      }
    }

    const passRate = passCount / criticalApis.length
    if (passRate >= 0.8) {
      console.log(`✅ API兼容性测试通过 (${passCount}/${criticalApis.length})`)
      return true
    } else {
      console.log(`❌ API兼容性测试失败 (${passCount}/${criticalApis.length})`)
      return false
    }
  } catch (error) {
    console.error('❌ API兼容性测试异常:', error.message)
    return false
  }
}

/**
 * 性能测试 - 响应时间
 */
async function testResponseTime () {
  console.log('🔄 测试API响应时间...')
  try {
    const { stdout } = await execAsync(
      'curl -f -s -o /dev/null -w "%{time_total}" http://localhost:3000/health'
    )
    const responseTime = parseFloat(stdout.trim()) * 1000 // 转换为毫秒

    console.log(`📊 API响应时间: ${responseTime.toFixed(2)}ms`)

    if (responseTime < 1000) {
      // 小于1秒
      console.log('✅ 响应时间测试通过')
      return true
    } else {
      console.log('⚠️ 响应时间较慢，需要优化')
      return false
    }
  } catch (error) {
    console.error('❌ 响应时间测试异常:', error.message)
    return false
  }
}

/**
 * 运行完整测试套件
 */
async function runFullTestSuite () {
  console.log('🚀 开始运行新需求测试协议...')
  console.log('='.repeat(50))

  const results = {
    basic: {},
    functional: {},
    compatibility: {},
    performance: {}
  }

  // 基础测试
  console.log('\n📋 基础测试')
  console.log('-'.repeat(30))
  results.basic.database_connection = await testDatabaseConnection()
  results.basic.model_loading = await testModelLoading()
  results.basic.api_health = await testApiHealth()

  // 功能测试
  console.log('\n📋 功能测试')
  console.log('-'.repeat(30))
  results.functional.unit_tests = await runUnitTests()

  // 兼容性测试
  console.log('\n📋 兼容性测试')
  console.log('-'.repeat(30))
  results.compatibility.existing_data = await testExistingData()
  results.compatibility.existing_apis = await testExistingApis()

  // 性能测试
  console.log('\n📋 性能测试')
  console.log('-'.repeat(30))
  results.performance.response_time = await testResponseTime()

  // 生成测试报告
  console.log('\n📊 测试结果汇总')
  console.log('='.repeat(50))

  let totalTests = 0
  let passedTests = 0

  Object.keys(results).forEach(category => {
    console.log(`\n${category.toUpperCase()}:`)
    Object.keys(results[category]).forEach(test => {
      const status = results[category][test] ? '✅ PASS' : '❌ FAIL'
      console.log(`  ${test}: ${status}`)
      totalTests++
      if (results[category][test]) passedTests++
    })
  })

  const passRate = ((passedTests / totalTests) * 100).toFixed(1)
  console.log(`\n🎯 总体通过率: ${passedTests}/${totalTests} (${passRate}%)`)

  if (passRate >= 80) {
    console.log('🎉 测试协议通过！新需求可以部署')
    return true
  } else {
    console.log('⚠️ 测试协议未通过，需要修复问题后重试')
    return false
  }
}

// 主函数
async function main () {
  try {
    const success = await runFullTestSuite()
    process.exit(success ? 0 : 1)
  } catch (error) {
    console.error('💥 测试协议执行失败:', error.message)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = {
  runFullTestSuite,
  testDatabaseConnection,
  testModelLoading,
  testApiHealth,
  runUnitTests,
  testExistingData,
  testExistingApis,
  testResponseTime
}
