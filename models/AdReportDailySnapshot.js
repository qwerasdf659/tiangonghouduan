/**
 * 广告日报快照模型（AdReportDailySnapshot）
 *
 * 业务场景：
 * - 每日定时汇总广告数据，生成快照
 * - 用于报表展示、趋势分析、性能优化
 * - 减少实时查询压力，提升报表查询性能
 *
 * 数据库表名：ad_report_daily_snapshots
 * 主键：snapshot_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 AdReportDailySnapshot 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdReportDailySnapshot 模型
 */
module.exports = sequelize => {
  const AdReportDailySnapshot = sequelize.define(
    'AdReportDailySnapshot',
    {
      snapshot_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '快照主键ID'
      },

      snapshot_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '快照日期（YYYY-MM-DD）'
      },

      ad_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
        comment: '广告活动ID（外键→ad_campaigns）'
      },

      ad_slot_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'ad_slots', key: 'ad_slot_id' },
        comment: '广告位ID（外键→ad_slots）'
      },

      impressions_total: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: '总展示数不能为负数' } },
        comment: '总展示数'
      },

      impressions_valid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: '有效展示数不能为负数' } },
        comment: '有效展示数'
      },

      clicks_total: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: '总点击数不能为负数' } },
        comment: '总点击数'
      },

      clicks_valid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: '有效点击数不能为负数' } },
        comment: '有效点击数'
      },

      conversions: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: '转化数不能为负数' } },
        comment: '转化数'
      },

      spend_diamond: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: '消耗钻石数不能为负数' } },
        comment: '消耗钻石数'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间（快照生成时间）'
      }
    },
    {
      tableName: 'ad_report_daily_snapshots',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '广告日报快照表',

      hooks: {
        beforeCreate: snapshot => {
          snapshot.created_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        {
          name: 'uk_ards_date_campaign_slot',
          unique: true,
          fields: ['snapshot_date', 'ad_campaign_id', 'ad_slot_id']
        },
        { name: 'idx_ards_date', fields: ['snapshot_date'] },
        { name: 'idx_ards_campaign', fields: ['ad_campaign_id', 'snapshot_date'] },
        { name: 'idx_ards_slot', fields: ['ad_slot_id', 'snapshot_date'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdReportDailySnapshot.associate = models => {
    AdReportDailySnapshot.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'adCampaign',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdReportDailySnapshot.belongsTo(models.AdSlot, {
      foreignKey: 'ad_slot_id',
      as: 'adSlot',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return AdReportDailySnapshot
}
