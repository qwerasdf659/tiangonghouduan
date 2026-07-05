'use strict'

/**
 * EventBudgetCollectionRule 模型 - 活动预算归集规则
 *
 * 业务定位（水晶奖品倍率活动设计方案 §12.10 / §18.4 / B-6 防囤积套利）：
 * - 限时翻倍活动期间，消费审核通过发放的预算积分不再进全局桶 CONSUMPTION_DEFAULT，
 *   命中本规则后"全额重定向"进该活动的个人专属预算桶 EVENT_<活动campaign_code>（防7 全量重定向），
 *   并按 event_points_ratio 同步发放活动积分 event_points（可见层入场代币，§12.7 双层货币）。
 * - 规则由运营在 Web 后台配置；小程序/商家端不加人工选择口（防9），归集去向后端自动判定。
 * - 活动结束后由到期清零 job 清空该活动专属预算桶 + event_points（防2 直接清零）。
 *
 * 关键设计：
 * - 配置实体（低频变更），主键自增数字 collection_rule_id。
 * - store_ids / merchant_ids JSON 数组弱引用（NULL=不限），门店/商家可独立增删。
 * - 时间窗 start_at/end_at 为 NULL 时对齐活动自身 start_time/end_time。
 * - 预算桶键运行时派生 EVENT_<campaign_code>（D-5），不冗余存储。
 *
 * 数据库表：event_budget_collection_rules（主键 collection_rule_id BIGINT）
 *
 * @module models/EventBudgetCollectionRule
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 活动预算归集规则模型类
   * @class EventBudgetCollectionRule
   * @extends Model
   */
  class EventBudgetCollectionRule extends Model {
    /**
     * 定义模型关联
     * @param {Object} models - Sequelize 所有模型集合
     * @returns {void}
     */
    static associate(models) {
      // 归集去向的抽奖活动（派生专属桶键 EVENT_<campaign_code>）
      EventBudgetCollectionRule.belongsTo(models.LotteryCampaign, {
        foreignKey: 'lottery_campaign_id',
        targetKey: 'lottery_campaign_id',
        as: 'lottery_campaign'
      })
    }
  }

  EventBudgetCollectionRule.init(
    {
      collection_rule_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '归集规则主键'
      },
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment:
          '归集去向的抽奖活动ID（命中本规则的消费预算全额进 EVENT_<该活动campaign_code> 专属桶）'
      },
      rule_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '规则名（对内运营识别，如"新春活动预算归集"）'
      },
      store_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '命中门店ID数组（消费记录 store_id 在列表内才命中）；NULL=不限门店'
      },
      merchant_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '命中商家ID数组（消费记录 merchant_id 在列表内才命中）；NULL=不限商家'
      },
      event_points_ratio: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 1.0,
        comment:
          '活动积分发放比率：event_points = round(消费金额 × 比率)；0=只归集预算不发活动积分',
        /**
         * DECIMAL → 数字（避免 DECIMAL 返回字符串问题）
         * @returns {number|null} 比率数字
         */
        get() {
          const raw = this.getDataValue('event_points_ratio')
          return raw === null || raw === undefined ? raw : Number(raw)
        }
      },
      start_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始（北京时间）；NULL=对齐活动 start_time'
      },
      end_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束（北京时间）；NULL=对齐活动 end_time'
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级（多规则同时命中同一笔消费时取最高优先级一条，越大越优先）'
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
      modelName: 'EventBudgetCollectionRule',
      tableName: 'event_budget_collection_rules',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '活动预算归集规则（限时翻倍活动消费预算重定向 + event_points 发放）'
    }
  )

  return EventBudgetCollectionRule
}
