'use strict'

/**
 * LoadCampaignStage - 加载活动配置 Stage
 *
 * 职责：
 * 1. 加载活动基础配置
 * 2. 验证活动状态（是否可用）
 * 3. 加载活动关联的奖品列表
 * 4. 加载档位规则（lottery_tier_rules）
 *
 * 输出到上下文：
 * - campaign: 活动配置对象
 * - prizes: 活动奖品列表
 * - tier_rules: 档位规则列表
 * - fallback_prize: 兜底奖品
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/LoadCampaignStage
 * @author 统一抽奖架构重构
 * @since 2026
 */

const BaseStage = require('./BaseStage')
const {
  LotteryCampaign,
  LotteryCampaignPrize,
  PrizeDefinition,
  MaterialAssetType,
  LotteryTierRule
} = require('../../../../models')
const { DynamicConfigLoader } = require('../../compute/config/ComputeConfig')

/**
 * 加载活动配置 Stage
 */
class LoadCampaignStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('LoadCampaignStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行 Stage
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { lottery_campaign_id } = context

    this.log('info', '开始加载活动配置', { lottery_campaign_id })

    try {
      // 1. 加载活动基础配置
      const campaign = await this._loadCampaign(lottery_campaign_id)

      if (!campaign) {
        throw this.createError(`活动不存在: ${lottery_campaign_id}`, 'CAMPAIGN_NOT_FOUND', true)
      }

      // 2. 验证活动状态
      this._validateCampaignStatus(campaign)

      // 3. 加载活动奖品
      const prizes = await this._loadPrizes(lottery_campaign_id)

      // 4. 加载档位规则
      const tier_rules = await this._loadTierRules(lottery_campaign_id)

      // 5. 获取兜底奖品
      const fallback_prize = await this._getFallbackPrize(prizes, campaign)

      // 6. 返回结果
      const result = {
        campaign: campaign.toJSON(),
        prizes,
        tier_rules: tier_rules.map(r => r.toJSON()),
        fallback_prize: fallback_prize || null,
        pick_method: campaign.pick_method || 'tier_first',
        budget_mode: campaign.budget_mode || 'none'
      }

      this.log('info', '活动配置加载完成', {
        lottery_campaign_id,
        prize_count: prizes.length,
        tier_rule_count: tier_rules.length,
        has_fallback: !!fallback_prize,
        pick_method: result.pick_method,
        budget_mode: result.budget_mode
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '加载活动配置失败', {
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 加载活动基础配置
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} 活动配置
   * @private
   */
  async _loadCampaign(lottery_campaign_id) {
    return await LotteryCampaign.findByPk(lottery_campaign_id)
  }

  /**
   * 验证活动状态
   *
   * @param {Object} campaign - 活动配置
   * @returns {void}
   * @throws {Error} 活动状态无效时抛出错误
   * @private
   */
  _validateCampaignStatus(campaign) {
    // 检查活动状态
    if (campaign.status !== 'active') {
      throw this.createError(`活动状态无效: ${campaign.status}`, 'CAMPAIGN_INACTIVE', true)
    }

    // 检查活动时间
    const now = new Date()

    if (campaign.start_time && new Date(campaign.start_time) > now) {
      throw this.createError('活动尚未开始', 'CAMPAIGN_NOT_STARTED', true)
    }

    if (campaign.end_time && new Date(campaign.end_time) < now) {
      throw this.createError('活动已结束', 'CAMPAIGN_ENDED', true)
    }
  }

  /**
   * 加载活动奖品（集中奖品目录方案）
   *
   * 从 lottery_campaign_prizes JOIN prize_definitions 加载奖品数据，
   * 返回扁平化结构兼容下游 Stage 消费格式。
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 奖品列表（扁平化，兼容旧格式）
   * @private
   */
  async _loadPrizes(lottery_campaign_id) {
    const campaignPrizes = await LotteryCampaignPrize.findAll({
      where: {
        lottery_campaign_id,
        status: 'active'
      },
      include: [
        {
          model: PrizeDefinition,
          as: 'prizeDefinition',
          where: { is_enabled: 1 },
          include: [
            {
              model: MaterialAssetType,
              as: 'materialAssetType',
              attributes: [
                'asset_code',
                'display_name',
                'budget_value_points',
                'visible_value_points'
              ],
              required: false
            }
          ]
        }
      ],
      order: [
        ['reward_tier', 'DESC'],
        ['sort_order', 'ASC'],
        ['lottery_campaign_prize_id', 'ASC']
      ]
    })

    // 扁平化：将关联数据合并为下游 Stage 期望的格式
    return campaignPrizes.map(cp => {
      const def = cp.prizeDefinition
      const mat = def.materialAssetType

      // 运行时计算 budget_cost = budget_value_points × material_amount
      const budgetCost =
        mat && mat.budget_value_points && def.material_amount
          ? Number(mat.budget_value_points) * Number(def.material_amount)
          : 0

      // 构建兼容旧格式的扁平对象
      return {
        lottery_prize_id: cp.lottery_campaign_prize_id,
        lottery_campaign_prize_id: cp.lottery_campaign_prize_id,
        prize_definition_id: cp.prize_definition_id,
        lottery_campaign_id: cp.lottery_campaign_id,
        prize_name: def.display_name,
        prize_type: def.prize_type,
        prize_value: def.material_amount ? Number(def.material_amount) : 0,
        material_asset_code: def.material_asset_code,
        material_amount: def.material_amount ? Number(def.material_amount) : null,
        rarity_code: def.rarity_code,
        win_weight: cp.win_weight,
        stock_quantity: cp.stock_quantity,
        reward_tier: cp.reward_tier,
        is_fallback: Boolean(cp.is_fallback),
        sort_order: cp.sort_order,
        max_daily_wins: cp.max_daily_wins,
        max_user_wins: cp.max_user_wins,
        total_win_count: cp.total_win_count,
        daily_win_count: cp.daily_win_count,
        budget_cost: budgetCost,
        prize_value_points:
          mat && mat.visible_value_points && def.material_amount
            ? Number(mat.visible_value_points) * Number(def.material_amount)
            : 0,
        primary_media_id: def.primary_media_id,
        prize_code: def.prize_code,
        item_template_id: def.item_template_id
      }
    })
  }

  /**
   * 加载档位规则
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 档位规则列表
   * @private
   */
  async _loadTierRules(lottery_campaign_id) {
    return await LotteryTierRule.findAll({
      where: {
        lottery_campaign_id,
        status: 'active'
      },
      order: [
        ['segment_key', 'ASC'],
        ['tier_name', 'DESC'] // high > mid > low
      ]
    })
  }

  /**
   * 获取兜底奖品
   *
   * 规则（已拍板 0.10.2）：
   * 1. 如果活动配置了 tier_fallback_lottery_prize_id，使用该奖品
   * 2. 否则自动选取 prize_value_points=0 且 is_fallback=true 的奖品
   * 3. 按 sort_order ASC, lottery_prize_id ASC 排序取第一个
   *
   * @param {Array} prizes - 奖品列表
   * @param {Object} campaign - 活动配置
   * @returns {Object|null} 兜底奖品
   * @private
   */
  async _getFallbackPrize(prizes, campaign) {
    const campaign_opts = { lottery_campaign_id: campaign.lottery_campaign_id }

    /* 检查 tier_fallback 策略开关，关闭时跳过兜底奖品指定 */
    const tier_fallback_enabled = await DynamicConfigLoader.isStrategyEnabled(
      'tier_fallback',
      true,
      campaign_opts
    )
    if (!tier_fallback_enabled) {
      this.log('info', 'tier_fallback 策略已关闭，跳过兜底奖品指定', campaign_opts)
      return null
    }

    // 从 lottery_strategy_config 读取档位降级兜底奖品ID
    const tier_fallback_prize_id = await DynamicConfigLoader.getValue(
      'tier_fallback',
      'prize_id',
      null,
      { lottery_campaign_id: campaign.lottery_campaign_id }
    )

    // 1. 检查是否配置了指定的兜底奖品
    if (tier_fallback_prize_id) {
      const specified_fallback = prizes.find(p => p.lottery_prize_id === tier_fallback_prize_id)
      if (specified_fallback) {
        return specified_fallback
      }
    }

    // 2. 自动选择：prize_value_points=0 或 is_fallback=true 的奖品
    const fallback_candidates = prizes.filter(
      p => p.prize_value_points === 0 || p.is_fallback === true
    )

    if (fallback_candidates.length === 0) {
      this.log('warn', '活动没有配置兜底奖品', {
        lottery_campaign_id: campaign.lottery_campaign_id
      })
      return null
    }

    // 按 sort_order ASC, prize_id ASC 排序取第一个
    fallback_candidates.sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return (a.sort_order || 0) - (b.sort_order || 0)
      }
      return a.lottery_prize_id - b.lottery_prize_id
    })

    return fallback_candidates[0]
  }
}

module.exports = LoadCampaignStage
