'use strict'

/**
 * 修复 material_asset_types.group_code 外键约束
 *
 * 业务背景（2026-01-14 分类系统升级）：
 * - 新建 asset_group_defs 字典表管理资产分组
 * - material_asset_types.group_code 需要引用 asset_group_defs.group_code
 * - 需要先确保数据一致性，再添加外键约束
 *
 * 迁移内容：
 * 1. 修复遗留的大写 group_code（如 CURRENCY -> currency）
 * 2. 添加外键约束 fk_mat_group_code -> asset_group_defs.group_code
 *
 * 创建时间：2026-01-15
 * 相关决策：MarketListingService-category参数兼容残留清理报告-2026-01-13.md
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 修复遗留的大写 group_code（幂等操作）
      await queryInterface.sequelize.query(
        'UPDATE material_asset_types SET group_code = LOWER(group_code) WHERE group_code <> LOWER(group_code)',
        { transaction }
      )
      console.log('✅ group_code 已转为小写')

      // 2. 检查外键是否已存在
      const [existingFKs] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME 
         FROM information_schema.TABLE_CONSTRAINTS 
         WHERE TABLE_NAME = 'material_asset_types' 
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'
         AND CONSTRAINT_NAME = 'fk_mat_group_code'`,
        { transaction }
      )

      if (existingFKs.length === 0) {
        // 3. 添加外键约束
        await queryInterface.addConstraint('material_asset_types', {
          fields: ['group_code'],
          type: 'foreign key',
          name: 'fk_mat_group_code',
          references: {
            table: 'asset_group_defs',
            field: 'group_code'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          transaction
        })
        console.log('✅ 外键约束 fk_mat_group_code 已添加')
      } else {
        console.log('⏭️ 外键约束 fk_mat_group_code 已存在，跳过')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：material_asset_types.group_code 外键约束')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 移除外键约束
      await queryInterface.removeConstraint('material_asset_types', 'fk_mat_group_code', {
        transaction
      })
      console.log('✅ 外键约束 fk_mat_group_code 已移除')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      // 外键可能不存在，忽略错误
      console.log('⚠️ 回滚：外键约束可能不存在')
    }
  }
}
