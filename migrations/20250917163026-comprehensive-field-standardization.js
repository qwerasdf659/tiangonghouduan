'use strict'

/**
 * 字段标准化和清理综合操作
 * 整合原来的分散操作：
 * - 字段重命名：awarded_at → distributed_at
 * - 添加过期时间字段：expires_at
 * - 修复外键关系
 * - 移除遗留字段
 */

module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔄 开始字段标准化和清理综合操作...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 字段重命名：awarded_at → distributed_at（业务语义统一）
      console.log('📝 执行字段重命名：awarded_at → distributed_at')

      // 检查字段是否存在
      const [columns] = await queryInterface.sequelize.query(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = \'user_specific_prize_queue\' AND TABLE_SCHEMA = DATABASE()',
        { transaction }
      )

      const columnNames = columns.map(row => row.COLUMN_NAME)

      if (columnNames.includes('awarded_at')) {
        await queryInterface.renameColumn('user_specific_prize_queue', 'awarded_at', 'distributed_at', { transaction })
        console.log('✅ 字段重命名成功：awarded_at → distributed_at')
      } else {
        console.log('ℹ️ awarded_at字段不存在，跳过重命名')
      }

      // 2. 添加expires_at字段（奖品队列过期管理）
      console.log('📝 添加expires_at字段...')

      if (!columnNames.includes('expires_at')) {
        await queryInterface.addColumn('user_specific_prize_queue', 'expires_at', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '队列过期时间，过期后自动失效'
        }, { transaction })
        console.log('✅ expires_at字段添加成功')
      } else {
        console.log('ℹ️ expires_at字段已存在，跳过添加')
      }

      // 3. 修复缺失的外键关系
      console.log('📝 修复缺失的外键关系...')

      // 检查外键是否存在的通用函数
      const checkForeignKey = async (tableName, constraintName) => {
        const [fkeys] = await queryInterface.sequelize.query(
          `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = ? 
             AND CONSTRAINT_NAME = ?`,
          { replacements: [tableName, constraintName], transaction }
        )
        return fkeys.length > 0
      }

      // 添加user_specific_prize_queue表的外键（如果不存在）
      const hasUserFK = await checkForeignKey('user_specific_prize_queue', 'fk_user_prize_queue_user')
      if (!hasUserFK) {
        try {
          await queryInterface.addConstraint('user_specific_prize_queue', {
            fields: ['user_id'],
            type: 'foreign key',
            name: 'fk_user_prize_queue_user',
            references: {
              table: 'users',
              field: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          }, { transaction })
          console.log('✅ 添加user_specific_prize_queue外键约束成功')
        } catch (error) {
          console.log('ℹ️ 外键约束添加失败，可能已存在或表结构不支持')
        }
      }

      // 4. 移除遗留字段（如果存在）
      console.log('📝 清理遗留字段...')

      // 检查并移除draw_result字段（已被is_winner替代）
      const [decisionColumns] = await queryInterface.sequelize.query(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = \'unified_decision_records\' AND TABLE_SCHEMA = DATABASE()',
        { transaction }
      )

      const decisionColumnNames = decisionColumns.map(row => row.COLUMN_NAME)

      if (decisionColumnNames.includes('draw_result')) {
        await queryInterface.removeColumn('unified_decision_records', 'draw_result', { transaction })
        console.log('✅ 移除遗留字段draw_result成功')
      } else {
        console.log('ℹ️ 遗留字段draw_result不存在，跳过删除')
      }

      await transaction.commit()
      console.log('🎯 字段标准化和清理综合操作完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 字段标准化操作失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    console.log('🔄 回滚字段标准化和清理操作...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚操作（逆序执行）

      // 1. 恢复draw_result字段
      console.log('📝 恢复draw_result字段...')
      try {
        await queryInterface.addColumn('unified_decision_records', 'draw_result', {
          type: Sequelize.ENUM('win', 'lose'),
          allowNull: true,
          comment: '抽奖结果（遗留字段）'
        }, { transaction })
        console.log('✅ draw_result字段恢复成功')
      } catch (error) {
        console.log('ℹ️ draw_result字段恢复失败，可能已存在')
      }

      // 2. 移除外键约束
      console.log('📝 移除外键约束...')
      try {
        await queryInterface.removeConstraint('user_specific_prize_queue', 'fk_user_prize_queue_user', { transaction })
        console.log('✅ 外键约束移除成功')
      } catch (error) {
        console.log('ℹ️ 外键约束移除失败，可能不存在')
      }

      // 3. 移除expires_at字段
      console.log('📝 移除expires_at字段...')
      try {
        await queryInterface.removeColumn('user_specific_prize_queue', 'expires_at', { transaction })
        console.log('✅ expires_at字段移除成功')
      } catch (error) {
        console.log('ℹ️ expires_at字段移除失败，可能不存在')
      }

      // 4. 回滚字段重命名：distributed_at → awarded_at
      console.log('📝 回滚字段重命名：distributed_at → awarded_at')
      try {
        await queryInterface.renameColumn('user_specific_prize_queue', 'distributed_at', 'awarded_at', { transaction })
        console.log('✅ 字段重命名回滚成功')
      } catch (error) {
        console.log('ℹ️ 字段重命名回滚失败，可能字段不存在')
      }

      await transaction.commit()
      console.log('🎯 字段标准化和清理操作回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
