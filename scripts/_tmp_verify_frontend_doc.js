'use strict'
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
  console.log('CONNECTED to', process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME)

  const q = async (label, sql) => {
    try {
      const [rows] = await conn.query(sql)
      console.log('\n===== ' + label + ' =====')
      console.log(JSON.stringify(rows, null, 2))
    } catch (e) {
      console.log('\n===== ' + label + ' ERROR =====')
      console.log(e.message)
    }
  }

  // 1) Which target tables exist
  await q('TABLES (relevant)', `
    SELECT TABLE_NAME, TABLE_ROWS
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (
        'trade_orders','market_listings','system_settings','system_configs',
        'material_asset_types','exchange_records','asset_group_defs'
      )
    ORDER BY TABLE_NAME`)

  // 2) system_settings columns
  await q('system_settings COLUMNS', `SHOW COLUMNS FROM system_settings`)

  // 3) system_settings categories + count
  await q('system_settings categories', `
    SELECT category, COUNT(*) AS cnt FROM system_settings GROUP BY category ORDER BY category`)

  // 4) Any existing app version / version-gate settings?
  await q('system_settings app/version keys', `
    SELECT system_setting_id, category, setting_key, setting_value, value_type, is_visible, is_readonly
    FROM system_settings
    WHERE setting_key LIKE '%version%' OR setting_key LIKE 'app%' OR category='basic'
    ORDER BY category, setting_key`)

  // 5) trade_orders completed count + sample
  await q('trade_orders status distribution', `
    SELECT status, COUNT(*) AS cnt FROM trade_orders GROUP BY status`)

  await q('trade_orders sample (completed)', `
    SELECT trade_order_id, market_listing_id, gross_amount, fee_amount, net_amount, asset_code, status, completed_at
    FROM trade_orders WHERE status='completed' ORDER BY completed_at DESC LIMIT 5`)

  // 6) market_listings columns relevant
  await q('market_listings offer columns', `
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='market_listings'
      AND COLUMN_NAME IN ('listing_kind','offer_asset_code','offer_item_template_id','offer_amount')`)

  // 7) material_asset_types — asset name mapping
  await q('material_asset_types sample', `
    SELECT asset_code, display_name FROM material_asset_types LIMIT 20`)

  // 8) exchange_records pay columns + pay_asset_name presence
  await q('exchange_records pay columns', `
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='exchange_records'
      AND COLUMN_NAME LIKE 'pay%'`)

  await conn.end()
  console.log('\nDONE')
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
