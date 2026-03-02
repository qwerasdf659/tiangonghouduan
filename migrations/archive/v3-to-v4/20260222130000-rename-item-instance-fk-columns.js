/**
 * 数据库迁移：重命名历史遗留的 FK 列名
 *
 * 变更说明：
 * 1. 补全88条未迁移的物品数据（item_instances → items + item_ledger）
 * 2. market_listings.offer_item_instance_id → offer_item_id
 * 3. redemption_orders.item_instance_id → item_id
 * 4. 外键约束从 item_instances 切换到 items
 * 5. 旧表 item_instances → item_instances_legacy（30天后删除）
 * 6. 旧表 item_instance_events → item_instance_events_legacy
 *
 * @see docs/奖品流通追踪-架构设计方案.md 决策1
 */
'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ===== 第一步：补全88条未迁移物品 =====
      const [missingItems] = await queryInterface.sequelize.query(
        `SELECT ii.item_instance_id, ii.status, ii.source, ii.meta,
                ii.owner_user_id, ii.item_template_id, ii.created_at, ii.updated_at
         FROM item_instances ii
         LEFT JOIN items i ON ii.item_instance_id = i.item_id
         WHERE i.item_id IS NULL`,
        { transaction }
      )

      if (missingItems.length > 0) {
        // 获取 user_id → account_id 映射
        const ownerIds = [...new Set(missingItems.map(i => i.owner_user_id))]
        const [accounts] = await queryInterface.sequelize.query(
          `SELECT account_id, user_id FROM accounts WHERE user_id IN (${ownerIds.join(',')})`,
          { transaction }
        )
        const userAccountMap = {}
        accounts.forEach(a => { userAccountMap[a.user_id] = a.account_id })

        // 获取 SYSTEM_MINT 和 SYSTEM_BURN 账户ID
        const [sysAccounts] = await queryInterface.sequelize.query(
          "SELECT account_id, system_code FROM accounts WHERE system_code IN ('SYSTEM_MINT', 'SYSTEM_BURN')",
          { transaction }
        )
        const mintAccountId = sysAccounts.find(a => a.system_code === 'SYSTEM_MINT').account_id
        const burnAccountId = sysAccounts.find(a => a.system_code === 'SYSTEM_BURN').account_id

        // 状态映射：旧 locked → 新 held
        const STATUS_MAP = {
          available: 'available',
          locked: 'held',
          transferred: 'available',
          used: 'used',
          expired: 'expired'
        }

        // 来源前缀映射
        const SOURCE_PREFIX = {
          lottery: 'LT', bid_settlement: 'BD', exchange: 'EX',
          admin: 'AD', legacy: 'LG', unknown: 'LG', test: 'TS'
        }

        for (const oldItem of missingItems) {
          const meta = typeof oldItem.meta === 'string' ? JSON.parse(oldItem.meta) : (oldItem.meta || {})
          const ownerAccountId = userAccountMap[oldItem.owner_user_id]
          if (!ownerAccountId) continue

          const newStatus = STATUS_MAP[oldItem.status] || 'available'
          const source = oldItem.source === 'unknown' ? 'legacy' : (oldItem.source || 'legacy')
          const itemType = meta.prize_type === 'physical' ? 'product' : 'voucher'

          // 生成 tracking_code
          const prefix = SOURCE_PREFIX[source] || 'LG'
          const d = new Date(new Date(oldItem.created_at).getTime() + 8 * 60 * 60 * 1000)
          const yy = String(d.getUTCFullYear()).slice(-2)
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
          const dd = String(d.getUTCDate()).padStart(2, '0')
          const trackingCode = `${prefix}${yy}${mm}${dd}${String(oldItem.item_instance_id).padStart(6, '0')}`

          // 插入 items 表（使用指定 item_id 保持与旧表一致）
          await queryInterface.sequelize.query(
            `INSERT INTO items (item_id, tracking_code, owner_account_id, status, item_type, item_name,
             item_description, item_value, prize_definition_id, rarity_code, source, source_ref_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'common', ?, NULL, ?, ?)`,
            {
              replacements: [
                oldItem.item_instance_id,
                trackingCode,
                ownerAccountId,
                newStatus,
                itemType,
                meta.name || '未知物品',
                meta.description || '',
                Math.round(meta.value) || 0,
                meta.lottery_prize_id || null,
                source,
                oldItem.created_at,
                oldItem.updated_at || oldItem.created_at
              ],
              transaction
            }
          )

          // 插入 item_ledger 双录记录（铸造：SYSTEM_MINT -1 + 用户 +1）
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

          // 如果旧状态是 used，补充 use 双录
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
        }
      }

      // ===== 第二步：重命名 market_listings.offer_item_instance_id → offer_item_id =====

      // 删除旧外键约束
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings DROP FOREIGN KEY fk_market_listings_offer_item_instance_id',
        { transaction }
      )
      // 删除旧索引
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings DROP INDEX idx_market_listings_offer_item_instance_id',
        { transaction }
      )
      // 重命名列
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings CHANGE COLUMN offer_item_instance_id offer_item_id BIGINT NULL COMMENT \'标的物品ID（关联 items.item_id）\'',
        { transaction }
      )
      // 添加新索引
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings ADD INDEX idx_market_listings_offer_item_id (offer_item_id)',
        { transaction }
      )
      // 添加新外键约束（指向 items 表）
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings ADD CONSTRAINT fk_market_listings_offer_item_id FOREIGN KEY (offer_item_id) REFERENCES items(item_id) ON DELETE RESTRICT ON UPDATE CASCADE',
        { transaction }
      )

      // ===== 第三步：重命名 redemption_orders.item_instance_id → item_id =====

      // 删除旧外键约束
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders DROP FOREIGN KEY redemption_orders_ibfk_1',
        { transaction }
      )
      // 删除旧索引（有两个引用此列的索引）
      const [roIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM redemption_orders WHERE Column_name = 'item_instance_id'",
        { transaction }
      )
      const indexNames = [...new Set(roIndexes.map(i => i.Key_name))]
      for (const idxName of indexNames) {
        await queryInterface.sequelize.query(
          `ALTER TABLE redemption_orders DROP INDEX \`${idxName}\``,
          { transaction }
        )
      }
      // 重命名列
      await queryInterface.sequelize.query(
        "ALTER TABLE redemption_orders CHANGE COLUMN item_instance_id item_id BIGINT NOT NULL COMMENT '关联物品ID（关联 items.item_id）'",
        { transaction }
      )
      // 添加新索引
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders ADD INDEX idx_redemption_orders_item_id (item_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders ADD INDEX idx_redemption_orders_item_status (item_id, status)',
        { transaction }
      )
      // 添加新外键约束（指向 items 表）
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders ADD CONSTRAINT fk_redemption_orders_item_id FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE RESTRICT ON UPDATE CASCADE',
        { transaction }
      )

      // ===== 第四步：重命名旧表为 legacy =====
      await queryInterface.sequelize.query(
        'RENAME TABLE item_instances TO item_instances_legacy',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'RENAME TABLE item_instance_events TO item_instance_events_legacy',
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 恢复旧表名
      await queryInterface.sequelize.query(
        'RENAME TABLE item_instances_legacy TO item_instances',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'RENAME TABLE item_instance_events_legacy TO item_instances_events',
        { transaction }
      )

      // 恢复 redemption_orders.item_id → item_instance_id
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders DROP FOREIGN KEY fk_redemption_orders_item_id',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders DROP INDEX idx_redemption_orders_item_id',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders DROP INDEX idx_redemption_orders_item_status',
        { transaction }
      )
      await queryInterface.sequelize.query(
        "ALTER TABLE redemption_orders CHANGE COLUMN item_id item_instance_id BIGINT NOT NULL COMMENT '物品实例ID'",
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders ADD INDEX idx_item_instance (item_instance_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders ADD INDEX idx_redemption_orders_item_status (item_instance_id, status)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders ADD CONSTRAINT redemption_orders_ibfk_1 FOREIGN KEY (item_instance_id) REFERENCES item_instances(item_instance_id)',
        { transaction }
      )

      // 恢复 market_listings.offer_item_id → offer_item_instance_id
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings DROP FOREIGN KEY fk_market_listings_offer_item_id',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings DROP INDEX idx_market_listings_offer_item_id',
        { transaction }
      )
      await queryInterface.sequelize.query(
        "ALTER TABLE market_listings CHANGE COLUMN offer_item_id offer_item_instance_id BIGINT NULL COMMENT '标的物品实例ID'",
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings ADD INDEX idx_market_listings_offer_item_instance_id (offer_item_instance_id)',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE market_listings ADD CONSTRAINT fk_market_listings_offer_item_instance_id FOREIGN KEY (offer_item_instance_id) REFERENCES item_instances(item_instance_id)',
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
