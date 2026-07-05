'use strict'

/**
 * RewardMultiplierTarget 模型 - 水晶奖品倍率规则作用对象表
 *
 * 业务定位（水晶奖品倍率活动设计方案 §3.2 / §14.2 / D-1）：
 * - 只登记"引用哪个现网人群标识"，人群定义仍由现网 segment_rule_configs /
 *   user_ad_tags / user_growth_levels 负责，本表零重复造轮子。
 * - target_type=all 时本表无记录（主表 target_type=all 即可）。
 * - segment 命中判定复用「该活动 resolver_version + SegmentResolver 求出的 segment_key」
 *   语义：target_ref 存 segment_key（如 new_user），运行时比对是否命中。
 * - 不建外键到人群表（弱引用软标识，人群配置可独立增删版本）；引用失效安全降级为不命中。
 *
 * 数据库表：reward_multiplier_targets（主键 reward_multiplier_target_id BIGINT）
 *
 * @module models/RewardMultiplierTarget
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 倍率规则作用对象表模型类
   * @class RewardMultiplierTarget
   * @extends Model
   */
  class RewardMultiplierTarget extends Model {
    /**
     * 定义模型关联
     * @param {Object} models - Sequelize 所有模型集合
     * @returns {void}
     */
    static associate(models) {
      RewardMultiplierTarget.belongsTo(models.RewardMultiplierCampaign, {
        foreignKey: 'multiplier_campaign_id',
        targetKey: 'multiplier_campaign_id',
        as: 'campaign'
      })
    }
  }

  RewardMultiplierTarget.init(
    {
      reward_multiplier_target_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '作用对象主键'
      },
      multiplier_campaign_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属倍率规则ID'
      },
      target_type: {
        type: DataTypes.ENUM('segment', 'tag', 'growth_level', 'user'),
        allowNull: false,
        comment: '对象类型：segment/tag/growth_level/user'
      },
      target_ref: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment:
          '引用现网人群标识：segment→活动 resolver_version 内 segment_key / tag→tag_key / growth_level→level_key / user→user_id'
      },
      target_value: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '可选精确值：target_type=tag 时匹配 user_ad_tags.tag_value；其它类型可空'
      }
    },
    {
      sequelize,
      modelName: 'RewardMultiplierTarget',
      tableName: 'reward_multiplier_targets',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '倍率规则作用对象（仅引用现网人群标识；target_type=all 时本表无记录）'
    }
  )

  return RewardMultiplierTarget
}
