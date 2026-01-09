/**
 * 🌍 环境配置检查工具
 *
 * 功能：
 * - 基于 CONFIG_SCHEMA 统一校验环境变量
 * - 与应用启动校验使用同一套逻辑
 * - 提供详细的错误提示和修复建议
 *
 * 架构升级（2025-12-30 配置管理三层分离方案）：
 * - 使用 ConfigValidator 统一校验逻辑
 * - 与 app.js 启动校验共用同一份 CONFIG_SCHEMA
 * - 消除"脚本通过但启动失败"的问题
 *
 * 使用方法：
 * node scripts/check-environment.js
 *
 * 参考文档：docs/配置管理三层分离与校验统一方案.md
 */

'use strict'

// 加载环境变量（独立脚本需要自行加载）
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

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`
}

/**
 * 主函数
 */
async function main() {
  console.log('\n' + colorize('🌍 环境配置检查工具', 'magenta'))
  console.log(colorize('Restaurant Lottery System V4 - 统一校验架构', 'magenta'))
  console.log(
    colorize(
      '检查时间：' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      'magenta'
    )
  )
  console.log('='.repeat(60))

  const targetEnv = process.env.NODE_ENV || 'development'
  console.log(colorize(`\n📍 目标环境：${targetEnv}`, 'cyan'))

  // 使用统一校验器（与 app.js 同一套逻辑）
  const { ConfigValidator } = require('../config/validator')

  console.log(colorize('\n🔍 开始校验环境变量（基于 CONFIG_SCHEMA）...', 'cyan'))
  console.log('='.repeat(60))

  // failFast=false，收集所有错误后统一输出
  const result = ConfigValidator.validate(targetEnv, false)

  // 生成详细报告
  console.log('\n' + colorize('📊 环境检查报告', 'cyan'))
  console.log('='.repeat(60))

  const totalErrors = result.errors.length
  const totalWarnings = result.warnings.length

  if (result.valid) {
    console.log(colorize('✅ 环境配置完美！可以安全启动服务', 'green'))
    console.log(colorize(`   当前环境：${targetEnv}`, 'green'))

    // 显示环境提示
    if (targetEnv === 'development') {
      console.log(colorize('\n📝 开发环境提示：', 'blue'))
      console.log(colorize('   - 可使用万能验证码 123456（如短信服务未配置）', 'blue'))
      console.log(colorize('   - 建议配置完整的环境变量以避免生产环境问题', 'blue'))
    } else if (targetEnv === 'production') {
      console.log(colorize('\n🔒 生产环境提示：', 'magenta'))
      console.log(colorize('   - 确保所有密钥都是强随机值', 'magenta'))
      console.log(colorize('   - 确保没有使用占位符（CHANGE_ME_*）', 'magenta'))
    }

    process.exit(0)
  } else {
    console.log(colorize(`❌ 检测到 ${totalErrors} 个错误，${totalWarnings} 个警告`, 'red'))

    if (totalErrors > 0) {
      console.log(colorize('\n❌ 错误列表（必须修复）：', 'red'))
      result.errors.forEach((err, index) => {
        console.log(colorize(`\n   ${index + 1}. [${err.type}] ${err.message}`, 'red'))
        if (err.fix) {
          console.log(colorize(`      修复方案: ${err.fix}`, 'yellow'))
        }
      })
    }

    if (totalWarnings > 0) {
      console.log(colorize('\n⚠️ 警告列表（建议修复）：', 'yellow'))
      result.warnings.forEach((warn, index) => {
        console.log(colorize(`   ${index + 1}. ${warn.message}`, 'yellow'))
      })
    }

    console.log(colorize('\n💡 修复建议：', 'yellow'))
    console.log(colorize('   1. 检查 .env 文件是否存在且配置正确', 'yellow'))
    console.log(colorize('   2. 参考 config.example 补充缺失配置', 'yellow'))
    console.log(colorize('   3. 查看文档：docs/配置管理三层分离与校验统一方案.md', 'yellow'))

    // 密钥生成提示
    const secretErrors = result.errors.filter(
      e =>
        e.key && (e.key.includes('SECRET') || e.key.includes('KEY') || e.key.includes('PASSWORD'))
    )
    if (secretErrors.length > 0) {
      console.log(colorize('\n🔐 密钥生成命令：', 'cyan'))
      console.log(
        colorize(
          "   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
          'cyan'
        )
      )
    }

    process.exit(1)
  }
}

// 执行检查
main().catch(error => {
  console.error(colorize('❌ 检查过程出错：', 'red'), error.message)
  console.error(error.stack)
  process.exit(1)
})
