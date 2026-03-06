'use strict'

/**
 * BudgetTierCalculator - 预算分层计算器
 *
 * 核心职责：
 * 1. 计算 EffectiveBudget：根据 budget_mode 获取用户/活动池的实际可用预算
 * 2. 根据 EffectiveBudget 和奖品分层阈值确定 Budget Tier（B0-B3）
 * 3. 处理钱包可用性检查（wallet availability）
 *
 * 业务背景（来自方案文档）：
 * - 预算不足时应降低高价值奖品概率，而非直接失败
 * - Budget Tier 决定用户可参与哪些档位的抽奖
 * - B0: low + fallback（资格由资源级过滤保证）
 * - B1: 仅 low + fallback
 * - B2: mid + low + fallback
 * - B3: high + mid + low + fallback
 *
 * 关键设计决策：
 * - 文档12.2.1：allowed_campaign_ids 是预算来源桶，不是当前抽奖活动ID
 * - 文档12.2.2：动态钱包可用性检查（空/null → 返回0）
 * - EffectiveBudget 统一作为预算输入，屏蔽 budget_mode 差异
 *
 * @module services/UnifiedLotteryEngine/compute/calculators/BudgetTierCalculator
 * @author 抽奖模块策略重构 - Phase 3
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')

/**
 * 预算分层（Budget Tier）等级常量
 * @enum {string}
 */
const BUDGET_TIER = {
  /** B0：预算不足，可抽 low + fallback（资格由资源级过滤保证） */
  B0: 'B0',
  /** B1：低预算，可抽 low + fallback */
  B1: 'B1',
  /** B2：中预算，可抽 mid + low + fallback */
  B2: 'B2',
  /** B3：高预算，可抽所有档位 */
  B3: 'B3'
}

/**
 * 档位与 Budget Tier 的可用性映射
 * 定义每个 Budget Tier 允许参与的档位
 */
const TIER_AVAILABILITY = {
  [BUDGET_TIER.B0]: ['low', 'fallback'], // low + fallback（资格由资源级过滤保证）
  [BUDGET_TIER.B1]: ['low', 'fallback'], // 低档 + 空奖
  [BUDGET_TIER.B2]: ['mid', 'low', 'fallback'], // 中档 + 低档 + 空奖
  [BUDGET_TIER.B3]: ['high', 'mid', 'low', 'fallback'] // 所有档位
}

/**
 * 预算分层计算器
 */
class BudgetTierCalculator {
  /**
   * 创建计算器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.thresholds - 预算阈值配置（可选）
   */
  constructor(options = {}) {
    /**
     * 预算阈值配置（C 层修复：默认值跟随 budget_allocation_ratio 动态计算）
     *
     * threshold_high：预算 >= 此值 → B3
     * threshold_mid：预算 >= 此值 → B2
     * threshold_low：预算 >= 此值 → B1
     * 预算 < threshold_low → B0
     *
     * 默认值基于 budget_allocation_ratio 动态计算：
     *   ratio=0.22 时: high=110(消费500元), mid=44(消费200元), low=22(消费100元)
     * 运行时 _calculateDynamicThresholds 会用奖品实际数据覆盖这些默认值
     */
    const ratio = options.budget_allocation_ratio || 0.22
    this.thresholds = {
      high: Math.round(100 * ratio * 5),
      mid: Math.round(100 * ratio * 2),
      low: Math.round(100 * ratio * 1),
      ...options.thresholds
    }

    this.logger = logger
  }

  /**
   * 计算预算分层
   *
   * 主入口方法，根据上下文计算 EffectiveBudget 和 Budget Tier
   *
   * @param {Object} context - 抽奖上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {Object} context.campaign - 活动配置对象
   * @param {Array} context.prizes - 奖品列表
   * @param {Object} options - 额外选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 计算结果
   */
  async calculate(context, options = {}) {
    const { user_id, lottery_campaign_id, campaign, prizes } = context
    const budget_mode = campaign?.budget_mode || 'none'

    this._log('info', '开始计算预算分层', {
      user_id,
      lottery_campaign_id,
      budget_mode
    })

    try {
      // 1. 计算 EffectiveBudget（统一预算值）
      const effective_budget = await this._calculateEffectiveBudget(context, options)

      // 2. 根据奖品价值动态计算阈值（如有配置）
      const dynamic_thresholds = this._calculateDynamicThresholds(prizes)

      // 3. 确定 Budget Tier
      const budget_tier = this._determineBudgetTier(effective_budget, dynamic_thresholds)

      // 4. 获取该 Tier 允许的档位
      const available_tiers = TIER_AVAILABILITY[budget_tier]

      // 5. 计算预算充足性信息
      const budget_sufficiency = this._calculateBudgetSufficiency(
        effective_budget,
        prizes,
        budget_tier
      )

      const result = {
        effective_budget,
        budget_tier,
        available_tiers,
        budget_mode,
        thresholds_used: dynamic_thresholds,
        budget_sufficiency,
        timestamp: new Date().toISOString()
      }

      this._log('info', '预算分层计算完成', {
        user_id,
        lottery_campaign_id,
        effective_budget,
        budget_tier,
        available_tiers
      })

      return result
    } catch (error) {
      this._log('error', '预算分层计算失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 计算 EffectiveBudget（统一预算值）
   *
   * 根据 budget_mode 从不同来源获取可用预算：
   * - user：从用户 BUDGET_POINTS 资产获取
   * - pool：从活动 pool_budget_remaining 获取
   * - hybrid：取 user 和 pool 的较小值（双限制）
   * - none：返回 Infinity（无预算限制）
   *
   * 关键设计（文档12.2.1 + 12.2.2）：
   * - allowed_campaign_ids 是预算来源桶，不是当前抽奖活动ID
   * - 动态钱包可用性：配置为空/null 时返回 0
   *
   * @param {Object} context - 抽奖上下文
   * @param {Object} options - 额外选项
   * @returns {Promise<number>} EffectiveBudget 值
   * @private
   */
  async _calculateEffectiveBudget(context, options = {}) {
    const { user_id, lottery_campaign_id, campaign } = context
    const budget_mode = campaign?.budget_mode || 'none'
    const { transaction } = options

    // 🔥 无预算限制模式
    if (budget_mode === 'none') {
      this._log('debug', 'budget_mode=none，无预算限制', { user_id, lottery_campaign_id })
      return Infinity
    }

    // V4.7.0 AssetService 拆分：延迟加载 QueryService 和 LotteryCampaign 避免循环依赖（2026-01-31）
    const QueryService = require('../../../asset/QueryService')
    const { LotteryCampaign } = require('../../../../models')

    let user_budget = 0
    let pool_budget = 0

    /*
     * ==========================================
     * 🔥 计算用户预算（user 模式和 hybrid 模式需要）
     * ==========================================
     */
    if (budget_mode === 'user' || budget_mode === 'hybrid') {
      try {
        // 文档12.2.1：allowed_campaign_ids 是预算来源桶
        const allowed_campaign_ids = campaign?.allowed_campaign_ids

        // 文档12.2.2：动态钱包可用性检查
        if (!allowed_campaign_ids || allowed_campaign_ids.length === 0) {
          // 配置为空/null，钱包不可用，返回 0
          this._log('debug', 'user 钱包不可用（allowed_campaign_ids 为空）', {
            user_id,
            lottery_campaign_id,
            allowed_campaign_ids
          })
          user_budget = 0
        } else {
          // 从指定的预算来源桶聚合 BUDGET_POINTS
          user_budget = await QueryService.getBudgetPointsByCampaigns(
            { user_id, lottery_campaign_ids: allowed_campaign_ids },
            { transaction }
          )

          this._log('debug', '获取用户预算成功', {
            user_id,
            lottery_campaign_id,
            allowed_campaign_ids,
            user_budget
          })
        }
      } catch (error) {
        this._log('warn', '获取用户预算失败，使用 0', {
          user_id,
          lottery_campaign_id,
          error: error.message
        })
        user_budget = 0
      }
    }

    /*
     * ==========================================
     * 🔥 计算活动池预算（pool 模式和 hybrid 模式需要）
     * ==========================================
     */
    if (budget_mode === 'pool' || budget_mode === 'hybrid') {
      try {
        /*
         * 文档12.2.2：动态钱包可用性检查
         * 查询活动的 pool_budget_remaining
         */
        const campaign_record = await LotteryCampaign.findByPk(lottery_campaign_id, {
          attributes: ['pool_budget_remaining', 'pool_budget_total'],
          transaction
        })

        if (!campaign_record || campaign_record.pool_budget_remaining === null) {
          // 池预算未配置，钱包不可用，返回 0
          this._log('debug', 'pool 钱包不可用（pool_budget_remaining 为 null）', {
            user_id,
            lottery_campaign_id
          })
          pool_budget = 0
        } else {
          pool_budget = Number(campaign_record.pool_budget_remaining) || 0

          this._log('debug', '获取活动池预算成功', {
            user_id,
            lottery_campaign_id,
            pool_budget,
            pool_budget_total: campaign_record.pool_budget_total
          })
        }
      } catch (error) {
        this._log('warn', '获取活动池预算失败，使用 0', {
          user_id,
          lottery_campaign_id,
          error: error.message
        })
        pool_budget = 0
      }
    }

    /*
     * ==========================================
     * 🔥 根据 budget_mode 计算最终 EffectiveBudget
     * ==========================================
     */
    let effective_budget = 0

    switch (budget_mode) {
      case 'user':
        effective_budget = user_budget
        break

      case 'pool':
        effective_budget = pool_budget
        break

      case 'hybrid':
        // 双限制：取两者的较小值
        effective_budget = Math.min(user_budget, pool_budget)
        this._log('debug', 'hybrid 模式取较小值', {
          user_id,
          lottery_campaign_id,
          user_budget,
          pool_budget,
          effective_budget
        })
        break

      default:
        effective_budget = 0
    }

    this._log('info', 'EffectiveBudget 计算完成', {
      user_id,
      lottery_campaign_id,
      budget_mode,
      user_budget: budget_mode === 'user' || budget_mode === 'hybrid' ? user_budget : 'N/A',
      pool_budget: budget_mode === 'pool' || budget_mode === 'hybrid' ? pool_budget : 'N/A',
      effective_budget
    })

    return effective_budget
  }

  /**
   * 根据奖品价值动态计算阈值
   *
   * 如果有奖品列表，则根据奖品的实际价值分布来调整阈值：
   * - threshold_high = 最高档奖品的最低成本
   * - threshold_mid = 中档奖品的最低成本
   * - threshold_low = 低档奖品的最低成本
   *
   * @param {Array} prizes - 奖品列表
   * @returns {Object} 动态阈值 { high, mid, low }
   * @private
   */
  _calculateDynamicThresholds(prizes) {
    if (!prizes || prizes.length === 0) {
      return { ...this.thresholds }
    }

    // 按档位分组奖品
    const prize_by_tier = {
      high: [],
      mid: [],
      low: [],
      fallback: []
    }

    for (const prize of prizes) {
      const tier = prize.reward_tier || 'fallback'
      /* _calculateDynamicThresholds 用 pvp 做分层阈值标记（pvp 的唯一正确职责） */
      const cost = prize.prize_value_points || 0

      if (prize_by_tier[tier]) {
        prize_by_tier[tier].push(cost)
      }
    }

    /**
     * 计算各档位的最低成本（排除 0 值奖品）
     *
     * 🔴 2026-02-15 修复：
     * - 原代码 `getMinCost(...) || this.thresholds.high` 有 falsy 检查问题
     * - 当档位内所有奖品 prize_value_points=0 时，Math.min(0)=0，被 || 跳到默认值
     * - 导致 low 档位（全部 value=0）的阈值变成默认的 100 而非 0
     * - 进而导致 B1 阈值=100、B2 阈值=100（全部变成相同值）
     *
     * 修复方案：使用 null 和 !== null 检查替代 falsy 检查
     */
    /**
     * 获取奖品成本数组中的最小正值
     * @param {number[]} costs - 奖品成本数组
     * @returns {number|null} 最小正值成本，全部为0时返回null
     */
    const getMinPositiveCost = costs => {
      const positive_costs = costs.filter(c => c > 0)
      return positive_costs.length > 0 ? Math.min(...positive_costs) : null
    }

    /**
     * A 层修复：null 回退到 0（而非 this.thresholds.high/mid/low）
     * 当某档位所有奖品 prize_value_points=0 时，getMinPositiveCost 返回 null，
     * 说明该档位不需要预算门槛，阈值应为 0（任何人都能进），而非硬编码默认值
     */
    const dynamic_thresholds = {
      high: getMinPositiveCost(prize_by_tier.high) ?? 0,
      mid: getMinPositiveCost(prize_by_tier.mid) ?? 0,
      low: getMinPositiveCost(prize_by_tier.low) ?? 0
    }

    /**
     * B 层修复：保序方向从「向上污染」改为「向下收敛」
     * 确保阈值递减 high >= mid >= low：
     *   偏高的往下拉（low 异常高不会拉高 mid），不会向上扩散影响其他档位
     */
    if (dynamic_thresholds.low > dynamic_thresholds.mid) {
      dynamic_thresholds.low = dynamic_thresholds.mid
    }
    if (dynamic_thresholds.mid > dynamic_thresholds.high) {
      dynamic_thresholds.mid = dynamic_thresholds.high
    }

    return dynamic_thresholds
  }

  /**
   * 确定 Budget Tier
   *
   * @param {number} effective_budget - EffectiveBudget 值
   * @param {Object} thresholds - 阈值配置
   * @returns {string} Budget Tier（B0/B1/B2/B3）
   * @private
   */
  _determineBudgetTier(effective_budget, thresholds) {
    // 无预算限制
    if (effective_budget === Infinity) {
      return BUDGET_TIER.B3
    }

    // 根据阈值判断 Tier
    if (effective_budget >= thresholds.high) {
      return BUDGET_TIER.B3
    }
    if (effective_budget >= thresholds.mid) {
      return BUDGET_TIER.B2
    }
    if (effective_budget >= thresholds.low) {
      return BUDGET_TIER.B1
    }

    // 预算不足，仅可抽 fallback
    return BUDGET_TIER.B0
  }

  /**
   * 计算预算充足性信息
   *
   * 提供详细的预算状态信息，用于调试和审计
   *
   * @param {number} effective_budget - EffectiveBudget 值
   * @param {Array} prizes - 奖品列表
   * @param {string} budget_tier - Budget Tier
   * @returns {Object} 预算充足性信息
   * @private
   */
  _calculateBudgetSufficiency(effective_budget, prizes, budget_tier) {
    if (!prizes || prizes.length === 0) {
      return {
        is_sufficient: true,
        affordable_prizes_count: 0,
        total_prizes_count: 0,
        min_prize_cost: 0,
        max_affordable_cost: effective_budget === Infinity ? Infinity : effective_budget
      }
    }

    // 计算用户能负担的奖品数量（用 budget_cost 判断可承受性，与过滤/扣减口径一致）
    const affordable_prizes = prizes.filter(p => {
      const cost = p.budget_cost || 0
      return cost <= effective_budget || cost === 0
    })

    // 找出最低奖品成本（排除空奖，用 budget_cost 与过滤口径一致）
    const non_empty_prizes = prizes.filter(p => (p.budget_cost || 0) > 0)
    const min_prize_cost =
      non_empty_prizes.length > 0 ? Math.min(...non_empty_prizes.map(p => p.budget_cost)) : 0

    return {
      is_sufficient: budget_tier !== BUDGET_TIER.B0,
      affordable_prizes_count: affordable_prizes.length,
      total_prizes_count: prizes.length,
      min_prize_cost,
      max_affordable_cost: effective_budget === Infinity ? Infinity : effective_budget,
      budget_tier
    }
  }

  /**
   * 记录日志
   *
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void}
   * @private
   */
  _log(level, message, data = {}) {
    const log_data = {
      calculator: 'BudgetTierCalculator',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[BudgetTierCalculator] ${message}`, log_data)
    }
  }
}

// 导出常量
BudgetTierCalculator.BUDGET_TIER = BUDGET_TIER
BudgetTierCalculator.TIER_AVAILABILITY = TIER_AVAILABILITY

module.exports = BudgetTierCalculator
