/**
 * 检查数据库表状态
 *
 * 用途：检查 exchange_records 表和 exchange_market_records 表的状态
 */

const { Sequelize } = require('sequelize')
require('dotenv').config()
// 🔴 复用主 sequelize 实例（单一配置源）
const { sequelize } = require('../config/database')

async function checkDatabaseTables() {
  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 检查所有包含 exchange 的表
    console.log('📊 检查包含 "exchange" 的表...')
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME, UPDATE_TIME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME || 'restaurant_points_dev'}'
      AND TABLE_NAME LIKE '%exchange%'
      ORDER BY TABLE_NAME
    `)

    if (tables.length === 0) {
      console.log('   未找到相关表')
    } else {
      console.log(`   找到 ${tables.length} 个相关表：\n`)
      tables.forEach((table, index) => {
        console.log(`   ${index + 1}. ${table.TABLE_NAME}`)
        console.log(`      - 记录数: ${table.TABLE_ROWS}`)
        console.log(`      - 创建时间: ${table.CREATE_TIME}`)
        console.log(`      - 更新时间: ${table.UPDATE_TIME}`)
        console.log('')
      })
    }

    // 检查 exchange_records 表的详细信息
    console.log('\n📋 检查 exchange_records 表详细信息...')
    try {
      const [recordCount] = await sequelize.query(`
        SELECT COUNT(*) as count FROM exchange_records
      `)
      console.log(`   ✅ 表存在，记录数: ${recordCount[0].count}`)

      // 检查表结构
      const [columns] = await sequelize.query(`
        SHOW COLUMNS FROM exchange_records
      `)
      console.log(`   ✅ 字段数: ${columns.length}`)

      // 检查索引
      const [indexes] = await sequelize.query(`
        SHOW INDEX FROM exchange_records
      `)
      const uniqueIndexes = [...new Set(indexes.map(idx => idx.Key_name))]
      console.log(`   ✅ 索引数: ${uniqueIndexes.length}`)
      uniqueIndexes.forEach((indexName, i) => {
        console.log(`      ${i + 1}. ${indexName}`)
      })
    } catch (error) {
      console.log(`   ❌ 表不存在或无法访问: ${error.message}`)
    }

    // 检查 exchange_market_records 表的详细信息
    console.log('\n📋 检查 exchange_market_records 表详细信息...')
    try {
      const [recordCount] = await sequelize.query(`
        SELECT COUNT(*) as count FROM exchange_market_records
      `)
      console.log(`   ✅ 表存在，记录数: ${recordCount[0].count}`)

      // 检查表结构
      const [columns] = await sequelize.query(`
        SHOW COLUMNS FROM exchange_market_records
      `)
      console.log(`   ✅ 字段数: ${columns.length}`)

      // 检查索引
      const [indexes] = await sequelize.query(`
        SHOW INDEX FROM exchange_market_records
      `)
      const uniqueIndexes = [...new Set(indexes.map(idx => idx.Key_name))]
      console.log(`   ✅ 索引数: ${uniqueIndexes.length}`)
      uniqueIndexes.forEach((indexName, i) => {
        console.log(`      ${i + 1}. ${indexName}`)
      })

      // 检查是否有 business_id 字段（P1-1 幂等性相关）
      const businessIdColumn = columns.find(col => col.Field === 'business_id')
      if (businessIdColumn) {
        console.log('\n   ✅ business_id 字段存在（支持幂等性）')
        console.log(`      - 类型: ${businessIdColumn.Type}`)
        console.log(`      - 允许NULL: ${businessIdColumn.Null}`)
        console.log(`      - 默认值: ${businessIdColumn.Default}`)
      } else {
        console.log('\n   ⚠️  business_id 字段不存在（可能需要运行迁移）')
      }
    } catch (error) {
      console.log(`   ❌ 表不存在或无法访问: ${error.message}`)
    }

    // 检查是否有已删除的迁移记录残留
    console.log('\n📋 检查已删除迁移的遗留数据...')
    try {
      const [hasDeliveryMethod] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = '${process.env.DB_NAME || 'restaurant_points_dev'}'
        AND TABLE_NAME = 'exchange_records'
        AND COLUMN_NAME = 'delivery_method'
      `)

      if (hasDeliveryMethod[0].count > 0) {
        console.log('   ⚠️  delivery_method 字段仍存在于 exchange_records 表')
        console.log('   提示：已删除的迁移可能已在之前执行，字段仍保留在数据库中')
      } else {
        console.log('   ✅ delivery_method 字段不存在（正常）')
      }
    } catch (error) {
      console.log(`   ⚠️  检查失败: ${error.message}`)
    }
  } catch (error) {
    console.error('❌ 操作失败:', error.message)
    throw error
  } finally {
    await sequelize.close()
    console.log('\n✅ 数据库连接已关闭')
  }
}

checkDatabaseTables().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
