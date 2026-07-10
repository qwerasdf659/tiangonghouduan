/* 临时核验脚本3（用后即删） */
require('dotenv').config()
const mysql = require('mysql2/promise')

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  })
  const [cols] = await conn.query(`SHOW COLUMNS FROM items`)
  console.log('items columns:', cols.map(c => c.Field).join(', '))
  const [rows] = await conn.query(
    `SELECT item_id, item_name, source, status, created_at FROM items WHERE item_template_id IS NULL ORDER BY item_id`
  )
  console.log(JSON.stringify(rows, null, 1))
  await conn.end()
}
main().catch(e => { console.error(e); process.exit(1) })
