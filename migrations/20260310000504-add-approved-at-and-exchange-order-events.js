'use strict'

/**
 * 兑换订单功能增强迁移
 *
 * 1. exchange_records 表新增 approved_at 列（审核通过时间）
 * 2. 新建 exchange_order_events 表（订单状态变更事件记录）
 *
 * @see docs/兑换订单接口-后端对接需求.md - 决策1
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. exchange_records 新增 approved_at 列 ==========
      const [columns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM exchange_records LIKE 'approved_at'",
        { transaction }
      )

      if (columns.length === 0) {
        await queryInterface.addColumn(
          'exchange_records',
          'approved_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null,
            comment: '审核通过时间（管理员审核通过的时间）'
          },
          { transaction }
        )
      }

      // ========== 2. 新建 exchange_order_events 表 ==========
      const [tables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'exchange_order_events'",
        { transaction }
      )

      if (tables.length === 0) {
        await queryInterface.createTable(
          'exchange_order_events',
          {
            event_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '事件ID'
            },
            order_no: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '订单号（关联 exchange_records.order_no）',
              references: {
                model: 'exchange_records',
                key: 'order_no'
              },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE'
            },
            old_status: {
              type: Sequelize.ENUM(
                'pending', 'approved', 'shipped', 'received',
                'rated', 'rejected', 'refunded', 'cancelled', 'completed'
              ),
              allowNull: true,
              comment: '变更前状态（首次创建时为NULL）'
            },
            new_status: {
              type: Sequelize.ENUM(
                'pending', 'approved', 'shipped', 'received',
                'rated', 'rejected', 'refunded', 'cancelled', 'completed'
              ),
              allowNull: false,
              comment: '变更后状态'
            },
            operator_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '操作人ID（用户/管理员/系统）',
              references: {
                model: 'users',
                key: 'user_id'
              },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE'
            },
            operator_type: {
              type: Sequelize.ENUM('user', 'admin', 'system'),
              allowNull: false,
              comment: '操作人类型：user=用户 | admin=管理员 | system=系统定时任务'
            },
            reason: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '变更原因/备注'
            },
            metadata: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '额外元数据（退款信息、快照等）'
            },
            idempotency_key: {
              type: Sequelize.STRING(100),
              allowNull: false,
              unique: true,
              comment: '幂等键（防止重复事件写入）'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间'
            }
          },
          {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '兑换订单状态变更事件表（审计追踪）',
            transaction
          }
        )

        // 索引：order_no（查询某订单的事件链）
        const [existingIdxOrder] = await queryInterface.sequelize.query(
          "SHOW INDEX FROM exchange_order_events WHERE Key_name = 'idx_exchange_order_events_order_no'",
          { transaction }
        )
        if (existingIdxOrder.length === 0) {
          await queryInterface.addIndex('exchange_order_events', ['order_no'], {
            name: 'idx_exchange_order_events_order_no',
            transaction
          })
        }

        // 索引：operator_id（查询某操作员的操作记录）
        const [existingIdxOp] = await queryInterface.sequelize.query(
          "SHOW INDEX FROM exchange_order_events WHERE Key_name = 'idx_exchange_order_events_operator_id'",
          { transaction }
        )
        if (existingIdxOp.length === 0) {
          await queryInterface.addIndex('exchange_order_events', ['operator_id'], {
            name: 'idx_exchange_order_events_operator_id',
            transaction
          })
        }

        // 索引：(new_status, created_at)（按状态+时间范围查询）
        const [existingIdxStatus] = await queryInterface.sequelize.query(
          "SHOW INDEX FROM exchange_order_events WHERE Key_name = 'idx_exchange_order_events_status_time'",
          { transaction }
        )
        if (existingIdxStatus.length === 0) {
          await queryInterface.addIndex('exchange_order_events', ['new_status', 'created_at'], {
            name: 'idx_exchange_order_events_status_time',
            transaction
          })
        }
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除 exchange_order_events 表
      await queryInterface.dropTable('exchange_order_events', { transaction })

      // 删除 approved_at 列
      const [columns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM exchange_records LIKE 'approved_at'",
        { transaction }
      )
      if (columns.length > 0) {
        await queryInterface.removeColumn('exchange_records', 'approved_at', { transaction })
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
