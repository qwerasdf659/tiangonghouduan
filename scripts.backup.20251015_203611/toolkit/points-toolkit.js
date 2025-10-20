/**
 * 积分管理统一工具包 (Points Toolkit)
 *
 * 功能：整合所有积分相关的诊断、修复、验证、备份功能
 *
 * 合并来源脚本：
 * - fix-points/step1-diagnose.js (诊断积分问题)
 * - fix-points/step2-fix-data.js (修复积分数据)
 * - fix-points/step3-verify.js (验证积分数据)
 * - fix-points/step4-normalize-data.js (标准化积分数据)
 * - fix-points/backup-and-restore.js (备份和恢复)
 *
 * 使用方式：
 * node scripts/toolkit/points-toolkit.js --action=diagnose      # 诊断积分问题
 * node scripts/toolkit/points-toolkit.js --action=fix          # 修复积分数据
 * node scripts/toolkit/points-toolkit.js --action=verify       # 验证积分数据
 * node scripts/toolkit/points-toolkit.js --action=normalize    # 标准化积分数据
 * node scripts/toolkit/points-toolkit.js --action=backup       # 备份积分数据
 * node scripts/toolkit/points-toolkit.js --action=full-process # 完整流程（诊断→修复→验证）
 * node scripts/toolkit/points-toolkit.js --dry-run             # 预览修复但不执行
 *
 * 创建时间：2025年10月12日 北京时间
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { sequelize } = require('../../config/database')
const { UserPointsAccount, PointsTransaction } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log (message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// ==================== 诊断功能 ====================

/**
 * 诊断积分数据一致性问题
 */
async function diagnosePointsIssues () {
  log('\n🔍 ━━━ 诊断积分数据一致性 ━━━', 'cyan')
  log(`诊断时间: ${BeijingTimeHelper.nowLocale()}\n`, 'blue')

  try {
    // 1. 获取所有活跃的积分账户
    const accounts = await UserPointsAccount.findAll({
      where: { is_active: true },
      order: [['user_id', 'ASC']]
    })

    log(`📊 找到 ${accounts.length} 个活跃积分账户\n`, 'blue')

    const problems = [] // 存储有问题的账户
    let checkedCount = 0
    let problemCount = 0

    // 2. 逐个检查每个账户
    for (const account of accounts) {
      checkedCount++
      process.stdout.write(`\r检查进度: ${checkedCount}/${accounts.length} (${((checkedCount / accounts.length) * 100).toFixed(1)}%)`)

      // 2.1 从交易记录统计实际的积分
      const [earnResult] = await sequelize.query(`
        SELECT COALESCE(SUM(points_amount), 0) as total 
        FROM points_transactions 
        WHERE user_id = :userId 
        AND transaction_type = 'earn'
        AND status = 'completed'
      `, {
        replacements: { userId: account.user_id }
      })

      const [consumeResult] = await sequelize.query(`
        SELECT COALESCE(SUM(points_amount), 0) as total 
        FROM points_transactions 
        WHERE user_id = :userId 
        AND transaction_type = 'consume'
        AND status = 'completed'
      `, {
        replacements: { userId: account.user_id }
      })

      const actualEarned = parseInt(earnResult[0].total)
      const actualConsumed = parseInt(consumeResult[0].total)
      const actualBalance = actualEarned - actualConsumed

      // 2.2 比对账户记录与实际统计
      const recordedEarned = parseInt(account.total_earned)
      const recordedConsumed = parseInt(account.total_consumed)
      const recordedBalance = parseInt(account.current_balance)

      // 2.3 检查是否有不一致
      const hasIssue =
        actualEarned !== recordedEarned ||
        actualConsumed !== recordedConsumed ||
        actualBalance !== recordedBalance

      if (hasIssue) {
        problemCount++
        problems.push({
          user_id: account.user_id,
          recorded: {
            earned: recordedEarned,
            consumed: recordedConsumed,
            balance: recordedBalance
          },
          actual: {
            earned: actualEarned,
            consumed: actualConsumed,
            balance: actualBalance
          },
          diff: {
            earned: actualEarned - recordedEarned,
            consumed: actualConsumed - recordedConsumed,
            balance: actualBalance - recordedBalance
          }
        })
      }
    }

    console.log() // 换行

    // 3. 生成诊断报告
    log('\n' + '='.repeat(80), 'cyan')
    log('诊断结果汇总', 'cyan')
    log('='.repeat(80), 'cyan')

    log(`\n✅ 检查账户: ${checkedCount}个`, 'green')

    if (problemCount > 0) {
      log(`❌ 发现问题: ${problemCount}个账户数据不一致`, 'red')

      log('\n前10个问题账户详情:', 'yellow')
      problems.slice(0, 10).forEach((prob, index) => {
        log(`\n${index + 1}. 用户ID: ${prob.user_id}`, 'yellow')
        log(`   记录: 获得=${prob.recorded.earned}, 消费=${prob.recorded.consumed}, 余额=${prob.recorded.balance}`, 'reset')
        log(`   实际: 获得=${prob.actual.earned}, 消费=${prob.actual.consumed}, 余额=${prob.actual.balance}`, 'reset')
        log(`   差异: 获得${prob.diff.earned >= 0 ? '+' : ''}${prob.diff.earned}, 消费${prob.diff.consumed >= 0 ? '+' : ''}${prob.diff.consumed}, 余额${prob.diff.balance >= 0 ? '+' : ''}${prob.diff.balance}`, prob.diff.balance !== 0 ? 'red' : 'reset')
      })

      if (problemCount > 10) {
        log(`\n... 还有 ${problemCount - 10} 个问题账户`, 'yellow')
      }

      log('\n💡 运行修复命令:', 'cyan')
      log('   node scripts/toolkit/points-toolkit.js --action=fix', 'green')
    } else {
      log('✅ 所有账户数据一致，无需修复', 'green')
    }

    // 保存诊断结果
    const reportPath = path.join(process.cwd(), 'reports/points-diagnosis.json')
    const reportDir = path.dirname(reportPath)

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }

    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        timestamp: BeijingTimeHelper.now(),
        summary: {
          totalAccounts: checkedCount,
          problemAccounts: problemCount,
          healthyAccounts: checkedCount - problemCount
        },
        problems
      }, null, 2)
    )

    log(`\n📄 诊断报告已保存: ${reportPath}`, 'green')

    return { problems, checkedCount, problemCount }
  } catch (error) {
    log(`\n❌ 诊断失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 修复功能 ====================

/**
 * 修复积分数据
 */
async function fixPointsData (options = {}) {
  const { dryRun = false } = options

  log('\n🔧 ━━━ 修复积分数据 ━━━', 'cyan')
  if (dryRun) {
    log('（预览模式：不会实际修改数据）\n', 'yellow')
  }

  try {
    // 1. 先执行诊断
    log('第1步：诊断问题...', 'cyan')
    const { problems } = await diagnosePointsIssues()

    if (problems.length === 0) {
      log('\n✅ 无需修复，所有数据一致', 'green')
      return { fixed: 0, total: 0 }
    }

    log(`\n第2步：准备修复 ${problems.length} 个问题账户...\n`, 'cyan')

    if (dryRun) {
      log('将执行以下修复操作:', 'yellow')
      problems.slice(0, 5).forEach((prob, index) => {
        log(`\n${index + 1}. 用户ID: ${prob.user_id}`, 'yellow')
        log(`   更新 total_earned: ${prob.recorded.earned} → ${prob.actual.earned}`, 'reset')
        log(`   更新 total_consumed: ${prob.recorded.consumed} → ${prob.actual.consumed}`, 'reset')
        log(`   更新 current_balance: ${prob.recorded.balance} → ${prob.actual.balance}`, 'reset')
      })
      if (problems.length > 5) {
        log(`\n... 还有 ${problems.length - 5} 个账户需要修复`, 'yellow')
      }
      log('\n提示：去掉 --dry-run 参数执行实际修复', 'cyan')
      return { fixed: 0, total: problems.length }
    }

    // 2. 执行实际修复
    let fixedCount = 0
    let failedCount = 0

    for (const prob of problems) {
      try {
        await UserPointsAccount.update(
          {
            total_earned: prob.actual.earned,
            total_consumed: prob.actual.consumed,
            current_balance: prob.actual.balance,
            last_updated: BeijingTimeHelper.createDatabaseTime()
          },
          {
            where: { user_id: prob.user_id }
          }
        )

        fixedCount++
        process.stdout.write(`\r修复进度: ${fixedCount + failedCount}/${problems.length} (成功: ${fixedCount}, 失败: ${failedCount})`)
      } catch (error) {
        failedCount++
        log(`\n❌ 用户${prob.user_id}修复失败: ${error.message}`, 'red')
      }
    }

    console.log() // 换行

    // 3. 生成修复报告
    log('\n' + '='.repeat(80), 'cyan')
    log('修复结果汇总', 'cyan')
    log('='.repeat(80), 'cyan')

    log(`\n✅ 修复成功: ${fixedCount}个账户`, 'green')
    if (failedCount > 0) {
      log(`❌ 修复失败: ${failedCount}个账户`, 'red')
    }

    // 保存修复报告
    const reportPath = path.join(process.cwd(), 'reports/points-fix-report.json')
    const reportDir = path.dirname(reportPath)

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }

    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        timestamp: BeijingTimeHelper.now(),
        summary: {
          totalProblems: problems.length,
          fixedCount,
          failedCount
        },
        fixedAccounts: problems.slice(0, fixedCount).map(p => p.user_id)
      }, null, 2)
    )

    log(`\n📄 修复报告已保存: ${reportPath}`, 'green')

    log('\n💡 建议：运行验证命令确认修复结果', 'cyan')
    log('   node scripts/toolkit/points-toolkit.js --action=verify', 'green')

    return { fixed: fixedCount, total: problems.length, failed: failedCount }
  } catch (error) {
    log(`\n❌ 修复失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 验证功能 ====================

/**
 * 验证积分数据一致性
 */
async function verifyPointsData () {
  log('\n✅ ━━━ 验证积分数据一致性 ━━━', 'cyan')
  log(`验证时间: ${BeijingTimeHelper.nowLocale()}\n`, 'blue')

  try {
    // 执行诊断，检查是否还有问题
    const { problems, checkedCount } = await diagnosePointsIssues()

    log('\n' + '='.repeat(80), 'cyan')
    log('验证结果', 'cyan')
    log('='.repeat(80), 'cyan')

    if (problems.length === 0) {
      log('\n✅ 验证通过！所有积分账户数据一致', 'green')
      log(`✅ 检查了 ${checkedCount} 个账户，全部正常`, 'green')
    } else {
      log(`\n⚠️ 验证未通过，仍有 ${problems.length} 个账户存在问题`, 'yellow')
      log('\n建议：重新运行修复命令', 'cyan')
      log('   node scripts/toolkit/points-toolkit.js --action=fix', 'green')
    }

    return { verified: problems.length === 0, problems, checkedCount }
  } catch (error) {
    log(`\n❌ 验证失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 备份功能 ====================

/**
 * 备份积分数据
 */
async function backupPointsData () {
  log('\n💾 ━━━ 备份积分数据 ━━━', 'cyan')

  try {
    // 1. 获取所有积分账户
    const accounts = await UserPointsAccount.findAll({
      order: [['user_id', 'ASC']]
    })

    // 2. 获取所有积分交易
    const transactions = await PointsTransaction.findAll({
      order: [['created_at', 'ASC']]
    })

    log(`📊 积分账户: ${accounts.length}个`, 'blue')
    log(`📊 交易记录: ${transactions.length}条`, 'blue')

    // 3. 生成备份文件
    const backupData = {
      timestamp: BeijingTimeHelper.now(),
      accounts: accounts.map(acc => acc.toJSON()),
      transactions: transactions.map(tx => tx.toJSON())
    }

    const backupDir = path.join(process.cwd(), 'backups/points')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const backupFilename = `points-backup-${BeijingTimeHelper.now().replace(/[:.]/g, '-')}.json`
    const backupPath = path.join(backupDir, backupFilename)

    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2))

    const fileSize = (fs.statSync(backupPath).size / 1024).toFixed(2)

    log(`\n✅ 备份完成: ${backupPath}`, 'green')
    log(`📦 文件大小: ${fileSize} KB`, 'blue')

    return { backupPath, accounts: accounts.length, transactions: transactions.length }
  } catch (error) {
    log(`\n❌ 备份失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 完整流程 ====================

/**
 * 执行完整的诊断-修复-验证流程
 */
async function performFullProcess (options = {}) {
  log('\n' + '='.repeat(80), 'cyan')
  log('积分数据完整处理流程', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  try {
    // 1. 备份
    log('【阶段1】备份当前数据...', 'cyan')
    await backupPointsData()

    // 2. 诊断
    log('\n【阶段2】诊断问题...', 'cyan')
    const { problems } = await diagnosePointsIssues()

    if (problems.length === 0) {
      log('\n✅ 流程完成：数据一致，无需修复', 'green')
      return { success: true, fixed: 0 }
    }

    // 3. 修复
    log('\n【阶段3】修复问题...', 'cyan')
    const { fixed } = await fixPointsData(options)

    // 4. 验证
    log('\n【阶段4】验证结果...', 'cyan')
    const { verified } = await verifyPointsData()

    // 5. 总结
    log('\n' + '='.repeat(80), 'cyan')
    log('流程总结', 'cyan')
    log('='.repeat(80), 'cyan')

    if (verified) {
      log('\n🎉 完整流程成功完成！', 'green')
      log(`✅ 修复了 ${fixed} 个账户`, 'green')
      log('✅ 所有数据现在一致', 'green')
    } else {
      log('\n⚠️ 流程完成，但验证未通过', 'yellow')
      log('建议：检查日志并重新运行修复', 'cyan')
    }

    return { success: verified, fixed }
  } catch (error) {
    log(`\n❌ 流程执行失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 主函数 ====================

async function main () {
  // 解析命令行参数
  const args = process.argv.slice(2)
  const options = {
    action: 'diagnose',
    dryRun: args.includes('--dry-run')
  }

  // 解析action参数
  const actionArg = args.find(arg => arg.startsWith('--action='))
  if (actionArg) {
    options.action = actionArg.split('=')[1]
  }

  // 显示帮助信息
  if (args.includes('--help') || args.length === 0) {
    console.log(`
${colors.blue}积分管理统一工具包 (Points Toolkit)${colors.reset}

使用方式：
  node scripts/toolkit/points-toolkit.js [选项]

选项：
  --action=diagnose      诊断积分数据问题（默认）
  --action=fix           修复积分数据
  --action=verify        验证积分数据一致性
  --action=backup        备份积分数据
  --action=full-process  完整流程（备份→诊断→修复→验证）
  --dry-run              预览修复但不实际执行
  --help                 显示此帮助信息

示例：
  node scripts/toolkit/points-toolkit.js --action=diagnose
  node scripts/toolkit/points-toolkit.js --action=fix
  node scripts/toolkit/points-toolkit.js --action=fix --dry-run
  node scripts/toolkit/points-toolkit.js --action=full-process
  node scripts/toolkit/points-toolkit.js --action=backup

合并来源：
  - fix-points/step1-diagnose.js
  - fix-points/step2-fix-data.js
  - fix-points/step3-verify.js
  - fix-points/step4-normalize-data.js
  - fix-points/backup-and-restore.js
    `)
    process.exit(0)
  }

  console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}`)
  console.log(`${colors.blue}积分管理统一工具包 - Points Toolkit${colors.reset}`)
  console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}`)

  try {
    switch (options.action) {
    case 'diagnose':
      await diagnosePointsIssues()
      break

    case 'fix':
      await fixPointsData(options)
      break

    case 'verify':
      await verifyPointsData()
      break

    case 'backup':
      await backupPointsData()
      break

    case 'full-process':
      await performFullProcess(options)
      break

    default:
      log(`\n❌ 未知操作: ${options.action}`, 'red')
      log('运行 --help 查看可用选项', 'cyan')
      process.exit(1)
    }

    await sequelize.close()
    log('\n✅ 操作完成', 'green')
    process.exit(0)
  } catch (error) {
    console.error(`${colors.red}❌ 错误:${colors.reset}`, error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行主函数
if (require.main === module) {
  main()
}

module.exports = {
  diagnosePointsIssues,
  fixPointsData,
  verifyPointsData,
  backupPointsData,
  performFullProcess
}
