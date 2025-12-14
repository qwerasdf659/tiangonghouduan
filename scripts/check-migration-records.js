/**
 * 检查和清理 sequelizemeta 表中的迁移记录
 *
 * 用途：检查并删除已废弃的 exchange_records 相关迁移记录
 *
 * P0-2任务：删除旧表 exchange_records 相关的迁移记录
 */

const { Sequelize } = require('sequelize')
require('dotenv').config()

async function checkMigrationRecords () {
  // 创建数据库连接
  const sequelize = new Sequelize(
    process.env.DB_NAME || 'restaurant_points_dev',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: false
    }
  )

  try {
    // 测试连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 查询所有迁移记录
    console.log('\n📊 检查 sequelizemeta 表中的迁移记录...')
    const [allMigrations] = await sequelize.query(
      'SELECT name FROM sequelizemeta ORDER BY name'
    )

    console.log(`\n📝 当前迁移记录总数: ${allMigrations.length}`)

    // 查找需要删除的迁移记录
    const targetMigrations = [
      '20251109235500-add-delivery-method-to-exchange-records.js',
      '20251109235900-add-user-exchange-time-index-to-exchange-records.js'
    ]

    const foundMigrations = allMigrations.filter(m =>
      targetMigrations.includes(m.name)
    )

    if (foundMigrations.length === 0) {
      console.log('\n✅ 未找到需要删除的迁移记录')
      console.log('   数据库中没有 exchange_records 相关的迁移记录')
    } else {
      console.log(`\n⚠️  找到 ${foundMigrations.length} 条需要删除的迁移记录：`)
      foundMigrations.forEach((m, index) => {
        console.log(`   ${index + 1}. ${m.name}`)
      })

      // 删除这些迁移记录
      console.log('\n🗑️  开始删除迁移记录...')
      for (const migration of targetMigrations) {
        const [result] = await sequelize.query(
          'DELETE FROM sequelizemeta WHERE name = ?',
          { replacements: [migration] }
        )

        if (result.affectedRows > 0) {
          console.log(`   ✅ 已删除: ${migration}`)
        }
      }

      console.log('\n✅ 迁移记录清理完成')
    }

    // 显示当前所有与 exchange 相关的迁移记录
    console.log('\n📋 当前所有与 exchange 相关的迁移记录：')
    const [exchangeMigrations] = await sequelize.query(
      'SELECT name FROM sequelizemeta WHERE name LIKE "%exchange%" ORDER BY name'
    )

    if (exchangeMigrations.length === 0) {
      console.log('   无相关记录')
    } else {
      exchangeMigrations.forEach((m, index) => {
        console.log(`   ${index + 1}. ${m.name}`)
      })
    }
  } catch (error) {
    console.error('❌ 操作失败:', error.message)
    throw error
  } finally {
    await sequelize.close()
    console.log('\n✅ 数据库连接已关闭')
  }
}

// 执行检查
checkMigrationRecords().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
