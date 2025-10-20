/**
 * 分析抽奖积分交易记录覆盖率
 * 检查701条抽奖记录中哪些没有对应的积分消费记录
 */

require('dotenv').config()
const models = require('../models')
const { sequelize, LotteryDraw, PointsTransaction } = models
const BeijingTimeHelper = require('../utils/timeHelper')

async function analyzeLotteryPoints () {
  try {
    await sequelize.authenticate()
    console.log('数据库连接成功\n')

    console.log('=== 抽奖积分交易记录分析 ===\n')

    // 1. 统计总体情况
    const totalDraws = await LotteryDraw.count()
    const totalTransactions = await PointsTransaction.count({
      where: {
        transaction_type: 'consume',
        business_type: 'lottery_consume'
      }
    })

    console.log('📊 总体统计:')
    console.log(`  - 抽奖记录总数: ${totalDraws}`)
    console.log(`  - 积分消费记录: ${totalTransactions}`)
    console.log(`  - 覆盖率: ${((totalTransactions / totalDraws) * 100).toFixed(2)}%\n`)

    // 2. 查询没有对应积分交易的抽奖记录
    const [drawsWithoutTransactions] = await sequelize.query(`
      SELECT 
        ld.draw_id,
        ld.user_id,
        ld.prize_id,
        ld.draw_type,
        ld.cost_points,
        ld.created_at,
        u.mobile,
        u.nickname
      FROM lottery_draws ld
      LEFT JOIN users u ON ld.user_id = u.user_id
      WHERE NOT EXISTS (
        SELECT 1 
        FROM points_transactions pt 
        WHERE pt.user_id = ld.user_id 
          AND pt.business_type = 'lottery_consume'
          AND pt.transaction_type = 'consume'
          AND ABS(pt.points_amount) = ld.cost_points
          AND ABS(TIMESTAMPDIFF(SECOND, pt.created_at, ld.created_at)) < 10
      )
      ORDER BY ld.created_at DESC
      LIMIT 20
    `)

    console.log('🔍 缺失积分交易记录的抽奖（前20条）:')
    console.log(`  共${drawsWithoutTransactions.length}条\n`)

    if (drawsWithoutTransactions.length > 0) {
      console.log('详细信息:')
      drawsWithoutTransactions.forEach((draw, index) => {
        console.log(`\n${index + 1}. 抽奖ID: ${draw.draw_id}`)
        console.log(`   用户: ${draw.mobile || 'N/A'} (${draw.nickname || 'N/A'})`)
        console.log(`   用户ID: ${draw.user_id}`)
        console.log(`   奖品ID: ${draw.prize_id}`)
        console.log(`   抽奖类型: ${draw.draw_type}`)
        console.log(`   消耗积分: ${draw.cost_points}`)
        console.log(`   创建时间: ${BeijingTimeHelper.toBeijingTime(draw.created_at)}`)
      })
    }

    // 3. 按日期统计覆盖率
    const [coverageByDate] = await sequelize.query(`
      SELECT 
        DATE(ld.created_at) as draw_date,
        COUNT(DISTINCT ld.draw_id) as total_draws,
        COUNT(DISTINCT pt.transaction_id) as with_transactions,
        ROUND(COUNT(DISTINCT pt.transaction_id) * 100.0 / COUNT(DISTINCT ld.draw_id), 2) as coverage_rate
      FROM lottery_draws ld
      LEFT JOIN points_transactions pt 
        ON pt.user_id = ld.user_id 
        AND pt.business_type = 'lottery_consume'
        AND pt.transaction_type = 'consume'
        AND ABS(pt.points_amount) = ld.cost_points
        AND ABS(TIMESTAMPDIFF(SECOND, pt.created_at, ld.created_at)) < 10
      GROUP BY DATE(ld.created_at)
      ORDER BY draw_date DESC
      LIMIT 10
    `)

    console.log('\n\n📅 按日期统计覆盖率（最近10天）:')
    coverageByDate.forEach(day => {
      const indicator = day.coverage_rate >= 90 ? '✅' : day.coverage_rate >= 70 ? '⚠️' : '❌'
      console.log(
        `${indicator} ${day.draw_date}: ${day.total_draws}次抽奖, ${day.with_transactions}条交易, 覆盖率${day.coverage_rate}%`
      )
    })

    // 4. 按抽奖类型统计
    const [coverageByType] = await sequelize.query(`
      SELECT 
        ld.draw_type,
        COUNT(DISTINCT ld.draw_id) as total_draws,
        COUNT(DISTINCT pt.transaction_id) as with_transactions,
        ROUND(COUNT(DISTINCT pt.transaction_id) * 100.0 / COUNT(DISTINCT ld.draw_id), 2) as coverage_rate
      FROM lottery_draws ld
      LEFT JOIN points_transactions pt 
        ON pt.user_id = ld.user_id 
        AND pt.business_type = 'lottery_consume'
        AND pt.transaction_type = 'consume'
        AND ABS(pt.points_amount) = ld.cost_points
        AND ABS(TIMESTAMPDIFF(SECOND, pt.created_at, ld.created_at)) < 10
      GROUP BY ld.draw_type
      ORDER BY total_draws DESC
    `)

    console.log('\n\n🎯 按抽奖类型统计覆盖率:')
    coverageByType.forEach(type => {
      const indicator = type.coverage_rate >= 90 ? '✅' : type.coverage_rate >= 70 ? '⚠️' : '❌'
      console.log(
        `${indicator} ${type.draw_type}: ${type.total_draws}次抽奖, ${type.with_transactions}条交易, 覆盖率${type.coverage_rate}%`
      )
    })

    // 5. 分析结论
    console.log('\n\n=== 分析结论 ===\n')

    const missingCount = totalDraws - totalTransactions
    const coverageRate = ((totalTransactions / totalDraws) * 100).toFixed(2)

    if (coverageRate >= 90) {
      console.log('✅ 积分交易记录覆盖率良好（≥90%）')
    } else if (coverageRate >= 70) {
      console.log('⚠️ 积分交易记录覆盖率一般（70-90%）')
      console.log('   建议: 检查最近的抽奖逻辑是否正确调用PointsService.consumePoints')
    } else {
      console.log('❌ 积分交易记录覆盖率较低（<70%）')
      console.log('   需要紧急处理')
    }

    console.log(`\n缺失${missingCount}条积分交易记录`)
    console.log('可能原因:')
    console.log('  1. 历史数据迁移时未创建积分交易记录')
    console.log('  2. 某些抽奖场景未正确调用PointsService.consumePoints')
    console.log('  3. 测试数据或模拟数据未正确处理\n')

    await sequelize.close()
  } catch (error) {
    console.error('分析失败:', error.message)
    await sequelize.close()
    process.exit(1)
  }
}

analyzeLotteryPoints()
