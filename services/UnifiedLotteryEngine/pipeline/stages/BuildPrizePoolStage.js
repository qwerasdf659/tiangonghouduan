'use strict'

/**
 * BuildPrizePoolStage - 构建奖品池 Stage
 *
 * 职责：
 * 1. 根据用户预算过滤奖品（排除超出预算的奖品）
 * 2. 根据库存过滤奖品（排除缺货奖品）
 * 3. 根据每日中奖上限过滤奖品
 * 4. 按档位分组奖品（high/mid/low/fallback）
 * 5. 确保至少有一个空奖可用
 *
 * 输出到上下文：
 * - available_prizes: 可用奖品列表
 * - prizes_by_tier: 按档位分组的奖品 { high: [], mid: [], low: [], fallback: [] }
 * - available_tiers: 可用的档位列表
 * - has_valuable_prizes: 是否有有价值的奖品可用
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 预算不足时自动降级到空奖
 * - 保证每次抽奖都能选出一个奖品（100%中奖）
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/BuildPrizePoolStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryPrize } = require('../../../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * 档位定义（降级顺序）
 */
const TIER_ORDER = ['high', 'mid', 'low', 'fallback']

/**
 * 构建奖品池 Stage
 */
class BuildPrizePoolStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('BuildPrizePoolStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行奖品池构建
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id } = context

    this.log('info', '开始构建奖品池', { user_id, campaign_id })

    try {
      // 获取活动配置和奖品列表（从 LoadCampaignStage 的结果中）
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
      if (!campaign_data) {
        throw this.createError(
          '缺少活动配置数据，请确保 LoadCampaignStage 已执行',
          'MISSING_CAMPAIGN_DATA',
          true
        )
      }

      const prizes = campaign_data.prizes || []
      const fallback_prize = campaign_data.fallback_prize

      // 获取预算上下文（从 BudgetContextStage 的结果中）
      const budget_data = this.getContextData(context, 'BudgetContextStage.data')
      const budget_before = budget_data?.budget_before || 0
      const budget_mode = budget_data?.budget_mode || 'none'

      this.log('info', '奖品池构建参数', {
        campaign_id,
        total_prizes: prizes.length,
        budget_before,
        budget_mode
      })

      // 1. 根据库存和每日上限过滤奖品
      let filtered_prizes = await this._filterByAvailability(prizes)

      // 2. 根据预算过滤奖品（如果启用了预算限制）
      if (budget_mode !== 'none') {
        filtered_prizes = this._filterByBudget(filtered_prizes, budget_before)
      }

      // 3. 按档位分组
      const prizes_by_tier = this._groupByTier(filtered_prizes)

      // 4. 确保有兜底奖品
      if (prizes_by_tier.fallback.length === 0 && fallback_prize) {
        prizes_by_tier.fallback.push(fallback_prize)
      }

      // 5. 计算可用档位
      const available_tiers = this._getAvailableTiers(prizes_by_tier)

      // 6. 判断是否有有价值的奖品
      const has_valuable_prizes = this._hasValuablePrizes(prizes_by_tier)

      // 7. 构建返回数据
      const result = {
        available_prizes: filtered_prizes,
        prizes_by_tier: prizes_by_tier,
        available_tiers: available_tiers,
        has_valuable_prizes: has_valuable_prizes,
        total_available: filtered_prizes.length,
        tier_counts: {
          high: prizes_by_tier.high.length,
          mid: prizes_by_tier.mid.length,
          low: prizes_by_tier.low.length,
          fallback: prizes_by_tier.fallback.length
        }
      }

      this.log('info', '奖品池构建完成', {
        campaign_id,
        user_id,
        total_available: filtered_prizes.length,
        available_tiers,
        tier_counts: result.tier_counts,
        has_valuable_prizes
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '奖品池构建失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 根据库存和每日中奖上限过滤奖品
   *
   * @param {Array} prizes - 奖品列表
   * @returns {Promise<Array>} 过滤后的奖品列表
   * @private
   */
  async _filterByAvailability(prizes) {
    const available = []

    for (const prize of prizes) {
      // 检查库存（null 表示无限库存）
      if (prize.stock_quantity !== null && prize.stock_quantity <= 0) {
        this.log('debug', '奖品库存不足，已排除', {
          prize_id: prize.prize_id,
          prize_name: prize.prize_name,
          stock_quantity: prize.stock_quantity
        })
        continue
      }

      // 检查每日中奖上限（null 表示无限制）
      if (prize.max_daily_wins !== null) {
        const today_wins = prize.daily_win_count || 0
        if (today_wins >= prize.max_daily_wins) {
          this.log('debug', '奖品今日中奖次数已达上限，已排除', {
            prize_id: prize.prize_id,
            prize_name: prize.prize_name,
            today_wins,
            max_daily_wins: prize.max_daily_wins
          })
          continue
        }
      }

      // 检查概率是否大于0
      const win_weight = prize.win_weight || 0
      if (win_weight <= 0) {
        this.log('debug', '奖品中奖权重为0，已排除', {
          prize_id: prize.prize_id,
          prize_name: prize.prize_name
        })
        continue
      }

      available.push(prize)
    }

    return available
  }

  /**
   * 根据预算过滤奖品
   *
   * @param {Array} prizes - 奖品列表
   * @param {number} budget - 用户预算
   * @returns {Array} 过滤后的奖品列表
   * @private
   */
  _filterByBudget(prizes, budget) {
    return prizes.filter(prize => {
      const prize_cost = prize.prize_value_points || 0
      // 保留成本 <= 预算的奖品，或者成本为0的空奖
      return prize_cost <= budget || prize_cost === 0
    })
  }

  /**
   * 按档位分组奖品
   *
   * @param {Array} prizes - 奖品列表
   * @returns {Object} 按档位分组的奖品 { high: [], mid: [], low: [], fallback: [] }
   * @private
   */
  _groupByTier(prizes) {
    const grouped = {
      high: [],
      mid: [],
      low: [],
      fallback: []
    }

    for (const prize of prizes) {
      const tier = prize.reward_tier || 'low'

      // 判断是否为兜底奖品
      if (prize.is_fallback === true || prize.prize_value_points === 0) {
        grouped.fallback.push(prize)
      } else if (TIER_ORDER.includes(tier)) {
        grouped[tier].push(prize)
      } else {
        // 未知档位默认归入 low
        grouped.low.push(prize)
      }
    }

    return grouped
  }

  /**
   * 获取可用的档位列表
   *
   * @param {Object} prizes_by_tier - 按档位分组的奖品
   * @returns {Array} 可用档位列表（按降级顺序）
   * @private
   */
  _getAvailableTiers(prizes_by_tier) {
    return TIER_ORDER.filter(tier => {
      const tier_prizes = prizes_by_tier[tier] || []
      return tier_prizes.length > 0
    })
  }

  /**
   * 判断是否有有价值的奖品
   *
   * @param {Object} prizes_by_tier - 按档位分组的奖品
   * @returns {boolean} 是否有有价值的奖品
   * @private
   */
  _hasValuablePrizes(prizes_by_tier) {
    // 有价值的档位：high、mid、low
    const valuable_tiers = ['high', 'mid', 'low']

    for (const tier of valuable_tiers) {
      const tier_prizes = prizes_by_tier[tier] || []
      // 检查是否有 prize_value_points > 0 的奖品
      const has_valuable = tier_prizes.some(p => (p.prize_value_points || 0) > 0)
      if (has_valuable) {
        return true
      }
    }

    return false
  }
}

module.exports = BuildPrizePoolStage

