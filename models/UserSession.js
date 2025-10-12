/**
 * 用户认证会话模型（UserSession）- V4统一架构版本
 *
 * ⚠️⚠️⚠️ 重要区分说明 ⚠️⚠️⚠️
 * 本模型是 UserSession（用户认证会话），不是 CustomerSession（客服聊天会话）
 *
 * 📋 UserSession vs CustomerSession 核心区别：
 *
 * ✅ UserSession（本模型）：用户认证会话 - 管理JWT Token
 *    - 概念：记录用户的登录认证会话和Token生命周期
 *    - 用途：用户登录验证、Token管理、会话控制、安全管理
 *    - 特点：存储JWT Token、记录登录IP、支持过期和失效管理
 *    - 状态特点：is_active（是否活跃）、expires_at（过期时间）
 *    - 典型字段：session_token（JWT Token）、user_id、user_type、is_active、expires_at
 *    - 表名：user_sessions，主键：user_session_id
 *
 * ❌ CustomerSession（另一个模型）：客服聊天会话 - 管理用户与客服的对话
 *    - 概念：记录用户与客服之间的聊天对话会话
 *    - 用途：客服系统、用户咨询、在线客服、消息收发
 *    - 特点：包含多条聊天消息（ChatMessage）、有客服分配、有满意度评分
 *    - 状态流转：waiting（等待客服）→ assigned（已分配）→ active（活跃）→ closed（已关闭）
 *    - 典型字段：user_id（咨询用户）、admin_id（接入客服）、status（会话状态）、satisfaction_score（满意度）
 *    - 表名：customer_sessions，主键：session_id
 *
 * 📌 记忆口诀：
 * - UserSession = 认证会话 = 登录Token = 权限验证 = 用户登录系统
 * - CustomerSession = 聊天会话 = 客服对话 = 消息收发 = 用户咨询客服
 *
 * 💡 实际业务示例：
 * - 用户登录系统 → 创建UserSession（存储Token，验证登录状态）
 * - 用户咨询客服 → 创建CustomerSession（开启聊天对话）
 * - 即：UserSession管理"是否登录"，CustomerSession管理"聊天对话"
 *
 * 功能说明：
 * - 管理JWT Token的生命周期
 * - 支持会话控制和安全管理
 * - 支持会话延期和失效管理
 * - 记录登录IP和最后活动时间
 *
 * 创建时间：2025年01月21日
 * 最后更新：2025-10-12（添加与CustomerSession的详细区分说明）
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const UserSession = sequelize.define(
    'UserSession',
    {
      user_session_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },

      session_token: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        comment: '会话令牌（JWT Token的jti）'
      },

      user_type: {
        type: DataTypes.ENUM('user', 'admin'),
        allowNull: false,
        comment: '用户类型'
      },

      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '用户ID'
      },

      login_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '登录IP'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否活跃'
      },

      last_activity: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '最后活动时间'
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '过期时间'
      }
    },
    {
      tableName: 'user_sessions',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['session_token']
        },
        {
          fields: ['user_type', 'user_id', 'is_active']
        },
        {
          fields: ['expires_at', 'is_active']
        },
        {
          fields: ['last_activity']
        }
      ],
      comment: '用户会话管理表'
    }
  )

  // 实例方法
  UserSession.prototype.isExpired = function () {
    return BeijingTimeHelper.isExpired(this.expires_at)
  }

  UserSession.prototype.isValid = function () {
    return this.is_active && !this.isExpired()
  }

  UserSession.prototype.updateActivity = function () {
    return this.update({
      last_activity: BeijingTimeHelper.createBeijingTime()
    })
  }

  UserSession.prototype.deactivate = function (reason = null) {
    console.log(`🔒 会话失效: ${this.session_token}, 原因: ${reason || '未指定'}`)
    return this.update({
      is_active: false
    })
  }

  UserSession.prototype.extendExpiry = function (additionalMinutes = 30) {
    const newExpiry = BeijingTimeHelper.futureTime(additionalMinutes * 60 * 1000)
    return this.update({
      expires_at: newExpiry,
      last_activity: BeijingTimeHelper.createBeijingTime()
    })
  }

  // 类方法
  UserSession.createSession = async function (sessionData) {
    const {
      session_token,
      user_type,
      user_id,
      login_ip,
      expires_in_minutes = 120 // 默认2小时
    } = sessionData

    const expires_at = BeijingTimeHelper.futureTime(expires_in_minutes * 60 * 1000)

    return this.create({
      session_token,
      user_type,
      user_id,
      login_ip,
      expires_at,
      is_active: true,
      last_activity: BeijingTimeHelper.createBeijingTime()
    })
  }

  UserSession.findByToken = function (session_token) {
    return this.findOne({
      where: {
        session_token,
        is_active: true
      }
    })
  }

  UserSession.findValidByToken = function (session_token) {
    return this.findOne({
      where: {
        session_token,
        is_active: true,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: BeijingTimeHelper.createBeijingTime()
        }
      }
    })
  }

  UserSession.findUserActiveSessions = function (user_type, user_id) {
    return this.findAll({
      where: {
        user_type,
        user_id,
        is_active: true,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: BeijingTimeHelper.createBeijingTime()
        }
      },
      order: [['last_activity', 'DESC']]
    })
  }

  UserSession.deactivateUserSessions = async function (user_type, user_id, excludeToken = null) {
    const whereCondition = {
      user_type,
      user_id,
      is_active: true
    }

    if (excludeToken) {
      whereCondition.session_token = {
        [sequelize.Sequelize.Op.ne]: excludeToken
      }
    }

    const affectedCount = await this.update({ is_active: false }, { where: whereCondition })

    console.log(`🔒 已失效 ${affectedCount[0]} 个用户会话: ${user_type}:${user_id}`)
    return affectedCount[0]
  }

  UserSession.cleanupExpiredSessions = async function () {
    const deletedCount = await this.destroy({
      where: {
        expires_at: {
          [sequelize.Sequelize.Op.lt]: BeijingTimeHelper.createBeijingTime()
        }
      }
    })

    console.log(`🗑️ 清理过期会话: ${deletedCount} 个`)
    return deletedCount
  }

  UserSession.getActiveSessionStats = async function () {
    const stats = await this.findAll({
      where: {
        is_active: true,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: BeijingTimeHelper.createBeijingTime()
        }
      },
      attributes: [
        'user_type',
        [sequelize.fn('COUNT', '*'), 'active_sessions'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))), 'unique_users']
      ],
      group: ['user_type']
    })

    return stats.reduce((acc, stat) => {
      acc[stat.user_type] = {
        active_sessions: parseInt(stat.dataValues.active_sessions),
        unique_users: parseInt(stat.dataValues.unique_users)
      }
      return acc
    }, {})
  }

  // 定期清理任务（可以通过定时器调用）
  UserSession.scheduleCleanup = function () {
    // 每30分钟清理一次过期会话
    const interval = 30 * 60 * 1000
    setInterval(async () => {
      try {
        await this.cleanupExpiredSessions()
      } catch (error) {
        console.error('❌ 会话清理失败:', error)
      }
    }, interval)

    console.log('⏰ 会话清理定时任务已启动，每30分钟执行一次')
  }

  // 关联关系
  UserSession.associate = function (models) {
    // 普通用户会话
    UserSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false,
      scope: {
        user_type: 'user'
      }
    })

    // V4.0简化权限：管理员会话也使用User模型
    // 管理员信息通过UUID角色系统区分
    UserSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'admin',
      constraints: false
      // 注意：管理员权限通过roles表关联检查，不使用scope限制
    })
  }

  return UserSession
}
