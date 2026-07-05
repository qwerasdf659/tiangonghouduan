require('dotenv').config()
const mysql = require('mysql2/promise')

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: '+08:00'
  })
  console.log('CONNECTED to', process.env.DB_HOST, process.env.DB_NAME)

  const tables = [
    'lottery_campaigns',
    'lottery_campaign_prizes',
    'prize_definitions',
    'material_asset_types',
    'account_asset_balances',
    'lottery_draws',
    'asset_transactions',
    'segment_rule_configs',
    'user_ad_tags',
    'user_growth_levels',
    'lottery_campaign_user_quota',
    'lottery_campaign_quota_grant',
    'asset_conversion_rules',
    'asset_group_defs'
  ]

  for (const t of tables) {
    try {
      const [cols] = await conn.query(`SHOW FULL COLUMNS FROM \`${t}\``)
      console.log(`\n===== TABLE ${t} (${cols.length} cols) =====`)
      for (const c of cols) {
        console.log(`  ${c.Field} | ${c.Type} | null=${c.Null} | key=${c.Key} | def=${c.Default} | ${c.Comment || ''}`)
      }
    } catch (e) {
      console.log(`\n===== TABLE ${t} : NOT FOUND (${e.code}) =====`)
    }
  }

  await conn.end()
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
