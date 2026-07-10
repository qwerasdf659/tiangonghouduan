/* 临时核验脚本：核对《以物易物与会员成长等级功能启用方案》与真实库状态（用后即删） */
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

  await q('1.等级9档', `SELECT level_key, level_name, min_history_points, earn_multiplier, status,
       description LIKE '%占位%' AS has_placeholder
       FROM user_growth_levels ORDER BY sort_order`)
  await q('2.consumption_records锁定列', `SHOW COLUMNS FROM consumption_records LIKE '%lock%'`)
  await q('3.redeem_requirement max列', `SHOW COLUMNS FROM exchange_redeem_requirement LIKE '%growth%'`)
  await q('4.redeem_requirement 条数', `SELECT COUNT(*) AS cnt FROM exchange_redeem_requirement`)
  await q('5.风控阈值配置', `SELECT category, setting_key, setting_value FROM system_settings WHERE category='risk'`)
  await q('6.关键system_settings', `SELECT category, setting_key, setting_value FROM system_settings
       WHERE setting_key IN ('points_expire_days','initial_points','points_award_ratio','budget_allocation_ratio','barter_recipes')`)
  await q('7.barter_recipes存在性', `SELECT COUNT(*) AS cnt FROM system_settings WHERE setting_key='barter_recipes'`)
  await q('8.items模板挂载', `SELECT COUNT(*) AS total, SUM(item_template_id IS NULL) AS null_tpl FROM items`)
  await q('9.items状态分布', `SELECT status, COUNT(*) AS cnt FROM items GROUP BY status`)
  await q('10.exchange_items在售模板', `SELECT exchange_item_id, name, item_template_id, status FROM exchange_items WHERE status='active'`)
  await q('11.模板参考价缺失数', `SELECT COUNT(*) AS total,
       SUM(reference_price_points IS NULL OR reference_price_points=0) AS zero_or_null,
       SUM((reference_price_points IS NULL OR reference_price_points=0) AND is_enabled=1) AS zero_or_null_enabled
       FROM item_templates`)
  await q('12.barter订单', `SELECT COUNT(*) AS cnt FROM exchange_records WHERE source='barter'`)
  await q('13.迁移执行记录', `SELECT name FROM SequelizeMeta WHERE name LIKE '20260710%' ORDER BY name`)
  await q('14.等级分布', `SELECT COUNT(*) AS users, MAX(history_total_points) AS max_pts FROM users`)
  await q('15.level_probability配置', `SELECT COUNT(*) AS cnt FROM lottery_strategy_config WHERE config_group='level_probability'`)
  await q('16.加成流水', `SELECT business_type, COUNT(*) AS cnt FROM asset_transactions
       WHERE business_type IN ('level_bonus_reward','activity_bonus_reward','consumption_reward') GROUP BY business_type`)

  await conn.end()
}

main().catch(e => { console.error(e); process.exit(1) })
