/**
 * 修复资产交易 NULL counterpart 和全局守恒违规
 *
 * 问题描述：
 *   1. 73 条 asset_transactions 缺少 counterpart_account_id（测试数据）
 *   2. DIAMOND/POINTS/red_shard 全局 SUM(delta_amount) != 0
 *
 * 修复策略：
 *   1. 设置 NULL counterpart 记录的正确对手方
 *   2. 为缺少 counterpart 流水的测试记录补录配对
 *   3. 写入单边 system_balance_adjustment 抵消剩余全局差异
 *      （注意：调整记录是单边的，不创建 counterpart，因为目的就是消除全局不平衡）
 *
 * @module migrations/20260223171005-fix-asset-null-counterpart-and-global-sum
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 开始修复资产交易 NULL counterpart 和全局守恒...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 第一步：修复 NULL counterpart_account_id
      // ============================================================
      console.log('\n📌 第一步：修复 NULL counterpart_account_id...')

      const [fixPositive] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions SET counterpart_account_id = 2
         WHERE counterpart_account_id IS NULL AND is_invalid = false AND delta_amount > 0`,
        { transaction }
      )
      console.log(`  ✅ 正向 delta → SYSTEM_MINT(2): ${fixPositive.affectedRows || 0} 条`)

      const [fixNegative] = await queryInterface.sequelize.query(
        `UPDATE asset_transactions SET counterpart_account_id = 3
         WHERE counterpart_account_id IS NULL AND is_invalid = false AND delta_amount < 0`,
        { transaction }
      )
      console.log(`  ✅ 负向 delta → SYSTEM_BURN(3): ${fixNegative.affectedRows || 0} 条`)

      // ============================================================
      // 第二步：为测试数据补录 counterpart 流水
      // ============================================================
      console.log('\n📌 第二步：为测试数据补录 counterpart 流水...')

      const [missingCounterparts] = await queryInterface.sequelize.query(
        `SELECT t.asset_transaction_id, t.account_id, t.counterpart_account_id,
                t.asset_code, t.delta_amount, t.business_type, t.idempotency_key
         FROM asset_transactions t
         LEFT JOIN asset_transactions cp
           ON cp.idempotency_key = CONCAT(t.idempotency_key, ':counterpart')
         WHERE t.business_type IN ('test_setup', 'test_grant', 'test_mint', 'lottery_reward')
               AND t.is_invalid = false
               AND cp.asset_transaction_id IS NULL
               AND t.business_type NOT LIKE '%_counterpart'`,
        { transaction }
      )
      console.log(`  📊 找到 ${missingCounterparts.length} 条缺少 counterpart 的测试记录`)

      for (const record of missingCounterparts) {
        const cpAccountId = record.delta_amount > 0 ? 2 : 3
        const cpKey = `${record.idempotency_key}:counterpart`

        await queryInterface.sequelize.query(
          `INSERT IGNORE INTO asset_transactions
           (account_id, counterpart_account_id, asset_code, delta_amount,
            balance_before, balance_after, business_type, idempotency_key,
            frozen_amount_change, is_invalid, meta, created_at)
           VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0, false, ?, NOW())`,
          {
            replacements: [
              cpAccountId, record.account_id, record.asset_code,
              -record.delta_amount,
              `${record.business_type}_counterpart`, cpKey,
              JSON.stringify({
                counterpart_of: record.idempotency_key,
                original_account_id: Number(record.account_id),
                fix: 'missing_counterpart_backfill'
              })
            ],
            transaction
          }
        )
      }
      if (missingCounterparts.length > 0) {
        console.log(`  ✅ 补录 ${missingCounterparts.length} 条 counterpart 流水`)
      }

      // ============================================================
      // 第三步：单边调整记录消除剩余全局不平衡
      // ============================================================
      console.log('\n📌 第三步：消除剩余全局不平衡...')

      const [currentSums] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) as total_delta
         FROM asset_transactions WHERE is_invalid = false
         GROUP BY asset_code HAVING SUM(delta_amount) != 0`,
        { transaction }
      )

      if (currentSums.length === 0) {
        console.log('  ✅ 全局守恒已达成，无需调整')
      } else {
        console.log('  📊 当前不守恒资产:')
        currentSums.forEach(r => console.log(`    ${r.asset_code}: SUM=${r.total_delta}`))

        // 单边调整记录写入 SYSTEM_RESERVE(account_id=12)
        // 不创建 counterpart（这是历史数据治理的一次性调整，目的就是消除不平衡）
        for (const assetSum of currentSums) {
          const adjustDelta = -Number(assetSum.total_delta)
          const idempKey = `sys_adj_${assetSum.asset_code}_20260223_global_fix`

          await queryInterface.sequelize.query(
            `INSERT IGNORE INTO asset_transactions
             (account_id, counterpart_account_id, asset_code, delta_amount,
              balance_before, balance_after, business_type, idempotency_key,
              frozen_amount_change, is_invalid, meta, created_at)
             VALUES (12, 2, ?, ?, 0, 0, 'system_balance_adjustment', ?, 0, false, ?, NOW())`,
            {
              replacements: [
                assetSum.asset_code, adjustDelta, idempKey,
                JSON.stringify({
                  reason: 'global_conservation_fix',
                  original_imbalance: Number(assetSum.total_delta),
                  adjustment: adjustDelta,
                  note: '单边调整记录（历史数据治理），不创建counterpart'
                })
              ],
              transaction
            }
          )
          console.log(`  🔧 ${assetSum.asset_code}: 调整 ${adjustDelta > 0 ? '+' : ''}${adjustDelta}`)
        }
      }

      // ============================================================
      // 第四步：验证修复结果
      // ============================================================
      console.log('\n📌 第四步：验证修复结果...')

      const [verifyGlobal] = await queryInterface.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) as total_delta
         FROM asset_transactions WHERE is_invalid = false
         GROUP BY asset_code HAVING SUM(delta_amount) != 0`,
        { transaction }
      )

      if (verifyGlobal.length > 0) {
        console.log('  ⚠️ 仍有不平衡:')
        verifyGlobal.forEach(r => console.log(`    ${r.asset_code}: ${r.total_delta}`))
        throw new Error(`全局守恒修复不完整，${verifyGlobal.length} 个资产仍不平衡`)
      }

      console.log('  ✅ 全局守恒验证通过：所有资产 SUM(delta_amount) = 0')

      const [verifyNull] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as cnt FROM asset_transactions
         WHERE counterpart_account_id IS NULL AND is_invalid = false`,
        { transaction }
      )
      console.log(`  ✅ NULL counterpart: ${verifyNull[0].cnt} 条`)

      await transaction.commit()
      console.log('\n🎉 资产交易修复完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 资产交易修复失败，已回滚:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 回滚资产交易修复...')
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions WHERE idempotency_key LIKE 'sys_adj_%_20260223_global_fix'`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions
         WHERE meta LIKE '%missing_counterpart_backfill%'
               AND idempotency_key LIKE '%:counterpart'`,
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
