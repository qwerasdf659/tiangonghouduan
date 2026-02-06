'use strict'

/**
 * 添加 is_tradable 字段到 material_asset_types 表
 *
 * 业务背景：
 * - C2C材料交易功能需要控制哪些材料可以在市场上交易
 * - 所有可叠加资产默认可交易（is_tradable=TRUE）
 * - 运营可通过此字段禁止特定材料的交易（如活动限定材料）
 *
 * 解决方案：
 * - 添加 is_tradable 列（BOOLEAN，默认值 TRUE）
 * - TRUE：该材料可在C2C市场挂牌交易
 * - FALSE：该材料禁止在C2C市场挂牌交易
 *
 * 创建索引：
 * - idx_tradable_enabled: (is_tradable, is_enabled)
 * - 用于快速查询可交易的启用材料列表
 *
 * 决策时间：2026-01-08
 * 风险等级：🟢 低风险（新增列 + 默认值TRUE，不影响现有业务）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：添加 is_tradable 字段到 material_asset_types 表')

      // 1. 检查字段是否已存在
      console.log('📊 步骤1：检查字段是否已存在...')
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM material_asset_types WHERE Field = 'is_tradable'`,
        { transaction }
      )

      if (columns.length > 0) {
        console.log('   ⏭️ is_tradable 字段已存在，跳过添加')
      } else {
        // 2. 添加 is_tradable 字段
        console.log('📊 步骤2：添加 is_tradable 字段...')
        await queryInterface.addColumn(
          'material_asset_types',
          'is_tradable',
          {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment:
              '是否可交易（Is Tradable - C2C市场交易开关）：TRUE-可在市场挂牌交易，FALSE-禁止市场交易'
          },
          { transaction }
        )
        console.log('   ✅ is_tradable 字段添加成功')
      }

      // 3. 检查索引是否已存在
      console.log('📊 步骤3：检查索引是否已存在...')
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM material_asset_types WHERE Key_name = 'idx_tradable_enabled'`,
        { transaction }
      )

      if (indexes.length > 0) {
        console.log('   ⏭️ idx_tradable_enabled 索引已存在，跳过创建')
      } else {
        // 4. 创建索引
        console.log('📊 步骤4：创建 idx_tradable_enabled 索引...')
        await queryInterface.addIndex('material_asset_types', ['is_tradable', 'is_enabled'], {
          name: 'idx_tradable_enabled',
          transaction,
          comment: '索引：可交易状态 + 启用状态（用于C2C市场可交易材料查询）'
        })
        console.log('   ✅ idx_tradable_enabled 索引创建成功')
      }

      // 5. 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成：is_tradable 字段和索引已就绪')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始回滚：移除 is_tradable 字段')

      // 1. 删除索引
      console.log('📊 步骤1：删除 idx_tradable_enabled 索引...')
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM material_asset_types WHERE Key_name = 'idx_tradable_enabled'`,
        { transaction }
      )

      if (indexes.length > 0) {
        await queryInterface.removeIndex('material_asset_types', 'idx_tradable_enabled', {
          transaction
        })
        console.log('   ✅ idx_tradable_enabled 索引已删除')
      } else {
        console.log('   ⏭️ idx_tradable_enabled 索引不存在，跳过删除')
      }

      // 2. 删除字段
      console.log('📊 步骤2：删除 is_tradable 字段...')
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM material_asset_types WHERE Field = 'is_tradable'`,
        { transaction }
      )

      if (columns.length > 0) {
        await queryInterface.removeColumn('material_asset_types', 'is_tradable', { transaction })
        console.log('   ✅ is_tradable 字段已删除')
      } else {
        console.log('   ⏭️ is_tradable 字段不存在，跳过删除')
      }

      // 3. 提交事务
      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
