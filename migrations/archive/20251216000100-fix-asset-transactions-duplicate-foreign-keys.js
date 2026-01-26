/**
 * 数据库迁移：修复 asset_transactions 表重复外键问题
 *
 * 🔴 P1-3：清理 asset_transactions.user_id 重复外键
 *
 * 问题背景：
 * - asset_transactions 表的 user_id 字段存在两条重复外键：
 *   - asset_transactions_ibfk_1 (user_id -> users.user_id)
 *   - asset_transactions_ibfk_2 (user_id -> users.user_id)
 * - 重复外键会导致：
 *   - 迁移/DDL 风险：删除外键时可能只删掉一条，导致约束仍然生效
 *   - 运维排障成本：删除用户、清理数据时报错信息混乱
 *   - 一致性治理隐患：schema 不干净，影响生产变更信心
 *
 * 修复方案：
 * - 删除两条重复外键（asset_transactions_ibfk_1 和 asset_transactions_ibfk_2）
 * - 重建一条标准命名的外键（fk_asset_transactions_user_id）
 * - 保持约束语义不变（RESTRICT + CASCADE）
 *
 * 迁移版本：v4.2.1-p1-3
 * 创建时间：2025-12-16
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：清理重复外键并重建标准外键
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 P1-3：开始修复 asset_transactions 表重复外键问题...')

      /*
       * ========================================
       * 第1步：检查并删除重复外键
       * ========================================
       */
      console.log('📋 第1步：检查现有外键约束...')

      // 查询当前外键约束
      const [foreignKeys] = await queryInterface.sequelize.query(
        `
        SELECT 
          CONSTRAINT_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'asset_transactions'
          AND REFERENCED_TABLE_NAME IS NOT NULL
          AND COLUMN_NAME = 'user_id'
        ORDER BY CONSTRAINT_NAME
        `,
        { transaction }
      )

      console.log(`✓ 找到 ${foreignKeys.length} 条 user_id 外键约束:`)
      foreignKeys.forEach(fk => {
        console.log(
          `  - ${fk.CONSTRAINT_NAME}: ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`
        )
      })

      // 删除所有 user_id 相关的外键（包括重复的）
      for (const fk of foreignKeys) {
        console.log(`🗑️ 删除外键约束: ${fk.CONSTRAINT_NAME}`)
        await queryInterface.removeConstraint('asset_transactions', fk.CONSTRAINT_NAME, {
          transaction
        })
        console.log(`✓ 外键约束 ${fk.CONSTRAINT_NAME} 已删除`)
      }

      /*
       * ========================================
       * 第2步：重建标准命名的外键约束
       * ========================================
       */
      console.log('📋 第2步：重建标准命名的外键约束...')

      await queryInterface.addConstraint('asset_transactions', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_asset_transactions_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT', // 保护流水数据：不允许删除有流水记录的用户
        onUpdate: 'CASCADE', // 用户ID更新时级联更新流水记录
        transaction
      })

      console.log('✓ 标准外键约束 fk_asset_transactions_user_id 创建成功')

      /*
       * ========================================
       * 第3步：验证修复结果
       * ========================================
       */
      console.log('📋 第3步：验证修复结果...')

      const [newForeignKeys] = await queryInterface.sequelize.query(
        `
        SELECT 
          CONSTRAINT_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'asset_transactions'
          AND REFERENCED_TABLE_NAME IS NOT NULL
          AND COLUMN_NAME = 'user_id'
        ORDER BY CONSTRAINT_NAME
        `,
        { transaction }
      )

      if (newForeignKeys.length !== 1) {
        throw new Error(`验证失败：期望 user_id 外键数量为 1，实际为 ${newForeignKeys.length}`)
      }

      if (newForeignKeys[0].CONSTRAINT_NAME !== 'fk_asset_transactions_user_id') {
        throw new Error(
          `验证失败：期望外键名称为 fk_asset_transactions_user_id，实际为 ${newForeignKeys[0].CONSTRAINT_NAME}`
        )
      }

      console.log('✅ 验证通过：user_id 外键约束已修复为单一标准外键')
      console.log(`   外键名称: ${newForeignKeys[0].CONSTRAINT_NAME}`)
      console.log(
        `   约束关系: ${newForeignKeys[0].COLUMN_NAME} -> ${newForeignKeys[0].REFERENCED_TABLE_NAME}.${newForeignKeys[0].REFERENCED_COLUMN_NAME}`
      )

      await transaction.commit()
      console.log('✅ P1-3：asset_transactions 表重复外键修复完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ P1-3：修复 asset_transactions 表重复外键失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>} Promise对象
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 回滚 P1-3：恢复原有外键约束（注意：不会恢复重复外键）...')

      // 删除标准外键
      await queryInterface.removeConstraint('asset_transactions', 'fk_asset_transactions_user_id', {
        transaction
      })
      console.log('✓ 标准外键约束 fk_asset_transactions_user_id 已删除')

      // 重建一条外键（不恢复重复外键，因为重复外键本身就是问题）
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

      console.log('✓ 外键约束 asset_transactions_ibfk_1 已恢复')
      console.log('⚠️ 注意：回滚不会恢复重复外键 asset_transactions_ibfk_2（因为它本身就是问题）')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
