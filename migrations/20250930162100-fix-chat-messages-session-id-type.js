'use strict'

/**
 * 修复 chat_messages.session_id 字段类型
 *
 * 问题: chat_messages.session_id 是 VARCHAR 类型
 *      而 customer_sessions.session_id 是 BIGINT 类型
 *      导致外键类型不匹配,无法建立外键约束
 *
 * 解决方案: 将 session_id 从 VARCHAR 改为 BIGINT
 *         添加外键约束到 customer_sessions.session_id
 *
 * 前提条件: customer_sessions.session_id 已经是 BIGINT AUTO_INCREMENT PRIMARY KEY
 */

module.exports = {
  async up (queryInterface, _Sequelize) {
    console.log('🚀 开始修复 chat_messages.session_id 字段类型...\n')

    try {
      // 1. 检查当前数据量
      const [countResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM chat_messages'
      )
      const recordCount = countResult[0].count
      console.log(`当前 chat_messages 表记录数: ${recordCount}`)

      if (recordCount > 0) {
        throw new Error(
          '⚠️  chat_messages 表有数据,需要手动处理数据迁移!\n' +
          '   请先备份数据,然后清空表或手动建立 session_id 映射关系。'
        )
      }

      // 2. 删除可能存在的外键约束
      console.log('\n[1/4] 删除可能存在的外键约束...')
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE chat_messages DROP FOREIGN KEY chat_messages_ibfk_2
        `)
        console.log('     ✓ 外键约束已删除')
      } catch (e) {
        console.log('     (外键约束不存在,跳过)')
      }

      // 3. 删除session_id的索引（如果存在）
      console.log('\n[2/4] 删除session_id索引...')
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE chat_messages DROP INDEX session_id
        `)
        console.log('     ✓ session_id索引已删除')
      } catch (e) {
        console.log('     (索引不存在,跳过)')
      }

      // 4. 修改session_id字段类型为BIGINT
      console.log('\n[3/4] 修改session_id字段类型为BIGINT...')
      await queryInterface.sequelize.query(`
        ALTER TABLE chat_messages
        MODIFY COLUMN session_id BIGINT NOT NULL
        COMMENT '会话ID(外键关联customer_sessions)'
      `)
      console.log('     ✓ session_id现在是 BIGINT 类型')

      // 5. 添加外键约束
      console.log('\n[4/4] 添加外键约束到customer_sessions...')
      await queryInterface.sequelize.query(`
        ALTER TABLE chat_messages
        ADD CONSTRAINT fk_chat_messages_session_id
        FOREIGN KEY (session_id)
        REFERENCES customer_sessions(session_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
      `)
      console.log('     ✓ 外键约束已创建')

      console.log('\n✅ chat_messages.session_id 修复完成!')
      console.log('\n📋 验证SQL:')
      console.log('   SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY')
      console.log('   FROM INFORMATION_SCHEMA.COLUMNS')
      console.log('   WHERE TABLE_NAME = "chat_messages" AND COLUMN_NAME = "session_id";')
    } catch (error) {
      console.error('\n❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    console.log('⚠️  回滚 chat_messages.session_id 类型修改')

    try {
      // 删除外键约束
      console.log('[1/2] 删除外键约束...')
      await queryInterface.sequelize.query(`
        ALTER TABLE chat_messages DROP FOREIGN KEY fk_chat_messages_session_id
      `)

      // 恢复为VARCHAR类型
      console.log('[2/2] 恢复session_id为VARCHAR类型...')
      await queryInterface.sequelize.query(`
        ALTER TABLE chat_messages
        MODIFY COLUMN session_id VARCHAR(255) NOT NULL
        COMMENT '会话ID'
      `)

      console.log('✅ 回滚完成')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
