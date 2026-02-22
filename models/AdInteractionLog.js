/**
 * 内容交互日志模型（AdInteractionLog）
 *
 * 业务场景：
 * - 统一记录弹窗/轮播/公告的展示、点击、关闭、滑动等交互事件
 * - 替代原 popup_show_logs 和 carousel_show_logs 两张独立表
 * - 通过 extra_data JSON 存储不同交互类型的异构扩展数据
 *
 * 设计决策（D2 定论：方案 B）：
 * - 新建通用交互表，不污染 ad_impression_logs（广告计费日志）
 * - interaction_type + extra_data JSON 实现灵活扩展
 * - 未来新增交互类型（如长按、分享、收藏）无需 ALTER TABLE
 * - 对标阿里"统一曝光表 + extra_data JSON"方案
 *
 * 数据库表名：ad_interaction_logs
 * 主键：ad_interaction_log_id（BIGINT，自增）
 *
 * @see docs/内容投放系统-重复功能合并方案.md 第十二节 D2
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 交互类型有效值
 * - impression：展示（弹窗弹出、轮播曝光、公告展现）
 * - click：点击（用户点击内容）
 * - close：关闭（用户手动关闭弹窗）
 * - swipe：滑动（用户手动滑动轮播）
 * @constant {string[]}
 */
const VALID_INTERACTION_TYPES = ['impression', 'click', 'close', 'swipe']

/**
 * 定义 AdInteractionLog 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdInteractionLog 模型
 */
module.exports = sequelize => {
  const AdInteractionLog = sequelize.define(
    'AdInteractionLog',
    {
      ad_interaction_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '交互日志主键ID'
      },

      ad_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联广告计划ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },

      ad_slot_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '广告位ID（可为空）'
      },

      interaction_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          notEmpty: { msg: '交互类型不能为空' },
          isIn: {
            args: [VALID_INTERACTION_TYPES],
            msg: '交互类型必须是：impression, click, close, swipe 之一'
          }
        },
        comment: '交互类型：impression=展示 / click=点击 / close=关闭 / swipe=滑动'
      },

      extra_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展数据JSON（弹窗: show_duration_ms/close_method/queue_position; 轮播: exposure_duration_ms/is_manual_swipe/is_clicked）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      }
    },
    {
      tableName: 'ad_interaction_logs',
      timestamps: false,
      comment: '内容交互日志表 — 统一记录弹窗/轮播/公告的交互事件（D2 定论方案 B）',

      hooks: {
        beforeCreate: log => {
          log.created_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_ail_campaign', fields: ['ad_campaign_id'] },
        { name: 'idx_ail_user', fields: ['user_id'] },
        { name: 'idx_ail_type', fields: ['interaction_type'] },
        { name: 'idx_ail_created', fields: ['created_at'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdInteractionLog.associate = models => {
    AdInteractionLog.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'campaign',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })

    AdInteractionLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })

    AdInteractionLog.belongsTo(models.AdSlot, {
      foreignKey: 'ad_slot_id',
      as: 'adSlot',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  return AdInteractionLog
}

module.exports.VALID_INTERACTION_TYPES = VALID_INTERACTION_TYPES
