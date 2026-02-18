/**
 * 广告反作弊日志模型（AdAntifraudLog）
 *
 * 业务场景：
 * - 记录反作弊系统触发的规则和判定结果
 * - 用于分析作弊模式、优化反作弊规则
 * - 支持审计和追溯
 *
 * 数据库表名：ad_antifraud_logs
 * 主键：ad_antifraud_log_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 AdAntifraudLog 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdAntifraudLog 模型
 */
module.exports = sequelize => {
  const AdAntifraudLog = sequelize.define(
    'AdAntifraudLog',
    {
      ad_antifraud_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '反作弊日志主键ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        comment: '用户ID（外键→users）'
      },

      ad_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'ad_campaigns', key: 'ad_campaign_id' },
        comment: '广告活动ID（外键→ad_campaigns）'
      },

      event_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: {
            args: [['impression', 'click']],
            msg: '事件类型必须是：impression, click 之一'
          }
        },
        comment: '事件类型：impression=展示 / click=点击'
      },

      rule_triggered: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: { notEmpty: { msg: '触发规则不能为空' } },
        comment: '触发的反作弊规则（如：frequency_limit, batch_detection, device_fingerprint）'
      },

      verdict: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: {
            args: [['valid', 'invalid', 'suspicious']],
            msg: '判定结果必须是：valid, invalid, suspicious 之一'
          }
        },
        comment: '判定结果：valid=有效 / invalid=无效 / suspicious=可疑'
      },

      raw_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '原始数据（JSON格式，用于后续分析）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间（判定时间）'
      }
    },
    {
      tableName: 'ad_antifraud_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '广告反作弊日志表',

      hooks: {
        beforeCreate: log => {
          log.created_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_aal_user', fields: ['user_id', 'created_at'] },
        { name: 'idx_aal_campaign', fields: ['ad_campaign_id', 'created_at'] },
        { name: 'idx_aal_event', fields: ['event_type', 'created_at'] },
        { name: 'idx_aal_verdict', fields: ['verdict', 'created_at'] },
        { name: 'idx_aal_rule', fields: ['rule_triggered', 'created_at'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdAntifraudLog.associate = models => {
    AdAntifraudLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdAntifraudLog.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'adCampaign',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return AdAntifraudLog
}
