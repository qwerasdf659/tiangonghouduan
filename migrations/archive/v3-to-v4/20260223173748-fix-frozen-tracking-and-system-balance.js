/**
 * 修复 frozen_amount_change 追踪缺口 + 系统账户余额
 *
 * 三步修复策略：
 *   1. 用户账户：插入校正流水(delta+frozen) + SYSTEM_RESERVE counterpart
 *   2. 系统账户余额重置为 0
 *   3. Final sweep：消除校正过程中可能引入的全局残差
 *
 * @module migrations/20260223173748-fix-frozen-tracking-and-system-balance
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 修复 frozen 追踪缺口和系统账户余额...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 第一步：用户账户校正
      // ============================================================
      const [userMismatches] = await queryInterface.sequelize.query(
        `SELECT 
           b.account_id, b.asset_code,
           CAST(b.available_amount - COALESCE(t.sum_delta, 0) AS SIGNED) AS avail_diff,
           CAST(b.frozen_amount - COALESCE(t.sum_frozen, 0) AS SIGNED) AS frozen_diff
         FROM account_asset_balances b
         INNER JOIN accounts a ON b.account_id = a.account_id AND a.account_type = 'user'
         LEFT JOIN (
           SELECT account_id, asset_code,
             SUM(delta_amount) AS sum_delta,
             SUM(COALESCE(frozen_amount_change, 0)) AS sum_frozen
           FROM asset_transactions WHERE (is_invalid IS NULL OR is_invalid = 0)
           GROUP BY account_id, asset_code
         ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
         WHERE CAST(b.available_amount - COALESCE(t.sum_delta, 0) AS SIGNED) != 0
            OR CAST(b.frozen_amount - COALESCE(t.sum_frozen, 0) AS SIGNED) != 0`,
        { transaction }
      )

      console.log(`  📊 用户账户不一致: ${userMismatches.length} 个`)

      for (const m of userMismatches) {
        const availDiff = Number(m.avail_diff)
        const frozenDiff = Number(m.frozen_diff)
        if (availDiff === 0 && frozenDiff === 0) continue

        const idempKey = `frozen_fix_${m.account_id}_${m.asset_code}_20260223`

        // 主校正记录
        await queryInterface.sequelize.query(
          `INSERT IGNORE INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, frozen_amount_change,
            business_type, idempotency_key, is_invalid, meta, created_at)
           VALUES (?, 12, ?, ?, 0, 0, ?, 'frozen_tracking_correction', ?, false, ?, NOW())`,
          {
            replacements: [
              m.account_id, m.asset_code, availDiff, frozenDiff, idempKey,
              JSON.stringify({ avail_fix: availDiff, frozen_fix: frozenDiff })
            ],
            transaction
          }
        )

        // SYSTEM_RESERVE counterpart（反向 delta 维持全局守恒）
        if (availDiff !== 0) {
          await queryInterface.sequelize.query(
            `INSERT IGNORE INTO asset_transactions
             (account_id, counterpart_account_id, asset_code, delta_amount,
              balance_before, balance_after, frozen_amount_change,
              business_type, idempotency_key, is_invalid, meta, created_at)
             VALUES (12, ?, ?, ?, 0, 0, 0, 'frozen_tracking_correction_cp', ?, false, ?, NOW())`,
            {
              replacements: [
                m.account_id, m.asset_code, -availDiff,
                `${idempKey}:cp`, JSON.stringify({ counterpart_of: idempKey })
              ],
              transaction
            }
          )
        }

        console.log(`  🔧 account=${m.account_id} ${m.asset_code}: delta${availDiff >= 0 ? '+' : ''}${availDiff} frozen${frozenDiff >= 0 ? '+' : ''}${frozenDiff}`)
      }

      // ============================================================
      // 第二步：重置系统账户余额
      // ============================================================
      console.log('\n📌 重置系统账户余额...')
      const [sysReset] = await queryInterface.sequelize.query(
        `UPDATE account_asset_balances b
         INNER JOIN accounts a ON b.account_id = a.account_id AND a.account_type = 'system'
         SET b.available_amount = 0, b.frozen_amount = 0
         WHERE b.available_amount != 0 OR b.frozen_amount != 0`,
        { transaction }
      )
      console.log(`  🔧 重置 ${sysReset.affectedRows || 0} 条`)

      // ============================================================
      // 第三步：Final sweep — 消除任何残留的全局不平衡
      // ============================================================
      console.log('\n📌 Final sweep...')
      const [residuals] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) as total
         FROM asset_transactions WHERE (is_invalid IS NULL OR is_invalid = 0)
         GROUP BY asset_code HAVING SUM(delta_amount) != 0`,
        { transaction }
      )

      for (const r of residuals) {
        const adj = -Number(r.total)
        const sweepKey = `final_sweep_${r.asset_code}_20260223`
        await queryInterface.sequelize.query(
          `INSERT IGNORE INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, frozen_amount_change,
            business_type, idempotency_key, is_invalid, meta, created_at)
           VALUES (12, 2, ?, ?, 0, 0, 0, 'system_balance_adjustment', ?, false, ?, NOW())`,
          {
            replacements: [
              r.asset_code, adj, sweepKey,
              JSON.stringify({ reason: 'final_sweep', residual: Number(r.total), adjustment: adj })
            ],
            transaction
          }
        )
        console.log(`  🧹 ${r.asset_code}: sweep ${adj > 0 ? '+' : ''}${adj}`)
      }

      // ============================================================
      // 验证
      // ============================================================
      console.log('\n📌 最终验证...')

      const [globalFinal] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) as total
         FROM asset_transactions WHERE (is_invalid IS NULL OR is_invalid = 0)
         GROUP BY asset_code HAVING SUM(delta_amount) != 0`,
        { transaction }
      )
      if (globalFinal.length > 0) {
        throw new Error(`全局守恒仍有问题: ${globalFinal.map(r => `${r.asset_code}=${r.total}`).join(', ')}`)
      }
      console.log('  ✅ 全局守恒: PASS')

      const [userRemain] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as cnt
         FROM account_asset_balances b
         INNER JOIN accounts a ON b.account_id = a.account_id AND a.account_type = 'user'
         LEFT JOIN (
           SELECT account_id, asset_code,
             SUM(delta_amount) AS sd, SUM(COALESCE(frozen_amount_change, 0)) AS sf
           FROM asset_transactions WHERE (is_invalid IS NULL OR is_invalid = 0)
           GROUP BY account_id, asset_code
         ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
         WHERE CAST(b.available_amount - COALESCE(t.sd, 0) AS SIGNED) != 0
            OR CAST(b.frozen_amount - COALESCE(t.sf, 0) AS SIGNED) != 0`,
        { transaction }
      )
      console.log(`  ✅ 用户余额一致: ${userRemain[0].cnt} 个剩余`)

      await transaction.commit()
      console.log('\n🎉 完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE business_type IN ('frozen_tracking_correction', 'frozen_tracking_correction_cp')
           AND idempotency_key LIKE 'frozen_fix_%_20260223%'`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE business_type = 'system_balance_adjustment'
           AND idempotency_key LIKE 'final_sweep_%_20260223'`,
        { transaction }
      )
      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
