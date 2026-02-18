/**
 * 广告竞价日志模型（AdBidLog）
 *
 * 业务场景：
 * - 记录广告竞价过程中的每次出价
 * - 用于分析竞价策略、出价分布、胜率统计
 * - 支持反作弊分析（识别异常出价模式）
 *
 * 数据库表名：ad_bid_logs
 * 主键：ad_bid_log_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 AdBidLog 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdBidLog 模型
 */
module.exports = sequelize => {
  const AdBidLog = sequelize.define(
    'AdBidLog',
    {
      ad_bid_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '竞价日志主键ID'
      },

      ad_slot_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'ad_slots', key: 'ad_slot_id' },
        comment: '广告位ID（外键→ad_slots）'
      },

      ad_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
        comment: '广告活动ID（外键→ad_campaigns）'
      },

      bid_amount_diamond: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: { args: [0], msg: '出价金额不能为负数' } },
        comment: '出价金额（钻石）'
      },

      is_winner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否中标'
      },

      target_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        comment: '目标用户ID（外键→users）'
      },

      lose_reason: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          isIn: {
            args: [['outbid', 'targeting_mismatch', 'budget_exhausted', null]],
            msg: '失败原因必须是：outbid, targeting_mismatch, budget_exhausted 之一或为空'
          }
        },
        comment: '未中标原因：outbid=被更高价击败 / targeting_mismatch=定向不匹配 / budget_exhausted=预算耗尽'
      },

      bid_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('bid_at'))
        },
        comment: '出价时间'
      }
    },
    {
      tableName: 'ad_bid_logs',
      timestamps: false,
      comment: '广告竞价日志表',

      hooks: {
        beforeCreate: log => {
          if (!log.bid_at) {
            log.bid_at = BeijingTimeHelper.createBeijingTime()
          }
        }
      },

      indexes: [
        { name: 'idx_abl_slot_time', fields: ['ad_slot_id', 'bid_at'] },
        { name: 'idx_abl_campaign', fields: ['ad_campaign_id'] },
        { name: 'idx_abl_user', fields: ['target_user_id'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdBidLog.associate = models => {
    AdBidLog.belongsTo(models.AdSlot, {
      foreignKey: 'ad_slot_id',
      as: 'adSlot',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdBidLog.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'adCampaign',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdBidLog.belongsTo(models.User, {
      foreignKey: 'target_user_id',
      as: 'targetUser',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  return AdBidLog
}
