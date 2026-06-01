/* 临时数据库核对脚本：客服/反馈/纠纷/工单相关表 */
require('dotenv').config()
const mysql = require('mysql2/promise')

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  })

  console.log('=== 已连接真实库:', process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME)

  // 1. 列出所有相关表
  const [tables] = await conn.query(
    `SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
       AND (TABLE_NAME LIKE '%customer_service%'
            OR TABLE_NAME LIKE '%feedback%'
            OR TABLE_NAME LIKE '%dispute%'
            OR TABLE_NAME LIKE '%issue%'
            OR TABLE_NAME LIKE '%complaint%'
            OR TABLE_NAME LIKE '%ticket%'
            OR TABLE_NAME LIKE '%refund%'
            OR TABLE_NAME LIKE '%aftersale%'
            OR TABLE_NAME LIKE '%after_sale%')
     ORDER BY TABLE_NAME`,
    [process.env.DB_NAME]
  )
  console.log('\n=== 相关表清单 ===')
  for (const t of tables) {
    console.log(`- ${t.TABLE_NAME}  约${t.TABLE_ROWS}行  ${t.TABLE_COMMENT || ''}`)
  }

  // 2. 对每张相关表打印结构
  for (const t of tables) {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, COLUMN_COMMENT
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME, t.TABLE_NAME]
    )
    console.log(`\n=== 表结构: ${t.TABLE_NAME} ===`)
    for (const c of cols) {
      console.log(`  ${c.COLUMN_NAME} | ${c.COLUMN_TYPE} | null=${c.IS_NULLABLE} | key=${c.COLUMN_KEY} | def=${c.COLUMN_DEFAULT} | ${c.COLUMN_COMMENT || ''}`)
    }
    // 实际行数
    const [cnt] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t.TABLE_NAME}\``)
    console.log(`  >>> 实际行数: ${cnt[0].n}`)
  }

  await conn.end()
}

main().catch(e => { console.error('ERR', e); process.exit(1) })
