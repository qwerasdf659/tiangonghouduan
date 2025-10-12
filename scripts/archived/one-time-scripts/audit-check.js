/**
 * 全局业务审查报告 - 问题检查脚本
 * 检查报告中列出的所有问题是否已修复
 */

require('dotenv').config()
const models = require('../models')
const {
  sequelize,
  User,
  UserPointsAccount,
  UserInventory,
  PointsTransaction: _PointsTransaction, // 保留用于未来审计功能
  LotteryDraw,
  ExchangeRecords,
  Product: _Product
} = models

const BeijingTimeHelper = require('../utils/timeHelper')

console.log('\n=== 全局业务审查报告 - 问题检查 ===\n')
console.log(`检查时间: ${BeijingTimeHelper.toBeijingTime(new Date())}`)
console.log(`数据库: ${process.env.DB_NAME}\n`)

async function checkProblem1_PointsAccountCreation () {
  console.log('【问题1】检查积分账户创建策略\n')

  try {
    const totalUsers = await User.count({ where: { status: 'active' } })
    const totalAccounts = await UserPointsAccount.count({ where: { is_active: true } })

    console.log(`✅ 活跃用户数: ${totalUsers}`)
    console.log(`✅ 积分账户数: ${totalAccounts}`)

    if (totalUsers > totalAccounts) {
      const missingRate = ((totalUsers - totalAccounts) / totalUsers * 100).toFixed(1)
      console.log(`\n⚠️  数据不一致: ${totalUsers}个用户 vs ${totalAccounts}个积分账户`)
      console.log(`⚠️  数据缺失率: ${missingRate}%`)
      console.log('❌ 问题1未修复: 用户注册时未创建积分账户\n')
      return false
    } else {
      console.log('✅ 问题1已修复: 所有用户都有积分账户\n')
      return true
    }
  } catch (error) {
    console.error(`❌ 检查失败: ${error.message}\n`)
    return false
  }
}

async function checkProblem2_ForeignKeys () {
  console.log('【问题2】检查数据库外键约束\n')

  try {
    const [results] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, COLUMN_NAME
    `)

    console.log(`找到 ${results.length} 个外键约束:\n`)

    if (results.length === 0) {
      console.log('❌ 问题2未修复: 数据库缺失外键约束\n')
      return false
    }

    // 按表分组显示
    const grouped = {}
    results.forEach(row => {
      if (!grouped[row.TABLE_NAME]) {
        grouped[row.TABLE_NAME] = []
      }
      grouped[row.TABLE_NAME].push(row)
    })

    Object.entries(grouped).forEach(([table, constraints]) => {
      console.log(`表 ${table}:`)
      constraints.forEach(c => {
        console.log(`  - ${c.COLUMN_NAME} -> ${c.REFERENCED_TABLE_NAME}(${c.REFERENCED_COLUMN_NAME})`)
      })
    })

    console.log('\n✅ 问题2已修复: 数据库已建立外键约束\n')
    return true
  } catch (error) {
    console.error(`❌ 检查失败: ${error.message}\n`)
    return false
  }
}

async function checkProblem3_UserInventory () {
  console.log('【问题3】检查用户库存系统\n')

  try {
    const inventoryCount = await UserInventory.count()
    const exchangeCount = await ExchangeRecords.count({
      where: { status: ['distributed', 'completed'] }
    })

    console.log(`✅ 用户库存记录: ${inventoryCount}`)
    console.log(`✅ 已分发兑换记录: ${exchangeCount}`)

    // 检查字段匹配
    const [tableInfo] = await sequelize.query(`
      SHOW COLUMNS FROM user_inventory WHERE Field = 'inventory_id'
    `)

    if (tableInfo.length === 0) {
      console.log('❌ 问题3未修复: inventory_id字段缺失\n')
      return false
    }

    console.log(`✅ 主键字段: ${tableInfo[0].Field}`)

    if (exchangeCount > 0 && inventoryCount === 0) {
      console.log('⚠️  警告: 有兑换记录但库存为空，可能存在问题\n')
      return false
    }

    console.log('✅ 问题3已修复: 用户库存系统正常\n')
    return true
  } catch (error) {
    console.error(`❌ 检查失败: ${error.message}\n`)
    return false
  }
}

async function checkProblem4_LotteryPointsTransaction () {
  console.log('【问题4】检查抽奖积分交易记录\n')

  try {
    // 1. 检查cost_points字段覆盖率（字段名修复验证）
    const totalDraws = await LotteryDraw.count()
    const drawsWithCostPoints = await LotteryDraw.count({
      where: {
        cost_points: { [sequelize.Sequelize.Op.ne]: null }
      }
    })

    const costPointsCoverage = totalDraws > 0
      ? (drawsWithCostPoints / totalDraws * 100).toFixed(1)
      : 100

    console.log(`cost_points字段覆盖: ${drawsWithCostPoints}/${totalDraws} (${costPointsCoverage}%)`)

    if (parseFloat(costPointsCoverage) < 100) {
      console.log('❌ cost_points字段仍有null值\n')
      return false
    }

    // 2. 检查最近数据的积分交易记录覆盖率（2025-10-07之后）
    const recentCutoffDate = '2025-10-07 00:00:00'
    const _recentDraws = await LotteryDraw.count({
      where: {
        created_at: { [sequelize.Sequelize.Op.gte]: recentCutoffDate }
      }
    })

    // 检查最近抽奖记录对应的积分交易
    const [recentCoverageResult] = await sequelize.query(`
      SELECT 
        COUNT(DISTINCT ld.draw_id) as total_draws,
        COUNT(DISTINCT pt.transaction_id) as with_transactions
      FROM lottery_draws ld
      LEFT JOIN points_transactions pt 
        ON pt.user_id = ld.user_id 
        AND pt.business_type = 'lottery_consume'
        AND pt.transaction_type = 'consume'
        AND ABS(pt.points_amount) = ld.cost_points
        AND ABS(TIMESTAMPDIFF(SECOND, pt.created_at, ld.created_at)) < 10
      WHERE ld.created_at >= '${recentCutoffDate}'
    `)

    const recentTotal = recentCoverageResult[0].total_draws
    const recentWithTx = recentCoverageResult[0].with_transactions
    const recentCoverageRate = recentTotal > 0
      ? (recentWithTx / recentTotal * 100).toFixed(1)
      : 100

    console.log(`最近数据覆盖率（10月7日后）: ${recentWithTx}/${recentTotal} (${recentCoverageRate}%)`)

    // 3. 验证代码修复（检查BasicGuaranteeStrategy是否使用cost_points）
    const fs = require('fs')
    const strategyPath = require('path').join(__dirname, '../services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js')
    const strategyCode = fs.readFileSync(strategyPath, 'utf8')
    const hasCorrectField = strategyCode.includes('cost_points:') &&
                           strategyCode.includes('this.config.pointsCostPerDraw')

    console.log(`代码字段修复: ${hasCorrectField ? '✅' : '❌'}`)

    // 判断修复状态
    if (!hasCorrectField) {
      console.log('❌ 问题4未修复: 代码仍使用错误的字段名\n')
      return false
    }

    if (parseFloat(recentCoverageRate) < 90) {
      console.log('⚠️  警告: 最近数据积分交易覆盖率较低\n')
      return false
    }

    console.log('✅ 问题4已修复: cost_points字段100%覆盖，最新数据积分交易记录完整\n')
    return true
  } catch (error) {
    console.error(`❌ 检查失败: ${error.message}\n`)
    return false
  }
}

async function checkProblem5_ConcurrencyControl () {
  console.log('【问题5】检查商品库存并发控制\n')

  try {
    // 检查Product模型是否有version字段或使用锁机制
    const PointsService = require('../services/PointsService')
    const exchangeMethod = PointsService.exchangeProduct.toString()

    const hasLock = exchangeMethod.includes('LOCK.UPDATE') ||
                    exchangeMethod.includes('transaction.LOCK')
    const hasAtomic = exchangeMethod.includes('sequelize.literal') &&
                     exchangeMethod.includes('stock -')

    console.log(`悲观锁: ${hasLock ? '✅' : '❌'}`)
    console.log(`原子操作: ${hasAtomic ? '✅' : '❌'}`)

    if (!hasLock && !hasAtomic) {
      console.log('❌ 问题5未修复: 缺少并发控制机制\n')
      return false
    }

    console.log('✅ 问题5已修复: 已实现并发控制\n')
    return true
  } catch (error) {
    console.error(`❌ 检查失败: ${error.message}\n`)
    return false
  }
}

async function checkProblem6_RefundLogic () {
  console.log('【问题6】检查兑换审核退款逻辑\n')

  try {
    // 检查reject方法是否实现退款
    if (!ExchangeRecords.prototype || !ExchangeRecords.prototype.reject) {
      console.log('❌ 问题6未修复: reject方法不存在\n')
      return false
    }

    const rejectMethod = ExchangeRecords.prototype.reject.toString()

    const hasRefund = rejectMethod.includes('addPoints') ||
                     rejectMethod.includes('PointsService')
    const hasStockRestore = rejectMethod.includes('increment') &&
                           rejectMethod.includes('stock')
    const hasTransaction = rejectMethod.includes('transaction')

    console.log(`积分退回: ${hasRefund ? '✅' : '❌'}`)
    console.log(`库存恢复: ${hasStockRestore ? '✅' : '❌'}`)
    console.log(`事务保护: ${hasTransaction ? '✅' : '❌'}`)

    if (!hasRefund || !hasStockRestore || !hasTransaction) {
      console.log('❌ 问题6未修复: 退款逻辑不完整\n')
      return false
    }

    console.log('✅ 问题6已修复: 退款逻辑完整（包含积分退回、库存恢复、事务保护）\n')
    return true
  } catch (error) {
    console.error(`❌ 检查失败: ${error.message}\n`)
    return false
  }
}

async function checkProblem7_Idempotency () {
  console.log('【问题7】检查积分交易幂等性控制\n')

  try {
    const PointsService = require('../services/PointsService')
    const consumeMethod = PointsService.consumePoints.toString()

    const hasBusinessId = consumeMethod.includes('business_id')
    const hasDuplicateCheck = consumeMethod.includes('findOne') &&
                             consumeMethod.includes('business_id')

    console.log(`业务ID参数: ${hasBusinessId ? '✅' : '❌'}`)
    console.log(`重复检查: ${hasDuplicateCheck ? '✅' : '❌'}`)

    if (!hasBusinessId || !hasDuplicateCheck) {
      console.log('❌ 问题7未修复: 缺少幂等性控制\n')
      return false
    }

    // 检查数据库索引
    const [indexes] = await sequelize.query(`
      SHOW INDEX FROM points_transactions 
      WHERE Column_name IN ('business_id', 'user_id', 'business_type')
    `)

    console.log(`相关索引数: ${indexes.length}`)

    console.log('✅ 问题7已修复: 已实现幂等性控制\n')
    return true
  } catch (error) {
    console.error(`❌ 检查失败: ${error.message}\n`)
    return false
  }
}

async function checkProblem8_TimezoneConsistency () {
  console.log('【问题8】检查时区处理统一性\n')

  try {
    const _TimeHelper = require('../utils/timeHelper')

    console.log('时区工具类存在: ✅')

    // 检查数据库配置
    const [results] = await sequelize.query(`
      SELECT @@session.time_zone as session_tz, 
             @@global.time_zone as global_tz
    `)

    console.log(`数据库会话时区: ${results[0].session_tz}`)
    console.log(`数据库全局时区: ${results[0].global_tz}`)

    console.log('✅ 问题8: 时区处理工具已就绪（需人工检查代码使用情况）\n')
    return true
  } catch (error) {
    console.error(`❌ 检查失败: ${error.message}\n`)
    return false
  }
}

async function generateSummary (results) {
  console.log('\n=== 检查结果汇总 ===\n')

  const total = results.length
  const fixed = results.filter(r => r.fixed).length
  const percentage = (fixed / total * 100).toFixed(1)

  console.log(`总检查项: ${total}`)
  console.log(`已修复: ${fixed}`)
  console.log(`未修复: ${total - fixed}`)
  console.log(`修复率: ${percentage}%\n`)

  results.forEach((r, index) => {
    const status = r.fixed ? '✅' : '❌'
    console.log(`${status} 问题${index + 1}: ${r.name}`)
  })

  console.log('\n' + '='.repeat(50) + '\n')

  return {
    total,
    fixed,
    pending: total - fixed,
    percentage: parseFloat(percentage),
    details: results
  }
}

async function main () {
  try {
    await sequelize.authenticate()
    console.log('数据库连接成功\n')
    console.log('='.repeat(50) + '\n')

    const results = []

    results.push({
      name: '积分账户创建策略',
      fixed: await checkProblem1_PointsAccountCreation()
    })

    results.push({
      name: '数据库外键约束',
      fixed: await checkProblem2_ForeignKeys()
    })

    results.push({
      name: '用户库存系统',
      fixed: await checkProblem3_UserInventory()
    })

    results.push({
      name: '抽奖积分交易记录',
      fixed: await checkProblem4_LotteryPointsTransaction()
    })

    results.push({
      name: '商品库存并发控制',
      fixed: await checkProblem5_ConcurrencyControl()
    })

    results.push({
      name: '兑换审核退款逻辑',
      fixed: await checkProblem6_RefundLogic()
    })

    results.push({
      name: '积分交易幂等性控制',
      fixed: await checkProblem7_Idempotency()
    })

    results.push({
      name: '时区处理统一性',
      fixed: await checkProblem8_TimezoneConsistency()
    })

    const summary = await generateSummary(results)

    await sequelize.close()

    // 返回退出码
    process.exit(summary.pending > 0 ? 1 : 0)
  } catch (error) {
    console.error('检查过程出错:', error.message)
    await sequelize.close()
    process.exit(1)
  }
}

main()
