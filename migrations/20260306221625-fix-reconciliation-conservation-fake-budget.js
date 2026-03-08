'use strict'

/**
 * 迁移：修复三类数据一致性问题
 *
 * 1. lottery_draws 中 budget_points_after 的虚假数据（6条记录）
 * 2. POINTS/red_shard 全局守恒偏差（+100/+50）
 * 3. 用户账户 available_amount 与流水不一致
 *
 * 修复策略遵循项目已有对账模式（reconcile-items.js）：
 * - 守恒修复：在 SYSTEM_RESERVE(id=12) 补录单边调平流水
 * - 余额修复：主记录 + SYSTEM_RESERVE 对手方配对流水
 * - 修复顺序：lottery_draws → 守恒 → 用户余额 → 系统余额
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 阶段 1：修复 lottery_draws 虚假 budget_points_after
      // ============================================================
      const [, fakeMeta] = await queryInterface.sequelize.query(
        `UPDATE lottery_draws
         SET budget_points_after = budget_points_before,
             updated_at = NOW()
         WHERE budget_points_before IS NOT NULL
           AND budget_points_after != budget_points_before
           AND lottery_draw_id IN (
             SELECT lottery_draw_id FROM (
               SELECT ld.lottery_draw_id
               FROM lottery_draws ld
               WHERE ld.budget_points_before IS NOT NULL
                 AND ld.budget_points_after != ld.budget_points_before
                 AND NOT EXISTS (
                   SELECT 1 FROM asset_transactions at2
                   WHERE at2.business_type = 'lottery_budget_deduct'
                     AND at2.idempotency_key = ld.idempotency_key
                 )
             ) AS subq
           )`,
        { transaction }
      )
      console.log(`  ✅ 阶段1: 修复 lottery_draws 虚假 budget_points_after: ${fakeMeta?.affectedRows || 0} 条`)

      // ============================================================
      // 阶段 2：修复全局守恒偏差（SYSTEM_RESERVE account_id=12）
      // ============================================================
      const RESERVE_ACCOUNT_ID = 12
      const [conservationResults] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) AS total_net
         FROM asset_transactions WHERE is_invalid = 0
         GROUP BY asset_code
         HAVING SUM(delta_amount) != 0`,
        { transaction }
      )

      for (const r of conservationResults) {
        const drift = Number(r.total_net)
        const key = `migration_conservation_fix:${r.asset_code}:20260307`

        const [[existing]] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
          { replacements: { key }, transaction }
        )
        if (Number(existing.cnt) > 0) continue

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, asset_code, delta_amount, balance_before, balance_after,
            business_type, idempotency_key, frozen_amount_change, meta, is_invalid, created_at)
           VALUES (:acct, :asset, :adj, 0, 0, 'system_reconciliation', :key, 0, :meta, 0, NOW())`,
          {
            replacements: {
              acct: RESERVE_ACCOUNT_ID,
              asset: r.asset_code,
              adj: -drift,
              key,
              meta: JSON.stringify({
                type: 'migration_conservation_fix',
                residual: drift,
                description: `${r.asset_code} 全局守恒偏差 ${drift > 0 ? '+' : ''}${drift}，补录 ${-drift} 调平`
              })
            },
            transaction
          }
        )
        console.log(`  ✅ 阶段2: ${r.asset_code} 守恒修复: drift=${drift}, 补录 ${-drift}`)
      }

      // ============================================================
      // 阶段 3：修复用户账户余额不一致（配对流水）
      // ============================================================
      const [userMismatches] = await queryInterface.sequelize.query(
        `SELECT
           b.account_id, b.asset_code,
           CAST(b.available_amount AS SIGNED) + CAST(b.frozen_amount AS SIGNED) AS current_total,
           CAST(COALESCE(t.net, 0) AS SIGNED) AS calculated,
           CAST((b.available_amount + b.frozen_amount) - COALESCE(t.net, 0) AS SIGNED) AS diff
         FROM account_asset_balances b
         INNER JOIN accounts a ON b.account_id = a.account_id AND a.account_type = 'user'
         LEFT JOIN (
           SELECT account_id, asset_code,
             SUM(delta_amount + COALESCE(frozen_amount_change, 0)) AS net
           FROM asset_transactions
           WHERE (is_invalid IS NULL OR is_invalid = 0)
           GROUP BY account_id, asset_code
         ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
         WHERE CAST((b.available_amount + b.frozen_amount) - COALESCE(t.net, 0) AS SIGNED) != 0`,
        { transaction }
      )

      let userFixed = 0
      for (const m of userMismatches) {
        const diff = Number(m.diff)
        if (diff === 0) continue

        const key = `migration_balance_recon:${m.account_id}:${m.asset_code}:20260307`
        const [[exists]] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
          { replacements: { key }, transaction }
        )
        if (Number(exists.cnt) > 0) continue

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key,
            frozen_amount_change, meta, is_invalid, created_at)
           VALUES (:acct, :reserve, :asset, :diff, :calc, :current, 'data_migration', :key, 0, :meta, 0, NOW())`,
          {
            replacements: {
              acct: m.account_id,
              reserve: RESERVE_ACCOUNT_ID,
              asset: m.asset_code,
              diff,
              calc: Number(m.calculated),
              current: Number(m.current_total),
              key,
              meta: JSON.stringify({
                type: 'migration_balance_reconciliation',
                current_total: Number(m.current_total),
                calculated: Number(m.calculated),
                adjustment: diff
              })
            },
            transaction
          }
        )

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key,
            frozen_amount_change, meta, is_invalid, created_at)
           VALUES (:reserve, :acct, :asset, :neg_diff, 0, 0, 'data_migration_counterpart', :ckey, 0, :meta, 0, NOW())`,
          {
            replacements: {
              reserve: RESERVE_ACCOUNT_ID,
              acct: m.account_id,
              asset: m.asset_code,
              neg_diff: -diff,
              ckey: `${key}:counterpart`,
              meta: JSON.stringify({ counterpart_of: key })
            },
            transaction
          }
        )
        userFixed++
      }
      console.log(`  ✅ 阶段3: 修复用户账户余额不一致: ${userFixed} 组配对流水`)

      // ============================================================
      // 阶段 4：修复系统账户余额（直接更新 available_amount）
      // ============================================================
      const [sysMismatches] = await queryInterface.sequelize.query(
        `SELECT
           b.account_asset_balance_id, b.account_id, b.asset_code,
           b.available_amount AS db_available,
           CAST(COALESCE(t.sum_delta, 0) - COALESCE(t.sum_frozen, 0) AS SIGNED) AS correct_available
         FROM account_asset_balances b
         INNER JOIN accounts a ON b.account_id = a.account_id AND a.account_type = 'system'
         LEFT JOIN (
           SELECT account_id, asset_code,
             SUM(delta_amount) AS sum_delta,
             SUM(COALESCE(frozen_amount_change, 0)) AS sum_frozen
           FROM asset_transactions
           WHERE (is_invalid IS NULL OR is_invalid = 0)
           GROUP BY account_id, asset_code
         ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
         WHERE CAST(b.available_amount AS SIGNED) != CAST(COALESCE(t.sum_delta, 0) - COALESCE(t.sum_frozen, 0) AS SIGNED)`,
        { transaction }
      )

      let sysFixed = 0
      for (const s of sysMismatches) {
        await queryInterface.sequelize.query(
          `UPDATE account_asset_balances
           SET available_amount = :correct, updated_at = NOW()
           WHERE account_asset_balance_id = :id`,
          {
            replacements: {
              correct: Number(s.correct_available),
              id: s.account_asset_balance_id
            },
            transaction
          }
        )
        sysFixed++
      }
      console.log(`  ✅ 阶段4: 修复系统账户余额: ${sysFixed} 条`)

      await transaction.commit()
      console.log('  ✅ 迁移事务已提交')
    } catch (error) {
      await transaction.rollback()
      console.error('  ❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE idempotency_key LIKE 'migration_conservation_fix:%:20260307%'
            OR idempotency_key LIKE 'migration_balance_recon:%:20260307%'`,
        { transaction }
      )
      console.log('  ⚠️ 已删除调平流水。lottery_draws 和系统余额需手动恢复。')
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
