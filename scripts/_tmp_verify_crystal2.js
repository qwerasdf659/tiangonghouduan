require('dotenv').config()
const mysql = require('mysql2/promise')

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, timezone: '+08:00'
  })

  async function q(label, sql) {
    try {
      const [rows] = await conn.query(sql)
      console.log(`\n===== ${label} =====`)
      console.log(JSON.stringify(rows, null, 2))
    } catch (e) {
      console.log(`\n===== ${label} : ERROR ${e.code} ${e.message} =====`)
    }
  }

  await q('material_asset_types ALL', 'SELECT asset_code, display_name, group_code, form, tier, visible_value_points, budget_value_points, is_enabled FROM material_asset_types ORDER BY group_code, tier')
  await q('material form distinct', 'SELECT form, COUNT(*) c FROM material_asset_types GROUP BY form')
  await q('segment_rule_configs', 'SELECT segment_rule_config_id, version_key, version_name, is_system, status, JSON_EXTRACT(rules, "$") AS rules FROM segment_rule_configs')
  await q('user_growth_levels', 'SELECT level_key, level_name, min_history_points, status FROM user_growth_levels ORDER BY sort_order')
  await q('lottery_campaigns sample', 'SELECT lottery_campaign_id, campaign_name, campaign_code, campaign_type, status, budget_mode, preset_budget_policy, allowed_campaign_ids FROM lottery_campaigns LIMIT 10')
  await q('prize_definitions material sample', "SELECT prize_definition_id, prize_code, display_name, prize_type, material_asset_code, material_amount FROM prize_definitions WHERE prize_type='material' LIMIT 15")
  await q('account_asset_balances budget sample', "SELECT account_id, asset_code, available_amount, lottery_campaign_id, lottery_campaign_key FROM account_asset_balances WHERE asset_code IN ('BUDGET_POINTS','budget_points') LIMIT 10")
  await q('asset_code distinct in balances', 'SELECT asset_code, COUNT(*) c FROM account_asset_balances GROUP BY asset_code ORDER BY c DESC LIMIT 40')
  await q('user_ad_tags distinct keys', 'SELECT tag_key, COUNT(*) c FROM user_ad_tags GROUP BY tag_key LIMIT 30')
  await q('lottery_draws result_metadata exists', "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lottery_draws' AND COLUMN_NAME IN ('result_metadata','material_amount')")

  await conn.end()
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })
