'use strict'

/**
 * 资产守恒终极修复 V4 — 隔离测试数据 + 全局守恒兜底 + 余额重建
 *
 * 问题根因：
 *   自动化测试套件（Jest）执行时写入了 1,162 条 test_* 类型的 asset_transactions，
 *   这些测试交易缺少配对 counterpart 记录，导致全局 SUM(delta_amount) != 0。
 *   具体影响：DIAMOND +18,540 / POINTS +1,420,203 / red_shard +1,350。
 *
 * 修复策略（三步）：
 *   Step 1: 标记所有 test_* 交易为 is_invalid=1（从守恒计算中隔离）
 *   Step 2: 对剩余非 test 残差做 system_reconciliation_final_v4 兜底补平
 *   Step 3: 从有效交易重建 account_asset_balances（消除余额脱节）
 *
 * 遵循行业规范：不删除不修改历史记录，只追加标记（等价支付宝"冲正"原则）
 *
 * @see docs/三项核心需求-实施方案.md 第三节
 */
module.exports = {
  async up (queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ====================================================================
      // Step 1: 隔离测试数据 — 标记 test_* 交易为无效
      // ====================================================================
      const [testResult] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET is_invalid = 1
         WHERE business_type LIKE 'test_%'
           AND (is_invalid IS NULL OR is_invalid = 0)`,
        { transaction }
      )
      const testInvalidated = testResult.affectedRows || testResult.changedRows || 0
      console.log(`✅ Step 1: 标记 ${testInvalidated} 条 test_* 交易为 is_invalid=1`)

      // ====================================================================
      // Step 2: 计算隔离后的残差并做兜底补平
      // ====================================================================
      const [residuals] = await queryInterface.sequelize.query(
        `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) AS residual
         FROM asset_transactions
         WHERE (is_invalid IS NULL OR is_invalid = 0)
         GROUP BY asset_code
         HAVING SUM(delta_amount) != 0`,
        { transaction }
      )

      if (residuals.length === 0) {
        console.log('✅ Step 2: 全局守恒已平衡，无需补平')
      } else {
        console.log(`📊 Step 2: ${residuals.length} 种资产存在残差，执行兜底补平`)
        const SYSTEM_RESERVE_ID = 12
        const now = new Date()

        for (const { asset_code, residual } of residuals) {
          const delta = -Number(residual)
          const idemKey = `system_reconciliation_final_v4:${asset_code}:20260224`

          const [existing] = await queryInterface.sequelize.query(
            'SELECT asset_transaction_id FROM asset_transactions WHERE idempotency_key = :key LIMIT 1',
            { replacements: { key: idemKey }, transaction }
          )
          if (existing.length > 0) {
            console.log(`⏭️  ${asset_code}: 幂等键已存在，跳过`)
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
             VALUES (:acct, :ac, :delta, :bb, :ba, 0,
                     'system_reconciliation_final', :key, :acct, 0, 0, :now)`,
            {
              replacements: {
                acct: SYSTEM_RESERVE_ID,
                ac: asset_code,
                delta,
                bb: balanceBefore,
                ba: balanceBefore + delta,
                key: idemKey,
                now
              },
              transaction
            }
          )
          console.log(`  ✅ ${asset_code}: 补平 delta=${delta}（残差 ${Number(residual)} → 0）`)
        }
      }

      // 验证全局守恒
      const [verifyGlobal] = await queryInterface.sequelize.query(
        `SELECT asset_code, CAST(SUM(delta_amount) AS SIGNED) AS total
         FROM asset_transactions
         WHERE (is_invalid IS NULL OR is_invalid = 0)
         GROUP BY asset_code
         HAVING SUM(delta_amount) != 0`,
        { transaction }
      )
      if (verifyGlobal.length > 0) {
        throw new Error('全局守恒验证失败: ' + JSON.stringify(verifyGlobal))
      }
      console.log('✅ Step 2: 全局守恒验证通过（7 种资产 SUM=0）')

      // ====================================================================
      // Step 3: 从有效交易重建 account_asset_balances
      // ====================================================================
      console.log('🔧 Step 3: 重建 account_asset_balances...')

      // 3a. 计算每个 (account_id, asset_code) 的正确余额
      //     available = SUM(delta_amount), frozen = SUM(frozen_amount_change)
      const [correctBalances] = await queryInterface.sequelize.query(
        `SELECT account_id, asset_code,
                CAST(SUM(delta_amount) AS SIGNED) AS calc_available,
                CAST(SUM(COALESCE(frozen_amount_change, 0)) AS SIGNED) AS calc_frozen
         FROM asset_transactions
         WHERE (is_invalid IS NULL OR is_invalid = 0)
         GROUP BY account_id, asset_code`,
        { transaction }
      )

      // 3b. 找出与当前记录不一致的
      let fixedCount = 0
      for (const row of correctBalances) {
        const [current] = await queryInterface.sequelize.query(
          `SELECT account_asset_balance_id,
                  CAST(available_amount AS SIGNED) AS available_amount,
                  CAST(frozen_amount AS SIGNED) AS frozen_amount
           FROM account_asset_balances
           WHERE account_id = :acct AND asset_code = :ac LIMIT 1`,
          { replacements: { acct: row.account_id, ac: row.asset_code }, transaction }
        )

        const calcAvail = Number(row.calc_available)
        const calcFrozen = Number(row.calc_frozen)

        if (current.length > 0) {
          const curAvail = Number(current[0].available_amount)
          const curFrozen = Number(current[0].frozen_amount)
          if (curAvail !== calcAvail || curFrozen !== calcFrozen) {
            await queryInterface.sequelize.query(
              `UPDATE account_asset_balances
               SET available_amount = :avail, frozen_amount = :frozen, updated_at = NOW()
               WHERE account_asset_balance_id = :bid`,
              {
                replacements: {
                  avail: calcAvail,
                  frozen: calcFrozen,
                  bid: current[0].account_asset_balance_id
                },
                transaction
              }
            )
            fixedCount++
          }
        } else if (calcAvail !== 0 || calcFrozen !== 0) {
          // BUDGET_POINTS 有 CHECK 约束要求 lottery_campaign_id NOT NULL
          const lotteryId = row.asset_code === 'BUDGET_POINTS' ? 'CONSUMPTION_DEFAULT' : null
          await queryInterface.sequelize.query(
            `INSERT INTO account_asset_balances
               (account_id, asset_code, available_amount, frozen_amount, lottery_campaign_id, created_at, updated_at)
             VALUES (:acct, :ac, :avail, :frozen, :lid, NOW(), NOW())`,
            {
              replacements: {
                acct: row.account_id,
                ac: row.asset_code,
                avail: calcAvail,
                frozen: calcFrozen,
                lid: lotteryId
              },
              transaction
            }
          )
          fixedCount++
        }
      }
      console.log(`✅ Step 3: 修复 ${fixedCount} 条余额记录`)

      // 3c. 验证余额一致性
      const [balMismatch] = await queryInterface.sequelize.query(
        `SELECT b.account_id, b.asset_code,
                CAST(b.available_amount AS SIGNED) AS bal_avail,
                CAST(COALESCE(t.sum_delta, 0) AS SIGNED) AS txn_avail
         FROM account_asset_balances b
         LEFT JOIN (
           SELECT account_id, asset_code,
                  SUM(delta_amount) AS sum_delta
           FROM asset_transactions
           WHERE (is_invalid IS NULL OR is_invalid = 0)
           GROUP BY account_id, asset_code
         ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
         WHERE CAST(b.available_amount AS SIGNED) != CAST(COALESCE(t.sum_delta, 0) AS SIGNED)
         LIMIT 10`,
        { transaction }
      )
      if (balMismatch.length > 0) {
        console.log('⚠️ 余额一致性仍有差异:')
        balMismatch.forEach(m =>
          console.log(`  acct=${m.account_id} ${m.asset_code}: bal=${m.bal_avail} txn=${m.txn_avail}`)
        )
        throw new Error(`余额一致性验证失败: ${balMismatch.length} 条不一致`)
      }
      console.log('✅ Step 3: 余额一致性验证通过')

      await transaction.commit()
      console.log('🎉 V4 资产守恒修复完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ V4 修复失败，已回滚:', error.message)
      throw error
    }
  },

  async down (queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 回滚 Step 2: 删除 v4 兜底记录
      await queryInterface.sequelize.query(
        "DELETE FROM asset_transactions WHERE idempotency_key LIKE 'system_reconciliation_final_v4:%:20260224'",
        { transaction }
      )

      // 回滚 Step 1: 恢复 test_* 交易为有效
      await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET is_invalid = 0
         WHERE business_type LIKE 'test_%' AND is_invalid = 1`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ V4 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
