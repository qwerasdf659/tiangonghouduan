'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 创建客户聊天会话表
    await queryInterface.createTable(
      'customer_sessions',
      {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '会话ID'
        },
        session_id: {
          type: Sequelize.STRING(64),
          allowNull: false,
          unique: true,
          comment: '会话标识符'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'CASCADE'
        },
        admin_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '分配的管理员ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'SET NULL'
        },
        status: {
          type: Sequelize.ENUM('waiting', 'assigned', 'active', 'closed'),
          defaultValue: 'waiting',
          comment: '会话状态'
        },
        source: {
          type: Sequelize.STRING(32),
          defaultValue: 'mobile',
          comment: '来源渠道'
        },
        priority: {
          type: Sequelize.INTEGER,
          defaultValue: 1,
          comment: '优先级(1-5)'
        },
        last_message_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后消息时间'
        },
        closed_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '关闭时间'
        },
        satisfaction_score: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '满意度评分(1-5)'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '更新时间'
        }
      },
      {
        comment: '客户聊天会话表'
      }
    )

    // 添加索引
    await queryInterface.addIndex('customer_sessions', ['user_id'], {
      name: 'idx_customer_sessions_user_id'
    })
    await queryInterface.addIndex('customer_sessions', ['admin_id'], {
      name: 'idx_customer_sessions_admin_id'
    })
    await queryInterface.addIndex('customer_sessions', ['status'], {
      name: 'idx_customer_sessions_status'
    })
    await queryInterface.addIndex('customer_sessions', ['created_at'], {
      name: 'idx_customer_sessions_created_at'
    })

    // 创建聊天消息表
    await queryInterface.createTable(
      'chat_messages',
      {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '消息ID'
        },
        message_id: {
          type: Sequelize.STRING(64),
          allowNull: false,
          unique: true,
          comment: '消息标识符'
        },
        session_id: {
          type: Sequelize.STRING(64),
          allowNull: false,
          comment: '会话标识符'
        },
        sender_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '发送者ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'CASCADE'
        },
        sender_type: {
          type: Sequelize.ENUM('user', 'admin'),
          allowNull: false,
          comment: '发送者类型'
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: false,
          comment: '消息内容'
        },
        message_type: {
          type: Sequelize.ENUM('text', 'image', 'system'),
          defaultValue: 'text',
          comment: '消息类型'
        },
        status: {
          type: Sequelize.ENUM('sending', 'sent', 'delivered', 'read'),
          defaultValue: 'sent',
          comment: '消息状态'
        },
        reply_to_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '回复的消息ID'
        },
        temp_message_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: '临时消息ID(前端生成)'
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '扩展数据(图片信息等)'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        }
      },
      {
        comment: '聊天消息表'
      }
    )

    // 添加索引
    await queryInterface.addIndex('chat_messages', ['session_id'], {
      name: 'idx_chat_messages_session_id'
    })
    await queryInterface.addIndex('chat_messages', ['sender_id'], {
      name: 'idx_chat_messages_sender_id'
    })
    await queryInterface.addIndex('chat_messages', ['created_at'], {
      name: 'idx_chat_messages_created_at'
    })
    await queryInterface.addIndex('chat_messages', ['temp_message_id'], {
      name: 'idx_chat_messages_temp_message_id'
    })

    // 创建管理员状态表
    await queryInterface.createTable(
      'admin_status',
      {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: 'ID'
        },
        admin_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          comment: '管理员ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'CASCADE'
        },
        status: {
          type: Sequelize.ENUM('online', 'busy', 'offline'),
          defaultValue: 'offline',
          comment: '状态'
        },
        current_sessions: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '当前处理会话数'
        },
        max_sessions: {
          type: Sequelize.INTEGER,
          defaultValue: 5,
          comment: '最大处理会话数'
        },
        last_active_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '最后活跃时间'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '更新时间'
        }
      },
      {
        comment: '管理员状态表'
      }
    )

    // 创建快速回复模板表
    await queryInterface.createTable(
      'quick_replies',
      {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: 'ID'
        },
        admin_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '管理员ID(NULL表示公共模板)',
          references: {
            model: 'users',
            key: 'user_id'
          }
        },
        title: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '模板标题'
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: false,
          comment: '回复内容'
        },
        category: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '分类'
        },
        usage_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '使用次数'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          comment: '是否启用'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '更新时间'
        }
      },
      {
        comment: '快速回复模板表'
      }
    )

    // 添加索引
    await queryInterface.addIndex('quick_replies', ['admin_id'], {
      name: 'idx_quick_replies_admin_id'
    })
    await queryInterface.addIndex('quick_replies', ['category'], {
      name: 'idx_quick_replies_category'
    })
  },

  async down (queryInterface, _Sequelize) {
    // 删除表
    await queryInterface.dropTable('quick_replies')
    await queryInterface.dropTable('admin_status')
    await queryInterface.dropTable('chat_messages')
    await queryInterface.dropTable('customer_sessions')
  }
}
