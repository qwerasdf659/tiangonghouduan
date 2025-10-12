/**
 * 系统公告和反馈系统数据表创建迁移
 * 支持前端API需求：系统公告显示和用户反馈功能
 *
 * @description 创建system_announcements和feedbacks两个核心表
 * @version 4.0.0
 * @date 2025-09-29 15:32:27 北京时间
 */

'use strict'

const { DataTypes } = require('sequelize')

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🚀 开始创建系统公告和反馈系统数据表...')

    // 1. 创建系统公告表
    await queryInterface.createTable(
      'system_announcements',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '公告ID'
        },

        title: {
          type: DataTypes.STRING(200),
          allowNull: false,
          comment: '公告标题'
        },

        content: {
          type: DataTypes.TEXT,
          allowNull: false,
          comment: '公告内容'
        },

        type: {
          type: DataTypes.ENUM('system', 'activity', 'maintenance', 'notice'),
          allowNull: false,
          defaultValue: 'notice',
          comment: '公告类型：系统/活动/维护/通知'
        },

        priority: {
          type: DataTypes.ENUM('high', 'medium', 'low'),
          allowNull: false,
          defaultValue: 'medium',
          comment: '优先级：高/中/低'
        },

        target_groups: {
          type: DataTypes.JSON,
          allowNull: true,
          comment: '目标用户组（管理员可见）'
        },

        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否激活'
        },

        expires_at: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: '过期时间'
        },

        admin_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: '创建管理员ID'
        },

        internal_notes: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: '内部备注（管理员可见）'
        },

        view_count: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '查看次数'
        },

        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          comment: '创建时间'
        },

        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          comment: '更新时间'
        }
      },
      {
        comment: '系统公告表 - 支持首页公告功能',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        indexes: [
          {
            name: 'idx_announcements_type_active',
            fields: ['type', 'is_active']
          },
          {
            name: 'idx_announcements_priority_expires',
            fields: ['priority', 'expires_at']
          },
          {
            name: 'idx_announcements_created_at',
            fields: ['created_at']
          }
        ]
      }
    )

    // 2. 创建反馈系统表
    await queryInterface.createTable(
      'feedbacks',
      {
        id: {
          type: DataTypes.STRING(50),
          primaryKey: true,
          comment: '反馈ID（格式：fb_timestamp_random）'
        },

        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: '用户ID'
        },

        category: {
          type: DataTypes.ENUM('technical', 'feature', 'bug', 'complaint', 'suggestion', 'other'),
          allowNull: false,
          defaultValue: 'other',
          comment: '反馈分类'
        },

        content: {
          type: DataTypes.TEXT,
          allowNull: false,
          comment: '反馈内容'
        },

        attachments: {
          type: DataTypes.JSON,
          allowNull: true,
          comment: '附件信息（图片URLs等）'
        },

        status: {
          type: DataTypes.ENUM('pending', 'processing', 'replied', 'closed'),
          allowNull: false,
          defaultValue: 'pending',
          comment: '处理状态'
        },

        priority: {
          type: DataTypes.ENUM('high', 'medium', 'low'),
          allowNull: false,
          defaultValue: 'medium',
          comment: '优先级'
        },

        user_ip: {
          type: DataTypes.STRING(45),
          allowNull: true,
          comment: '用户IP（管理员可见）'
        },

        device_info: {
          type: DataTypes.JSON,
          allowNull: true,
          comment: '设备信息（管理员可见）'
        },

        admin_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          comment: '处理管理员ID'
        },

        reply_content: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: '回复内容'
        },

        replied_at: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: '回复时间'
        },

        internal_notes: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: '内部备注（管理员可见）'
        },

        estimated_response_time: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: '预计响应时间'
        },

        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          comment: '创建时间'
        },

        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          comment: '更新时间'
        }
      },
      {
        comment: '用户反馈表 - 支持客服反馈功能',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        indexes: [
          {
            name: 'idx_feedbacks_user_status',
            fields: ['user_id', 'status']
          },
          {
            name: 'idx_feedbacks_category_priority',
            fields: ['category', 'priority']
          },
          {
            name: 'idx_feedbacks_status_created',
            fields: ['status', 'created_at']
          },
          {
            name: 'idx_feedbacks_admin_id',
            fields: ['admin_id']
          }
        ]
      }
    )

    console.log('✅ 系统公告和反馈系统数据表创建完成')
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🗑️ 删除系统公告和反馈系统数据表...')

    // 删除表（按照依赖关系逆序删除）
    await queryInterface.dropTable('feedbacks')
    await queryInterface.dropTable('system_announcements')

    console.log('✅ 系统公告和反馈系统数据表删除完成')
  }
}
