'use strict'

/**
 * 数据治理迁移：为 legacy 物品补建 mint ledger 记录
 *
 * 问题根因（A3）：
 * - items 表 6,922 条 vs item_ledger 中 mint(delta=+1) 事件 5,274 条，差额 1,648 条
 * - 这些全部是 source='legacy' 的历史物品，在迁移时未补建 mint ledger 记录
 *
 * 修复策略：
 * - 查找所有在 items 表中存在但在 item_ledger 中没有 mint 记录的物品
 * - 为每个缺失的物品创建一条 event_type='mint', delta=+1 的 ledger 记录
 * - 使用 idempotency_key 保证幂等性
 *
 * @version 1.0.0
 * @date 2026-02-23
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 查找缺失 mint ledger 的物品
      const [missingItems] = await queryInterface.sequelize.query(
        `SELECT i.item_id, i.owner_account_id, i.source, i.created_at
         FROM items i
         LEFT JOIN item_ledger l ON l.item_id = i.item_id AND l.event_type = 'mint' AND l.delta = 1
         WHERE l.ledger_entry_id IS NULL`,
        { transaction }
      )

      console.log(`缺失 mint ledger 的物品: ${missingItems.length} 条`)

      if (missingItems.length === 0) {
        console.log('✅ 无需补建 mint ledger 记录')
        await transaction.commit()
        return
      }

      // 2. 获取 SYSTEM_MINT 账户作为 mint 来源方
      const [mintAccounts] = await queryInterface.sequelize.query(
        "SELECT account_id FROM accounts WHERE system_code = 'SYSTEM_MINT' LIMIT 1",
        { transaction }
      )

      if (mintAccounts.length === 0) {
        throw new Error('SYSTEM_MINT 账户不存在')
      }

      const mintAccountId = mintAccounts[0].account_id
      console.log(`SYSTEM_MINT account_id: ${mintAccountId}`)

      // 3. 分批插入 mint ledger 记录
      const BATCH_SIZE = 500
      let totalInserted = 0

      for (let i = 0; i < missingItems.length; i += BATCH_SIZE) {
        const batch = missingItems.slice(i, i + BATCH_SIZE)

        const values = batch.map(item => [
          item.item_id,
          item.owner_account_id || mintAccountId,
          mintAccountId,
          'mint',
          1,
          `legacy_mint_backfill_${item.item_id}`,
          JSON.stringify({
            backfill: true,
            backfill_date: '2026-02-23',
            original_source: item.source || 'legacy',
            note: '历史物品 mint ledger 补建'
          }),
          item.created_at || new Date().toISOString()
        ])

        const placeholders = values
          .map(() => '(?, ?, ?, ?, ?, ?, ?, ?)')
          .join(', ')
        const flatValues = values.flat()

        // INSERT IGNORE 保证幂等性（uk_item_idempotency: item_id + idempotency_key）
        await queryInterface.sequelize.query(
          `INSERT IGNORE INTO item_ledger 
           (item_id, account_id, counterpart_id, event_type, delta,
            idempotency_key, meta, created_at)
           VALUES ${placeholders}`,
          {
            replacements: flatValues,
            transaction
          }
        )
        totalInserted += batch.length

        if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= missingItems.length) {
          console.log(`进度: ${Math.min(i + BATCH_SIZE, missingItems.length)}/${missingItems.length}`)
        }
      }

      console.log(`✅ 补建 mint ledger 记录: ${totalInserted} 条`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    // 删除 backfill 创建的 mint ledger 记录
    const [result] = await queryInterface.sequelize.query(
      `DELETE FROM item_ledger 
       WHERE idempotency_key LIKE 'legacy_mint_backfill_%'
         AND event_type = 'mint'`
    )
    console.log(`回滚：删除 backfill mint ledger 记录: ${result.affectedRows || 0} 条`)
  }
}
