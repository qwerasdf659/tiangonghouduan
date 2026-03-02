/**
 * 修复 item_ledger 物品守恒违规
 *
 * 问题描述：
 *   补充迁移脚本（backfill-ledger-for-legacy-items）给 legacy 物品写了多余的
 *   mint +1 条目（business_type=''），但缺少对应的 SYSTEM_MINT(account_id=2) -1 配对条目。
 *   导致 1,656 个物品的 SUM(delta) != 0，破坏了双录守恒。
 *
 * 违规分布：
 *   - 1384 条：account_id=3(SYSTEM_BURN)，来自 redemption_use 已核销物品
 *   - 247 条：account_id=26，来自 market_transfer 已转移物品
 *   - 15 条：account_id=7，来自 market_transfer 已转移物品
 *   - 10 条：account_id=5，仅有单条 mint 的孤立物品
 *
 * 修复策略：
 *   对每条 business_type='' 的 mint +1 条目，补录 SYSTEM_MINT(account_id=2)
 *   的 delta=-1 出账记录，恢复双录守恒。
 *
 * @module migrations/20260223171000-fix-item-ledger-conservation-violations
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 开始修复 item_ledger 物品守恒违规...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 定位所有多余的 mint 条目（特征：business_type='' 且 event_type='mint' 且 delta=+1）
      const [extraMintEntries] = await queryInterface.sequelize.query(
        `SELECT ledger_entry_id, item_id, account_id, counterpart_id
         FROM item_ledger
         WHERE business_type = '' AND event_type = 'mint' AND delta = 1`,
        { transaction }
      )

      console.log(`  📊 找到 ${extraMintEntries.length} 条多余 mint 记录需要补录配对`)

      if (extraMintEntries.length === 0) {
        console.log('  ✅ 无需修复')
        await transaction.commit()
        return
      }

      // 批量补录 SYSTEM_MINT(account_id=2) 的 delta=-1 出账记录
      const batchSize = 200
      let insertedCount = 0

      for (let i = 0; i < extraMintEntries.length; i += batchSize) {
        const batch = extraMintEntries.slice(i, i + batchSize)
        const values = batch.map(entry => {
          const idempotencyKey = `fix_conservation_mint_cp_${entry.item_id}_${entry.ledger_entry_id}`
          const meta = JSON.stringify({
            fix: 'conservation_violation',
            original_entry_id: Number(entry.ledger_entry_id),
            original_account_id: Number(entry.account_id)
          }).replace(/'/g, "\\'")
          // SYSTEM_MINT(2) 作为出方，原始条目的 account_id 作为入方的对手方
          return `(${entry.item_id}, 2, -1, ${entry.account_id}, 'mint', 'system', 'data_migration', '${idempotencyKey}', '${meta}', NOW())`
        }).join(',\n')

        await queryInterface.sequelize.query(
          `INSERT IGNORE INTO item_ledger
           (item_id, account_id, delta, counterpart_id, event_type, operator_type, business_type, idempotency_key, meta, created_at)
           VALUES ${values}`,
          { transaction }
        )
        insertedCount += batch.length
        console.log(`  📝 已补录 ${insertedCount}/${extraMintEntries.length} 条 SYSTEM_MINT -1 记录`)
      }

      // 修复多余条目的空 business_type → 'data_migration'
      await queryInterface.sequelize.query(
        `UPDATE item_ledger SET business_type = 'data_migration'
         WHERE business_type = '' AND event_type = 'mint' AND delta = 1`,
        { transaction }
      )
      console.log('  🔧 已修复空 business_type → data_migration')

      // 验证修复结果
      const [verifyResult] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as violation_count FROM (
           SELECT item_id FROM item_ledger GROUP BY item_id HAVING SUM(delta) != 0
         ) v`,
        { transaction }
      )
      const remaining = verifyResult[0].violation_count

      if (remaining > 0) {
        throw new Error(`修复后仍有 ${remaining} 个物品守恒违规，中止迁移`)
      }

      console.log('  ✅ 验证通过：所有物品 SUM(delta)=0，守恒恢复完毕')

      await transaction.commit()
      console.log(`🎉 item_ledger 守恒修复完成：补录 ${insertedCount} 条 SYSTEM_MINT -1 记录`)
    } catch (error) {
      await transaction.rollback()
      console.error('❌ item_ledger 守恒修复失败，已回滚:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 回滚 item_ledger 守恒修复...')
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        `DELETE FROM item_ledger WHERE idempotency_key LIKE 'fix_conservation_mint_cp_%'`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        `UPDATE item_ledger SET business_type = ''
         WHERE business_type = 'data_migration' AND event_type = 'mint' AND delta = 1
               AND account_id != 2`,
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
