/**
 * 数据库分析脚本 - 用于重构前的数据状态评估
 * 
 * 功能：
 * 1. 列出所有数据库表及数据量
 * 2. 检查表结构和关系
 * 3. 识别可能的废弃表/字段
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../../models')

async function analyzeDatabase() {
  console.log('🔍 开始数据库分析...\n')

  try {
    // 1. 测试连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 2. 获取所有表信息
    const [tables] = await sequelize.query(`
      SELECT 
        table_name,
        table_rows,
        ROUND(data_length / 1024 / 1024, 2) as data_mb,
        ROUND(index_length / 1024 / 1024, 2) as index_mb,
        create_time,
        update_time
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
      ORDER BY table_rows DESC
    `)

    console.log('📊 数据库表统计:\n')
    console.log('| 表名 | 行数 | 数据大小(MB) | 索引大小(MB) |')
    console.log('|------|------|-------------|-------------|')
    
    tables.forEach(t => {
      const tableName = t.table_name || t.TABLE_NAME || 'unknown'
      const tableRows = t.table_rows || t.TABLE_ROWS || 0
      const dataMb = t.data_mb || t.DATA_MB || 0
      const indexMb = t.index_mb || t.INDEX_MB || 0
      console.log(`| ${tableName.padEnd(40)} | ${String(tableRows).padStart(8)} | ${String(dataMb).padStart(11)} | ${String(indexMb).padStart(11)} |`)
    })

    // 3. 检查关键业务表的数据
    console.log('\n\n📈 关键业务表数据分析:\n')

    // 用户表
    const [userStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
      FROM users
    `)
    console.log('👤 用户表 (users):', userStats[0])

    // 抽奖活动
    const [campaignStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
      FROM lottery_campaigns
    `)
    console.log('🎰 抽奖活动 (lottery_campaigns):', campaignStats[0])

    // 抽奖记录
    const [drawStats] = await sequelize.query(`
      SELECT COUNT(*) as total FROM lottery_draws
    `)
    console.log('🎲 抽奖记录 (lottery_draws):', drawStats[0])

    // 资产账户
    const [accountStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN account_type = 'user' THEN 1 ELSE 0 END) as user_accounts,
        SUM(CASE WHEN account_type = 'system' THEN 1 ELSE 0 END) as system_accounts
      FROM accounts
    `)
    console.log('💰 账户表 (accounts):', accountStats[0])

    // 资产余额
    const [balanceStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT account_id) as unique_accounts,
        COUNT(DISTINCT asset_code) as unique_assets
      FROM account_asset_balances
    `)
    console.log('💎 资产余额 (account_asset_balances):', balanceStats[0])

    // 物品实例
    const [itemStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END) as locked,
        SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used
      FROM item_instances
    `)
    console.log('🎒 物品实例 (item_instances):', itemStats[0])

    // 市场挂牌
    const [listingStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'on_sale' THEN 1 ELSE 0 END) as on_sale,
        SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawn
      FROM market_listings
    `)
    console.log('🏪 市场挂牌 (market_listings):', listingStats[0])

    // 交易订单
    const [orderStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM trade_orders
    `)
    console.log('📝 交易订单 (trade_orders):', orderStats[0])

    // 4. 检查可能的废弃表（无数据或很少数据的表）
    console.log('\n\n⚠️ 可能需要评估的表（数据量 < 10）:\n')
    tables.filter(t => ((t.table_rows || t.TABLE_ROWS || 0)) < 10).forEach(t => {
      const tableName = t.table_name || t.TABLE_NAME || 'unknown'
      const tableRows = t.table_rows || t.TABLE_ROWS || 0
      console.log(`  - ${tableName}: ${tableRows} 行`)
    })

    // 5. 检查资产类型配置
    console.log('\n\n🎨 材料资产类型配置:\n')
    const [assetTypes] = await sequelize.query(`
      SELECT asset_code, display_name, category, rarity, is_tradeable, is_convertible
      FROM material_asset_types
      ORDER BY category, asset_code
    `)
    assetTypes.forEach(t => {
      console.log(`  - ${t.asset_code}: ${t.display_name} (${t.category}) [可交易:${t.is_tradeable ? '是' : '否'}, 可转换:${t.is_convertible ? '是' : '否'}]`)
    })

    // 6. 检查角色配置
    console.log('\n\n👥 角色配置:\n')
    const [roles] = await sequelize.query(`
      SELECT role_id, role_name, role_level, description, is_active
      FROM roles
      ORDER BY role_level DESC
    `)
    roles.forEach(r => {
      console.log(`  - ${r.role_name} (level: ${r.role_level}): ${r.description} [${r.is_active ? '激活' : '禁用'}]`)
    })

    // 7. 检查系统设置
    console.log('\n\n⚙️ 系统设置分类统计:\n')
    const [settingsStats] = await sequelize.query(`
      SELECT category, COUNT(*) as count
      FROM system_settings
      GROUP BY category
      ORDER BY count DESC
    `)
    settingsStats.forEach(s => {
      console.log(`  - ${s.category}: ${s.count} 项`)
    })

    console.log('\n✅ 数据库分析完成')

  } catch (error) {
    console.error('❌ 数据库分析失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

analyzeDatabase()

