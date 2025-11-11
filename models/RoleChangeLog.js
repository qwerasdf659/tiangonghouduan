/**
 * 角色权限变更日志模型 - 餐厅积分抽奖系统 V4.0 统一引擎架构
 * 业务场景：记录所有权限变更操作，用于审计和追踪（离职、调动、权限变更等）
 * 创建时间：2025年11月07日
 *
 * 核心功能：
 * 1. 记录所有权限变更操作（激活、停用、角色变更、批量停用）
 * 2. 记录操作人、操作时间、操作原因
 * 3. 记录操作IP地址，用于安全审计
 * 4. 支持批量操作的影响用户数量统计
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const RoleChangeLog = sequelize.define(
    'RoleChangeLog',
    {
      // 日志ID（主键）
      log_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '日志ID（主键）'
      },

      // 目标用户ID（被操作的用户）
      target_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '目标用户ID（被操作的用户，如被停用权限的业务员）'
      },

      // 操作人ID（执行操作的用户）
      operator_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '操作人ID（执行操作的用户，如区域负责人或业务经理）'
      },

      // 操作类型
      operation_type: {
        type: DataTypes.ENUM('activate', 'deactivate', 'role_change', 'batch_deactivate'),
        allowNull: false,
        comment: '操作类型：activate-激活权限，deactivate-停用权限，role_change-角色变更，batch_deactivate-批量停用'
      },

      // 原角色ID
      old_role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'roles',
          key: 'role_id'
        },
        comment: '原角色ID（角色变更时记录，如从业务员变为业务经理）'
      },

      // 新角色ID
      new_role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'roles',
          key: 'role_id'
        },
        comment: '新角色ID（角色变更时记录，如从业务员变为业务经理）'
      },

      // 影响的用户数量
      affected_count: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: '影响的用户数量（批量操作时记录，如停用1个业务经理及其10个业务员，则为11）'
      },

      // 操作原因
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '操作原因（如：离职、调动、违规、权限调整等）'
      },

      // 操作IP地址
      ip_address: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '操作IP地址（用于安全审计）'
      }
    },
    {
      tableName: 'role_change_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 日志表不需要updated_at字段
      underscored: true,
      indexes: [
        { fields: ['target_user_id'], comment: '查询某个用户的权限变更历史' },
        { fields: ['operator_user_id'], comment: '查询某个操作人的操作记录' },
        { fields: ['operation_type'], comment: '按操作类型筛选' },
        { fields: ['created_at'], comment: '按时间排序查询' }
      ],
      comment: '角色权限变更日志表（用于审计和追踪所有权限变更操作）',

      // 钩子函数：确保使用北京时间
      hooks: {
        beforeCreate: (log, _options) => {
          if (!log.created_at) {
            log.created_at = BeijingTimeHelper.createDatabaseTime()
          }
        }
      }
    }
  )

  // 定义关联关系
  RoleChangeLog.associate = function (models) {
    // 多对一：目标用户
    RoleChangeLog.belongsTo(models.User, {
      foreignKey: 'target_user_id',
      as: 'target_user',
      comment: '目标用户信息（被操作的用户）'
    })

    // 多对一：操作人
    RoleChangeLog.belongsTo(models.User, {
      foreignKey: 'operator_user_id',
      as: 'operator',
      comment: '操作人信息（执行操作的用户）'
    })

    // 多对一：原角色
    RoleChangeLog.belongsTo(models.Role, {
      foreignKey: 'old_role_id',
      as: 'old_role',
      comment: '原角色信息'
    })

    // 多对一：新角色
    RoleChangeLog.belongsTo(models.Role, {
      foreignKey: 'new_role_id',
      as: 'new_role',
      comment: '新角色信息'
    })
  }

  return RoleChangeLog
}
