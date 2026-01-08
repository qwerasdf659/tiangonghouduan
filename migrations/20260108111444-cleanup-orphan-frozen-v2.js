/**
 * 数据库迁移：清理孤儿冻结余额 V2
 *
 * 业务背景：
 * 用户 31 存在 red_shard 冻结 20，但 market_listings 中无对应活跃挂牌
 * 根据产品决策（2026-01-08），采用"自动解冻"策略恢复用户可用余额
 *
 * 检测逻辑：
 * - 用户账户有冻结余额 (frozen_amount > 0)
 * - 但无对应的活跃挂牌 (market_listings.status = 'on_sale')
 * - 冻结金额 > 挂牌冻结合计 = 孤儿冻结额
 *
 * 处理策略：
 * - 将孤儿冻结额转回可用余额（自动解冻）
 * - 记录解冻流水用于审计（business_type = orphan_frozen_cleanup）
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
    console.log('🔍 开始检测孤儿冻结余额（V2）...')

    // 1. 查找孤儿冻结余额（冻结金额 > 活跃挂牌冻结合计）
    const [orphanFrozen] = await queryInterface.sequelize.query(`
      SELECT 
        aab.account_id,
        aab.balance_id,
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
      HAVING frozen_amount > total_listed
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

      console.log(`  📦 账户 ${record.account_id} (用户 ${record.user_id}): ${record.asset_code}`)
      console.log(
        `     冻结: ${record.frozen_amount}, 活跃挂牌: ${record.total_listed}, 孤儿额: ${orphanAmount}`
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

      // 4. 记录解冻流水（带唯一标识防止重复）
      const idempotencyKey = `orphan_cleanup_v2_${record.account_id}_${record.asset_code}_20260108`
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
            record.available_amount, // 变更前可用
            balanceAfter, // 变更后可用
            -orphanAmount, // 冻结减少（负数表示解冻）
            'orphan_frozen_cleanup',
            idempotencyKey,
            JSON.stringify({
              cleanup_reason: '孤儿冻结自动解冻（产品决策：用户体验优先）',
              original_frozen: record.frozen_amount,
              total_listed: record.total_listed,
              orphan_amount: orphanAmount,
              user_id: record.user_id,
              migration: '20260108111444-cleanup-orphan-frozen-v2'
            })
          ]
        }
      )

      console.log(`     ✅ 已解冻 ${orphanAmount} ${record.asset_code} → 可用余额`)
    }

    // 5. 验证清理结果
    const [verification] = await queryInterface.sequelize.query(`
      SELECT 
        a.user_id,
        aab.asset_code,
        aab.available_amount,
        aab.frozen_amount
      FROM account_asset_balances aab
      JOIN accounts a ON aab.account_id = a.account_id
      WHERE a.account_type = 'user'
        AND aab.asset_code = 'red_shard'
        AND a.user_id IN (${orphanFrozen.map(r => r.user_id).join(',') || '0'})
    `)

    console.log('  📊 清理后余额状态:')
    verification.forEach(row => {
      console.log(
        `     用户 ${row.user_id} ${row.asset_code}: 可用=${row.available_amount}, 冻结=${row.frozen_amount}`
      )
    })

    console.log('🎉 孤儿冻结余额清理完成（V2）')
  },

  /**
   * 回滚迁移：恢复孤儿冻结状态（仅供紧急回滚）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    console.log('🔄 开始回滚孤儿冻结清理（V2）...')

    // 查找本次清理的流水记录
    const [cleanupTxs] = await queryInterface.sequelize.query(`
      SELECT 
        account_id,
        asset_code,
        delta_amount,
        meta
      FROM asset_transactions
      WHERE business_type = 'orphan_frozen_cleanup'
        AND idempotency_key LIKE 'orphan_cleanup_v2_%_20260108'
    `)

    if (cleanupTxs.length === 0) {
      console.log('⏭️ 未找到 V2 清理记录，无需回滚')
      return
    }

    console.log(`  发现 ${cleanupTxs.length} 条清理记录，开始回滚...`)

    for (const tx of cleanupTxs) {
      const orphanAmount = Math.abs(tx.delta_amount)

      // 恢复冻结状态：可用减少，冻结增加
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

    // 删除 V2 清理流水
    await queryInterface.sequelize.query(`
      DELETE FROM asset_transactions
      WHERE business_type = 'orphan_frozen_cleanup'
        AND idempotency_key LIKE 'orphan_cleanup_v2_%_20260108'
    `)

    console.log('🔄 回滚完成：孤儿冻结已恢复')
  }
}
