/**
 * 广告地域定向模型（AdTargetZone）
 *
 * 定义商圈（district）和区域（region）的地域定向配置。
 * 支持层级结构（parent_zone_id 自引用）和优先级匹配。
 * 全站兜底区域（zone_type='region', priority=999）保证广告位始终有地域归属。
 *
 * 数据来源：运营后台手动创建/编辑（zone-management 页面）
 * 消费场景：AdBiddingService._resolveZoneSlots() 竞价时地域匹配
 *
 * @module models/AdTargetZone
 */

'use strict'

const { Model, DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/** 允许的地域类型枚举 */
const VALID_ZONE_TYPES = ['district', 'region']

/** 允许的地域状态枚举 */
const VALID_ZONE_STATUSES = ['active', 'inactive']

/**
 * 广告地域定向模型（对应数据库表 ad_target_zones）
 * @class AdTargetZone
 * @extends Model
 */
class AdTargetZone extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} models - 模型集合
   * @returns {void}
   */
  static associate(models) {
    /* 自引用：上级区域（region → district 的层级结构） */
    AdTargetZone.belongsTo(models.AdTargetZone, {
      foreignKey: 'parent_zone_id',
      as: 'parent_zone'
    })

    /* 自引用：下级区域列表 */
    AdTargetZone.hasMany(models.AdTargetZone, {
      foreignKey: 'parent_zone_id',
      as: 'child_zones'
    })

    /* 关联广告位（ad_slots.zone_id → zone_id） */
    AdTargetZone.hasMany(models.AdSlot, {
      foreignKey: 'zone_id',
      as: 'ad_slots'
    })

    /* 联合组成员关联 */
    AdTargetZone.hasMany(models.AdZoneGroupMember, {
      foreignKey: 'zone_id',
      as: 'group_memberships'
    })
  }
}

/**
 * 初始化 AdTargetZone 模型
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} Sequelize 模型类
 */
module.exports = sequelize => {
  AdTargetZone.init(
    {
      zone_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '地域定向主键'
      },
      /** 地域类型：district=商圈, region=区域 */
      zone_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: {
            args: [VALID_ZONE_TYPES],
            msg: `zone_type 必须是以下之一：${VALID_ZONE_TYPES.join(', ')}`
          }
        },
        comment: '地域类型：district=商圈, region=区域'
      },
      /** 地域名称（如"国贸CBD"、"朝阳区"） */
      zone_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'zone_name 不能为空' },
          len: { args: [1, 100], msg: 'zone_name 长度必须在1-100之间' }
        },
        comment: '地域名称'
      },
      /** 匹配优先级（越小越优先，默认10） */
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        validate: {
          min: { args: [1], msg: 'priority 最小为1' },
          max: { args: [999], msg: 'priority 最大为999' }
        },
        comment: '匹配优先级（越小越优先）'
      },
      /** 上级区域ID（自引用外键，region类型的父级为null） */
      parent_zone_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'ad_target_zones',
          key: 'zone_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '上级区域ID'
      },
      /** 覆盖范围（JSON格式，可存储经纬度围栏等信息） */
      geo_scope: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '覆盖范围（JSON）'
      },
      /** 状态：active=启用, inactive=停用 */
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        validate: {
          isIn: {
            args: [VALID_ZONE_STATUSES],
            msg: `status 必须是以下之一：${VALID_ZONE_STATUSES.join(', ')}`
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
      modelName: 'AdTargetZone',
      tableName: 'ad_target_zones',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '广告地域定向表（商圈/区域管理）',
      indexes: [
        { fields: ['zone_type'], name: 'idx_zone_type' },
        { fields: ['status'], name: 'idx_zone_status' },
        { fields: ['parent_zone_id'], name: 'idx_parent_zone_id' },
        { fields: ['priority'], name: 'idx_zone_priority' }
      ],
      scopes: {
        active: { where: { status: 'active' } },
        districts: { where: { zone_type: 'district' } },
        regions: { where: { zone_type: 'region' } }
      }
    }
  )

  /** 地域类型枚举常量 */
  AdTargetZone.VALID_ZONE_TYPES = VALID_ZONE_TYPES
  /** 地域状态枚举常量 */
  AdTargetZone.VALID_ZONE_STATUSES = VALID_ZONE_STATUSES

  return AdTargetZone
}
