#!/usr/bin/env node
/**
 * 执行SQL修复脚本
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  timezone: process.env.DB_TIMEZONE || '+08:00',
  logging: false
})

// 需要执行的SQL语句（按顺序）
const SQL_STATEMENTS = [
  // 1. exchange_records
  'ALTER TABLE exchange_records DROP PRIMARY KEY',
  'ALTER TABLE exchange_records CHANGE COLUMN id exchange_id INT AUTO_INCREMENT',
  'ALTER TABLE exchange_records ADD PRIMARY KEY (exchange_id)',

  // 2. trade_records
  'ALTER TABLE trade_records DROP PRIMARY KEY',
  'ALTER TABLE trade_records CHANGE COLUMN id trade_id INT AUTO_INCREMENT',
  'ALTER TABLE trade_records ADD PRIMARY KEY (trade_id)',

  // 3. customer_sessions
  'ALTER TABLE customer_sessions DROP PRIMARY KEY',
  'ALTER TABLE customer_sessions CHANGE COLUMN id session_id BIGINT AUTO_INCREMENT',
  'ALTER TABLE customer_sessions ADD PRIMARY KEY (session_id)',

  // 4. chat_messages
  'ALTER TABLE chat_messages DROP PRIMARY KEY',
  'ALTER TABLE chat_messages CHANGE COLUMN id message_id BIGINT AUTO_INCREMENT',
  'ALTER TABLE chat_messages ADD PRIMARY KEY (message_id)',

  // 5. user_sessions
  'ALTER TABLE user_sessions DROP PRIMARY KEY',
  'ALTER TABLE user_sessions CHANGE COLUMN id user_session_id BIGINT AUTO_INCREMENT',
  'ALTER TABLE user_sessions ADD PRIMARY KEY (user_session_id)',

  // 6. roles
  'ALTER TABLE roles DROP PRIMARY KEY',
  'ALTER TABLE roles CHANGE COLUMN id role_id INT AUTO_INCREMENT',
  'ALTER TABLE roles ADD PRIMARY KEY (role_id)',

  // 7. user_roles
  'ALTER TABLE user_roles DROP PRIMARY KEY',
  'ALTER TABLE user_roles CHANGE COLUMN id user_role_id INT AUTO_INCREMENT',
  'ALTER TABLE user_roles ADD PRIMARY KEY (user_role_id)',

  // 8. system_announcements
  'ALTER TABLE system_announcements DROP PRIMARY KEY',
  'ALTER TABLE system_announcements CHANGE COLUMN id announcement_id INT AUTO_INCREMENT',
  'ALTER TABLE system_announcements ADD PRIMARY KEY (announcement_id)'
]

async function main () {
  console.log('🔧 执行SQL修复脚本\n')

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 禁用外键检查
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')

    let successCount = 0
    let skipCount = 0
    let errorCount = 0

    for (let i = 0; i < SQL_STATEMENTS.length; i++) {
      const sql = SQL_STATEMENTS[i]
      const tableName = sql.match(/TABLE\s+(\w+)/)[1]
      const operation = sql.match(/^ALTER TABLE \w+ (\w+)/)[1]

      try {
        console.log(`[${i + 1}/${SQL_STATEMENTS.length}] ${tableName}.${operation}...`)
        await sequelize.query(sql)
        successCount++
        console.log('   ✅ 成功')
      } catch (error) {
        if (error.message.includes('Duplicate') || error.message.includes('already')) {
          console.log('   ⏭️  跳过（已存在）')
          skipCount++
        } else {
          console.error(`   ❌ 失败: ${error.message}`)
          errorCount++
        }
      }
    }

    // 启用外键检查
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')

    console.log(`\n${'='.repeat(60)}`)
    console.log('📊 执行结果统计')
    console.log('='.repeat(60))
    console.log(`成功: ${successCount}`)
    console.log(`跳过: ${skipCount}`)
    console.log(`失败: ${errorCount}`)
    console.log(`总计: ${SQL_STATEMENTS.length}`)

    if (errorCount === 0) {
      console.log('\n✅ 所有SQL语句执行完成')
    } else {
      console.warn('\n⚠️  部分SQL语句执行失败')
    }

    // 验证结果
    console.log('\n🔍 验证迁移结果...\n')
    await verifyResults()
  } catch (error) {
    console.error('\n❌ 执行失败:', error.message)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

async function verifyResults () {
  const tables = [
    'exchange_records',
    'trade_records',
    'user_inventory',
    'customer_sessions',
    'chat_messages',
    'user_sessions',
    'roles',
    'user_roles',
    'system_announcements',
    'feedbacks',
    'image_resources'
  ]

  for (const table of tables) {
    const [columns] = await sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        AND TABLE_NAME = '${table}'
        AND COLUMN_KEY = 'PRI'
    `)

    if (columns.length > 0) {
      console.log(
        `   ✅ ${table.padEnd(25)} 主键 = ${columns[0].COLUMN_NAME.padEnd(20)} (${columns[0].COLUMN_TYPE})`
      )
    } else {
      console.error(`   ❌ ${table.padEnd(25)} 无主键！`)
    }
  }
}

main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
