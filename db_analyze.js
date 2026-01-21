/**
 * 数据库探查脚本 - 用于分析项目实际数据状态
 */
require('dotenv').config()

const { sequelize } = require('./config/database')

async function analyzeDatabase() {
  try {
    console.log('🔗 连接数据库...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 查询所有表及其记录数
    console.log('📊 === 数据库表统计 ===\n')
    const [tables] = await sequelize.query(`
      SELECT 
        TABLE_NAME as table_name,
        TABLE_ROWS as table_rows,
        ROUND(DATA_LENGTH / 1024 / 1024, 2) as data_mb
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
      ORDER BY TABLE_ROWS DESC
    `)
    
    console.log('表名 | 行数 | 大小(MB)')
    console.log('-'.repeat(60))
    tables.slice(0, 30).forEach(t => {
      console.log(`${t.table_name} | ${t.table_rows || 0} | ${t.data_mb || 0}`)
    })

    // 2. 查询关键表的结构
    const keyTables = ['users', 'lottery_campaigns', 'lottery_prizes', 'item_instances', 'market_listings', 'trade_orders']
    
    for (const tableName of keyTables) {
      console.log(`\n📊 === ${tableName} 表结构 ===\n`)
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
        FROM information_schema.columns 
        WHERE table_schema = DATABASE() AND table_name = '${tableName}'
      `)
      console.log(`${tableName} 字段:`, columns.map(c => c.COLUMN_NAME))
    }

    // 3. 查询活动数据
    console.log('\n📊 === 抽奖活动分析 ===\n')
    const [campaigns] = await sequelize.query(`SELECT * FROM lottery_campaigns LIMIT 5`)
    console.log('活动列表:', JSON.stringify(campaigns, null, 2))

    // 4. 查询奖品数据
    console.log('\n📊 === 奖品数据分析 ===\n')
    const [prizes] = await sequelize.query(`SELECT * FROM lottery_prizes LIMIT 10`)
    console.log('奖品列表:', JSON.stringify(prizes, null, 2))

    // 5. 查询物品模板
    console.log('\n📊 === 物品模板分析 ===\n')
    const [templates] = await sequelize.query(`SELECT * FROM item_templates LIMIT 10`)
    console.log('物品模板:', JSON.stringify(templates, null, 2))

    // 6. 查询物品实例
    console.log('\n📊 === 物品实例分析 ===\n')
    const [instanceStats] = await sequelize.query(`
      SELECT status, COUNT(*) as count
      FROM item_instances
      GROUP BY status
    `)
    console.log('物品实例状态分布:', JSON.stringify(instanceStats, null, 2))

    // 7. 查询资产账户
    console.log('\n📊 === 资产系统分析 ===\n')
    const [accounts] = await sequelize.query(`
      SELECT account_type, COUNT(*) as count
      FROM accounts
      GROUP BY account_type
    `)
    console.log('账户类型分布:', JSON.stringify(accounts, null, 2))

    const [assetTypes] = await sequelize.query(`SELECT * FROM material_asset_types`)
    console.log('资产类型:', JSON.stringify(assetTypes, null, 2))

    // 8. 查询资产余额
    console.log('\n📊 === 资产余额分析 ===\n')
    const [balanceStats] = await sequelize.query(`
      SELECT asset_code, COUNT(*) as account_count, 
             SUM(available_amount) as total_available,
             SUM(frozen_amount) as total_frozen
      FROM account_asset_balances
      GROUP BY asset_code
    `)
    console.log('资产余额统计:', JSON.stringify(balanceStats, null, 2))

    // 9. 查询市场挂牌
    console.log('\n📊 === 交易市场分析 ===\n')
    const [marketStats] = await sequelize.query(`
      SELECT listing_type, status, COUNT(*) as count
      FROM market_listings
      GROUP BY listing_type, status
    `)
    console.log('市场挂牌统计:', JSON.stringify(marketStats, null, 2))

    // 10. 检查兑换商品
    console.log('\n📊 === 兑换商城分析 ===\n')
    const [exchangeItems] = await sequelize.query(`SELECT * FROM exchange_items LIMIT 5`)
    console.log('兑换商品:', JSON.stringify(exchangeItems, null, 2))

    // 11. 检查是否有旧表残留
    console.log('\n📊 === 所有表名 ===\n')
    const [allTableNames] = await sequelize.query(`
      SELECT TABLE_NAME FROM information_schema.tables 
      WHERE table_schema = DATABASE()
      ORDER BY TABLE_NAME
    `)
    const tableNames = allTableNames.map(t => t.TABLE_NAME)
    console.log('所有表名:', tableNames)

    // 12. 检查字典表数据
    console.log('\n📊 === 字典表数据 ===\n')
    const [categories] = await sequelize.query(`SELECT * FROM category_defs`)
    console.log('类目字典:', JSON.stringify(categories, null, 2))

    const [rarities] = await sequelize.query(`SELECT * FROM rarity_defs`)
    console.log('稀有度字典:', JSON.stringify(rarities, null, 2))

    const [assetGroups] = await sequelize.query(`SELECT * FROM asset_group_defs`)
    console.log('资产组字典:', JSON.stringify(assetGroups, null, 2))

    // 13. 检查功能开关
    console.log('\n📊 === 功能开关 ===\n')
    const [featureFlags] = await sequelize.query(`SELECT * FROM feature_flags`)
    console.log('功能开关:', JSON.stringify(featureFlags, null, 2))

    // 14. 检查系统设置
    console.log('\n📊 === 系统设置 ===\n')
    const [settings] = await sequelize.query(`
      SELECT setting_key, category
      FROM system_settings
      ORDER BY category
    `)
    console.log('系统设置:', settings.map(s => `${s.category}.${s.setting_key}`))

    // 15. 查看抽奖策略配置
    console.log('\n📊 === 抽奖策略配置 ===\n')
    const [strategyConfigs] = await sequelize.query(`SELECT * FROM lottery_strategy_config`)
    console.log('策略配置:', JSON.stringify(strategyConfigs, null, 2))

    // 16. 查看材料转换规则
    console.log('\n📊 === 材料转换规则 ===\n')
    const [convRules] = await sequelize.query(`SELECT * FROM material_conversion_rules`)
    console.log('转换规则:', JSON.stringify(convRules, null, 2))

    // 17. 查看门店和员工
    console.log('\n📊 === 门店和员工 ===\n')
    const [stores] = await sequelize.query(`SELECT * FROM stores`)
    console.log('门店:', JSON.stringify(stores, null, 2))
    
    const [staff] = await sequelize.query(`SELECT * FROM store_staff`)
    console.log('员工:', JSON.stringify(staff, null, 2))

    // 18. 查看用户层级
    console.log('\n📊 === 用户层级 ===\n')
    const [hierarchy] = await sequelize.query(`SELECT * FROM user_hierarchy`)
    console.log('用户层级:', JSON.stringify(hierarchy, null, 2))

    // 19. 查看抽奖档位规则
    console.log('\n📊 === 抽奖档位规则 ===\n')
    const [tierRules] = await sequelize.query(`SELECT * FROM lottery_tier_rules`)
    console.log('档位规则:', JSON.stringify(tierRules, null, 2))

    // 20. 查看抽奖次数配额规则
    console.log('\n📊 === 抽奖配额规则 ===\n')
    const [quotaRules] = await sequelize.query(`SELECT * FROM lottery_draw_quota_rules`)
    console.log('配额规则:', JSON.stringify(quotaRules, null, 2))

    console.log('\n✅ 数据库分析完成')

  } catch (error) {
    console.error('❌ 数据库分析失败:', error.message)
  } finally {
    await sequelize.close()
  }
}

analyzeDatabase()
