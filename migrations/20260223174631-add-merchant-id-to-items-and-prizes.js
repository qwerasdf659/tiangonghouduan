/**
 * 给 items / lottery_prizes / material_asset_types 添加 merchant_id 列
 * 更新 stores.merchant_id 外键指向 merchants 表
 *
 * 业务场景：
 *   - 标识物品来源商家（items.merchant_id）
 *   - 标识奖品赞助商家（lottery_prizes.merchant_id）
 *   - 标识游戏资产归属商家（material_asset_types.merchant_id）
 *   - 门店归属商家（stores.merchant_id → merchants.merchant_id）
 *
 * 历史数据处理：
 *   - 所有现有记录 merchant_id 保持 NULL，表示"平台自营"
 *   - stores.merchant_id 当前值全部为 NULL，不影响现有数据
 *
 * @module migrations/20260223174631-add-merchant-id-to-items-and-prizes
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 开始添加 merchant_id 到 items / lottery_prizes / material_asset_types...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 第一步：items 表添加 merchant_id
      // ============================================================
      console.log('\n📌 第一步：items 表添加 merchant_id...')

      const [itemsCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND COLUMN_NAME = 'merchant_id'",
        { transaction }
      )

      if (itemsCols.length === 0) {
        await queryInterface.addColumn(
          'items',
          'merchant_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'merchants',
              key: 'merchant_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
            comment: '来源商家ID（NULL=平台自营，关联 merchants 表）'
          },
          { transaction }
        )
        await queryInterface.addIndex('items', ['merchant_id'], {
          name: 'idx_items_merchant_id',
          transaction
        })
        console.log('  ✅ items.merchant_id 添加成功')
      } else {
        console.log('  ⏭️ items.merchant_id 已存在，跳过')
      }

      // ============================================================
      // 第二步：lottery_prizes 表添加 merchant_id
      // ============================================================
      console.log('\n📌 第二步：lottery_prizes 表添加 merchant_id...')

      const [prizesCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_prizes' AND COLUMN_NAME = 'merchant_id'",
        { transaction }
      )

      if (prizesCols.length === 0) {
        await queryInterface.addColumn(
          'lottery_prizes',
          'merchant_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'merchants',
              key: 'merchant_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
            comment: '赞助商家ID（NULL=平台自营，关联 merchants 表）'
          },
          { transaction }
        )
        await queryInterface.addIndex('lottery_prizes', ['merchant_id'], {
          name: 'idx_lottery_prizes_merchant_id',
          transaction
        })
        console.log('  ✅ lottery_prizes.merchant_id 添加成功')
      } else {
        console.log('  ⏭️ lottery_prizes.merchant_id 已存在，跳过')
      }

      // ============================================================
      // 第三步：material_asset_types 表添加 merchant_id
      // ============================================================
      console.log('\n📌 第三步：material_asset_types 表添加 merchant_id...')

      const [matCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_asset_types' AND COLUMN_NAME = 'merchant_id'",
        { transaction }
      )

      if (matCols.length === 0) {
        await queryInterface.addColumn(
          'material_asset_types',
          'merchant_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'merchants',
              key: 'merchant_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
            comment: '归属商家ID（NULL=平台资产，关联 merchants 表）'
          },
          { transaction }
        )
        console.log('  ✅ material_asset_types.merchant_id 添加成功')
      } else {
        console.log('  ⏭️ material_asset_types.merchant_id 已存在，跳过')
      }

      // ============================================================
      // 第四步：更新 stores.merchant_id 外键指向 merchants 表
      // ============================================================
      console.log('\n📌 第四步：更新 stores.merchant_id 外键指向 merchants 表...')

      // 查找现有外键
      const [storesFks] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'stores'
           AND COLUMN_NAME = 'merchant_id'
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of storesFks) {
        await queryInterface.removeConstraint('stores', fk.CONSTRAINT_NAME, { transaction })
        console.log(`  🗑️ 删除旧外键: ${fk.CONSTRAINT_NAME}`)
      }

      // 添加新外键指向 merchants 表
      await queryInterface.changeColumn(
        'stores',
        'merchant_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'merchants',
            key: 'merchant_id'
          },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: '归属商家ID（关联 merchants 表，NULL=未分配）'
        },
        { transaction }
      )
      console.log('  ✅ stores.merchant_id 外键已更新为指向 merchants 表')

      await transaction.commit()
      console.log('\n✅ merchant_id 列全部添加完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 恢复 stores.merchant_id 指向 users 表
      const [storesFks] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'stores'
           AND COLUMN_NAME = 'merchant_id'
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )
      for (const fk of storesFks) {
        await queryInterface.removeConstraint('stores', fk.CONSTRAINT_NAME, { transaction })
      }
      await queryInterface.changeColumn(
        'stores',
        'merchant_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: '商户ID（关联商家用户，外键关联users.user_id）'
        },
        { transaction }
      )

      // 删除新增列
      await queryInterface.removeColumn('material_asset_types', 'merchant_id', { transaction })
      await queryInterface.removeColumn('lottery_prizes', 'merchant_id', { transaction })
      await queryInterface.removeColumn('items', 'merchant_id', { transaction })

      await transaction.commit()
      console.log('✅ 回滚：删除 merchant_id 列，恢复 stores 外键')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
