/**
 * 统一审核记录表迁移
 *
 * 功能说明：
 * - 创建统一的audit_records表，用于记录所有业务模块的审核活动
 * - 支持多态关联（auditable_type + auditable_id）
 * - 支持审核状态跟踪和审核意见记录
 *
 * 适用场景：
 * - exchange: 兑换订单审核
 * - image: 图片资源审核
 * - feedback: 用户反馈审核
 * - 未来扩展的其他审核需求
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 检查表是否已存在
    const tables = await queryInterface.showAllTables()
    if (tables.includes('audit_records')) {
      console.log('⚠️  audit_records表已存在，跳过创建')
      return
    }

    await queryInterface.createTable('audit_records', {
      // 主键
      audit_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '审核记录ID'
      },

      // 多态关联字段
      auditable_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '审核对象类型（exchange/image/feedback等）'
      },
      auditable_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '审核对象ID'
      },

      // 审核状态
      audit_status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '审核状态：pending-待审核，approved-已通过，rejected-已拒绝，cancelled-已取消'
      },

      // 审核员信息
      auditor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '审核员ID',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      // 审核意见
      audit_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '审核意见/拒绝原因'
      },

      // 审核数据
      audit_data: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '审核相关数据（JSON格式，存储业务特定信息）'
      },

      // 优先级
      priority: {
        type: Sequelize.ENUM('high', 'medium', 'low'),
        allowNull: false,
        defaultValue: 'medium',
        comment: '审核优先级'
      },

      // 时间字段
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '提交审核时间'
      },
      audited_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '审核完成时间'
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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间'
      }
    })

    // 创建索引
    await queryInterface.addIndex('audit_records', ['auditable_type', 'auditable_id'], {
      name: 'idx_audit_records_auditable',
      comment: '多态关联索引'
    })

    await queryInterface.addIndex('audit_records', ['audit_status'], {
      name: 'idx_audit_records_status',
      comment: '审核状态索引'
    })

    await queryInterface.addIndex('audit_records', ['auditor_id'], {
      name: 'idx_audit_records_auditor',
      comment: '审核员索引'
    })

    await queryInterface.addIndex('audit_records', ['priority', 'submitted_at'], {
      name: 'idx_audit_records_priority_time',
      comment: '优先级和时间复合索引'
    })

    await queryInterface.addIndex('audit_records', ['created_at'], {
      name: 'idx_audit_records_created',
      comment: '创建时间索引'
    })

    console.log('✅ audit_records表创建成功')
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.dropTable('audit_records')
    console.log('✅ audit_records表已删除')
  }
}
