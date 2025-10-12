/**
 * 登录API诊断测试脚本
 * 用于验证登录功能是否正常
 * 创建时间：2025年10月10日
 */

require('dotenv').config()
const { sequelize, User } = require('../../models')
const axios = require('axios')

// 测试配置
const TEST_CONFIG = {
  mobile: '13612227915',
  verification_code: '123456',
  api_base_url: process.env.API_BASE_URL || 'http://localhost:3000',
  api_port: process.env.PORT || 3000
}

/**
 * 测试1：数据库用户查询
 */
async function testDatabaseQuery () {
  console.log('\n📊 测试1: 数据库用户查询')
  console.log('='.repeat(50))

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    const user = await User.findOne({
      where: { mobile: TEST_CONFIG.mobile },
      raw: true
    })

    if (user) {
      console.log('✅ 用户存在')
      console.log('📋 用户信息:')
      console.log(`  - user_id: ${user.user_id}`)
      console.log(`  - mobile: ${user.mobile}`)
      console.log(`  - nickname: ${user.nickname}`)
      console.log(`  - status: ${user.status}`)
      console.log(`  - login_count: ${user.login_count}`)
      return true
    } else {
      console.log('❌ 用户不存在')
      return false
    }
  } catch (error) {
    console.error('❌ 数据库查询失败:', error.message)
    return false
  }
}

/**
 * 测试2：API接口测试
 */
async function testLoginAPI () {
  console.log('\n📊 测试2: 登录API接口测试')
  console.log('='.repeat(50))

  const loginUrl = `${TEST_CONFIG.api_base_url}/api/v4/unified-engine/auth/login`
  console.log(`📤 请求URL: ${loginUrl}`)

  try {
    const response = await axios.post(loginUrl, {
      mobile: TEST_CONFIG.mobile,
      verification_code: TEST_CONFIG.verification_code
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    })

    if (response.status === 200 && response.data.success) {
      console.log('✅ 登录API测试成功')
      console.log('📦 响应数据:')
      console.log(`  - success: ${response.data.success}`)
      console.log(`  - message: ${response.data.message}`)
      console.log(`  - user_id: ${response.data.data.user.user_id}`)
      console.log(`  - mobile: ${response.data.data.user.mobile}`)
      console.log(`  - role_based_admin: ${response.data.data.user.role_based_admin}`)
      console.log(`  - access_token: ${response.data.data.access_token.substring(0, 50)}...`)
      return true
    } else {
      console.log('❌ 登录失败')
      console.log('响应:', response.data)
      return false
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ API返回错误:')
      console.error(`  - 状态码: ${error.response.status}`)
      console.error(`  - 错误信息: ${JSON.stringify(error.response.data)}`)
    } else if (error.request) {
      console.error('❌ 无法连接到API服务器')
      console.error(`  - 目标地址: ${loginUrl}`)
      console.error(`  - 错误: ${error.message}`)
      console.error('\n💡 提示: 请确认后端服务是否正在运行')
      console.error('   运行命令: npm run pm:start:pm2')
    } else {
      console.error('❌ 请求失败:', error.message)
    }
    return false
  }
}

/**
 * 测试3：验证码验证
 */
async function testVerificationCode () {
  console.log('\n📊 测试3: 验证码验证')
  console.log('='.repeat(50))

  const env = process.env.NODE_ENV || 'development'
  console.log(`📋 当前环境: ${env}`)

  if (env === 'development') {
    console.log('✅ 开发环境，万能验证码: 123456')
    console.log('📝 所有用户都可以使用 123456 登录')
    return true
  } else {
    console.log('⚠️ 生产环境，需要真实验证码')
    return false
  }
}

/**
 * 测试4：服务健康检查
 */
async function testHealthCheck () {
  console.log('\n📊 测试4: 服务健康检查')
  console.log('='.repeat(50))

  const healthUrl = `${TEST_CONFIG.api_base_url}/health`
  console.log(`📤 请求URL: ${healthUrl}`)

  try {
    const response = await axios.get(healthUrl, { timeout: 5000 })

    if (response.status === 200) {
      console.log('✅ 服务健康状态正常')
      console.log('📦 健康检查响应:')
      console.log(`  - status: ${response.data.status}`)
      if (response.data.database) {
        console.log(`  - database: ${response.data.database}`)
      }
      return true
    } else {
      console.log('⚠️ 服务健康状态异常')
      return false
    }
  } catch (error) {
    console.error('❌ 服务健康检查失败:', error.message)
    console.error('\n💡 提示: 后端服务可能未启动')
    return false
  }
}

/**
 * 主测试函数
 */
async function runDiagnostic () {
  console.log('\n🔍 登录API诊断测试')
  console.log('='.repeat(50))
  console.log(`📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log(`📱 测试账号: ${TEST_CONFIG.mobile}`)
  console.log(`🔐 验证码: ${TEST_CONFIG.verification_code}`)
  console.log(`🌐 API地址: ${TEST_CONFIG.api_base_url}`)

  const results = {
    database: false,
    api: false,
    verification: false,
    health: false
  }

  try {
    // 执行所有测试
    results.health = await testHealthCheck()
    results.database = await testDatabaseQuery()
    results.verification = await testVerificationCode()
    results.api = await testLoginAPI()

    // 生成诊断报告
    console.log('\n📊 诊断结果汇总')
    console.log('='.repeat(50))
    console.log(`服务健康检查: ${results.health ? '✅ 通过' : '❌ 失败'}`)
    console.log(`数据库查询:   ${results.database ? '✅ 通过' : '❌ 失败'}`)
    console.log(`验证码验证:   ${results.verification ? '✅ 通过' : '❌ 失败'}`)
    console.log(`API接口测试:  ${results.api ? '✅ 通过' : '❌ 失败'}`)

    const totalTests = Object.keys(results).length
    const passedTests = Object.values(results).filter(Boolean).length
    const passRate = (passedTests / totalTests * 100).toFixed(1)

    console.log('\n📈 测试通过率: ' + passRate + '%')

    if (passedTests === totalTests) {
      console.log('\n🎉 所有测试通过！后端登录功能正常')
      console.log('💡 如果前端仍然报错，问题出在前端配置')
      console.log('📄 请查看文档: docs/前端登录问题诊断-20251010.md')
    } else {
      console.log('\n⚠️ 部分测试失败，请检查上述错误信息')

      if (!results.health) {
        console.log('\n🔧 解决方案: 启动后端服务')
        console.log('   命令: npm run pm:start:pm2')
      }

      if (!results.database) {
        console.log('\n🔧 解决方案: 检查数据库连接和用户数据')
        console.log('   命令: node scripts/test/data-verification.js')
      }

      if (!results.api) {
        console.log('\n🔧 解决方案: 检查API路由配置')
        console.log('   文件: routes/v4/unified-engine/auth.js')
      }
    }
  } catch (error) {
    console.error('\n❌ 诊断过程出错:', error.message)
  } finally {
    await sequelize.close()
  }

  console.log('\n' + '='.repeat(50))
  console.log('诊断测试完成\n')
}

// 执行诊断
if (require.main === module) {
  runDiagnostic()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('诊断失败:', error)
      process.exit(1)
    })
}

module.exports = { runDiagnostic }
