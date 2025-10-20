/**
 * 积分余额不一致修复脚本
 * 用途：修复用户积分账户的余额不一致问题
 *
 * 问题：可用积分 ≠ (总获得 - 总消费)
 *
 * 创建时间：2025-10-14
 * 北京时间
 */

const { UserPointsAccount, PointsTransaction, User } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 颜色化输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log (color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function fixPointsBalanceInconsistency (mobile, dryRun = true) {
  try {
    log('cyan', '\n========================================')
    log('cyan', '🔧 积分余额修复系统')
    log('cyan', `修复对象: ${mobile}`)
    log('cyan', `修复时间: ${BeijingTimeHelper.now()}`)
    log('cyan', `模式: ${dryRun ? '测试模式（不实际修改）' : '修复模式（实际修改）'}`)
    log('cyan', '========================================\n')

    // 1. 查找用户
    log('blue', '📌 步骤1: 查找用户信息...')
    const user = await User.findOne({ where: { mobile } })
    if (!user) {
      log('red', `❌ 用户不存在: ${mobile}`)
      return
    }
    log('green', `✅ 找到用户: ${user.username} (ID: ${user.user_id})`)

    const user_id = user.user_id

    // 2. 查询积分账户
    log('blue', '\n📌 步骤2: 查询积分账户状态...')
    const account = await UserPointsAccount.findOne({ where: { user_id } })
    if (!account) {
      log('red', '❌ 积分账户不存在')
      return
    }

    log('yellow', '当前账户状态:')
    log('yellow', `   可用积分: ${account.available_points}`)
    log('yellow', `   总获得积分: ${account.total_earned}`)
    log('yellow', `   总消费积分: ${account.total_consumed}`)

    // 3. 根据交易记录重新计算余额
    log('blue', '\n📌 步骤3: 根据交易记录重新计算余额...')
    const transactions = await PointsTransaction.findAll({
      where: { user_id },
      order: [['transaction_time', 'ASC']]
    })

    log('green', `✅ 找到 ${transactions.length} 条交易记录`)

    // 重新计算
    let calculatedEarned = 0
    let calculatedConsumed = 0

    transactions.forEach(trans => {
      if (trans.transaction_type === 'earn') {
        calculatedEarned += parseFloat(trans.points_amount)
      } else if (trans.transaction_type === 'consume') {
        calculatedConsumed += parseFloat(trans.points_amount)
      }
    })

    const calculatedBalance = calculatedEarned - calculatedConsumed

    log('yellow', '\n根据交易记录计算的结果:')
    log('yellow', `   总获得积分: ${calculatedEarned}`)
    log('yellow', `   总消费积分: ${calculatedConsumed}`)
    log('yellow', `   计算余额: ${calculatedBalance}`)

    // 4. 对比差异
    log('blue', '\n📌 步骤4: 对比账户余额差异...')

    const balanceDiff = account.available_points - calculatedBalance
    const earnedDiff = account.total_earned - calculatedEarned
    const consumedDiff = account.total_consumed - calculatedConsumed

    if (Math.abs(balanceDiff) < 0.01 && Math.abs(earnedDiff) < 0.01 && Math.abs(consumedDiff) < 0.01) {
      log('green', '\n✅ 积分账户余额正确，无需修复')
      return
    }

    log('red', '\n🚨 发现余额不一致:')
    log('red', `   可用积分差异: ${balanceDiff} (账户: ${account.available_points}, 计算: ${calculatedBalance})`)
    log('red', `   总获得差异: ${earnedDiff} (账户: ${account.total_earned}, 计算: ${calculatedEarned})`)
    log('red', `   总消费差异: ${consumedDiff} (账户: ${account.total_consumed}, 计算: ${calculatedConsumed})`)

    // 5. 执行修复
    if (dryRun) {
      log('yellow', '\n⚠️ 测试模式：不会实际修改数据')
      log('yellow', '如需实际修复，请使用参数: --fix')

      log('cyan', '\n修复预览:')
      log('cyan', `   可用积分: ${account.available_points} → ${calculatedBalance}`)
      log('cyan', `   总获得积分: ${account.total_earned} → ${calculatedEarned}`)
      log('cyan', `   总消费积分: ${account.total_consumed} → ${calculatedConsumed}`)
    } else {
      log('blue', '\n📌 步骤5: 执行积分余额修复...')

      // 更新账户信息
      await account.update({
        available_points: calculatedBalance,
        total_earned: calculatedEarned,
        total_consumed: calculatedConsumed
      })

      // 同步更新用户表的history_total_points
      await User.update(
        { history_total_points: calculatedEarned },
        { where: { user_id } }
      )

      log('green', '\n✅ 积分余额修复成功!')
      log('green', `   可用积分: ${account.available_points} → ${calculatedBalance}`)
      log('green', `   总获得积分: ${account.total_earned} → ${calculatedEarned}`)
      log('green', `   总消费积分: ${account.total_consumed} → ${calculatedConsumed}`)

      // 记录修复日志
      log('blue', '\n📝 生成修复记录...')
      const repairRecord = {
        user_id,
        mobile,
        repair_time: BeijingTimeHelper.now(),
        before: {
          available_points: parseFloat(account.available_points),
          total_earned: parseFloat(account.total_earned),
          total_consumed: parseFloat(account.total_consumed)
        },
        after: {
          available_points: calculatedBalance,
          total_earned: calculatedEarned,
          total_consumed: calculatedConsumed
        },
        differences: {
          balance_diff: balanceDiff,
          earned_diff: earnedDiff,
          consumed_diff: consumedDiff
        },
        transactions_count: transactions.length
      }

      log('green', '✅ 修复记录已生成')
      console.log(JSON.stringify(repairRecord, null, 2))
    }

    log('cyan', '\n========================================')
    log('cyan', '🎉 修复流程完成')
    log('cyan', '========================================\n')
  } catch (error) {
    log('red', `\n❌ 修复过程出错: ${error.message}`)
    console.error(error.stack)
  } finally {
    process.exit(0)
  }
}

// 执行修复
const mobile = process.argv[2] || '13612227930'
const fixMode = process.argv.includes('--fix')

if (!fixMode) {
  log('yellow', '\n⚠️ 当前为测试模式，如需实际修复请添加 --fix 参数')
  log('yellow', '示例: node scripts/diagnostic/fix-points-balance-inconsistency.js 13612227930 --fix\n')
}

fixPointsBalanceInconsistency(mobile, !fixMode)
