/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 系统公告模型（SystemAnnouncement）
 *
 * 业务场景：首页公告展示和管理员公告管理
 *
 * 核心功能：
 * - 支持多类型公告（系统公告/活动公告/维护公告/通知公告）
 * - 支持优先级控制（高/中/低），高优先级公告优先展示
 * - 支持公告过期时间管理，过期公告自动不展示
 * - 支持公告浏览次数统计
 * - 支持内部备注和目标用户组（管理员可见，普通用户不可见）
 *
 * 业务流程：
 * 1. 管理员创建公告 → 设置标题、内容、类型、优先级、过期时间
 * 2. 公告发布 → is_active=true，开始展示
 * 3. 用户访问首页 → 查询有效公告（is_active=true && 未过期）
 * 4. 用户查看公告 → view_count自动增加
 * 5. 公告过期或禁用 → expires_at已过或is_active=false，停止展示
 *
 * 数据库表名：system_announcements
 * 主键：announcement_id（INTEGER，自增）
 *
 * 数据安全：
 * - 普通用户仅能查看公开信息（标题、内容、类型、优先级、过期时间、查看次数）
 * - 管理员可查看完整信息（包含内部备注、目标用户组、创建管理员等）
 *
 * 创建时间：2025年10月11日
 * 最后更新：2025年10月30日（补充详细业务场景说明）
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
          /**
           * 验证过期时间必须晚于当前时间
           * @param {Date} value - 过期时间值
           * @returns {void} 无返回值，验证失败时抛出错误
           * @throws {Error} 当过期时间早于或等于当前时间时抛出错误
           */
          isAfterNow(value) {
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
        /**
         * 获取北京时间格式的创建时间
         * @returns {string} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /**
         * 获取北京时间格式的更新时间
         * @returns {string} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at'))
        },
        comment: '更新时间'
      }
    },
    {
      tableName: 'system_announcements',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '系统公告表 - 支持首页公告功能',

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

  // 🔴 实例方法（Sequelize v6+正确定义方式）
  /**
   * 检查公告是否已过期
   * @returns {boolean} true-已过期，false-未过期或无过期时间
   */
  SystemAnnouncement.prototype.isExpired = function () {
    if (!this.expires_at) return false
    return new Date(this.expires_at) <= BeijingTimeHelper.createBeijingTime()
  }

  /**
   * 增加查看次数
   * @param {Object|null} transaction - Sequelize事务对象
   * @returns {Promise<SystemAnnouncement>} 更新后的公告实例
   */
  SystemAnnouncement.prototype.incrementViewCount = async function (transaction = null) {
    return this.increment('view_count', { transaction })
  }

  /**
   * 获取公告状态描述
   * @returns {string} 状态描述（正常/已禁用/已过期）
   */
  SystemAnnouncement.prototype.getStatusDescription = function () {
    if (!this.is_active) return '已禁用'
    if (this.isExpired()) return '已过期'
    return '正常'
  }

  // 🔴 类方法（Sequelize v6+正确定义方式）
  /**
   * 获取有效公告列表
   * @param {Object} options - 查询选项
   * @param {string|null} options.type - 公告类型筛选
   * @param {string|null} options.priority - 优先级筛选
   * @param {number} options.limit - 返回数量限制
   * @param {number} options.offset - 偏移量
   * @returns {Promise<Array<SystemAnnouncement>>} 有效公告列表
   */
  SystemAnnouncement.getActiveAnnouncements = async function (options = {}) {
    const { type = null, priority = null, limit = 10, offset = 0 } = options
    const { Op } = require('sequelize')

    const whereClause = {
      is_active: true,
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: BeijingTimeHelper.createBeijingTime() } }
      ]
    }

    if (type) {
      // 🔴 支持数组类型筛选（修复文档中提到的IN数组查询问题）
      whereClause.type = Array.isArray(type) ? { [Op.in]: type } : type
    }
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
  }

  /**
   * 获取首页公告
   * @param {number} limit - 返回数量限制
   * @returns {Promise<Array<SystemAnnouncement>>} 首页公告列表
   */
  SystemAnnouncement.getHomePageAnnouncements = async function (limit = 5) {
    return this.getActiveAnnouncements({
      type: ['system', 'activity', 'notice'],
      limit
    })
  }

  /**
   * 创建新公告
   * @param {Object} data - 公告数据
   * @param {number} adminId - 创建管理员ID
   * @returns {Promise<SystemAnnouncement>} 新创建的公告实例
   */
  SystemAnnouncement.createAnnouncement = async function (data, adminId) {
    return this.create({
      ...data,
      admin_id: adminId,
      created_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })
  }

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
