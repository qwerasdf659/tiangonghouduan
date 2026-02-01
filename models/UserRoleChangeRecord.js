/**
 * 用户角色变更记录模型（UserRoleChangeRecord Model）
 *
 * 业务场景：为审计日志提供业务主键（决策9实现）
 * - 记录用户角色变更操作（升级/降级/授权等）
 * - 主键 user_role_change_record_id 作为审计日志的 target_id
 * - 确保关键操作的可追溯性
 *
 * 注意：与 RoleChangeLog 模型的区别
 * - RoleChangeLog：记录角色权限变更，使用 role_id 外键引用 roles 表
 * - UserRoleChangeRecord：专门为审计日志提供业务主键，使用角色名称字符串
 *
 * 表名（snake_case）：user_role_change_records
 * 主键命名：user_role_change_record_id（BIGINT自增）
 *
 * 创建时间：2026-01-08
 * 关联文档：审计统一入口整合方案-2026-01-08.md
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * UserRoleChangeRecord 类定义（用户角色变更记录模型）
 *
 * @class UserRoleChangeRecord
 * @extends {Model}
 */
class UserRoleChangeRecord extends Model {
  /**
   * 模型关联定义
   *
   * @static
   * @param {Object} models - 所有模型的映射对象
   * @returns {void} 无返回值
   */
  static associate(models) {
    // 多对一：被变更角色的用户
    UserRoleChangeRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    // 多对一：执行变更的操作员
    UserRoleChangeRecord.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 生成幂等键（业务主键派生，禁止兜底）
   *
   * 幂等键格式：role_change_{user_id}_{new_role}_{operator_id}_{timestamp}
   *
   * @static
   * @param {number} user_id - 被变更的用户ID
   * @param {string} new_role - 新角色名
   * @param {number} operator_id - 操作员ID
   * @returns {string} 幂等键
   */
  static generateIdempotencyKey(user_id, new_role, operator_id) {
    // 使用秒级时间戳（同一秒内对同一用户的相同角色变更视为重复操作）
    const timestamp = Math.floor(Date.now() / 1000)
    return `role_change_${user_id}_${new_role}_${operator_id}_${timestamp}`
  }

  /**
   * 获取角色变更描述
   *
   * @returns {string} 人类可读的角色变更描述
   */
  getChangeDescription() {
    return `${this.old_role} → ${this.new_role}`
  }
}

/**
 * 模型初始化函数
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @param {DataTypes} _DataTypes - Sequelize数据类型（未使用）
 * @returns {Model} UserRoleChangeRecord模型
 */
module.exports = (sequelize, _DataTypes) => {
  UserRoleChangeRecord.init(
    {
      // 变更记录ID（主键，作为审计日志的 target_id）
      user_role_change_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '变更记录ID（作为审计日志 target_id）'
      },

      // 被变更角色的用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '被变更角色的用户ID'
      },

      // 执行变更的操作员ID
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '执行变更的操作员ID'
      },

      // 变更前角色名
      old_role: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '变更前角色名（如 user、admin、merchant 等）'
      },

      // 变更后角色名
      new_role: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '变更后角色名（如 user、admin、merchant 等）'
      },

      // 变更原因
      reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '角色变更原因（管理员备注）'
      },

      // 幂等键（防止重复操作）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（格式：role_change_{user_id}_{new_role}_{operator_id}_{timestamp}）'
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
      modelName: 'UserRoleChangeRecord',
      tableName: 'user_role_change_records',
      timestamps: false, // 只有 created_at，不需要 updated_at
      comment: '用户角色变更记录表（为审计日志提供业务主键）',

      // 查询作用域
      scopes: {
        // 查询某用户的角色变更历史
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

  return UserRoleChangeRecord
}
