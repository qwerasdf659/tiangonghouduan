'use strict'

/**
 * redemption_orders 表添加门店关联字段
 *
 * 业务背景：核销码系统升级 Phase 1（决策 B1 + 决策 8）
 * - 核销时需要记录在哪个门店、哪个员工执行的核销操作
 * - 通过 store_staff 绑定关系自动确定门店（美团/口碑模式）
 *
 * 新增字段：
 * - fulfilled_store_id: 核销门店ID（FK → stores.store_id）
 * - fulfilled_by_staff_id: 核销员工ID（FK → store_staff.store_staff_id）
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查字段是否已存在（幂等）
      const [columns] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM redemption_orders',
        { transaction }
      )
      const existingFields = columns.map(c => c.Field)

      if (!existingFields.includes('fulfilled_store_id')) {
        await queryInterface.addColumn(
          'redemption_orders',
          'fulfilled_store_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '核销门店ID（Fulfilled Store ID）：记录核销发生在哪个门店',
            references: {
              model: 'stores',
              key: 'store_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          { transaction }
        )
        console.log('  ✅ 添加字段 fulfilled_store_id')
      } else {
        console.log('  ⏭️  fulfilled_store_id 已存在，跳过')
      }

      if (!existingFields.includes('fulfilled_by_staff_id')) {
        await queryInterface.addColumn(
          'redemption_orders',
          'fulfilled_by_staff_id',
          {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '核销员工ID（Fulfilled By Staff ID）：执行核销操作的门店员工',
            references: {
              model: 'store_staff',
              key: 'store_staff_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          { transaction }
        )
        console.log('  ✅ 添加字段 fulfilled_by_staff_id')
      } else {
        console.log('  ⏭️  fulfilled_by_staff_id 已存在，跳过')
      }

      // 添加索引（先检查是否已存在）
      const [indexes] = await queryInterface.sequelize.query(
        'SHOW INDEX FROM redemption_orders WHERE Key_name = "idx_fulfilled_store"',
        { transaction }
      )

      if (indexes.length === 0) {
        await queryInterface.addIndex(
          'redemption_orders',
          ['fulfilled_store_id'],
          { name: 'idx_fulfilled_store', transaction }
        )
        console.log('  ✅ 添加索引 idx_fulfilled_store')
      }

      const [staffIdx] = await queryInterface.sequelize.query(
        'SHOW INDEX FROM redemption_orders WHERE Key_name = "idx_fulfilled_staff"',
        { transaction }
      )

      if (staffIdx.length === 0) {
        await queryInterface.addIndex(
          'redemption_orders',
          ['fulfilled_by_staff_id'],
          { name: 'idx_fulfilled_staff', transaction }
        )
        console.log('  ✅ 添加索引 idx_fulfilled_staff')
      }

      await transaction.commit()
      console.log('  ✅ redemption_orders 门店关联字段迁移完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.removeIndex('redemption_orders', 'idx_fulfilled_staff', { transaction })
      await queryInterface.removeIndex('redemption_orders', 'idx_fulfilled_store', { transaction })
      await queryInterface.removeColumn('redemption_orders', 'fulfilled_by_staff_id', { transaction })
      await queryInterface.removeColumn('redemption_orders', 'fulfilled_store_id', { transaction })

      await transaction.commit()
      console.log('  ✅ redemption_orders 门店关联字段回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
