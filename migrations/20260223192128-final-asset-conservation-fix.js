'use strict'

/**
 * 资产守恒最终修复迁移（P0 — 兜底补平）
 *
 * 背景：
 *   经过多轮数据治理迁移（Phase1~Phase3、counterpart回填、余额调整等 406 次迁移），
 *   三种资产仍存在小额残差：
 *     - DIAMOND  +1,240
 *     - POINTS   +878,558
 *     - red_shard +655
 *   残差来源：历史遗留的 test_topup 无 counterpart、多轮修正叠加误差、
 *   opening_balance 配对异常等，逐笔定位成本高且收益有限。
 *
 * 修复策略（与支付宝/银行"悬挂科目冲账"一致）：
 *   为每个残差资产创建 **一条** system_reconciliation_final 记录，
 *   delta = -residual，归属 SYSTEM_RESERVE（account_id=12）。
 *   该记录本身就是"缺失 counterpart 的聚合替代"——
 *   SUM(delta_amount) 在插入后恰好归零。
 *
 * 幂等性：通过 idempotency_key 唯一约束保证可重复运行不会重复插入。
 *
 * 验证方式：
 *   node scripts/reconcile-items.js
 *   期望输出：所有 asset_code SUM=0
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 查询当前残差
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

      const SYSTEM_RESERVE_ACCOUNT_ID = 12
      const now = new Date()

      for (const { asset_code, residual } of residuals) {
        const delta = -Number(residual)
        const idemKey = `system_reconciliation_final:${asset_code}:20260223`

        // 幂等检查：如果已经存在同 key 的记录则跳过
        const [existing] = await queryInterface.sequelize.query(
          `SELECT asset_transaction_id FROM asset_transactions
           WHERE idempotency_key = :key LIMIT 1`,
          { replacements: { key: idemKey }, transaction }
        )
        if (existing.length > 0) {
          console.log(`⏭️  ${asset_code}: 已存在修复记录，跳过`)
          continue
        }

        // 获取 SYSTEM_RESERVE 在该资产上的最新余额
        const [lastBal] = await queryInterface.sequelize.query(
          `SELECT balance_after FROM asset_transactions
           WHERE account_id = :acct AND asset_code = :ac
             AND (is_invalid IS NULL OR is_invalid = 0)
           ORDER BY asset_transaction_id DESC LIMIT 1`,
          { replacements: { acct: SYSTEM_RESERVE_ACCOUNT_ID, ac: asset_code }, transaction }
        )
        const balanceBefore = lastBal.length > 0 ? Number(lastBal[0].balance_after) : 0
        const balanceAfter = balanceBefore + delta

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
              acct: SYSTEM_RESERVE_ACCOUNT_ID,
              ac: asset_code,
              delta,
              bb: balanceBefore,
              ba: balanceAfter,
              key: idemKey,
              now
            },
            transaction
          }
        )

        console.log(`✅ ${asset_code}: 插入修复记录 delta=${delta}（残差 ${residual} → 0）`)
      }

      // 2. 验证修复结果
      const [verify] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) AS total
         FROM asset_transactions
         WHERE (is_invalid IS NULL OR is_invalid = 0)
         GROUP BY asset_code
         HAVING SUM(delta_amount) != 0`,
        { transaction }
      )

      if (verify.length > 0) {
        console.error('❌ 修复后仍有残差:', verify)
        throw new Error('资产守恒修复验证失败')
      }

      console.log('✅ 验证通过：所有资产 SUM=0')

      // 3. 同步更新 SYSTEM_RESERVE 在 account_asset_balances 中的余额
      for (const { asset_code, residual } of residuals) {
        const delta = -Number(residual)
        const [balRow] = await queryInterface.sequelize.query(
          `SELECT account_asset_balance_id, available_amount FROM account_asset_balances
           WHERE account_id = :acct AND asset_code = :ac LIMIT 1`,
          { replacements: { acct: SYSTEM_RESERVE_ACCOUNT_ID, ac: asset_code }, transaction }
        )

        if (balRow.length > 0) {
          await queryInterface.sequelize.query(
            `UPDATE account_asset_balances
             SET available_amount = available_amount + :delta, updated_at = :now
             WHERE account_asset_balance_id = :bid`,
            { replacements: { delta, now, bid: balRow[0].account_asset_balance_id }, transaction }
          )
        } else {
          await queryInterface.sequelize.query(
            `INSERT INTO account_asset_balances
               (account_id, asset_code, available_amount, frozen_amount, created_at, updated_at)
             VALUES (:acct, :ac, :delta, 0, :now, :now)`,
            { replacements: { acct: SYSTEM_RESERVE_ACCOUNT_ID, ac: asset_code, delta, now }, transaction }
          )
        }
        console.log(`✅ ${asset_code}: SYSTEM_RESERVE 余额已同步`)
      }

      await transaction.commit()
      console.log('🎉 资产守恒最终修复完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const [records] = await queryInterface.sequelize.query(
        `SELECT asset_transaction_id, account_id, asset_code, delta_amount
         FROM asset_transactions
         WHERE business_type = 'system_reconciliation_final'
           AND idempotency_key LIKE 'system_reconciliation_final:%:20260223'`,
        { transaction }
      )

      for (const r of records) {
        await queryInterface.sequelize.query(
          `UPDATE account_asset_balances
           SET available_amount = available_amount - (:delta), updated_at = NOW()
           WHERE account_id = :acct AND asset_code = :ac`,
          { replacements: { delta: r.delta_amount, acct: r.account_id, ac: r.asset_code }, transaction }
        )
      }

      await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE business_type = 'system_reconciliation_final'
           AND idempotency_key LIKE 'system_reconciliation_final:%:20260223'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成：已删除 system_reconciliation_final 记录')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
