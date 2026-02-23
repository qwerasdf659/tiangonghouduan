'use strict'

/**
 * 补建缺失的 opening_balance 出方记录（counterpart）
 *
 * 29 条 opening_balance 记录没有对应的 opening_balance_counterpart。
 * 双录规则：opening_balance 的入方（用户账户 +δ）必须有出方（系统账户 id=2 -δ）。
 *
 * 同时为余额表中有余额但无流水的账户补建双录。
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const SYSTEM_ACCOUNT_ID = 2

    // 1. 补建缺失的 counterpart
    const [orphanOB] = await queryInterface.sequelize.query(
      `SELECT ob.asset_transaction_id, ob.account_id, ob.asset_code,
              CAST(ob.delta_amount AS DECIMAL(20,2)) as delta_amount,
              ob.created_at
       FROM asset_transactions ob
       WHERE ob.business_type = 'opening_balance'
         AND NOT EXISTS (
           SELECT 1 FROM asset_transactions cp
           WHERE cp.business_type = 'opening_balance_counterpart'
             AND cp.counterpart_account_id = ob.account_id
             AND cp.asset_code = ob.asset_code
         )`
    )

    if (orphanOB.length === 0) {
      console.log('✅ 无缺失 counterpart，跳过')
    } else {
      console.log(`发现 ${orphanOB.length} 条缺失 counterpart 的 opening_balance，补建中...`)

      for (const ob of orphanOB) {
        const negDelta = -Number(ob.delta_amount)
        if (negDelta === 0) {
          console.log(`  跳过 account=${ob.account_id} asset=${ob.asset_code} (delta=0)`)
          continue
        }

        const idempKey = `ob_cp_fix_${ob.account_id}_${ob.asset_code}_${ob.asset_transaction_id}`

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key, meta, created_at)
           VALUES (:sysAccount, :userAccount, :assetCode, :negDelta,
                   0, 0, 'opening_balance_counterpart', :idempKey,
                   :meta, :createdAt)`,
          {
            replacements: {
              sysAccount: SYSTEM_ACCOUNT_ID,
              userAccount: ob.account_id,
              assetCode: ob.asset_code,
              negDelta,
              idempKey,
              meta: JSON.stringify({
                source: 'migration_fix_missing_counterpart',
                original_ob_id: ob.asset_transaction_id
              }),
              createdAt: ob.created_at
            }
          }
        )

        console.log(
          `  ✅ account=${ob.account_id} asset=${ob.asset_code} delta=${ob.delta_amount} → counterpart ${negDelta}`
        )
      }
    }

    // 2. 处理余额表中有余额但无流水的账户 — 补建 opening_balance + counterpart 双录
    const [balNoFlow] = await queryInterface.sequelize.query(
      `SELECT b.account_id, b.asset_code,
              CAST(b.available_amount + b.frozen_amount AS DECIMAL(20,2)) as total_balance
       FROM account_asset_balances b
       LEFT JOIN (
         SELECT account_id, asset_code
         FROM asset_transactions
         WHERE COALESCE(is_invalid, 0) = 0
         GROUP BY account_id, asset_code
       ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
       WHERE t.account_id IS NULL
         AND (b.available_amount + b.frozen_amount) != 0`
    )

    if (balNoFlow.length > 0) {
      console.log(`\n发现 ${balNoFlow.length} 个有余额但无流水的账户，补建双录...`)

      for (const row of balNoFlow) {
        const amount = Number(row.total_balance)
        if (amount === 0) continue

        const obKey = `ob_reconcile_${row.account_id}_${row.asset_code}`
        const cpKey = `ob_reconcile_cp_${row.account_id}_${row.asset_code}`

        // 入方：用户账户
        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key, meta, created_at)
           VALUES (:account, :sysAccount, :assetCode, :amount,
                   0, :amount, 'opening_balance', :obKey,
                   '{"source":"migration_balance_reconciliation"}', NOW())`,
          {
            replacements: {
              account: row.account_id,
              sysAccount: SYSTEM_ACCOUNT_ID,
              assetCode: row.asset_code,
              amount,
              obKey
            }
          }
        )

        // 出方：系统账户
        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key, meta, created_at)
           VALUES (:sysAccount, :account, :assetCode, :negAmount,
                   0, 0, 'opening_balance_counterpart', :cpKey,
                   '{"source":"migration_balance_reconciliation"}', NOW())`,
          {
            replacements: {
              sysAccount: SYSTEM_ACCOUNT_ID,
              account: row.account_id,
              assetCode: row.asset_code,
              negAmount: -amount,
              cpKey
            }
          }
        )

        console.log(`  ✅ account=${row.account_id} asset=${row.asset_code} balance=${amount}`)
      }
    }

    // 3. 验证修复结果
    const [globalCheck] = await queryInterface.sequelize.query(
      `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) as global_sum
       FROM asset_transactions
       WHERE COALESCE(is_invalid, 0) = 0
       GROUP BY asset_code`
    )

    console.log('\n修复后全局守恒:')
    let allBalanced = true
    globalCheck.forEach(r => {
      const balanced = parseInt(r.global_sum) === 0
      if (!balanced) allBalanced = false
      console.log(`  ${balanced ? '✅' : '⚠️'} ${r.asset_code}: SUM=${r.global_sum}`)
    })

    if (allBalanced) {
      console.log('\n✅ 全局守恒检查通过')
    } else {
      console.log('\n⚠️ 仍有未平衡资产，可能需要进一步调查')
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ 此迁移为数据修复，无法自动回滚')
  }
}
