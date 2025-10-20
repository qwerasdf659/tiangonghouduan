#!/usr/bin/env node

/**
 * 诊断工具统一工具包 (Diagnostic Toolkit)
 *
 * 整合来源：
 * - scripts/diagnostic/analyze-duplicate-transactions.js (分析重复交易)
 * - scripts/diagnostic/diagnose-user-points-issue.js (诊断用户积分问题)
 * - scripts/diagnostic/fix-points-balance-inconsistency.js (修复积分余额不一致)
 * - scripts/diagnostic/login-api-test.js (测试登录API)
 *
 * 使用方式：
 * node scripts/diagnostic/diagnostic-toolkit.js                # 交互式菜单
 * node scripts/diagnostic/diagnostic-toolkit.js diagnose       # 诊断积分问题
 * node scripts/diagnostic/diagnostic-toolkit.js fix            # 修复积分问题
 * node scripts/diagnostic/diagnostic-toolkit.js test-login     # 测试登录
 *
 * V2.0 重构版本
 * 创建时间：2025年10月15日 北京时间
 */

'use strict'

const { UserPointsAccount, PointsTransaction, LotteryDraw, LotteryPrize, User } = require('../../models')
const { Op: _Op } = require('sequelize') // 保留供未来使用
const BeijingTimeHelper = require('../../utils/timeHelper')
const inquirer = require('inquirer')
const axios = require('axios')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

function log (message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// ==================== 核心功能 ====================

/**
 * 诊断用户积分问题
 */
async function diagnoseUserPointsIssue (mobile = null) {
  log('\n🔍 诊断用户积分问题', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    // 如果没有提供手机号，提示输入
    if (!mobile) {
      const { inputMobile } = await inquirer.prompt([
        {
          type: 'input',
          name: 'inputMobile',
          message: '请输入要诊断的用户手机号:',
          validate: (input) => {
            if (input.length !== 11) {
              return '请输入11位手机号'
            }
            if (!/^1[3-9]\d{9}$/.test(input)) {
              return '手机号格式不正确'
            }
            return true
          }
        }
      ])
      mobile = inputMobile
    }

    log(`\n诊断对象: ${mobile}`, 'cyan')
    log(`诊断时间: ${BeijingTimeHelper.nowLocale()}`, 'cyan')

    // 1. 查找用户
    log('\n📌 步骤1: 查找用户信息...', 'blue')
    const user = await User.findOne({ where: { mobile } })
    if (!user) {
      log(`❌ 用户不存在: ${mobile}`, 'red')
      return
    }
    log(`✅ 找到用户: ${user.username} (ID: ${user.user_id})`, 'green')
    log(`   历史总积分: ${user.history_total_points}`, 'yellow')

    const user_id = user.user_id

    // 2. 查询积分账户
    log('\n📌 步骤2: 查询积分账户状态...', 'blue')
    const account = await UserPointsAccount.findOne({ where: { user_id } })
    if (!account) {
      log('❌ 积分账户不存在', 'red')
      return
    }
    log('✅ 积分账户信息:', 'green')
    log(`   可用积分: ${account.available_points}`, 'yellow')
    log(`   总获得积分: ${account.total_earned}`, 'yellow')
    log(`   总消费积分: ${account.total_consumed}`, 'yellow')
    log(`   计算余额: ${account.total_earned - account.total_consumed}`, 'yellow')

    // 3. 查询最近的积分交易记录
    log('\n📌 步骤3: 分析最近的积分交易记录...', 'blue')
    const recentTransactions = await PointsTransaction.findAll({
      where: { user_id },
      order: [['transaction_time', 'DESC']],
      limit: 20
    })

    if (recentTransactions.length === 0) {
      log('⚠️  没有找到积分交易记录', 'yellow')
    } else {
      log(`✅ 找到 ${recentTransactions.length} 条最近的交易记录:\n`, 'green')

      recentTransactions.forEach((trans, index) => {
        const typeColor = trans.transaction_type === 'earn' ? 'green' : 'red'
        const typeSymbol = trans.transaction_type === 'earn' ? '+' : '-'

        log(`   [${index + 1}] ${trans.transaction_time}`, typeColor)
        log(`       类型: ${trans.transaction_type} (${trans.business_type})`, typeColor)
        log(`       金额: ${typeSymbol}${trans.points_amount}`, typeColor)
        log(`       余额: ${trans.after_balance}`, typeColor)
      })
    }

    // 4. 查询最近的抽奖记录
    log('\n📌 步骤4: 查询最近的抽奖记录...', 'blue')
    const recentDraws = await LotteryDraw.findAll({
      where: { user_id },
      include: [{ model: LotteryPrize, as: 'prize' }],
      order: [['draw_time', 'DESC']],
      limit: 10
    })

    if (recentDraws.length === 0) {
      log('⚠️  没有找到抽奖记录', 'yellow')
    } else {
      log(`✅ 找到 ${recentDraws.length} 条最近的抽奖记录:\n`, 'green')

      recentDraws.forEach((draw, index) => {
        log(`   [${index + 1}] ${draw.draw_time}`, 'cyan')
        log(`       奖品: ${draw.prize?.name || '未知'}`, 'cyan')
        log(`       消耗积分: ${draw.points_cost}`, 'cyan')
        log(`       状态: ${draw.status}`, 'cyan')
      })
    }

    // 5. 数据一致性检查
    log('\n📌 步骤5: 数据一致性检查...', 'blue')
    const calculatedBalance = account.total_earned - account.total_consumed
    const diff = calculatedBalance - account.available_points

    if (diff === 0) {
      log('✅ 积分数据一致，没有问题', 'green')
    } else {
      log('❌ 积分数据不一致！', 'red')
      log(`   账户显示可用积分: ${account.available_points}`, 'yellow')
      log(`   根据交易计算余额: ${calculatedBalance}`, 'yellow')
      log(`   差异: ${diff}`, 'red')
      log('\n💡 建议执行修复操作', 'yellow')
    }

    return {
      user,
      account,
      isConsistent: diff === 0,
      difference: diff
    }
  } catch (error) {
    log(`\n❌ 诊断失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 分析重复交易记录
 */
async function analyzeDuplicateTransactions () {
  log('\n🔍 分析重复交易记录', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    // 查找可能重复的交易（相同用户、相同时间、相同金额）
    const [results] = await PointsTransaction.sequelize.query(`
      SELECT 
        user_id,
        transaction_type,
        points_amount,
        DATE_FORMAT(transaction_time, '%Y-%m-%d %H:%i:%s') as time_group,
        COUNT(*) as count
      FROM points_transactions
      GROUP BY user_id, transaction_type, points_amount, time_group
      HAVING COUNT(*) > 1
      ORDER BY count DESC, time_group DESC
      LIMIT 50
    `)

    if (results.length === 0) {
      log('\n✅ 没有发现重复交易记录', 'green')
      return { hasDuplicates: false }
    }

    log(`\n⚠️  发现 ${results.length} 组可能重复的交易:\n`, 'yellow')

    results.forEach((result, index) => {
      log(`[${index + 1}] 用户ID: ${result.user_id}`, 'yellow')
      log(`    类型: ${result.transaction_type}`, 'yellow')
      log(`    金额: ${result.points_amount}`, 'yellow')
      log(`    时间: ${result.time_group}`, 'yellow')
      log(`    重复次数: ${result.count}`, 'red')
      log('')
    })

    log('💡 建议: 检查这些交易是否为真实重复', 'cyan')

    return { hasDuplicates: true, count: results.length, results }
  } catch (error) {
    log(`\n❌ 分析失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 修复积分余额不一致
 */
async function fixPointsBalanceInconsistency () {
  log('\n🔧 修复积分余额不一致', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    // 1. 查找所有积分账户
    log('\n📌 扫描所有积分账户...', 'blue')
    const accounts = await UserPointsAccount.findAll()

    log(`找到 ${accounts.length} 个积分账户`, 'cyan')

    let fixedCount = 0
    const inconsistentAccounts = []

    // 2. 检查每个账户
    for (const account of accounts) {
      const calculatedBalance = account.total_earned - account.total_consumed
      const diff = calculatedBalance - account.available_points

      if (diff !== 0) {
        inconsistentAccounts.push({
          user_id: account.user_id,
          available_points: account.available_points,
          calculated_balance: calculatedBalance,
          difference: diff
        })
      }
    }

    if (inconsistentAccounts.length === 0) {
      log('\n✅ 所有账户数据一致，无需修复', 'green')
      return { fixed: false, count: 0 }
    }

    log(`\n⚠️  发现 ${inconsistentAccounts.length} 个账户数据不一致:\n`, 'yellow')

    inconsistentAccounts.forEach((acc, index) => {
      log(`[${index + 1}] 用户ID: ${acc.user_id}`, 'yellow')
      log(`    当前余额: ${acc.available_points}`, 'yellow')
      log(`    计算余额: ${acc.calculated_balance}`, 'yellow')
      log(`    差异: ${acc.difference}`, 'red')
      log('')
    })

    // 3. 询问是否修复
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确定要修复这 ${inconsistentAccounts.length} 个账户吗？`,
        default: false
      }
    ])

    if (!confirm) {
      log('\n❌ 取消修复', 'yellow')
      return { fixed: false, count: 0 }
    }

    // 4. 执行修复
    log('\n🔧 开始修复...', 'cyan')

    for (const acc of inconsistentAccounts) {
      await UserPointsAccount.update(
        { available_points: acc.calculated_balance },
        { where: { user_id: acc.user_id } }
      )
      fixedCount++
      log(`✅ 修复用户 ${acc.user_id}: ${acc.available_points} → ${acc.calculated_balance}`, 'green')
    }

    log(`\n✅ 修复完成！共修复 ${fixedCount} 个账户`, 'green')

    return { fixed: true, count: fixedCount }
  } catch (error) {
    log(`\n❌ 修复失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 测试登录API
 */
async function testLoginAPI () {
  log('\n🧪 测试登录API', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    const { mobile } = await inquirer.prompt([
      {
        type: 'input',
        name: 'mobile',
        message: '请输入测试手机号:',
        default: '13612227930'
      }
    ])

    log(`\n正在测试手机号: ${mobile}`, 'cyan')

    // 1. 测试发送验证码
    log('\n1️⃣  测试发送验证码...', 'blue')
    try {
      const sendCodeResponse = await axios.post('http://localhost:3000/api/v2/auth/send-code', {
        mobile,
        scene: 'login'
      })

      if (sendCodeResponse.data.success) {
        log('✅ 验证码发送成功', 'green')
        log(`   消息: ${sendCodeResponse.data.message}`, 'cyan')
      } else {
        log(`❌ 验证码发送失败: ${sendCodeResponse.data.message}`, 'red')
      }
    } catch (error) {
      log(`❌ 发送验证码失败: ${error.message}`, 'red')
    }

    // 2. 测试登录（使用123456万能验证码）
    log('\n2️⃣  测试登录（使用万能验证码123456）...', 'blue')
    try {
      const loginResponse = await axios.post('http://localhost:3000/api/v2/auth/login', {
        mobile,
        code: '123456'
      })

      if (loginResponse.data.success) {
        log('✅ 登录成功', 'green')
        log(`   Token: ${loginResponse.data.data.token.substring(0, 50)}...`, 'cyan')
        log(`   用户: ${loginResponse.data.data.user.username}`, 'cyan')
        log(`   角色: ${loginResponse.data.data.user.role || '未知'}`, 'cyan')
      } else {
        log(`❌ 登录失败: ${loginResponse.data.message}`, 'red')
      }
    } catch (error) {
      log(`❌ 登录请求失败: ${error.message}`, 'red')
      if (error.response) {
        log(`   状态码: ${error.response.status}`, 'red')
        log(`   响应: ${JSON.stringify(error.response.data, null, 2)}`, 'red')
      }
    }

    log('\n✅ 测试完成', 'green')
  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'red')
  }
}

/**
 * 综合健康检查
 */
async function comprehensiveHealthCheck () {
  log('\n🏥 综合健康检查', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    log('\n执行检查项目...', 'blue')

    // 1. 分析重复交易
    log('\n1️⃣  检查重复交易...', 'blue')
    const duplicateResult = await analyzeDuplicateTransactions()

    // 2. 检查积分一致性
    log('\n2️⃣  检查积分一致性...', 'blue')
    const accounts = await UserPointsAccount.findAll()
    let inconsistentCount = 0

    for (const account of accounts) {
      const calculatedBalance = account.total_earned - account.total_consumed
      const diff = calculatedBalance - account.available_points
      if (diff !== 0) {
        inconsistentCount++
      }
    }

    if (inconsistentCount === 0) {
      log('✅ 所有账户积分一致', 'green')
    } else {
      log(`⚠️  发现 ${inconsistentCount} 个账户积分不一致`, 'yellow')
    }

    // 3. 生成报告
    log('\n📊 健康检查报告:', 'cyan')
    log('='.repeat(60))
    log(`重复交易: ${duplicateResult.hasDuplicates ? '⚠️  有' : '✅ 无'}`)
    log(`积分不一致账户: ${inconsistentCount > 0 ? `⚠️  ${inconsistentCount}个` : '✅ 0个'}`)

    const allHealthy = !duplicateResult.hasDuplicates && inconsistentCount === 0

    if (allHealthy) {
      log('\n✅ 系统健康状态良好!', 'green')
    } else {
      log('\n⚠️  系统存在健康问题，建议修复', 'yellow')
    }

    return { allHealthy, duplicates: duplicateResult, inconsistentCount }
  } catch (error) {
    log(`\n❌ 健康检查失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 主菜单 ====================

async function showMenu () {
  log('\n' + '='.repeat(60), 'cyan')
  log('  🔍 诊断工具统一工具包 (Diagnostic Toolkit V2.0)', 'cyan')
  log('='.repeat(60), 'cyan')

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '请选择诊断操作:',
      choices: [
        { name: '1. 🔍 诊断用户积分问题', value: 'diagnose' },
        { name: '2. 📊 分析重复交易记录', value: 'analyze-duplicates' },
        { name: '3. 🔧 修复积分余额不一致', value: 'fix' },
        { name: '4. 🧪 测试登录API', value: 'test-login' },
        { name: '5. 🏥 综合健康检查', value: 'health' },
        new inquirer.Separator(),
        { name: '9. 🚪 退出', value: 'exit' }
      ]
    }
  ])

  if (action === 'exit') {
    log('\n👋 再见!\n', 'cyan')
    return
  }

  await executeAction(action)

  // 显示继续提示
  const { continueMenu } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continueMenu',
      message: '是否继续其他操作?',
      default: true
    }
  ])

  if (continueMenu) {
    await showMenu()
  } else {
    log('\n👋 再见!\n', 'cyan')
  }
}

async function executeAction (action) {
  try {
    switch (action) {
    case 'diagnose':
      await diagnoseUserPointsIssue()
      break
    case 'analyze-duplicates':
      await analyzeDuplicateTransactions()
      break
    case 'fix':
      await fixPointsBalanceInconsistency()
      break
    case 'test-login':
      await testLoginAPI()
      break
    case 'health':
      await comprehensiveHealthCheck()
      break
    default:
      log(`\n❌ 未知操作: ${action}`, 'red')
    }
  } catch (error) {
    log(`\n❌ 执行失败: ${error.message}`, 'red')
  }
}

// ==================== 主程序入口 ====================

async function main () {
  try {
    // 检查是否通过命令行参数直接执行
    const args = process.argv.slice(2)
    if (args.length > 0) {
      const action = args[0]
      if (['diagnose', 'analyze-duplicates', 'fix', 'test-login', 'health'].includes(action)) {
        await executeAction(action)
        return
      }
    }

    // 显示交互式菜单
    await showMenu()
  } catch (error) {
    log(`\n❌ 执行失败: ${error.message}`, 'red')
    if (error.stack) {
      log(`\n堆栈信息:\n${error.stack}`, 'red')
    }
    process.exit(1)
  }
}

// 直接执行
if (require.main === module) {
  main().catch(error => {
    log(`\n❌ 未捕获的错误: ${error.message}`, 'red')
    process.exit(1)
  })
}

module.exports = {
  diagnoseUserPointsIssue,
  analyzeDuplicateTransactions,
  fixPointsBalanceInconsistency,
  testLoginAPI,
  comprehensiveHealthCheck
}
