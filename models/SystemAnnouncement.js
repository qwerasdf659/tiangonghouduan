/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 系统公告模型
 * 支持首页公告显示和管理员公告管理功能
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const SystemAnnouncement = sequelize.define(
    'SystemAnnouncement',
    {
      // 基础信息
      announcement_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '公告标题不能为空'
          },
          len: {
            args: [1, 200],
            msg: '公告标题长度必须在1-200字符之间'
          }
        },
        comment: '公告标题'
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '公告内容不能为空'
          }
        },
        comment: '公告内容'
      },

      // 分类与优先级
      type: {
        type: DataTypes.ENUM('system', 'activity', 'maintenance', 'notice'),
        allowNull: false,
        defaultValue: 'notice',
        validate: {
          isIn: {
            args: [['system', 'activity', 'maintenance', 'notice']],
            msg: '公告类型必须是：system, activity, maintenance, notice 之一'
          }
        },
        comment: '公告类型：系统/活动/维护/通知'
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
        comment: '优先级：高/中/低'
      },

      // 敏感信息（仅管理员可见）
      target_groups: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '目标用户组（管理员可见）'
      },
      internal_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '内部备注（管理员可见）'
      },

      // 状态管理
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否激活'
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: {
            msg: '过期时间必须是有效的日期格式'
          },
          isAfterNow (value) {
            if (value && new Date(value) <= BeijingTimeHelper.createBeijingTime()) {
              throw new Error('过期时间必须晚于当前时间')
            }
          }
        },
        comment: '过期时间'
      },

      // 关联信息
      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '创建管理员ID（基于UUID角色系统验证管理员权限）'
      },

      // 统计信息
      view_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: {
            args: [0],
            msg: '查看次数不能为负数'
          }
        },
        comment: '查看次数'
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
      tableName: 'system_announcements',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      comment: '系统公告表 - 支持首页公告功能',

      // 实例方法
      instanceMethods: {
        /**
         * 检查公告是否已过期
         */
        isExpired () {
          if (!this.expires_at) return false
          return new Date(this.expires_at) <= BeijingTimeHelper.createBeijingTime()
        },

        /**
         * 增加查看次数
         */
        async incrementViewCount (transaction = null) {
          return this.increment('view_count', { transaction })
        },

        /**
         * 获取公告状态描述
         */
        getStatusDescription () {
          if (!this.is_active) return '已禁用'
          if (this.isExpired()) return '已过期'
          return '正常'
        }
      },

      // 类方法
      classMethods: {
        /**
         * 获取有效公告列表
         */
        async getActiveAnnouncements (options = {}) {
          const { type = null, priority = null, limit = 10, offset = 0 } = options

          const whereClause = {
            is_active: true,
            [sequelize.Op.or]: [
              { expires_at: null },
              { expires_at: { [sequelize.Op.gt]: BeijingTimeHelper.createBeijingTime() } }
            ]
          }

          if (type) whereClause.type = type
          if (priority) whereClause.priority = priority

          return this.findAll({
            where: whereClause,
            order: [
              ['priority', 'DESC'], // 高优先级优先
              ['created_at', 'DESC'] // 新发布的优先
            ],
            limit,
            offset,
            include: [
              {
                model: sequelize.models.User,
                as: 'creator',
                attributes: ['user_id', 'nickname']
              }
            ]
          })
        },

        /**
         * 获取首页公告
         */
        async getHomePageAnnouncements (limit = 5) {
          return this.getActiveAnnouncements({
            type: ['system', 'activity', 'notice'],
            limit
          })
        },

        /**
         * 创建新公告
         */
        async createAnnouncement (data, adminId) {
          return this.create({
            ...data,
            admin_id: adminId,
            created_at: BeijingTimeHelper.createBeijingTime(),
            updated_at: BeijingTimeHelper.createBeijingTime()
          })
        }
      },

      // 钩子函数
      hooks: {
        beforeCreate: announcement => {
          announcement.created_at = BeijingTimeHelper.createBeijingTime()
          announcement.updated_at = BeijingTimeHelper.createBeijingTime()
        },
        beforeUpdate: announcement => {
          announcement.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      // 索引
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

  // 关联关系
  SystemAnnouncement.associate = models => {
    // 关联创建者（管理员权限通过UUID角色系统验证）
    SystemAnnouncement.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'creator',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return SystemAnnouncement
}
