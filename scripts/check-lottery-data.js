#!/usr/bin/env node
/**
 * 抽奖运营后台数据检查脚本
 * 用于验证需求文档中的数据质量假设和实际数据库状态
 */

require('dotenv').config()
const { sequelize } = require('../config/database')
const { QueryTypes } = require('sequelize')

async function checkLotteryData() {
  console.log('====================================')
  console.log('🔍 抽奖运营后台数据质量检查')
  console.log('====================================\n')

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 检查各表记录数
    console.log('📊 1. 核心表记录数统计')
    console.log('----------------------------------')
    
    const tables = [
      'lottery_draws',
      'lottery_draw_decisions', 
      'lottery_hourly_metrics',
      'lottery_user_experience_state',
      'lottery_user_global_state',
      'lottery_campaigns',
      'risk_alerts',
      'users'
    ]

    for (const table of tables) {
      try {
        const [result] = await sequelize.query(
          `SELECT COUNT(*) as count FROM ${table}`,
          { type: QueryTypes.SELECT }
        )
        console.log(`  ${table}: ${result.count} 条`)
      } catch (e) {
        console.log(`  ${table}: ❌ 表不存在或查询失败`)
      }
    }

    // 2. 检查 lottery_draw_decisions 的数据质量问题
    console.log('\n📊 2. lottery_draw_decisions 数据质量检查')
    console.log('----------------------------------')

    const [decisionStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN budget_tier IS NULL THEN 1 ELSE 0 END) as null_budget_tier,
        SUM(CASE WHEN pressure_tier IS NULL THEN 1 ELSE 0 END) as null_pressure_tier,
        SUM(CASE WHEN effective_budget IS NULL THEN 1 ELSE 0 END) as null_effective_budget,
        SUM(CASE WHEN decision_context IS NULL THEN 1 ELSE 0 END) as null_decision_context,
        SUM(CASE WHEN pity_decision IS NULL THEN 1 ELSE 0 END) as null_pity_decision,
        SUM(CASE WHEN luck_debt_decision IS NULL THEN 1 ELSE 0 END) as null_luck_debt_decision
      FROM lottery_draw_decisions
    `, { type: QueryTypes.SELECT })

    console.log(`  总记录数: ${decisionStats.total}`)
    console.log(`  budget_tier 为 NULL: ${decisionStats.null_budget_tier} (${(decisionStats.null_budget_tier/decisionStats.total*100).toFixed(1)}%)`)
    console.log(`  pressure_tier 为 NULL: ${decisionStats.null_pressure_tier} (${(decisionStats.null_pressure_tier/decisionStats.total*100).toFixed(1)}%)`)
    console.log(`  effective_budget 为 NULL: ${decisionStats.null_effective_budget} (${(decisionStats.null_effective_budget/decisionStats.total*100).toFixed(1)}%)`)
    console.log(`  decision_context 为 NULL: ${decisionStats.null_decision_context} (${(decisionStats.null_decision_context/decisionStats.total*100).toFixed(1)}%)`)
    console.log(`  pity_decision 为 NULL: ${decisionStats.null_pity_decision} (${(decisionStats.null_pity_decision/decisionStats.total*100).toFixed(1)}%)`)
    console.log(`  luck_debt_decision 为 NULL: ${decisionStats.null_luck_debt_decision} (${(decisionStats.null_luck_debt_decision/decisionStats.total*100).toFixed(1)}%)`)

    // 3. 检查 reward_tier 分布
    console.log('\n📊 3. lottery_draws reward_tier 分布')
    console.log('----------------------------------')

    const tierDistribution = await sequelize.query(`
      SELECT 
        reward_tier,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM lottery_draws
      GROUP BY reward_tier
      ORDER BY count DESC
    `, { type: QueryTypes.SELECT })

    tierDistribution.forEach(row => {
      console.log(`  ${row.reward_tier}: ${row.count} 条 (${row.percentage}%)`)
    })

    // 4. 检查 pipeline_type 分布
    console.log('\n📊 4. lottery_draw_decisions pipeline_type 分布')
    console.log('----------------------------------')

    const pipelineDistribution = await sequelize.query(`
      SELECT 
        pipeline_type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM lottery_draw_decisions
      GROUP BY pipeline_type
      ORDER BY count DESC
    `, { type: QueryTypes.SELECT })

    pipelineDistribution.forEach(row => {
      console.log(`  ${row.pipeline_type}: ${row.count} 条 (${row.percentage}%)`)
    })

    // 5. 检查 lottery_hourly_metrics 时间范围
    console.log('\n📊 5. lottery_hourly_metrics 时间范围')
    console.log('----------------------------------')

    const [metricsRange] = await sequelize.query(`
      SELECT 
        MIN(hour_bucket) as earliest,
        MAX(hour_bucket) as latest,
        COUNT(DISTINCT DATE(hour_bucket)) as days_count,
        COUNT(DISTINCT campaign_id) as campaigns_count
      FROM lottery_hourly_metrics
    `, { type: QueryTypes.SELECT })

    console.log(`  最早记录: ${metricsRange.earliest}`)
    console.log(`  最新记录: ${metricsRange.latest}`)
    console.log(`  覆盖天数: ${metricsRange.days_count}`)
    console.log(`  活动数量: ${metricsRange.campaigns_count}`)

    // 6. 检查用户状态表
    console.log('\n📊 6. 用户体验状态表检查')
    console.log('----------------------------------')

    const [expStateStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT campaign_id) as unique_campaigns,
        AVG(total_draw_count) as avg_draws,
        AVG(empty_streak) as avg_empty_streak
      FROM lottery_user_experience_state
    `, { type: QueryTypes.SELECT })

    console.log(`  记录数: ${expStateStats.total}`)
    console.log(`  独立用户: ${expStateStats.unique_users}`)
    console.log(`  活动数: ${expStateStats.unique_campaigns}`)
    console.log(`  平均抽奖次数: ${parseFloat(expStateStats.avg_draws || 0).toFixed(2)}`)
    console.log(`  平均空奖连击: ${parseFloat(expStateStats.avg_empty_streak || 0).toFixed(2)}`)

    // 7. 检查全局状态表
    console.log('\n📊 7. 用户全局状态表检查')
    console.log('----------------------------------')

    const [globalStateStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        AVG(global_draw_count) as avg_total_draws,
        AVG(historical_empty_rate) as avg_empty_rate,
        AVG(luck_debt_multiplier) as avg_luck_debt
      FROM lottery_user_global_state
    `, { type: QueryTypes.SELECT })

    console.log(`  记录数: ${globalStateStats.total}`)
    console.log(`  平均历史抽奖: ${parseFloat(globalStateStats.avg_total_draws || 0).toFixed(2)}`)
    console.log(`  平均空奖率: ${parseFloat(globalStateStats.avg_empty_rate || 0).toFixed(4)}`)
    console.log(`  平均运气债务: ${parseFloat(globalStateStats.avg_luck_debt || 0).toFixed(4)}`)

    // 8. 检查活动信息
    console.log('\n📊 8. lottery_campaigns 活动信息')
    console.log('----------------------------------')

    const campaigns = await sequelize.query(`
      SELECT 
        campaign_id,
        name,
        status,
        budget_mode,
        start_date,
        end_date
      FROM lottery_campaigns
      ORDER BY campaign_id
      LIMIT 10
    `, { type: QueryTypes.SELECT })

    campaigns.forEach(c => {
      console.log(`  ID:${c.campaign_id} ${c.name} [${c.status}] ${c.budget_mode}`)
    })

    // 9. 检查 risk_alerts 表结构和数据
    console.log('\n📊 9. risk_alerts 表检查')
    console.log('----------------------------------')

    try {
      const [riskStats] = await sequelize.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT alert_type) as alert_types,
          COUNT(DISTINCT severity) as severities
        FROM risk_alerts
      `, { type: QueryTypes.SELECT })

      console.log(`  记录数: ${riskStats.total}`)
      console.log(`  告警类型数: ${riskStats.alert_types}`)
      console.log(`  严重级别数: ${riskStats.severities}`)

      if (riskStats.total > 0) {
        const alertTypes = await sequelize.query(`
          SELECT alert_type, COUNT(*) as count
          FROM risk_alerts
          GROUP BY alert_type
        `, { type: QueryTypes.SELECT })
        console.log('  告警类型分布:')
        alertTypes.forEach(t => console.log(`    ${t.alert_type}: ${t.count}`))
      }
    } catch (e) {
      console.log(`  ❌ 表不存在或查询失败: ${e.message}`)
    }

    // 10. 检查 lottery_alerts 表是否存在
    console.log('\n📊 10. lottery_alerts 表检查')
    console.log('----------------------------------')

    try {
      const [result] = await sequelize.query(
        `SELECT COUNT(*) as count FROM lottery_alerts`,
        { type: QueryTypes.SELECT }
      )
      console.log(`  ✅ 表已存在，记录数: ${result.count}`)
    } catch (e) {
      console.log(`  ❌ 表不存在，需要创建`)
    }

    // 11. 检查 IP 地址记录情况
    console.log('\n📊 11. IP 地址记录情况')
    console.log('----------------------------------')

    const [ipStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ip_address IS NOT NULL AND ip_address != '' THEN 1 ELSE 0 END) as with_ip,
        SUM(CASE WHEN ip_address IS NULL OR ip_address = '' THEN 1 ELSE 0 END) as without_ip
      FROM lottery_draws
    `, { type: QueryTypes.SELECT })

    console.log(`  总抽奖记录: ${ipStats.total}`)
    console.log(`  有IP地址: ${ipStats.with_ip} (${(ipStats.with_ip/ipStats.total*100).toFixed(1)}%)`)
    console.log(`  无IP地址: ${ipStats.without_ip} (${(ipStats.without_ip/ipStats.total*100).toFixed(1)}%)`)

    // 12. 检查最近抽奖数据样例
    console.log('\n📊 12. 最近抽奖数据样例 (最新5条)')
    console.log('----------------------------------')

    const recentDraws = await sequelize.query(`
      SELECT 
        ld.draw_id,
        ld.user_id,
        ld.reward_tier,
        ld.pipeline_type,
        ld.created_at,
        ldd.budget_tier,
        ldd.pressure_tier,
        ldd.pity_decision
      FROM lottery_draws ld
      LEFT JOIN lottery_draw_decisions ldd ON ld.draw_id = ldd.draw_id
      ORDER BY ld.created_at DESC
      LIMIT 5
    `, { type: QueryTypes.SELECT })

    recentDraws.forEach((d, i) => {
      console.log(`  ${i+1}. user:${d.user_id} tier:${d.reward_tier} pipeline:${d.pipeline_type} budget_tier:${d.budget_tier || 'NULL'} pity:${d.pity_decision ? 'JSON' : 'NULL'}`)
    })

    console.log('\n====================================')
    console.log('✅ 数据检查完成')
    console.log('====================================')

  } catch (error) {
    console.error('❌ 数据检查失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

checkLotteryData()

