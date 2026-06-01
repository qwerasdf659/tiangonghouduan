/* 临时：核对真实数据分布，辅助方案决策 */
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

  const [fbCat] = await conn.query(
    `SELECT category, status, COUNT(*) n FROM feedbacks GROUP BY category, status ORDER BY n DESC`
  )
  console.log('=== feedbacks 按 category+status 分布 ===')
  fbCat.forEach(r => console.log(`  ${r.category} / ${r.status}: ${r.n}`))

  const [issueType] = await conn.query(
    `SELECT issue_type, status, COUNT(*) n FROM customer_service_issues GROUP BY issue_type, status`
  )
  console.log('\n=== customer_service_issues 按 type+status 分布（应为空）===')
  if (issueType.length === 0) console.log('  (无数据)')
  issueType.forEach(r => console.log(`  ${r.issue_type} / ${r.status}: ${r.n}`))

  // 是否有任何 dispute_* 实际写入
  const [dispute] = await conn.query(
    `SELECT COUNT(*) n FROM customer_service_issues WHERE dispute_type IS NOT NULL OR dispute_evidence IS NOT NULL OR approval_chain_instance_id IS NOT NULL`
  )
  console.log(`\n=== 含 dispute_* 数据的工单行数: ${dispute[0].n}`)

  // sessions 关联 issue 的数量
  const [sessIssue] = await conn.query(
    `SELECT COUNT(*) n FROM customer_service_sessions WHERE issue_id IS NOT NULL`
  )
  console.log(`=== 关联了 issue_id 的会话数: ${sessIssue[0].n}`)

  // trade_orders 是否有 disputed 状态
  const [to] = await conn.query(
    `SELECT status, COUNT(*) n FROM trade_orders GROUP BY status`
  ).catch(() => [[]])
  console.log('\n=== trade_orders 状态分布 ===')
  to.forEach(r => console.log(`  ${r.status}: ${r.n}`))

  await conn.end()
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
