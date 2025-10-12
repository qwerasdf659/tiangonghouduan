/**
 * 补录缺失的抽奖积分交易记录
 *
 * 问题背景：
 * - 701次抽奖记录，只有551条积分交易记录，覆盖率78.60%
 * - 缺失150条积分交易记录
 * - 主要集中在早期测试数据（2025-09-30至2025-10-02）
 *
 * 解决方案：
 * - 分析每条抽奖记录，检查是否有对应的积分交易记录
 * - 对于缺失的记录，补录积分交易记录（不实际扣除积分，因为历史已扣除）
 * - 区分测试账号和正式账号，测试账号跳过补录
 *
 * 创建时间：2025-10-10
 * @author Claude 4 Sonnet
 */

require('dotenv').config()
const models = require('../models')
const { sequelize, LotteryDraw, PointsTransaction, UserPointsAccount } = models
const BeijingTimeHelper = require('../utils/timeHelper')
const { isTestAccount } = require('../utils/TestAccountManager')

class LotteryTransactionBackfiller {
  constructor () {
    this.statistics = {
      totalDraws: 0,
      withTransactions: 0,
      missingTransactions: 0,
      testAccountSkipped: 0,
      realAccountBackfilled: 0,
      errors: []
    }
  }

  /**
   * 分析缺失的积分交易记录（优化版 - 使用SQL批量查询）
   */
  async analyzeMissingTransactions () {
    console.log('🔍 开始分析缺失的抽奖积分交易记录...\n')

    // 使用SQL批量查询找出缺失的记录（更高效）
    const [drawsWithoutTransactions] = await sequelize.query(`
      SELECT 
        ld.draw_id,
        ld.user_id,
        ld.cost_points,
        ld.created_at,
        ld.draw_type
      FROM lottery_draws ld
      WHERE NOT EXISTS (
        SELECT 1 
        FROM points_transactions pt 
        WHERE pt.user_id = ld.user_id 
          AND pt.business_type = 'lottery_consume'
          AND pt.transaction_type = 'consume'
          AND ABS(pt.points_amount) = ld.cost_points
          AND ABS(TIMESTAMPDIFF(SECOND, pt.created_at, ld.created_at)) < 10
      )
      ORDER BY ld.created_at ASC
    `)

    // 统计总数
    const totalDraws = await LotteryDraw.count()
    this.statistics.totalDraws = totalDraws
    this.statistics.withTransactions = totalDraws - drawsWithoutTransactions.length
    this.statistics.missingTransactions = drawsWithoutTransactions.length

    console.log(`📊 总抽奖记录数: ${totalDraws}`)
    console.log(`✅ 有积分交易记录: ${this.statistics.withTransactions}条`)
    console.log(`❌ 缺失积分交易记录: ${this.statistics.missingTransactions}条`)
    console.log(
      `📊 覆盖率: ${((this.statistics.withTransactions / totalDraws) * 100).toFixed(2)}%\n`
    )

    // 转换为需要的格式并标记测试账号
    const missingList = drawsWithoutTransactions.map(draw => {
      const isTest = isTestAccount(draw.user_id)
      return {
        draw_id: draw.draw_id,
        user_id: draw.user_id,
        cost_points: draw.cost_points,
        created_at: draw.created_at,
        draw_type: draw.draw_type,
        is_test_account: isTest
      }
    })

    // 统计测试账号和正式账号数量
    const testAccountCount = missingList.filter(item => item.is_test_account).length
    const realAccountCount = missingList.filter(item => !item.is_test_account).length

    console.log('🔍 缺失记录分析:')
    console.log(`  - 测试账号: ${testAccountCount}条`)
    console.log(`  - 正式账号: ${realAccountCount}条\n`)

    return missingList
  }

  /**
   * 补录缺失的积分交易记录
   */
  async backfillMissingTransactions (missingList) {
    console.log('🔧 开始补录缺失的积分交易记录...\n')

    for (const item of missingList) {
      try {
        // 🎯 策略：测试账号不补录，正式账号需要补录
        if (item.is_test_account) {
          console.log(`⏭️  跳过测试账号: user_id=${item.user_id}, draw_id=${item.draw_id}`)
          this.statistics.testAccountSkipped++
          continue
        }

        // 获取当前积分账户
        const account = await UserPointsAccount.findOne({
          where: { user_id: item.user_id }
        })

        if (!account) {
          console.log(`❌ 用户${item.user_id}积分账户不存在，跳过`)
          this.statistics.errors.push({
            draw_id: item.draw_id,
            user_id: item.user_id,
            error: '积分账户不存在'
          })
          continue
        }

        await sequelize.transaction(async t => {
          // 创建补录交易记录
          // ⚠️ 注意：不实际修改account余额，因为历史已经扣除
          // 只是补录交易记录以完善审计追踪
          await PointsTransaction.create(
            {
              user_id: item.user_id,
              account_id: account.account_id,
              transaction_type: 'consume',
              points_amount: item.cost_points,
              points_balance_before: account.available_points, // 使用当前余额
              points_balance_after: account.available_points, // 不实际扣除
              business_type: 'lottery_consume',
              source_type: 'system',
              business_id: `backfill_${item.draw_id}`,
              transaction_title: '抽奖消费积分（补录）',
              transaction_description: `补录历史抽奖记录的积分消费（抽奖时间：${BeijingTimeHelper.toBeijingTime(item.created_at)}）`,
              transaction_time: item.created_at, // 使用原抽奖时间
              status: 'completed'
            },
            { transaction: t }
          )

          console.log(
            `✅ 补录成功: draw_id=${item.draw_id}, user_id=${item.user_id}, points=${item.cost_points}`
          )
          this.statistics.realAccountBackfilled++
        })
      } catch (error) {
        console.error(`❌ 补录失败: draw_id=${item.draw_id}, 错误: ${error.message}`)
        this.statistics.errors.push({
          draw_id: item.draw_id,
          user_id: item.user_id,
          error: error.message
        })
      }
    }
  }

  /**
   * 验证补录结果
   */
  async verifyBackfill () {
    console.log('\n🔍 验证补录结果...\n')

    // 重新统计覆盖率
    const totalDraws = await LotteryDraw.count()
    const totalTransactions = await PointsTransaction.count({
      where: {
        transaction_type: 'consume',
        business_type: 'lottery_consume'
      }
    })

    const newCoverageRate = ((totalTransactions / totalDraws) * 100).toFixed(2)

    console.log('📊 补录后统计:')
    console.log(`  - 抽奖记录总数: ${totalDraws}`)
    console.log(`  - 积分消费记录: ${totalTransactions}`)
    console.log(`  - 覆盖率: ${newCoverageRate}%`)

    // 检查是否还有缺失
    const [stillMissing] = await sequelize.query(`
      SELECT COUNT(*) as missing_count
      FROM lottery_draws ld
      WHERE NOT EXISTS (
        SELECT 1 
        FROM points_transactions pt 
        WHERE pt.user_id = ld.user_id 
          AND pt.business_type = 'lottery_consume'
          AND pt.transaction_type = 'consume'
          AND ABS(pt.points_amount) = ld.cost_points
          AND ABS(TIMESTAMPDIFF(SECOND, pt.created_at, ld.created_at)) < 10
      )
    `)

    const stillMissingCount = stillMissing[0].missing_count

    if (stillMissingCount > 0) {
      console.log(`\n⚠️  仍有${stillMissingCount}条记录未补录（可能是测试账号）`)
    } else {
      console.log('\n✅ 所有正式账号的抽奖记录都已补录完成！')
    }

    return {
      totalDraws,
      totalTransactions,
      coverageRate: newCoverageRate,
      stillMissingCount
    }
  }

  /**
   * 生成补录报告
   */
  generateReport () {
    console.log('\n' + '='.repeat(60))
    console.log('📊 抽奖积分交易补录报告')
    console.log('='.repeat(60))
    console.log(`执行时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log('\n总体统计:')
    console.log(`  - 抽奖记录总数: ${this.statistics.totalDraws}`)
    console.log(`  - 已有积分交易: ${this.statistics.withTransactions}条`)
    console.log(`  - 缺失积分交易: ${this.statistics.missingTransactions}条`)
    console.log('\n补录执行:')
    console.log(`  - 测试账号跳过: ${this.statistics.testAccountSkipped}条`)
    console.log(`  - 正式账号补录: ${this.statistics.realAccountBackfilled}条`)
    console.log(`  - 补录失败: ${this.statistics.errors.length}条`)

    if (this.statistics.errors.length > 0) {
      console.log('\n❌ 失败记录:')
      this.statistics.errors.forEach((err, index) => {
        console.log(
          `  ${index + 1}. draw_id=${err.draw_id}, user_id=${err.user_id}, 错误=${err.error}`
        )
      })
    }

    console.log('='.repeat(60))
  }

  /**
   * 执行完整补录流程
   */
  async execute (dryRun = false) {
    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功\n')

      if (dryRun) {
        console.log('🔍 DRY RUN 模式 - 仅分析，不实际补录\n')
      }

      // Step 1: 分析缺失的交易记录
      const missingList = await this.analyzeMissingTransactions()

      if (missingList.length === 0) {
        console.log('✅ 没有缺失的积分交易记录，无需补录！')
        return
      }

      // Step 2: 补录缺失的记录（除非是dry run）
      if (!dryRun) {
        await this.backfillMissingTransactions(missingList)
      } else {
        console.log('\n⏭️  DRY RUN 模式跳过实际补录\n')
        // 统计将会补录和跳过的数量
        const testAccountCount = missingList.filter(item => item.is_test_account).length
        const realAccountCount = missingList.filter(item => !item.is_test_account).length
        console.log('预计操作:')
        console.log(`  - 测试账号跳过: ${testAccountCount}条`)
        console.log(`  - 正式账号补录: ${realAccountCount}条`)
      }

      // Step 3: 验证补录结果
      await this.verifyBackfill()

      // Step 4: 生成报告
      this.generateReport()
    } catch (error) {
      console.error('❌ 补录过程出错:', error.message)
      console.error(error.stack)
      throw error
    } finally {
      await sequelize.close()
    }
  }
}

// 主执行函数
async function main () {
  // 检查命令行参数
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run') || args.includes('-d')

  const backfiller = new LotteryTransactionBackfiller()

  try {
    await backfiller.execute(dryRun)

    if (dryRun) {
      console.log('\n✅ DRY RUN 完成！')
      console.log('如需实际执行补录，请运行: node scripts/backfill-lottery-transactions.js')
    } else {
      console.log('\n✅ 补录完成！')
    }

    process.exit(0)
  } catch (error) {
    console.error('\n❌ 补录失败:', error.message)
    process.exit(1)
  }
}

// 执行
main()
