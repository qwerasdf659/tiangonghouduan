'use strict'

/**
 * 综合数据治理迁移 Phase 3
 *
 * 修复项：
 * 1. 标记14条 NULL counterpart_account_id 的 test_setup 记录为 is_invalid
 * 2. 修复全局守恒残差（在 SYSTEM_RESERVE 上创建 system_reconciliation 记录）
 * 3. 修复用户账户余额与流水不一致
 * 4. 修复 1648 个物品的 ledger mint 记录（account_id 指向错误）
 * 5. 清理 legacy 物品无效的 source_ref_id（标记 source='legacy_no_ref'）
 * 6. 修复 frozen_amount_change 全局不平衡（孤儿冻结记录）
 *
 * @version 3.0.0
 * @date 2026-02-23
 */
module.exports = {
  /** @param {Object} queryInterface - Sequelize QueryInterface */
  async up(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('\n=== 综合数据治理 Phase 3 开始 ===\n')

      // ========== 步骤1: 标记 NULL counterpart 的 test_setup 记录为无效 ==========
      console.log('步骤1: 标记 NULL counterpart 的 test_setup 记录为无效...')

      const [nullCounterpartResult] = await queryInterface.sequelize.query(`
        UPDATE asset_transactions 
        SET is_invalid = 1,
            meta = JSON_SET(COALESCE(meta, '{}'), '$.invalidated_by', 'migration_phase3', '$.invalidated_at', NOW())
        WHERE counterpart_account_id IS NULL
          AND business_type = 'test_setup'
          AND (is_invalid IS NULL OR is_invalid = 0)
      `, { transaction })

      console.log(`  已标记 ${nullCounterpartResult.affectedRows || 0} 条 test_setup 无效记录`)

      // ========== 步骤2: 修复全局守恒残差 ==========
      console.log('\n步骤2: 修复全局守恒残差（SUM(delta_amount) per asset_code）...')

      const [globalResiduals] = await queryInterface.sequelize.query(`
        SELECT asset_code, SUM(delta_amount) AS total_net, COUNT(*) AS tx_count
        FROM asset_transactions
        WHERE (is_invalid IS NULL OR is_invalid = 0)
        GROUP BY asset_code
        HAVING SUM(delta_amount) != 0
      `, { transaction })

      for (const r of globalResiduals) {
        const residual = Number(r.total_net)
        const adjustment = -residual
        const idempKey = `migration_phase3:global_fix:${r.asset_code}:20260223`

        const [[existing]] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
          { replacements: { key: idempKey }, transaction }
        )
        if (Number(existing.cnt) > 0) {
          console.log(`  跳过 ${r.asset_code}（已修复）`)
          continue
        }

        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions 
            (account_id, counterpart_account_id, asset_code, delta_amount,
             balance_before, balance_after, business_type, idempotency_key, meta, created_at)
          VALUES (12, 2, :asset_code, :adjustment, 0, 0, 'system_reconciliation', :key, :meta, NOW())
        `, {
          replacements: {
            asset_code: r.asset_code,
            adjustment,
            key: idempKey,
            meta: JSON.stringify({
              type: 'migration_phase3_global_conservation_fix',
              residual,
              adjustment,
              tx_count: Number(r.tx_count),
              description: `修复 ${r.asset_code} 全局守恒残差：原始SUM=${residual}，调整=${adjustment}`
            })
          },
          transaction
        })

        console.log(`  ${r.asset_code}: 残差=${residual}, 调整=${adjustment}`)
      }

      // ========== 步骤3: 修复用户账户余额与流水不一致 ==========
      console.log('\n步骤3: 修复用户账户余额-流水不一致...')

      const [balanceMismatches] = await queryInterface.sequelize.query(`
        SELECT 
          b.account_id, b.asset_code,
          CAST(b.available_amount + b.frozen_amount AS SIGNED) AS current_balance,
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
        WHERE CAST(b.available_amount + b.frozen_amount AS SIGNED) - CAST(COALESCE(t.net, 0) AS SIGNED) != 0
        LIMIT 100
      `, { transaction })

      let balanceFixed = 0
      for (const m of balanceMismatches) {
        const diff = Number(m.diff)
        const mainKey = `migration_phase3:balance_fix:${m.account_id}:${m.asset_code}:20260223`

        const [[existing]] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
          { replacements: { key: mainKey }, transaction }
        )
        if (Number(existing.cnt) > 0) continue

        // 主记录（用户账户侧）
        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions 
            (account_id, counterpart_account_id, asset_code, delta_amount,
             balance_before, balance_after, business_type, idempotency_key, meta, created_at)
          VALUES (:account_id, 12, :asset_code, :diff, :calculated, :current_balance, 
             'opening_balance', :key, :meta, NOW())
        `, {
          replacements: {
            account_id: m.account_id,
            asset_code: m.asset_code,
            diff,
            calculated: Number(m.calculated),
            current_balance: Number(m.current_balance),
            key: mainKey,
            meta: JSON.stringify({
              type: 'migration_phase3_balance_reconciliation',
              balance: Number(m.current_balance),
              tx_net: Number(m.calculated),
              diff,
              description: `账户${m.account_id} ${m.asset_code} 余额对齐：余额=${m.current_balance}, 流水合计=${m.calculated}, 差额=${diff}`
            })
          },
          transaction
        })

        // 对手方记录（SYSTEM_RESERVE）
        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions 
            (account_id, counterpart_account_id, asset_code, delta_amount,
             balance_before, balance_after, business_type, idempotency_key, meta, created_at)
          VALUES (12, :account_id, :asset_code, :neg_diff, 0, 0, 
             'opening_balance_counterpart', :key, :meta, NOW())
        `, {
          replacements: {
            account_id: m.account_id,
            asset_code: m.asset_code,
            neg_diff: -diff,
            key: `${mainKey}:counterpart`,
            meta: JSON.stringify({ counterpart_of: mainKey })
          },
          transaction
        })

        balanceFixed++
        console.log(`  账户${m.account_id} ${m.asset_code}: diff=${diff}`)
      }
      console.log(`  修复 ${balanceFixed} 个账户余额不一致`)

      // ========== 步骤4: 修复 1648 个物品 ledger mint 记录 ==========
      console.log('\n步骤4: 修复物品 ledger mint 记录（account_id 指向错误）...')

      /*
       * 数据模式：mint(delta=+1) 的 account_id 指向了当前持有者而非原始接收者
       * 例如：物品已被 use，mint 指向 SYSTEM_USED(3) 而非原始用户(5)
       * 修复：找到同物品的 use/transfer 出方（delta=-1 的非系统账户），作为 mint 的正确 account_id
       */
      const [ledgerIssues] = await queryInterface.sequelize.query(`
        SELECT 
          mint.ledger_entry_id AS mint_ledger_id,
          mint.item_id,
          mint.account_id AS wrong_account_id,
          debit.account_id AS correct_account_id
        FROM (
          SELECT item_id, account_id, SUM(delta) AS total_delta
          FROM item_ledger
          GROUP BY item_id, account_id
          HAVING SUM(delta) > 1
        ) il
        INNER JOIN item_ledger mint 
          ON mint.item_id = il.item_id 
          AND mint.account_id = il.account_id 
          AND mint.event_type = 'mint' 
          AND mint.delta = 1
        INNER JOIN item_ledger debit
          ON debit.item_id = il.item_id
          AND debit.delta = -1
          AND debit.event_type IN ('use', 'transfer')
          AND debit.account_id NOT IN (1, 2, 3, 4, 12)
        GROUP BY mint.ledger_entry_id, mint.item_id, mint.account_id, debit.account_id
        LIMIT 2000
      `, { transaction })

      let ledgerFixed = 0
      for (const row of ledgerIssues) {
        await queryInterface.sequelize.query(`
          UPDATE item_ledger 
          SET account_id = :correct_account_id,
              meta = JSON_SET(COALESCE(meta, '{}'), 
                '$.fixed_by', 'migration_phase3',
                '$.original_account_id', CAST(:wrong_account_id AS CHAR))
          WHERE ledger_entry_id = :mint_ledger_id
        `, {
          replacements: {
            correct_account_id: row.correct_account_id,
            wrong_account_id: String(row.wrong_account_id),
            mint_ledger_id: row.mint_ledger_id
          },
          transaction
        })
        ledgerFixed++
      }
      console.log(`  修复 ${ledgerFixed}/${ledgerIssues.length} 个 mint 记录`)

      // ========== 步骤5: 标记 legacy 物品无来源引用 ==========
      console.log('\n步骤5: 标记 legacy 物品的 source_ref_id 为空状态...')

      /*
       * 将 source='legacy' 且 source_ref_id IS NULL 的记录标记为 'legacy_no_tracking'
       * 表示"已确认无来源引用"（设计上的妥协，区别于"尚未处理"的 NULL）
       */
      const [legacyResult] = await queryInterface.sequelize.query(`
        UPDATE items 
        SET source_ref_id = 'legacy_no_tracking',
            updated_at = NOW()
        WHERE source = 'legacy' AND source_ref_id IS NULL
      `, { transaction })

      console.log(`  标记 ${legacyResult.affectedRows || 0} 条 legacy 物品`)

      // test 来源物品同理
      const [testResult] = await queryInterface.sequelize.query(`
        UPDATE items 
        SET source_ref_id = 'test_data',
            updated_at = NOW()
        WHERE source = 'test' AND source_ref_id IS NULL
      `, { transaction })

      console.log(`  标记 ${testResult.affectedRows || 0} 条 test 物品`)

      // ========== 步骤6: 修复 frozen_amount_change 不平衡 ==========
      console.log('\n步骤6: 修复 frozen_amount_change 全局不平衡...')

      const [frozenImbalance] = await queryInterface.sequelize.query(`
        SELECT asset_code, SUM(frozen_amount_change) AS total_frozen
        FROM asset_transactions
        WHERE (is_invalid IS NULL OR is_invalid = 0)
        GROUP BY asset_code
        HAVING SUM(frozen_amount_change) != 0
      `, { transaction })

      for (const f of frozenImbalance) {
        const frozenResidual = Number(f.total_frozen)
        const frozenKey = `migration_phase3:frozen_fix:${f.asset_code}:20260223`

        const [[existing]] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
          { replacements: { key: frozenKey }, transaction }
        )
        if (Number(existing.cnt) > 0) continue

        // 在 SYSTEM_ESCROW (account_id=4) 上创建反向 frozen_amount_change 记录
        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions 
            (account_id, counterpart_account_id, asset_code, delta_amount, frozen_amount_change,
             balance_before, balance_after, business_type, idempotency_key, meta, created_at)
          VALUES (4, 12, :asset_code, 0, :frozen_adjustment, 0, 0, 'system_reconciliation', :key, :meta, NOW())
        `, {
          replacements: {
            asset_code: f.asset_code,
            frozen_adjustment: -frozenResidual,
            key: frozenKey,
            meta: JSON.stringify({
              type: 'migration_phase3_frozen_conservation_fix',
              residual: frozenResidual,
              adjustment: -frozenResidual,
              description: `修复 ${f.asset_code} frozen_amount_change 不平衡：残差=${frozenResidual}`
            })
          },
          transaction
        })

        console.log(`  ${f.asset_code}: frozen残差=${frozenResidual}, 调整=${-frozenResidual}`)
      }

      await transaction.commit()
      console.log('\n=== 综合数据治理 Phase 3 完成 ===\n')
    } catch (error) {
      await transaction.rollback()
      console.error('数据治理 Phase 3 失败:', error.message)
      throw error
    }
  },

  /** @param {Object} queryInterface - Sequelize QueryInterface */
  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚步骤6: 删除 frozen_fix 记录
      await queryInterface.sequelize.query(`
        DELETE FROM asset_transactions 
        WHERE idempotency_key LIKE 'migration_phase3:frozen_fix:%'
      `, { transaction })

      // 回滚步骤5: 恢复 legacy/test 物品的 source_ref_id
      await queryInterface.sequelize.query(`
        UPDATE items SET source_ref_id = NULL WHERE source_ref_id = 'legacy_no_tracking'
      `, { transaction })
      await queryInterface.sequelize.query(`
        UPDATE items SET source_ref_id = NULL WHERE source_ref_id = 'test_data'
      `, { transaction })

      // 回滚步骤4: 恢复 mint 记录的原始 account_id
      await queryInterface.sequelize.query(`
        UPDATE item_ledger 
        SET account_id = JSON_UNQUOTE(JSON_EXTRACT(meta, '$.original_account_id'))
        WHERE JSON_EXTRACT(meta, '$.fixed_by') = 'migration_phase3'
          AND JSON_EXTRACT(meta, '$.original_account_id') IS NOT NULL
      `, { transaction })

      // 回滚步骤3: 删除 balance_fix 记录
      await queryInterface.sequelize.query(`
        DELETE FROM asset_transactions 
        WHERE idempotency_key LIKE 'migration_phase3:balance_fix:%'
      `, { transaction })

      // 回滚步骤2: 删除 global_fix 记录
      await queryInterface.sequelize.query(`
        DELETE FROM asset_transactions 
        WHERE idempotency_key LIKE 'migration_phase3:global_fix:%'
      `, { transaction })

      // 回滚步骤1: 恢复 test_setup 记录
      await queryInterface.sequelize.query(`
        UPDATE asset_transactions 
        SET is_invalid = 0
        WHERE business_type = 'test_setup'
          AND counterpart_account_id IS NULL
          AND JSON_EXTRACT(meta, '$.invalidated_by') = 'migration_phase3'
      `, { transaction })

      await transaction.commit()
      console.log('数据治理 Phase 3 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
