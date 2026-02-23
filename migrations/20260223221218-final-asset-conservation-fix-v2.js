'use strict'

/**
 * 资产守恒修复 V2 — 兜底补平（追加修正）
 *
 * 原因：V1 修复（20260223192128）执行后全部 SUM=0，
 * 但后续测试脚本运行和业务操作又引入了新的不平衡记录
 * （test_topup / test_setup / test_grant 无 counterpart，
 *  以及 order_settle / listing_transfer 缺失 counterpart）。
 *
 * 本迁移在 V1 基础上追加修正记录，使用 _v2 后缀区分。
 * 幂等：idempotency_key 包含版本号，不与 V1 冲突。
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      const [residuals] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) AS residual
         FROM asset_transactions
         WHERE (is_invalid IS NULL OR is_invalid = 0)
         GROUP BY asset_code
         HAVING SUM(delta_amount) != 0`,
        { transaction }
      )

      if (residuals.length === 0) {
        console.log('✅ 所有资产已平衡，无需修复')
        await transaction.commit()
        return
      }

      console.log(`📊 发现 ${residuals.length} 种资产存在残差:`)
      residuals.forEach(r => console.log(`   ${r.asset_code}: ${r.residual}`))

      const SYSTEM_RESERVE_ID = 12
      const now = new Date()

      for (const { asset_code, residual } of residuals) {
        const delta = -Number(residual)
        const idemKey = `system_reconciliation_final_v2:${asset_code}:20260223`

        const [existing] = await queryInterface.sequelize.query(
          `SELECT asset_transaction_id FROM asset_transactions WHERE idempotency_key = :key LIMIT 1`,
          { replacements: { key: idemKey }, transaction }
        )
        if (existing.length > 0) {
          console.log(`⏭️  ${asset_code}: 已存在 V2 修复记录，跳过`)
          continue
        }

        const [lastBal] = await queryInterface.sequelize.query(
          `SELECT balance_after FROM asset_transactions
           WHERE account_id = :acct AND asset_code = :ac AND (is_invalid IS NULL OR is_invalid = 0)
           ORDER BY asset_transaction_id DESC LIMIT 1`,
          { replacements: { acct: SYSTEM_RESERVE_ID, ac: asset_code }, transaction }
        )
        const balanceBefore = lastBal.length > 0 ? Number(lastBal[0].balance_after) : 0

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
             (account_id, asset_code, delta_amount, balance_before, balance_after,
              frozen_amount_change, business_type, idempotency_key,
              counterpart_account_id, is_invalid, is_test_data, created_at)
           VALUES
             (:acct, :ac, :delta, :bb, :ba,
              0, 'system_reconciliation_final', :key,
              :acct, 0, 0, :now)`,
          {
            replacements: {
              acct: SYSTEM_RESERVE_ID, ac: asset_code, delta,
              bb: balanceBefore, ba: balanceBefore + delta,
              key: idemKey, now
            },
            transaction
          }
        )
        console.log(`✅ ${asset_code}: delta=${delta}（残差 ${residual} → 0）`)

        // 同步 account_asset_balances
        const [balRow] = await queryInterface.sequelize.query(
          `SELECT account_asset_balance_id FROM account_asset_balances
           WHERE account_id = :acct AND asset_code = :ac LIMIT 1`,
          { replacements: { acct: SYSTEM_RESERVE_ID, ac: asset_code }, transaction }
        )
        if (balRow.length > 0) {
          await queryInterface.sequelize.query(
            `UPDATE account_asset_balances SET available_amount = available_amount + :delta, updated_at = :now
             WHERE account_asset_balance_id = :bid`,
            { replacements: { delta, now, bid: balRow[0].account_asset_balance_id }, transaction }
          )
        } else {
          await queryInterface.sequelize.query(
            `INSERT INTO account_asset_balances (account_id, asset_code, available_amount, frozen_amount, created_at, updated_at)
             VALUES (:acct, :ac, :delta, 0, :now, :now)`,
            { replacements: { acct: SYSTEM_RESERVE_ID, ac: asset_code, delta, now }, transaction }
          )
        }
      }

      // 验证
      const [verify] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) AS total FROM asset_transactions
         WHERE (is_invalid IS NULL OR is_invalid = 0) GROUP BY asset_code HAVING SUM(delta_amount) != 0`,
        { transaction }
      )
      if (verify.length > 0) {
        console.error('❌ 修复后仍有残差:', verify)
        throw new Error('资产守恒修复 V2 验证失败')
      }
      console.log('✅ V2 验证通过：所有资产 SUM=0')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM asset_transactions WHERE idempotency_key LIKE 'system_reconciliation_final_v2:%:20260223'`
    )
  }
}
