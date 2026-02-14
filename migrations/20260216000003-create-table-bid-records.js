'use strict'

/**
 * 数据库迁移：创建 bid_records 竞价出价记录表
 *
 * 业务背景（臻选空间/幸运空间/竞价功能 — 后端实施方案）：
 * - 记录每次用户出价（含冻结流水对账、幂等性控制）
 * - is_winning 标记当前最高出价，is_final_winner 标记最终中标
 * - idempotency_key UNIQUE 约束防止重复出价
 * - freeze_transaction_id 关联冻结流水用于对账
 *
 * @see docs/臻选空间-幸运空间-竞价功能-后端实施方案.md §3.3
 * @date 2026-02-16
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：创建 bid_records 竞价出价记录表...')

    await queryInterface.createTable(
      'bid_records',
      {
        // 主键
        bid_record_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '出价记录ID（自增主键）'
        },

        // 关联竞价商品
        bid_product_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '关联竞价商品ID（bid_products.bid_product_id）',
          references: {
            model: 'bid_products',
            key: 'bid_product_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },

        // 出价用户
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '出价用户ID（users.user_id）',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },

        // 出价信息
        bid_amount: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '出价金额（材料资产数量）'
        },
        previous_highest: {
          type: Sequelize.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '出价时的前最高价（审计用）'
        },

        // 出价状态标记
        is_winning: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否当前最高价（出价时标记，后续出价会将前一条改为 false）'
        },
        is_final_winner: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否最终中标（结算时由定时任务标记）'
        },

        // 冻结流水对账
        freeze_transaction_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          defaultValue: null,
          comment: '冻结流水ID（asset_transactions.asset_transaction_id，对账用）'
        },

        // 幂等键
        idempotency_key: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true,
          comment: '幂等键（防止重复出价，UNIQUE 约束）'
        },

        // 出价时间
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '出价时间'
        }
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '竞价出价记录表（含冻结流水对账、幂等性控制）'
      }
    )

    // ====== 创建索引 ======
    console.log('  📋 创建索引...')

    // 查询最高出价（按竞价商品 + 出价金额降序）
    await queryInterface.addIndex('bid_records', ['bid_product_id', 'bid_amount'], {
      name: 'idx_bid_records_product_amount'
    })

    // 查询用户出价记录
    await queryInterface.addIndex('bid_records', ['user_id', 'bid_product_id'], {
      name: 'idx_bid_records_user_bid'
    })

    // 幂等键唯一索引（addColumn 的 unique 已建，这里确保命名一致）
    // idempotency_key 在建表时已通过 unique: true 创建，无需重复添加

    console.log('✅ [迁移] 完成：bid_records 竞价出价记录表已创建（含 2 个索引）')
  },

  async down(queryInterface) {
    console.log('📦 [回滚] 开始：删除 bid_records 竞价出价记录表...')
    await queryInterface.dropTable('bid_records')
    console.log('✅ [回滚] 完成：bid_records 已删除')
  }
}


