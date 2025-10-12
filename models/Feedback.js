/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 用户反馈模型
 * 支持用户反馈提交和管理员回复功能
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const Feedback = sequelize.define(
    'Feedback',
    {
      // 基础信息
      feedback_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '用户ID'
      },

      // 反馈内容
      category: {
        type: DataTypes.ENUM('technical', 'feature', 'bug', 'complaint', 'suggestion', 'other'),
        allowNull: false,
        defaultValue: 'other',
        validate: {
          isIn: {
            args: [['technical', 'feature', 'bug', 'complaint', 'suggestion', 'other']],
            msg: '反馈分类必须是：technical, feature, bug, complaint, suggestion, other 之一'
          }
        },
        comment: '反馈分类'
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '反馈内容不能为空'
          },
          len: {
            args: [1, 5000],
            msg: '反馈内容长度必须在1-5000字符之间'
          }
        },
        comment: '反馈内容'
      },
      attachments: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '附件信息（图片URLs等）'
      },

      // 状态管理
      status: {
        type: DataTypes.ENUM('pending', 'processing', 'replied', 'closed'),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: {
            args: [['pending', 'processing', 'replied', 'closed']],
            msg: '处理状态必须是：pending, processing, replied, closed 之一'
          }
        },
        comment: '处理状态'
      },
      priority: {
        type: DataTypes.ENUM('high', 'medium', 'low'),
        allowNull: false,
        defaultValue: 'medium',
        validate: {
          isIn: {
            args: [['high', 'medium', 'low']],
            msg: '优先级必须是：high, medium, low 之一'
          }
        },
        comment: '优先级'
      },

      // 敏感信息（仅管理员可见）
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
      internal_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '内部备注（管理员可见）'
      },

      // 回复信息
      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '处理管理员ID（基于UUID角色系统验证管理员权限）'
      },
      reply_content: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: {
            args: [0, 3000],
            msg: '回复内容长度不能超过3000字符'
          }
        },
        comment: '回复内容'
      },
      replied_at: {
        type: DataTypes.DATE,
        allowNull: true,
        get () {
          const value = this.getDataValue('replied_at')
          return value ? BeijingTimeHelper.formatChinese(value) : null
        },
        comment: '回复时间'
      },
      estimated_response_time: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '预计响应时间'
      },

      // 时间字段
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        get () {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        get () {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at'))
        },
        comment: '更新时间'
      }
    },
    {
      tableName: 'feedbacks',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      comment: '用户反馈表 - 支持客服反馈功能',

      // 实例方法
      instanceMethods: {
        /**
         * 检查是否已回复
         */
        isReplied () {
          return this.status === 'replied' && this.reply_content && this.replied_at
        },

        /**
         * 获取状态描述
         */
        getStatusDescription () {
          const statusMap = {
            pending: '待处理',
            processing: '处理中',
            replied: '已回复',
            closed: '已关闭'
          }
          return statusMap[this.status] || '未知状态'
        },

        /**
         * 获取分类描述
         */
        getCategoryDescription () {
          const categoryMap = {
            technical: '技术问题',
            feature: '功能建议',
            bug: '错误报告',
            complaint: '投诉',
            suggestion: '建议',
            other: '其他'
          }
          return categoryMap[this.category] || '未知分类'
        },

        /**
         * 设置回复
         */
        async setReply (content, adminId, transaction = null) {
          return this.update(
            {
              reply_content: content,
              admin_id: adminId,
              replied_at: BeijingTimeHelper.createBeijingTime(),
              status: 'replied',
              updated_at: BeijingTimeHelper.createBeijingTime()
            },
            { transaction }
          )
        }
      },

      // 类方法
      classMethods: {
        /**
         * 生成反馈ID
         */
        generateFeedbackId () {
          const timestamp = BeijingTimeHelper.generateIdTimestamp()
          const random = Math.random().toString(36).substr(2, 6)
          return `fb_${timestamp}_${random}`
        },

        /**
         * 创建新反馈
         */
        async createFeedback (data, userInfo = {}) {
          const feedbackId = this.generateFeedbackId()

          return this.create({
            id: feedbackId,
            ...data,
            user_ip: userInfo.ip,
            device_info: userInfo.device,
            estimated_response_time: this.calculateEstimatedResponseTime(data.priority),
            created_at: BeijingTimeHelper.createBeijingTime(),
            updated_at: BeijingTimeHelper.createBeijingTime()
          })
        },

        /**
         * 计算预计响应时间
         */
        calculateEstimatedResponseTime (priority) {
          const responseTimeMap = {
            high: '4小时内',
            medium: '24小时内',
            low: '72小时内'
          }
          return responseTimeMap[priority] || '72小时内'
        },

        /**
         * 获取用户反馈列表
         */
        async getUserFeedbacks (user_id, options = {}) {
          const { status = null, limit = 10, offset = 0 } = options

          const whereClause = { user_id }
          if (status && status !== 'all') {
            whereClause.status = status
          }

          return this.findAll({
            where: whereClause,
            order: [['created_at', 'DESC']],
            limit,
            offset,
            include: [
              {
                model: sequelize.models.User,
                as: 'admin',
                attributes: ['user_id', 'nickname'],
                required: false
              }
            ]
          })
        },

        /**
         * 获取管理员反馈列表
         */
        async getAdminFeedbacks (options = {}) {
          const {
            status = null,
            category = null,
            priority = null,
            limit = 20,
            offset = 0
          } = options

          const whereClause = {}
          if (status && status !== 'all') whereClause.status = status
          if (category && category !== 'all') whereClause.category = category
          if (priority && priority !== 'all') whereClause.priority = priority

          return this.findAll({
            where: whereClause,
            order: [
              ['priority', 'DESC'], // 高优先级优先
              ['created_at', 'ASC'] // 早提交的优先处理
            ],
            limit,
            offset,
            include: [
              {
                model: sequelize.models.User,
                as: 'user',
                attributes: ['user_id', 'nickname', 'mobile']
              },
              {
                model: sequelize.models.User,
                as: 'admin',
                attributes: ['user_id', 'nickname'],
                required: false
              }
            ]
          })
        }
      },

      // 钩子函数
      hooks: {
        beforeCreate: feedback => {
          feedback.created_at = BeijingTimeHelper.createBeijingTime()
          feedback.updated_at = BeijingTimeHelper.createBeijingTime()

          // 如果没有ID，自动生成
          if (!feedback.id) {
            feedback.id = Feedback.generateFeedbackId()
          }
        },
        beforeUpdate: feedback => {
          feedback.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      // 索引
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

  // 关联关系
  Feedback.associate = models => {
    // 关联用户
    Feedback.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 关联处理管理员（管理员权限通过UUID角色系统验证）
    Feedback.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  return Feedback
}
