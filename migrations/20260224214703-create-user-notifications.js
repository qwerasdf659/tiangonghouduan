'use strict'

/**
 * 创建 user_notifications 表 — 用户通知系统独立化（方案B）
 *
 * 业务背景：
 *   系统通知（挂牌成功、购买完成、中奖等）原先寄生在 chat_messages 表，
 *   导致客服聊天被 97.6% 的系统消息淹没。
 *   方案B将用户通知独立存储到专用表，客服聊天回归纯粹人工对话。
 *
 * 设计要点：
 *   - 永久保留（交易通知是交易凭证，用于纠纷回查）
 *   - metadata JSON 字段存储不同通知类型的业务上下文
 *   - wx_push_status 预留微信订阅消息推送（暂不启用）
 *   - 三个索引覆盖列表分页、未读计数、类型筛选
 *
 * @see docs/通知系统独立化-方案B实施文档.md
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查表是否已存在，避免重复创建
    const [tables] = await queryInterface.sequelize.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_notifications'"
    )
    if (tables.length > 0) {
      console.log('⚠️ user_notifications 表已存在，跳过创建')
      return
    }

    await queryInterface.createTable('user_notifications', {
      /**
       * 通知ID（主键）
       * 使用 BIGINT 应对长期数据增长（交易通知永久保留）
       */
      notification_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '通知ID（主键）'
      },

      /**
       * 接收用户ID
       * 不设数据库外键约束（与项目现有风格一致，通过应用层保证）
       */
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '接收用户ID'
      },

      /**
       * 通知类型
       * VARCHAR(50) 纯应用层枚举，新增类型无需DDL变更
       * 示例值：listing_created / purchase_completed / lottery_win / listing_sold / listing_withdrawn
       */
      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '通知类型（如 listing_created, purchase_completed, lottery_win 等）'
      },

      /**
       * 通知标题
       * 用户可见的通知摘要（如 "📦 挂牌成功"）
       */
      title: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: '通知标题（如 "📦 挂牌成功"）'
      },

      /**
       * 通知正文
       * 完整的通知内容描述
       */
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: '通知正文'
      },

      /**
       * 附加业务数据
       * 不同通知类型携带不同业务上下文：
       *   listing_created: { market_listing_id, offer_asset_code, quantity, unit_price }
       *   purchase_completed: { trade_order_id, asset_code, quantity, total_cost }
       *   lottery_win: { lottery_draw_id, prize_name, tier }
       */
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '附加业务数据（JSON，按通知类型存储不同业务上下文）'
      },

      /**
       * 已读标记
       * TINYINT(1)：0=未读，1=已读
       */
      is_read: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 0,
        comment: '已读标记（0=未读，1=已读）'
      },

      /**
       * 已读时间
       * 用户点击标记已读的时间
       */
      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
        comment: '已读时间'
      },

      /**
       * 微信订阅消息推送状态（预留字段，暂不启用）
       * skipped: 默认值，未推送
       * pending: 待推送
       * sent: 已推送
       * failed: 推送失败
       */
      wx_push_status: {
        type: Sequelize.ENUM('skipped', 'pending', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'skipped',
        comment: '微信订阅消息推送状态（预留，暂不启用）'
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '创建时间'
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '更新时间'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '用户通知表 — 系统通知独立存储（方案B），永久保留交易凭证'
    })

    // 检查索引是否已存在后再创建
    const [existingIndexes] = await queryInterface.sequelize.query(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_notifications' GROUP BY INDEX_NAME"
    )
    const indexNames = existingIndexes.map(i => i.INDEX_NAME)

    // 用户通知列表分页查询（按时间倒序）
    if (!indexNames.includes('idx_user_notifications_user_created')) {
      await queryInterface.addIndex('user_notifications', ['user_id', 'created_at'], {
        name: 'idx_user_notifications_user_created'
      })
    }

    // 未读数量统计
    if (!indexNames.includes('idx_user_notifications_user_unread')) {
      await queryInterface.addIndex('user_notifications', ['user_id', 'is_read'], {
        name: 'idx_user_notifications_user_unread'
      })
    }

    // 按类型筛选
    if (!indexNames.includes('idx_user_notifications_type')) {
      await queryInterface.addIndex('user_notifications', ['type'], {
        name: 'idx_user_notifications_type'
      })
    }

    console.log('✅ user_notifications 表创建成功（含 3 个索引）')
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_notifications')
    console.log('✅ user_notifications 表已删除')
  }
}
