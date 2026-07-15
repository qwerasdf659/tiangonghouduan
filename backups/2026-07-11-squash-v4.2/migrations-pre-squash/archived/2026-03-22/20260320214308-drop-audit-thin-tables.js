'use strict'

/**
 * Drop 3 audit thin-tables that were only used as surrogate-key anchors for
 * admin_operation_logs.target_id.  The authoritative audit trail lives in
 * admin_operation_logs; these tables have 0 direct consumers.
 *
 * CSV backups were exported to backups/ before this migration.
 *
 * Dropped tables:
 *   - user_status_change_records  (294 rows)
 *   - user_role_change_records    (295 rows)
 *   - lottery_clear_setting_records (835 rows)
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('user_status_change_records')
    await queryInterface.dropTable('user_role_change_records')
    await queryInterface.dropTable('lottery_clear_setting_records')
  },

  async down(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize

    await queryInterface.createTable('user_status_change_records', {
      user_status_change_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '变更记录ID（作为审计日志 target_id）'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '被变更状态的用户ID'
      },
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '执行变更的操作员ID'
      },
      old_status: {
        type: DataTypes.ENUM('active', 'inactive', 'banned', 'pending'),
        allowNull: false,
        comment: '变更前状态'
      },
      new_status: {
        type: DataTypes.ENUM('active', 'inactive', 'banned', 'pending'),
        allowNull: false,
        comment: '变更后状态'
      },
      reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '状态变更原因'
      },
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键'
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '额外元数据'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      }
    })

    await queryInterface.createTable('user_role_change_records', {
      user_role_change_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '变更记录ID（作为审计日志 target_id）'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '被变更角色的用户ID'
      },
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '执行变更的操作员ID'
      },
      old_role: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '变更前角色名'
      },
      new_role: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '变更后角色名'
      },
      reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '角色变更原因'
      },
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键'
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '额外元数据'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      }
    })

    await queryInterface.createTable('lottery_clear_setting_records', {
      lottery_clear_setting_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '清除记录ID（作为审计日志 target_id）'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '被清除设置的用户ID'
      },
      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '执行清除的管理员ID'
      },
      setting_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: 'all',
        comment: '清除的设置类型'
      },
      cleared_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '本次清除的设置记录数量'
      },
      reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '清除原因'
      },
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键'
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '额外元数据'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      }
    })

    await queryInterface.addIndex('lottery_clear_setting_records', ['user_id'], {
      name: 'idx_clear_records_user_id'
    })
    await queryInterface.addIndex('lottery_clear_setting_records', ['admin_id'], {
      name: 'idx_clear_records_admin_id'
    })
    await queryInterface.addIndex('lottery_clear_setting_records', ['created_at'], {
      name: 'idx_clear_records_created_at'
    })
  }
}
