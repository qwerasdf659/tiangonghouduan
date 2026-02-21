'use strict'

/**
 * exchange_records 状态 ENUM 扩展 + 新增字段
 *
 * 业务背景：核销码系统 Phase 3 - 积分商城确认收货（决策 P1）
 * - 一次性扩展完整状态机：pending → approved → shipped → received → rated
 * - 新增分支：rejected → refunded
 * - 复用已有 rating/rated_at 字段，新增 received_at/auto_confirmed
 *
 * 状态流转：
 * pending（待审核）
 *   ├→ approved（审核通过）→ shipped（已发货）→ received（已收货/7天自动）→ rated（已评价）
 *   ├→ rejected（审核拒绝）→ refunded（已退款）
 *   └→ cancelled（用户取消）
 *
 * 当前 ENUM: pending, completed, shipped, cancelled
 * 目标 ENUM: pending, approved, shipped, received, rated, rejected, refunded, cancelled, completed
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 扩展 status ENUM（保留 completed 兼容历史数据）
      const [currentCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exchange_records' AND COLUMN_NAME = 'status'",
        { transaction }
      )
      const currentType = currentCols[0]?.COLUMN_TYPE || ''

      if (!currentType.includes('approved')) {
        await queryInterface.changeColumn(
          'exchange_records',
          'status',
          {
            type: Sequelize.ENUM(
              'pending',
              'approved',
              'shipped',
              'received',
              'rated',
              'rejected',
              'refunded',
              'cancelled',
              'completed'
            ),
            allowNull: false,
            defaultValue: 'pending',
            comment: '订单状态：pending-待审核 | approved-审核通过 | shipped-已发货 | received-已收货 | rated-已评价 | rejected-审核拒绝 | refunded-已退款 | cancelled-已取消 | completed-已完成(历史兼容)'
          },
          { transaction }
        )
        console.log('  ✅ exchange_records.status ENUM 扩展完成')
      } else {
        console.log('  ⏭️  exchange_records.status 已包含新状态，跳过')
      }

      // 2. 新增 received_at 字段
      const [columns] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM exchange_records',
        { transaction }
      )
      const existingFields = columns.map(c => c.Field)

      if (!existingFields.includes('received_at')) {
        await queryInterface.addColumn(
          'exchange_records',
          'received_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '收货时间（Received At）：用户确认收货或7天自动确认的时间'
          },
          { transaction }
        )
        console.log('  ✅ 添加字段 received_at')
      }

      if (!existingFields.includes('auto_confirmed')) {
        await queryInterface.addColumn(
          'exchange_records',
          'auto_confirmed',
          {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: false,
            comment: '是否自动确认收货（Auto Confirmed）：true-7天自动确认 | false-用户手动确认'
          },
          { transaction }
        )
        console.log('  ✅ 添加字段 auto_confirmed')
      }

      if (!existingFields.includes('rejected_at')) {
        await queryInterface.addColumn(
          'exchange_records',
          'rejected_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '拒绝时间（Rejected At）：管理员审核拒绝的时间'
          },
          { transaction }
        )
        console.log('  ✅ 添加字段 rejected_at')
      }

      if (!existingFields.includes('refunded_at')) {
        await queryInterface.addColumn(
          'exchange_records',
          'refunded_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '退款时间（Refunded At）：退款完成的时间'
          },
          { transaction }
        )
        console.log('  ✅ 添加字段 refunded_at')
      }

      // 3. 添加索引
      const [idxCheck] = await queryInterface.sequelize.query(
        'SHOW INDEX FROM exchange_records WHERE Key_name = "idx_exchange_shipped_at"',
        { transaction }
      )

      if (idxCheck.length === 0 && existingFields.includes('shipped_at')) {
        await queryInterface.addIndex(
          'exchange_records',
          ['status', 'shipped_at'],
          { name: 'idx_exchange_shipped_at', transaction }
        )
        console.log('  ✅ 添加索引 idx_exchange_shipped_at（用于7天自动确认查询）')
      }

      await transaction.commit()
      console.log('  ✅ exchange_records 状态扩展迁移完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 移除新增索引
      try {
        await queryInterface.removeIndex('exchange_records', 'idx_exchange_shipped_at', { transaction })
      } catch { /* 索引可能不存在 */ }

      // 移除新增字段
      const fieldsToRemove = ['refunded_at', 'rejected_at', 'auto_confirmed', 'received_at']
      for (const field of fieldsToRemove) {
        try {
          await queryInterface.removeColumn('exchange_records', field, { transaction })
        } catch { /* 字段可能不存在 */ }
      }

      // 回滚 status ENUM
      await queryInterface.changeColumn(
        'exchange_records',
        'status',
        {
          type: Sequelize.ENUM('pending', 'completed', 'shipped', 'cancelled'),
          allowNull: false,
          defaultValue: 'pending',
          comment: '订单状态'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('  ✅ exchange_records 状态扩展回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
