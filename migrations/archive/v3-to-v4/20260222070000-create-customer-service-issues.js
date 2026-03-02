'use strict'

/**
 * 客服工单表（customer_service_issues） — GM工作台核心表
 *
 * 业务背景：
 * - 客服聊天中发现的问题需要工单跟踪，跨会话跨班次不丢失
 * - 工单独立于会话存在，一个工单可关联多个会话（用户多次来问同一问题）
 * - 工单生命周期：open → processing → resolved → closed
 *
 * 变更内容：
 * 1. 创建 customer_service_issues 表（8种问题类型枚举、4种优先级、4种状态）
 * 2. 添加外键约束（user_id → users、session_id → customer_service_sessions）
 * 3. 添加业务索引（user_id、assigned_to、status、created_at）
 *
 * @version 4.1.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 幂等检查：表是否已存在
      const [tables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'customer_service_issues'",
        { transaction }
      )

      if (tables.length > 0) {
        console.log('  ⏭️ customer_service_issues 表已存在，跳过')
        await transaction.commit()
        return
      }

      await queryInterface.createTable(
        'customer_service_issues',
        {
          issue_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '工单主键ID'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '关联用户ID',
            references: { model: 'users', key: 'user_id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '创建人（客服管理员user_id）',
            references: { model: 'users', key: 'user_id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE'
          },
          assigned_to: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '指派给（客服管理员user_id）',
            references: { model: 'users', key: 'user_id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
          },
          session_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '关联的首次客服会话ID',
            references: {
              model: 'customer_service_sessions',
              key: 'customer_service_session_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
          },
          issue_type: {
            type: Sequelize.ENUM(
              'asset',
              'trade',
              'lottery',
              'item',
              'account',
              'consumption',
              'feedback',
              'other'
            ),
            allowNull: false,
            comment:
              '问题类型：资产/交易/抽奖/物品/账号/消费核销/反馈升级/其他'
          },
          priority: {
            type: Sequelize.ENUM('low', 'medium', 'high', 'urgent'),
            defaultValue: 'medium',
            comment: '优先级：低/中/高/紧急'
          },
          status: {
            type: Sequelize.ENUM('open', 'processing', 'resolved', 'closed'),
            defaultValue: 'open',
            comment: '工单状态：待处理/处理中/已解决/已关闭'
          },
          title: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: '工单标题'
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '问题描述'
          },
          resolution: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '处理结果'
          },
          compensation_log: {
            type: Sequelize.JSON,
            allowNull: true,
            comment:
              '补偿记录JSON（自动填充，格式：[{type, asset_code, amount, item_template_id, quantity}]）'
          },
          resolved_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '解决时间'
          },
          closed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '关闭时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal(
              'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
            ),
            comment: '更新时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '客服工单表 - GM工作台问题跟踪',
          transaction
        }
      )

      // 添加业务索引
      await queryInterface.addIndex(
        'customer_service_issues',
        ['user_id'],
        { name: 'idx_cs_issues_user_id', transaction }
      )
      await queryInterface.addIndex(
        'customer_service_issues',
        ['assigned_to'],
        { name: 'idx_cs_issues_assigned_to', transaction }
      )
      await queryInterface.addIndex(
        'customer_service_issues',
        ['status'],
        { name: 'idx_cs_issues_status', transaction }
      )
      await queryInterface.addIndex(
        'customer_service_issues',
        ['created_at'],
        { name: 'idx_cs_issues_created_at', transaction }
      )
      await queryInterface.addIndex(
        'customer_service_issues',
        ['issue_type'],
        { name: 'idx_cs_issues_type', transaction }
      )

      await transaction.commit()
      console.log('✅ 迁移完成：创建 customer_service_issues 表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.dropTable('customer_service_issues', { transaction })
      await transaction.commit()
      console.log('✅ 回滚完成：删除 customer_service_issues 表')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
