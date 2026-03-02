'use strict'

/**
 * 资产守恒修复 V3 — 最终兜底补平
 *
 * 背景：V1/V2 修复后又有新的测试运行和业务操作引入不平衡。
 * V3 同时修复全局残差和用户余额一致性差异。
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 修复全局残差
      const [residuals] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) AS residual
         FROM asset_transactions
         WHERE (is_invalid IS NULL OR is_invalid = 0)
         GROUP BY asset_code
         HAVING SUM(delta_amount) != 0`,
        { transaction }
      )

      if (residuals.length === 0) {
        console.log('✅ 全局守恒已平衡')
      } else {
        console.log(`📊 ${residuals.length} 种资产存在残差`)
        const SYSTEM_RESERVE_ID = 12
        const now = new Date()

        for (const { asset_code, residual } of residuals) {
          const delta = -Number(residual)
          const idemKey = `system_reconciliation_final_v3:${asset_code}:20260224`

          const [existing] = await queryInterface.sequelize.query(
            'SELECT asset_transaction_id FROM asset_transactions WHERE idempotency_key = :key LIMIT 1',
            { replacements: { key: idemKey }, transaction }
          )
          if (existing.length > 0) { console.log(`⏭️  ${asset_code}: 已存在`); continue }

          const [lastBal] = await queryInterface.sequelize.query(
            `SELECT balance_after FROM asset_transactions
             WHERE account_id = :acct AND asset_code = :ac AND (is_invalid IS NULL OR is_invalid = 0)
             ORDER BY asset_transaction_id DESC LIMIT 1`,
            { replacements: { acct: SYSTEM_RESERVE_ID, ac: asset_code }, transaction }
          )
          const bb = lastBal.length > 0 ? Number(lastBal[0].balance_after) : 0

          await queryInterface.sequelize.query(
            `INSERT INTO asset_transactions
               (account_id, asset_code, delta_amount, balance_before, balance_after,
                frozen_amount_change, business_type, idempotency_key,
                counterpart_account_id, is_invalid, is_test_data, created_at)
             VALUES (:acct, :ac, :delta, :bb, :ba, 0, 'system_reconciliation_final', :key, :acct, 0, 0, :now)`,
            { replacements: { acct: SYSTEM_RESERVE_ID, ac: asset_code, delta, bb, ba: bb + delta, key: idemKey, now }, transaction }
          )

          // 同步余额
          const [balRow] = await queryInterface.sequelize.query(
            'SELECT account_asset_balance_id FROM account_asset_balances WHERE account_id = :acct AND asset_code = :ac LIMIT 1',
            { replacements: { acct: SYSTEM_RESERVE_ID, ac: asset_code }, transaction }
          )
          if (balRow.length > 0) {
            await queryInterface.sequelize.query(
              'UPDATE account_asset_balances SET available_amount = available_amount + :delta, updated_at = :now WHERE account_asset_balance_id = :bid',
              { replacements: { delta, now, bid: balRow[0].account_asset_balance_id }, transaction }
            )
          } else {
            await queryInterface.sequelize.query(
              'INSERT INTO account_asset_balances (account_id, asset_code, available_amount, frozen_amount, created_at, updated_at) VALUES (:acct, :ac, :delta, 0, :now, :now)',
              { replacements: { acct: SYSTEM_RESERVE_ID, ac: asset_code, delta, now }, transaction }
            )
          }
          console.log(`✅ ${asset_code}: delta=${delta}`)
        }
      }

      // 2. 验证全局守恒
      const [verify] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) AS total FROM asset_transactions
         WHERE (is_invalid IS NULL OR is_invalid = 0) GROUP BY asset_code HAVING SUM(delta_amount) != 0`,
        { transaction }
      )
      if (verify.length > 0) { throw new Error('全局守恒验证失败: ' + JSON.stringify(verify)) }
      console.log('✅ 全局守恒验证通过')

      // 3. 修复用户余额一致性差异
      const [mismatches] = await queryInterface.sequelize.query(
        `SELECT b.account_id, b.asset_code,
          CAST(COALESCE(t.sum_delta, 0) AS SIGNED) AS calc_avail,
          CAST(COALESCE(t.sum_frozen, 0) AS SIGNED) AS calc_frozen
        FROM account_asset_balances b
        INNER JOIN accounts a ON b.account_id = a.account_id AND a.account_type = 'user'
        LEFT JOIN (
          SELECT account_id, asset_code, SUM(delta_amount) AS sum_delta, SUM(COALESCE(frozen_amount_change,0)) AS sum_frozen
          FROM asset_transactions WHERE (is_invalid IS NULL OR is_invalid = 0) GROUP BY account_id, asset_code
        ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
        WHERE CAST(b.available_amount - COALESCE(t.sum_delta,0) AS SIGNED) != 0
           OR CAST(b.frozen_amount - COALESCE(t.sum_frozen,0) AS SIGNED) != 0`,
        { transaction }
      )

      for (const m of mismatches) {
        await queryInterface.sequelize.query(
          'UPDATE account_asset_balances SET available_amount = :avail, frozen_amount = :frozen, updated_at = NOW() WHERE account_id = :acct AND asset_code = :ac',
          { replacements: { avail: m.calc_avail, frozen: m.calc_frozen, acct: m.account_id, ac: m.asset_code }, transaction }
        )
        console.log(`✅ 余额修复: acct=${m.account_id} ${m.asset_code}`)
      }
      if (mismatches.length === 0) console.log('✅ 余额一致性无差异')

      await transaction.commit()
      console.log('🎉 V3 修复完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM asset_transactions WHERE idempotency_key LIKE 'system_reconciliation_final_v3:%:20260224'"
    )
  }
}
