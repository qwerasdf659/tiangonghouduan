#!/usr/bin/env node
/**
 * 临时脚本：测试 Tier Distribution 查询是否正常
 * 
 * 完成后请删除此脚本
 * @date 2026-02-06
 */

'use strict'

require('dotenv').config()

const { Sequelize } = require('sequelize')

async function testTierDistribution() {
  console.log('='.repeat(60))
  console.log('🧪 测试 Tier Distribution 查询')
  console.log('='.repeat(60))
  
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: console.log  // 显示 SQL 日志
    }
  )

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 模拟 StatisticsService._getTierDistributionFromDecisions 的查询
    console.log('📋 执行 JOIN 查询 (lottery_draw_decisions + lottery_draws)...\n')
    
    const lottery_campaign_id = 1
    const start_time = new Date(Date.now() - 24 * 60 * 60 * 1000)  // 24小时前
    const end_time = new Date()

    const [result] = await sequelize.query(`
      SELECT 
        ldd.budget_tier,
        COUNT(ldd.lottery_draw_decision_id) as count
      FROM lottery_draw_decisions ldd
      INNER JOIN lottery_draws ld 
        ON ldd.lottery_draw_id = ld.lottery_draw_id
      WHERE ld.lottery_campaign_id = ?
        AND ld.created_at >= ?
        AND ld.created_at <= ?
      GROUP BY ldd.budget_tier
    `, {
      replacements: [lottery_campaign_id, start_time, end_time]
    })

    console.log('\n✅ 查询成功！结果:')
    console.log(JSON.stringify(result, null, 2))
    
    // 计算总数和百分比
    const total = result.reduce((sum, row) => sum + parseInt(row.count), 0)
    console.log(`\n📊 总抽奖次数: ${total}`)
    
    for (const row of result) {
      const percentage = total > 0 ? (parseInt(row.count) / total * 100).toFixed(2) : 0
      console.log(`   ${row.budget_tier}: ${row.count} (${percentage}%)`)
    }

  } catch (error) {
    console.error('\n❌ 查询失败:', error.message)
    
    if (error.message.includes('Illegal mix of collations')) {
      console.error('\n⚠️ 校对规则冲突仍然存在！')
      console.error('请检查表的校对规则是否已正确统一。')
    }
  } finally {
    await sequelize.close()
  }

  console.log('\n' + '='.repeat(60))
  console.log('测试完成')
  console.log('='.repeat(60))
}

testTierDistribution()

