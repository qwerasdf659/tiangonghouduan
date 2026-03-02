/**
 * 联合广告组成员模型（AdZoneGroupMember）
 *
 * ad_zone_groups 与 ad_target_zones 的多对多中间表。
 * 唯一约束 (group_id, zone_id) 保证同一地域不重复加入同一组。
 *
 * @module models/AdZoneGroupMember
 */

'use strict'

const { Model, DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 联合广告组成员模型（对应数据库表 ad_zone_group_members）
 * @class AdZoneGroupMember
 * @extends Model
 */
class AdZoneGroupMember extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} models - 模型集合
   * @returns {void}
   */
  static associate(models) {
    AdZoneGroupMember.belongsTo(models.AdZoneGroup, {
      foreignKey: 'group_id',
      as: 'group'
    })

    AdZoneGroupMember.belongsTo(models.AdTargetZone, {
      foreignKey: 'zone_id',
      as: 'zone'
    })
  }
}

/**
 * 初始化 AdZoneGroupMember 模型
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} Sequelize 模型类
 */
module.exports = sequelize => {
  AdZoneGroupMember.init(
    {
      ad_zone_group_member_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '联合组成员主键'
      },
      /** 所属联合组ID（外键 → ad_zone_groups.group_id） */
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'ad_zone_groups',
          key: 'group_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: '所属联合组ID'
      },
      /** 关联地域ID（外键 → ad_target_zones.zone_id） */
      zone_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'ad_target_zones',
          key: 'zone_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: '关联地域ID'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        /** @returns {string|null} 北京时间格式化字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      }
    },
    {
      sequelize,
      modelName: 'AdZoneGroupMember',
      tableName: 'ad_zone_group_members',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '联合广告组成员表（地域与组的多对多关联）',
      indexes: [
        {
          unique: true,
          fields: ['group_id', 'zone_id'],
          name: 'uk_group_zone'
        }
      ]
    }
  )

  return AdZoneGroupMember
}
