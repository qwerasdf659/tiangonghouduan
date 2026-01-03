const { sequelize } = require('../models')

;(async () => {
  try {
    const [results] = await sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    console.log('\n📋 数据库中 operation_type 枚举值：')
    console.log(results[0].COLUMN_TYPE)

    // 检查是否包含 role_change
    const hasRoleChange = results[0].COLUMN_TYPE.includes('role_change')
    console.log(`\n✅ 是否包含 'role_change': ${hasRoleChange}`)

    // 检查是否包含 prize_stock_adjust
    const hasPrizeStockAdjust = results[0].COLUMN_TYPE.includes('prize_stock_adjust')
    console.log(`✅ 是否包含 'prize_stock_adjust': ${hasPrizeStockAdjust}`)

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    process.exit(1)
  }
})()
