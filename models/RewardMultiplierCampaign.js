'use strict'

/**
 * RewardMultiplierCampaign 模型 - 水晶奖品倍率规则主表
 *
 * 业务定位（水晶奖品倍率活动设计方案 §3.1 / §18.1）：
 * - 让运营对"特定活动 + 特定人群"配置"抽中水晶类奖品发放数量翻倍"（如 ×1.5~×2.5）。
 * - 规则通过 lottery_campaign_id 强制绑定到具体抽奖活动，活动间天然隔离（禁止全局规则）。
 * - 倍率只作用于 SettleStage material 分支的发放数量放大，不动抽奖概率/预算/非水晶奖品。
 *
 * 关键设计：
 * - 配置实体（低频变更），主键自增数字 multiplier_campaign_id。
 * - 同活动内多规则命中取最高（stack_strategy=max，不叠乘不叠加）。
 * - 成本刹车：extra_cost_limit（强制必填）+ extra_cost_used（实时累加）+ max_multiplier_cap（二次夹紧）。
 * - per-user 三重护栏：per_user_daily_limit / eligibility_days / per_user_extra_cap（NULL=不限）。
 * - DECIMAL 字段通过 getter 转换为数字（避免 DECIMAL 返回字符串问题）。
 *
 * 数据库表：reward_multiplier_campaigns（主键 multiplier_campaign_id BIGINT）
 *
 * @module models/RewardMultiplierCampaign
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 水晶奖品倍率规则主表模型类
   * @class RewardMultiplierCampaign
   * @extends Model
   */
  class RewardMultiplierCampaign extends Model {
    /**
     * 定义模型关联
     * @param {Object} models - Sequelize 所有模型集合
     * @returns {void}
     */
    static associate(models) {
      // 归属抽奖活动（强制绑定，活动隔离）
      RewardMultiplierCampaign.belongsTo(models.LotteryCampaign, {
        foreignKey: 'lottery_campaign_id',
        targetKey: 'lottery_campaign_id',
        as: 'lottery_campaign'
      })
      // 作用对象（人群标识，一对多）
      if (models.RewardMultiplierTarget) {
        RewardMultiplierCampaign.hasMany(models.RewardMultiplierTarget, {
          foreignKey: 'multiplier_campaign_id',
          sourceKey: 'multiplier_campaign_id',
          as: 'targets'
        })
      }
    }
  }

  RewardMultiplierCampaign.init(
    {
      multiplier_campaign_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '倍率规则主键'
      },
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '绑定的抽奖活动ID（强制必填，活动隔离，禁止全局规则）'
      },
      campaign_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '规则名（对内运营识别）'
      },
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '对用户展示名（如"新春水晶翻倍"）'
      },
      multiplier: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        comment: '倍率（支持小数，如 1.50/1.75/2.00/2.50），>=1',
        /**
         * DECIMAL → 数字（避免 DECIMAL 返回字符串问题）
         * @returns {number|null} 倍率数字
         */
        get() {
          const raw = this.getDataValue('multiplier')
          return raw === null || raw === undefined ? raw : Number(raw)
        }
      },
      reward_scope: {
        type: DataTypes.ENUM('crystal_all', 'group', 'asset_codes'),
        allowNull: false,
        defaultValue: 'crystal_all',
        comment: '作用奖品范围：crystal_all=全部水晶 / group=按 group_code / asset_codes=指定资产码'
      },
      scope_values: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          'reward_scope=group 存 group_code 数组；=asset_codes 存 asset_code 数组；=crystal_all 为 NULL'
      },
      target_type: {
        type: DataTypes.ENUM('all', 'segment', 'tag', 'growth_level', 'user'),
        allowNull: false,
        defaultValue: 'all',
        comment: '作用人群：all/segment/tag/growth_level/user'
      },
      rounding_mode: {
        type: DataTypes.ENUM('round', 'floor', 'ceil'),
        allowNull: false,
        defaultValue: 'ceil',
        comment: '小数倍率取整方式（默认 ceil 向上，偏用户体感）'
      },
      stack_strategy: {
        type: DataTypes.ENUM('max'),
        allowNull: false,
        defaultValue: 'max',
        comment: '同活动内多规则命中合并策略（当前全局仅 max）'
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级（并列同倍率时决胜与展示排序，越大越优先）'
      },
      max_multiplier_cap: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        defaultValue: 3.0,
        comment: '倍率硬上限（默认 3.00，发放时二次夹紧）',
        /**
         * DECIMAL → 数字
         * @returns {number|null} 倍率硬上限数字
         */
        get() {
          const raw = this.getDataValue('max_multiplier_cap')
          return raw === null || raw === undefined ? raw : Number(raw)
        }
      },
      extra_cost_limit: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '额外翻倍成本上限（按 budget_value_points 折算累计），强制必填，达上限自动停翻',
        /**
         * BIGINT → 数字
         * @returns {number|null} 额外成本上限数字
         */
        get() {
          const raw = this.getDataValue('extra_cost_limit')
          return raw === null || raw === undefined ? raw : Number(raw)
        }
      },
      extra_cost_used: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '本规则已累计的额外翻倍成本（实时累加）',
        /**
         * BIGINT → 数字
         * @returns {number|null} 已用额外成本数字
         */
        get() {
          const raw = this.getDataValue('extra_cost_used')
          return raw === null || raw === undefined ? raw : Number(raw)
        }
      },
      per_user_daily_limit: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'per-user 每日最多享受翻倍次数（NULL=不限）'
      },
      eligibility_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '资格时间盒：进入命中人群后 N 天内享翻倍（NULL=不限）'
      },
      per_user_extra_cap: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'per-user 累计翻倍额外发放数量上限（NULL=不限）'
      },
      start_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始（北京时间），NULL=不限'
      },
      end_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束（北京时间），NULL=不限'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'inactive',
        comment: '开关：active 生效 / inactive 停用'
      },
      remark: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '备注'
      }
    },
    {
      sequelize,
      modelName: 'RewardMultiplierCampaign',
      tableName: 'reward_multiplier_campaigns',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '水晶奖品倍率规则主表（绑定抽奖活动，活动间隔离）'
    }
  )

  return RewardMultiplierCampaign
}
