'use strict'

/**
 * 奖品流通追踪三表模型 — 从零新建 items / item_ledger / item_holds
 *
 * 设计哲学：只有一份真相，其他全是缓存。缓存错了可以重建，真相不会出错。
 *
 * 表职责：
 * - items：当前状态缓存（可从 item_ledger 重建）
 * - item_ledger：双录记账本（唯一真相，只追加不修改）
 * - item_holds：锁定/保留记录（替代旧 JSON locks 字段）
 *
 * 参考文档：docs/奖品流通追踪-架构设计方案.md 第七章
 *
 * @version 1.0.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 表 1：items（当前状态缓存） ==========
      const [itemsTables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'items'",
        { transaction }
      )

      if (itemsTables.length > 0) {
        console.log('  ⏭️ items 表已存在，跳过')
      } else {
        await queryInterface.createTable(
          'items',
          {
            item_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '物品ID（自增主键）'
            },
            tracking_code: {
              type: Sequelize.STRING(20),
              allowNull: false,
              unique: true,
              comment: '人类可读追踪码（格式：LT260219028738）'
            },
            owner_account_id: {
              type: Sequelize.BIGINT,
              allowNull: false,
              comment: '当前持有者账户ID（从 item_ledger 派生）',
              references: { model: 'accounts', key: 'account_id' },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE'
            },
            status: {
              type: Sequelize.ENUM('available', 'held', 'used', 'expired', 'destroyed'),
              allowNull: false,
              defaultValue: 'available',
              comment: '物品状态：可用/锁定/已使用/已过期/已销毁'
            },
            item_type: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '物品类型：voucher/product/service'
            },
            item_name: {
              type: Sequelize.STRING(200),
              allowNull: false,
              comment: '物品名称（正式列，非 JSON）'
            },
            item_description: {
              type: Sequelize.TEXT,
              allowNull: true,
              comment: '物品描述'
            },
            item_value: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '物品价值（积分计）'
            },
            prize_definition_id: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '来自哪个奖品定义（lottery_prizes.lottery_prize_id）'
            },
            rarity_code: {
              type: Sequelize.STRING(50),
              allowNull: false,
              defaultValue: 'common',
              comment: '稀有度代码（关联 rarity_defs.rarity_code）'
            },
            source: {
              type: Sequelize.STRING(20),
              allowNull: false,
              comment: '物品来源：lottery/bid_settlement/exchange/admin/test/legacy'
            },
            source_ref_id: {
              type: Sequelize.STRING(100),
              allowNull: true,
              comment: '来源关联ID（lottery_draw_id / bid_product_id 等）'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间'
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
              comment: '更新时间'
            }
          },
          {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '物品表（当前状态缓存，可从 item_ledger 重建）',
            transaction
          }
        )

        await queryInterface.addIndex('items', ['owner_account_id'], {
          name: 'idx_items_owner',
          transaction
        })
        await queryInterface.addIndex('items', ['status'], {
          name: 'idx_items_status',
          transaction
        })
        await queryInterface.addIndex('items', ['source_ref_id'], {
          name: 'idx_items_source_ref',
          transaction
        })
        await queryInterface.addIndex('items', ['item_type'], {
          name: 'idx_items_type',
          transaction
        })

        console.log('  ✅ items 表创建完成')
      }

      // ========== 表 2：item_ledger（双录记账本 — 唯一真相） ==========
      const [ledgerTables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'item_ledger'",
        { transaction }
      )

      if (ledgerTables.length > 0) {
        console.log('  ⏭️ item_ledger 表已存在，跳过')
      } else {
        await queryInterface.createTable(
          'item_ledger',
          {
            ledger_entry_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '账本条目ID（自增主键）'
            },
            item_id: {
              type: Sequelize.BIGINT,
              allowNull: false,
              comment: '物品ID',
              references: { model: 'items', key: 'item_id' },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE'
            },
            account_id: {
              type: Sequelize.BIGINT,
              allowNull: false,
              comment: '当前方账户ID（出入账账户）',
              references: { model: 'accounts', key: 'account_id' },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE'
            },
            delta: {
              type: Sequelize.TINYINT,
              allowNull: false,
              comment: '变动方向：+1 入账 / -1 出账'
            },
            counterpart_id: {
              type: Sequelize.BIGINT,
              allowNull: false,
              comment: '对手方账户ID（双录记账的另一方）',
              references: { model: 'accounts', key: 'account_id' },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE'
            },
            event_type: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '事件类型：mint/transfer/use/expire/destroy'
            },
            operator_id: {
              type: Sequelize.BIGINT,
              allowNull: true,
              comment: '操作者ID'
            },
            operator_type: {
              type: Sequelize.ENUM('user', 'admin', 'system'),
              allowNull: false,
              defaultValue: 'system',
              comment: '操作者类型：用户/管理员/系统'
            },
            business_type: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '业务类型：lottery_mint/market_transfer/redemption_use 等'
            },
            idempotency_key: {
              type: Sequelize.STRING(100),
              allowNull: false,
              comment: '幂等键（同一物品同一操作不重复写入）'
            },
            meta: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '扩展元数据（仅存真正动态的信息）'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间（不可变，无 updated_at）'
            }
          },
          {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '物品双录记账本（唯一真相，只追加不修改不删除）',
            transaction
          }
        )

        await queryInterface.addIndex('item_ledger', ['item_id', 'idempotency_key'], {
          name: 'uk_item_idempotency',
          unique: true,
          transaction
        })
        await queryInterface.addIndex('item_ledger', ['item_id', 'created_at'], {
          name: 'idx_ledger_item_time',
          transaction
        })
        await queryInterface.addIndex('item_ledger', ['account_id', 'created_at'], {
          name: 'idx_ledger_account_time',
          transaction
        })
        await queryInterface.addIndex('item_ledger', ['event_type', 'created_at'], {
          name: 'idx_ledger_event_type',
          transaction
        })
        await queryInterface.addIndex('item_ledger', ['business_type', 'created_at'], {
          name: 'idx_ledger_business',
          transaction
        })

        console.log('  ✅ item_ledger 表创建完成')
      }

      // ========== 表 3：item_holds（锁定/保留记录） ==========
      const [holdsTables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'item_holds'",
        { transaction }
      )

      if (holdsTables.length > 0) {
        console.log('  ⏭️ item_holds 表已存在，跳过')
      } else {
        await queryInterface.createTable(
          'item_holds',
          {
            hold_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '锁定记录ID（自增主键）'
            },
            item_id: {
              type: Sequelize.BIGINT,
              allowNull: false,
              comment: '被锁定的物品ID',
              references: { model: 'items', key: 'item_id' },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE'
            },
            hold_type: {
              type: Sequelize.ENUM('trade', 'redemption', 'security'),
              allowNull: false,
              comment: '锁定类型：交易/兑换/风控'
            },
            holder_ref: {
              type: Sequelize.STRING(100),
              allowNull: false,
              comment: '持锁方引用（订单ID/兑换码ID/风控案件ID）'
            },
            priority: {
              type: Sequelize.TINYINT,
              allowNull: false,
              defaultValue: 1,
              comment: '优先级：trade=1, redemption=2, security=3'
            },
            status: {
              type: Sequelize.ENUM('active', 'released', 'expired', 'overridden'),
              allowNull: false,
              defaultValue: 'active',
              comment: '锁定状态：活跃/已释放/已过期/已被覆盖'
            },
            reason: {
              type: Sequelize.STRING(200),
              allowNull: true,
              comment: '锁定原因'
            },
            expires_at: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '过期时间（NULL=永不过期，用于 security 类型）'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间'
            },
            released_at: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '释放时间'
            }
          },
          {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '物品锁定/保留记录（替代旧 JSON locks 字段，可索引可查询）',
            transaction
          }
        )

        await queryInterface.addIndex('item_holds', ['item_id', 'status'], {
          name: 'idx_holds_item',
          transaction
        })
        await queryInterface.addIndex('item_holds', ['status', 'expires_at'], {
          name: 'idx_holds_active_expiry',
          transaction
        })
        await queryInterface.addIndex('item_holds', ['holder_ref'], {
          name: 'idx_holds_holder',
          transaction
        })

        console.log('  ✅ item_holds 表创建完成')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：创建奖品流通追踪三表模型（items / item_ledger / item_holds）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.dropTable('item_holds', { transaction })
      await queryInterface.dropTable('item_ledger', { transaction })
      await queryInterface.dropTable('items', { transaction })

      await transaction.commit()
      console.log('✅ 回滚完成：删除 items / item_ledger / item_holds 三张表')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
