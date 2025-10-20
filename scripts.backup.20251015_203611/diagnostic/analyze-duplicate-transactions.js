/**
 * 重复积分交易分析脚本
 * 用途：查找并分析重复的积分交易记录
 *
 * 创建时间：2025-10-14
 * 北京时间
 */

const { User } = require('../../models')
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

async function analyzeDuplicateTransactions (mobile) {
  try {
    log('cyan', '\n========================================')
    log('cyan', '🔍 重复积分交易分析系统')
    log('cyan', `分析对象: ${mobile}`)
    log('cyan', `分析时间: ${BeijingTimeHelper.now()}`)
    log('cyan', '========================================\n')

    // 1. 查找用户
    const user = await User.findOne({ where: { mobile } })
    if (!user) {
      log('red', `❌ 用户不存在: ${mobile}`)
      return
    }
    log('green', `✅ 找到用户: ${user.username} (ID: ${user.user_id})`)

    const user_id = user.user_id

    // 2. 查询所有交易记录
    const { PointsTransaction } = require('../../models')
    const transactions = await PointsTransaction.findAll({
      where: { user_id },
      order: [['transaction_time', 'ASC']]
    })

    log('green', `✅ 找到 ${transactions.length} 条交易记录\n`)

    // 3. 按business_id分组，查找重复
    log('blue', '📌 分析按业务ID的重复记录...')
    const businessIdMap = new Map()

    transactions.forEach(trans => {
      if (trans.business_id) {
        if (!businessIdMap.has(trans.business_id)) {
          businessIdMap.set(trans.business_id, [])
        }
        businessIdMap.get(trans.business_id).push(trans)
      }
    })

    const duplicates = []
    businessIdMap.forEach((records, business_id) => {
      if (records.length > 1) {
        duplicates.push({ business_id, count: records.length, records })
      }
    })

    if (duplicates.length > 0) {
      log('red', `\n🚨 发现 ${duplicates.length} 组重复的business_id:`)
      duplicates.forEach((dup, index) => {
        log('red', `\n   重复组 ${index + 1}:`)
        log('red', `   business_id: ${dup.business_id}`)
        log('red', `   重复次数: ${dup.count}`)
        dup.records.forEach((rec, i) => {
          log('red', `   [${i + 1}] ${rec.transaction_time} | ${rec.transaction_type} | ${rec.points_amount} | 状态: ${rec.status}`)
        })
      })
    } else {
      log('green', '✅ 没有发现按business_id的重复记录')
    }

    // 4. 检查相同时间、相同金额的可疑记录
    log('blue', '\n📌 分析相同时间和金额的可疑记录...')
    const timeAmountMap = new Map()

    transactions.forEach(trans => {
      const key = `${trans.transaction_time}_${trans.transaction_type}_${trans.points_amount}`
      if (!timeAmountMap.has(key)) {
        timeAmountMap.set(key, [])
      }
      timeAmountMap.get(key).push(trans)
    })

    const suspiciousGroups = []
    timeAmountMap.forEach((records, key) => {
      if (records.length > 1) {
        suspiciousGroups.push({ key, count: records.length, records })
      }
    })

    if (suspiciousGroups.length > 0) {
      log('yellow', `\n⚠️ 发现 ${suspiciousGroups.length} 组可疑的相同时间/金额记录:`)

      let totalSuspiciousAmount = 0
      suspiciousGroups.forEach((group, index) => {
        const [time, type, amount] = group.key.split('_')
        log('yellow', `\n   可疑组 ${index + 1}:`)
        log('yellow', `   时间: ${time}`)
        log('yellow', `   类型: ${type}`)
        log('yellow', `   金额: ${amount}`)
        log('yellow', `   重复次数: ${group.count}`)

        if (type === 'consume') {
          totalSuspiciousAmount += parseFloat(amount) * (group.count - 1)
        }

        group.records.slice(0, 3).forEach((rec, i) => {
          log('yellow', `   [${i + 1}] business_id: ${rec.business_id || '无'} | 描述: ${rec.transaction_description}`)
        })
        if (group.records.length > 3) {
          log('yellow', `   ... 还有 ${group.records.length - 3} 条记录`)
        }
      })

      log('red', `\n🚨 可疑消费重复总额: ${totalSuspiciousAmount} 积分`)
    } else {
      log('green', '✅ 没有发现可疑的重复记录')
    }

    // 5. 统计分析
    log('cyan', '\n========================================')
    log('cyan', '📊 统计分析')
    log('cyan', '========================================')

    const earnCount = transactions.filter(t => t.transaction_type === 'earn').length
    const consumeCount = transactions.filter(t => t.transaction_type === 'consume').length
    const totalEarn = transactions
      .filter(t => t.transaction_type === 'earn')
      .reduce((sum, t) => sum + parseFloat(t.points_amount), 0)
    const totalConsume = transactions
      .filter(t => t.transaction_type === 'consume')
      .reduce((sum, t) => sum + parseFloat(t.points_amount), 0)

    log('yellow', '\n交易统计:')
    log('yellow', `   总交易数: ${transactions.length}`)
    log('yellow', `   获得交易: ${earnCount} 次`)
    log('yellow', `   消费交易: ${consumeCount} 次`)
    log('yellow', `   总获得: ${totalEarn} 积分`)
    log('yellow', `   总消费: ${totalConsume} 积分`)
    log('yellow', `   计算余额: ${totalEarn - totalConsume} 积分`)

    log('cyan', '\n========================================')
    log('cyan', '🎉 分析完成')
    log('cyan', '========================================\n')
  } catch (error) {
    log('red', `\n❌ 分析过程出错: ${error.message}`)
    console.error(error.stack)
  } finally {
    process.exit(0)
  }
}

// 执行分析
const mobile = process.argv[2] || '13612227930'
analyzeDuplicateTransactions(mobile)
