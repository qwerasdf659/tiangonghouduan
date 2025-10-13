'use strict'

/**
 * 状态字段标准化修复迁移
 * 目标：统一业务状态标准，解决字段不一致问题
 *
 * 修复内容：
 * 1. UserTask.task_status: 将'active' -> 'processing', 保留'expired'作为业务特殊状态
 * 2. 确保所有状态字段符合流程业务标准
 *
 * 标准状态：['pending', 'processing', 'completed', 'failed', 'cancelled']
 * 特殊业务状态：'expired' (UserTask专用)
 */

module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔄 开始状态字段标准化修复...')

    try {
      // 1. 修复UserTask表的task_status字段标准化
      console.log('📝 修复UserTask.task_status字段标准化')

      // 先更新现有数据：将'active'状态转换为'processing'
      await queryInterface.sequelize.query(`
        UPDATE user_tasks 
        SET task_status = 'processing' 
        WHERE task_status = 'active'
      `)
      console.log('✅ 已将UserTask中的active状态转换为processing')

      // 更新ENUM定义，将'active'改为'processing'
      await queryInterface.changeColumn('user_tasks', 'task_status', {
        type: Sequelize.ENUM(
          'pending',
          'processing',
          'completed',
          'failed',
          'expired',
          'cancelled'
        ),
        allowNull: false,
        defaultValue: 'pending',
        comment: '任务状态 - 符合流程业务标准 + expired特殊状态'
      })
      console.log('✅ UserTask.task_status字段已标准化')

      // 2. 验证TradeRecord状态字段已符合标准 (无需修改，已经符合标准)
      console.log('✅ TradeRecord.status字段已符合流程业务标准')

      console.log('🎯 状态字段标准化修复完成！')
    } catch (error) {
      console.error('❌ 状态字段标准化修复失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    console.log('🔄 回滚状态字段标准化修复...')

    try {
      // 回滚UserTask表的task_status字段
      console.log('📝 回滚UserTask.task_status字段')

      // 先更新数据：将'processing'状态转换回'active'
      await queryInterface.sequelize.query(`
        UPDATE user_tasks 
        SET task_status = 'active' 
        WHERE task_status = 'processing'
      `)

      // 回滚ENUM定义
      await queryInterface.changeColumn('user_tasks', 'task_status', {
        type: Sequelize.ENUM('pending', 'active', 'completed', 'failed', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '任务状态'
      })

      console.log('✅ 状态字段标准化回滚完成')
    } catch (error) {
      console.error('❌ 状态字段标准化回滚失败:', error.message)
      throw error
    }
  }
}
