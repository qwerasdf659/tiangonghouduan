'use strict'

/**
 * BuildPrizePoolStage - 构建奖品池 Stage
 *
 * 职责：
 * 1. 根据用户预算过滤奖品（排除超出预算的奖品）
 * 2. 根据库存过滤奖品（排除缺货奖品）
 * 3. 根据每日中奖上限过滤奖品
 * 4. 按档位分组奖品（high/mid/low/fallback）
 * 5. 根据 Budget Tier 限制可参与的档位
 * 6. 确保至少有一个空奖可用
 *
 * 输出到上下文：
 * - available_prizes: 可用奖品列表
 * - prizes_by_tier: 按档位分组的奖品 { high: [], mid: [], low: [], fallback: [] }
 * - available_tiers: 可用的档位列表（受 Budget Tier 限制）
 * - allowed_tiers: 预算分层允许的档位（来自 BudgetContextStage）
 * - has_valuable_prizes: 是否有有价值的奖品可用
 *
 * 策略引擎集成（2026-01-20）：
 * - 从 BudgetContextStage 获取 budget_tier 和 allowed_tiers
 * - 根据 budget_tier 过滤可参与的档位
 * - 为后续的 TierPickStage 准备分层权重信息
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 预算不足时自动降级到空奖（B0 只能抽 fallback）
 * - 保证每次抽奖都能选出一个奖品（100%中奖）
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/BuildPrizePoolStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-20 集成预算分层限制
 */

const BaseStage = require('./BaseStage')

/*
 * 注：以下导入预留用于未来扩展功能（当前版本暂未使用）
 * - LotteryPrize: 用于直接查询奖品（当前通过 context.campaign.prizes 获取）
 * - Op: Sequelize 操作符（当前条件过滤在 JavaScript 层面完成）
 * - BeijingTimeHelper: 时间处理工具（当前阶段不涉及时间计算）
 *
 * const { LotteryPrize } = require('../../../../models')
 * const { Op } = require('sequelize')
 * const BeijingTimeHelper = require('../../../../utils/timeHelper')
 */

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
   * 集成预算分层限制：根据 budget_tier 限制可参与的档位
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id } = context

    this.log('info', '开始构建奖品池', { user_id, lottery_campaign_id })

    try {
      /* 获取活动配置和奖品列表（从 LoadCampaignStage 的结果中） */
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

      /* 获取预算上下文（从 BudgetContextStage 的结果中） */
      const budget_data = this.getContextData(context, 'BudgetContextStage.data')
      const budget_before = budget_data?.budget_before || 0
      const budget_mode = budget_data?.budget_mode || 'none'

      /* 获取预算分层信息（新增：策略引擎集成） */
      const budget_tier = budget_data?.budget_tier || 'B0'
      const allowed_tiers = budget_data?.available_tiers || ['fallback']
      const pressure_tier = budget_data?.pressure_tier || 'P1'
      const effective_budget = budget_data?.effective_budget || 0

      this.log('info', '奖品池构建参数', {
        lottery_campaign_id,
        total_prizes: prizes.length,
        budget_before,
        effective_budget,
        budget_mode,
        budget_tier,
        pressure_tier,
        allowed_tiers
      })

      /* 1. 根据库存和每日上限过滤奖品 */
      let filtered_prizes = await this._filterByAvailability(prizes)

      /* 2. 根据预算过滤奖品（如果启用了预算限制） */
      if (budget_mode !== 'none') {
        filtered_prizes = this._filterByBudget(filtered_prizes, budget_before)
      }

      /* 3. 按档位分组 */
      const prizes_by_tier = this._groupByTier(filtered_prizes)

      /* 4. 确保有兜底奖品 */
      if (prizes_by_tier.fallback.length === 0 && fallback_prize) {
        prizes_by_tier.fallback.push(fallback_prize)
      }

      /* 5. 根据 budget_tier 限制可参与的档位（新增） */
      const filtered_prizes_by_tier = this._filterByAllowedTiers(prizes_by_tier, allowed_tiers)

      /* 6. 计算可用档位（在 allowed_tiers 限制后） */
      const available_tiers = this._getAvailableTiers(filtered_prizes_by_tier)

      /* 7. 判断是否有有价值的奖品 */
      const has_valuable_prizes = this._hasValuablePrizes(filtered_prizes_by_tier)

      /* 8. 构建返回数据 */
      const result = {
        available_prizes: filtered_prizes,
        prizes_by_tier: filtered_prizes_by_tier,
        available_tiers,
        allowed_tiers,
        has_valuable_prizes,
        total_available: filtered_prizes.length,
        tier_counts: {
          high: filtered_prizes_by_tier.high.length,
          mid: filtered_prizes_by_tier.mid.length,
          low: filtered_prizes_by_tier.low.length,
          fallback: filtered_prizes_by_tier.fallback.length
        },
        /* 策略引擎分层信息（传递给后续 Stage） */
        budget_tier,
        pressure_tier,
        effective_budget
      }

      this.log('info', '奖品池构建完成', {
        lottery_campaign_id,
        user_id,
        total_available: filtered_prizes.length,
        available_tiers,
        allowed_tiers,
        budget_tier,
        pressure_tier,
        tier_counts: result.tier_counts,
        has_valuable_prizes
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '奖品池构建失败', {
        user_id,
        lottery_campaign_id,
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
          lottery_prize_id: prize.lottery_prize_id,
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
            lottery_prize_id: prize.lottery_prize_id,
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
          lottery_prize_id: prize.lottery_prize_id,
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
   * 🔴 2026-02-15 修复：严格按 reward_tier 字段分组，不再因 prize_value_points=0 强制归入 fallback
   *
   * 修复根因：
   * - 原代码将所有 prize_value_points=0 的奖品强制归入 fallback 分组
   * - 导致 low 档位（所有零值奖品）变成空池
   * - low 的 80% 权重分配全部浪费（选中 low 后因无奖品被降级到 fallback）
   * - 间接导致 high 档位中奖率从设计值 5% 飙升到 64.8%
   *
   * 修复方案：
   * - 严格以数据库 reward_tier 字段为准进行分组
   * - 仅当 reward_tier 明确为 'fallback' 时才归入 fallback 组
   * - is_fallback 标记仅用于"当所有档位都无奖品时"的兜底识别，不改变分组归属
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

      if (TIER_ORDER.includes(tier)) {
        /* 严格按 reward_tier 字段分组，不因 prize_value_points=0 而改变分组 */
        grouped[tier].push(prize)
      } else {
        /* 未知档位默认归入 low */
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
    /* 有价值的档位：high、mid、low */
    const valuable_tiers = ['high', 'mid', 'low']

    for (const tier of valuable_tiers) {
      const tier_prizes = prizes_by_tier[tier] || []
      /* 检查是否有 prize_value_points > 0 的奖品 */
      const has_valuable = tier_prizes.some(p => (p.prize_value_points || 0) > 0)
      if (has_valuable) {
        return true
      }
    }

    return false
  }

  /**
   * 根据预算分层允许的档位过滤奖品
   *
   * 业务规则（Budget Tier 限制）：
   * - B0（无预算）：只允许 fallback
   * - B1（低预算）：允许 low + fallback
   * - B2（中预算）：允许 mid + low + fallback
   * - B3（高预算）：允许 high + mid + low + fallback
   *
   * @param {Object} prizes_by_tier - 原始按档位分组的奖品
   * @param {Array<string>} allowed_tiers - 预算分层允许的档位列表
   * @returns {Object} 过滤后的按档位分组奖品
   * @private
   */
  _filterByAllowedTiers(prizes_by_tier, allowed_tiers) {
    const filtered = {
      high: [],
      mid: [],
      low: [],
      fallback: []
    }

    /* 遍历每个档位，只保留 allowed_tiers 中允许的 */
    for (const tier of TIER_ORDER) {
      if (allowed_tiers.includes(tier)) {
        filtered[tier] = prizes_by_tier[tier] || []
      } else {
        /* 不允许的档位置空，但记录日志 */
        if (prizes_by_tier[tier] && prizes_by_tier[tier].length > 0) {
          this.log('debug', '档位因预算限制被排除', {
            tier,
            excluded_count: prizes_by_tier[tier].length,
            allowed_tiers
          })
        }
        filtered[tier] = []
      }
    }

    /* fallback 始终保留（确保 100% 中奖） */
    if (filtered.fallback.length === 0 && prizes_by_tier.fallback) {
      filtered.fallback = prizes_by_tier.fallback
    }

    return filtered
  }
}

module.exports = BuildPrizePoolStage
