require('dotenv').config()
const { sequelize } = require('../config/database')

async function run() {
  await sequelize.authenticate()
  console.log('=== DB CONNECTED ===\n')

  // ─── ISSUE 1: items.item_template_id backfill ───
  console.log('═══════════════════════════════════════')
  console.log('  ISSUE 1: items.item_template_id backfill')
  console.log('═══════════════════════════════════════\n')

  // 1a. Distinct sources
  const [sources] = await sequelize.query('SELECT DISTINCT source FROM items')
  console.log('1a. DISTINCT sources in items:')
  console.log(JSON.stringify(sources, null, 2))

  // 1b. NULL item_template_id count by source
  const [nullBySource] = await sequelize.query(
    'SELECT i.source, COUNT(*) as cnt FROM items i WHERE i.item_template_id IS NULL GROUP BY i.source'
  )
  console.log('\n1b. NULL item_template_id count by source:')
  console.log(JSON.stringify(nullBySource, null, 2))

  // 1c. lottery_prizes table columns
  const [lpCols] = await sequelize.query(
    "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_prizes' ORDER BY ORDINAL_POSITION"
  )
  console.log('\n1c. lottery_prizes columns:')
  console.log(JSON.stringify(lpCols, null, 2))

  // 1d. Matching patterns: sample items with NULL template vs item_templates
  const [sampleNulls] = await sequelize.query(
    `SELECT i.item_id, i.name, i.item_type, i.source, i.status, i.created_at
     FROM items i WHERE i.item_template_id IS NULL LIMIT 15`
  )
  console.log('\n1d. Sample items with NULL item_template_id (first 15):')
  console.log(JSON.stringify(sampleNulls, null, 2))

  // 1d2. Try matching by name
  const [nameMatches] = await sequelize.query(
    `SELECT i.item_id, i.name AS item_name, i.item_type AS item_type,
            it.item_template_id, it.template_code, it.display_name AS template_name, it.item_type AS template_type
     FROM items i
     JOIN item_templates it ON i.name = it.display_name
     WHERE i.item_template_id IS NULL
     LIMIT 15`
  )
  console.log('\n1d2. Items matching item_templates by name (first 15):')
  console.log(JSON.stringify(nameMatches, null, 2))

  // 1d3. Count potential matches by name
  const [nameMatchCount] = await sequelize.query(
    `SELECT COUNT(*) as match_count FROM items i
     JOIN item_templates it ON i.name = it.display_name
     WHERE i.item_template_id IS NULL`
  )
  console.log('\n1d3. Total items matchable by name:')
  console.log(JSON.stringify(nameMatchCount, null, 2))

  // 1d4. Items with NULL template that do NOT match any template by name
  const [noNameMatch] = await sequelize.query(
    `SELECT i.name, i.item_type, i.source, COUNT(*) as cnt
     FROM items i
     WHERE i.item_template_id IS NULL
       AND i.name NOT IN (SELECT display_name FROM item_templates)
     GROUP BY i.name, i.item_type, i.source
     ORDER BY cnt DESC LIMIT 20`
  )
  console.log('\n1d4. NULL-template items NOT matchable by name (grouped):')
  console.log(JSON.stringify(noNameMatch, null, 2))

  // 1e. All item_templates
  const [templates] = await sequelize.query(
    'SELECT item_template_id, template_code, item_type, display_name FROM item_templates ORDER BY item_template_id'
  )
  console.log('\n1e. All item_templates:')
  console.log(JSON.stringify(templates, null, 2))

  // ─── ISSUE 2: item_ledger mint consistency ───
  console.log('\n═══════════════════════════════════════')
  console.log('  ISSUE 2: item_ledger mint consistency')
  console.log('═══════════════════════════════════════\n')

  // 2a. Count items without mint record
  const [noMintCount] = await sequelize.query(
    "SELECT COUNT(*) as cnt FROM items WHERE item_id NOT IN (SELECT DISTINCT item_id FROM item_ledger WHERE event_type = 'mint')"
  )
  console.log('2a. Items without mint record:')
  console.log(JSON.stringify(noMintCount, null, 2))

  // 2b. Sample mismatched items
  const [noMintSample] = await sequelize.query(
    `SELECT i.item_id, i.source, i.status, i.created_at
     FROM items i
     WHERE i.item_id NOT IN (SELECT DISTINCT item_id FROM item_ledger WHERE event_type = 'mint')
     ORDER BY i.created_at ASC LIMIT 10`
  )
  console.log('\n2b. Sample items without mint record (oldest 10):')
  console.log(JSON.stringify(noMintSample, null, 2))

  // 2c. Check if these are legacy items - breakdown by source
  const [noMintBySource] = await sequelize.query(
    `SELECT i.source, COUNT(*) as cnt, MIN(i.created_at) as earliest, MAX(i.created_at) as latest
     FROM items i
     WHERE i.item_id NOT IN (SELECT DISTINCT item_id FROM item_ledger WHERE event_type = 'mint')
     GROUP BY i.source`
  )
  console.log('\n2c. No-mint items by source (with date range):')
  console.log(JSON.stringify(noMintBySource, null, 2))

  // 2d. Compare with overall item date ranges to see if these predate ledger
  const [ledgerDateRange] = await sequelize.query(
    `SELECT MIN(created_at) as earliest_ledger, MAX(created_at) as latest_ledger FROM item_ledger`
  )
  console.log('\n2d. item_ledger overall date range:')
  console.log(JSON.stringify(ledgerDateRange, null, 2))

  // ─── ISSUE 3: owner_consistency ───
  console.log('\n═══════════════════════════════════════')
  console.log('  ISSUE 3: owner_consistency')
  console.log('═══════════════════════════════════════\n')

  // 3a. Find mismatched items
  const [ownerMismatch] = await sequelize.query(
    `SELECT i.item_id, i.owner_account_id AS item_owner,
            (SELECT il.account_id FROM item_ledger il WHERE il.item_id = i.item_id AND il.delta = 1 ORDER BY il.created_at DESC LIMIT 1) AS ledger_owner
     FROM items i
     WHERE i.owner_account_id != (SELECT il.account_id FROM item_ledger il WHERE il.item_id = i.item_id AND il.delta = 1 ORDER BY il.created_at DESC LIMIT 1)
     LIMIT 5`
  )
  console.log('3a. Items where owner != ledger owner:')
  console.log(JSON.stringify(ownerMismatch, null, 2))

  // 3b. Get full ledger history for mismatched items
  if (ownerMismatch.length > 0) {
    const mismatchedIds = ownerMismatch.map(r => r.item_id).join(',')
    const [ledgerHistory] = await sequelize.query(
      `SELECT il.ledger_id, il.item_id, il.account_id, il.event_type, il.delta, il.created_at
       FROM item_ledger il
       WHERE il.item_id IN (${mismatchedIds})
       ORDER BY il.item_id, il.created_at`
    )
    console.log('\n3b. Full ledger history for mismatched items:')
    console.log(JSON.stringify(ledgerHistory, null, 2))

    // 3c. Get full item details for mismatched items
    const [itemDetails] = await sequelize.query(
      `SELECT i.item_id, i.name, i.item_type, i.source, i.status, i.owner_account_id, i.created_at, i.updated_at
       FROM items i WHERE i.item_id IN (${mismatchedIds})`
    )
    console.log('\n3c. Full item details for mismatched items:')
    console.log(JSON.stringify(itemDetails, null, 2))
  }

  console.log('\n=== DIAGNOSTICS COMPLETE ===')
  await sequelize.close()
}

run().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
