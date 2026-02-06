#!/usr/bin/env node
/**
 * 算法体系分析脚本
 * 
 * 功能：
 * 1. 连接真实数据库查询数据结构
 * 2. 分析抽奖算法配置
 * 3. 统计业务数据分布
 * 4. 验证算法逻辑配置
 * 
 * 使用方法：node scripts/analyze-algorithm-system.js
 */

'use strict'

// 加载环境变量
require('dotenv').config()

const { sequelize, testConnection } = require('../config/database')

// 数据库查询辅助函数
async function runQuery(sql, options = {}) {
  try {
    const [results] = await sequelize.query(sql, options)
    return results
  } catch (error) {
    console.error(`查询失败: ${error.message}`)
    return []
  }
}

// ============ 分析函数 ============

/**
 * 1. 分析抽奖活动配置
 */
async function analyzeLotteryCampaigns() {
  console.log('\n' + '='.repeat(60))
  console.log('📊 1. 抽奖活动配置分析')
  console.log('='.repeat(60))

  const campaigns = await runQuery(`
    SELECT 
      lottery_campaign_id,
      campaign_code,
      campaign_name,
      status,
      budget_mode,
      total_budget,
      remaining_budget,
      guarantee_enabled,
      guarantee_threshold,
      guarantee_prize_id,
      start_time,
      end_time,
      created_at
    FROM lottery_campaigns
    ORDER BY created_at DESC
    LIMIT 10
  `)

  console.log(`\n📌 活动总数: ${campaigns.length} 条记录`)
  
  for (const campaign of campaigns) {
    console.log(`\n  [${campaign.lottery_campaign_id}] ${campaign.campaign_name}`)
    console.log(`      代码: ${campaign.campaign_code}`)
    console.log(`      状态: ${campaign.status}`)
    console.log(`      预算模式: ${campaign.budget_mode}`)
    console.log(`      总预算: ${campaign.total_budget || 'N/A'} | 剩余: ${campaign.remaining_budget || 'N/A'}`)
    console.log(`      保底: ${campaign.guarantee_enabled ? '启用' : '禁用'} | 阈值: ${campaign.guarantee_threshold || 'N/A'}次`)
  }

  // 统计各状态活动数量
  const statusStats = await runQuery(`
    SELECT status, COUNT(*) as count
    FROM lottery_campaigns
    GROUP BY status
  `)
  console.log('\n📈 活动状态分布:')
  for (const stat of statusStats) {
    console.log(`    ${stat.status}: ${stat.count} 个活动`)
  }

  return campaigns
}

/**
 * 2. 分析奖品配置和档位分布
 */
async function analyzePrizes() {
  console.log('\n' + '='.repeat(60))
  console.log('🎁 2. 奖品配置分析')
  console.log('='.repeat(60))

  // 按档位统计奖品
  const tierStats = await runQuery(`
    SELECT 
      lottery_campaign_id,
      reward_tier,
      COUNT(*) as prize_count,
      SUM(win_weight) as total_weight,
      AVG(prize_value_points) as avg_value,
      MIN(prize_value_points) as min_value,
      MAX(prize_value_points) as max_value
    FROM lottery_prizes
    WHERE status = 'active'
    GROUP BY lottery_campaign_id, reward_tier
    ORDER BY lottery_campaign_id, 
      CASE reward_tier 
        WHEN 'high' THEN 1 
        WHEN 'mid' THEN 2 
        WHEN 'low' THEN 3 
        WHEN 'fallback' THEN 4 
        ELSE 5 
      END
  `)

  console.log('\n📌 按活动和档位统计奖品:')
  let currentCampaign = null
  for (const stat of tierStats) {
    if (stat.lottery_campaign_id !== currentCampaign) {
      currentCampaign = stat.lottery_campaign_id
      console.log(`\n  活动 #${stat.lottery_campaign_id}:`)
    }
    console.log(`    ${stat.reward_tier.padEnd(10)} | 奖品数: ${String(stat.prize_count).padStart(3)} | 权重总和: ${String(stat.total_weight || 0).padStart(10)} | 价值: ${Math.round(stat.avg_value || 0)}(${stat.min_value || 0}-${stat.max_value || 0})`)
  }

  // 查看具体奖品配置示例
  const samplePrizes = await runQuery(`
    SELECT 
      prize_id,
      lottery_campaign_id,
      prize_name,
      prize_type,
      reward_tier,
      win_weight,
      prize_value_points,
      stock_quantity,
      daily_win_count
    FROM lottery_prizes
    WHERE status = 'active'
    ORDER BY lottery_campaign_id, win_weight DESC
    LIMIT 20
  `)

  console.log('\n📋 奖品配置示例 (前20个):')
  for (const prize of samplePrizes) {
    console.log(`  [${prize.lottery_prize_id}] ${prize.prize_name.substring(0, 15).padEnd(15)} | ${prize.reward_tier.padEnd(8)} | 权重: ${String(prize.win_weight).padStart(8)} | 价值: ${String(prize.prize_value_points || 0).padStart(6)} | 库存: ${prize.stock_quantity ?? '∞'}`)
  }

  return tierStats
}

/**
 * 3. 分析档位规则配置（TierRule）
 */
async function analyzeTierRules() {
  console.log('\n' + '='.repeat(60))
  console.log('⚖️ 3. 档位规则配置分析')
  console.log('='.repeat(60))

  const tierRules = await runQuery(`
    SELECT 
      lottery_campaign_id,
      segment_key,
      tier_name,
      tier_weight,
      priority,
      status
    FROM lottery_tier_rules
    WHERE status = 'active'
    ORDER BY lottery_campaign_id, segment_key, priority DESC
  `)

  console.log(`\n📌 档位规则总数: ${tierRules.length} 条`)

  // 按活动和分群组织
  const grouped = {}
  for (const rule of tierRules) {
    const key = `${rule.lottery_campaign_id}_${rule.segment_key}`
    if (!grouped[key]) {
      grouped[key] = {
        lottery_campaign_id: rule.lottery_campaign_id,
        segment_key: rule.segment_key,
        rules: []
      }
    }
    grouped[key].rules.push(rule)
  }

  for (const [key, group] of Object.entries(grouped)) {
    console.log(`\n  活动 #${group.lottery_campaign_id} - 分群: ${group.segment_key}`)
    let totalWeight = 0
    for (const rule of group.rules) {
      totalWeight += rule.tier_weight
      const percent = (rule.tier_weight / 1000000 * 100).toFixed(2)
      console.log(`    ${rule.tier_name.padEnd(10)} | 权重: ${String(rule.tier_weight).padStart(8)} (${percent}%)`)
    }
    console.log(`    ${'总计'.padEnd(10)} | 权重: ${String(totalWeight).padStart(8)} (${(totalWeight / 1000000 * 100).toFixed(2)}%)`)
  }

  return tierRules
}

/**
 * 4. 分析定价配置
 */
async function analyzePricingConfig() {
  console.log('\n' + '='.repeat(60))
  console.log('💰 4. 定价配置分析')
  console.log('='.repeat(60))

  const pricingConfigs = await runQuery(`
    SELECT 
      config_id,
      lottery_campaign_id,
      version,
      single_draw_cost,
      multi_draw_10_cost,
      multi_draw_10_discount,
      status,
      effective_time,
      created_at
    FROM lottery_campaign_pricing_config
    WHERE status = 'active'
    ORDER BY lottery_campaign_id, version DESC
  `)

  console.log(`\n📌 定价配置总数: ${pricingConfigs.length} 条`)

  for (const config of pricingConfigs) {
    console.log(`\n  活动 #${config.lottery_campaign_id} (版本 ${config.version}):`)
    console.log(`    单抽成本: ${config.single_draw_cost} 积分`)
    console.log(`    10连抽成本: ${config.multi_draw_10_cost} 积分`)
    console.log(`    10连抽折扣: ${config.multi_draw_10_discount || 0}%`)
    console.log(`    状态: ${config.status}`)
  }

  return pricingConfigs
}

/**
 * 5. 分析配额规则
 */
async function analyzeQuotaRules() {
  console.log('\n' + '='.repeat(60))
  console.log('📋 5. 配额规则分析')
  console.log('='.repeat(60))

  const quotaRules = await runQuery(`
    SELECT 
      lottery_draw_quota_rule_id,
      scope_type,
      scope_id,
      limit_value,
      priority,
      status,
      effective_from,
      effective_to
    FROM lottery_draw_quota_rules
    WHERE status = 'active'
    ORDER BY priority DESC
    LIMIT 20
  `)

  console.log(`\n📌 配额规则总数: ${quotaRules.length} 条 (显示前20条)`)

  // 按作用域类型分组（scope_type: global/campaign/role/user）
  const byType = {}
  for (const rule of quotaRules) {
    if (!byType[rule.scope_type]) {
      byType[rule.scope_type] = []
    }
    byType[rule.scope_type].push(rule)
  }

  for (const [type, rules] of Object.entries(byType)) {
    console.log(`\n  规则类型: ${type}`)
    for (const rule of rules.slice(0, 5)) {
      let target = ''
      if (rule.scope_type === 'campaign') target = `活动#${rule.scope_id}`
      if (rule.scope_type === 'role') target = `角色:${rule.scope_id}`
      if (rule.scope_type === 'user') target = `用户#${rule.scope_id}`
      console.log(`    [${rule.lottery_draw_quota_rule_id}] ${target || '全局'} | 每日限制: ${rule.limit_value} 次 | 优先级: ${rule.priority}`)
    }
  }

  return quotaRules
}

/**
 * 6. 分析策略配置（BxPx矩阵）
 */
async function analyzeStrategyConfig() {
  console.log('\n' + '='.repeat(60))
  console.log('🎯 6. 策略配置分析 (BxPx矩阵)')
  console.log('='.repeat(60))

  // 策略全局配置
  const strategyConfigs = await runQuery(`
    SELECT 
      config_group,
      config_key,
      config_value,
      description
    FROM lottery_strategy_config
    WHERE status = 'active'
    ORDER BY config_group, config_key
    LIMIT 50
  `)

  console.log(`\n📌 策略配置总数: ${strategyConfigs.length} 条`)

  const byGroup = {}
  for (const config of strategyConfigs) {
    if (!byGroup[config.config_group]) {
      byGroup[config.config_group] = []
    }
    byGroup[config.config_group].push(config)
  }

  for (const [group, configs] of Object.entries(byGroup)) {
    console.log(`\n  配置组: ${group}`)
    for (const config of configs.slice(0, 10)) {
      const value = config.config_value?.substring(0, 50) || 'N/A'
      console.log(`    ${config.config_key}: ${value}`)
    }
  }

  // BxPx矩阵配置
  const matrixConfigs = await runQuery(`
    SELECT 
      budget_tier,
      pressure_tier,
      empty_weight_multiplier,
      cap_multiplier,
      description
    FROM lottery_tier_matrix_config
    WHERE status = 'active'
    ORDER BY budget_tier, pressure_tier
  `)

  console.log('\n📊 BxPx矩阵配置:')
  console.log('    Budget\\Pressure |    P0    |    P1    |    P2    |')
  console.log('    ' + '-'.repeat(55))

  const matrix = {}
  for (const config of matrixConfigs) {
    if (!matrix[config.budget_tier]) {
      matrix[config.budget_tier] = {}
    }
    matrix[config.budget_tier][config.pressure_tier] = config
  }

  for (const bt of ['B0', 'B1', 'B2', 'B3']) {
    let row = `    ${bt.padEnd(18)} |`
    for (const pt of ['P0', 'P1', 'P2']) {
      const config = matrix[bt]?.[pt]
      if (config) {
        row += ` ${String(config.empty_weight_multiplier).padStart(4)}x  |`
      } else {
        row += '   N/A   |'
      }
    }
    console.log(row)
  }

  return { strategyConfigs, matrixConfigs }
}

/**
 * 7. 分析抽奖记录统计
 */
async function analyzeDrawRecords() {
  console.log('\n' + '='.repeat(60))
  console.log('📈 7. 抽奖记录统计分析')
  console.log('='.repeat(60))

  // 总体统计
  const totalStats = await runQuery(`
    SELECT 
      COUNT(*) as total_draws,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(DISTINCT lottery_campaign_id) as active_campaigns,
      SUM(CASE WHEN guarantee_triggered = 1 THEN 1 ELSE 0 END) as guarantee_count,
      SUM(cost_points) as total_cost,
      SUM(prize_value_points) as total_prize_value
    FROM lottery_draws
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  `)

  const stats = totalStats[0] || {}
  console.log('\n📌 最近30天统计:')
  console.log(`    总抽奖次数: ${stats.total_draws || 0}`)
  console.log(`    独立用户数: ${stats.unique_users || 0}`)
  console.log(`    活跃活动数: ${stats.active_campaigns || 0}`)
  console.log(`    保底触发次数: ${stats.guarantee_count || 0}`)
  console.log(`    总消耗积分: ${stats.total_cost || 0}`)
  console.log(`    总奖品价值: ${stats.total_prize_value || 0}`)

  // 按档位统计
  const tierStats = await runQuery(`
    SELECT 
      reward_tier,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM lottery_draws WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)), 2) as percentage
    FROM lottery_draws
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY reward_tier
    ORDER BY count DESC
  `)

  console.log('\n📊 档位分布 (最近30天):')
  for (const tier of tierStats) {
    console.log(`    ${(tier.reward_tier || 'unknown').padEnd(10)} | ${String(tier.count).padStart(8)} 次 | ${tier.percentage}%`)
  }

  // 按日期统计趋势
  const dailyStats = await runQuery(`
    SELECT 
      DATE(created_at) as draw_date,
      COUNT(*) as draw_count,
      COUNT(DISTINCT user_id) as user_count
    FROM lottery_draws
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE(created_at)
    ORDER BY draw_date DESC
  `)

  console.log('\n📆 最近7天趋势:')
  for (const day of dailyStats) {
    console.log(`    ${day.draw_date} | ${String(day.draw_count).padStart(6)} 抽 | ${String(day.user_count).padStart(5)} 人`)
  }

  return { totalStats: stats, tierStats, dailyStats }
}

/**
 * 8. 分析体验状态（Pity/AntiStreak）
 */
async function analyzeExperienceStates() {
  console.log('\n' + '='.repeat(60))
  console.log('🎮 8. 用户体验状态分析')
  console.log('='.repeat(60))

  // 活动级体验状态统计
  const experienceStats = await runQuery(`
    SELECT 
      lottery_campaign_id,
      COUNT(*) as user_count,
      AVG(empty_streak_count) as avg_empty_streak,
      MAX(empty_streak_count) as max_empty_streak,
      AVG(recent_high_count) as avg_high_count,
      SUM(pity_triggered_count) as total_pity_triggers
    FROM lottery_user_experience_state
    GROUP BY lottery_campaign_id
    LIMIT 10
  `)

  console.log('\n📌 活动级体验状态统计:')
  for (const stat of experienceStats) {
    console.log(`\n  活动 #${stat.lottery_campaign_id}:`)
    console.log(`    用户数: ${stat.user_count}`)
    console.log(`    平均空奖连击: ${(stat.avg_empty_streak || 0).toFixed(2)}`)
    console.log(`    最大空奖连击: ${stat.max_empty_streak || 0}`)
    console.log(`    平均高价值次数: ${(stat.avg_high_count || 0).toFixed(2)}`)
    console.log(`    Pity触发总次数: ${stat.total_pity_triggers || 0}`)
  }

  // 全局状态统计
  const globalStats = await runQuery(`
    SELECT 
      COUNT(*) as total_users,
      AVG(historical_empty_rate) as avg_empty_rate,
      AVG(luck_debt_multiplier) as avg_luck_debt,
      SUM(total_draws) as total_draws,
      SUM(total_high_wins) as total_high_wins
    FROM lottery_user_global_state
  `)

  const global = globalStats[0] || {}
  console.log('\n📊 全局体验状态统计:')
  console.log(`    总用户数: ${global.total_users || 0}`)
  console.log(`    平均历史空奖率: ${((global.avg_empty_rate || 0) * 100).toFixed(2)}%`)
  console.log(`    平均运气债务乘数: ${(global.avg_luck_debt || 1).toFixed(4)}`)
  console.log(`    总抽奖次数: ${global.total_draws || 0}`)
  console.log(`    总高价值中奖: ${global.total_high_wins || 0}`)

  return { experienceStats, globalStats: global }
}

/**
 * 9. 分析功能开关配置
 */
async function analyzeFeatureFlags() {
  console.log('\n' + '='.repeat(60))
  console.log('🚩 9. 功能开关配置分析')
  console.log('='.repeat(60))

  const flags = await runQuery(`
    SELECT 
      flag_key,
      flag_name,
      is_enabled,
      rollout_percentage,
      user_whitelist,
      user_blacklist,
      user_segment,
      valid_from,
      valid_until,
      description
    FROM feature_flags
    ORDER BY is_enabled DESC, flag_key
    LIMIT 20
  `)

  console.log(`\n📌 功能开关总数: ${flags.length} 条`)

  console.log('\n🟢 已启用的功能:')
  for (const flag of flags.filter(f => f.is_enabled)) {
    let rollout = flag.rollout_percentage === 100 ? '全量' : `${flag.rollout_percentage}%灰度`
    console.log(`    [${flag.flag_key}] ${flag.flag_name || ''} - ${rollout}`)
    if (flag.user_segment) console.log(`      分群: ${flag.user_segment}`)
  }

  console.log('\n🔴 已禁用的功能:')
  for (const flag of flags.filter(f => !f.is_enabled)) {
    console.log(`    [${flag.flag_key}] ${flag.flag_name || ''}`)
  }

  return flags
}

/**
 * 10. 分析监控指标
 */
async function analyzeMetrics() {
  console.log('\n' + '='.repeat(60))
  console.log('📊 10. 监控指标分析')
  console.log('='.repeat(60))

  // 小时级指标
  const hourlyMetrics = await runQuery(`
    SELECT 
      lottery_campaign_id,
      DATE(hour_bucket) as metric_date,
      SUM(total_draws) as total_draws,
      SUM(tier_high_count) as high_count,
      SUM(tier_mid_count) as mid_count,
      SUM(tier_low_count) as low_count,
      SUM(tier_fallback_count) as fallback_count,
      SUM(pity_trigger_count) as pity_triggers,
      SUM(anti_empty_trigger_count) as anti_empty_triggers,
      SUM(anti_high_trigger_count) as anti_high_triggers
    FROM lottery_hourly_metrics
    WHERE hour_bucket >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY lottery_campaign_id, DATE(hour_bucket)
    ORDER BY metric_date DESC
    LIMIT 20
  `)

  console.log('\n📌 最近7天监控指标:')
  for (const metric of hourlyMetrics) {
    console.log(`\n  活动 #${metric.lottery_campaign_id} - ${metric.metric_date}:`)
    console.log(`    总抽奖: ${metric.total_draws} 次`)
    console.log(`    档位分布: high=${metric.high_count}, mid=${metric.mid_count}, low=${metric.low_count}, fallback=${metric.fallback_count}`)
    console.log(`    机制触发: Pity=${metric.pity_triggers}, AntiEmpty=${metric.anti_empty_triggers}, AntiHigh=${metric.anti_high_triggers}`)
  }

  return hourlyMetrics
}

/**
 * 主函数
 */
async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('🔍 算法体系分析脚本')
  console.log('═'.repeat(60))
  console.log(`执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log('数据库: ' + (process.env.DB_HOST || 'localhost') + ':' + (process.env.DB_PORT || '3306') + '/' + (process.env.DB_NAME || 'unknown'))

  try {
    // 测试数据库连接
    console.log('\n⏳ 正在连接数据库...')
    await testConnection()
    console.log('✅ 数据库连接成功!')

    // 执行各项分析
    await analyzeLotteryCampaigns()
    await analyzePrizes()
    await analyzeTierRules()
    await analyzePricingConfig()
    await analyzeQuotaRules()
    await analyzeStrategyConfig()
    await analyzeDrawRecords()
    await analyzeExperienceStates()
    await analyzeFeatureFlags()
    await analyzeMetrics()

    console.log('\n' + '═'.repeat(60))
    console.log('✅ 分析完成!')
    console.log('═'.repeat(60))

  } catch (error) {
    console.error('\n❌ 分析失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    // 关闭数据库连接
    await sequelize.close()
  }
}

// 执行主函数
main()

