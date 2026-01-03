/**
 * Live DB reality check (Node.js only)
 *
 * Goal:
 * - Connect to the REAL database defined by current `.env`
 * - Verify which tables exist and basic row counts
 * - Spot obvious inconsistencies (e.g. business tables have data but ledger tables are empty)
 *
 * Notes:
 * - Does NOT use mysql CLI.
 * - Uses the same Sequelize instance as the app (`config/database.js`).
 * - Outputs a compact JSON summary to stdout.
 */
'use strict'

// Ensure `.env` is loaded for this script (independent from app.js)
require('dotenv').config()

// Reduce query noise (config/database.js reads NODE_ENV at require-time)
process.env.NODE_ENV = process.env.NODE_ENV || 'development'

const { QueryTypes } = require('sequelize')
const { sequelize } = require('../../config/database')

function safeNumber(v) {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

async function getTableNames(schema) {
  const rows = await sequelize.query(
    `
      SELECT TABLE_NAME AS table_name
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = :schema
      ORDER BY TABLE_NAME ASC
    `,
    { replacements: { schema }, type: QueryTypes.SELECT }
  )
  return rows.map(r => r.table_name)
}

async function getRowCount(tableName) {
  const rows = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``, {
    type: QueryTypes.SELECT
  })
  return safeNumber(rows?.[0]?.cnt) ?? 0
}

async function getLatestRows(tableName, orderByColumn, limit = 5) {
  const rows = await sequelize.query(
    `SELECT * FROM \`${tableName}\` ORDER BY \`${orderByColumn}\` DESC LIMIT ${Number(limit)}`,
    { type: QueryTypes.SELECT }
  )
  return rows
}

async function getColumns(schema, tableName) {
  const rows = await sequelize.query(
    `
      SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table
      ORDER BY ORDINAL_POSITION ASC
    `,
    { replacements: { schema, table: tableName }, type: QueryTypes.SELECT }
  )
  return rows
}

async function main() {
  const startedAt = new Date().toISOString()
  const schema = process.env.DB_NAME

  if (!schema) {
    throw new Error('Missing DB_NAME in environment. Make sure .env has DB_NAME.')
  }

  const connectionTarget = {
    host: process.env.DB_HOST || null,
    port: process.env.DB_PORT || null,
    database: schema,
    user: process.env.DB_USER || null
  }

  const result = {
    started_at: startedAt,
    connection_target: connectionTarget,
    ok: false,
    schema,
    present_tables: [],
    missing_tables: [],
    counts: {},
    spot_checks: {},
    warnings: []
  }

  await sequelize.authenticate()

  const allTables = await getTableNames(schema)
  result.present_tables = allTables

  // Keep this list aligned with CURRENT codebase (models/index.js) + core domains in routes.
  const mustHaveTables = [
    'users',
    'roles',
    'user_roles',
    'authentication_sessions',
    'accounts',
    'account_asset_balances',
    'asset_transactions',
    'lottery_draws',
    'lottery_prizes',
    'lottery_draw_quota_rules',
    'lottery_user_daily_draw_quota',
    'api_idempotency_requests',
    'item_instances',
    'item_instance_events',
    'exchange_items',
    'exchange_records',
    'market_listings',
    'trade_orders',
    'redemption_orders',
    'merchant_points_reviews',
    'admin_operation_logs',
    'content_review_records',
    'customer_service_sessions',
    'chat_messages'
  ]

  const shouldNotExistLegacyTables = [
    'user_points_accounts',
    'points_transactions',
    'user_asset_accounts',
    'asset_accounts',
    'user_inventory' // legacy backpack table (current code uses item_instances + redemption_orders)
  ]

  const missingMustHave = mustHaveTables.filter(t => !allTables.includes(t))
  result.missing_tables = missingMustHave

  // Counts for tables that actually exist
  for (const t of mustHaveTables) {
    if (allTables.includes(t)) {
      result.counts[t] = await getRowCount(t)
    }
  }

  result.spot_checks.legacy_tables_present = {}
  for (const legacy of shouldNotExistLegacyTables) {
    result.spot_checks.legacy_tables_present[legacy] = allTables.includes(legacy)
  }

  // Spot-check: asset_transactions schema + quick distribution (if table exists)
  if (allTables.includes('asset_transactions')) {
    const cols = await getColumns(schema, 'asset_transactions')
    result.spot_checks.asset_transactions = {
      columns: cols.map(c => c.column_name),
      total: result.counts.asset_transactions
    }

    // If there is a business_type column, show top distribution
    if (cols.some(c => c.column_name === 'business_type')) {
      const dist = await sequelize.query(
        `
          SELECT business_type, COUNT(*) AS cnt
          FROM asset_transactions
          GROUP BY business_type
          ORDER BY cnt DESC
          LIMIT 20
        `,
        { type: QueryTypes.SELECT }
      )
      result.spot_checks.asset_transactions.business_type_top20 = dist
    }

    // Quick latest rows (only if created_at exists)
    if (cols.some(c => c.column_name === 'created_at')) {
      const latest = await getLatestRows('asset_transactions', 'created_at', 3)
      result.spot_checks.asset_transactions.latest_3 = latest
    }
  }

  // Spot-check: lottery_draws recent activity + cost_points (if columns exist)
  if (allTables.includes('lottery_draws')) {
    const cols = await getColumns(schema, 'lottery_draws')
    const hasCreatedAt = cols.some(c => c.column_name === 'created_at')
    const hasCostPoints = cols.some(c => c.column_name === 'cost_points')

    const check = { total: result.counts.lottery_draws, columns: cols.map(c => c.column_name) }

    if (hasCreatedAt) {
      check.latest_10 = await getLatestRows('lottery_draws', 'created_at', 10)
    }
    if (hasCostPoints) {
      const costStats = await sequelize.query(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN cost_points IS NULL THEN 1 ELSE 0 END) AS cost_points_null,
            SUM(CASE WHEN cost_points = 0 THEN 1 ELSE 0 END) AS cost_points_zero,
            MIN(cost_points) AS min_cost_points,
            MAX(cost_points) AS max_cost_points
          FROM lottery_draws
        `,
        { type: QueryTypes.SELECT }
      )
      check.cost_points_stats = costStats?.[0] || null
    }

    result.spot_checks.lottery_draws = check
  }

  // Ledger vs business activity heuristic warnings
  const draws = result.counts.lottery_draws ?? null
  const txs = result.counts.asset_transactions ?? null
  if (typeof draws === 'number' && typeof txs === 'number') {
    if (draws > 0 && txs === 0) {
      result.warnings.push(
        'lottery_draws has rows but asset_transactions is empty. If draws consume points/asset, ledger recording may be missing or writing elsewhere.'
      )
    }
  }

  result.ok = missingMustHave.length === 0

  // Output summary as JSON for easy copy/paste and diff
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

main()
  .catch(err => {
    console.error('❌ live_db_reality_check failed:', err.message)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await sequelize.close()
    } catch (_) {}
  })
