'use strict'

/**
 * 数据治理迁移：修复 NULL counterpart_account_id 和账户余额一致性
 *
 * 修复内容：
 * 1. 标记61条无 counterpart_account_id 的测试/对账交易为 is_test_data=1
 *    - test_mint(20)、test_setup(14)、test_grant(10)、test_topup(3)、test_consume(1) = 48条测试数据
 *    - 补充 counterpart_account_id = SYSTEM_RESERVE(12) 给全部61条
 * 2. 修复 account_id=5 (user_id=31，测试账户) 的余额-流水不一致：
 *    - POINTS: avail=999700 vs sum_delta=977158 → 差额22542
 *    - DIAMOND: avail=2 vs sum_delta=1542 → 差额-1540
 * 3. 修复 frozen_amount_change 全局不平衡 (DIAMOND:220, POINTS:900)
 *
 * @version 1.0.0
 * @date 2026-02-23
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ======== 第1步：修复 NULL counterpart_account_id ========
      // 将所有无对手方的测试交易标记 is_test_data=1 并补充 counterpart_account_id
      const SYSTEM_RESERVE_ID = 12

      // 标记测试业务类型为 is_test_data
      await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET is_test_data = 1
        WHERE counterpart_account_id IS NULL
          AND (is_invalid IS NULL OR is_invalid = 0)
          AND business_type IN ('test_mint', 'test_setup', 'test_grant', 'test_topup', 'test_consume')
      `, { transaction })

      // 为所有 NULL counterpart 记录补充 SYSTEM_RESERVE 作为对手方
      const [updateResult] = await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET counterpart_account_id = ${SYSTEM_RESERVE_ID}
        WHERE counterpart_account_id IS NULL
          AND (is_invalid IS NULL OR is_invalid = 0)
      `, { transaction })

      console.log(`[Migration] 第1步完成：补充 counterpart_account_id`)

      // ======== 第2步：修复 account_id=5 余额-流水不一致 ========
      const ts = Date.now()

      // POINTS 差额 = 22542（余额比流水多，需要补建一条 delta_amount=22542 的流水）
      await queryInterface.sequelize.query(`
        INSERT INTO asset_transactions
          (account_id, asset_code, delta_amount, balance_before, balance_after,
           business_type, counterpart_account_id, idempotency_key, meta, is_invalid, is_test_data, created_at)
        VALUES
          (5, 'POINTS', 22542, 977158, 999700,
           'data_governance_reconciliation', ${SYSTEM_RESERVE_ID},
           'dgr_acc5_POINTS_${ts}_a',
           '{"reason":"数据治理：修复余额-流水差额22542","migration":"20260223191842"}',
           0, 0, NOW())
      `, { transaction })

      // DIAMOND 差额 = -1540（余额比流水少，需要补建 delta_amount=-1540）
      await queryInterface.sequelize.query(`
        INSERT INTO asset_transactions
          (account_id, asset_code, delta_amount, balance_before, balance_after,
           business_type, counterpart_account_id, idempotency_key, meta, is_invalid, is_test_data, created_at)
        VALUES
          (5, 'DIAMOND', -1540, 1542, 2,
           'data_governance_reconciliation', ${SYSTEM_RESERVE_ID},
           'dgr_acc5_DIAMOND_${ts}_a',
           '{"reason":"数据治理：修复余额-流水差额-1540","migration":"20260223191842"}',
           0, 0, NOW())
      `, { transaction })

      // SYSTEM_RESERVE 对手方记录（双录记账）
      await queryInterface.sequelize.query(`
        INSERT INTO asset_transactions
          (account_id, asset_code, delta_amount, balance_before, balance_after,
           business_type, counterpart_account_id, idempotency_key, meta, is_invalid, is_test_data, created_at)
        VALUES
          (${SYSTEM_RESERVE_ID}, 'POINTS', -22542, 0, 0,
           'data_governance_reconciliation', 5,
           'dgr_acc12_POINTS_${ts}_b',
           '{"reason":"数据治理：account_id=5 POINTS差额对手方","migration":"20260223191842"}',
           0, 0, NOW())
      `, { transaction })

      await queryInterface.sequelize.query(`
        INSERT INTO asset_transactions
          (account_id, asset_code, delta_amount, balance_before, balance_after,
           business_type, counterpart_account_id, idempotency_key, meta, is_invalid, is_test_data, created_at)
        VALUES
          (${SYSTEM_RESERVE_ID}, 'DIAMOND', 1540, 0, 0,
           'data_governance_reconciliation', 5,
           'dgr_acc12_DIAMOND_${ts}_b',
           '{"reason":"数据治理：account_id=5 DIAMOND差额对手方","migration":"20260223191842"}',
           0, 0, NOW())
      `, { transaction })

      console.log(`[Migration] 第2步完成：修复 account_id=5 余额-流水差额`)

      // ======== 第3步：修复 frozen_amount_change 全局不平衡 ========
      // DIAMOND: SUM=220 → 需要 -220 的校正
      // POINTS: SUM=900 → 需要 -900 的校正
      await queryInterface.sequelize.query(`
        INSERT INTO asset_transactions
          (account_id, asset_code, delta_amount, frozen_amount_change, balance_before, balance_after,
           business_type, counterpart_account_id, idempotency_key, meta, is_invalid, is_test_data, created_at)
        VALUES
          (${SYSTEM_RESERVE_ID}, 'DIAMOND', 0, -220, 0, 0,
           'frozen_tracking_correction', ${SYSTEM_RESERVE_ID},
           'ftc_DIAMOND_${ts}_c',
           '{"reason":"数据治理：frozen_amount_change全局平衡校正 DIAMOND -220","migration":"20260223191842"}',
           0, 0, NOW())
      `, { transaction })

      await queryInterface.sequelize.query(`
        INSERT INTO asset_transactions
          (account_id, asset_code, delta_amount, frozen_amount_change, balance_before, balance_after,
           business_type, counterpart_account_id, idempotency_key, meta, is_invalid, is_test_data, created_at)
        VALUES
          (${SYSTEM_RESERVE_ID}, 'POINTS', 0, -900, 0, 0,
           'frozen_tracking_correction', ${SYSTEM_RESERVE_ID},
           'ftc_POINTS_${ts}_c',
           '{"reason":"数据治理：frozen_amount_change全局平衡校正 POINTS -900","migration":"20260223191842"}',
           0, 0, NOW())
      `, { transaction })

      console.log(`[Migration] 第3步完成：修复 frozen_amount_change 全局不平衡`)

      // ======== 验证 ========
      const [nullCheck] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as cnt FROM asset_transactions
        WHERE counterpart_account_id IS NULL AND (is_invalid IS NULL OR is_invalid = 0)
      `, { transaction })
      console.log(`[Migration] 验证：剩余 NULL counterpart（有效）= ${nullCheck[0].cnt}`)

      const [balCheck] = await queryInterface.sequelize.query(`
        SELECT b.account_id, b.asset_code,
               b.available_amount - COALESCE(SUM(CASE WHEN t.is_invalid = 0 OR t.is_invalid IS NULL THEN t.delta_amount ELSE 0 END), 0) as diff
        FROM account_asset_balances b
        JOIN accounts a ON b.account_id = a.account_id
        LEFT JOIN asset_transactions t ON t.account_id = b.account_id AND t.asset_code = b.asset_code
        WHERE a.account_type = 'user' AND b.account_id = 5
        GROUP BY b.account_id, b.asset_code, b.available_amount
        HAVING ABS(diff) > 0.01
      `, { transaction })
      console.log(`[Migration] 验证：account_id=5 余额不一致数 = ${balCheck.length}`)

      const [frozenCheck] = await queryInterface.sequelize.query(`
        SELECT asset_code,
               SUM(CASE WHEN (is_invalid = 0 OR is_invalid IS NULL) THEN frozen_amount_change ELSE 0 END) as sum_frozen
        FROM asset_transactions
        WHERE frozen_amount_change IS NOT NULL AND frozen_amount_change != 0
        GROUP BY asset_code
        HAVING ABS(SUM(CASE WHEN (is_invalid = 0 OR is_invalid IS NULL) THEN frozen_amount_change ELSE 0 END)) > 0
      `, { transaction })
      console.log(`[Migration] 验证：frozen不平衡资产数 = ${frozenCheck.length}`)

      await transaction.commit()
      console.log('[Migration] 数据治理迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('[Migration] 回滚：', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除本次迁移创建的记录
      await queryInterface.sequelize.query(`
        DELETE FROM asset_transactions
        WHERE business_type IN ('data_governance_reconciliation', 'frozen_tracking_correction')
          AND meta LIKE '%20260223191842%'
      `, { transaction })

      // 恢复 counterpart_account_id 为 NULL（仅影响本次修复的记录）
      await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET counterpart_account_id = NULL
        WHERE counterpart_account_id = 12
          AND business_type IN ('test_mint', 'test_setup', 'test_grant', 'test_topup', 'test_consume',
                               'historical_reconciliation', 'system_reconciliation', 'admin_adjustment',
                               'merchant_points_reward')
          AND created_at >= '2026-02-24 00:00:00'
          AND created_at < '2026-02-25 00:00:00'
      `, { transaction })

      // 恢复 is_test_data 标记
      await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET is_test_data = 0
        WHERE business_type IN ('test_mint', 'test_setup', 'test_grant', 'test_topup', 'test_consume')
          AND created_at >= '2026-02-24 00:00:00'
          AND created_at < '2026-02-25 00:00:00'
      `, { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
