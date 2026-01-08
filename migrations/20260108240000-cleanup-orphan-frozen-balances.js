/**
 * 数据库迁移：清理孤儿冻结余额
 *
 * 业务背景：
 * 测试过程中产生的挂牌冻结流水未正确解冻，导致用户资产被卡死
 * 本迁移识别并解冻这些孤儿冻结余额
 *
 * 检测逻辑：
 * - 用户账户有冻结余额 (frozen_amount > 0)
 * - 但无对应的活跃挂牌 (market_listings.status = 'on_sale')
 * - 冻结 > 挂牌 = 孤儿冻结额
 *
 * 处理策略：
 * - 将孤儿冻结额转回可用余额
 * - 记录解冻流水用于审计
 * - 操作可回滚
 *
 * 创建时间：2026年01月08日 北京时间
 * 数据库版本：V4.0
 * 风险等级：中（涉及资产操作，但有完整回滚）
 * 预计执行时间：<5秒
 */

'use strict'

module.exports = {
  /**
   * 正向迁移：清理孤儿冻结余额
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    console.log('🔍 开始检测孤儿冻结余额...')

    // 1. 查找孤儿冻结余额
    const [orphanFrozen] = await queryInterface.sequelize.query(`
      SELECT 
        aab.account_id,
        a.user_id,
        aab.asset_code,
        CAST(aab.available_amount AS SIGNED) as available_amount,
        CAST(aab.frozen_amount AS SIGNED) as frozen_amount,
        (
          SELECT IFNULL(SUM(ml.offer_amount), 0)
          FROM market_listings ml 
          WHERE ml.seller_user_id = a.user_id 
            AND ml.offer_asset_code = aab.asset_code 
            AND ml.status = 'on_sale'
            AND ml.seller_offer_frozen = 1
        ) as total_listed
      FROM account_asset_balances aab
      JOIN accounts a ON aab.account_id = a.account_id
      WHERE a.account_type = 'user'
        AND CAST(aab.frozen_amount AS SIGNED) > 0
      HAVING total_listed < frozen_amount
    `)

    if (orphanFrozen.length === 0) {
      console.log('✅ 未发现孤儿冻结余额，无需清理')
      return
    }

    console.log(`⚠️ 发现 ${orphanFrozen.length} 条孤儿冻结余额，开始清理...`)

    // 2. 逐条处理孤儿冻结
    for (const record of orphanFrozen) {
      const orphanAmount = record.frozen_amount - record.total_listed

      if (orphanAmount <= 0) {
        continue
      }

      console.log(
        `  📦 账户 ${record.account_id} (用户 ${record.user_id}): ${record.asset_code} 孤儿冻结 ${orphanAmount}`
      )

      // 3. 更新余额：冻结转可用
      await queryInterface.sequelize.query(
        `
        UPDATE account_asset_balances
        SET 
          available_amount = available_amount + ?,
          frozen_amount = frozen_amount - ?
        WHERE account_id = ? AND asset_code = ?
      `,
        {
          replacements: [orphanAmount, orphanAmount, record.account_id, record.asset_code]
        }
      )

      // 4. 记录解冻流水
      const idempotencyKey = `orphan_cleanup_${record.account_id}_${record.asset_code}_20260108`
      const balanceAfter = record.available_amount + orphanAmount

      await queryInterface.sequelize.query(
        `
        INSERT INTO asset_transactions (
          account_id,
          asset_code,
          delta_amount,
          balance_before,
          balance_after,
          frozen_amount_change,
          business_type,
          idempotency_key,
          meta,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE transaction_id = transaction_id
      `,
        {
          replacements: [
            record.account_id,
            record.asset_code,
            orphanAmount, // 可用余额增加
            record.available_amount, // 变更前
            balanceAfter, // 变更后
            -orphanAmount, // 冻结减少
            'orphan_frozen_cleanup',
            idempotencyKey,
            JSON.stringify({
              cleanup_reason: '测试数据产生的孤儿冻结清理',
              original_frozen: record.frozen_amount,
              total_listed: record.total_listed,
              orphan_amount: orphanAmount,
              migration: '20260108240000-cleanup-orphan-frozen-balances'
            })
          ]
        }
      )

      console.log(`  ✅ 已解冻 ${orphanAmount} ${record.asset_code}`)
    }

    console.log('🎉 孤儿冻结余额清理完成')
  },

  /**
   * 回滚迁移：恢复孤儿冻结状态（仅供紧急回滚）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    console.log('🔄 开始回滚孤儿冻结清理...')

    // 查找本次清理的流水记录
    const [cleanupTxs] = await queryInterface.sequelize.query(`
      SELECT 
        account_id,
        asset_code,
        delta_amount,
        meta
      FROM asset_transactions
      WHERE business_type = 'orphan_frozen_cleanup'
        AND idempotency_key LIKE 'orphan_cleanup_%_20260108'
    `)

    if (cleanupTxs.length === 0) {
      console.log('⏭️ 未找到清理记录，无需回滚')
      return
    }

    for (const tx of cleanupTxs) {
      const orphanAmount = Math.abs(tx.delta_amount)

      // 恢复冻结状态
      await queryInterface.sequelize.query(
        `
        UPDATE account_asset_balances
        SET 
          available_amount = available_amount - ?,
          frozen_amount = frozen_amount + ?
        WHERE account_id = ? AND asset_code = ?
      `,
        {
          replacements: [orphanAmount, orphanAmount, tx.account_id, tx.asset_code]
        }
      )

      console.log(`  🔄 账户 ${tx.account_id} ${tx.asset_code}: 已恢复冻结 ${orphanAmount}`)
    }

    // 删除清理流水
    await queryInterface.sequelize.query(`
      DELETE FROM asset_transactions
      WHERE business_type = 'orphan_frozen_cleanup'
        AND idempotency_key LIKE 'orphan_cleanup_%_20260108'
    `)

    console.log('🔄 回滚完成：孤儿冻结已恢复')
  }
}
