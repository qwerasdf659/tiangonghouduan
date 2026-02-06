/**
 * 数据库迁移：清理asset_transactions表重复的user_id外键约束
 *
 * 业务场景：
 * - 发现asset_transactions表存在2个user_id外键：
 *   1. asset_transactions_ibfk_1 (自动生成的旧约束)
 *   2. fk_asset_transactions_user_id (标准命名的新约束)
 * - 保留标准命名的约束，删除旧约束
 *
 * 影响范围：
 * - 仅影响数据库结构，不影响数据
 * - 删除重复约束不会影响现有数据的完整性
 *
 * 创建时间：2025年12月18日
 * 创建原因：技术债务清理 - P1验证测试发现重复外键
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：删除重复的外键约束
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize类
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('===== 开始清理asset_transactions重复外键约束 =====')

      // 1. 检查约束是否存在（防御性编程）
      const [constraints] = await queryInterface.sequelize.query(
        `
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'asset_transactions'
          AND COLUMN_NAME = 'user_id'
          AND CONSTRAINT_NAME = 'asset_transactions_ibfk_1'
          AND REFERENCED_TABLE_NAME = 'users'
        `,
        { transaction }
      )

      if (constraints.length === 0) {
        console.log('✅ 约束 asset_transactions_ibfk_1 不存在，无需删除')
        await transaction.commit()
        return
      }

      // 2. 删除重复的外键约束
      console.log('🗑️ 删除重复外键约束: asset_transactions_ibfk_1')
      await queryInterface.removeConstraint('asset_transactions', 'asset_transactions_ibfk_1', {
        transaction
      })

      // 3. 验证删除结果
      const [remainingConstraints] = await queryInterface.sequelize.query(
        `
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'asset_transactions'
          AND COLUMN_NAME = 'user_id'
          AND REFERENCED_TABLE_NAME = 'users'
        ORDER BY CONSTRAINT_NAME
        `,
        { transaction }
      )

      console.log('✅ 删除成功，剩余外键约束：')
      remainingConstraints.forEach(constraint => {
        console.log(`   - ${constraint.CONSTRAINT_NAME}`)
      })

      if (remainingConstraints.length !== 1) {
        throw new Error(`期望剩余1个外键约束，实际剩余${remainingConstraints.length}个`)
      }

      if (remainingConstraints[0].CONSTRAINT_NAME !== 'fk_asset_transactions_user_id') {
        throw new Error(
          `期望保留约束fk_asset_transactions_user_id，实际保留${remainingConstraints[0].CONSTRAINT_NAME}`
        )
      }

      await transaction.commit()
      console.log('===== asset_transactions重复外键清理完成 =====')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：恢复被删除的外键约束
   *
   * 注意：通常不需要回滚（删除重复约束是正确的操作）
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize类
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('===== 开始回滚：恢复asset_transactions_ibfk_1约束 =====')

      // 检查约束是否已存在
      const [existingConstraints] = await queryInterface.sequelize.query(
        `
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'asset_transactions'
          AND COLUMN_NAME = 'user_id'
          AND CONSTRAINT_NAME = 'asset_transactions_ibfk_1'
        `,
        { transaction }
      )

      if (existingConstraints.length > 0) {
        console.log('✅ 约束 asset_transactions_ibfk_1 已存在，无需恢复')
        await transaction.commit()
        return
      }

      // 恢复外键约束（使用与删除的约束相同的配置）
      await queryInterface.addConstraint('asset_transactions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'asset_transactions_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      console.log('✅ 约束 asset_transactions_ibfk_1 已恢复')
      await transaction.commit()
      console.log('===== 回滚完成 =====')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
