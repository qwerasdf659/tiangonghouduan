/**
 * 用户通知模型 — 系统通知独立存储（方案B）
 *
 * 业务场景：
 * - 存储面向普通用户的系统通知（挂牌成功、购买完成、中奖、兑换审核等）
 * - 与客服聊天系统（chat_messages）完全分离，互不干扰
 * - 支持已读/未读状态管理、按类型筛选、分页查询
 * - 预留微信订阅消息推送字段（wx_push_status）
 *
 * 表名：user_notifications
 * 主键：notification_id（BIGINT，应对长期数据增长，交易通知永久保留）
 * 创建时间：2026年02月24日
 *
 * @see docs/通知系统独立化-方案B实施文档.md
 */

'use strict'

const { DataTypes, Op } = require('sequelize')

/**
 * 用户通知类型枚举（应用层定义，VARCHAR(50) 无需 DDL 变更即可扩展）
 * @readonly
 * @enum {string}
 */
const USER_NOTIFICATION_TYPES = {
  LISTING_CREATED: 'listing_created',
  LISTING_SOLD: 'listing_sold',
  LISTING_WITHDRAWN: 'listing_withdrawn',
  LISTING_EXPIRED: 'listing_expired',
  PURCHASE_COMPLETED: 'purchase_completed',
  TRADE_COMPLETE_SELLER: 'trade_complete_seller',
  TRADE_COMPLETE_BUYER: 'trade_complete_buyer',
  LOTTERY_WIN: 'lottery_win',
  LOTTERY_RESULT: 'lottery_result',
  EXCHANGE_PENDING: 'exchange_pending',
  EXCHANGE_APPROVED: 'exchange_approved',
  EXCHANGE_REJECTED: 'exchange_rejected',
  POINTS_CHANGE: 'points_change',
  PREMIUM_UNLOCK: 'premium_unlock',
  PREMIUM_EXPIRING: 'premium_expiring',
  PREMIUM_EXPIRED: 'premium_expired',
  SECURITY_EVENT: 'security_event',
  ANNOUNCEMENT: 'announcement',
  BID_OUTBID: 'bid_outbid',
  BID_WON: 'bid_won',
  BID_LOST: 'bid_lost'
}

/**
 * 微信推送状态枚举
 * @readonly
 * @enum {string}
 */
const WX_PUSH_STATUS = {
  SKIPPED: 'skipped',
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed'
}

module.exports = sequelize => {
  const UserNotification = sequelize.define(
    'UserNotification',
    {
      /**
       * 通知ID（主键，BIGINT 应对永久保留策略下的长期增长）
       * @type {number}
       */
      notification_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '通知ID（主键）'
      },

      /**
       * 接收用户ID
       * @type {number}
       * 外键语义关联 users.user_id（应用层保证）
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '接收用户ID'
      },

      /**
       * 通知类型
       * @type {string}
       * @see USER_NOTIFICATION_TYPES
       */
      type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '通知类型（listing_created, purchase_completed, lottery_win 等）'
      },

      /**
       * 通知标题（用户可见摘要）
       * @type {string}
       */
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '通知标题'
      },

      /**
       * 通知正文
       * @type {string}
       */
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '通知正文'
      },

      /**
       * 附加业务数据（JSON）
       * 按通知类型存储不同的业务上下文数据：
       *   listing_created → { market_listing_id, offer_asset_code, quantity, unit_price }
       *   purchase_completed → { trade_order_id, asset_code, quantity, total_cost }
       *   lottery_win → { lottery_draw_id, prize_name, tier }
       * @type {Object|null}
       */
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '附加业务数据（JSON）'
      },

      /**
       * 已读标记
       * @type {number}
       * 0=未读，1=已读
       */
      is_read: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 0,
        comment: '已读标记（0=未读，1=已读）'
      },

      /**
       * 已读时间（用户点击标记已读的时间）
       * @type {Date|null}
       */
      read_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: '已读时间'
      },

      /**
       * 微信订阅消息推送状态（预留字段，暂不启用）
       * @type {string}
       * @see WX_PUSH_STATUS
       */
      wx_push_status: {
        type: DataTypes.ENUM(...Object.values(WX_PUSH_STATUS)),
        allowNull: false,
        defaultValue: WX_PUSH_STATUS.SKIPPED,
        comment: '微信订阅消息推送状态（预留，暂不启用）'
      }
    },
    {
      sequelize,
      modelName: 'UserNotification',
      tableName: 'user_notifications',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '用户通知表 — 系统通知独立存储（方案B）',

      indexes: [
        {
          fields: ['user_id', 'created_at'],
          name: 'idx_user_notifications_user_created'
        },
        {
          fields: ['user_id', 'is_read'],
          name: 'idx_user_notifications_user_unread'
        },
        {
          fields: ['type'],
          name: 'idx_user_notifications_type'
        }
      ],

      scopes: {
        /** 未读通知 */
        unread: {
          where: { is_read: 0 }
        },

        /** 已读通知 */
        read: {
          where: { is_read: 1 }
        },

        /**
         * 按类型筛选
         * @param {string} notificationType - 通知类型
         * @returns {Object} Sequelize scope 查询条件
         */
        byType: notificationType => ({
          where: { type: notificationType }
        }),

        /**
         * 按用户筛选
         * @param {number} userId - 用户ID
         * @returns {Object} Sequelize scope 查询条件
         */
        forUser: userId => ({
          where: { user_id: userId }
        })
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  UserNotification.associate = function (models) {
    UserNotification.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
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
   * @returns {Promise<UserNotification>} 更新后的通知实例
   */
  UserNotification.prototype.markAsRead = async function (options = {}) {
    if (this.is_read === 0) {
      this.is_read = 1
      this.read_at = new Date()
      await this.save(options)
    }
    return this
  }

  /*
   * ========================================
   * 类方法
   * ========================================
   */

  /**
   * 获取用户未读通知数量
   * @param {number} userId - 用户ID
   * @returns {Promise<number>} 未读通知数量
   */
  UserNotification.getUnreadCount = async function (userId) {
    return this.count({
      where: { user_id: userId, is_read: 0 }
    })
  }

  /**
   * 批量标记已读
   * @param {number} userId - 用户ID
   * @param {number[]} [notificationIds] - 通知ID列表（空数组或不传则全部标记已读）
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<number>} 更新数量
   */
  UserNotification.markBatchAsRead = async function (userId, notificationIds = null, options = {}) {
    const where = { user_id: userId, is_read: 0 }

    if (notificationIds && notificationIds.length > 0) {
      where.notification_id = { [Op.in]: notificationIds }
    }

    const [affectedCount] = await this.update(
      { is_read: 1, read_at: new Date() },
      { where, ...options }
    )

    return affectedCount
  }

  // 导出常量
  UserNotification.NOTIFICATION_TYPES = USER_NOTIFICATION_TYPES
  UserNotification.WX_PUSH_STATUS = WX_PUSH_STATUS

  return UserNotification
}
