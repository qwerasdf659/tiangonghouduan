/**
 * 管理员通知消息模型
 *
 * 业务场景：
 * - 存储管理员的各类通知消息（系统通知、告警、提醒、任务等）
 * - 支持消息优先级和已读状态管理
 * - 关联来源类型和来源ID，方便追溯消息来源
 * - 支持消息过期机制
 *
 * 表名：admin_notifications
 * 创建时间：2026年02月01日
 */

'use strict'

const { DataTypes, Op } = require('sequelize')

/**
 * 通知类型枚举
 * @readonly
 * @enum {string}
 */
const NOTIFICATION_TYPES = {
  SYSTEM: 'system', // 系统通知
  ALERT: 'alert', // 告警通知
  REMINDER: 'reminder', // 提醒通知
  TASK: 'task' // 任务通知
}

/**
 * 优先级枚举
 * @readonly
 * @enum {string}
 */
const PRIORITIES = {
  LOW: 'low', // 低优先级
  NORMAL: 'normal', // 普通优先级
  HIGH: 'high', // 高优先级
  URGENT: 'urgent' // 紧急优先级
}

module.exports = sequelize => {
  const AdminNotification = sequelize.define(
    'AdminNotification',
    {
      /**
       * 通知ID（主键）
       * @type {number}
       * 命名规范：{table_name}_id
       */
      notification_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '通知ID（主键）'
      },

      /**
       * 接收管理员ID
       * @type {number}
       * 外键关联 users 表的 user_id
       */
      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '接收管理员ID'
      },

      /**
       * 通知标题
       * @type {string}
       */
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '通知标题'
      },

      /**
       * 通知内容
       * @type {string|null}
       */
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '通知内容（详细描述）'
      },

      /**
       * 通知类型
       * @type {string}
       * @see NOTIFICATION_TYPES
       */
      notification_type: {
        type: DataTypes.ENUM(...Object.values(NOTIFICATION_TYPES)),
        allowNull: false,
        defaultValue: NOTIFICATION_TYPES.SYSTEM,
        comment: '通知类型（system=系统通知, alert=告警, reminder=提醒, task=任务）'
      },

      /**
       * 优先级
       * @type {string}
       * @see PRIORITIES
       */
      priority: {
        type: DataTypes.ENUM(...Object.values(PRIORITIES)),
        allowNull: false,
        defaultValue: PRIORITIES.NORMAL,
        comment: '优先级（low=低, normal=普通, high=高, urgent=紧急）'
      },

      /**
       * 是否已读
       * @type {boolean}
       */
      is_read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已读'
      },

      /**
       * 阅读时间
       * @type {Date|null}
       */
      read_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '阅读时间'
      },

      /**
       * 来源类型
       * @type {string|null}
       * 用于标识通知来源，如：lottery_alert, consumption, reminder_rule
       */
      source_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '来源类型（如：lottery_alert, consumption, reminder_rule）'
      },

      /**
       * 来源ID
       * @type {number|null}
       */
      source_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '来源ID（关联来源实体）'
      },

      /**
       * 附加数据
       * @type {Object|null}
       * 存储额外的业务数据，如跳转链接、操作按钮等
       */
      extra_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '附加数据（JSON格式，如跳转链接、操作按钮等）'
      },

      /**
       * 过期时间
       * @type {Date|null}
       */
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间（超时后自动标记过期）'
      }
    },
    {
      sequelize,
      modelName: 'AdminNotification',
      tableName: 'admin_notifications',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '管理员通知消息表',

      indexes: [
        { fields: ['admin_id', 'is_read'], name: 'idx_admin_notifications_admin_read' },
        {
          fields: ['notification_type', 'created_at'],
          name: 'idx_admin_notifications_type_created'
        },
        { fields: ['priority', 'is_read'], name: 'idx_admin_notifications_priority_read' },
        { fields: ['source_type', 'source_id'], name: 'idx_admin_notifications_source' }
      ],

      scopes: {
        /**
         * 未读通知
         */
        unread: {
          where: { is_read: false }
        },

        /**
         * 高优先级（high + urgent）
         */
        highPriority: {
          where: {
            priority: {
              [Op.in]: [PRIORITIES.HIGH, PRIORITIES.URGENT]
            }
          }
        },

        /**
         * 未过期通知
         */
        valid: {
          where: {
            [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }]
          }
        },

        /**
         * 按类型筛选
         * @param {string} type - 通知类型
         * @returns {Object} Sequelize scope 查询条件
         */
        byType: type => ({
          where: { notification_type: type }
        }),

        /**
         * 按管理员筛选
         * @param {number} adminId - 管理员ID
         * @returns {Object} Sequelize scope 查询条件
         */
        forAdmin: adminId => ({
          where: { admin_id: adminId }
        })
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdminNotification.associate = function (models) {
    // 关联管理员用户
    AdminNotification.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin'
    })
  }

  /*
   * ========================================
   * 实例方法
   * ========================================
   */

  /**
   * 标记为已读
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<AdminNotification>} 更新后的通知实例
   */
  AdminNotification.prototype.markAsRead = async function (options = {}) {
    if (!this.is_read) {
      this.is_read = true
      this.read_at = new Date()
      await this.save(options)
    }
    return this
  }

  /**
   * 检查是否已过期
   * @returns {boolean} 是否已过期
   */
  AdminNotification.prototype.isExpired = function () {
    if (!this.expires_at) return false
    return new Date() > new Date(this.expires_at)
  }

  /*
   * ========================================
   * 类方法
   * ========================================
   */

  /**
   * 获取管理员未读通知数量
   * @param {number} adminId - 管理员ID
   * @returns {Promise<number>} 未读数量
   */
  AdminNotification.getUnreadCount = async function (adminId) {
    return this.scope(['unread', 'valid', { method: ['forAdmin', adminId] }]).count()
  }

  /**
   * 获取管理员未读高优先级通知数量
   * @param {number} adminId - 管理员ID
   * @returns {Promise<number>} 未读高优先级数量
   */
  AdminNotification.getUrgentUnreadCount = async function (adminId) {
    return this.scope([
      'unread',
      'highPriority',
      'valid',
      { method: ['forAdmin', adminId] }
    ]).count()
  }

  /**
   * 批量标记为已读
   * @param {number} adminId - 管理员ID
   * @param {number[]} [notificationIds] - 通知ID列表（可选，不传则全部标记）
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<number>} 更新数量
   */
  AdminNotification.markAllAsRead = async function (adminId, notificationIds = null, options = {}) {
    const where = { admin_id: adminId, is_read: false }

    if (notificationIds && notificationIds.length > 0) {
      where.notification_id = { [Op.in]: notificationIds }
    }

    const [affectedCount] = await this.update(
      { is_read: true, read_at: new Date() },
      { where, ...options }
    )

    return affectedCount
  }

  /**
   * 创建系统通知
   * @param {number} adminId - 管理员ID
   * @param {string} title - 标题
   * @param {string} [content] - 内容
   * @param {Object} [options] - 额外选项
   * @returns {Promise<AdminNotification>} 创建的通知实例
   */
  AdminNotification.createSystemNotification = async function (
    adminId,
    title,
    content = null,
    options = {}
  ) {
    const {
      priority = PRIORITIES.NORMAL,
      source_type,
      source_id,
      extra_data,
      expires_at,
      transaction
    } = options

    return this.create(
      {
        admin_id: adminId,
        title,
        content,
        notification_type: NOTIFICATION_TYPES.SYSTEM,
        priority,
        source_type,
        source_id,
        extra_data,
        expires_at
      },
      { transaction }
    )
  }

  /**
   * 创建告警通知
   * @param {number} adminId - 管理员ID
   * @param {string} title - 标题
   * @param {string} [content] - 内容
   * @param {Object} [options] - 额外选项
   * @returns {Promise<AdminNotification>} 创建的通知实例
   */
  AdminNotification.createAlertNotification = async function (
    adminId,
    title,
    content = null,
    options = {}
  ) {
    const {
      priority = PRIORITIES.HIGH,
      source_type,
      source_id,
      extra_data,
      expires_at,
      transaction
    } = options

    return this.create(
      {
        admin_id: adminId,
        title,
        content,
        notification_type: NOTIFICATION_TYPES.ALERT,
        priority,
        source_type,
        source_id,
        extra_data,
        expires_at
      },
      { transaction }
    )
  }

  /**
   * 清理过期通知
   * @param {number} [daysToKeep=30] - 保留天数
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<number>} 删除数量
   */
  AdminNotification.cleanupExpired = async function (daysToKeep = 30, options = {}) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const deleted = await this.destroy({
      where: {
        [Op.or]: [
          { expires_at: { [Op.lt]: new Date() } },
          {
            is_read: true,
            read_at: { [Op.lt]: cutoffDate }
          }
        ]
      },
      ...options
    })

    return deleted
  }

  // 导出常量
  AdminNotification.NOTIFICATION_TYPES = NOTIFICATION_TYPES
  AdminNotification.PRIORITIES = PRIORITIES

  return AdminNotification
}
