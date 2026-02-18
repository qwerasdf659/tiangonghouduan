/**
 * 广告展示日志模型（AdImpressionLog）
 *
 * 业务场景：
 * - 记录广告的每次展示（曝光）情况
 * - 用于统计广告效果、计算计费、分析用户行为
 * - 支持标记无效展示（如：重复展示、异常展示等）
 *
 * 设计决策：
 * - 日志表设计，仅记录创建时间，不更新
 * - 记录展示的有效性，便于后续数据清洗和统计
 * - 关联用户、广告计划、广告位，便于多维度分析
 * - 使用BIGINT主键，支持海量日志数据
 *
 * 数据库表名：ad_impression_logs
 * 主键：ad_impression_log_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 AdImpressionLog 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdImpressionLog 模型
 */
module.exports = sequelize => {
  const AdImpressionLog = sequelize.define(
    'AdImpressionLog',
    {
      ad_impression_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '展示日志主键ID'
      },

      ad_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '广告计划ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '观看用户ID'
      },

      ad_slot_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '广告位ID'
      },

      is_valid: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否有效展示（false表示无效，如重复展示、异常展示等）'
      },

      invalid_reason: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: '无效原因长度不能超过50字符' }
        },
        comment: '无效原因（当is_valid=false时记录）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间（展示时间）'
      }
    },
    {
      tableName: 'ad_impression_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '广告展示日志表 - 记录广告的每次展示情况',

      hooks: {
        beforeCreate: log => {
          log.created_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_campaign', fields: ['ad_campaign_id'] },
        { name: 'idx_user', fields: ['user_id'] },
        { name: 'idx_slot', fields: ['ad_slot_id'] },
        { name: 'idx_valid', fields: ['is_valid'] },
        { name: 'idx_created_at', fields: ['created_at'] },
        { name: 'idx_campaign_user', fields: ['ad_campaign_id', 'user_id'] },
        { name: 'idx_campaign_date', fields: ['ad_campaign_id', 'created_at'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdImpressionLog.associate = models => {
    // 所属广告计划
    AdImpressionLog.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'campaign',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 观看用户
    AdImpressionLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 广告位
    AdImpressionLog.belongsTo(models.AdSlot, {
      foreignKey: 'ad_slot_id',
      as: 'adSlot',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return AdImpressionLog
}
