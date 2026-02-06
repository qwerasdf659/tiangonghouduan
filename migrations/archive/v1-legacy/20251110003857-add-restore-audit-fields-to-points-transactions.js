/**
 * 数据库迁移：为points_transactions表添加恢复审计字段
 *
 * 迁移说明：
 * - 添加4个恢复审计字段：restored_by、restored_at、restore_reason、restore_count
 * - 添加审计查询索引：idx_restored_by_time
 * - 符合《恢复交易记录API实施方案.md》方案2（审计增强方案）
 *
 * 业务价值：
 * - 完整审计日志：追溯"谁在什么时间因为什么原因恢复了记录"
 * - 防止滥用：通过restore_count限制频繁恢复
 * - 管理追溯：通过restored_by查询管理员操作记录
 *
 * 创建时间：2025-11-10
 * 影响表：points_transactions
 * 兼容性：向后兼容（新增字段，不影响现有查询）
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加恢复审计字段
   */
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始添加恢复审计字段...')

      // 1. 添加恢复操作员ID字段（记录是谁恢复的记录）
      await queryInterface.addColumn(
        'points_transactions',
        'restored_by',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
          comment: '恢复操作员ID（管理员user_id，NULL表示从未恢复）',
          after: 'deleted_at'
        },
        { transaction }
      )
      console.log('✅ restored_by字段添加成功')

      // 2. 添加恢复时间字段（记录恢复操作的时间）
      await queryInterface.addColumn(
        'points_transactions',
        'restored_at',
        {
          type: Sequelize.DATE(3),
          allowNull: true,
          defaultValue: null,
          comment: '恢复时间（北京时间GMT+8，NULL表示从未恢复）',
          after: 'restored_by'
        },
        { transaction }
      )
      console.log('✅ restored_at字段添加成功')

      // 3. 添加恢复原因字段（记录为什么恢复该记录）
      await queryInterface.addColumn(
        'points_transactions',
        'restore_reason',
        {
          type: Sequelize.TEXT,
          allowNull: true,
          defaultValue: null,
          comment: '恢复原因（管理员填写，用于审计追溯）',
          after: 'restored_at'
        },
        { transaction }
      )
      console.log('✅ restore_reason字段添加成功')

      // 4. 添加恢复次数字段（记录该记录被恢复的累计次数）
      await queryInterface.addColumn(
        'points_transactions',
        'restore_count',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '恢复次数（累计被恢复的次数，用于防止滥用）',
          after: 'restore_reason'
        },
        { transaction }
      )
      console.log('✅ restore_count字段添加成功')

      // 5. 检查索引是否已存在
      const [indexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM points_transactions WHERE Key_name = 'idx_restored_by_time'",
        { transaction }
      )

      if (indexes.length === 0) {
        // 添加审计查询索引（加速按操作员和时间查询）
        await queryInterface.addIndex('points_transactions', ['restored_by', 'restored_at'], {
          name: 'idx_restored_by_time',
          transaction
        })
        console.log('✅ idx_restored_by_time索引添加成功')
      } else {
        console.log('⏭️ idx_restored_by_time索引已存在，跳过')
      }

      // 6. 验证字段添加结果
      const [results] = await queryInterface.sequelize.query(
        `SELECT 
          COLUMN_NAME,
          COLUMN_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_COMMENT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'points_transactions'
          AND COLUMN_NAME IN ('restored_by', 'restored_at', 'restore_reason', 'restore_count')
        ORDER BY ORDINAL_POSITION`,
        { transaction }
      )

      console.log('\n📋 验证结果：')
      console.log(JSON.stringify(results, null, 2))

      if (results.length === 4) {
        console.log('\n✅ 所有恢复审计字段添加成功！')
      } else {
        throw new Error(`字段验证失败：期望4个字段，实际${results.length}个`)
      }

      await transaction.commit()
      console.log('\n🎉 迁移执行成功！')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除恢复审计字段
   */
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚恢复审计字段...')

      // 1. 删除索引
      const [indexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM points_transactions WHERE Key_name = 'idx_restored_by_time'",
        { transaction }
      )

      if (indexes.length > 0) {
        await queryInterface.removeIndex('points_transactions', 'idx_restored_by_time', {
          transaction
        })
        console.log('✅ idx_restored_by_time索引删除成功')
      }

      // 2. 删除字段
      await queryInterface.removeColumn('points_transactions', 'restore_count', { transaction })
      console.log('✅ restore_count字段删除成功')

      await queryInterface.removeColumn('points_transactions', 'restore_reason', { transaction })
      console.log('✅ restore_reason字段删除成功')

      await queryInterface.removeColumn('points_transactions', 'restored_at', { transaction })
      console.log('✅ restored_at字段删除成功')

      await queryInterface.removeColumn('points_transactions', 'restored_by', { transaction })
      console.log('✅ restored_by字段删除成功')

      await transaction.commit()
      console.log('\n🎉 回滚执行成功！')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 回滚执行失败:', error.message)
      throw error
    }
  }
}
