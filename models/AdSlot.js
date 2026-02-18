/**
 * 广告位模型（AdSlot）
 *
 * 业务场景：
 * - 定义系统中可用的广告位（弹窗、轮播图等）
 * - 管理广告位的配置信息（价格、竞价规则、展示限制等）
 * - 支持广告位的启用/禁用、价格调整等操作
 *
 * 设计决策：
 * - 广告位与广告活动分离，便于统一管理
 * - 支持固定价格和竞价两种计费模式
 * - 记录广告位的基本信息和业务规则
 *
 * 数据库表名：ad_slots
 * 主键：ad_slot_id（INT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告位类型有效值
 * @constant {string[]}
 */
const VALID_SLOT_TYPES = ['popup', 'carousel']

/**
 * 定义 AdSlot 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdSlot 模型
 */
module.exports = sequelize => {
  const AdSlot = sequelize.define(
    'AdSlot',
    {
      ad_slot_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '广告位主键ID'
      },

      slot_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: '广告位标识不能为空' },
          len: { args: [1, 50], msg: '广告位标识长度必须在1-50字符之间' }
        },
        comment: '广告位唯一标识（如：home_popup, home_carousel）'
      },

      slot_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: '广告位名称不能为空' },
          len: { args: [1, 100], msg: '广告位名称长度必须在1-100字符之间' }
        },
        comment: '广告位名称（如：首页弹窗、首页轮播图）'
      },

      slot_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          notEmpty: { msg: '广告位类型不能为空' },
          isIn: {
            args: [VALID_SLOT_TYPES],
            msg: '广告位类型必须是：popup, carousel 之一'
          }
        },
        comment: '广告位类型：popup=弹窗 / carousel=轮播图'
      },

      position: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: { notEmpty: { msg: '显示位置不能为空' } },
        comment: '显示位置（如：home=首页）'
      },

      max_display_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        validate: {
          min: { args: [1], msg: '最大展示次数不能小于1' }
        },
        comment: '最大展示次数（同一用户每天最多看到几次）'
      },

      daily_price_diamond: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: { args: [0], msg: '每日价格不能为负数' }
        },
        comment: '每日固定价格（钻石），用于固定价格模式'
      },

      min_bid_diamond: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
        validate: {
          min: { args: [1], msg: '最低竞价不能小于1' }
        },
        comment: '最低竞价（钻石），用于竞价模式'
      },

      min_budget_diamond: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 500,
        validate: {
          min: { args: [1], msg: '最低预算不能小于1' }
        },
        comment: '最低预算（钻石），用于竞价模式'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '广告位描述'
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
      tableName: 'ad_slots',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '广告位配置表 - 定义系统中可用的广告位',

      hooks: {
        beforeCreate: slot => {
          slot.created_at = BeijingTimeHelper.createBeijingTime()
          slot.updated_at = BeijingTimeHelper.createBeijingTime()
        },
        beforeUpdate: slot => {
          slot.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_slot_key', fields: ['slot_key'], unique: true },
        { name: 'idx_slot_type', fields: ['slot_type'] },
        { name: 'idx_slot_position', fields: ['position'] },
        { name: 'idx_slot_active', fields: ['is_active'] }
      ],

      scopes: {
        active: { where: { is_active: true } },
        byType: slot_type => ({ where: { slot_type } }),
        byPosition: position => ({ where: { position } })
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdSlot.associate = models => {
    AdSlot.hasMany(models.AdCampaign, {
      foreignKey: 'ad_slot_id',
      as: 'campaigns',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return AdSlot
}

module.exports.VALID_SLOT_TYPES = VALID_SLOT_TYPES
