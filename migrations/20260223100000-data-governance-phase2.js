'use strict'

/**
 * 历史数据治理 Phase 2：完成剩余 counterpart 回填 + 资产守恒修正 + 余额对齐
 *
 * 前置迁移：20260223083356-backfill-counterpart-and-source-ref.js（已完成基础回填）
 *
 * 本次处理：
 * 1. 回填剩余 1,689 条非冻结/解冻类型的 counterpart_account_id
 * 2. 修正 DIAMOND bigint 溢出记录（admin_data_fix txn#36096）
 * 3. 为 19 个余额-流水不一致的账户创建 opening_balance 调整流水
 *
 * 系统账户映射（来自 accounts 表）：
 * - 1: SYSTEM_PLATFORM_FEE（平台手续费账户）
 * - 2: SYSTEM_MINT（资产铸造/发放账户）
 * - 3: SYSTEM_BURN（资产销毁/消耗账户）
 * - 4: SYSTEM_ESCROW（资金托管账户）
 * - 12: SYSTEM_RESERVE（系统准备金/调账账户）
 * - 15: SYSTEM_CAMPAIGN_POOL（活动奖池账户）
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 Phase 2 历史数据治理开始...')

      // ========== 1. 回填剩余 counterpart_account_id ==========

      // 1a. 交易结算买家扣款 → counterpart = 卖家账户（通过 trade_orders 关联）
      const [, buyerDebitMeta] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions at
         JOIN trade_orders t ON at.idempotency_key LIKE CONCAT(t.idempotency_key, ':%')
         JOIN accounts a ON a.user_id = t.seller_user_id AND a.account_type = 'user'
         SET at.counterpart_account_id = a.account_id
         WHERE at.counterpart_account_id IS NULL
           AND at.business_type = 'order_settle_buyer_debit'`,
        { transaction }
      )
      console.log(`  ✅ order_settle_buyer_debit 回填: ${buyerDebitMeta?.affectedRows || 0} 条`)

      // 1b. 平台手续费入账 → counterpart = SYSTEM_PLATFORM_FEE(1)
      const [, platformFeeMeta] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET counterpart_account_id = 1
         WHERE counterpart_account_id IS NULL
           AND business_type = 'order_settle_platform_fee_credit'`,
        { transaction }
      )
      console.log(`  ✅ order_settle_platform_fee_credit 回填: ${platformFeeMeta?.affectedRows || 0} 条`)

      // 1c. 卖家入账（剩余未匹配的） → counterpart = SYSTEM_ESCROW(4)
      const [, sellerCreditMeta] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions at
         LEFT JOIN (
           SELECT CONCAT(t.idempotency_key, ':credit_seller') as idem_key,
                  a.account_id as buyer_account_id
           FROM trade_orders t
           JOIN accounts a ON a.user_id = t.buyer_user_id AND a.account_type = 'user'
         ) lookup ON at.idempotency_key = lookup.idem_key
         SET at.counterpart_account_id = COALESCE(lookup.buyer_account_id, 4)
         WHERE at.counterpart_account_id IS NULL
           AND at.business_type = 'order_settle_seller_credit'`,
        { transaction }
      )
      console.log(`  ✅ order_settle_seller_credit 回填: ${sellerCreditMeta?.affectedRows || 0} 条`)

      // 1d. 挂单结算卖家标的扣减 → counterpart = SYSTEM_ESCROW(4)
      const [, listingSettleMeta] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET counterpart_account_id = 4
         WHERE counterpart_account_id IS NULL
           AND business_type = 'listing_settle_seller_offer_debit'`,
        { transaction }
      )
      console.log(`  ✅ listing_settle_seller_offer_debit 回填: ${listingSettleMeta?.affectedRows || 0} 条`)

      // 1e. 买家标的入账（剩余未匹配的） → counterpart = SYSTEM_ESCROW(4)
      const [, listingTransferMeta] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET counterpart_account_id = 4
         WHERE counterpart_account_id IS NULL
           AND business_type = 'listing_transfer_buyer_offer_credit'`,
        { transaction }
      )
      console.log(`  ✅ listing_transfer_buyer_offer_credit 回填: ${listingTransferMeta?.affectedRows || 0} 条`)

      // 1f. _counterpart 后缀的记录（本身就是对手方流水） → counterpart = SYSTEM_RESERVE(12)
      const counterpartTypes = [
        'lottery_consume_counterpart',
        'exchange_debit_counterpart',
        'admin_adjustment_counterpart',
        'lottery_reward_counterpart',
        'order_settle_seller_credit_counterpart',
        'order_settle_platform_fee_credit_counterpart',
        'listing_transfer_buyer_offer_credit_counterpart'
      ]
      const [, cpMeta] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET counterpart_account_id = 12
         WHERE counterpart_account_id IS NULL
           AND business_type IN (:types)`,
        { replacements: { types: counterpartTypes }, transaction }
      )
      console.log(`  ✅ _counterpart 类型回填: ${cpMeta?.affectedRows || 0} 条`)

      // 1g. opening_balance → counterpart = SYSTEM_MINT(2)
      await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET counterpart_account_id = 2
         WHERE counterpart_account_id IS NULL
           AND business_type = 'opening_balance'`,
        { transaction }
      )

      // 1h. 剩余杂项统一处理
      const miscRules = [
        { types: ['test_grant', 'test_topup', 'merchant_points_reward'], cp: 2 },
        { types: ['admin_adjustment', 'admin_data_fix'], cp: 12 },
        { types: ['test_consume'], cp: 3 },
        { types: ['orphan_frozen_cleanup', 'buyer_orphan_frozen_cleanup'], cp: 4 }
      ]
      for (const rule of miscRules) {
        await queryInterface.sequelize.query(
          `UPDATE asset_transactions
           SET counterpart_account_id = :cp
           WHERE counterpart_account_id IS NULL
             AND business_type IN (:types)`,
          { replacements: { cp: rule.cp, types: rule.types }, transaction }
        )
      }
      console.log('  ✅ 杂项类型回填完成')

      // ========== 2. 修正 DIAMOND bigint 溢出记录 ==========
      const [overflowRecords] = await queryInterface.sequelize.query(
        `SELECT asset_transaction_id, account_id, delta_amount, balance_after, business_type
         FROM asset_transactions
         WHERE asset_code = 'DIAMOND'
           AND (delta_amount > 9000000000000000000 OR delta_amount < -9000000000000000000)`,
        { transaction }
      )

      if (overflowRecords.length > 0) {
        for (const rec of overflowRecords) {
          await queryInterface.sequelize.query(
            `UPDATE asset_transactions
             SET delta_amount = 0,
                 balance_after = balance_before,
                 is_invalid = 1
             WHERE asset_transaction_id = :txn_id`,
            { replacements: { txn_id: rec.asset_transaction_id }, transaction }
          )
          console.log(`  ✅ 修正溢出记录 txn#${rec.asset_transaction_id}: delta_amount 置零并标记 is_invalid`)
        }
      }

      // ========== 3. 余额-流水对齐：创建 opening_balance 调整流水 ==========
      const [mismatches] = await queryInterface.sequelize.query(
        `SELECT ab.account_asset_balance_id,
                ab.account_id,
                ab.asset_code,
                ab.available_amount as current_balance,
                COALESCE(SUM(at2.delta_amount), 0) as flow_sum
         FROM account_asset_balances ab
         LEFT JOIN asset_transactions at2
           ON ab.account_id = at2.account_id AND ab.asset_code = at2.asset_code
         GROUP BY ab.account_asset_balance_id, ab.account_id, ab.asset_code, ab.available_amount
         HAVING ABS(ab.available_amount - COALESCE(SUM(at2.delta_amount), 0)) > 0`,
        { transaction }
      )

      console.log(`  📊 发现 ${mismatches.length} 个余额-流水不一致账户`)

      for (const m of mismatches) {
        const diff = BigInt(m.current_balance) - BigInt(m.flow_sum)
        if (diff === 0n) continue

        const idempotencyKey = `data_gov_phase2_opening_${m.account_id}_${m.asset_code}`

        const [existing] = await queryInterface.sequelize.query(
          `SELECT 1 FROM asset_transactions WHERE idempotency_key = :key LIMIT 1`,
          { replacements: { key: idempotencyKey }, transaction }
        )

        if (existing.length > 0) {
          console.log(`  ⏭️ 跳过已存在的调整: ${m.account_id}/${m.asset_code}`)
          continue
        }

        await queryInterface.sequelize.query(
          `INSERT INTO asset_transactions
            (asset_code, delta_amount, balance_before, balance_after,
             business_type, account_id, counterpart_account_id,
             idempotency_key, frozen_amount_change, is_invalid, is_test_data, created_at,
             meta)
           VALUES
            (:asset_code, :delta, 0, :delta,
             'opening_balance', :account_id, 2,
             :idem_key, 0, 0, 0, NOW(),
             :meta)`,
          {
            replacements: {
              asset_code: m.asset_code,
              delta: diff.toString(),
              account_id: m.account_id,
              idem_key: idempotencyKey,
              meta: JSON.stringify({
                reason: 'Phase2 数据治理：余额-流水差额补建',
                original_balance: m.current_balance.toString(),
                flow_sum: m.flow_sum.toString(),
                adjustment: diff.toString()
              })
            },
            transaction
          }
        )
        console.log(`  ✅ 补建 opening_balance: acct=${m.account_id} asset=${m.asset_code} diff=${diff}`)
      }

      await transaction.commit()
      console.log('\n🎉 Phase 2 历史数据治理完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Phase 2 历史数据治理失败:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions WHERE idempotency_key LIKE 'data_gov_phase2_opening_%'`,
        { transaction }
      )

      await queryInterface.sequelize.query(
        `UPDATE asset_transactions
         SET is_invalid = 0, delta_amount = -9223372036854775807
         WHERE asset_transaction_id = 36096 AND is_invalid = 1`,
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
