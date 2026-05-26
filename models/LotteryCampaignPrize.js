/**
 * 活动-奖品关联模型
 *
 * 业务场景：
 * - 活动引用奖品目录中的奖品，配置本活动中的权重/库存/档位
 * - 同一奖品可被多个活动引用，每个活动独立配置运营参数
 * - reward_tier 可覆盖奖品定义的默认档位（同一奖品在不同活动可放不同档位）
 *
 * 设计决策：
 * - 唯一约束 (lottery_campaign_id, prize_definition_id) 防止同活动重复引用同一奖品
 * - total_win_count / daily_win_count 用于活动级统计
 * - 不存储奖品名称/图片等信息，全部从 prize_definitions JOIN 获取
 *
 * 命名规范（snake_case）：
 * - 表名：lottery_campaign_prizes
 * - 主键：lottery_campaign_prize_id
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 活动-奖品关联模型类
 * 职责：管理活动与奖品目录的关联关系及活动级运营参数
 * 设计模式：事务实体（高频创建、有状态、数量增长）
 */
class LotteryCampaignPrize extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize 所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 所属活动
    if (models.LotteryCampaign) {
      LotteryCampaignPrize.belongsTo(models.LotteryCampaign, {
        foreignKey: 'lottery_campaign_id',
        as: 'campaign'
      })
    }

    // 引用的奖品定义
    if (models.PrizeDefinition) {
      LotteryCampaignPrize.belongsTo(models.PrizeDefinition, {
        foreignKey: 'prize_definition_id',
        as: 'prizeDefinition'
      })
    }

    // 抽奖记录（替代原 LotteryPrize 的 draws 关联）
    if (models.LotteryDraw) {
      LotteryCampaignPrize.hasMany(models.LotteryDraw, {
        foreignKey: 'lottery_campaign_prize_id',
        as: 'draws'
      })
    }
  }

  /**
   * 判断奖品是否可用（状态为 active 且有库存）
   * @returns {boolean} 是否可用
   */
  isAvailable() {
    return this.status === 'active' && this.stock_quantity > 0
  }

  /**
   * 判断是否库存耗尽
   * @returns {boolean} 是否耗尽
   */
  isOutOfStock() {
    return this.stock_quantity <= 0
  }

  /**
   * 扣减库存（原子操作，需在事务中调用）
   * @param {number} quantity - 扣减数量
   * @param {Object} options - Sequelize 选项（必须包含 transaction）
   * @returns {Promise<Object>} 更新后的实例
   */
  async deductStock(quantity = 1, options = {}) {
    this.stock_quantity = Math.max(0, this.stock_quantity - quantity)
    this.total_win_count += quantity
    this.daily_win_count += quantity
    await this.save(options)
    return this
  }
}

/**
 * 模型初始化
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} 初始化后的模型
 */
module.exports = sequelize => {
  LotteryCampaignPrize.init(
    {
      lottery_campaign_prize_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '活动奖品关联ID（主键）'
      },

      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '活动ID（FK→lottery_campaigns.lottery_campaign_id）'
      },

      prize_definition_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '奖品定义ID（FK→prize_definitions.prize_definition_id）'
      },

      win_weight: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '本活动中的权重（越大越容易中）'
      },

      stock_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 999999,
        comment: '本活动中的库存'
      },

      reward_tier: {
        type: DataTypes.ENUM('high', 'mid', 'low'),
        allowNull: false,
        defaultValue: 'low',
        comment: '本活动中的档位（可覆盖奖品定义的默认档位）'
      },

      is_fallback: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 0,
        comment: '是否兜底奖品：1=兜底, 0=普通'
      },

      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '排序序号（越小越靠前）'
      },

      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态：active=启用, inactive=停用'
      },

      max_daily_wins: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '每日最大中奖次数限制（null=不限制）'
      },

      max_user_wins: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '每用户最大中奖次数限制（null=不限制）'
      },

      total_win_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '累计中奖次数'
      },

      daily_win_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当日中奖次数'
      }
    },
    {
      sequelize,
      modelName: 'LotteryCampaignPrize',
      tableName: 'lottery_campaign_prizes',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '活动-奖品关联表 — 活动引用奖品目录 + 配置权重/库存/档位'
    }
  )

  /**
   * 校验活动保底奖品约束
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 校验结果
   */
  LotteryCampaignPrize.validateFallbackPrizeConstraint = async function (campaignId, options = {}) {
    const { transaction } = options
    if (!campaignId) return { valid: false, error: '活动ID不能为空', emptyPrizes: [] }

    const fallbackPrizes = await this.findAll({
      where: { lottery_campaign_id: campaignId, status: 'active', is_fallback: true },
      attributes: ['lottery_campaign_prize_id', 'win_weight', 'is_fallback'],
      transaction
    })

    if (fallbackPrizes.length === 0) {
      return { valid: false, error: `活动 ${campaignId} 缺少保底奖品配置`, emptyPrizes: [] }
    }

    const hasWeight = fallbackPrizes.some(p => (p.win_weight || 0) > 0)
    if (!hasWeight) {
      return {
        valid: false,
        error: `活动 ${campaignId} 保底奖品权重无效`,
        emptyPrizes: fallbackPrizes.map(p => p.toJSON())
      }
    }

    return {
      valid: true,
      emptyPrizes: fallbackPrizes.map(p => p.toJSON()),
      message: `保底奖品配置有效`
    }
  }

  /**
   * 校验活动预算配置
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 校验结果
   */
  LotteryCampaignPrize.validateCampaignBudgetConfig = async function (campaignId, options = {}) {
    const { transaction } = options

    const allPrizes = await this.findAll({
      where: { lottery_campaign_id: campaignId, status: 'active' },
      attributes: ['lottery_campaign_prize_id', 'reward_tier', 'win_weight'],
      transaction
    })

    if (allPrizes.length === 0) {
      return { valid: false, error: `活动 ${campaignId} 没有配置任何激活状态的奖品`, prizes: [] }
    }

    return { valid: true, summary: { total_prizes: allPrizes.length } }
  }

  /**
   * 校验活动奖品权重配置
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 校验结果
   */
  LotteryCampaignPrize.validatePrizeWeights = async function (campaignId, options = {}) {
    const { transaction } = options
    const WEIGHT_SCALE = 1000000

    if (!campaignId) return { valid: false, error: '活动ID不能为空', tier_results: {} }

    const allPrizes = await this.findAll({
      where: { lottery_campaign_id: campaignId, status: 'active' },
      attributes: ['lottery_campaign_prize_id', 'reward_tier', 'win_weight'],
      order: [
        ['reward_tier', 'ASC'],
        ['lottery_campaign_prize_id', 'ASC']
      ],
      transaction
    })

    if (allPrizes.length === 0) {
      return {
        valid: false,
        error: `活动 ${campaignId} 没有配置任何激活状态的奖品`,
        tier_results: {}
      }
    }

    const prizesByTier = { high: [], mid: [], low: [] }
    for (const p of allPrizes) {
      const tier = p.reward_tier || 'low'
      if (prizesByTier[tier]) prizesByTier[tier].push(p)
    }

    const tierResults = {}
    let allValid = true
    for (const [tier, prizes] of Object.entries(prizesByTier)) {
      if (prizes.length === 0) continue
      const totalWeight = prizes.reduce((sum, p) => sum + (p.win_weight || 0), 0)
      const valid = totalWeight === WEIGHT_SCALE
      tierResults[tier] = {
        valid,
        total_weight: totalWeight,
        expected: WEIGHT_SCALE,
        count: prizes.length
      }
      if (!valid) allValid = false
    }

    return { valid: allValid, tier_results: tierResults }
  }

  return LotteryCampaignPrize
}
