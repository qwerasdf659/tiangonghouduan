/**
 * 聊天消息模型
 * 管理聊天会话中的消息
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ChatMessage = sequelize.define(
    'ChatMessage',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '消息ID'
      },

      message_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: '消息标识符'
      },

      session_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '会话标识符'
      },

      sender_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '发送者ID'
      },

      sender_type: {
        type: DataTypes.ENUM('user', 'admin'),
        allowNull: false,
        comment: '发送者类型'
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
      createdAt: 'created_at',
      updatedAt: false, // 消息不需要更新时间
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

    // 消息属于会话
    ChatMessage.belongsTo(models.CustomerSession, {
      foreignKey: 'session_id',
      targetKey: 'session_id',
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
          attributes: ['user_id', 'nickname', 'avatar_url']
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

    return this.update(
      { status: 'read' },
      { where }
    )
  }

  return ChatMessage
}
