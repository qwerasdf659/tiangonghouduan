/**
 * 广告归因日志模型（AdAttributionLog）
 *
 * 业务场景：
 * - 记录广告点击后的转化归因
 * - 用于分析广告效果、计算ROI、优化投放策略
 * - 支持多转化类型归因（抽奖、兑换、购买等）
 *
 * 数据库表名：ad_attribution_logs
 * 主键：ad_attribution_log_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 AdAttributionLog 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdAttributionLog 模型
 */
module.exports = sequelize => {
  const AdAttributionLog = sequelize.define(
    'AdAttributionLog',
    {
      ad_attribution_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '归因日志主键ID'
      },

      ad_click_log_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'ad_click_logs', key: 'ad_click_log_id' },
        comment: '点击日志ID（外键→ad_click_logs）'
      },

      ad_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
        comment: '广告活动ID（外键→ad_campaigns）'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        comment: '用户ID（外键→users）'
      },

      conversion_type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          isIn: {
            args: [['lottery_draw', 'exchange', 'market_buy', 'page_view']],
            msg: '转化类型必须是：lottery_draw, exchange, market_buy, page_view 之一'
          }
        },
        comment: '转化类型：lottery_draw=抽奖 / exchange=兑换 / market_buy=市场购买 / page_view=页面浏览'
      },

      conversion_entity_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '转化实体ID（如：抽奖ID、商品ID、订单ID等）'
      },

      click_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('click_at'))
        },
        comment: '点击时间'
      },

      conversion_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('conversion_at'))
        },
        comment: '转化时间'
      },

      attribution_window_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 24,
        validate: { min: { args: [1], msg: '归因窗口不能小于1小时' } },
        comment: '归因窗口（小时，默认24小时）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间（归因记录时间）'
      }
    },
    {
      tableName: 'ad_attribution_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '广告归因日志表',

      hooks: {
        beforeCreate: log => {
          log.created_at = BeijingTimeHelper.createBeijingTime()
          if (!log.click_at) {
            log.click_at = BeijingTimeHelper.createBeijingTime()
          }
          if (!log.conversion_at) {
            log.conversion_at = BeijingTimeHelper.createBeijingTime()
          }
        }
      },

      indexes: [
        { name: 'idx_aal_click', fields: ['ad_click_log_id'] },
        { name: 'idx_aal_campaign', fields: ['ad_campaign_id', 'conversion_at'] },
        { name: 'idx_aal_user', fields: ['user_id', 'conversion_at'] },
        { name: 'idx_aal_conversion', fields: ['conversion_type', 'conversion_at'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdAttributionLog.associate = models => {
    AdAttributionLog.belongsTo(models.AdClickLog, {
      foreignKey: 'ad_click_log_id',
      as: 'clickLog',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdAttributionLog.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'adCampaign',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdAttributionLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return AdAttributionLog
}
