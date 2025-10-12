/**
 * 客服聊天会话模型（CustomerSession）
 *
 * ⚠️⚠️⚠️ 重要区分说明 ⚠️⚠️⚠️
 * 本模型是 CustomerSession（客服聊天会话），不是 UserSession（用户认证会话）
 *
 * 📋 CustomerSession vs UserSession 核心区别：
 *
 * ✅ CustomerSession（本模型）：客服聊天会话 - 管理用户与客服的对话
 *    - 概念：记录用户与客服之间的聊天对话会话
 *    - 用途：客服系统、用户咨询、在线客服、消息收发
 *    - 特点：包含多条聊天消息（ChatMessage）、有客服分配、有满意度评分
 *    - 状态流转：waiting（等待客服）→ assigned（已分配）→ active（活跃）→ closed（已关闭）
 *    - 典型字段：user_id（咨询用户）、admin_id（接入客服）、status（会话状态）、satisfaction_score（满意度）
 *    - 表名：customer_sessions，主键：session_id
 *
 * ❌ UserSession（另一个模型）：用户认证会话 - 管理JWT Token
 *    - 概念：记录用户的登录认证会话和Token生命周期
 *    - 用途：用户登录验证、Token管理、会话控制、安全管理
 *    - 特点：存储JWT Token、记录登录IP、支持过期和失效管理
 *    - 状态特点：is_active（是否活跃）、expires_at（过期时间）
 *    - 典型字段：session_token（JWT Token）、user_id、user_type、is_active、expires_at
 *    - 表名：user_sessions，主键：user_session_id
 *
 * 📌 记忆口诀：
 * - CustomerSession = 聊天会话 = 客服对话 = 消息收发 = 用户咨询客服
 * - UserSession = 认证会话 = 登录Token = 权限验证 = 用户登录系统
 *
 * 💡 实际业务示例：
 * - 用户登录系统 → 创建UserSession（存储Token，验证登录状态）
 * - 用户咨询客服 → 创建CustomerSession（开启聊天对话）
 * - 即：UserSession管理"是否登录"，CustomerSession管理"聊天对话"
 *
 * 功能说明：
 * - 管理用户与客服之间的聊天会话
 * - 支持会话状态管理（等待、分配、活跃、关闭）
 * - 支持客服分配和满意度评分
 * - 包含多条聊天消息（通过ChatMessage模型关联）
 *
 * 创建时间：2025年01月28日
 * 最后更新：2025-10-12（添加与UserSession的详细区分说明）
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const CustomerSession = sequelize.define(
    'CustomerSession',
    {
      session_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },

      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '分配的管理员ID（基于UUID角色系统验证管理员权限）'
      },

      status: {
        type: DataTypes.ENUM('waiting', 'assigned', 'active', 'closed'),
        defaultValue: 'waiting',
        comment: '会话状态'
      },

      source: {
        type: DataTypes.STRING(32),
        defaultValue: 'mobile',
        comment: '来源渠道'
      },

      priority: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: '优先级(1-5)'
      },

      last_message_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后消息时间'
      },

      closed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '关闭时间'
      },

      satisfaction_score: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '满意度评分(1-5)'
      }
    },
    {
      tableName: 'customer_sessions',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['session_id']
        },
        {
          fields: ['user_id']
        },
        {
          fields: ['admin_id']
        },
        {
          fields: ['status']
        },
        {
          fields: ['created_at']
        }
      ],
      comment: '客户聊天会话表'
    }
  )

  // 定义关联关系
  CustomerSession.associate = function (models) {
    // 会话属于用户
    CustomerSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 会话可能被分配给管理员（管理员权限通过UUID角色系统验证）
    CustomerSession.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin'
    })

    // 会话包含多条消息
    CustomerSession.hasMany(models.ChatMessage, {
      foreignKey: 'session_id',
      sourceKey: 'session_id',
      as: 'messages'
    })
  }

  // 实例方法
  CustomerSession.prototype.canBeAssignedTo = function (adminId) {
    return this.status === 'waiting' || this.admin_id === adminId
  }

  CustomerSession.prototype.isClosed = function () {
    return this.status === 'closed'
  }

  CustomerSession.prototype.isActive = function () {
    return ['assigned', 'active'].includes(this.status)
  }

  // 类方法
  CustomerSession.findActiveByUserId = function (user_id) {
    return this.findAll({
      where: {
        user_id,
        status: ['waiting', 'assigned', 'active']
      },
      order: [['created_at', 'DESC']]
    })
  }

  CustomerSession.findByAdminId = function (adminId, status = null) {
    const where = { admin_id: adminId }
    if (status) {
      where.status = status
    }

    return this.findAll({
      where,
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [['updated_at', 'DESC']]
    })
  }

  return CustomerSession
}
