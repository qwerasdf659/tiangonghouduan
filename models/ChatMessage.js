/**
 * 聊天消息模型
 * 管理聊天会话中的消息
 * 创建时间：2025年01月28日
 * 最后更新：2025年08月14日 - 添加message_source字段支持前端来源区分
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ChatMessage = sequelize.define(
    'ChatMessage',
    {
      message_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },

      session_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '会话ID(外键关联customer_sessions)'
      },

      sender_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // ✅ 允许NULL，系统消息sender_id为NULL
        comment: '发送者ID（系统消息为NULL）'
      },

      sender_type: {
        type: DataTypes.ENUM('user', 'admin'),
        allowNull: false,
        comment: '发送者类型'
      },

      message_source: {
        type: DataTypes.ENUM('user_client', 'admin_client', 'system'),
        allowNull: false,
        comment: '消息来源：user_client=用户端，admin_client=管理员端，system=系统消息'
      },

      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '消息内容'
      },

      message_type: {
        type: DataTypes.ENUM('text', 'image', 'system'),
        defaultValue: 'text',
        comment: '消息类型'
      },

      status: {
        type: DataTypes.ENUM('sending', 'sent', 'delivered', 'read'),
        defaultValue: 'sent',
        comment: '消息状态'
      },

      reply_to_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '回复的消息ID'
      },

      temp_message_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '临时消息ID(前端生成)'
      },

      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展数据(图片信息等)'
      }
    },
    {
      tableName: 'chat_messages',
      timestamps: true,
      underscored: true,
      created_at: 'created_at',
      updated_at: 'updated_at', // 消息修改时间追踪（数据库中100%使用）
      indexes: [
        {
          unique: true,
          fields: ['message_id']
        },
        {
          fields: ['session_id']
        },
        {
          fields: ['sender_id']
        },
        {
          fields: ['created_at']
        },
        {
          fields: ['temp_message_id']
        },
        {
          fields: ['message_source', 'sender_type']
        }
      ],
      comment: '聊天消息表'
    }
  )

  // 定义关联关系
  ChatMessage.associate = function (models) {
    // 消息属于发送者
    ChatMessage.belongsTo(models.User, {
      foreignKey: 'sender_id',
      as: 'sender'
    })

    // 消息属于会话 - 标准外键关联
    ChatMessage.belongsTo(models.CustomerSession, {
      foreignKey: 'session_id',
      as: 'session'
    })

    // 消息可能回复另一条消息
    ChatMessage.belongsTo(models.ChatMessage, {
      foreignKey: 'reply_to_id',
      as: 'replyTo'
    })

    // 消息可能被其他消息回复
    ChatMessage.hasMany(models.ChatMessage, {
      foreignKey: 'reply_to_id',
      as: 'replies'
    })
  }

  // 实例方法
  ChatMessage.prototype.isFromUser = function () {
    return this.sender_type === 'user'
  }

  ChatMessage.prototype.isFromAdmin = function () {
    return this.sender_type === 'admin'
  }

  ChatMessage.prototype.isFromUserClient = function () {
    return this.message_source === 'user_client'
  }

  ChatMessage.prototype.isFromAdminClient = function () {
    return this.message_source === 'admin_client'
  }

  ChatMessage.prototype.isSystemMessage = function () {
    return this.message_source === 'system'
  }

  ChatMessage.prototype.isRead = function () {
    return this.status === 'read'
  }

  ChatMessage.prototype.markAsRead = function () {
    return this.update({ status: 'read' })
  }

  // 类方法
  ChatMessage.findBySessionId = function (sessionId, limit = 20, beforeMessageId = null) {
    const where = { session_id: sessionId }

    if (beforeMessageId) {
      where.id = { [sequelize.Op.lt]: beforeMessageId }
    }

    return this.findAll({
      where,
      include: [
        {
          model: sequelize.models.User,
          as: 'sender',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [['created_at', 'DESC']],
      limit
    })
  }

  ChatMessage.getUnreadCount = function (sessionId, senderType = null) {
    const where = {
      session_id: sessionId,
      status: ['sent', 'delivered']
    }

    if (senderType) {
      where.sender_type = senderType
    }

    return this.count({ where })
  }

  ChatMessage.markSessionMessagesAsRead = function (sessionId, receiverType) {
    const where = {
      session_id: sessionId,
      sender_type: receiverType === 'user' ? 'admin' : 'user',
      status: ['sent', 'delivered']
    }

    return this.update({ status: 'read' }, { where })
  }

  return ChatMessage
}
