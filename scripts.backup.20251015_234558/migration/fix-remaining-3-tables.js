#!/usr/bin/env node
require('dotenv').config()
const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  timezone: process.env.DB_TIMEZONE || '+08:00',
  logging: false
})

async function main () {
  console.log('🔧 修复剩余3个表\n')

  try {
    await sequelize.authenticate()

    // 1. exchange_records
    console.log('1. exchange_records...')
    try {
      await sequelize.query('ALTER TABLE exchange_records MODIFY COLUMN id INT NOT NULL')
      await sequelize.query('ALTER TABLE exchange_records DROP PRIMARY KEY')
      await sequelize.query(
        'ALTER TABLE exchange_records CHANGE COLUMN id exchange_id INT AUTO_INCREMENT'
      )
      await sequelize.query('ALTER TABLE exchange_records ADD PRIMARY KEY (exchange_id)')
      console.log('   ✅ 成功')
    } catch (e) {
      console.log('   ⚠️ ', e.message)
    }

    // 2. customer_sessions
    console.log('2. customer_sessions...')
    try {
      await sequelize.query('ALTER TABLE customer_sessions MODIFY COLUMN id BIGINT NOT NULL')
      await sequelize.query('ALTER TABLE customer_sessions DROP PRIMARY KEY')
      await sequelize.query(
        'ALTER TABLE customer_sessions CHANGE COLUMN id session_id BIGINT AUTO_INCREMENT'
      )
      await sequelize.query('ALTER TABLE customer_sessions ADD PRIMARY KEY (session_id)')
      console.log('   ✅ 成功')
    } catch (e) {
      console.log('   ⚠️ ', e.message)
    }

    // 3. chat_messages
    console.log('3. chat_messages...')
    try {
      await sequelize.query('ALTER TABLE chat_messages MODIFY COLUMN id BIGINT NOT NULL')
      await sequelize.query('ALTER TABLE chat_messages DROP PRIMARY KEY')
      await sequelize.query(
        'ALTER TABLE chat_messages CHANGE COLUMN id message_id BIGINT AUTO_INCREMENT'
      )
      await sequelize.query('ALTER TABLE chat_messages ADD PRIMARY KEY (message_id)')
      console.log('   ✅ 成功')
    } catch (e) {
      console.log('   ⚠️ ', e.message)
    }

    // 验证
    console.log('\n🔍 验证结果...\n')
    const tables = ['exchange_records', 'customer_sessions', 'chat_messages']
    for (const table of tables) {
      const [cols] = await sequelize.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
          AND TABLE_NAME = '${table}'
          AND COLUMN_KEY = 'PRI'
      `)
      console.log(`   ${table}: ${cols[0].COLUMN_NAME}`)
    }

    console.log('\n✅ 完成')
  } catch (error) {
    console.error('❌', error.message)
  } finally {
    await sequelize.close()
  }
}

main()
