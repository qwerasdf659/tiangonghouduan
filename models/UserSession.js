/**
 * 用户会话管理模型 - V4统一架构版本
 * 管理JWT Token的生命周期，支持会话控制和安全管理
 * 创建时间：2025年01月21日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const UserSession = sequelize.define(
    'UserSession',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '会话ID'
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

      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '用户代理'
      },

      device_fingerprint: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '设备指纹'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否活跃'
      },

      last_activity: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
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
      createdAt: 'created_at',
      updatedAt: 'updated_at',
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
    return new Date() > this.expires_at
  }

  UserSession.prototype.isValid = function () {
    return this.is_active && !this.isExpired()
  }

  UserSession.prototype.updateActivity = function () {
    return this.update({
      last_activity: new Date()
    })
  }

  UserSession.prototype.deactivate = function (reason = null) {
    console.log(`🔒 会话失效: ${this.session_token}, 原因: ${reason || '未指定'}`)
    return this.update({
      is_active: false
    })
  }

  UserSession.prototype.extendExpiry = function (additionalMinutes = 30) {
    const newExpiry = new Date(Date.now() + additionalMinutes * 60 * 1000)
    return this.update({
      expires_at: newExpiry,
      last_activity: new Date()
    })
  }

  // 类方法
  UserSession.createSession = async function (sessionData) {
    const {
      session_token,
      user_type,
      user_id,
      login_ip,
      user_agent,
      device_fingerprint,
      expires_in_minutes = 120 // 默认2小时
    } = sessionData

    const expires_at = new Date(Date.now() + expires_in_minutes * 60 * 1000)

    return this.create({
      session_token,
      user_type,
      user_id,
      login_ip,
      user_agent,
      device_fingerprint,
      expires_at,
      is_active: true,
      last_activity: new Date()
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
          [sequelize.Sequelize.Op.gt]: new Date()
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
          [sequelize.Sequelize.Op.gt]: new Date()
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
          [sequelize.Sequelize.Op.lt]: new Date()
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
          [sequelize.Sequelize.Op.gt]: new Date()
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

    // 管理员会话
    UserSession.belongsTo(models.AdminUser, {
      foreignKey: 'user_id',
      as: 'admin',
      constraints: false,
      scope: {
        user_type: 'admin'
      }
    })
  }

  return UserSession
}
