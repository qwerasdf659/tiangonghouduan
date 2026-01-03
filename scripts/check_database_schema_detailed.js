/**
 * 数据库表结构详细检查脚本
 * 检查双账户模型相关表的字段是否完整
 */

const { sequelize } = require('../config/database')

async function checkDatabaseSchema() {
  try {
    console.log('===== 开始检查数据库表结构 =====\n')

    // 1. 检查 user_points_accounts 表
    console.log('1. 检查 user_points_accounts 表结构...')
    const [userPointsAccountsColumns] = await sequelize.query(`
      DESC user_points_accounts
    `)
    console.log('user_points_accounts 表字段：')
    console.table(userPointsAccountsColumns)

    // 检查必需的双账户字段
    const requiredFields = [
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
    const existingFields = userPointsAccountsColumns.map(col => col.Field)
    console.log('\n双账户模型必需字段检查：')
    requiredFields.forEach(field => {
      const exists = existingFields.includes(field)
      console.log(`  ${exists ? '✅' : '❌'} ${field}`)
    })

    // 2. 检查 lottery_prizes 表
    console.log('\n2. 检查 lottery_prizes 表结构...')
    const [lotteryPrizesColumns] = await sequelize.query(`
      DESC lottery_prizes
    `)
    console.log('lottery_prizes 表字段：')
    console.table(lotteryPrizesColumns)

    const prizesRequiredFields = ['prize_value_points', 'virtual_amount', 'category']
    const prizesExistingFields = lotteryPrizesColumns.map(col => col.Field)
    console.log('\n奖品表必需字段检查：')
    prizesRequiredFields.forEach(field => {
      const exists = prizesExistingFields.includes(field)
      console.log(`  ${exists ? '✅' : '❌'} ${field}`)
    })

    // 3. 检查 lottery_draws 表
    console.log('\n3. 检查 lottery_draws 表结构...')
    const [lotteryDrawsColumns] = await sequelize.query(`
      DESC lottery_draws
    `)
    console.log('lottery_draws 表字段：')
    console.table(lotteryDrawsColumns)

    const drawsRequiredFields = [
      'prize_value_points',
      'budget_points_before',
      'budget_points_after'
    ]
    const drawsExistingFields = lotteryDrawsColumns.map(col => col.Field)
    console.log('\n抽奖记录表必需字段检查：')
    drawsRequiredFields.forEach(field => {
      const exists = drawsExistingFields.includes(field)
      console.log(`  ${exists ? '✅' : '❌'} ${field}`)
    })

    // 4. 检查兑换市场表是否存在
    console.log('\n4. 检查兑换市场表...')
    const [tables] = await sequelize.query(`
      SHOW TABLES LIKE '%exchange%'
    `)
    console.log('包含exchange的表：')
    console.table(tables)

    // 检查 exchange_items 表
    try {
      const [exchangeItemsColumns] = await sequelize.query(`
        DESC exchange_items
      `)
      console.log('\nexchange_items 表字段：')
      console.table(exchangeItemsColumns)
    } catch (error) {
      console.log('\n❌ exchange_items 表不存在')
    }

    // 检查 exchange_market_records 表
    try {
      const [exchangeRecordsColumns] = await sequelize.query(`
        DESC exchange_market_records
      `)
      console.log('\nexchange_market_records 表字段：')
      console.table(exchangeRecordsColumns)
    } catch (error) {
      console.log('\n❌ exchange_market_records 表不存在')
    }

    // 5. 检查 user_inventory 表扩展字段
    console.log('\n5. 检查 user_inventory 表结构...')
    const [userInventoryColumns] = await sequelize.query(`
      DESC user_inventory
    `)
    console.log('user_inventory 表字段：')
    console.table(userInventoryColumns)

    const inventoryRequiredFields = [
      'item_type',
      'virtual_amount',
      'virtual_value_points',
      'lottery_record_id',
      'exchange_record_id'
    ]
    const inventoryExistingFields = userInventoryColumns.map(col => col.Field)
    console.log('\n用户背包表扩展字段检查：')
    inventoryRequiredFields.forEach(field => {
      const exists = inventoryExistingFields.includes(field)
      console.log(`  ${exists ? '✅' : '❌'} ${field}`)
    })

    console.log('\n===== 数据库表结构检查完成 =====')
    process.exit(0)
  } catch (error) {
    console.error('❌ 数据库检查失败：', error)
    process.exit(1)
  }
}

checkDatabaseSchema()
