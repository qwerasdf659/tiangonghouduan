/**
 * 广告计划模型（AdCampaign）
 *
 * 业务场景：
 * - 管理广告主的广告投放计划
 * - 支持固定包天和竞价两种计费模式
 * - 管理计划的审核、启用、暂停等生命周期状态
 * - 记录计划的预算、消耗、定向规则等信息
 *
 * 设计决策：
 * - 使用 business_id 作为幂等键，防止重复创建
 * - 支持多种计费模式（固定包天、竞价）
 * - 完整的审核流程（草稿→待审核→已审核→激活）
 * - 关联广告位、广告主、审核人、创意等多个实体
 *
 * 数据库表名：ad_campaigns
 * 主键：ad_campaign_id（INT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 计费模式有效值
 * @constant {string[]}
 */
const VALID_BILLING_MODES = ['fixed_daily', 'bidding']

/**
 * 计划状态有效值
 * @constant {string[]}
 */
const VALID_CAMPAIGN_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'active',
  'paused',
  'completed',
  'rejected',
  'cancelled'
]

/**
 * 定义 AdCampaign 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdCampaign 模型
 */
module.exports = sequelize => {
  const AdCampaign = sequelize.define(
    'AdCampaign',
    {
      ad_campaign_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '广告计划主键ID'
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

      advertiser_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '广告主用户ID'
      },

      ad_slot_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '广告位ID'
      },

      campaign_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: '计划名称不能为空' },
          len: { args: [1, 100], msg: '计划名称长度必须在1-100字符之间' }
        },
        comment: '广告计划名称'
      },

      billing_mode: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          notEmpty: { msg: '计费模式不能为空' },
          isIn: {
            args: [VALID_BILLING_MODES],
            msg: '计费模式必须是：fixed_daily, bidding 之一'
          }
        },
        comment: '计费模式：fixed_daily=固定包天 / bidding=竞价'
      },

      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'draft',
        validate: {
          notEmpty: { msg: '计划状态不能为空' },
          isIn: {
            args: [VALID_CAMPAIGN_STATUSES],
            msg: '计划状态必须是：draft, pending_review, approved, active, paused, completed, rejected, cancelled 之一'
          }
        },
        comment: '计划状态'
      },

      daily_bid_diamond: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: { args: [0], msg: '竞价日出价不能为负数' }
        },
        comment: '竞价模式下的每日出价（钻石）'
      },

      budget_total_diamond: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: { args: [0], msg: '总预算不能为负数' }
        },
        comment: '总预算（钻石）'
      },

      budget_spent_diamond: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: { args: [0], msg: '已消耗预算不能为负数' }
        },
        comment: '已消耗预算（钻石）'
      },

      fixed_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: { args: [1], msg: '包天天数不能小于1' }
        },
        comment: '固定包天模式下的天数'
      },

      fixed_total_diamond: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: { args: [0], msg: '包天总价不能为负数' }
        },
        comment: '固定包天模式下的总价（钻石）'
      },

      targeting_rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '定向规则（JSON格式，如：地区、年龄、性别等）'
      },

      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
        validate: {
          min: { args: [1], msg: '优先级不能小于1' },
          max: { args: [99], msg: '优先级不能大于99' }
        },
        comment: '优先级（1-99，数字越大优先级越高）'
      },

      start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: '计划开始日期'
      },

      end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: '计划结束日期'
      },

      review_note: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '审核备注'
      },

      reviewed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '审核人用户ID'
      },

      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核时间'
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
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at'))
        },
        comment: '更新时间'
      }
    },
    {
      tableName: 'ad_campaigns',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '广告计划表 - 管理广告主的广告投放计划',

      hooks: {
        beforeCreate: campaign => {
          campaign.created_at = BeijingTimeHelper.createBeijingTime()
          campaign.updated_at = BeijingTimeHelper.createBeijingTime()
        },
        beforeUpdate: campaign => {
          campaign.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_business_id', fields: ['business_id'], unique: true },
        { name: 'idx_advertiser', fields: ['advertiser_user_id'] },
        { name: 'idx_ad_slot', fields: ['ad_slot_id'] },
        { name: 'idx_status', fields: ['status'] },
        { name: 'idx_billing_mode', fields: ['billing_mode'] },
        { name: 'idx_priority', fields: ['priority'] },
        { name: 'idx_dates', fields: ['start_date', 'end_date'] }
      ],

      scopes: {
        active: { where: { status: 'active' } },
        pendingReview: { where: { status: 'pending_review' } },
        byStatus: status => ({ where: { status } }),
        byAdvertiser: userId => ({ where: { advertiser_user_id: userId } }),
        bySlot: slotId => ({ where: { ad_slot_id: slotId } })
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdCampaign.associate = models => {
    // 广告主（创建计划的用户）
    AdCampaign.belongsTo(models.User, {
      foreignKey: 'advertiser_user_id',
      as: 'advertiser',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 审核人
    AdCampaign.belongsTo(models.User, {
      foreignKey: 'reviewed_by',
      as: 'reviewer',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })

    // 广告位
    AdCampaign.belongsTo(models.AdSlot, {
      foreignKey: 'ad_slot_id',
      as: 'adSlot',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 广告创意（一个计划可以有多个创意）
    AdCampaign.hasMany(models.AdCreative, {
      foreignKey: 'ad_campaign_id',
      as: 'creatives',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })

    // 计费记录（一个计划有多条计费记录）
    AdCampaign.hasMany(models.AdBillingRecord, {
      foreignKey: 'ad_campaign_id',
      as: 'billingRecords',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return AdCampaign
}

module.exports.VALID_BILLING_MODES = VALID_BILLING_MODES
module.exports.VALID_CAMPAIGN_STATUSES = VALID_CAMPAIGN_STATUSES
