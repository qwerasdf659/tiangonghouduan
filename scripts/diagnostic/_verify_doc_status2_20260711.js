/* 临时核验脚本2（用后即删） */
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
  const q = async (label, sql) => {
    try {
      const [rows] = await conn.query(sql)
      console.log(`\n=== ${label} ===`)
      console.log(JSON.stringify(rows, null, 1))
    } catch (e) {
      console.log(`\n=== ${label} === ERROR: ${e.message}`)
    }
  }

  await q('A.无模板items来源', `SELECT source_type, status, COUNT(*) AS cnt, MIN(created_at) AS first, MAX(created_at) AS last
       FROM items WHERE item_template_id IS NULL GROUP BY source_type, status`)
  await q('B.无模板items明细', `SELECT item_id, item_name, source_type, status, created_at FROM items WHERE item_template_id IS NULL ORDER BY item_id`)
  await q('C.exchange_items在售', `SELECT exchange_item_id, item_name, item_template_id, status FROM exchange_items WHERE status='active'`)
  await q('D.barter订单状态', `SELECT status, COUNT(*) AS cnt FROM exchange_records WHERE source='barter' GROUP BY status`)
  await q('E.prize_definitions模板挂载', `SELECT COUNT(*) AS total, SUM(item_template_id IS NULL) AS null_tpl FROM prize_definitions`)
  await conn.end()
}
main().catch(e => { console.error(e); process.exit(1) })
