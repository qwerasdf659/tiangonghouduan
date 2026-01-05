/**
 * 迁移文件：回填lottery_draws表的关联键
 *
 * 治理决策（2026-01-05）：
 * - 事务边界治理要求：lottery_draws 必须关联到对应的 asset_transactions
 * - 回填 lottery_session_id 和 asset_transaction_id
 * - 通过时间戳和账户匹配进行关联
 *
 * 变更内容：
 * 1. 回填 lottery_session_id（从 asset_transactions 获取）
 * 2. 回填 asset_transaction_id（关联到流水记录）
 *
 * @since 2026-01-05
 * @see docs/事务边界治理现状核查报告.md
 */

'use strict'

// 新账本分界线
const CUTOFF_DATE = '2026-01-02 20:24:20'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('📝 开始迁移：回填lottery_draws表的关联键')
    console.log(`分界线时间：${CUTOFF_DATE}`)

    // 步骤1：统计需要回填的记录
    const [needBackfill] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM lottery_draws
      WHERE created_at >= ?
        AND (lottery_session_id IS NULL OR asset_transaction_id IS NULL)
    `, { replacements: [CUTOFF_DATE] })

    const count = needBackfill[0].count
    console.log(`需要回填的记录数：${count}`)

    if (count === 0) {
      console.log('✅ 无需回填，所有记录已有关联键')
      return
    }

    // 步骤2：查询可以关联的记录
    // 关联策略：通过 idempotency_key 的时间戳部分匹配
    // 抽奖记录格式：verify_ledger_<timestamp>:reward_<n>
    // 流水记录格式：verify_ledger_<timestamp>:consume
    const [drawsToBackfill] = await queryInterface.sequelize.query(`
      SELECT
        ld.draw_id,
        ld.user_id,
        ld.idempotency_key as draw_idempotency_key,
        ld.cost_points,
        ld.created_at
      FROM lottery_draws ld
      WHERE ld.created_at >= ?
        AND (ld.lottery_session_id IS NULL OR ld.asset_transaction_id IS NULL)
    `, { replacements: [CUTOFF_DATE] })

    console.log(`找到 ${drawsToBackfill.length} 条待回填记录`)

    let successCount = 0
    let failCount = 0

    for (const draw of drawsToBackfill) {
      // 从 idempotency_key 中提取时间戳（格式：verify_ledger_<timestamp>:reward_<n>）
      const match = draw.draw_idempotency_key.match(/verify_ledger_(\d+):/)
      if (!match) {
        console.warn(`⚠️ 无法解析 idempotency_key: ${draw.draw_idempotency_key}`)
        failCount++
        continue
      }

      const timestamp = match[1]
      const consumeIdempotencyKey = `verify_ledger_${timestamp}:consume`

      // 查找对应的扣款流水
      const [txRecords] = await queryInterface.sequelize.query(`
        SELECT
          transaction_id,
          lottery_session_id,
          idempotency_key
        FROM asset_transactions
        WHERE idempotency_key = ?
          AND business_type = 'lottery_consume'
        LIMIT 1
      `, { replacements: [consumeIdempotencyKey] })

      if (txRecords.length === 0) {
        console.warn(`⚠️ 未找到对应流水: ${consumeIdempotencyKey}`)
        failCount++
        continue
      }

      const tx = txRecords[0]

      // 更新 lottery_draws 记录
      await queryInterface.sequelize.query(`
        UPDATE lottery_draws
        SET
          lottery_session_id = ?,
          asset_transaction_id = ?
        WHERE draw_id = ?
      `, {
        replacements: [tx.lottery_session_id, tx.transaction_id, draw.draw_id]
      })

      console.log(`✅ 回填成功: draw_id=${draw.draw_id} -> session=${tx.lottery_session_id}, tx=${tx.transaction_id}`)
      successCount++
    }

    console.log(`\n📊 回填统计：`)
    console.log(`   - 成功: ${successCount}`)
    console.log(`   - 失败: ${failCount}`)

    // 步骤3：验证回填结果
    const [verifyResult] = await queryInterface.sequelize.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN lottery_session_id IS NOT NULL THEN 1 ELSE 0 END) as has_session,
        SUM(CASE WHEN asset_transaction_id IS NOT NULL THEN 1 ELSE 0 END) as has_tx
      FROM lottery_draws
      WHERE created_at >= ?
    `, { replacements: [CUTOFF_DATE] })

    const stats = verifyResult[0]
    console.log(`\n📊 分界线后记录状态：`)
    console.log(`   - 总记录: ${stats.total}`)
    console.log(`   - 有 lottery_session_id: ${stats.has_session}`)
    console.log(`   - 有 asset_transaction_id: ${stats.has_tx}`)

    if (stats.total > 0 && stats.has_session === stats.total && stats.has_tx === stats.total) {
      console.log('✅ 验证通过：所有分界线后记录都已回填关联键')
    } else if (stats.total === 0) {
      console.log('ℹ️ 分界线后暂无记录')
    } else {
      console.warn('⚠️ 部分记录未完成回填，请检查日志')
    }

    console.log('✅ 迁移完成')
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚：清除lottery_draws表的关联键')

    // 清除回填的关联键
    await queryInterface.sequelize.query(`
      UPDATE lottery_draws
      SET
        lottery_session_id = NULL,
        asset_transaction_id = NULL
      WHERE created_at >= ?
    `, { replacements: [CUTOFF_DATE] })

    console.log('✅ 回滚完成：关联键已清除')
  }
}
