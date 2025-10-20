/**
 * 系统数据清理统一工具 (Cleanup Tool)
 *
 * 功能：整合所有数据清理相关功能
 *
 * 合并来源脚本：
 * - cleanup_chat_orphans.js (清理孤儿聊天消息)
 * - cleanup-incomplete-lottery-data.js (清理不完整的抽奖数据)
 * - cleanup-remaining-date-usage.js (清理日期使用痕迹)
 * - v4_system_cleanup.js (V4系统清理)
 *
 * 使用方式：
 * node scripts/maintenance/cleanup.js --action=orphans          # 清理孤儿数据
 * node scripts/maintenance/cleanup.js --action=lottery          # 清理不完整抽奖数据
 * node scripts/maintenance/cleanup.js --action=old-sessions     # 清理过期会话
 * node scripts/maintenance/cleanup.js --action=all              # 执行所有清理
 * node scripts/maintenance/cleanup.js --dry-run                 # 预览清理但不执行
 *
 * 创建时间：2025年10月12日 北京时间
 */

'use strict'

const { sequelize } = require('../../models')
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

// ==================== 清理功能 ====================

/**
 * 清理孤儿聊天消息
 * 清理引用不存在的customer_sessions的chat_messages
 */
async function cleanupOrphanMessages (dryRun = false) {
  log('\n🧹 ━━━ 清理孤儿聊天消息 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  try {
    // 查找孤儿消息
    const [orphanMessages] = await sequelize.query(`
      SELECT cm.* 
      FROM chat_messages cm
      LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
      WHERE cs.session_id IS NULL
    `)

    log(`📊 找到 ${orphanMessages.length} 条孤儿消息`, 'blue')

    if (orphanMessages.length === 0) {
      log('✅ 无孤儿消息需要清理\n', 'green')
      return { cleaned: 0 }
    }

    if (dryRun) {
      log('\n🔍 预览模式：以下消息将被删除:', 'yellow')
      orphanMessages.slice(0, 5).forEach((msg, i) => {
        log(`   ${i + 1}. message_id: ${msg.message_id}, session_id: ${msg.session_id}`, 'yellow')
      })
      if (orphanMessages.length > 5) {
        log(`   ... 还有 ${orphanMessages.length - 5} 条\n`, 'yellow')
      }
      return { cleaned: 0, preview: orphanMessages.length }
    }

    // 执行清理
    await sequelize.query(`
      DELETE cm FROM chat_messages cm
      LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
      WHERE cs.session_id IS NULL
    `)

    log(`✅ 成功清理 ${orphanMessages.length} 条孤儿消息\n`, 'green')
    return { cleaned: orphanMessages.length }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 清理不完整的抽奖数据
 * 清理没有对应积分交易的抽奖记录
 */
async function cleanupIncompleteLotteryData (dryRun = false) {
  log('\n🧹 ━━━ 清理不完整的抽奖数据 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  try {
    // 查找没有积分交易的抽奖记录
    const [incompleteDraws] = await sequelize.query(`
      SELECT ld.*
      FROM lottery_draws ld
      LEFT JOIN points_transactions pt ON ld.draw_id = pt.business_id 
        AND pt.business_type = 'lottery_consume'
      WHERE pt.transaction_id IS NULL
    `)

    // 查找没有抽奖记录的积分交易
    const [orphanTransactions] = await sequelize.query(`
      SELECT pt.*
      FROM points_transactions pt
      LEFT JOIN lottery_draws ld ON pt.business_id = ld.draw_id
      WHERE pt.business_type = 'lottery_consume'
        AND ld.draw_id IS NULL
    `)

    log(`📊 找到 ${incompleteDraws.length} 条无积分交易的抽奖记录`, 'blue')
    log(`📊 找到 ${orphanTransactions.length} 条无抽奖记录的积分交易`, 'blue')

    if (incompleteDraws.length === 0 && orphanTransactions.length === 0) {
      log('✅ 无不完整数据需要清理\n', 'green')
      return { cleaned: 0 }
    }

    if (dryRun) {
      log('\n🔍 预览模式：将清理以下数据:', 'yellow')
      log(`   - ${incompleteDraws.length} 条抽奖记录`, 'yellow')
      log(`   - ${orphanTransactions.length} 条积分交易\n`, 'yellow')
      return { cleaned: 0, preview: incompleteDraws.length + orphanTransactions.length }
    }

    const transaction = await sequelize.transaction()

    try {
      let cleaned = 0

      // 删除不完整的抽奖记录
      if (incompleteDraws.length > 0) {
        const drawIds = incompleteDraws.map(d => d.draw_id)
        await sequelize.query(`DELETE FROM lottery_draws WHERE draw_id IN (${drawIds.join(',')})`, {
          transaction
        })
        cleaned += incompleteDraws.length
      }

      // 删除孤儿积分交易
      if (orphanTransactions.length > 0) {
        const transactionIds = orphanTransactions.map(t => t.transaction_id)
        await sequelize.query(
          `DELETE FROM points_transactions WHERE transaction_id IN (${transactionIds.join(',')})`,
          { transaction }
        )
        cleaned += orphanTransactions.length
      }

      await transaction.commit()

      log(`✅ 成功清理 ${cleaned} 条不完整数据\n`, 'green')
      return { cleaned }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 清理过期会话
 * 清理超过30天的过期用户会话
 */
async function cleanupOldSessions (dryRun = false) {
  log('\n🧹 ━━━ 清理过期会话 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  try {
    // 计算30天前的时间
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const cutoffDate = thirtyDaysAgo.toISOString().slice(0, 19).replace('T', ' ')

    // 查找过期会话
    const [oldSessions] = await sequelize.query(`
      SELECT * FROM user_sessions
      WHERE expires_at < '${cutoffDate}'
        OR (last_activity < '${cutoffDate}' AND expires_at < NOW())
    `)

    log(`📊 找到 ${oldSessions.length} 个过期会话`, 'blue')

    if (oldSessions.length === 0) {
      log('✅ 无过期会话需要清理\n', 'green')
      return { cleaned: 0 }
    }

    if (dryRun) {
      log(`\n🔍 预览模式：将清理 ${oldSessions.length} 个过期会话\n`, 'yellow')
      return { cleaned: 0, preview: oldSessions.length }
    }

    // 执行清理
    await sequelize.query(`
      DELETE FROM user_sessions
      WHERE expires_at < '${cutoffDate}'
        OR (last_activity < '${cutoffDate}' AND expires_at < NOW())
    `)

    log(`✅ 成功清理 ${oldSessions.length} 个过期会话\n`, 'green')
    return { cleaned: oldSessions.length }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 执行所有清理任务
 */
async function cleanupAll (dryRun = false) {
  log('\n🧹 ━━━ 执行所有清理任务 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  const results = {
    orphans: null,
    lottery: null,
    sessions: null,
    total: 0
  }

  try {
    // 1. 清理孤儿消息
    results.orphans = await cleanupOrphanMessages(dryRun)
    results.total += results.orphans.cleaned || results.orphans.preview || 0

    // 2. 清理不完整抽奖数据
    results.lottery = await cleanupIncompleteLotteryData(dryRun)
    results.total += results.lottery.cleaned || results.lottery.preview || 0

    // 3. 清理过期会话
    results.sessions = await cleanupOldSessions(dryRun)
    results.total += results.sessions.cleaned || results.sessions.preview || 0

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')
    log('📊 清理任务总结', 'cyan')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')
    log(`孤儿消息: ${results.orphans.cleaned || results.orphans.preview || 0}`, 'blue')
    log(`不完整抽奖数据: ${results.lottery.cleaned || results.lottery.preview || 0}`, 'blue')
    log(`过期会话: ${results.sessions.cleaned || results.sessions.preview || 0}`, 'blue')
    log(`总计: ${results.total} 条记录`, dryRun ? 'yellow' : 'green')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan')

    return results
  } catch (error) {
    log(`❌ 清理任务失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 显示帮助信息
 */
function showHelp () {
  console.log(`
系统数据清理统一工具 (Cleanup Tool)

用法:
  node scripts/maintenance/cleanup.js [选项]

选项:
  --action=orphans        清理孤儿聊天消息
  --action=lottery        清理不完整的抽奖数据
  --action=old-sessions   清理过期会话（30天前）
  --action=all            执行所有清理任务
  --dry-run               预览模式（不实际删除数据）
  --help                  显示此帮助信息

示例:
  # 预览孤儿消息清理
  node scripts/maintenance/cleanup.js --action=orphans --dry-run

  # 实际清理孤儿消息
  node scripts/maintenance/cleanup.js --action=orphans

  # 执行所有清理任务
  node scripts/maintenance/cleanup.js --action=all

  # 预览所有清理任务
  node scripts/maintenance/cleanup.js --action=all --dry-run

清理说明:
  1. 孤儿消息：清理引用不存在会话的聊天消息
  2. 不完整抽奖数据：清理没有对应积分交易的抽奖记录
  3. 过期会话：清理超过30天的过期用户会话

注意事项:
  1. 建议先使用 --dry-run 预览清理结果
  2. 清理操作不可逆，请谨慎使用
  3. 建议定期（每月）执行清理任务
  4. 清理前建议先备份数据
`)
}

// ==================== 主函数 ====================

async function main () {
  const args = process.argv.slice(2)

  // 解析参数
  const options = {}
  args.forEach(arg => {
    if (arg === '--help') {
      options.help = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      options[key] = value || true
    }
  })

  // 显示帮助
  if (options.help || !options.action) {
    showHelp()
    process.exit(0)
  }

  try {
    switch (options.action) {
    case 'orphans':
      await cleanupOrphanMessages(options.dryRun)
      break

    case 'lottery':
      await cleanupIncompleteLotteryData(options.dryRun)
      break

    case 'old-sessions':
      await cleanupOldSessions(options.dryRun)
      break

    case 'all':
      await cleanupAll(options.dryRun)
      break

    default:
      log(`❌ 未知操作: ${options.action}`, 'red')
      log('使用 --help 查看帮助信息', 'yellow')
      process.exit(1)
    }

    log('✅ 清理操作完成\n', 'green')
    process.exit(0)
  } catch (error) {
    log(`\n❌ 操作失败: ${error.message}`, 'red')
    console.error(error.stack)
    process.exit(1)
  } finally {
    // 确保关闭数据库连接
    try {
      await sequelize.close()
    } catch (e) {
      // 忽略关闭错误
    }
  }
}

// 执行主函数
if (require.main === module) {
  main()
}

module.exports = {
  cleanupOrphanMessages,
  cleanupIncompleteLotteryData,
  cleanupOldSessions,
  cleanupAll
}
