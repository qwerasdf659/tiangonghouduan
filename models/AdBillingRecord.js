/**
 * 广告计费记录模型（AdBillingRecord）
 *
 * 业务场景：
 * - 记录广告计划的资金变动（冻结、扣款、退款、日扣等）
 * - 关联资产交易记录，实现资金流转的可追溯性
 * - 按日期记录每日的计费情况，便于对账和统计
 *
 * 设计决策：
 * - 使用 business_id 作为幂等键，防止重复计费
 * - 记录计费类型，区分不同的资金操作（冻结、扣款、退款等）
 * - 关联资产交易ID，实现与资产系统的数据一致性
 * - 仅记录创建时间，不记录更新时间（日志表特性）
 *
 * 数据库表名：ad_billing_records
 * 主键：ad_billing_record_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 计费类型有效值
 * @constant {string[]}
 */
const VALID_BILLING_TYPES = ['freeze', 'deduct', 'refund', 'daily_deduct']

/**
 * 定义 AdBillingRecord 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdBillingRecord 模型
 */
module.exports = sequelize => {
  const AdBillingRecord = sequelize.define(
    'AdBillingRecord',
    {
      ad_billing_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '计费记录主键ID'
      },

      business_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: '业务唯一ID不能为空' },
          len: { args: [1, 100], msg: '业务唯一ID长度必须在1-100字符之间' }
        },
        comment: '业务唯一ID，用于幂等性控制'
      },

      ad_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所属广告计划ID'
      },

      advertiser_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '广告主用户ID'
      },

      billing_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '计费日期'
      },

      amount_diamond: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          notEmpty: { msg: '计费金额不能为空' },
          min: { args: [0], msg: '计费金额不能为负数' }
        },
        comment: '计费金额（钻石）'
      },

      billing_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          notEmpty: { msg: '计费类型不能为空' },
          isIn: {
            args: [VALID_BILLING_TYPES],
            msg: '计费类型必须是：freeze, deduct, refund, daily_deduct 之一'
          }
        },
        comment: '计费类型：freeze=冻结 / deduct=扣款 / refund=退款 / daily_deduct=日扣'
      },

      asset_transaction_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联的资产交易ID'
      },

      remark: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '备注说明'
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
      tableName: 'ad_billing_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '广告计费记录表 - 记录广告计划的资金变动',

      hooks: {
        beforeCreate: record => {
          record.created_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_business_id', fields: ['business_id'], unique: true },
        { name: 'idx_campaign', fields: ['ad_campaign_id'] },
        { name: 'idx_advertiser', fields: ['advertiser_user_id'] },
        { name: 'idx_billing_date', fields: ['billing_date'] },
        { name: 'idx_billing_type', fields: ['billing_type'] },
        { name: 'idx_asset_transaction', fields: ['asset_transaction_id'] },
        { name: 'idx_campaign_date', fields: ['ad_campaign_id', 'billing_date'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdBillingRecord.associate = models => {
    // 所属广告计划
    AdBillingRecord.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'campaign',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 广告主（计费对象）
    AdBillingRecord.belongsTo(models.User, {
      foreignKey: 'advertiser_user_id',
      as: 'advertiser',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return AdBillingRecord
}

module.exports.VALID_BILLING_TYPES = VALID_BILLING_TYPES
