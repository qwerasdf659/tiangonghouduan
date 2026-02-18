/**
 * 广告点击日志模型（AdClickLog）
 *
 * 业务场景：
 * - 记录用户点击广告的事件
 * - 用于统计点击量、计算CTR、分析点击效果
 * - 支持反作弊验证（识别无效点击）
 *
 * 数据库表名：ad_click_logs
 * 主键：ad_click_log_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 AdClickLog 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdClickLog 模型
 */
module.exports = sequelize => {
  const AdClickLog = sequelize.define(
    'AdClickLog',
    {
      ad_click_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '点击日志主键ID'
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

      ad_slot_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'ad_slots', key: 'ad_slot_id' },
        comment: '广告位ID（外键→ad_slots）'
      },

      click_target: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '点击目标（跳转链接或页面路径）'
      },

      is_valid: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否有效点击'
      },

      invalid_reason: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          isIn: {
            args: [['fake_click', 'self_click', null]],
            msg: '无效原因必须是：fake_click, self_click 之一或为空'
          }
        },
        comment: '无效原因：fake_click=虚假点击 / self_click=自己点击'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间（点击时间）'
      }
    },
    {
      tableName: 'ad_click_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '广告点击日志表',

      hooks: {
        beforeCreate: log => {
          log.created_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_acl_campaign', fields: ['ad_campaign_id', 'created_at'] },
        { name: 'idx_acl_user', fields: ['user_id', 'created_at'] },
        { name: 'idx_acl_slot', fields: ['ad_slot_id', 'created_at'] },
        { name: 'idx_acl_valid', fields: ['is_valid', 'created_at'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdClickLog.associate = models => {
    AdClickLog.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'adCampaign',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdClickLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdClickLog.belongsTo(models.AdSlot, {
      foreignKey: 'ad_slot_id',
      as: 'adSlot',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    AdClickLog.hasMany(models.AdAttributionLog, {
      foreignKey: 'ad_click_log_id',
      as: 'attributionLogs',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })
  }

  return AdClickLog
}
