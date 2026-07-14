'use strict'

/**
 * ConsumptionBonusRule 模型 - 消费加成活动规则（多活动独立倍率）
 *
 * 业务定位（消费加成活动·方案C，2026-07-15）：
 * - 替代原全局单值 system_settings.points/activity_bonus_rate，支持多个消费加成活动并行，
 *   各自独立倍率（bonus_rate）、时间窗、生效范围（门店/商家）。
 * - 全平台活动（store_ids/merchant_ids 均 NULL）与单商家专属活动（任一非空）并存于本表。
 * - 命中判定由 ConsumptionBonusService.resolveConsumptionBonusRate 在消费提交时执行：
 *   按门店/商家/时间窗自动匹配（用户/商家零选择成本），商家专属优先于全平台，同组按 priority 取最高。
 * - 命中的 bonus_rate 锁定到 consumption_records.activity_bonus_rate_locked，发放侧逻辑不变。
 *
 * 关键设计：
 * - 配置实体（低频变更），主键自增数字 consumption_bonus_rule_id。
 * - store_ids / merchant_ids JSON 弱引用（NULL=不限），门店/商家可独立增删。
 * - DECIMAL 字段（bonus_rate / max_bonus_rate）通过 getter 转数字（避免 DECIMAL 返回字符串问题）。
 *
 * 数据库表：consumption_bonus_rules（主键 consumption_bonus_rule_id BIGINT）
 *
 * @module models/ConsumptionBonusRule
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 消费加成活动规则模型类
   * @class ConsumptionBonusRule
   * @extends Model
   */
  class ConsumptionBonusRule extends Model {
    /**
     * 判定本规则是否"商家专属"（store_ids 或 merchant_ids 任一非空）。
     * 商家专属活动优先于全平台活动（均 NULL 即全平台）。
     * @returns {boolean} true=商家专属 / false=全平台
     */
    isMerchantSpecific() {
      const stores = this.store_ids
      const merchants = this.merchant_ids
      return (
        (Array.isArray(stores) && stores.length > 0) ||
        (Array.isArray(merchants) && merchants.length > 0)
      )
    }
  }

  ConsumptionBonusRule.init(
    {
      consumption_bonus_rule_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '消费加成活动规则主键'
      },
      rule_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '规则名（对内运营识别，如"双11消费加成"）'
      },
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '对用户展示名（如"双11消费多送50%积分"）'
      },
      bonus_rate: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        comment: '活动加成率（如 0.50=多送50%积分）；与等级倍率加法叠加，受总倍数3.0硬封顶',
        /**
         * DECIMAL → 数字（避免 DECIMAL 返回字符串问题）
         * @returns {number|null} 加成率数字
         */
        get() {
          const raw = this.getDataValue('bonus_rate')
          return raw === null || raw === undefined ? raw : Number(raw)
        }
      },
      store_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '命中门店ID数组（消费 store_id 在列表内才命中）；NULL=不限门店'
      },
      merchant_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '命中商家ID数组（消费 merchant_id 在列表内才命中）；NULL=不限商家。store_ids/merchant_ids 任一非空=商家专属'
      },
      start_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始（北京时间）；NULL=不限'
      },
      end_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束（北京时间）；NULL=不限'
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级（同组多规则命中取最高优先级一条，越大越优先）'
      },
      max_bonus_rate: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        defaultValue: 2.0,
        comment: '加成率硬上限（发放时二次夹紧，防运营配错；配合总倍数3.0封顶）',
        /**
         * DECIMAL → 数字
         * @returns {number|null} 加成率上限数字
         */
        get() {
          const raw = this.getDataValue('max_bonus_rate')
          return raw === null || raw === undefined ? raw : Number(raw)
        }
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
      modelName: 'ConsumptionBonusRule',
      tableName: 'consumption_bonus_rules',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '消费加成活动规则（多活动独立倍率；全平台+商家专属并存，商家专属优先）'
    }
  )

  return ConsumptionBonusRule
}
