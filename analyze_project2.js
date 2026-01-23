/**
 * 项目深度分析脚本 - 第2部分：核心业务数据分析
 */

require('dotenv').config()

const { Sequelize, QueryTypes } = require('sequelize')

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

async function analyze() {
  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 查看users表结构
    console.log('📋 1. users 表字段结构')
    console.log('----------------------------------------')
    const userColumns = await sequelize.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
      ORDER BY ORDINAL_POSITION`,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )
    for (const col of userColumns) {
      console.log(`  ${col.COLUMN_NAME} (${col.DATA_TYPE}) - ${col.COLUMN_COMMENT || ''}`)
    }

    // 2. 用户数据统计
    console.log('\n\n📋 2. 用户数据统计')
    console.log('----------------------------------------')
    const userStats = await sequelize.query(
      `SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users
      FROM users`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(userStats[0], null, 2))

    // 3. 账户资产余额详情
    console.log('\n\n📋 3. 账户资产余额详情')
    console.log('----------------------------------------')
    const assetBalances = await sequelize.query(
      `SELECT 
        aab.asset_code,
        mat.asset_name,
        COUNT(aab.balance_id) as account_count,
        SUM(aab.available_amount) as total_available,
        SUM(aab.frozen_amount) as total_frozen
      FROM account_asset_balances aab
      LEFT JOIN material_asset_types mat ON aab.asset_code = mat.asset_code
      GROUP BY aab.asset_code, mat.asset_name`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(assetBalances, null, 2))

    // 4. 物品模板和实例统计
    console.log('\n\n📋 4. 物品模板统计')
    console.log('----------------------------------------')
    const templates = await sequelize.query(
      `SELECT 
        it.template_code,
        it.item_name,
        it.category_code,
        it.rarity_code,
        COUNT(ii.item_instance_id) as instance_count
      FROM item_templates it
      LEFT JOIN item_instances ii ON it.item_template_id = ii.item_template_id
      GROUP BY it.item_template_id, it.template_code, it.item_name, it.category_code, it.rarity_code`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(templates, null, 2))

    // 5. 物品实例状态分布
    console.log('\n\n📋 5. 物品实例状态分布')
    console.log('----------------------------------------')
    const itemStatus = await sequelize.query(
      `SELECT 
        status,
        COUNT(*) as count
      FROM item_instances
      GROUP BY status`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(itemStatus, null, 2))

    // 6. 市场挂牌详情
    console.log('\n\n📋 6. 市场挂牌详情')
    console.log('----------------------------------------')
    const marketListings = await sequelize.query(
      `SELECT 
        listing_type,
        status,
        COUNT(*) as count,
        SUM(price) as total_price
      FROM market_listings
      GROUP BY listing_type, status`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(marketListings, null, 2))

    // 7. 角色和用户角色分布
    console.log('\n\n📋 7. 角色系统')
    console.log('----------------------------------------')
    const roles = await sequelize.query(
      `SELECT role_id, role_name, role_level, status, description FROM roles ORDER BY role_level DESC`,
      { type: QueryTypes.SELECT }
    )
    console.log('角色列表:')
    console.log(JSON.stringify(roles, null, 2))

    const userRoleStats = await sequelize.query(
      `SELECT 
        r.role_name,
        r.role_level,
        COUNT(ur.user_id) as user_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.role_id = ur.role_id AND ur.is_active = 1
      GROUP BY r.role_id, r.role_name, r.role_level
      ORDER BY r.role_level DESC`,
      { type: QueryTypes.SELECT }
    )
    console.log('\n用户角色分布:')
    console.log(JSON.stringify(userRoleStats, null, 2))

    // 8. 抽奖活动配置
    console.log('\n\n📋 8. 抽奖活动配置')
    console.log('----------------------------------------')
    const campaigns = await sequelize.query(
      `SELECT 
        campaign_id,
        campaign_code,
        campaign_name,
        budget_mode,
        status
      FROM lottery_campaigns`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(campaigns, null, 2))

    // 9. 抽奖奖品配置
    console.log('\n\n📋 9. 抽奖奖品配置')
    console.log('----------------------------------------')
    const prizes = await sequelize.query(
      `SELECT 
        prize_name,
        prize_type,
        tier_name,
        status,
        weight
      FROM lottery_prizes
      ORDER BY weight DESC`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(prizes, null, 2))

    // 10. 材料资产类型
    console.log('\n\n📋 10. 材料资产类型配置')
    console.log('----------------------------------------')
    const materialTypes = await sequelize.query(
      `SELECT * FROM material_asset_types`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(materialTypes, null, 2))

    // 11. 门店数据
    console.log('\n\n📋 11. 门店数据')
    console.log('----------------------------------------')
    const stores = await sequelize.query(
      `SELECT store_id, store_name, status FROM stores`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(stores, null, 2))

    // 12. 用户层级
    console.log('\n\n📋 12. 用户层级分布')
    console.log('----------------------------------------')
    const hierarchy = await sequelize.query(
      `SELECT 
        uh.hierarchy_id,
        u.mobile as user_mobile,
        p.mobile as parent_mobile,
        r.role_name
      FROM user_hierarchy uh
      LEFT JOIN users u ON uh.user_id = u.user_id
      LEFT JOIN users p ON uh.parent_user_id = p.user_id
      LEFT JOIN roles r ON uh.role_id = r.role_id`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(hierarchy, null, 2))

    // 13. 兑换商品配置
    console.log('\n\n📋 13. 兑换商品配置')
    console.log('----------------------------------------')
    const exchangeItems = await sequelize.query(
      `SELECT item_id, item_name, price, payment_method, status FROM exchange_items`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(exchangeItems, null, 2))

    // 14. 系统设置
    console.log('\n\n📋 14. 系统设置分类统计')
    console.log('----------------------------------------')
    const settings = await sequelize.query(
      `SELECT 
        category,
        COUNT(*) as count
      FROM system_settings
      GROUP BY category`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(settings, null, 2))

    // 15. 审计日志操作类型分布
    console.log('\n\n📋 15. 审计日志操作类型分布 (Top 20)')
    console.log('----------------------------------------')
    const auditTypes = await sequelize.query(
      `SELECT 
        operation_type,
        COUNT(*) as count
      FROM admin_operation_logs
      GROUP BY operation_type
      ORDER BY count DESC
      LIMIT 20`,
      { type: QueryTypes.SELECT }
    )
    console.log(JSON.stringify(auditTypes, null, 2))

    // 16. 检查是否存在旧表
    console.log('\n\n📋 16. 检查可能的旧/废弃表')
    console.log('----------------------------------------')
    const oldTables = await sequelize.query(
      `SELECT TABLE_NAME, TABLE_COMMENT
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      AND (
        TABLE_NAME LIKE '%_old' OR 
        TABLE_NAME LIKE '%_backup' OR 
        TABLE_NAME LIKE '%_bak' OR
        TABLE_NAME LIKE 'old_%' OR
        TABLE_NAME LIKE '%_v1' OR
        TABLE_NAME LIKE '%_v2' OR
        TABLE_NAME LIKE '%_v3'
      )`,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )
    if (oldTables.length > 0) {
      console.log('发现可能的旧表:')
      console.log(JSON.stringify(oldTables, null, 2))
    } else {
      console.log('未发现明显的旧表命名')
    }

    // 17. 检查空的配置表
    console.log('\n\n📋 17. 空表分析（0条数据）')
    console.log('----------------------------------------')
    const emptyTables = await sequelize.query(
      `SELECT TABLE_NAME, TABLE_COMMENT
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_ROWS = 0`,
      { replacements: [process.env.DB_NAME], type: QueryTypes.SELECT }
    )
    for (const t of emptyTables) {
      console.log(`  ${t.TABLE_NAME}: ${t.TABLE_COMMENT || '无注释'}`)
    }

    console.log('\n\n========================================')
    console.log('✅ 分析完成')
    console.log('========================================')

  } catch (error) {
    console.error('❌ 错误:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

analyze()

