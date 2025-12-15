/**
 * 餐厅积分抽奖系统 - V4.5.0材料系统扩展
 * 迁移文件：扩展lottery_prizes表，支持抽奖发放材料
 *
 * 业务场景：
 * - 抽奖时可以直接发放材料（碎红水晶、完整红水晶等）
 * - 与现有积分、虚拟奖品发放并行，不影响现有功能
 * - 支持配置不同材料类型和数量
 *
 * 新增字段：
 * - material_asset_code: 材料资产代码（如red_shard、red_crystal）
 * - material_amount: 材料数量
 *
 * 业务规则：
 * - material_asset_code非空时，material_amount必须>0
 * - material_asset_code必须是material_asset_types表中存在且启用的资产
 * - 可选配置：奖品可以只发放积分、只发放材料、或同时发放
 *
 * 创建时间：2025年12月15日 18:00
 * 作者：Claude Sonnet 4.5
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加材料发放字段
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize类型定义
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查表是否存在
      const tableExists = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (tableExists[0].count === 0) {
        console.log('⚠️ lottery_prizes表不存在，跳过迁移')
        await transaction.rollback()
        return
      }

      // 检查material_asset_code字段是否已存在
      const columnExists = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'
         AND COLUMN_NAME = 'material_asset_code'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (columnExists[0].count > 0) {
        console.log('⚠️ material_asset_code字段已存在，跳过添加')
        await transaction.commit()
        return
      }

      console.log('✅ 开始为lottery_prizes表添加材料发放字段...')

      // 1. 添加material_asset_code字段
      await queryInterface.addColumn(
        'lottery_prizes',
        'material_asset_code',
        {
          type: Sequelize.STRING(32),
          allowNull: true,
          after: 'category',
          comment: '材料资产代码（如red_shard、red_crystal），NULL表示不发放材料'
        },
        { transaction }
      )
      console.log('  ✓ 添加material_asset_code字段成功')

      // 2. 添加material_amount字段
      await queryInterface.addColumn(
        'lottery_prizes',
        'material_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          after: 'material_asset_code',
          comment: '材料数量（当material_asset_code非空时必须>0）'
        },
        { transaction }
      )
      console.log('  ✓ 添加material_amount字段成功')

      /*
       * 3. 添加CHECK约束：material_asset_code非空时，material_amount必须>0
       * 注意：MySQL的CHECK约束在8.0.16及以上版本才支持
       */
      const dbVersion = await queryInterface.sequelize.query(
        'SELECT VERSION() as version',
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )
      const versionString = dbVersion[0].version
      const majorVersion = parseInt(versionString.split('.')[0])
      const minorVersion = parseInt(versionString.split('.')[1])

      if (majorVersion > 8 || (majorVersion === 8 && minorVersion >= 16)) {
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_prizes
           ADD CONSTRAINT chk_material_amount_positive
           CHECK (material_asset_code IS NULL OR material_amount > 0)`,
          { transaction }
        )
        console.log('  ✓ 添加CHECK约束成功（material_asset_code非空时material_amount必须>0）')
      } else {
        console.log('  ⚠️ MySQL版本<8.0.16，跳过CHECK约束（请在应用层验证）')
      }

      // 4. 添加索引：material_asset_code
      await queryInterface.addIndex(
        'lottery_prizes',
        ['material_asset_code'],
        {
          name: 'idx_lp_material_asset_code',
          transaction
        }
      )
      console.log('  ✓ 添加material_asset_code索引成功')

      /*
       * 5. 添加外键约束到material_asset_types表（可选，但建议添加）
       * 注意：只有在material_asset_types表存在时才添加
       */
      const materialTableExists = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'material_asset_types'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (materialTableExists[0].count > 0) {
        await queryInterface.addConstraint('lottery_prizes', {
          fields: ['material_asset_code'],
          type: 'foreign key',
          name: 'fk_lp_material_asset_code',
          references: {
            table: 'material_asset_types',
            field: 'asset_code'
          },
          onDelete: 'RESTRICT', // 禁止删除被引用的资产类型
          onUpdate: 'CASCADE', // 级联更新asset_code
          transaction
        })
        console.log('  ✓ 添加外键约束成功（关联到material_asset_types表）')
      } else {
        console.log('  ⚠️ material_asset_types表不存在，跳过外键约束')
      }

      await transaction.commit()
      console.log('✅ lottery_prizes表材料发放字段添加完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除材料发放字段
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize类型定义
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查表是否存在
      const tableExists = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (tableExists[0].count === 0) {
        console.log('⚠️ lottery_prizes表不存在，跳过回滚')
        await transaction.rollback()
        return
      }

      console.log('✅ 开始回滚lottery_prizes表材料发放字段...')

      // 1. 删除外键约束（如果存在）
      const fkExists = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'
         AND CONSTRAINT_NAME = 'fk_lp_material_asset_code'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (fkExists[0].count > 0) {
        await queryInterface.removeConstraint(
          'lottery_prizes',
          'fk_lp_material_asset_code',
          { transaction }
        )
        console.log('  ✓ 删除外键约束成功')
      }

      // 2. 删除CHECK约束（如果存在）
      const checkExists = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'
         AND CONSTRAINT_NAME = 'chk_material_amount_positive'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (checkExists[0].count > 0) {
        await queryInterface.sequelize.query(
          'ALTER TABLE lottery_prizes DROP CONSTRAINT chk_material_amount_positive',
          { transaction }
        )
        console.log('  ✓ 删除CHECK约束成功')
      }

      // 3. 删除索引（如果存在）
      try {
        await queryInterface.removeIndex('lottery_prizes', 'idx_lp_material_asset_code', {
          transaction
        })
        console.log('  ✓ 删除material_asset_code索引成功')
      } catch (error) {
        console.log('  ⚠️ 索引不存在或已删除')
      }

      // 4. 删除material_amount字段
      const amountColumnExists = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'
         AND COLUMN_NAME = 'material_amount'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (amountColumnExists[0].count > 0) {
        await queryInterface.removeColumn('lottery_prizes', 'material_amount', { transaction })
        console.log('  ✓ 删除material_amount字段成功')
      }

      // 5. 删除material_asset_code字段
      const codeColumnExists = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_prizes'
         AND COLUMN_NAME = 'material_asset_code'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (codeColumnExists[0].count > 0) {
        await queryInterface.removeColumn('lottery_prizes', 'material_asset_code', { transaction })
        console.log('  ✓ 删除material_asset_code字段成功')
      }

      await transaction.commit()
      console.log('✅ lottery_prizes表材料发放字段回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
