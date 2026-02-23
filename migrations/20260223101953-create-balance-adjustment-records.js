'use strict'

/**
 * 综合数据治理：修复余额一致性 + 全局守恒
 *
 * Phase A：修复各账户余额与流水不一致（data_migration 调整流水）
 *   公式：(available + frozen) = SUM(delta + COALESCE(frozen_change, 0))
 *   调整记录成对创建（主记录 + SYSTEM_RESERVE 对手方），不影响全局守恒
 *
 * Phase B：修复全局守恒残差（system_reconciliation 单笔调整）
 *   原因：历史数据中 test 数据/peer-to-peer counterpart/orphan 记录导致的零散差异
 *   在 SYSTEM_RESERVE 上创建单笔调整使 SUM(delta + frozen_change) = 0
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== Phase A：修复各账户余额一致性 ==========
      console.log('📊 Phase A：修复各账户余额一致性...')

      const [mismatches] = await queryInterface.sequelize.query(`
        SELECT 
          b.account_id, b.asset_code,
          CAST(b.available_amount + b.frozen_amount AS SIGNED) AS current_balance,
          CAST(COALESCE(t.net_flow, 0) AS SIGNED) AS transaction_net,
          CAST((b.available_amount + b.frozen_amount) - COALESCE(t.net_flow, 0) AS SIGNED) AS difference
        FROM account_asset_balances b
        LEFT JOIN (
          SELECT account_id, asset_code, 
            SUM(delta_amount + COALESCE(frozen_amount_change, 0)) AS net_flow
          FROM asset_transactions WHERE (is_invalid IS NULL OR is_invalid = 0)
          GROUP BY account_id, asset_code
        ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
        HAVING difference != 0
      `, { transaction })

      console.log(`  发现 ${mismatches.length} 个不一致账户`)

      for (const m of mismatches) {
        const diff = Number(m.difference)
        const key = `data_migration:v3:${m.account_id}:${m.asset_code}`

        const [[exists]] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
          { replacements: { key }, transaction }
        )
        if (exists.cnt > 0) continue

        const meta = JSON.stringify({
          type: 'balance_reconciliation_v3',
          balance: Number(m.current_balance),
          tx_net: Number(m.transaction_net),
          diff, date: new Date().toISOString()
        }).replace(/'/g, "\\'")

        // 主记录
        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions 
            (account_id, counterpart_account_id, asset_code, delta_amount, 
             balance_before, balance_after, business_type, idempotency_key, meta, created_at)
          VALUES (${m.account_id}, 12, '${m.asset_code}', ${diff}, 
             ${Number(m.transaction_net)}, ${Number(m.current_balance)}, 
             'data_migration', '${key}', '${meta}', NOW())
        `, { transaction })

        // 对手方
        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions 
            (account_id, counterpart_account_id, asset_code, delta_amount, 
             balance_before, balance_after, business_type, idempotency_key, meta, created_at)
          VALUES (12, ${m.account_id}, '${m.asset_code}', ${-diff}, 
             0, 0, 'data_migration_counterpart', '${key}:counterpart', 
             '${JSON.stringify({ counterpart_of: key }).replace(/'/g, "\\'")}', NOW())
        `, { transaction })

        console.log(`  ✅ 账户 ${m.account_id}/${m.asset_code}: ${diff > 0 ? '+' : ''}${diff}`)
      }

      // ========== Phase B：修复全局守恒残差 ==========
      console.log('\n📊 Phase B：修复全局守恒残差...')

      const [residuals] = await queryInterface.sequelize.query(`
        SELECT asset_code,
          CAST(SUM(delta_amount + COALESCE(frozen_amount_change, 0)) AS SIGNED) AS residual
        FROM asset_transactions WHERE (is_invalid IS NULL OR is_invalid = 0)
        GROUP BY asset_code HAVING residual != 0
      `, { transaction })

      for (const r of residuals) {
        const residual = Number(r.residual)
        const key = `system_reconciliation:v1:${r.asset_code}`

        const [[exists]] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
          { replacements: { key }, transaction }
        )
        if (exists.cnt > 0) continue

        // 在 SYSTEM_RESERVE 上创建单笔调整记录（使全局 SUM = 0）
        const meta = JSON.stringify({
          type: 'global_conservation_adjustment',
          residual, reason: '历史数据/测试数据导致的全局守恒残差修正',
          date: new Date().toISOString()
        }).replace(/'/g, "\\'")

        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions 
            (account_id, asset_code, delta_amount, 
             balance_before, balance_after, business_type, idempotency_key, meta, created_at)
          VALUES (12, '${r.asset_code}', ${-residual}, 
             0, 0, 'system_reconciliation', '${key}', '${meta}', NOW())
        `, { transaction })

        console.log(`  ✅ ${r.asset_code}: 残差 ${residual > 0 ? '+' : ''}${residual} → 调整 ${-residual}`)
      }

      await transaction.commit()
      console.log('✅ 综合数据治理完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM asset_transactions 
      WHERE business_type IN ('data_migration', 'data_migration_counterpart', 'system_reconciliation')
        AND (idempotency_key LIKE 'data_migration:v3:%' OR idempotency_key LIKE 'system_reconciliation:v1:%')
    `)
  }
}
