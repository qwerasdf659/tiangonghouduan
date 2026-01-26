/**
 * 数据库能力分析脚本 - 用于Web管理平台前端功能对齐
 * 连接真实数据库，获取所有表结构和数据统计
 */
require('dotenv').config()
const { sequelize } = require('../config/database')

async function analyzeDatabase() {
  try {
    console.log('🔍 连接数据库...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 获取所有表及其记录数
    console.log('📊 === 数据库表统计 ===\n')
    const [tables] = await sequelize.query(`
      SELECT 
        TABLE_NAME as table_name,
        TABLE_ROWS as row_count,
        DATA_LENGTH as data_length,
        TABLE_COMMENT as comment
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_ROWS DESC
    `)

    console.log('| 表名 | 记录数 | 大小(KB) | 说明 |')
    console.log('|------|--------|----------|------|')
    for (const table of tables) {
      const sizeKB = Math.round((table.data_length || 0) / 1024)
      console.log(`| ${table.table_name} | ${table.row_count || 0} | ${sizeKB} | ${table.comment || '-'} |`)
    }

    // 2. 获取每个核心表的字段详情
    console.log('\n📋 === 核心业务表字段详情 ===\n')
    
    const coreTables = [
      'users', 'roles', 'user_roles',
      'lottery_campaigns', 'lottery_prizes', 'lottery_draws',
      'item_templates', 'item_instances',
      'accounts', 'account_asset_balances', 'asset_transactions',
      'market_listings', 'trade_orders',
      'stores', 'store_staff', 'user_hierarchy',
      'consumption_records', 'exchange_records',
      'admin_operation_logs', 'system_settings',
      'customer_service_sessions', 'chat_messages',
      'popup_banners', 'system_announcements',
      'feature_flags', 'system_dictionaries',
      'risk_alerts', 'user_risk_profiles'
    ]

    for (const tableName of coreTables) {
      try {
        const [columns] = await sequelize.query(`
          SELECT 
            COLUMN_NAME as name,
            COLUMN_TYPE as type,
            IS_NULLABLE as nullable,
            COLUMN_KEY as key_type,
            COLUMN_COMMENT as comment
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, { replacements: [tableName] })
        
        if (columns.length > 0) {
          console.log(`\n### ${tableName}`)
          console.log('| 字段 | 类型 | 说明 |')
          console.log('|------|------|------|')
          for (const col of columns.slice(0, 10)) { // 只显示前10个字段
            console.log(`| ${col.name} | ${col.type} | ${col.comment || '-'} |`)
          }
          if (columns.length > 10) {
            console.log(`| ... | 共${columns.length}个字段 | ... |`)
          }
        }
      } catch (e) {
        // 表不存在则跳过
      }
    }

    // 3. 获取关键业务数据统计
    console.log('\n📈 === 关键业务数据统计 ===\n')
    
    const stats = {}
    
    // 用户统计
    const [userStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
      FROM users
    `)
    stats.users = userStats[0]
    
    // 角色统计
    const [roleStats] = await sequelize.query(`
      SELECT role_name, role_level, 
        (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.role_id AND ur.is_active = 1) as user_count
      FROM roles r
      ORDER BY role_level DESC
    `)
    stats.roles = roleStats
    
    // 活动统计
    const [campaignStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
      FROM lottery_campaigns
    `)
    stats.campaigns = campaignStats[0]
    
    // 奖品统计
    const [prizeStats] = await sequelize.query(`
      SELECT COUNT(*) as total FROM lottery_prizes
    `)
    stats.prizes = prizeStats[0]
    
    // 抽奖记录
    const [drawStats] = await sequelize.query(`
      SELECT COUNT(*) as total FROM lottery_draws
    `)
    stats.draws = drawStats[0]
    
    // 物品模板
    const [templateStats] = await sequelize.query(`
      SELECT COUNT(*) as total FROM item_templates
    `)
    stats.itemTemplates = templateStats[0]
    
    // 物品实例
    const [instanceStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_count
      FROM item_instances
    `)
    stats.itemInstances = instanceStats[0]
    
    // 门店统计
    const [storeStats] = await sequelize.query(`
      SELECT COUNT(*) as total FROM stores
    `)
    stats.stores = storeStats[0]
    
    // 市场挂牌
    const [listingStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'on_sale' THEN 1 ELSE 0 END) as on_sale_count
      FROM market_listings
    `)
    stats.listings = listingStats[0]
    
    // 订单统计
    const [orderStats] = await sequelize.query(`
      SELECT COUNT(*) as total FROM trade_orders
    `)
    stats.orders = orderStats[0]
    
    // 消费记录
    const [consumptionStats] = await sequelize.query(`
      SELECT COUNT(*) as total FROM consumption_records
    `)
    stats.consumptions = consumptionStats[0]
    
    // 客服会话
    const [sessionStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
      FROM customer_service_sessions
    `)
    stats.customerSessions = sessionStats[0]
    
    console.log('| 业务域 | 统计项 | 数值 |')
    console.log('|--------|--------|------|')
    console.log(`| 用户 | 总用户数 | ${stats.users.total} |`)
    console.log(`| 用户 | 活跃用户 | ${stats.users.active_count} |`)
    console.log(`| 角色 | 角色数量 | ${stats.roles.length} |`)
    console.log(`| 抽奖 | 活动数量 | ${stats.campaigns.total} |`)
    console.log(`| 抽奖 | 进行中活动 | ${stats.campaigns.active_count} |`)
    console.log(`| 抽奖 | 奖品配置 | ${stats.prizes.total} |`)
    console.log(`| 抽奖 | 抽奖记录 | ${stats.draws.total} |`)
    console.log(`| 物品 | 物品模板 | ${stats.itemTemplates.total} |`)
    console.log(`| 物品 | 物品实例 | ${stats.itemInstances.total} |`)
    console.log(`| 物品 | 可用物品 | ${stats.itemInstances.available_count} |`)
    console.log(`| 门店 | 门店数量 | ${stats.stores.total} |`)
    console.log(`| 交易 | 市场挂牌 | ${stats.listings.total} |`)
    console.log(`| 交易 | 在售挂牌 | ${stats.listings.on_sale_count} |`)
    console.log(`| 交易 | 交易订单 | ${stats.orders.total} |`)
    console.log(`| 消费 | 消费记录 | ${stats.consumptions.total} |`)
    console.log(`| 客服 | 会话总数 | ${stats.customerSessions.total} |`)
    console.log(`| 客服 | 活跃会话 | ${stats.customerSessions.active_count} |`)
    
    // 4. 角色权限详情
    console.log('\n🔐 === 角色权限详情 ===\n')
    console.log('| 角色 | 等级 | 用户数 | 权限资源数 |')
    console.log('|------|------|--------|------------|')
    for (const role of stats.roles) {
      let permCount = 0
      try {
        const [permData] = await sequelize.query(`
          SELECT permissions FROM roles WHERE role_name = ?
        `, { replacements: [role.role_name] })
        if (permData[0]?.permissions) {
          const perms = typeof permData[0].permissions === 'string' 
            ? JSON.parse(permData[0].permissions) 
            : permData[0].permissions
          permCount = Object.keys(perms).length
        }
      } catch (e) {}
      console.log(`| ${role.role_name} | ${role.role_level} | ${role.user_count} | ${permCount} |`)
    }

    console.log('\n✅ 数据库分析完成')
    
  } catch (error) {
    console.error('❌ 分析失败:', error.message)
  } finally {
    await sequelize.close()
  }
}

analyzeDatabase()

