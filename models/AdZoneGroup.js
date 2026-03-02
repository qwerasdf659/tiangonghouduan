/**
 * 联合广告组模型（AdZoneGroup）
 *
 * 将多个地域定向区域组合为一个投放组，支持三种定价模式：
 * - sum：各区域价格累加
 * - discount：累加后乘以折扣率
 * - fixed：使用固定联合价
 *
 * 通过 ad_zone_group_members 中间表关联 ad_target_zones。
 *
 * @module models/AdZoneGroup
 */

'use strict'

const { Model, DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/** 允许的定价模式枚举 */
const VALID_PRICING_MODES = ['sum', 'discount', 'fixed']

/** 允许的联合组状态枚举 */
const VALID_GROUP_STATUSES = ['active', 'inactive']

/**
 * 联合广告组模型（对应数据库表 ad_zone_groups）
 * @class AdZoneGroup
 * @extends Model
 */
class AdZoneGroup extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} models - 模型集合
   * @returns {void}
   */
  static associate(models) {
    /* 联合组成员列表 */
    AdZoneGroup.hasMany(models.AdZoneGroupMember, {
      foreignKey: 'group_id',
      as: 'members'
    })

    /* 多对多：通过成员表关联地域 */
    AdZoneGroup.belongsToMany(models.AdTargetZone, {
      through: models.AdZoneGroupMember,
      foreignKey: 'group_id',
      otherKey: 'zone_id',
      as: 'zones'
    })
  }
}

/**
 * 初始化 AdZoneGroup 模型
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} Sequelize 模型类
 */
module.exports = sequelize => {
  AdZoneGroup.init(
    {
      group_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '联合广告组主键'
      },
      /** 联合组名称（如"CBD商圈联合投放组"） */
      group_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'group_name 不能为空' },
          len: { args: [1, 100], msg: 'group_name 长度必须在1-100之间' }
        },
        comment: '联合组名称'
      },
      /** 定价模式：sum=累加, discount=折扣, fixed=固定价 */
      pricing_mode: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'sum',
        validate: {
          isIn: {
            args: [VALID_PRICING_MODES],
            msg: `pricing_mode 必须是以下之一：${VALID_PRICING_MODES.join(', ')}`
          }
        },
        comment: '定价模式：sum=累加, discount=折扣, fixed=固定价'
      },
      /** 折扣率（discount模式下使用，0.00-1.00） */
      discount_rate: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 1.0,
        /** @returns {number} 转换后的数值 */
        get() {
          const val = this.getDataValue('discount_rate')
          return val !== null ? parseFloat(val) : 1.0
        },
        validate: {
          min: { args: [0.01], msg: 'discount_rate 不能小于0.01' },
          max: { args: [1.0], msg: 'discount_rate 不能大于1.00' }
        },
        comment: '折扣率（0.01-1.00）'
      },
      /** 固定联合价（fixed模式下使用，单位：钻石） */
      fixed_price: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: { args: [0], msg: 'fixed_price 不能为负数' }
        },
        comment: '固定联合价（钻石）'
      },
      /** 状态：active=启用, inactive=停用 */
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        validate: {
          isIn: {
            args: [VALID_GROUP_STATUSES],
            msg: `status 必须是以下之一：${VALID_GROUP_STATUSES.join(', ')}`
          }
        },
        comment: '状态：active=启用, inactive=停用'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        /** @returns {string|null} 北京时间格式化字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        /** @returns {string|null} 北京时间格式化字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at'))
        },
        comment: '更新时间'
      }
    },
    {
      sequelize,
      modelName: 'AdZoneGroup',
      tableName: 'ad_zone_groups',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '联合广告组表（地域定向联合投放管理）',
      indexes: [
        { fields: ['status'], name: 'idx_group_status' },
        { fields: ['pricing_mode'], name: 'idx_group_pricing_mode' }
      ],
      scopes: {
        active: { where: { status: 'active' } }
      }
    }
  )

  /** 定价模式枚举常量 */
  AdZoneGroup.VALID_PRICING_MODES = VALID_PRICING_MODES
  /** 联合组状态枚举常量 */
  AdZoneGroup.VALID_GROUP_STATUSES = VALID_GROUP_STATUSES

  return AdZoneGroup
}
