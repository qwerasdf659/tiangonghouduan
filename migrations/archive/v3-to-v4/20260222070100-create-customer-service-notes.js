'use strict'

/**
 * 客服内部备注表（customer_service_notes） — 客服间信息传递
 *
 * 业务背景：
 * - 客服之间需要传递关于用户的内部信息（如"该用户经常投诉"或"上次承诺24小时内解决"）
 * - 备注仅客服可见，用户永远看不到
 * - 可关联到具体工单或会话，也可以是独立的用户级备注
 *
 * 变更内容：
 * 1. 创建 customer_service_notes 表
 * 2. 添加外键约束（user_id/author_id → users）
 * 3. 添加业务索引（user_id、issue_id）
 *
 * @version 4.1.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      const [tables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'customer_service_notes'",
        { transaction }
      )

      if (tables.length > 0) {
        console.log('  ⏭️ customer_service_notes 表已存在，跳过')
        await transaction.commit()
        return
      }

      await queryInterface.createTable(
        'customer_service_notes',
        {
          note_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '备注主键ID'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '关于哪个用户的备注',
            references: { model: 'users', key: 'user_id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE'
          },
          issue_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '关联工单ID（可选）',
            references: {
              model: 'customer_service_issues',
              key: 'issue_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
          },
          session_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '关联会话ID（可选）',
            references: {
              model: 'customer_service_sessions',
              key: 'customer_service_session_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
          },
          author_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '备注作者（客服管理员user_id）',
            references: { model: 'users', key: 'user_id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE'
          },
          content: {
            type: Sequelize.TEXT,
            allowNull: false,
            comment: '备注内容'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '客服内部备注表 - 仅客服可见，用户不可见',
          transaction
        }
      )

      await queryInterface.addIndex(
        'customer_service_notes',
        ['user_id'],
        { name: 'idx_cs_notes_user_id', transaction }
      )
      await queryInterface.addIndex(
        'customer_service_notes',
        ['issue_id'],
        { name: 'idx_cs_notes_issue_id', transaction }
      )

      await transaction.commit()
      console.log('✅ 迁移完成：创建 customer_service_notes 表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.dropTable('customer_service_notes', { transaction })
      await transaction.commit()
      console.log('✅ 回滚完成：删除 customer_service_notes 表')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
