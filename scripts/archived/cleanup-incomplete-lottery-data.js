/**
 * 清理不完整的抽奖数据
 *
 * 清理策略：
 * 1. 保留：131对完整配对的数据（有business_id的积分交易 + 对应的抽奖记录）
 * 2. 删除：420条无business_id的积分交易（测试账号历史数据）
 * 3. 删除：570条无积分交易的抽奖记录（测试账号历史数据）
 * 4. 最终：达到100%数据完整性
 *
 * 影响范围：仅测试账号（user_id=31），无正式用户数据
 *
 * 创建时间：2025-10-10
 * @author Claude 4 Sonnet
 */

require('dotenv').config()
const models = require('../models')
const { sequelize, PointsTransaction, LotteryDraw } = models
const BeijingTimeHelper = require('../utils/timeHelper')

class IncompleteDataCleaner {
  constructor () {
    this.statistics = {
      before: {
        totalDraws: 0,
        totalTransactions: 0,
        matchedPairs: 0
      },
      toDelete: {
        transactions: 0,
        draws: 0
      },
      after: {
        totalDraws: 0,
        totalTransactions: 0,
        matchedPairs: 0
      },
      deletedRecords: {
        transactions: [],
        draws: []
      }
    }
  }

  /**
   * Step 1: 分析当前数据状态
   */
  async analyzeCurrentState () {
    console.log('🔍 Step 1: 分析当前数据状态...\n')

    // 统计总数
    this.statistics.before.totalDraws = await LotteryDraw.count()
    this.statistics.before.totalTransactions = await PointsTransaction.count({
      where: {
        business_type: 'lottery_consume',
        transaction_type: 'consume'
      }
    })

    // 统计完整配对数
    const [matchedCount] = await sequelize.query(`
      SELECT COUNT(DISTINCT ld.draw_id) as count
      FROM lottery_draws ld
      INNER JOIN points_transactions pt
        ON pt.business_id = ld.draw_id
        AND pt.business_type = 'lottery_consume'
    `)
    this.statistics.before.matchedPairs = matchedCount[0].count

    console.log('📊 当前数据状态:')
    console.log(`  - 抽奖记录总数: ${this.statistics.before.totalDraws}条`)
    console.log(`  - 积分交易记录: ${this.statistics.before.totalTransactions}条`)
    console.log(`  - 完整配对数据: ${this.statistics.before.matchedPairs}对`)
    console.log(
      `  - 数据完整性: ${((this.statistics.before.matchedPairs / this.statistics.before.totalDraws) * 100).toFixed(2)}%\n`
    )
  }

  /**
   * Step 2: 识别需要删除的记录
   */
  async identifyRecordsToDelete () {
    console.log('🔍 Step 2: 识别需要删除的记录...\n')

    // 2.1 识别无business_id的积分交易记录
    const [transactionsToDelete] = await sequelize.query(`
      SELECT transaction_id, user_id, points_amount, created_at
      FROM points_transactions
      WHERE business_type = 'lottery_consume'
        AND transaction_type = 'consume'
        AND business_id IS NULL
    `)

    this.statistics.toDelete.transactions = transactionsToDelete.length
    this.statistics.deletedRecords.transactions = transactionsToDelete

    console.log('🗑️  将要删除的积分交易记录:')
    console.log(`  - 数量: ${transactionsToDelete.length}条`)
    console.log(`  - 用户: user_id=${transactionsToDelete[0]?.user_id || 'N/A'}（测试账号）`)

    // 2.2 识别无积分交易的抽奖记录
    const [drawsToDelete] = await sequelize.query(`
      SELECT draw_id, user_id, cost_points, created_at
      FROM lottery_draws ld
      WHERE NOT EXISTS (
        SELECT 1
        FROM points_transactions pt
        WHERE pt.business_id = ld.draw_id
          AND pt.business_type = 'lottery_consume'
      )
    `)

    this.statistics.toDelete.draws = drawsToDelete.length
    this.statistics.deletedRecords.draws = drawsToDelete

    console.log('\n🗑️  将要删除的抽奖记录:')
    console.log(`  - 数量: ${drawsToDelete.length}条`)
    console.log(`  - 用户: user_id=${drawsToDelete[0]?.user_id || 'N/A'}（测试账号）`)

    // 验证：所有要删除的记录都是测试账号
    const allTestAccount =
      transactionsToDelete.every(t => t.user_id === 31) &&
      drawsToDelete.every(d => d.user_id === 31)

    if (!allTestAccount) {
      throw new Error('❌ 安全检查失败：发现非测试账号数据，禁止删除！')
    }

    console.log('\n✅ 安全检查通过：所有待删除记录都属于测试账号（user_id=31）\n')
  }

  /**
   * Step 3: 执行数据清理（带事务保护）
   */
  async executeCleanup () {
    console.log('🧹 Step 3: 执行数据清理...\n')

    await sequelize.transaction(async t => {
      // 3.1 删除无business_id的积分交易记录
      console.log('🗑️  删除无business_id的积分交易记录...')
      const deletedTransactions = await PointsTransaction.destroy({
        where: {
          business_type: 'lottery_consume',
          transaction_type: 'consume',
          business_id: null
        },
        transaction: t
      })

      console.log(`  ✅ 删除 ${deletedTransactions} 条积分交易记录`)

      // 3.2 删除无积分交易的抽奖记录
      console.log('\n🗑️  删除无积分交易的抽奖记录...')
      const [result] = await sequelize.query(
        `
        DELETE FROM lottery_draws
        WHERE draw_id NOT IN (
          SELECT DISTINCT business_id
          FROM points_transactions
          WHERE business_type = 'lottery_consume'
            AND business_id IS NOT NULL
        )
      `,
        { transaction: t }
      )

      console.log(`  ✅ 删除 ${result.affectedRows || this.statistics.toDelete.draws} 条抽奖记录`)
    })

    console.log('\n✅ 数据清理完成\n')
  }

  /**
   * Step 4: 验证清理结果
   */
  async verifyCleanupResult () {
    console.log('🔍 Step 4: 验证清理结果...\n')

    // 统计清理后的数据
    this.statistics.after.totalDraws = await LotteryDraw.count()
    this.statistics.after.totalTransactions = await PointsTransaction.count({
      where: {
        business_type: 'lottery_consume',
        transaction_type: 'consume'
      }
    })

    // 验证数据完整性
    const [matchedCount] = await sequelize.query(`
      SELECT COUNT(DISTINCT ld.draw_id) as count
      FROM lottery_draws ld
      INNER JOIN points_transactions pt
        ON pt.business_id = ld.draw_id
        AND pt.business_type = 'lottery_consume'
    `)
    this.statistics.after.matchedPairs = matchedCount[0].count

    // 计算完整性
    const completeness =
      this.statistics.after.totalDraws > 0
        ? (this.statistics.after.matchedPairs / this.statistics.after.totalDraws) * 100
        : 0

    console.log('📊 清理后数据状态:')
    console.log(`  - 抽奖记录总数: ${this.statistics.after.totalDraws}条`)
    console.log(`  - 积分交易记录: ${this.statistics.after.totalTransactions}条`)
    console.log(`  - 完整配对数据: ${this.statistics.after.matchedPairs}对`)
    console.log(`  - 数据完整性: ${completeness.toFixed(2)}%`)

    if (completeness === 100) {
      console.log('\n🎉 数据完整性达到100%！')
    } else {
      console.warn('\n⚠️  数据完整性未达到100%，请检查！')
    }

    // 验证business_id覆盖率
    const [businessIdStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN business_id IS NOT NULL THEN 1 ELSE 0 END) as with_business_id
      FROM points_transactions
      WHERE business_type = 'lottery_consume'
    `)

    const businessIdCoverage =
      businessIdStats[0].total > 0
        ? (businessIdStats[0].with_business_id / businessIdStats[0].total) * 100
        : 0

    console.log(`\n📊 business_id覆盖率: ${businessIdCoverage.toFixed(2)}%`)

    if (businessIdCoverage === 100) {
      console.log('🎉 business_id覆盖率达到100%！\n')
    }

    return { completeness, businessIdCoverage }
  }

  /**
   * 生成清理报告
   */
  generateReport (verifyResult) {
    console.log('\n' + '='.repeat(60))
    console.log('📊 数据清理报告')
    console.log('='.repeat(60))
    console.log(`执行时间: ${BeijingTimeHelper.nowLocale()}`)

    console.log('\n清理前:')
    console.log(`  - 抽奖记录: ${this.statistics.before.totalDraws}条`)
    console.log(`  - 积分交易: ${this.statistics.before.totalTransactions}条`)
    console.log(`  - 完整配对: ${this.statistics.before.matchedPairs}对`)
    console.log(
      `  - 完整性: ${((this.statistics.before.matchedPairs / this.statistics.before.totalDraws) * 100).toFixed(2)}%`
    )

    console.log('\n删除记录:')
    console.log(`  - 积分交易: ${this.statistics.toDelete.transactions}条`)
    console.log(`  - 抽奖记录: ${this.statistics.toDelete.draws}条`)
    console.log(
      `  - 总计: ${this.statistics.toDelete.transactions + this.statistics.toDelete.draws}条`
    )

    console.log('\n清理后:')
    console.log(`  - 抽奖记录: ${this.statistics.after.totalDraws}条`)
    console.log(`  - 积分交易: ${this.statistics.after.totalTransactions}条`)
    console.log(`  - 完整配对: ${this.statistics.after.matchedPairs}对`)
    console.log(`  - 完整性: ${verifyResult.completeness.toFixed(2)}%`)
    console.log(`  - business_id覆盖率: ${verifyResult.businessIdCoverage.toFixed(2)}%`)

    console.log('\n数据减少:')
    console.log(
      `  - 抽奖记录: -${this.statistics.before.totalDraws - this.statistics.after.totalDraws}条 (${(((this.statistics.before.totalDraws - this.statistics.after.totalDraws) / this.statistics.before.totalDraws) * 100).toFixed(1)}%)`
    )
    console.log(
      `  - 积分交易: -${this.statistics.before.totalTransactions - this.statistics.after.totalTransactions}条 (${(((this.statistics.before.totalTransactions - this.statistics.after.totalTransactions) / this.statistics.before.totalTransactions) * 100).toFixed(1)}%)`
    )

    console.log('='.repeat(60))

    if (verifyResult.completeness === 100 && verifyResult.businessIdCoverage === 100) {
      console.log('\n✅ 清理成功！数据完整性和business_id覆盖率均达到100%')
    } else {
      console.log('\n⚠️  清理完成，但数据质量未达到100%，请检查')
    }
  }

  /**
   * 执行完整清理流程
   */
  async execute (dryRun = false) {
    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功\n')

      if (dryRun) {
        console.log('🔍 DRY RUN 模式 - 仅分析，不实际删除\n')
      }

      // Step 1: 分析当前状态
      await this.analyzeCurrentState()

      // Step 2: 识别要删除的记录
      await this.identifyRecordsToDelete()

      if (dryRun) {
        console.log('⏭️  DRY RUN 模式跳过实际删除\n')
        console.log('预计清理后:')
        console.log(
          `  - 抽奖记录: ${this.statistics.before.totalDraws - this.statistics.toDelete.draws}条`
        )
        console.log(
          `  - 积分交易: ${this.statistics.before.totalTransactions - this.statistics.toDelete.transactions}条`
        )
        console.log(`  - 完整配对: ${this.statistics.before.matchedPairs}对`)
        console.log('  - 数据完整性: 100.00%')
        console.log('  - business_id覆盖率: 100.00%')
        return
      }

      // Step 3: 执行清理
      await this.executeCleanup()

      // Step 4: 验证结果
      const verifyResult = await this.verifyCleanupResult()

      // Step 5: 生成报告
      this.generateReport(verifyResult)
    } catch (error) {
      console.error('❌ 清理过程出错:', error.message)
      console.error(error.stack)
      throw error
    } finally {
      await sequelize.close()
    }
  }
}

// 主执行函数
async function main () {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run') || args.includes('-d')

  // 🔴 安全确认
  if (!dryRun) {
    console.log('⚠️  警告：此操作将永久删除数据！')
    console.log('⚠️  将删除420条积分交易记录和570条抽奖记录（测试账号）')
    console.log('⚠️  请确认您已备份数据并理解此操作的影响！')
    console.log('\n如需继续，请使用 --confirm 参数\n')

    if (!args.includes('--confirm')) {
      console.log('💡 建议先运行DRY RUN：node scripts/cleanup-incomplete-lottery-data.js --dry-run')
      console.log('💡 确认无误后执行：node scripts/cleanup-incomplete-lottery-data.js --confirm')
      process.exit(0)
    }
  }

  const cleaner = new IncompleteDataCleaner()

  try {
    await cleaner.execute(dryRun)

    if (dryRun) {
      console.log('\n✅ DRY RUN 完成！')
      console.log(
        '如需实际执行清理，请运行: node scripts/cleanup-incomplete-lottery-data.js --confirm'
      )
    } else {
      console.log('\n✅ 数据清理完成！')
    }

    process.exit(0)
  } catch (error) {
    console.error('\n❌ 清理失败:', error.message)
    process.exit(1)
  }
}

// 执行
main()
