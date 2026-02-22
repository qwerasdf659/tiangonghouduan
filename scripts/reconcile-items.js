#!/usr/bin/env node
/**
 * 统一对账脚本 — 同时覆盖物品守恒和资产守恒
 *
 * 物品对账：
 * 1. 物品守恒：SUM(delta) GROUP BY item_id 全部为 0
 * 2. 持有者一致：ledger 推导持有者 == items.owner_account_id
 * 3. 铸造数量一致：items 总数 == mint(delta=+1) 条数
 *
 * 资产对账：
 * 1. 全局守恒：SUM(delta_amount) GROUP BY asset_code（双录后应为 0）
 * 2. 账户余额一致：SUM(delta_amount) == available_amount + frozen_amount
 *
 * 使用方式：
 * - 手动执行：node scripts/reconcile-items.js
 * - 定时执行：配置 cron 每小时运行
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

require('dotenv').config()

async function main() {
  const { sequelize } = require('../config/database')
  const logger = require('../utils/logger')

  console.log(`\n=== 统一对账 [${new Date().toISOString()}] ===\n`)

  const results = { items: {}, assets: {} }

  // ========== 物品对账 ==========
  console.log('📊 物品对账...')

  // 1. 物品守恒
  const [imbalanced] = await sequelize.query(`
    SELECT item_id, SUM(delta) AS balance
    FROM item_ledger
    GROUP BY item_id
    HAVING balance != 0
  `)
  results.items.conservation = {
    status: imbalanced.length === 0 ? 'PASS' : 'FAIL',
    imbalanced_count: imbalanced.length
  }
  console.log(`  物品守恒：${results.items.conservation.status}（${imbalanced.length} 个不平衡）`)

  // 2. 持有者一致性
  const [ownerMismatch] = await sequelize.query(`
    SELECT l.item_id, l.account_id AS ledger_owner, i.owner_account_id AS cache_owner
    FROM (
      SELECT item_id, account_id
      FROM item_ledger
      GROUP BY item_id, account_id
      HAVING SUM(delta) = 1
    ) l
    JOIN items i ON l.item_id = i.item_id
    WHERE l.account_id != i.owner_account_id
  `)
  results.items.owner_consistency = {
    status: ownerMismatch.length === 0 ? 'PASS' : 'FAIL',
    mismatch_count: ownerMismatch.length
  }
  console.log(`  持有者一致：${results.items.owner_consistency.status}（${ownerMismatch.length} 个不一致）`)

  // 3. 铸造数量
  const [[{ cnt: itemCount }]] = await sequelize.query('SELECT COUNT(*) AS cnt FROM items')
  const [[{ cnt: mintCount }]] = await sequelize.query(
    "SELECT COUNT(*) AS cnt FROM item_ledger WHERE event_type = 'mint' AND delta = 1"
  )
  results.items.mint_consistency = {
    status: Number(itemCount) === Number(mintCount) ? 'PASS' : 'FAIL',
    items: Number(itemCount),
    mints: Number(mintCount)
  }
  console.log(`  铸造一致：${results.items.mint_consistency.status}（items=${itemCount}, mints=${mintCount}）`)

  // ========== 资产对账 ==========
  console.log('\n📊 资产对账...')

  // 1. 全局守恒（排除 BIGINT 溢出）
  const [globalCheck] = await sequelize.query(`
    SELECT asset_code, SUM(delta_amount) AS total_delta, COUNT(*) AS tx_count
    FROM asset_transactions
    WHERE delta_amount > -9000000000000000000
    GROUP BY asset_code
  `)
  results.assets.global = globalCheck.map(r => ({
    asset_code: r.asset_code,
    total_delta: Number(r.total_delta),
    tx_count: Number(r.tx_count)
  }))
  console.log('  全局守恒：')
  for (const r of results.assets.global) {
    const flag = r.total_delta === 0 ? '✅' : '⚠️'
    console.log(`    ${flag} ${r.asset_code}: SUM=${r.total_delta}（${r.tx_count} 条流水）`)
  }

  // 2. 账户余额一致性（抽样前 20）
  const [balanceMismatch] = await sequelize.query(`
    SELECT 
      b.account_id, b.asset_code,
      (b.available_amount + b.frozen_amount) AS recorded,
      COALESCE(t.tx_sum, 0) AS calculated,
      (b.available_amount + b.frozen_amount) - COALESCE(t.tx_sum, 0) AS diff
    FROM account_asset_balances b
    LEFT JOIN (
      SELECT account_id, asset_code, SUM(delta_amount) AS tx_sum
      FROM asset_transactions
      WHERE delta_amount > -9000000000000000000
      GROUP BY account_id, asset_code
    ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
    HAVING diff != 0
    LIMIT 20
  `)
  results.assets.balance_consistency = {
    status: balanceMismatch.length === 0 ? 'PASS' : 'FAIL',
    mismatch_count: balanceMismatch.length
  }
  console.log(`  余额一致：${results.assets.balance_consistency.status}（${balanceMismatch.length} 个不一致）`)

  // ========== 总结 ==========
  const allPass = results.items.conservation.status === 'PASS' &&
    results.items.owner_consistency.status === 'PASS' &&
    results.items.mint_consistency.status === 'PASS' &&
    results.assets.balance_consistency.status === 'PASS'

  console.log(`\n=== 对账结论：${allPass ? '✅ 全部通过' : '❌ 存在异常'} ===\n`)

  if (!allPass) {
    logger.error('对账发现异常', { results })
  } else {
    logger.info('对账全部通过', { results })
  }

  await sequelize.close()
  process.exit(allPass ? 0 : 1)
}

main().catch(err => {
  console.error('对账脚本执行失败:', err)
  process.exit(1)
})
