/**
 * 数据库表结构检查脚本
 * 检查当前数据库是否符合双账户模型要求
 */

const { Sequelize } = require('sequelize')
require('dotenv').config()

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

async function checkDatabaseSchema () {
  try {
    console.log('🔍 正在连接数据库...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 检查 user_points_accounts 表结构
    console.log('📋 检查 user_points_accounts 表结构:')
    const [accountFields] = await sequelize.query('DESCRIBE user_points_accounts')

    const accountRequiredFields = [
      'frozen_points',
      'budget_points',
      'remaining_budget_points',
      'used_budget_points',
      'total_draw_count',
      'total_redeem_count',
      'won_count',
      'last_draw_at',
      'last_redeem_at'
    ]

    const accountExistingFields = accountFields.map(f => f.Field)
    accountRequiredFields.forEach(field => {
      const exists = accountExistingFields.includes(field)
      console.log(`  ${exists ? '✅' : '❌'} ${field}`)
    })

    // 2. 检查 lottery_prizes 表结构
    console.log('\n📋 检查 lottery_prizes 表结构:')
    const [prizeFields] = await sequelize.query('DESCRIBE lottery_prizes')

    const prizeRequiredFields = [
      'prize_value_points',
      'virtual_amount',
      'category'
    ]

    const prizeExistingFields = prizeFields.map(f => f.Field)
    prizeRequiredFields.forEach(field => {
      const exists = prizeExistingFields.includes(field)
      console.log(`  ${exists ? '✅' : '❌'} ${field}`)
    })

    // 3. 检查 lottery_draws 表结构
    console.log('\n📋 检查 lottery_draws 表结构:')
    const [drawFields] = await sequelize.query('DESCRIBE lottery_draws')

    const drawRequiredFields = [
      'prize_value_points',
      'budget_points_before',
      'budget_points_after'
    ]

    const drawExistingFields = drawFields.map(f => f.Field)
    drawRequiredFields.forEach(field => {
      const exists = drawExistingFields.includes(field)
      console.log(`  ${exists ? '✅' : '❌'} ${field}`)
    })

    // 4. 检查 user_inventory 表结构
    console.log('\n📋 检查 user_inventory 表结构:')
    const [inventoryFields] = await sequelize.query('DESCRIBE user_inventory')

    const inventoryRequiredFields = [
      'item_type',
      'virtual_amount',
      'virtual_value_points'
    ]

    const inventoryExistingFields = inventoryFields.map(f => f.Field)
    inventoryRequiredFields.forEach(field => {
      const exists = inventoryExistingFields.includes(field)
      console.log(`  ${exists ? '✅' : '❌'} ${field}`)
    })

    // 5. 检查兑换市场表是否存在
    console.log('\n📋 检查兑换市场表:')
    const [tables] = await sequelize.query('SHOW TABLES')
    const tableNames = tables.map(t => Object.values(t)[0])

    const marketTables = ['exchange_items', 'exchange_records']
    marketTables.forEach(table => {
      const exists = tableNames.includes(table)
      console.log(`  ${exists ? '✅' : '❌'} ${table}`)
    })

    console.log('\n✅ 数据库表结构检查完成')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    process.exit(1)
  }
}

checkDatabaseSchema()
