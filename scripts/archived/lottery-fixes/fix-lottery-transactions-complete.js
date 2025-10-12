/**
 * 抽奖积分交易完整修复脚本
 *
 * 问题分析：
 * 1. 历史551条积分交易记录business_id全部为NULL（早期版本未传递）
 * 2. 缺失249条积分交易记录（全部为测试账号user_id=31）
 * 3. 当前代码已修复，能正确保存business_id
 *
 * 修复策略：
 * 1. 回填历史记录的business_id（通过时间±10秒+金额精确匹配）
 * 2. 测试账号缺失记录跳过补录（不影响业务审计）
 *
 * 创建时间：2025-10-10
 * @author Claude 4 Sonnet
 */

require('dotenv').config()
const models = require('../models')
const { sequelize, PointsTransaction } = models
const BeijingTimeHelper = require('../utils/timeHelper')

class LotteryTransactionFixer {
  constructor () {
    this.statistics = {
      totalTransactions: 0,
      nullBusinessId: 0,
      backfilled: 0,
      backfillFailed: 0,
      missingTransactions: 0,
      errors: []
    }
  }

  /**
   * Step 1: 回填历史记录的business_id（优化版 - 使用SQL批量UPDATE）
   */
  async backfillBusinessId () {
    console.log('🔧 Step 1: 回填历史记录的business_id...\n')

    this.statistics.totalTransactions = await PointsTransaction.count({
      where: {
        business_type: 'lottery_consume',
        transaction_type: 'consume'
      }
    })

    const nullBusinessIdCount = await PointsTransaction.count({
      where: {
        business_type: 'lottery_consume',
        transaction_type: 'consume',
        business_id: null
      }
    })

    this.statistics.nullBusinessId = nullBusinessIdCount

    console.log('📊 统计:')
    console.log(`  - 总抽奖积分交易: ${this.statistics.totalTransactions}条`)
    console.log(`  - business_id为NULL: ${this.statistics.nullBusinessId}条`)
    console.log(`  - 需要回填: ${this.statistics.nullBusinessId}条\n`)

    if (nullBusinessIdCount === 0) {
      console.log('✅ 所有记录都有business_id，无需回填\n')
      return
    }

    // 🔧 策略：使用SQL批量匹配和更新，一对一精确匹配
    console.log('🔧 使用SQL批量匹配回填business_id...\n')

    // 创建临时映射表（使用ROW_NUMBER确保一对一匹配）
    const [updateResult] = await sequelize.query(`
      UPDATE points_transactions pt
      INNER JOIN (
        SELECT 
          pt2.transaction_id,
          ld.draw_id,
          ROW_NUMBER() OVER (PARTITION BY ld.draw_id ORDER BY pt2.created_at ASC) as rn
        FROM points_transactions pt2
        INNER JOIN lottery_draws ld
          ON ld.user_id = pt2.user_id
          AND ld.cost_points = ABS(pt2.points_amount)
          AND ABS(TIMESTAMPDIFF(SECOND, ld.created_at, pt2.created_at)) < 10
        WHERE pt2.business_type = 'lottery_consume'
          AND pt2.transaction_type = 'consume'
          AND pt2.business_id IS NULL
      ) AS matched
        ON pt.transaction_id = matched.transaction_id
        AND matched.rn = 1  -- 只取每个抽奖记录的第一个匹配
      SET pt.business_id = matched.draw_id
    `)

    this.statistics.backfilled = updateResult.affectedRows || 0
    this.statistics.backfillFailed = this.statistics.nullBusinessId - this.statistics.backfilled

    console.log('✅ 回填完成:')
    console.log(`  - 成功回填: ${this.statistics.backfilled}条`)
    console.log(`  - 未匹配: ${this.statistics.backfillFailed}条\n`)

    // 对于未匹配的记录，记录错误
    if (this.statistics.backfillFailed > 0) {
      const [unmatchedTransactions] = await sequelize.query(`
        SELECT transaction_id, user_id, points_amount, created_at
        FROM points_transactions
        WHERE business_type = 'lottery_consume'
          AND transaction_type = 'consume'
          AND business_id IS NULL
        LIMIT 10
      `)

      unmatchedTransactions.forEach(t => {
        this.statistics.errors.push({
          transaction_id: t.transaction_id,
          user_id: t.user_id,
          error: '未找到匹配的抽奖记录（时间或金额不匹配）'
        })
      })
    }
  }

  /**
   * Step 2: 验证修复结果
   */
  async verifyResults () {
    console.log('🔍 Step 2: 验证修复结果...\n')

    // 检查business_id覆盖率
    const [businessIdStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN business_id IS NOT NULL AND business_id != '' THEN 1 ELSE 0 END) as with_business_id,
        SUM(CASE WHEN business_id IS NULL OR business_id = '' THEN 1 ELSE 0 END) as without_business_id
      FROM points_transactions
      WHERE business_type = 'lottery_consume'
        AND transaction_type = 'consume'
    `)

    const stats = businessIdStats[0]
    const businessIdCoverage = ((stats.with_business_id / stats.total) * 100).toFixed(2)

    console.log('📊 business_id覆盖率:')
    console.log(`  - 总记录数: ${stats.total}`)
    console.log(`  - 有business_id: ${stats.with_business_id}`)
    console.log(`  - 无business_id: ${stats.without_business_id}`)
    console.log(`  - 覆盖率: ${businessIdCoverage}%\n`)

    // 检查抽奖-积分交易匹配率
    const [matchStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_draws,
        SUM(CASE 
          WHEN EXISTS (
            SELECT 1 FROM points_transactions pt
            WHERE pt.business_id = ld.draw_id
              AND pt.business_type = 'lottery_consume'
          ) THEN 1 ELSE 0
        END) as matched_draws
      FROM lottery_draws ld
    `)

    const matchRate = ((matchStats[0].matched_draws / matchStats[0].total_draws) * 100).toFixed(2)

    console.log('📊 抽奖-积分交易匹配率:')
    console.log(`  - 抽奖记录总数: ${matchStats[0].total_draws}`)
    console.log(`  - 有匹配积分交易: ${matchStats[0].matched_draws}`)
    console.log(`  - 匹配率: ${matchRate}%\n`)

    // 分析未匹配的记录
    const [unmatchedDraws] = await sequelize.query(`
      SELECT user_id, COUNT(*) as count
      FROM lottery_draws ld
      WHERE NOT EXISTS (
        SELECT 1 FROM points_transactions pt
        WHERE pt.business_id = ld.draw_id
          AND pt.business_type = 'lottery_consume'
      )
      GROUP BY user_id
      ORDER BY count DESC
    `)

    if (unmatchedDraws.length > 0) {
      console.log('⚠️  未匹配的抽奖记录:')
      unmatchedDraws.forEach(row => {
        console.log(`  - user_id=${row.user_id}: ${row.count}条`)
      })
      console.log('')
    }

    return {
      businessIdCoverage: parseFloat(businessIdCoverage),
      matchRate: parseFloat(matchRate),
      stats
    }
  }

  /**
   * 生成修复报告
   */
  generateReport (verifyResults) {
    console.log('\n' + '='.repeat(60))
    console.log('📊 抽奖积分交易完整修复报告')
    console.log('='.repeat(60))
    console.log(`执行时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log('\n修复统计:')
    console.log(`  - business_id回填成功: ${this.statistics.backfilled}条`)
    console.log(`  - business_id回填失败: ${this.statistics.backfillFailed}条`)

    console.log('\n最终结果:')
    console.log(`  - business_id覆盖率: ${verifyResults.businessIdCoverage}%`)
    console.log(`  - 抽奖-积分匹配率: ${verifyResults.matchRate}%`)

    if (this.statistics.errors.length > 0) {
      console.log(`\n❌ 失败记录 (${this.statistics.errors.length}条):`)
      this.statistics.errors.slice(0, 10).forEach((err, index) => {
        console.log(`  ${index + 1}. transaction_id=${err.transaction_id}, user_id=${err.user_id}`)
        console.log(`     错误: ${err.error}`)
      })

      if (this.statistics.errors.length > 10) {
        console.log(`  ... 还有${this.statistics.errors.length - 10}条错误记录`)
      }
    }

    console.log('='.repeat(60))

    // 评估修复效果
    if (verifyResults.businessIdCoverage >= 95 && verifyResults.matchRate >= 70) {
      console.log('\n✅ 修复效果优秀！')
    } else if (verifyResults.businessIdCoverage >= 80 && verifyResults.matchRate >= 60) {
      console.log('\n⚠️  修复效果一般，建议进一步优化')
    } else {
      console.log('\n❌ 修复效果不理想，需要人工介入')
    }
  }

  /**
   * 执行完整修复流程
   */
  async execute (dryRun = false) {
    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功\n')

      if (dryRun) {
        console.log('🔍 DRY RUN 模式 - 仅分析，不实际修复\n')

        // 仅进行统计分析
        const stats = await PointsTransaction.count({
          where: {
            business_type: 'lottery_consume',
            business_id: null
          }
        })

        console.log(`📊 将要回填business_id的记录数: ${stats}条\n`)
        console.log('⏭️  DRY RUN 模式跳过实际修复\n')

        return
      }

      // Step 1: 回填business_id
      await this.backfillBusinessId()

      // Step 2: 验证结果
      const verifyResults = await this.verifyResults()

      // Step 3: 生成报告
      this.generateReport(verifyResults)
    } catch (error) {
      console.error('❌ 修复过程出错:', error.message)
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

  const fixer = new LotteryTransactionFixer()

  try {
    await fixer.execute(dryRun)

    if (dryRun) {
      console.log('\n✅ DRY RUN 完成！')
      console.log('如需实际执行修复，请运行: node scripts/fix-lottery-transactions-complete.js')
    } else {
      console.log('\n✅ 修复完成！')
    }

    process.exit(0)
  } catch (error) {
    console.error('\n❌ 修复失败:', error.message)
    process.exit(1)
  }
}

// 执行
main()
