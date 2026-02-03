/**
 * 临时数据库检查脚本 - 用于分析真实数据库结构和数据
 */
require('dotenv').config()
const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false
  }
)

async function inspectDatabase() {
  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 获取所有表
    const [tables] = await sequelize.query('SHOW TABLES')
    console.log('📊 数据库表列表 (共', tables.length, '个表):')
    console.log('=' .repeat(60))
    
    const tableInfo = []
    for (const row of tables) {
      const tableName = Object.values(row)[0]
      // 获取表行数
      const [[countResult]] = await sequelize.query(`SELECT COUNT(*) as count FROM \`${tableName}\``)
      tableInfo.push({ name: tableName, count: countResult.count })
    }
    
    // 按数据量排序
    tableInfo.sort((a, b) => b.count - a.count)
    tableInfo.forEach(t => {
      console.log(`  ${t.name}: ${t.count} 行`)
    })

    // 2. 检查关键业务表结构
    console.log('\n' + '=' .repeat(60))
    console.log('🔍 关键业务表结构检查:')
    console.log('=' .repeat(60))

    // 检查用户表
    const [[userSample]] = await sequelize.query('SELECT * FROM users LIMIT 1')
    if (userSample) {
      console.log('\n📋 users 表字段:', Object.keys(userSample).join(', '))
    }

    // 检查账户表
    const [[accountSample]] = await sequelize.query('SELECT * FROM accounts LIMIT 1')
    if (accountSample) {
      console.log('\n📋 accounts 表字段:', Object.keys(accountSample).join(', '))
    }

    // 检查资产余额表
    const [[balanceSample]] = await sequelize.query('SELECT * FROM account_asset_balances LIMIT 1')
    if (balanceSample) {
      console.log('\n📋 account_asset_balances 表字段:', Object.keys(balanceSample).join(', '))
    }

    // 检查物品实例表
    const [[itemSample]] = await sequelize.query('SELECT * FROM item_instances LIMIT 1')
    if (itemSample) {
      console.log('\n📋 item_instances 表字段:', Object.keys(itemSample).join(', '))
    }

    // 3. 检查可能存在双轨的表
    console.log('\n' + '=' .repeat(60))
    console.log('🔄 双轨架构检查:')
    console.log('=' .repeat(60))

    // 检查是否有旧表残留
    const potentialOldTables = [
      'inventory', 'user_inventory', 'old_inventory',
      'user_points', 'points', 'old_points',
      'user_assets', 'assets', 'old_assets',
      'orders', 'old_orders',
      'prize_items', 'user_prizes'
    ]
    
    for (const tableName of potentialOldTables) {
      try {
        const [[result]] = await sequelize.query(`SELECT COUNT(*) as count FROM \`${tableName}\``)
        console.log(`  ⚠️ 发现可能的旧表: ${tableName} (${result.count} 行)`)
      } catch (e) {
        // 表不存在，正常
      }
    }

    // 4. 检查users表中的积分相关字段
    console.log('\n' + '=' .repeat(60))
    console.log('📊 users表积分字段检查:')
    console.log('=' .repeat(60))
    
    const [userColumns] = await sequelize.query(`SHOW COLUMNS FROM users`)
    const pointsFields = userColumns.filter(col => 
      col.Field.includes('point') || col.Field.includes('balance') || col.Field.includes('credit')
    )
    console.log('积分相关字段:', pointsFields.map(f => f.Field).join(', ') || '无')

    // 5. 检查资产类型
    console.log('\n' + '=' .repeat(60))
    console.log('💎 资产类型检查:')
    console.log('=' .repeat(60))
    
    try {
      const [assetTypes] = await sequelize.query('SELECT * FROM material_asset_types')
      console.log('material_asset_types 资产类型:')
      assetTypes.forEach(t => console.log(`  - ${t.asset_code}: ${t.asset_name}`))
    } catch (e) {
      console.log('  material_asset_types 表不存在或为空')
    }

    // 6. 检查市场挂牌表
    console.log('\n' + '=' .repeat(60))
    console.log('🏪 市场相关表检查:')
    console.log('=' .repeat(60))
    
    try {
      const [[marketCount]] = await sequelize.query('SELECT COUNT(*) as count FROM market_listings')
      console.log(`market_listings: ${marketCount.count} 条挂牌`)
    } catch (e) {
      console.log('  market_listings 表不存在')
    }

    try {
      const [[tradeCount]] = await sequelize.query('SELECT COUNT(*) as count FROM trade_orders')
      console.log(`trade_orders: ${tradeCount.count} 条订单`)
    } catch (e) {
      console.log('  trade_orders 表不存在')
    }

    // 7. 检查兑换相关表
    console.log('\n' + '=' .repeat(60))
    console.log('🎁 兑换相关表检查:')
    console.log('=' .repeat(60))
    
    try {
      const [[exchangeItemCount]] = await sequelize.query('SELECT COUNT(*) as count FROM exchange_items')
      console.log(`exchange_items: ${exchangeItemCount.count} 个商品`)
    } catch (e) {
      console.log('  exchange_items 表不存在')
    }

    try {
      const [[exchangeRecordCount]] = await sequelize.query('SELECT COUNT(*) as count FROM exchange_records')
      console.log(`exchange_records: ${exchangeRecordCount.count} 条记录`)
    } catch (e) {
      console.log('  exchange_records 表不存在')
    }

    try {
      const [[redemptionCount]] = await sequelize.query('SELECT COUNT(*) as count FROM redemption_orders')
      console.log(`redemption_orders: ${redemptionCount.count} 条核销单`)
    } catch (e) {
      console.log('  redemption_orders 表不存在')
    }

    // 8. 检查抽奖系统表
    console.log('\n' + '=' .repeat(60))
    console.log('🎰 抽奖系统表检查:')
    console.log('=' .repeat(60))
    
    const lotteryTables = [
      'lottery_campaigns', 'lottery_prizes', 'lottery_draws',
      'lottery_tier_rules', 'lottery_draw_decisions',
      'lottery_presets', 'lottery_management_settings'
    ]
    
    for (const tableName of lotteryTables) {
      try {
        const [[result]] = await sequelize.query(`SELECT COUNT(*) as count FROM \`${tableName}\``)
        console.log(`  ${tableName}: ${result.count} 条`)
      } catch (e) {
        console.log(`  ${tableName}: 不存在`)
      }
    }

    // 9. 检查角色权限系统
    console.log('\n' + '=' .repeat(60))
    console.log('👥 角色权限系统检查:')
    console.log('=' .repeat(60))
    
    try {
      const [roles] = await sequelize.query('SELECT * FROM roles')
      console.log('roles 角色定义:')
      roles.forEach(r => console.log(`  - ${r.role_name} (level: ${r.role_level})`))
    } catch (e) {
      console.log('  roles 表不存在')
    }

    try {
      const [[userRoleCount]] = await sequelize.query('SELECT COUNT(*) as count FROM user_roles')
      console.log(`user_roles: ${userRoleCount.count} 条关联`)
    } catch (e) {
      console.log('  user_roles 表不存在')
    }

    // 10. 检查系统配置表
    console.log('\n' + '=' .repeat(60))
    console.log('⚙️ 系统配置表检查:')
    console.log('=' .repeat(60))
    
    const configTables = ['system_settings', 'system_configs', 'system_dictionaries', 'feature_flags']
    for (const tableName of configTables) {
      try {
        const [[result]] = await sequelize.query(`SELECT COUNT(*) as count FROM \`${tableName}\``)
        console.log(`  ${tableName}: ${result.count} 条`)
      } catch (e) {
        console.log(`  ${tableName}: 不存在`)
      }
    }

    console.log('\n✅ 数据库检查完成')
    
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message)
  } finally {
    await sequelize.close()
  }
}

inspectDatabase()

