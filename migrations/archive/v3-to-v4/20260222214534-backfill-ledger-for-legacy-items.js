/**
 * 数据库迁移：为缺失 item_ledger 记录的历史物品补建初始账本条目
 *
 * 背景：
 *   三表模型迁移后，1,800 条历史物品（1,698 legacy + 102 test）
 *   只有 items 表记录，缺少 item_ledger 双录条目。
 *   导致对账脚本 mint_count_consistency 检查 FAIL。
 *
 * 操作：
 *   1. 查找所有 items 表中没有任何 item_ledger 记录的物品
 *   2. 为每个物品补建 2 条 initial_balance 双录条目：
 *      - SYSTEM_MINT(account_id=2) delta=-1（出方）
 *      - owner_account_id delta=+1（入方）
 *   3. 对已使用/过期/销毁的物品，额外补建 consume 双录：
 *      - owner delta=-1 → SYSTEM_BURN delta=+1
 *
 * 前置条件：20260222140000 已完成物品补全和旧表退役
 *
 * @see docs/奖品流通追踪-架构设计方案.md 决策5
 */
'use strict'

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 获取系统账户 ID
      const [sysAccounts] = await queryInterface.sequelize.query(
        "SELECT account_id, system_code FROM accounts WHERE system_code IN ('SYSTEM_MINT', 'SYSTEM_BURN')",
        { transaction }
      )
      const mintAccountId = sysAccounts.find(a => a.system_code === 'SYSTEM_MINT').account_id
      const burnAccountId = sysAccounts.find(a => a.system_code === 'SYSTEM_BURN').account_id

      // 查找所有没有任何 ledger 记录的物品
      const [orphanItems] = await queryInterface.sequelize.query(
        `SELECT i.item_id, i.owner_account_id, i.status, i.source, i.created_at
         FROM items i
         LEFT JOIN item_ledger il ON i.item_id = il.item_id
         WHERE il.item_id IS NULL
         ORDER BY i.item_id`,
        { transaction }
      )

      console.log(`  📦 发现 ${orphanItems.length} 条缺失 ledger 的物品`)

      if (orphanItems.length === 0) {
        await transaction.commit()
        return
      }

      // 终态状态集合（物品已被消耗/过期/销毁）
      const TERMINAL_STATES = new Set(['used', 'expired', 'destroyed'])
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

      // 分批处理，每批 500 条
      const BATCH_SIZE = 500
      let mintEntries = []
      let consumeEntries = []

      for (const item of orphanItems) {
        const ownerAccountId = item.owner_account_id
        const idempBase = `migration_backfill_${item.item_id}`

        // 铸造双录：SYSTEM_MINT → 持有者
        mintEntries.push(
          `(${item.item_id}, ${mintAccountId}, -1, ${ownerAccountId}, 'mint', 'system', 'initial_balance', '${idempBase}:out', '${item.created_at}')`,
          `(${item.item_id}, ${ownerAccountId}, 1, ${mintAccountId}, 'mint', 'system', 'initial_balance', '${idempBase}:in', '${item.created_at}')`
        )

        // 终态物品额外补建消耗双录
        if (TERMINAL_STATES.has(item.status)) {
          const eventType = item.status === 'used' ? 'use' : item.status === 'expired' ? 'expire' : 'destroy'
          consumeEntries.push(
            `(${item.item_id}, ${ownerAccountId}, -1, ${burnAccountId}, '${eventType}', 'system', 'initial_balance_consume', '${idempBase}:consume_out', '${now}')`,
            `(${item.item_id}, ${burnAccountId}, 1, ${ownerAccountId}, '${eventType}', 'system', 'initial_balance_consume', '${idempBase}:consume_in', '${now}')`
          )
        }

        // 达到批次大小时执行插入
        if (mintEntries.length >= BATCH_SIZE * 2) {
          await queryInterface.sequelize.query(
            `INSERT INTO item_ledger (item_id, account_id, delta, counterpart_id, event_type, operator_type, business_type, idempotency_key, created_at)
             VALUES ${mintEntries.join(',\n')}`,
            { transaction }
          )
          mintEntries = []
        }

        if (consumeEntries.length >= BATCH_SIZE * 2) {
          await queryInterface.sequelize.query(
            `INSERT INTO item_ledger (item_id, account_id, delta, counterpart_id, event_type, operator_type, business_type, idempotency_key, created_at)
             VALUES ${consumeEntries.join(',\n')}`,
            { transaction }
          )
          consumeEntries = []
        }
      }

      // 处理剩余的批次
      if (mintEntries.length > 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO item_ledger (item_id, account_id, delta, counterpart_id, event_type, operator_type, business_type, idempotency_key, created_at)
           VALUES ${mintEntries.join(',\n')}`,
          { transaction }
        )
      }

      if (consumeEntries.length > 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO item_ledger (item_id, account_id, delta, counterpart_id, event_type, operator_type, business_type, idempotency_key, created_at)
           VALUES ${consumeEntries.join(',\n')}`,
          { transaction }
        )
      }

      // 验证：所有物品的 SUM(delta) 应该为 0
      const [imbalanced] = await queryInterface.sequelize.query(
        `SELECT item_id, SUM(delta) as bal
         FROM item_ledger
         GROUP BY item_id
         HAVING bal != 0`,
        { transaction }
      )

      if (imbalanced.length > 0) {
        throw new Error(`迁移后发现 ${imbalanced.length} 条不守恒物品，回滚`)
      }

      // 验证：不再有无 ledger 的物品
      const [stillOrphan] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as cnt FROM items i
         LEFT JOIN item_ledger il ON i.item_id = il.item_id
         WHERE il.item_id IS NULL`,
        { transaction }
      )

      if (stillOrphan[0].cnt > 0) {
        throw new Error(`仍有 ${stillOrphan[0].cnt} 条物品缺失 ledger，回滚`)
      }

      console.log(`  ✅ 成功补建 ${orphanItems.length} 条物品的 ledger 记录`)
      console.log(`  ✅ 物品守恒验证通过（0 条不平衡）`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    // 回滚：删除本次迁移补建的 ledger 记录
    await queryInterface.sequelize.query(
      "DELETE FROM item_ledger WHERE business_type IN ('initial_balance', 'initial_balance_consume') AND idempotency_key LIKE 'migration_backfill_%'"
    )
    console.log('  🔄 已回滚补建的 ledger 记录')
  }
}
