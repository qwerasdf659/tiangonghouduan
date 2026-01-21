#!/usr/bin/env node
/**
 * 临时数据库检查脚本 - 验证web管理平台前端功能补齐方案
 * 连接真实数据库获取实际数据
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../config/database')

async function checkDatabase() {
  console.log('🔍 连接数据库验证方案数据...\n')
  
  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 统计所有表数量
    const [tables] = await sequelize.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
    `)
    console.log(`📊 数据库表总数: ${tables[0].count}`)

    // 2. 核心业务数据统计
    console.log('\n📋 核心业务数据统计:')
    
    // 用户数
    const [users] = await sequelize.query(`SELECT COUNT(*) as count FROM users`)
    console.log(`   用户数: ${users[0].count}`)

    // 抽奖活动
    const [campaigns] = await sequelize.query(`
      SELECT campaign_id, campaign_name, status, budget_mode FROM lottery_campaigns 
      WHERE status != 'deleted' LIMIT 5
    `)
    console.log(`   活动数: ${campaigns.length}`)
    campaigns.forEach(c => console.log(`     - ${c.campaign_name} (${c.status}, ${c.budget_mode})`))

    // 奖品配置
    const [prizes] = await sequelize.query(`SELECT COUNT(*) as count FROM lottery_prizes`)
    console.log(`   奖品配置: ${prizes[0].count}个`)

    // 物品实例
    const [items] = await sequelize.query(`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) as available
      FROM item_instances
    `)
    console.log(`   物品实例: ${items[0].total}个 (可用${items[0].available}个)`)

    // 门店
    const [stores] = await sequelize.query(`SELECT COUNT(*) as count FROM stores`)
    console.log(`   门店数: ${stores[0].count}`)

    // 员工关系
    const [staff] = await sequelize.query(`SELECT COUNT(*) as count FROM store_staff`)
    console.log(`   员工关系: ${staff[0].count}`)

    // 3. 欠账数据
    console.log('\n💰 欠账系统数据:')
    const [inventoryDebt] = await sequelize.query(`
      SELECT COUNT(*) as count, 
             SUM(debt_quantity) as total_debt,
             SUM(cleared_quantity) as cleared
      FROM preset_inventory_debt
    `)
    console.log(`   库存欠账: ${inventoryDebt[0].count}条 (欠${inventoryDebt[0].total_debt || 0}, 已清${inventoryDebt[0].cleared || 0})`)

    const [budgetDebt] = await sequelize.query(`
      SELECT COUNT(*) as count,
             SUM(debt_amount) as total_debt,
             SUM(cleared_amount) as cleared
      FROM preset_budget_debt
    `)
    console.log(`   预算欠账: ${budgetDebt[0].count}条 (欠${budgetDebt[0].total_debt || 0}, 已清${budgetDebt[0].cleared || 0})`)

    // 4. 抽奖策略配置
    console.log('\n🎯 抽奖策略配置:')
    const [strategyConfig] = await sequelize.query(`
      SELECT COUNT(*) as count FROM lottery_strategy_config
    `)
    console.log(`   策略配置: ${strategyConfig[0].count}条`)

    const [tierMatrix] = await sequelize.query(`
      SELECT COUNT(*) as count FROM lottery_tier_matrix_config
    `)
    console.log(`   档位矩阵: ${tierMatrix[0].count}条`)

    const [tierRules] = await sequelize.query(`
      SELECT COUNT(*) as count FROM lottery_tier_rules
    `)
    console.log(`   档位规则: ${tierRules[0].count}条`)

    // 5. 字典表数据
    console.log('\n📖 字典表数据:')
    const [categories] = await sequelize.query(`SELECT COUNT(*) as count FROM category_defs`)
    console.log(`   类目定义: ${categories[0].count}条`)

    const [rarities] = await sequelize.query(`SELECT COUNT(*) as count FROM rarity_defs`)
    console.log(`   稀有度定义: ${rarities[0].count}条`)

    const [assetGroups] = await sequelize.query(`SELECT COUNT(*) as count FROM asset_group_defs`)
    console.log(`   资产组定义: ${assetGroups[0].count}条`)

    // 6. 风控和审计
    console.log('\n🛡️ 风控和审计数据:')
    const [riskAlerts] = await sequelize.query(`
      SELECT COUNT(*) as count,
             SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending
      FROM risk_alerts
    `)
    console.log(`   风控告警: ${riskAlerts[0].count}条 (待处理${riskAlerts[0].pending || 0})`)

    const [auditLogs] = await sequelize.query(`SELECT COUNT(*) as count FROM admin_operation_logs`)
    console.log(`   审计日志: ${auditLogs[0].count}条`)

    const [merchantLogs] = await sequelize.query(`SELECT COUNT(*) as count FROM merchant_operation_logs`)
    console.log(`   商家操作日志: ${merchantLogs[0].count}条`)

    // 7. 核销和定价
    console.log('\n🎫 核销和定价:')
    const [redemptions] = await sequelize.query(`SELECT COUNT(*) as count FROM redemption_orders`)
    console.log(`   核销订单: ${redemptions[0].count}条`)

    const [pricing] = await sequelize.query(`SELECT COUNT(*) as count FROM lottery_campaign_pricing_config`)
    console.log(`   定价配置: ${pricing[0].count}条`)

    // 8. 角色和权限
    console.log('\n👥 角色权限:')
    const [roles] = await sequelize.query(`SELECT role_id, role_name, role_level FROM roles ORDER BY role_level DESC`)
    console.log(`   角色数: ${roles.length}`)
    roles.forEach(r => console.log(`     - ${r.role_name} (level: ${r.role_level})`))

    // 9. 物品模板
    console.log('\n📦 物品模板:')
    const [templates] = await sequelize.query(`
      SELECT template_id, name, category, rarity FROM item_templates LIMIT 10
    `)
    console.log(`   模板数: ${templates.length}`)

    // 10. 检查后端API路由文件是否存在
    console.log('\n🔌 后端API检查 (通过文件系统):')
    const fs = require('fs')
    const path = require('path')
    const consoleRoutes = path.join(__dirname, '../routes/v4/console')
    const files = fs.readdirSync(consoleRoutes)
    console.log(`   /routes/v4/console/ 下有 ${files.length} 个路由文件`)
    
    // 检查关键路由
    const keyRoutes = ['debt-management.js', 'stores.js', 'staff.js', 'risk-alerts.js', 'lottery-tier-rules.js']
    keyRoutes.forEach(route => {
      const exists = files.includes(route)
      console.log(`   ${exists ? '✅' : '❌'} ${route}`)
    })

    // 11. 小时监控数据
    console.log('\n📈 监控指标数据:')
    const [hourlyMetrics] = await sequelize.query(`SELECT COUNT(*) as count FROM lottery_hourly_metrics`)
    console.log(`   小时监控: ${hourlyMetrics[0].count}条`)

    const [dailyMetrics] = await sequelize.query(`SELECT COUNT(*) as count FROM lottery_daily_metrics`)
    console.log(`   日监控: ${dailyMetrics[0].count}条`)

    const [drawDecisions] = await sequelize.query(`SELECT COUNT(*) as count FROM lottery_draw_decisions`)
    console.log(`   决策快照: ${drawDecisions[0].count}条`)

    console.log('\n✅ 数据库检查完成')

  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message)
    if (error.sql) console.error('SQL:', error.sql)
  } finally {
    await sequelize.close()
    process.exit(0)
  }
}

checkDatabase()

