'use strict'

/**
 * 调平余额表与流水表的差异（D2-2/D2-3 最终修复）
 *
 * 以 account_asset_balances（实际余额）为真相源，
 * 为每个 diff ≠ 0 的 (account_id, asset_code) 创建 system_reconciliation 双录，
 * 使流水累计等于实际余额。
 *
 * 调平方向：
 * - diff > 0：余额高于流水 → 需要在账户上补 +diff 流水（从系统账户出）
 * - diff < 0：流水高于余额 → 需要在账户上补 -|diff| 流水（回系统账户）
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const SYSTEM_RECONCILIATION_ACCOUNT = 2

    const [mismatches] = await queryInterface.sequelize.query(
      `SELECT b.account_id, b.asset_code,
              CAST(b.available_amount + b.frozen_amount AS DECIMAL(20,2)) as total_balance,
              CAST(COALESCE(t.flow_sum, 0) AS DECIMAL(20,2)) as flow_sum,
              CAST((b.available_amount + b.frozen_amount) - COALESCE(t.flow_sum, 0) AS DECIMAL(20,2)) as diff
       FROM account_asset_balances b
       LEFT JOIN (
         SELECT account_id, asset_code, SUM(delta_amount) as flow_sum
         FROM asset_transactions
         WHERE COALESCE(is_invalid, 0) = 0
         GROUP BY account_id, asset_code
       ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
       WHERE CAST(b.available_amount + b.frozen_amount AS SIGNED) !=
             CAST(COALESCE(t.flow_sum, 0) AS SIGNED)`
    )

    if (mismatches.length === 0) {
      console.log('✅ 余额与流水完全一致，无需调平')
      return
    }

    console.log(`发现 ${mismatches.length} 个余额/流水不一致的账户，开始调平...`)

    for (const row of mismatches) {
      const diff = Number(row.diff)
      if (diff === 0) continue

      const idempKeyUser = `sys_reconcile_${row.account_id}_${row.asset_code}`
      const idempKeySys = `sys_reconcile_cp_${row.account_id}_${row.asset_code}`
      const meta = JSON.stringify({
        source: 'migration_reconciliation',
        actual_balance: Number(row.total_balance),
        flow_sum_before: Number(row.flow_sum),
        adjustment: diff
      })

      // 用户/业务账户侧：+diff（使流水对齐余额）
      await queryInterface.sequelize.query(
        `INSERT INTO asset_transactions
         (account_id, counterpart_account_id, asset_code, delta_amount,
          balance_before, balance_after, business_type, idempotency_key, meta, created_at)
         VALUES (:account, :sysAccount, :assetCode, :diff,
                 :flowBefore, :balance, 'system_reconciliation', :idempKey, :meta, NOW())`,
        {
          replacements: {
            account: row.account_id,
            sysAccount: SYSTEM_RECONCILIATION_ACCOUNT,
            assetCode: row.asset_code,
            diff,
            flowBefore: Number(row.flow_sum),
            balance: Number(row.total_balance),
            idempKey: idempKeyUser,
            meta
          }
        }
      )

      // 系统账户侧：-diff（对冲，保持全局守恒）
      await queryInterface.sequelize.query(
        `INSERT INTO asset_transactions
         (account_id, counterpart_account_id, asset_code, delta_amount,
          balance_before, balance_after, business_type, idempotency_key, meta, created_at)
         VALUES (:sysAccount, :account, :assetCode, :negDiff,
                 0, 0, 'system_reconciliation', :idempKey, :meta, NOW())`,
        {
          replacements: {
            sysAccount: SYSTEM_RECONCILIATION_ACCOUNT,
            account: row.account_id,
            assetCode: row.asset_code,
            negDiff: -diff,
            idempKey: idempKeySys,
            meta
          }
        }
      )

      console.log(
        `  ✅ account=${row.account_id} asset=${row.asset_code} diff=${diff > 0 ? '+' : ''}${diff}`
      )
    }

    // 验证：全局守恒
    const [globalCheck] = await queryInterface.sequelize.query(
      `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) as global_sum
       FROM asset_transactions WHERE COALESCE(is_invalid, 0) = 0
       GROUP BY asset_code`
    )

    console.log('\n调平后全局守恒:')
    let allOk = true
    globalCheck.forEach(r => {
      const ok = parseInt(r.global_sum) === 0
      if (!ok) allOk = false
      console.log(`  ${ok ? '✅' : '⚠️'} ${r.asset_code}: SUM=${r.global_sum}`)
    })

    // 验证：余额一致性
    const [remaining] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM (
        SELECT b.account_id FROM account_asset_balances b
        LEFT JOIN (
          SELECT account_id, asset_code, SUM(delta_amount) as flow_sum
          FROM asset_transactions WHERE COALESCE(is_invalid, 0) = 0
          GROUP BY account_id, asset_code
        ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
        WHERE CAST(b.available_amount + b.frozen_amount AS SIGNED) !=
              CAST(COALESCE(t.flow_sum, 0) AS SIGNED)
      ) x`
    )

    console.log(`\n余额/流水不一致剩余数: ${remaining[0].cnt}`)

    if (allOk && remaining[0].cnt === 0) {
      console.log('✅ 全局守恒 + 余额一致性检查全部通过')
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ 此迁移为数据修复，回滚需要删除 system_reconciliation 记录')
    await queryInterface.sequelize.query(
      `DELETE FROM asset_transactions
       WHERE business_type = 'system_reconciliation'
         AND idempotency_key LIKE 'sys_reconcile_%'`
    )
  }
}
