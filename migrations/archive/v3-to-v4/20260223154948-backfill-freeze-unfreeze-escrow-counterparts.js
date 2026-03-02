'use strict'

/**
 * 数据治理迁移：为历史 freeze/unfreeze 操作补录 SYSTEM_ESCROW 双录对手方流水
 *
 * 问题根因（A1/A2）：
 * - freeze/unfreeze/settleFromFrozen 方法在 V1.1.0 之前不写 counterpart_account_id
 * - 导致 6,985 条 asset_transactions（20.2%）缺失对手方标记
 * - 全局 SUM(delta_amount) != 0：DIAMOND=-41,594、POINTS=-46,753、red_shard=+43,595
 *
 * 修复策略：
 * 1. 为所有 freeze 类流水（delta_amount < 0）创建 SYSTEM_ESCROW 反向 counterpart（delta = +amount）
 * 2. 为所有 unfreeze 类流水（delta_amount > 0）创建 SYSTEM_ESCROW 反向 counterpart（delta = -amount）
 * 3. settleFromFrozen 的 delta_amount=0，仅补录 counterpart_account_id 标记
 * 4. 更新原始记录的 counterpart_account_id 字段
 *
 * 幂等性保证：counterpart 的 idempotency_key = `${原始key}:escrow_counterpart`
 *
 * @version 1.0.0
 * @date 2026-02-23
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 获取 SYSTEM_ESCROW 账户ID
      const [escrowAccounts] = await queryInterface.sequelize.query(
        "SELECT account_id FROM accounts WHERE system_code = 'SYSTEM_ESCROW' LIMIT 1",
        { transaction }
      )

      if (escrowAccounts.length === 0) {
        throw new Error('SYSTEM_ESCROW 账户不存在，请先执行 baseline 迁移')
      }

      const escrowAccountId = escrowAccounts[0].account_id
      console.log(`SYSTEM_ESCROW account_id: ${escrowAccountId}`)

      // 2. 查找所有无 counterpart 的冻结/解冻类记录（排除已标记无效的）
      const [freezeRecords] = await queryInterface.sequelize.query(
        `SELECT asset_transaction_id, account_id, asset_code, delta_amount, 
                business_type, idempotency_key
         FROM asset_transactions
         WHERE counterpart_account_id IS NULL
           AND COALESCE(is_invalid, 0) = 0
           AND business_type IN (
             'order_freeze_buyer', 'market_listing_freeze',
             'market_listing_withdraw_unfreeze', 'order_unfreeze_buyer',
             'order_timeout_unfreeze', 'listing_withdrawn_unfreeze',
             'market_listing_admin_withdraw_unfreeze', 'admin_force_withdraw_unfreeze',
             'market_listing_expire_unfreeze',
             'ad_budget_freeze', 'ad_budget_settle', 'ad_budget_unfreeze',
             'bid_freeze', 'bid_unfreeze', 'bid_settle'
           )`,
        { transaction }
      )

      console.log(`待处理冻结/解冻记录: ${freezeRecords.length} 条`)

      // 3. 分批处理（每批 500 条，避免事务过大）
      const BATCH_SIZE = 500
      let counterpartCreated = 0
      let counterpartUpdated = 0

      for (let i = 0; i < freezeRecords.length; i += BATCH_SIZE) {
        const batch = freezeRecords.slice(i, i + BATCH_SIZE)

        // 3a. 批量更新原始记录的 counterpart_account_id
        const ids = batch.map(r => r.asset_transaction_id)
        await queryInterface.sequelize.query(
          `UPDATE asset_transactions 
           SET counterpart_account_id = :escrowAccountId
           WHERE asset_transaction_id IN (:ids)`,
          {
            replacements: { escrowAccountId, ids },
            transaction
          }
        )
        counterpartUpdated += ids.length

        // 3b. 为 delta_amount != 0 的记录创建 SYSTEM_ESCROW 反向流水
        const nonZeroDelta = batch.filter(r => Number(r.delta_amount) !== 0)

        if (nonZeroDelta.length > 0) {
          const counterpartValues = nonZeroDelta.map(r => {
            const counterpartKey = `${r.idempotency_key}:escrow_counterpart`
            const reverseDelta = -Number(r.delta_amount)
            const operation = Number(r.delta_amount) < 0 ? 'freeze' : 'unfreeze'
            return [
              escrowAccountId,
              r.account_id,
              r.asset_code,
              reverseDelta,
              0, // balance_before
              0, // balance_after
              0, // frozen_amount_change
              `${r.business_type}_counterpart`,
              counterpartKey,
              JSON.stringify({
                counterpart_of: r.idempotency_key,
                original_account_id: r.account_id,
                operation,
                backfill: true,
                backfill_date: '2026-02-23'
              })
            ]
          })

          // 使用 INSERT IGNORE 保证幂等性（idempotency_key 唯一约束）
          const placeholders = counterpartValues
            .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())')
            .join(', ')
          const flatValues = counterpartValues.flat()

          await queryInterface.sequelize.query(
            `INSERT IGNORE INTO asset_transactions 
             (account_id, counterpart_account_id, asset_code, delta_amount,
              balance_before, balance_after, frozen_amount_change,
              business_type, idempotency_key, meta, created_at)
             VALUES ${placeholders}`,
            {
              replacements: flatValues,
              transaction
            }
          )
          counterpartCreated += nonZeroDelta.length
        }

        if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= freezeRecords.length) {
          console.log(`进度: ${Math.min(i + BATCH_SIZE, freezeRecords.length)}/${freezeRecords.length}`)
        }
      }

      console.log(`✅ 迁移完成:`)
      console.log(`   - 更新 counterpart_account_id: ${counterpartUpdated} 条`)
      console.log(`   - 创建 ESCROW counterpart 流水: ${counterpartCreated} 条`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚：删除 backfill 创建的 counterpart 记录
      const [result] = await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions 
         WHERE idempotency_key LIKE '%:escrow_counterpart'
           AND meta LIKE '%"backfill":true%'`,
        { transaction }
      )
      console.log(`回滚：删除 backfill counterpart 记录: ${result.affectedRows || 0} 条`)

      // 清除原始记录的 counterpart_account_id（仅限冻结/解冻类型）
      await queryInterface.sequelize.query(
        `UPDATE asset_transactions 
         SET counterpart_account_id = NULL
         WHERE business_type IN (
           'order_freeze_buyer', 'market_listing_freeze',
           'market_listing_withdraw_unfreeze', 'order_unfreeze_buyer',
           'order_timeout_unfreeze', 'listing_withdrawn_unfreeze',
           'market_listing_admin_withdraw_unfreeze', 'admin_force_withdraw_unfreeze',
           'market_listing_expire_unfreeze',
           'ad_budget_freeze', 'ad_budget_settle', 'ad_budget_unfreeze',
           'bid_freeze', 'bid_unfreeze', 'bid_settle'
         )`,
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
