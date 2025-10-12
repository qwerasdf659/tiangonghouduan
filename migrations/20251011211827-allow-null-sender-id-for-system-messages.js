/**
 * 数据库迁移：允许chat_messages.sender_id为NULL
 * 目的：支持系统消息（sender_id为NULL）
 * 创建时间：2025-10-11 北京时间
 *
 * 业务背景：
 * - 系统通知消息没有具体的发送者
 * - sender_id为NULL表示系统消息
 * - message_source='system'标识系统消息
 */

'use strict'

module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔧 修改chat_messages表，允许sender_id为NULL...')

    try {
      // 修改sender_id字段，允许NULL值
      await queryInterface.changeColumn('chat_messages', 'sender_id', {
        type: Sequelize.INTEGER,
        allowNull: true, // ✅ 允许NULL，支持系统消息
        comment: '发送者ID（系统消息为NULL）'
      })

      console.log('✅ sender_id字段已修改为允许NULL')
    } catch (error) {
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    console.log('🔙 回滚：将sender_id恢复为NOT NULL...')

    try {
      // 警告：回滚前需要确保没有NULL值
      // 否则会失败
      await queryInterface.changeColumn('chat_messages', 'sender_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '发送者ID'
      })

      console.log('✅ sender_id字段已恢复为NOT NULL')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      console.error('⚠️ 可能存在sender_id为NULL的记录，请先清理')
      throw error
    }
  }
}
