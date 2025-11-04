/**
 * 🌍 环境配置检查工具
 *
 * 功能：
 * - 检查当前环境配置是否正确
 * - 验证必需的环境变量是否存在
 * - 检测配置冲突和安全风险
 * - 提供环境切换建议
 *
 * 使用方法：
 * node scripts/check-environment.js
 *
 * 创建时间：2025年11月02日 23:25:36 北京时间
 */

require('dotenv').config()

// 🎨 控制台颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function colorize (text, color) {
  return `${colors[color]}${text}${colors.reset}`
}

// 📊 环境检查结果
const checkResults = {
  passed: [],
  warnings: [],
  errors: [],
  info: []
}

function addResult (type, message) {
  checkResults[type].push(message)
}

// 1️⃣ 检查 NODE_ENV 设置
function checkNodeEnv () {
  console.log('\n' + colorize('1️⃣ 检查 NODE_ENV 环境变量', 'cyan'))
  console.log('='.repeat(50))

  const nodeEnv = process.env.NODE_ENV

  if (!nodeEnv) {
    addResult('errors', 'NODE_ENV 未设置（将默认为 development）')
    console.log(colorize('❌ NODE_ENV 未设置', 'red'))
    console.log(colorize('💡 建议：在 .env 文件中设置 NODE_ENV=development|test|production', 'yellow'))
  } else {
    const validEnvs = ['development', 'test', 'production']
    if (validEnvs.includes(nodeEnv)) {
      addResult('passed', `NODE_ENV 设置正确：${nodeEnv}`)
      console.log(colorize(`✅ NODE_ENV = ${nodeEnv}`, 'green'))

      // 🔍 根据不同环境给出建议
      if (nodeEnv === 'development') {
        addResult('info', '开发环境：可使用万能验证码 123456')
        console.log(colorize('   📝 开发环境：可使用万能验证码 123456', 'blue'))
      } else if (nodeEnv === 'test') {
        addResult('info', '测试环境：可使用万能验证码 123456')
        console.log(colorize('   🧪 测试环境：可使用万能验证码 123456', 'blue'))
      } else if (nodeEnv === 'production') {
        addResult('info', '生产环境：必须使用真实短信验证码')
        console.log(colorize('   🔒 生产环境：必须使用真实短信验证码', 'magenta'))
      }
    } else {
      addResult('warnings', `NODE_ENV 值不标准：${nodeEnv}（应为 development/test/production 之一）`)
      console.log(colorize(`⚠️ NODE_ENV = ${nodeEnv} （非标准值）`, 'yellow'))
      console.log(colorize('   标准值：development | test | production', 'yellow'))
    }
  }
}

// 2️⃣ 检查数据库配置
function checkDatabaseConfig () {
  console.log('\n' + colorize('2️⃣ 检查数据库配置', 'cyan'))
  console.log('='.repeat(50))

  const requiredDbVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
  const missingVars = requiredDbVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    addResult('errors', `缺少数据库配置：${missingVars.join(', ')}`)
    console.log(colorize(`❌ 缺少必需配置：${missingVars.join(', ')}`, 'red'))
    console.log(colorize('💡 建议：在 .env 文件中配置这些变量', 'yellow'))
  } else {
    addResult('passed', '数据库配置完整')
    console.log(colorize('✅ 数据库配置完整', 'green'))

    // 显示数据库连接信息（隐藏密码）
    const dbHost = process.env.DB_HOST
    const dbPort = process.env.DB_PORT
    const dbName = process.env.DB_NAME
    const dbUser = process.env.DB_USER

    console.log(colorize(`   📍 连接地址：${dbHost}:${dbPort}/${dbName}`, 'blue'))
    console.log(colorize(`   👤 用户名：${dbUser}`, 'blue'))

    // 🔍 检查是否使用本地数据库（生产环境警告）
    if (process.env.NODE_ENV === 'production' && dbHost === 'localhost') {
      addResult('warnings', '生产环境使用本地数据库（可能不正确）')
      console.log(colorize('   ⚠️ 警告：生产环境不应使用 localhost 数据库', 'yellow'))
    }
  }
}

// 3️⃣ 检查短信服务配置（生产环境必需）
function checkSmsConfig () {
  console.log('\n' + colorize('3️⃣ 检查短信服务配置', 'cyan'))
  console.log('='.repeat(50))

  const nodeEnv = process.env.NODE_ENV || 'development'

  if (nodeEnv === 'production') {
    // 生产环境必须配置短信服务
    const smsVars = ['SMS_APP_ID', 'SMS_APP_KEY']
    const missingSmsVars = smsVars.filter(varName => !process.env[varName])

    if (missingSmsVars.length > 0) {
      addResult('errors', `生产环境缺少短信配置：${missingSmsVars.join(', ')}`)
      console.log(colorize('❌ 生产环境必须配置短信服务', 'red'))
      console.log(colorize(`   缺少配置：${missingSmsVars.join(', ')}`, 'red'))
      console.log(colorize('💡 建议：配置腾讯云短信服务', 'yellow'))
    } else {
      addResult('passed', '短信服务配置完整（生产环境）')
      console.log(colorize('✅ 短信服务配置完整', 'green'))
    }
  } else {
    // 开发/测试环境提示
    addResult('info', `${nodeEnv} 环境：短信服务配置可选（可使用万能验证码123456）`)
    console.log(colorize(`📝 ${nodeEnv} 环境：短信服务配置可选`, 'blue'))
    console.log(colorize('   可使用万能验证码：123456', 'blue'))
  }
}

// 4️⃣ 检查端口配置
function checkPortConfig () {
  console.log('\n' + colorize('4️⃣ 检查服务端口配置', 'cyan'))
  console.log('='.repeat(50))

  const port = process.env.PORT

  if (!port) {
    addResult('warnings', 'PORT 未设置（将默认为 3000）')
    console.log(colorize('⚠️ PORT 未设置，将使用默认端口 3000', 'yellow'))
  } else {
    const portNum = parseInt(port)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      addResult('errors', `PORT 值无效：${port}（必须是 1-65535 之间的数字）`)
      console.log(colorize(`❌ PORT 值无效：${port}`, 'red'))
    } else {
      addResult('passed', `服务端口：${port}`)
      console.log(colorize(`✅ 服务端口：${port}`, 'green'))
    }
  }
}

// 5️⃣ 检查安全配置
function checkSecurityConfig () {
  console.log('\n' + colorize('5️⃣ 检查安全配置', 'cyan'))
  console.log('='.repeat(50))

  const nodeEnv = process.env.NODE_ENV || 'development'

  // 检查 JWT 密钥
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret) {
    addResult('warnings', 'JWT_SECRET 未设置（将使用默认值，不安全）')
    console.log(colorize('⚠️ JWT_SECRET 未设置', 'yellow'))
    console.log(colorize('💡 建议：设置强随机字符串作为 JWT 密钥', 'yellow'))
  } else {
    if (jwtSecret.length < 32) {
      addResult('warnings', 'JWT_SECRET 长度过短（建议至少 32 字符）')
      console.log(colorize('⚠️ JWT_SECRET 长度过短（建议至少 32 字符）', 'yellow'))
    } else {
      addResult('passed', 'JWT_SECRET 配置正确')
      console.log(colorize('✅ JWT_SECRET 配置正确', 'green'))
    }
  }

  // 生产环境安全检查
  if (nodeEnv === 'production') {
    // 检查数据库密码强度
    const dbPassword = process.env.DB_PASSWORD
    if (dbPassword && dbPassword.length < 8) {
      addResult('warnings', '数据库密码过弱（建议至少 8 字符）')
      console.log(colorize('⚠️ 数据库密码过弱（建议至少 8 字符）', 'yellow'))
    }

    // 检查是否使用默认密码
    const weakPasswords = ['password', '123456', 'root', 'admin']
    if (dbPassword && weakPasswords.includes(dbPassword.toLowerCase())) {
      addResult('errors', '数据库使用弱密码（严重安全风险）')
      console.log(colorize('❌ 数据库使用弱密码（严重安全风险）', 'red'))
    }
  }
}

// 6️⃣ 检查日志配置
function checkLoggingConfig () {
  console.log('\n' + colorize('6️⃣ 检查日志配置', 'cyan'))
  console.log('='.repeat(50))

  const nodeEnv = process.env.NODE_ENV || 'development'
  const logLevel = process.env.LOG_LEVEL

  if (!logLevel) {
    addResult('info', '日志级别未设置（将根据环境使用默认值）')
    console.log(colorize('📝 日志级别未设置（使用默认值）', 'blue'))

    if (nodeEnv === 'development') {
      console.log(colorize('   开发环境默认：debug（详细日志）', 'blue'))
    } else if (nodeEnv === 'production') {
      console.log(colorize('   生产环境默认：error（仅错误日志）', 'blue'))
    }
  } else {
    addResult('passed', `日志级别：${logLevel}`)
    console.log(colorize(`✅ 日志级别：${logLevel}`, 'green'))
  }
}

// 7️⃣ 生成检查报告
function generateReport () {
  console.log('\n' + colorize('📊 环境检查报告', 'cyan'))
  console.log('='.repeat(50))

  const totalChecks = checkResults.passed.length + checkResults.warnings.length + checkResults.errors.length
  const passRate = totalChecks > 0 ? ((checkResults.passed.length / totalChecks) * 100).toFixed(1) : 0

  console.log(colorize(`📋 总检查项：${totalChecks}`, 'blue'))
  console.log(colorize(`✅ 通过：${checkResults.passed.length}`, 'green'))
  console.log(colorize(`⚠️ 警告：${checkResults.warnings.length}`, 'yellow'))
  console.log(colorize(`❌ 错误：${checkResults.errors.length}`, 'red'))
  console.log(colorize(`📈 通过率：${passRate}%`, 'blue'))

  // 显示详细问题
  if (checkResults.errors.length > 0) {
    console.log('\n' + colorize('❌ 错误列表：', 'red'))
    checkResults.errors.forEach((error, index) => {
      console.log(colorize(`   ${index + 1}. ${error}`, 'red'))
    })
  }

  if (checkResults.warnings.length > 0) {
    console.log('\n' + colorize('⚠️ 警告列表：', 'yellow'))
    checkResults.warnings.forEach((warning, index) => {
      console.log(colorize(`   ${index + 1}. ${warning}`, 'yellow'))
    })
  }

  if (checkResults.info.length > 0) {
    console.log('\n' + colorize('📝 信息提示：', 'blue'))
    checkResults.info.forEach((info, index) => {
      console.log(colorize(`   ${index + 1}. ${info}`, 'blue'))
    })
  }

  // 🎯 最终判断
  console.log('\n' + colorize('🎯 最终判断', 'cyan'))
  console.log('='.repeat(50))

  if (checkResults.errors.length === 0 && checkResults.warnings.length === 0) {
    console.log(colorize('✅ 环境配置完美！可以安全启动服务', 'green'))
    console.log(colorize(`   当前环境：${process.env.NODE_ENV || 'development'}`, 'green'))
    process.exit(0)
  } else if (checkResults.errors.length === 0) {
    console.log(colorize('⚠️ 环境配置基本正确，但存在一些警告', 'yellow'))
    console.log(colorize('   建议优化后再启动服务', 'yellow'))
    process.exit(0)
  } else {
    console.log(colorize('❌ 环境配置存在错误，必须修复后才能启动', 'red'))
    console.log(colorize('💡 建议：', 'yellow'))
    console.log(colorize('   1. 检查 .env 文件是否存在', 'yellow'))
    console.log(colorize('   2. 参考 .env.sample 补充缺失配置', 'yellow'))
    console.log(colorize('   3. 查看文档：docs/环境配置与判断机制.md', 'yellow'))
    process.exit(1)
  }
}

// 🚀 主函数
async function main () {
  console.log('\n' + colorize('🌍 环境配置检查工具', 'magenta'))
  console.log(colorize('Restaurant Lottery System V4', 'magenta'))
  console.log(colorize('检查时间：' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }), 'magenta'))
  console.log('='.repeat(50))

  // 执行所有检查
  checkNodeEnv()
  checkDatabaseConfig()
  checkSmsConfig()
  checkPortConfig()
  checkSecurityConfig()
  checkLoggingConfig()

  // 生成报告
  generateReport()
}

// 执行检查
main().catch(error => {
  console.error(colorize('❌ 检查过程出错：', 'red'), error.message)
  process.exit(1)
})
