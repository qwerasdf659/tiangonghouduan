/**
 * 客服聊天会话模型（CustomerServiceSession）
 *
 * ⚠️⚠️⚠️ 重要区分说明 ⚠️⚠️⚠️
 * 本模型是 CustomerServiceSession（客服聊天会话），不是 AuthenticationSession（用户认证会话）
 *
 * 📋 CustomerServiceSession vs AuthenticationSession 核心区别：
 *
 * ✅ CustomerServiceSession（本模型）：客服聊天会话 - 管理用户与客服的对话
 *    - 概念：记录用户与客服之间的聊天对话会话
 *    - 用途：客服系统、用户咨询、在线客服、消息收发
 *    - 特点：包含多条聊天消息（ChatMessage）、有客服分配、有满意度评分
 *    - 状态流转：waiting（等待客服）→ assigned（已分配）→ active（活跃）→ closed（已关闭）
 *    - 典型字段：user_id（咨询用户）、admin_id（接入客服）、status（会话状态）、satisfaction_score（满意度）
 *    - 表名：customer_service_sessions，主键：customer_service_session_id
 *
 * ❌ AuthenticationSession（另一个模型）：用户认证会话 - 管理JWT Token
 *    - 概念：记录用户的登录认证会话和Token生命周期
 *    - 用途：用户登录验证、Token管理、会话控制、安全管理
 *    - 特点：存储JWT Token、记录登录IP、支持过期和失效管理
 *    - 状态特点：is_active（是否活跃）、expires_at（过期时间）
 *    - 典型字段：session_token（JWT Token）、user_id、user_type、is_active、expires_at
 *    - 表名：authentication_sessions，主键：authentication_session_id
 *
 * 📌 记忆口诀：
 * - CustomerServiceSession = 客服聊天会话 = 客服对话 = 消息收发 = 用户咨询客服
 * - AuthenticationSession = 用户认证会话 = 登录Token = 权限验证 = 用户登录系统
 *
 * 💡 实际业务示例：
 * - 用户登录系统 → 创建AuthenticationSession（存储Token，验证登录状态）
 * - 用户咨询客服 → 创建CustomerServiceSession（开启聊天对话）
 * - 即：AuthenticationSession管理"是否登录"，CustomerServiceSession管理"聊天对话"
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
  /*
   * 🔴 会话状态常量定义（Session Status Constants）
   * 用于统一管理会话状态值，避免硬编码，提升代码可维护性
   */
  const SESSION_STATUS = {
    WAITING: 'waiting', // 等待客服接入
    ASSIGNED: 'assigned', // 已分配给客服
    ACTIVE: 'active', // 活跃对话中
    CLOSED: 'closed' // 已关闭
  }

  /*
   * 🔴 活跃状态数组（Active Status Array）
   * 用于查询所有活跃会话（waiting/assigned/active）
   */
  const ACTIVE_STATUS = [SESSION_STATUS.WAITING, SESSION_STATUS.ASSIGNED, SESSION_STATUS.ACTIVE]

  const CustomerServiceSession = sequelize.define(
    'CustomerServiceSession',
    {
      customer_service_session_id: {
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
        type: DataTypes.ENUM(
          SESSION_STATUS.WAITING,
          SESSION_STATUS.ASSIGNED,
          SESSION_STATUS.ACTIVE,
          SESSION_STATUS.CLOSED
        ),
        defaultValue: SESSION_STATUS.WAITING,
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

      close_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '关闭原因（最长500字符，如：问题已解决、用户未回复、恶意会话等）'
      },

      closed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关闭操作人ID（外键关联users表的user_id，记录哪个管理员关闭的会话）'
      },

      satisfaction_score: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '满意度评分(1-5)'
      },

      first_response_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '客服首次响应时间（用于计算响应时长）'
      }
    },
    {
      tableName: 'customer_service_sessions',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['customer_service_session_id'],
          name: 'uk_customer_service_session_id'
        },
        {
          fields: ['user_id'],
          name: 'idx_customer_sessions_user_id'
        },
        {
          fields: ['admin_id'],
          name: 'idx_customer_sessions_admin_id'
        },
        {
          fields: ['status'],
          name: 'idx_customer_sessions_status'
        },
        {
          fields: ['created_at'],
          name: 'idx_customer_sessions_created_at'
        }
      ],
      comment: '客户聊天会话表'
    }
  )

  // 定义关联关系
  CustomerServiceSession.associate = function (models) {
    // 会话属于用户
    CustomerServiceSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 会话可能被分配给管理员（管理员权限通过UUID角色系统验证）
    CustomerServiceSession.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin'
    })

    // 会话可能被某个管理员关闭（关闭操作人）
    CustomerServiceSession.belongsTo(models.User, {
      foreignKey: 'closed_by',
      as: 'closer'
    })

    // 会话包含多条消息
    CustomerServiceSession.hasMany(models.ChatMessage, {
      foreignKey: 'customer_service_session_id',
      sourceKey: 'customer_service_session_id',
      as: 'messages'
    })
  }

  // 实例方法（使用状态常量，消除硬编码）
  CustomerServiceSession.prototype.canBeAssignedTo = function (adminId) {
    return this.status === SESSION_STATUS.WAITING || this.admin_id === adminId
  }

  CustomerServiceSession.prototype.isClosed = function () {
    return this.status === SESSION_STATUS.CLOSED
  }

  CustomerServiceSession.prototype.isActive = function () {
    return [SESSION_STATUS.ASSIGNED, SESSION_STATUS.ACTIVE].includes(this.status)
  }

  // 类方法（使用状态常量数组，消除硬编码）
  CustomerServiceSession.findActiveByUserId = function (user_id) {
    return this.findAll({
      where: {
        user_id,
        status: ACTIVE_STATUS
      },
      order: [['created_at', 'DESC']]
    })
  }

  CustomerServiceSession.findByAdminId = function (adminId, status = null) {
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

  /*
   * 🔴 导出状态常量（Export Status Constants）
   * 供其他模块使用，实现全局状态统一管理
   */
  CustomerServiceSession.SESSION_STATUS = SESSION_STATUS
  CustomerServiceSession.ACTIVE_STATUS = ACTIVE_STATUS

  return CustomerServiceSession
}
