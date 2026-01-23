/**
 * 项目深度分析脚本 - 连接真实数据库
 * 分析表结构、数据量、代码双轨架构
 */

require('dotenv').config()

const { Sequelize, QueryTypes } = require('sequelize')

// 创建数据库连接
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    dialect: 'mysql',
    timezone: '+08:00',
    logging: false
  }
)

async function analyzeDatabase() {
  console.log('========================================')
  console.log('📊 项目数据库深度分析报告')
  console.log('========================================\n')

  try {
    // 测试连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 获取所有表信息
    console.log('📋 1. 数据库表清单和数据量统计')
    console.log('----------------------------------------')
    
    const tables = await sequelize.query(
      `SELECT 
        TABLE_NAME as table_name,
        TABLE_ROWS as row_count,
        ROUND(DATA_LENGTH / 1024 / 1024, 2) as data_size_mb,
        ROUND(INDEX_LENGTH / 1024 / 1024, 2) as index_size_mb,
        TABLE_COMMENT as comment
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_ROWS DESC`,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )

    let totalRows = 0
    let totalDataSize = 0
    
    console.log('\n| 表名 | 记录数 | 数据大小(MB) | 索引大小(MB) | 备注 |')
    console.log('|------|--------|--------------|--------------|------|')
    
    for (const table of tables) {
      totalRows += table.row_count || 0
      totalDataSize += parseFloat(table.data_size_mb || 0)
      console.log(`| ${table.table_name} | ${table.row_count || 0} | ${table.data_size_mb || 0} | ${table.index_size_mb || 0} | ${(table.comment || '').substring(0, 20)} |`)
    }
    
    console.log(`\n📊 统计: 共 ${tables.length} 张表, ${totalRows} 条记录, ${totalDataSize.toFixed(2)}MB 数据`)

    // 2. 分析核心业务表的实际数据
    console.log('\n\n📋 2. 核心业务表数据分析')
    console.log('----------------------------------------')

    // 用户数据
    const userStats = await sequelize.query(
      `SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
        COUNT(CASE WHEN available_points > 0 THEN 1 END) as users_with_points,
        SUM(available_points) as total_available_points,
        SUM(history_total_points) as total_history_points
      FROM users`,
      { type: QueryTypes.SELECT }
    )
    console.log('\n👤 用户表 (users):')
    console.log(JSON.stringify(userStats[0], null, 2))

    // 抽奖活动数据
    const campaignStats = await sequelize.query(
      `SELECT 
        COUNT(*) as total_campaigns,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_campaigns,
        COUNT(CASE WHEN budget_mode IS NOT NULL THEN 1 END) as with_budget_mode
      FROM lottery_campaigns`,
      { type: QueryTypes.SELECT }
    )
    console.log('\n🎰 抽奖活动表 (lottery_campaigns):')
    console.log(JSON.stringify(campaignStats[0], null, 2))

    // 抽奖记录
    const drawStats = await sequelize.query(
      `SELECT 
        COUNT(*) as total_draws,
        COUNT(CASE WHEN is_winner = 1 THEN 1 END) as winning_draws,
        COUNT(DISTINCT user_id) as unique_users
      FROM lottery_draws`,
      { type: QueryTypes.SELECT }
    )
    console.log('\n🎲 抽奖记录表 (lottery_draws):')
    console.log(JSON.stringify(drawStats[0], null, 2))

    // 物品实例（背包系统）
    const itemInstanceStats = await sequelize.query(
      `SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN status = 'available' THEN 1 END) as available_items,
        COUNT(CASE WHEN status = 'used' THEN 1 END) as used_items,
        COUNT(CASE WHEN status = 'locked' THEN 1 END) as locked_items,
        COUNT(DISTINCT owner_user_id) as unique_owners
      FROM item_instances`,
      { type: QueryTypes.SELECT }
    )
    console.log('\n📦 物品实例表 (item_instances):')
    console.log(JSON.stringify(itemInstanceStats[0], null, 2))

    // 账户资产余额
    const assetStats = await sequelize.query(
      `SELECT 
        asset_code,
        COUNT(*) as account_count,
        SUM(available_amount) as total_available,
        SUM(frozen_amount) as total_frozen
      FROM account_asset_balances
      GROUP BY asset_code`,
      { type: QueryTypes.SELECT }
    )
    console.log('\n💰 账户资产余额表 (account_asset_balances):')
    console.log(JSON.stringify(assetStats, null, 2))

    // 交易市场
    const marketStats = await sequelize.query(
      `SELECT 
        COUNT(*) as total_listings,
        COUNT(CASE WHEN status = 'on_sale' THEN 1 END) as on_sale,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold,
        COUNT(CASE WHEN status = 'withdrawn' THEN 1 END) as withdrawn
      FROM market_listings`,
      { type: QueryTypes.SELECT }
    )
    console.log('\n🛒 市场挂牌表 (market_listings):')
    console.log(JSON.stringify(marketStats[0], null, 2))

    // 3. 检查可能的废弃/空表
    console.log('\n\n📋 3. 空表或极少数据的表（可能是废弃或迁移残留）')
    console.log('----------------------------------------')
    
    const emptyTables = tables.filter(t => (t.row_count || 0) <= 5)
    for (const table of emptyTables) {
      console.log(`⚠️  ${table.table_name}: ${table.row_count || 0} 条记录`)
    }

    // 4. 检查外键关系
    console.log('\n\n📋 4. 外键约束分析')
    console.log('----------------------------------------')
    
    const foreignKeys = await sequelize.query(
      `SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME`,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )
    
    console.log(`\n共 ${foreignKeys.length} 个外键约束`)
    for (const fk of foreignKeys) {
      console.log(`  ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`)
    }

    // 5. 检查索引
    console.log('\n\n📋 5. 索引统计')
    console.log('----------------------------------------')
    
    const indexStats = await sequelize.query(
      `SELECT 
        TABLE_NAME,
        COUNT(*) as index_count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
      GROUP BY TABLE_NAME
      HAVING index_count > 5
      ORDER BY index_count DESC`,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )
    
    console.log('\n索引较多的表（>5个索引）:')
    for (const idx of indexStats) {
      console.log(`  ${idx.TABLE_NAME}: ${idx.index_count} 个索引`)
    }

    // 6. 检查可能的冗余字段（user表的旧积分字段等）
    console.log('\n\n📋 6. 可能需要清理的冗余字段')
    console.log('----------------------------------------')
    
    const userColumns = await sequelize.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
      ORDER BY ORDINAL_POSITION`,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )
    
    console.log('\nusers 表字段清单:')
    for (const col of userColumns) {
      console.log(`  ${col.COLUMN_NAME} (${col.DATA_TYPE}) - ${col.COLUMN_COMMENT || '无注释'}`)
    }

    // 7. 材料资产类型
    console.log('\n\n📋 7. 材料资产类型配置')
    console.log('----------------------------------------')
    
    const materialTypes = await sequelize.query(
      `SELECT asset_code, asset_name, status FROM material_asset_types`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(materialTypes, null, 2))

    // 8. 角色和权限
    console.log('\n\n📋 8. 角色系统')
    console.log('----------------------------------------')
    
    const roles = await sequelize.query(
      `SELECT role_id, role_name, role_level, status FROM roles ORDER BY role_level DESC`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(roles, null, 2))

    const userRoles = await sequelize.query(
      `SELECT 
        r.role_name, 
        COUNT(ur.user_id) as user_count
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.is_active = 1
      GROUP BY r.role_id, r.role_name`,
      { type: QueryTypes.SELECT }
    )
    console.log('\n用户角色分布:')
    console.log(JSON.stringify(userRoles, null, 2))

    // 9. 门店和商家数据
    console.log('\n\n📋 9. 门店和商家系统')
    console.log('----------------------------------------')
    
    const storeStats = await sequelize.query(
      `SELECT 
        COUNT(*) as total_stores,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_stores
      FROM stores`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(storeStats[0], null, 2))

    // 10. 审计日志
    console.log('\n\n📋 10. 审计日志统计')
    console.log('----------------------------------------')
    
    const auditStats = await sequelize.query(
      `SELECT 
        operation_type,
        COUNT(*) as count
      FROM admin_operation_logs
      GROUP BY operation_type
      ORDER BY count DESC
      LIMIT 20`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(auditStats, null, 2))

    console.log('\n========================================')
    console.log('✅ 数据库分析完成')
    console.log('========================================')

  } catch (error) {
    console.error('❌ 分析失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

analyzeDatabase()

