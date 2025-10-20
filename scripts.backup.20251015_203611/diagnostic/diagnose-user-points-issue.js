/**
 * 用户积分异常波动诊断脚本
 * 诊断问题：13612227930 点击抽奖后积分会增加又降低
 *
 * 创建时间：2025-10-14
 * 北京时间
 */

const { UserPointsAccount, PointsTransaction, LotteryDraw, LotteryPrize, User } = require('../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../utils/timeHelper')

// ��色化输出
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

async function diagnoseUserPointsIssue (mobile) {
  try {
    log('cyan', '\n========================================')
    log('cyan', '🔍 用户积分异常诊断系统')
    log('cyan', `诊断对象: ${mobile}`)
    log('cyan', `诊断时间: ${BeijingTimeHelper.now()}`)
    log('cyan', '========================================\n')

    // 1. 查找用户
    log('blue', '📌 步骤1: 查找用户信息...')
    const user = await User.findOne({ where: { mobile } })
    if (!user) {
      log('red', `❌ 用户不存在: ${mobile}`)
      return
    }
    log('green', `✅ 找到用户: ${user.username} (ID: ${user.user_id})`)
    log('yellow', `   历史总积分: ${user.history_total_points}`)

    const user_id = user.user_id

    // 2. 查询积分账户
    log('blue', '\n📌 步骤2: 查询积分账户状态...')
    const account = await UserPointsAccount.findOne({ where: { user_id } })
    if (!account) {
      log('red', '❌ 积分账户不存在')
      return
    }
    log('green', '✅ 积分账户信息:')
    log('yellow', `   可用积分: ${account.available_points}`)
    log('yellow', `   总获得积分: ${account.total_earned}`)
    log('yellow', `   总消费积分: ${account.total_consumed}`)
    log('yellow', `   最后获得时间: ${account.last_earn_time || '无'}`)
    log('yellow', `   最后消费时间: ${account.last_consume_time || '无'}`)

    // 3. 查询最近的积分交易记录（最近20条）
    log('blue', '\n📌 步骤3: 分析最近的积分交易记录...')
    const recentTransactions = await PointsTransaction.findAll({
      where: { user_id },
      order: [['transaction_time', 'DESC']],
      limit: 20
    })

    if (recentTransactions.length === 0) {
      log('yellow', '⚠️ 没有找到积分交易记录')
    } else {
      log('green', `✅ 找到 ${recentTransactions.length} 条最近的交易记录:\n`)

      recentTransactions.forEach((trans, index) => {
        const typeColor = trans.transaction_type === 'earn' ? 'green' : 'red'
        const typeSymbol = trans.transaction_type === 'earn' ? '+' : '-'

        log(typeColor, `   [${index + 1}] ${trans.transaction_time}`)
        log(typeColor, `       类型: ${trans.transaction_type} (${trans.business_type})`)
        log(typeColor, `       金额: ${typeSymbol}${trans.points_amount}`)
        log(typeColor, `       余额变化: ${trans.points_balance_before} → ${trans.points_balance_after}`)
        log(typeColor, `       标题: ${trans.transaction_title}`)
        log(typeColor, `       描述: ${trans.transaction_description}`)
        if (trans.business_id) {
          log(typeColor, `       业务ID: ${trans.business_id}`)
        }
        console.log('')
      })
    }

    // 4. 统计异常模式
    log('blue', '📌 步骤4: 统计积分变动模式...')

    // 统计短时间内的频繁变动
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

    const recentChanges = await PointsTransaction.findAll({
      where: {
        user_id,
        transaction_time: {
          [Op.gte]: fiveMinutesAgo
        }
      },
      order: [['transaction_time', 'ASC']]
    })

    if (recentChanges.length > 0) {
      log('yellow', `\n⚠️ 最近5分钟内有 ${recentChanges.length} 次积分变动:`)
      recentChanges.forEach((trans, index) => {
        const typeColor = trans.transaction_type === 'earn' ? 'green' : 'red'
        const typeSymbol = trans.transaction_type === 'earn' ? '+' : '-'
        log(typeColor, `   [${index + 1}] ${trans.transaction_time}: ${typeSymbol}${trans.points_amount} (${trans.business_type})`)
      })
    } else {
      log('green', '✅ 最近5分钟内没有异常的频繁变动')
    }

    // 5. 检查抽奖记录
    log('blue', '\n📌 步骤5: 检查抽奖记录...')
    const recentDraws = await LotteryDraw.findAll({
      where: { user_id },
      include: [{
        model: LotteryPrize,
        as: 'prize',
        required: false,
        attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value']
      }],
      order: [['created_at', 'DESC']],
      limit: 10
    })

    if (recentDraws.length === 0) {
      log('yellow', '⚠️ 没有找到抽奖记录')
    } else {
      log('green', `✅ 找到 ${recentDraws.length} 条最近的抽奖记录:\n`)

      recentDraws.forEach((draw, index) => {
        const winColor = draw.is_winner ? 'green' : 'yellow'
        const winStatus = draw.is_winner ? '✅ 中奖' : '❌ 未中奖'

        log(winColor, `   [${index + 1}] ${draw.created_at}`)
        log(winColor, `       ${winStatus}`)
        log(winColor, `       消耗积分: ${draw.cost_points}`)
        log(winColor, `       抽奖类型: ${draw.draw_type}`)
        if (draw.is_winner && draw.prize) {
          log(winColor, `       中奖奖品: ${draw.prize.prize_name} (类型: ${draw.prize.prize_type})`)
          log(winColor, `       奖品价值: ${draw.prize.prize_value}`)
        }
        console.log('')
      })
    }

    // 6. 🔥 关键诊断：检查是否有中奖后自动补偿积分的逻辑
    log('blue', '📌 步骤6: 诊断积分波动原因...')

    // 查找同一时间段内的 消费 和 获得 配对
    const suspiciousPatterns = []

    for (let i = 0; i < recentTransactions.length - 1; i++) {
      const current = recentTransactions[i]
      const next = recentTransactions[i + 1]

      // 检查是否在1秒内有一次消费和一次获得
      if (current.transaction_type === 'earn' && next.transaction_type === 'consume') {
        const timeDiff = new Date(current.transaction_time) - new Date(next.transaction_time)
        if (Math.abs(timeDiff) < 2000) { // 2秒内
          suspiciousPatterns.push({
            index: i,
            earn: current,
            consume: next,
            timeDiff
          })
        }
      }
    }

    if (suspiciousPatterns.length > 0) {
      log('red', '\n🚨 发现异常模式: 短时间内积分增加后又减少!')
      log('red', `   共发现 ${suspiciousPatterns.length} 组异常模式:\n`)

      suspiciousPatterns.forEach((pattern, index) => {
        log('red', `   异常模式 ${index + 1}:`)
        log('red', `   ├─ 增加: +${pattern.earn.points_amount} (${pattern.earn.business_type})`)
        log('red', `   │  时间: ${pattern.earn.transaction_time}`)
        log('red', `   │  余额: ${pattern.earn.points_balance_before} → ${pattern.earn.points_balance_after}`)
        log('red', `   └─ 减少: -${pattern.consume.points_amount} (${pattern.consume.business_type})`)
        log('red', `      时间: ${pattern.consume.transaction_time}`)
        log('red', `      余额: ${pattern.consume.points_balance_before} → ${pattern.consume.points_balance_after}`)
        log('red', `      时间差: ${Math.abs(pattern.timeDiff)}ms\n`)
      })

      log('yellow', '💡 可能的原因:')
      log('yellow', '   1. 中奖后发放了积分类奖品，然后又扣除了抽奖消耗的积分')
      log('yellow', '   2. 积分扣除和奖品发放的顺序不正确')
      log('yellow', '   3. 存在重复的积分交易操作')
    } else {
      log('green', '\n✅ 未发现明显的异常积分波动模式')
    }

    // 7. 检查是否有重复的business_id
    log('blue', '\n📌 步骤7: 检查是否存在重复交易...')
    const businessIds = recentTransactions
      .filter(t => t.business_id)
      .map(t => t.business_id)

    const duplicates = businessIds.filter((item, index) => businessIds.indexOf(item) !== index)

    if (duplicates.length > 0) {
      log('red', `\n🚨 发现重复的业务ID: ${duplicates.length} 个`)
      log('red', '   重复ID列表:')
      duplicates.forEach(id => log('red', `   - ${id}`))
    } else {
      log('green', '✅ 没有发现重复的业务ID')
    }

    // 8. 总结诊断结果
    log('cyan', '\n========================================')
    log('cyan', '📊 诊断总结')
    log('cyan', '========================================')

    log('yellow', '\n当前积分状态:')
    log('yellow', `  可用积分: ${account.available_points}`)
    log('yellow', `  总获得: ${account.total_earned}`)
    log('yellow', `  总消费: ${account.total_consumed}`)
    log('yellow', `  计算差值: ${account.total_earned - account.total_consumed}`)

    const balanceDiff = Math.abs(account.available_points - (account.total_earned - account.total_consumed))
    if (balanceDiff > 0.01) {
      log('red', '\n🚨 警告: 积分余额计算不一致!')
      log('red', `  差值: ${balanceDiff}`)
    } else {
      log('green', '\n✅ 积分余额计算正确')
    }

    if (suspiciousPatterns.length > 0) {
      log('red', '\n🎯 核心问题:')
      log('red', '   积分在短时间内出现 "增加→减少" 的异常波动')
      log('red', '   需要检查抽奖策略中的积分处理逻辑\n')
    }

    log('cyan', '========================================\n')
  } catch (error) {
    log('red', `\n❌ 诊断过程出错: ${error.message}`)
    console.error(error.stack)
  } finally {
    process.exit(0)
  }
}

// 执行诊断
const mobile = process.argv[2] || '13612227930'
diagnoseUserPointsIssue(mobile)
