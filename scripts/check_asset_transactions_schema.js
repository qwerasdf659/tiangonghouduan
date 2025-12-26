/**
 * 检查 asset_transactions 表结构脚本
 * 用于验证方案A幂等性修复的实施状态
 */
'use strict'

require('dotenv').config()
const mysql = require('mysql2/promise')

async function checkTable() {
  let connection
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    })

    console.log('=== asset_transactions 表结构 ===')
    const [columns] = await connection.query('SHOW COLUMNS FROM asset_transactions')
    columns.forEach(col => {
      console.log(
        `${col.Field} | ${col.Type} | ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'} | ${col.Key || '-'}`
      )
    })

    console.log('\n=== 现有索引 ===')
    const [indexes] = await connection.query('SHOW INDEX FROM asset_transactions')
    const indexMap = {}
    indexes.forEach(idx => {
      if (indexMap[idx.Key_name] === undefined) {
        indexMap[idx.Key_name] = { unique: idx.Non_unique === 0, columns: [] }
      }
      indexMap[idx.Key_name].columns.push(idx.Column_name)
    })
    Object.entries(indexMap).forEach(([name, info]) => {
      console.log(`${name} (${info.unique ? 'UNIQUE' : 'INDEX'}): ${info.columns.join(', ')}`)
    })

    console.log('\n=== 检查方案A新字段是否存在 ===')
    const hasIdemKey = columns.find(c => c.Field === 'idempotency_key')
    const hasLotterySession = columns.find(c => c.Field === 'lottery_session_id')
    console.log(`idempotency_key: ${hasIdemKey ? '✅ 已存在' : '❌ 不存在'}`)
    console.log(`lottery_session_id: ${hasLotterySession ? '✅ 已存在' : '❌ 不存在'}`)

    console.log('\n=== 现有数据统计 ===')
    const [stats] = await connection.query('SELECT COUNT(*) as total FROM asset_transactions')
    console.log(`总记录数: ${stats[0].total}`)

    // 检查业务类型分布
    const [types] = await connection.query(`
      SELECT business_type, COUNT(*) as cnt
      FROM asset_transactions
      GROUP BY business_type
      ORDER BY cnt DESC
    `)
    console.log('\n=== 业务类型分布 ===')
    types.forEach(t => {
      console.log(`${t.business_type}: ${t.cnt} 条`)
    })

    // 返回实施状态
    const needMigration = hasIdemKey === undefined || hasLotterySession === undefined
    console.log(`\n=== 实施状态 ===`)
    console.log(needMigration ? '❌ 需要执行数据库迁移' : '✅ 字段已存在，检查索引状态')

    await connection.end()
    return needMigration
  } catch (error) {
    console.error('数据库检查失败:', error.message)
    if (connection) await connection.end()
    process.exit(1)
  }
}

checkTable()
