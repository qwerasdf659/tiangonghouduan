'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. 添加message_source字段到chat_messages表
    await queryInterface.addColumn('chat_messages', 'message_source', {
      type: Sequelize.ENUM('user_client', 'admin_client', 'system'),
      allowNull: true, // 初始设为可空，稍后会更新历史数据
      comment: '消息来源：user_client=用户端，admin_client=管理员端，system=系统消息',
      after: 'sender_type' // 放在sender_type字段之后
    })

    console.log('✅ message_source字段添加成功')

    // 2. 修复历史数据的senderType（确保不为空）
    await queryInterface.sequelize.query(`
      UPDATE chat_messages 
      SET sender_type = CASE 
        WHEN sender_id IN (
          SELECT DISTINCT u.user_id 
          FROM users u 
          INNER JOIN admin_status a ON u.user_id = a.admin_id 
          WHERE a.admin_id IS NOT NULL
        ) THEN 'admin'
        ELSE 'user'
      END 
      WHERE sender_type IS NULL OR sender_type = ''
    `)

    console.log('✅ 历史数据sender_type修复完成')

    // 3. 为历史数据设置默认message_source
    await queryInterface.sequelize.query(`
      UPDATE chat_messages 
      SET message_source = CASE 
        WHEN sender_type = 'admin' THEN 'admin_client'
        ELSE 'user_client'
      END 
      WHERE message_source IS NULL
    `)

    console.log('✅ 历史数据message_source设置完成')

    // 4. 将message_source字段设为NOT NULL
    await queryInterface.changeColumn('chat_messages', 'message_source', {
      type: Sequelize.ENUM('user_client', 'admin_client', 'system'),
      allowNull: false,
      comment: '消息来源：user_client=用户端，admin_client=管理员端，system=系统消息'
    })

    // 5. 创建索引提高查询性能
    await queryInterface.addIndex('chat_messages', ['message_source', 'sender_type'], {
      name: 'idx_chat_messages_source_type'
    })

    console.log('✅ message_source字段和索引创建完成')
  },

  async down (queryInterface, _Sequelize) {
    // 移除索引
    await queryInterface.removeIndex('chat_messages', 'idx_chat_messages_source_type')

    // 移除message_source字段
    await queryInterface.removeColumn('chat_messages', 'message_source')

    console.log('✅ message_source字段回滚完成')
  }
}
