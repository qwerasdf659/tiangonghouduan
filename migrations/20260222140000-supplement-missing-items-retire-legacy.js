/**
 * 数据库迁移：补全未迁移物品 + 退役旧表
 *
 * 变更说明：
 * 1. 补全88条未从 item_instances 迁移到 items 的物品数据
 * 2. 为每条补全物品创建 item_ledger 双录记录
 * 3. 旧表 item_instances → item_instances_legacy
 * 4. 旧表 item_instance_events → item_instance_events_legacy
 *
 * 前置条件：20260222130000 已重命名 FK 列
 *
 * @see docs/奖品流通追踪-架构设计方案.md 决策1
 */
'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ===== 第一步：补全未迁移物品 =====
      const [missingItems] = await queryInterface.sequelize.query(
        `SELECT ii.item_instance_id, ii.status, ii.source,
                CAST(ii.meta AS CHAR) as meta_str,
                ii.owner_user_id, ii.item_template_id, ii.created_at, ii.updated_at
         FROM item_instances ii
         LEFT JOIN items i ON ii.item_instance_id = i.item_id
         WHERE i.item_id IS NULL`,
        { transaction }
      )

      console.log(`  📦 发现 ${missingItems.length} 条未迁移物品`)

      if (missingItems.length > 0) {
        const ownerIds = [...new Set(missingItems.map(i => i.owner_user_id))]
        const [accounts] = await queryInterface.sequelize.query(
          `SELECT account_id, user_id FROM accounts WHERE user_id IN (${ownerIds.join(',')})`,
          { transaction }
        )
        const userAccountMap = {}
        accounts.forEach(a => { userAccountMap[a.user_id] = a.account_id })

        const [sysAccounts] = await queryInterface.sequelize.query(
          "SELECT account_id, system_code FROM accounts WHERE system_code IN ('SYSTEM_MINT', 'SYSTEM_BURN')",
          { transaction }
        )
        const mintAccountId = sysAccounts.find(a => a.system_code === 'SYSTEM_MINT').account_id
        const burnAccountId = sysAccounts.find(a => a.system_code === 'SYSTEM_BURN').account_id

        const STATUS_MAP = { available: 'available', locked: 'held', transferred: 'available', used: 'used', expired: 'expired' }
        const SOURCE_PREFIX = { lottery: 'LT', bid_settlement: 'BD', exchange: 'EX', admin: 'AD', legacy: 'LG', unknown: 'LG', test: 'TS' }

        let migratedCount = 0

        for (const oldItem of missingItems) {
          const meta = oldItem.meta_str ? JSON.parse(oldItem.meta_str) : {}
          const ownerAccountId = userAccountMap[oldItem.owner_user_id]
          if (!ownerAccountId) {
            console.log(`  ⚠️ 跳过 item_instance_id=${oldItem.item_instance_id}: owner_user_id=${oldItem.owner_user_id} 没有对应的 account`)
            continue
          }

          const newStatus = STATUS_MAP[oldItem.status] || 'available'
          const source = oldItem.source === 'unknown' ? 'legacy' : (oldItem.source || 'legacy')
          const itemType = meta.prize_type === 'physical' ? 'product' : 'voucher'

          const prefix = SOURCE_PREFIX[source] || 'LG'
          const d = new Date(new Date(oldItem.created_at).getTime() + 8 * 60 * 60 * 1000)
          const yy = String(d.getUTCFullYear()).slice(-2)
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
          const dd = String(d.getUTCDate()).padStart(2, '0')
          const trackingCode = `${prefix}${yy}${mm}${dd}${String(oldItem.item_instance_id).padStart(6, '0')}`

          await queryInterface.sequelize.query(
            `INSERT INTO items (item_id, tracking_code, owner_account_id, status, item_type, item_name,
             item_description, item_value, prize_definition_id, rarity_code, source, source_ref_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'common', ?, NULL, ?, ?)`,
            {
              replacements: [
                oldItem.item_instance_id, trackingCode, ownerAccountId, newStatus, itemType,
                meta.name || '未知物品', meta.description || '', Math.round(meta.value) || 0,
                meta.lottery_prize_id || null, source, oldItem.created_at, oldItem.updated_at || oldItem.created_at
              ],
              transaction
            }
          )

          const idempKey = `migration_supplement_${oldItem.item_instance_id}`
          await queryInterface.sequelize.query(
            `INSERT INTO item_ledger (item_id, account_id, delta, counterpart_id, event_type,
             operator_type, business_type, idempotency_key, meta, created_at)
             VALUES (?, ?, -1, ?, 'mint', 'system', 'data_migration', ?, '{}', ?),
                    (?, ?, 1, ?, 'mint', 'system', 'data_migration', ?, '{}', ?)`,
            {
              replacements: [
                oldItem.item_instance_id, mintAccountId, ownerAccountId, `${idempKey}:out`, oldItem.created_at,
                oldItem.item_instance_id, ownerAccountId, mintAccountId, `${idempKey}:in`, oldItem.created_at
              ],
              transaction
            }
          )

          if (oldItem.status === 'used') {
            await queryInterface.sequelize.query(
              `INSERT INTO item_ledger (item_id, account_id, delta, counterpart_id, event_type,
               operator_type, business_type, idempotency_key, meta, created_at)
               VALUES (?, ?, -1, ?, 'use', 'system', 'data_migration', ?, '{}', ?),
                      (?, ?, 1, ?, 'use', 'system', 'data_migration', ?, '{}', ?)`,
              {
                replacements: [
                  oldItem.item_instance_id, ownerAccountId, burnAccountId, `${idempKey}_use:out`, oldItem.updated_at || oldItem.created_at,
                  oldItem.item_instance_id, burnAccountId, ownerAccountId, `${idempKey}_use:in`, oldItem.updated_at || oldItem.created_at
                ],
                transaction
              }
            )
          }

          migratedCount++
        }

        console.log(`  ✅ 成功补全 ${migratedCount} 条物品`)
      }

      // ===== 第二步：退役旧表 =====
      // 先删除指向旧表的外键约束
      const [fks] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'item_instances'`,
        { transaction }
      )
      for (const fk of fks) {
        console.log(`  🔧 删除外键 ${fk.TABLE_NAME}.${fk.CONSTRAINT_NAME}`)
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${fk.TABLE_NAME}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      await queryInterface.sequelize.query('RENAME TABLE item_instances TO item_instances_legacy', { transaction })
      await queryInterface.sequelize.query('RENAME TABLE item_instance_events TO item_instance_events_legacy', { transaction })
      console.log('  ✅ 旧表已重命名为 legacy')

      await transaction.commit()
      console.log('  🎉 迁移完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query('RENAME TABLE item_instances_legacy TO item_instances', { transaction })
      await queryInterface.sequelize.query('RENAME TABLE item_instance_events_legacy TO item_instance_events', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
