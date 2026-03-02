'use strict'

/**
 * 清理第二轮重复 opening_balance 记录 + 重新调平余额/流水差异
 *
 * 前次迁移 step-2 错误地为已有 opening_balance 的账户又创建了一份，
 * 导致 25 组重复和 8 个用户账户余额不一致。
 *
 * 修复步骤：
 * 1. 删除重复的 opening_balance（每组只保留最早一条）
 * 2. 删除重复的 opening_balance_counterpart
 * 3. 删除之前的 system_reconciliation 调平记录（因为基于错误数据）
 * 4. 重新调平余额/流水差异
 * 5. 重新调平全局守恒
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // === 步骤 1: 清理重复 opening_balance ===
    const [dupOB] = await queryInterface.sequelize.query(
      `SELECT account_id, asset_code, COUNT(*) as cnt,
              MIN(asset_transaction_id) as keep_id
       FROM asset_transactions
       WHERE business_type = 'opening_balance'
       GROUP BY account_id, asset_code
       HAVING cnt > 1`
    )

    let totalDelOB = 0
    for (const row of dupOB) {
      const [deleted] = await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE business_type = 'opening_balance'
           AND account_id = :accountId AND asset_code = :assetCode
           AND asset_transaction_id != :keepId`,
        { replacements: { accountId: row.account_id, assetCode: row.asset_code, keepId: row.keep_id } }
      )
      totalDelOB += (deleted.affectedRows || 0)
    }
    console.log(`步骤1: 清理 ${totalDelOB} 条重复 opening_balance`)

    // === 步骤 2: 清理重复 opening_balance_counterpart ===
    const [dupCP] = await queryInterface.sequelize.query(
      `SELECT account_id, asset_code, COUNT(*) as cnt,
              MIN(asset_transaction_id) as keep_id
       FROM asset_transactions
       WHERE business_type = 'opening_balance_counterpart'
       GROUP BY account_id, asset_code
       HAVING cnt > 1`
    )

    let totalDelCP = 0
    for (const row of dupCP) {
      const [deleted] = await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE business_type = 'opening_balance_counterpart'
           AND account_id = :accountId AND asset_code = :assetCode
           AND asset_transaction_id != :keepId`,
        { replacements: { accountId: row.account_id, assetCode: row.asset_code, keepId: row.keep_id } }
      )
      totalDelCP += (deleted.affectedRows || 0)
    }
    console.log(`步骤2: 清理 ${totalDelCP} 条重复 opening_balance_counterpart`)

    // === 步骤 3: 删除旧的 system_reconciliation（将重新计算） ===
    const [delRecon] = await queryInterface.sequelize.query(
      `DELETE FROM asset_transactions
       WHERE business_type = 'system_reconciliation'
         AND idempotency_key LIKE 'sys_reconcile_%'`
    )
    console.log(`步骤3: 清理 ${delRecon.affectedRows || 0} 条旧调平记录`)

    // === 步骤 4: 重新调平余额/流水差异 ===
    const SYSTEM_ACCOUNT = 2
    const [mismatches] = await queryInterface.sequelize.query(
      `SELECT b.account_id, b.asset_code,
              CAST(b.available_amount + b.frozen_amount AS DECIMAL(20,2)) as total_balance,
              CAST(COALESCE(t.flow_sum, 0) AS DECIMAL(20,2)) as flow_sum,
              CAST((b.available_amount + b.frozen_amount) - COALESCE(t.flow_sum, 0) AS DECIMAL(20,2)) as diff
       FROM account_asset_balances b
       LEFT JOIN (
         SELECT account_id, asset_code, SUM(delta_amount) as flow_sum
         FROM asset_transactions WHERE COALESCE(is_invalid, 0) = 0
         GROUP BY account_id, asset_code
       ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
       WHERE CAST(b.available_amount + b.frozen_amount AS SIGNED) !=
             CAST(COALESCE(t.flow_sum, 0) AS SIGNED)`
    )

    if (mismatches.length > 0) {
      console.log(`步骤4: 调平 ${mismatches.length} 个账户余额/流水差异...`)
      for (const row of mismatches) {
        const diff = Number(row.diff)
        if (diff === 0) continue

        const idempKeyUser = `sys_reconcile_v2_${row.account_id}_${row.asset_code}`
        const idempKeySys = `sys_reconcile_v2_cp_${row.account_id}_${row.asset_code}`

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key,
            meta, created_at)
           VALUES (:account, :sysAccount, :assetCode, :diff,
                   :flowBefore, :balance, 'system_reconciliation', :idempKey,
                   :meta, NOW())`,
          {
            replacements: {
              account: row.account_id, sysAccount: SYSTEM_ACCOUNT,
              assetCode: row.asset_code, diff,
              flowBefore: Number(row.flow_sum), balance: Number(row.total_balance),
              idempKey: idempKeyUser,
              meta: JSON.stringify({ source: 'reconciliation_v2', diff })
            }
          }
        )

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key,
            meta, created_at)
           VALUES (:sysAccount, :account, :assetCode, :negDiff,
                   0, 0, 'system_reconciliation', :idempKey,
                   :meta, NOW())`,
          {
            replacements: {
              sysAccount: SYSTEM_ACCOUNT, account: row.account_id,
              assetCode: row.asset_code, negDiff: -diff,
              idempKey: idempKeySys,
              meta: JSON.stringify({ source: 'reconciliation_v2', diff: -diff })
            }
          }
        )
        console.log(`  account=${row.account_id} asset=${row.asset_code} diff=${diff > 0 ? '+' : ''}${diff}`)
      }
    } else {
      console.log('步骤4: 余额/流水已一致，无需调平')
    }

    // === 步骤 5: 重新调平全局守恒 ===
    // 先删除旧的全局调平
    await queryInterface.sequelize.query(
      `DELETE FROM asset_transactions WHERE idempotency_key LIKE 'historical_reconciliation_%'`
    )

    const [globalSums] = await queryInterface.sequelize.query(
      `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) as global_sum
       FROM asset_transactions WHERE COALESCE(is_invalid, 0) = 0
       GROUP BY asset_code HAVING SUM(delta_amount) != 0`
    )

    if (globalSums.length > 0) {
      console.log(`步骤5: 调平 ${globalSums.length} 种资产全局守恒...`)
      for (const row of globalSums) {
        const adj = -parseInt(row.global_sum)
        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key,
            meta, created_at)
           VALUES (1, NULL, :assetCode, :adj, 0, 0, 'historical_reconciliation',
                   :idempKey, :meta, NOW())`,
          {
            replacements: {
              assetCode: row.asset_code, adj,
              idempKey: `historical_reconciliation_${row.asset_code}`,
              meta: JSON.stringify({ source: 'global_conservation_v2', original_sum: parseInt(row.global_sum) })
            }
          }
        )
        console.log(`  ${row.asset_code}: SUM=${row.global_sum} → 调平 ${adj > 0 ? '+' : ''}${adj}`)
      }
    }

    // === 最终验证 ===
    const [finalGlobal] = await queryInterface.sequelize.query(
      `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) as s
       FROM asset_transactions WHERE COALESCE(is_invalid,0)=0
       GROUP BY asset_code`
    )
    const allZero = finalGlobal.every(r => parseInt(r.s) === 0)
    console.log(`\n全局守恒: ${allZero ? '✅ 7/7 SUM=0' : '❌ 有非零'}`)

    const [finalBal] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM (
        SELECT b.account_id FROM account_asset_balances b
        LEFT JOIN (SELECT account_id, asset_code, SUM(delta_amount) as fs
                   FROM asset_transactions WHERE COALESCE(is_invalid,0)=0
                   GROUP BY account_id, asset_code) t
        ON b.account_id=t.account_id AND b.asset_code=t.asset_code
        WHERE b.account_id NOT IN (1,2,3,4,12,15,239)
          AND CAST(b.available_amount+b.frozen_amount AS SIGNED) != CAST(COALESCE(t.fs,0) AS SIGNED)
      ) x`
    )
    console.log(`用户余额一致性: ${finalBal[0].cnt === 0 ? '✅ 全部一致' : '❌ ' + finalBal[0].cnt + ' 个不一致'}`)

    const [finalDupOB] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM (
        SELECT account_id FROM asset_transactions
        WHERE business_type='opening_balance'
        GROUP BY account_id, asset_code HAVING COUNT(*)>1
      ) x`
    )
    console.log(`opening_balance 重复: ${finalDupOB[0].cnt === 0 ? '✅ 无重复' : '❌ ' + finalDupOB[0].cnt + ' 组'}`)
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DELETE FROM asset_transactions
       WHERE idempotency_key LIKE 'sys_reconcile_v2_%'
          OR idempotency_key LIKE 'historical_reconciliation_%'`
    )
  }
}
