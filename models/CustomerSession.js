/**
 * 客户聊天会话模型
 * 管理用户与客服之间的聊天会话
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const CustomerSession = sequelize.define(
    'CustomerSession',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '会话ID'
      },

      session_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: '会话标识符'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },

      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '分配的管理员ID'
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

    // 会话可能被分配给管理员
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
  CustomerSession.findActiveByUserId = function (userId) {
    return this.findAll({
      where: {
        user_id: userId,
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
          attributes: ['user_id', 'nickname', 'avatar_url', 'mobile']
        }
      ],
      order: [['updated_at', 'DESC']]
    })
  }

  return CustomerSession
}
