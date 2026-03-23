'use strict'

/**
 * 修复 item_ledger 对账一致性 + owner_consistency
 *
 * 问题6: 794条 source='test' 的items没有mint记录 → 补录mint账本条目
 * 问题9: 286条items的owner_account_id与ledger推导不一致 → 以ledger最新delta=1为准修正
 */

module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ═══════════════════════════════════════
      // 问题6: 为测试items补录mint账本条目
      // ═══════════════════════════════════════
      const [noMintItems] = await queryInterface.sequelize.query(
        `SELECT i.item_id, i.owner_account_id, i.source, i.created_at
         FROM items i
         WHERE i.item_id NOT IN (
           SELECT DISTINCT item_id FROM item_ledger WHERE event_type = 'mint'
         )`,
        { transaction }
      )

      if (noMintItems.length > 0) {
        const [systemMint] = await queryInterface.sequelize.query(
          "SELECT account_id FROM accounts WHERE system_code = 'SYSTEM_MINT' LIMIT 1",
          { transaction }
        )
        const mintAccountId = systemMint[0]?.account_id

        if (mintAccountId) {
          const ledgerRows = []
          for (const item of noMintItems) {
            ledgerRows.push(
              `(${item.item_id}, ${mintAccountId}, -1, ${item.owner_account_id}, 'mint', 'system', 'test_data_fix', 'fix_mint_${item.item_id}:out', '${item.created_at}')`,
              `(${item.item_id}, ${item.owner_account_id}, 1, ${mintAccountId}, 'mint', 'system', 'test_data_fix', 'fix_mint_${item.item_id}:in', '${item.created_at}')`
            )
          }

          const batchSize = 200
          for (let i = 0; i < ledgerRows.length; i += batchSize) {
            const batch = ledgerRows.slice(i, i + batchSize)
            await queryInterface.sequelize.query(
              `INSERT IGNORE INTO item_ledger (item_id, account_id, delta, counterpart_id, event_type, operator_type, business_type, idempotency_key, created_at)
               VALUES ${batch.join(',')}`,
              { transaction }
            )
          }
          console.log(`✅ 补录mint账本条目: ${noMintItems.length}个items × 2条 = ${noMintItems.length * 2}条`)
        } else {
          console.log('⚠️ SYSTEM_MINT账户不存在，跳过补录')
        }
      } else {
        console.log('✅ 无需补录mint账本（所有items已有mint记录）')
      }

      // ═══════════════════════════════════════
      // 问题9: 修正 owner_account_id 与 ledger 不一致
      // 以最新的 delta=1 账本条目为准
      // ═══════════════════════════════════════
      const [ownerFixResult] = await queryInterface.sequelize.query(
        `UPDATE items i
         JOIN (
           SELECT il.item_id, il.account_id AS correct_owner
           FROM item_ledger il
           INNER JOIN (
             SELECT item_id, MAX(ledger_entry_id) AS max_entry_id
             FROM item_ledger
             WHERE delta = 1
             GROUP BY item_id
           ) latest ON il.item_id = latest.item_id AND il.ledger_entry_id = latest.max_entry_id
         ) fix ON i.item_id = fix.item_id
         SET i.owner_account_id = fix.correct_owner
         WHERE i.owner_account_id != fix.correct_owner`,
        { transaction }
      )

      const ownerFixed = ownerFixResult?.affectedRows || 0
      console.log(`✅ owner_account_id 修正: ${ownerFixed}条`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 修复失败:', error.message)
      throw error
    }
  },

  down: async () => {
    console.log('⚠️ 此迁移的回滚需要手动处理（补录的mint记录不自动删除）')
  }
}
