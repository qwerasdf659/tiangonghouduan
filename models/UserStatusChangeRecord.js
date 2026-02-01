/**
 * 用户状态变更记录模型（UserStatusChangeRecord Model）
 *
 * 业务场景：为审计日志提供业务主键（决策9实现）
 * - 记录用户状态变更操作（启用/禁用/封禁等）
 * - 主键 record_id 作为审计日志的 target_id
 * - 确保关键操作的可追溯性
 *
 * 表名（snake_case）：user_status_change_records
 * 主键命名：record_id（BIGINT自增）
 *
 * 创建时间：2026-01-08
 * 关联文档：审计统一入口整合方案-2026-01-08.md
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * UserStatusChangeRecord 类定义（用户状态变更记录模型）
 *
 * @class UserStatusChangeRecord
 * @extends {Model}
 */
class UserStatusChangeRecord extends Model {
  /**
   * 模型关联定义
   *
   * @static
   * @param {Object} models - 所有模型的映射对象
   * @returns {void} 无返回值
   */
  static associate(models) {
    // 多对一：被变更状态的用户
    UserStatusChangeRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    // 多对一：执行变更的操作员
    UserStatusChangeRecord.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 生成幂等键（业务主键派生，禁止兜底）
   *
   * 幂等键格式：status_change_{user_id}_{new_status}_{operator_id}_{timestamp}
   *
   * @static
   * @param {number} user_id - 被变更的用户ID
   * @param {string} new_status - 新状态
   * @param {number} operator_id - 操作员ID
   * @returns {string} 幂等键
   */
  static generateIdempotencyKey(user_id, new_status, operator_id) {
    // 使用秒级时间戳（同一秒内对同一用户的相同状态变更视为重复操作）
    const timestamp = Math.floor(Date.now() / 1000)
    return `status_change_${user_id}_${new_status}_${operator_id}_${timestamp}`
  }

  /**
   * 获取状态变更描述
   *
   * @returns {string} 人类可读的状态变更描述
   */
  getChangeDescription() {
    const statusMap = {
      active: '活跃',
      inactive: '禁用',
      banned: '封禁',
      pending: '待激活'
    }
    const oldStatusText = statusMap[this.old_status] || this.old_status
    const newStatusText = statusMap[this.new_status] || this.new_status
    return `${oldStatusText} → ${newStatusText}`
  }
}

/**
 * 模型初始化函数
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @param {DataTypes} _DataTypes - Sequelize数据类型（未使用）
 * @returns {Model} UserStatusChangeRecord模型
 */
module.exports = (sequelize, _DataTypes) => {
  UserStatusChangeRecord.init(
    {
      // 变更记录ID（主键，作为审计日志的 target_id）
      user_status_change_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '变更记录ID（作为审计日志 target_id）'
      },

      // 被变更状态的用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '被变更状态的用户ID'
      },

      // 执行变更的操作员ID
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '执行变更的操作员ID'
      },

      // 变更前状态
      old_status: {
        type: DataTypes.ENUM('active', 'inactive', 'banned', 'pending'),
        allowNull: false,
        comment: '变更前状态：active=活跃/inactive=禁用/banned=封禁/pending=待激活'
      },

      // 变更后状态
      new_status: {
        type: DataTypes.ENUM('active', 'inactive', 'banned', 'pending'),
        allowNull: false,
        comment: '变更后状态：active=活跃/inactive=禁用/banned=封禁/pending=待激活'
      },

      // 变更原因
      reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '状态变更原因（管理员备注）'
      },

      // 幂等键（防止重复操作）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（格式：status_change_{user_id}_{new_status}_{operator_id}_{timestamp}）'
      },

      // 元数据（JSON格式）
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '额外元数据（IP地址、用户代理等）'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      }
    },
    {
      sequelize,
      modelName: 'UserStatusChangeRecord',
      tableName: 'user_status_change_records',
      timestamps: false, // 只有 created_at，不需要 updated_at
      comment: '用户状态变更记录表（为审计日志提供业务主键）',

      // 查询作用域
      scopes: {
        // 查询某用户的状态变更历史
        byUser: user_id => ({
          where: { user_id }
        }),

        // 查询某操作员的操作记录
        byOperator: operator_id => ({
          where: { operator_id }
        })
      }
    }
  )

  return UserStatusChangeRecord
}
