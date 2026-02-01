'use strict'

/**
 * 修复 reminder_history 表主键 AUTO_INCREMENT 问题
 *
 * 问题描述：
 * - reminder_history 表的 reminder_history_id 主键缺少 AUTO_INCREMENT 属性
 * - 导致定时任务在插入历史记录时报 "Validation error"
 *
 * 修复方案：
 * - 添加 AUTO_INCREMENT 属性到 reminder_history_id 字段
 *
 * 创建时间：2026年01月31日
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 检查当前主键是否已有 AUTO_INCREMENT
      const [results] = await queryInterface.sequelize.query(
        `SELECT EXTRA FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'reminder_history' 
         AND COLUMN_NAME = 'reminder_history_id'`,
        { transaction }
      )

      if (results.length > 0 && results[0].EXTRA.includes('auto_increment')) {
        console.log('✅ reminder_history_id 已经有 AUTO_INCREMENT，跳过')
        await transaction.commit()
        return
      }

      // 2. 先清空表中可能的冲突数据（如果有reminder_history_id=0的记录）
      await queryInterface.sequelize.query(
        `DELETE FROM reminder_history WHERE reminder_history_id = 0`,
        { transaction }
      )

      // 3. 修改主键列，添加 AUTO_INCREMENT
      // 注意：MySQL 中 BIGINT 主键需要显式设置 AUTO_INCREMENT
      await queryInterface.sequelize.query(
        `ALTER TABLE reminder_history 
         MODIFY COLUMN reminder_history_id BIGINT NOT NULL AUTO_INCREMENT`,
        { transaction }
      )

      console.log('✅ 成功为 reminder_history_id 添加 AUTO_INCREMENT')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    // 回滚：移除 AUTO_INCREMENT（通常不建议）
    // 这里保持空实现，因为移除 AUTO_INCREMENT 可能导致问题
    console.log('⚠️ 不建议移除 AUTO_INCREMENT，保持现状')
  }
}
