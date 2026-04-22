#!/usr/bin/env node

/**
 * 账本负值余额修复脚本（dry-run 模式）
 *
 * 对应文档决策：7.13 + 7.18（四管齐下之"修复脚本"）
 *
 * 功能：
 * 1. 扫描 account_asset_balances 中 frozen_amount < 0 或 available_amount < 0 的记录
 * 2. 生成修复 SQL（将负值归零 + 写入对账流水）
 * 3. dry-run 模式下只输出修复计划，不执行
 * 4. --execute 模式下在事务中执行修复
 *
 * 使用方式：
 *   node scripts/maintenance/fix_negative_balances.js              # dry-run（只看不改）
 *   node scripts/maintenance/fix_negative_balances.js --execute    # 真正执行修复
 *
 * @module scripts/maintenance/fix_negative_balances
 */

'use strict'

require('dotenv').config()

async function main() {
  const isDryRun = !process.argv.includes('--execute')
  const mysql = require('mysql2/promise')

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  })

  console.log(isDryRun ? '🔍 DRY-RUN 模式（只扫描不修改）' : '⚠️  EXECUTE 模式（将执行修复）')
  console.log('─'.repeat(60))

  // 扫描负值记录
  const [negativeRows] = await conn.execute(`
    SELECT account_asset_balance_id, account_id, asset_code,
           available_amount, frozen_amount
    FROM account_asset_balances
    WHERE frozen_amount < 0 OR available_amount < 0
    ORDER BY account_id, asset_code
  `)

  if (negativeRows.length === 0) {
    console.log('✅ 未发现负值记录，账本健康')
    await conn.end()
    return
  }

  console.log(`❌ 发现 ${negativeRows.length} 条负值记录：\n`)

  const fixes = []
  for (const row of negativeRows) {
    const fix = {
      id: row.account_asset_balance_id,
      account_id: row.account_id,
      asset_code: row.asset_code,
      old_available: Number(row.available_amount),
      old_frozen: Number(row.frozen_amount),
      new_available: Math.max(0, Number(row.available_amount)),
      new_frozen: Math.max(0, Number(row.frozen_amount))
    }
    fixes.push(fix)

    console.log(`  [${fix.id}] account=${fix.account_id} asset=${fix.asset_code}`)
    if (fix.old_available < 0) {
      console.log(`    available: ${fix.old_available} → ${fix.new_available}`)
    }
    if (fix.old_frozen < 0) {
      console.log(`    frozen: ${fix.old_frozen} → ${fix.new_frozen}`)
    }
  }

  if (isDryRun) {
    console.log(`\n📋 修复计划：${fixes.length} 条记录待修复`)
    console.log('   运行 --execute 参数执行修复')
    await conn.end()
    return
  }

  // 执行修复（事务内）
  console.log(`\n⚡ 开始执行修复（${fixes.length} 条）...`)
  await conn.beginTransaction()

  try {
    for (const fix of fixes) {
      // 归零负值
      await conn.execute(
        `UPDATE account_asset_balances
         SET available_amount = GREATEST(available_amount, 0),
             frozen_amount = GREATEST(frozen_amount, 0)
         WHERE account_asset_balance_id = ?`,
        [fix.id]
      )

      // 写入对账流水（asset_transactions）
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
      await conn.execute(
        `INSERT INTO asset_transactions
         (account_id, asset_code, business_type, delta_amount,
          balance_after, balance_before, meta, created_at)
         VALUES (?, ?, 'system_fix_negative_balance', 0, ?, ?, ?, ?)`,
        [
          fix.account_id,
          fix.asset_code,
          fix.new_available,
          fix.old_available,
          JSON.stringify({
            fix_type: 'negative_balance_cleanup',
            old_available: fix.old_available,
            old_frozen: fix.old_frozen,
            new_available: fix.new_available,
            new_frozen: fix.new_frozen,
            script: 'fix_negative_balances.js',
            timestamp: now
          }),
          now
        ]
      )
    }

    await conn.commit()
    console.log(`✅ 修复完成：${fixes.length} 条记录已归零，对账流水已写入`)
  } catch (error) {
    await conn.rollback()
    console.error('❌ 修复失败，已回滚：', error.message)
    process.exit(1)
  }

  await conn.end()
}

main().catch(err => {
  console.error('脚本执行失败：', err.message)
  process.exit(1)
})
