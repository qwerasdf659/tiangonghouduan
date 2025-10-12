/**
 * 创建操作审计日志表
 *
 * 功能说明：
 * - 创建audit_logs表用于记录所有敏感操作
 * - 支持追溯管理员操作历史
 * - 记录操作前后数据对比
 * - 记录安全信息（IP、User-Agent等）
 *
 * 创建时间：2025-10-12
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 创建audit_logs表
    await queryInterface.createTable('audit_logs', {
      log_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '审计日志ID'
      },
      operator_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '操作员ID（管理员user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      operation_type: {
        type: Sequelize.ENUM(
          'points_adjust',
          'exchange_audit',
          'product_update',
          'product_create',
          'product_delete',
          'user_status_change',
          'prize_config',
          'prize_create',
          'prize_delete',
          'campaign_config',
          'role_assign',
          'system_config'
        ),
        allowNull: false,
        comment: '操作类型'
      },
      target_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '目标对象类型（User/Product/Prize等）'
      },
      target_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '目标对象ID'
      },
      action: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '操作动作（create/update/delete/approve/reject等）'
      },
      before_data: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '操作前数据（JSON格式）'
      },
      after_data: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '操作后数据（JSON格式）'
      },
      changed_fields: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '变更字段列表'
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '操作原因/备注'
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
        comment: 'IP地址（支持IPv4和IPv6）'
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: '用户代理字符串'
      },
      business_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: '业务关联ID'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '操作时间'
      }
    }, {
      comment: '操作审计日志表（记录所有敏感操作）',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      engine: 'InnoDB'
    })

    // 创建索引
    await queryInterface.addIndex('audit_logs', ['operator_id'], {
      name: 'idx_audit_logs_operator',
      comment: '操作员索引'
    })

    await queryInterface.addIndex('audit_logs', ['operation_type'], {
      name: 'idx_audit_logs_operation_type',
      comment: '操作类型索引'
    })

    await queryInterface.addIndex('audit_logs', ['target_type', 'target_id'], {
      name: 'idx_audit_logs_target',
      comment: '目标对象索引'
    })

    await queryInterface.addIndex('audit_logs', ['created_at'], {
      name: 'idx_audit_logs_created',
      comment: '创建时间索引'
    })

    await queryInterface.addIndex('audit_logs', ['business_id'], {
      name: 'idx_audit_logs_business_id',
      comment: '业务关联ID索引'
    })

    await queryInterface.addIndex('audit_logs', ['ip_address'], {
      name: 'idx_audit_logs_ip',
      comment: 'IP地址索引'
    })

    console.log('✅ audit_logs表创建成功')
  },

  down: async (queryInterface) => {
    // 删除表
    await queryInterface.dropTable('audit_logs')
    console.log('✅ audit_logs表已删除')
  }
}
