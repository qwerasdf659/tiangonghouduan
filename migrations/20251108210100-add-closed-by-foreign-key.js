/**
 * 迁移文件：为customer_service_sessions表的closed_by字段添加外键约束
 *
 * @description 根据项目规范，所有外键必须在数据库层面定义，不能仅依赖ORM层
 * @version 1.0.0
 * @date 2025-11-08
 * @author Claude Sonnet 4
 *
 * 变更内容：
 * - 添加closed_by字段的外键约束，引用users表的user_id
 * - 使用RESTRICT删除策略（关键业务数据保护）
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加外键约束
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize类型定义
   */
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 开始添加closed_by字段的外键约束...')

    try {
      // 检查外键约束是否已存在
      const [existingConstraints] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'customer_service_sessions'
        AND COLUMN_NAME = 'closed_by'
        AND CONSTRAINT_NAME = 'fk_customer_sessions_closed_by'
      `)

      if (existingConstraints.length > 0) {
        console.log('✅ 外键约束fk_customer_sessions_closed_by已存在，跳过创建')
        return
      }

      // 添加外键约束
      await queryInterface.addConstraint('customer_service_sessions', {
        fields: ['closed_by'],
        type: 'foreign key',
        name: 'fk_customer_sessions_closed_by',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT', // 关键业务数据保护：不允许删除被引用的管理员
        onUpdate: 'CASCADE' // 允许级联更新
      })

      console.log('✅ 成功添加外键约束: fk_customer_sessions_closed_by')
      console.log('   customer_service_sessions.closed_by → users.user_id')
      console.log('   删除策略: RESTRICT (保护关键业务数据)')
      console.log('   更新策略: CASCADE')
    } catch (error) {
      console.error('❌ 添加外键约束失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除外键约束
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize类型定义
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔧 开始回滚：删除closed_by字段的外键约束...')

    try {
      // 检查外键约束是否存在
      const [existingConstraints] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'customer_service_sessions'
        AND COLUMN_NAME = 'closed_by'
        AND CONSTRAINT_NAME = 'fk_customer_sessions_closed_by'
      `)

      if (existingConstraints.length === 0) {
        console.log('✅ 外键约束fk_customer_sessions_closed_by不存在，无需删除')
        return
      }

      // 删除外键约束
      await queryInterface.removeConstraint(
        'customer_service_sessions',
        'fk_customer_sessions_closed_by'
      )

      console.log('✅ 成功删除外键约束: fk_customer_sessions_closed_by')
    } catch (error) {
      console.error('❌ 删除外键约束失败:', error.message)
      throw error
    }
  }
}
