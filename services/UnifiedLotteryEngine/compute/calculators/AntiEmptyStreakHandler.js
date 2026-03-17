'use strict'

/**
 * AntiEmptyStreakHandler - 防连续空奖处理器
 *
 * 核心职责：
 * 1. 检测用户是否达到连续空奖保护阈值
 * 2. 触发保护时强制返回非空奖档位
 * 3. 与 Pity 系统协作，提供双重保障
 *
 * 业务背景（来自方案文档 5.5）：
 * - 硬保障机制：达到阈值时强制发放非空奖（需要预算支持）
 * - 保守策略：强制发放时优先选择低档奖品（节省预算）
 * - 安全第一：如果预算不足以支持低档奖品，则不强制触发
 *
 * 与 Pity 系统的区别：
 * - Pity 是"软保底"：渐进式提升概率
 * - AntiEmpty 是"硬保障"：直接强制非空奖
 * - 两者可以同时生效，AntiEmpty 在 Pity 之后执行
 *
 * 集成点：
 * - TierPickStage：在选择档位后调用 handle() 进行强制干预
 * - LotteryComputeEngine.applyExperienceSmoothing()：通过 Facade 调用
 *
 * @module services/UnifiedLotteryEngine/compute/calculators/AntiEmptyStreakHandler
 * @author 抽奖模块策略重构 - Phase 11
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')

/**
 * AntiEmpty 处理结果常量
 * @enum {string}
 */
const ANTI_EMPTY_RESULT = {
  /** 未触发：连续空奖次数未达到阈值 */
  NOT_TRIGGERED: 'not_triggered',
  /** 强制触发：成功强制为非空奖 */
  FORCED: 'forced',
  /** 预算不足：达到阈值但预算不足以支持非空奖 */
  BUDGET_INSUFFICIENT: 'budget_insufficient',
  /** 已是非空奖：选中的档位已经是非空奖，无需干预 */
  ALREADY_NON_EMPTY: 'already_non_empty'
}

/**
 * 默认 AntiEmpty 配置
 */
const DEFAULT_ANTI_EMPTY_CONFIG = {
  /**
   * 强制触发阈值
   * 连续空奖次数达到此值时强制发放非空奖
   * 文档 D12 确认值为 5
   */
  force_threshold: 5,

  /**
   * 强制时选择的档位优先级
   * 从左到右尝试，选择第一个预算可负担的档位
   */
  forced_tier_priority: ['low', 'mid', 'high'],

  /**
   * 是否在预算不足时降级为提示
   * true: 预算不足时记录警告但不阻断
   * false: 预算不足时抛出错误
   */
  graceful_budget_fallback: true,

  /**
   * 连续空奖警告阈值
   * 达到此值时记录警告日志，用于监控
   */
  warning_threshold: 7
}

/**
 * 防连续空奖处理器
 */
class AntiEmptyStreakHandler {
  /**
   * 创建处理器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.anti_empty_config - 自定义配置（可选）
   */
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_ANTI_EMPTY_CONFIG,
      ...options.anti_empty_config
    }

    this.logger = logger
  }

  /**
   * 处理连续空奖保护
   *
   * 主入口方法，检测并处理连续空奖情况
   *
   * @param {Object} context - 处理上下文
   * @param {number} context.empty_streak - 当前连续空奖次数
   * @param {string} context.selected_tier - 当前选中的档位
   * @param {Object} context.available_tiers - 可用档位及其预算状态
   * @param {number} context.effective_budget - 用户有效预算
   * @param {Array} context.prizes_by_tier - 按档位分组的奖品
   * @param {number} context.user_id - 用户ID（用于日志）
   * @param {number} context.lottery_campaign_id - 活动ID（用于日志）
   * @returns {Object} 处理结果
   *
   * @example
   * 返回结果格式：
   * {
   *   result_type: 'forced',           // 结果类型
   *   forced: true,                     // 是否强制干预
   *   original_tier: 'fallback',        // 原始选中档位
   *   final_tier: 'low',                // 最终档位
   *   empty_streak: 10,                 // 连续空奖次数
   *   force_threshold: 10,              // 触发阈值
   *   forced_reason: '连续空奖10次',    // 强制原因
   *   budget_check_passed: true,        // 预算检查是否通过
   *   attempted_tiers: ['low']          // 尝试过的档位
   * }
   */
  handle(context) {
    const {
      empty_streak = 0,
      selected_tier,
      available_tiers = {},
      effective_budget = 0,
      prizes_by_tier = {},
      user_id,
      lottery_campaign_id
    } = context

    this._log('debug', '开始处理防连续空奖', {
      user_id,
      lottery_campaign_id,
      empty_streak,
      selected_tier
    })

    // 初始化结果对象
    const result = {
      result_type: ANTI_EMPTY_RESULT.NOT_TRIGGERED,
      forced: false,
      original_tier: selected_tier,
      final_tier: selected_tier,
      empty_streak,
      force_threshold: this.config.force_threshold,
      forced_reason: null,
      budget_check_passed: true,
      attempted_tiers: []
    }

    /**
     * 100% 出奖系统：仅 'empty' 视为需要干预的空奖（2026-03-16 语义修正）
     * fallback 是真实的保底奖品，不需要防空奖干预
     */
    if (selected_tier && selected_tier !== 'empty') {
      this._log('debug', '当前已选中有效档位（含保底），无需干预', {
        user_id,
        lottery_campaign_id,
        selected_tier
      })
      result.result_type = ANTI_EMPTY_RESULT.ALREADY_NON_EMPTY
      return result
    }

    // 记录警告（达到警告阈值）
    if (
      empty_streak >= this.config.warning_threshold &&
      empty_streak < this.config.force_threshold
    ) {
      this._log('warn', '⚠️ 用户连续空奖次数较高', {
        user_id,
        lottery_campaign_id,
        empty_streak,
        warning_threshold: this.config.warning_threshold,
        remaining_until_force: this.config.force_threshold - empty_streak
      })
    }

    // 检查是否达到强制阈值
    if (empty_streak < this.config.force_threshold) {
      this._log('debug', '未达到强制阈值，不干预', {
        user_id,
        lottery_campaign_id,
        empty_streak,
        force_threshold: this.config.force_threshold
      })
      return result
    }

    // 达到强制阈值，尝试强制选择非空奖
    this._log('info', '🛡️ 达到防连续空奖阈值，尝试强制干预', {
      user_id,
      lottery_campaign_id,
      empty_streak,
      force_threshold: this.config.force_threshold
    })

    // 按优先级尝试选择非空奖档位
    const forced_tier = this._selectForcedTier({
      available_tiers,
      effective_budget,
      prizes_by_tier,
      attempted_tiers: result.attempted_tiers
    })

    if (forced_tier) {
      result.result_type = ANTI_EMPTY_RESULT.FORCED
      result.forced = true
      result.final_tier = forced_tier
      result.forced_reason = `连续空奖${empty_streak}次，强制发放非空奖`

      this._log('info', '🎯 强制干预成功', {
        user_id,
        lottery_campaign_id,
        original_tier: selected_tier,
        forced_tier,
        empty_streak
      })
    } else {
      // 预算不足，无法强制发放
      result.result_type = ANTI_EMPTY_RESULT.BUDGET_INSUFFICIENT
      result.budget_check_passed = false
      result.forced_reason = '预算不足，无法强制发放非空奖'

      if (this.config.graceful_budget_fallback) {
        this._log('warn', '🚨 预算不足，无法强制发放非空奖', {
          user_id,
          lottery_campaign_id,
          empty_streak,
          effective_budget,
          attempted_tiers: result.attempted_tiers
        })
      } else {
        this._log('error', '🚨 预算不足导致防连续空奖失败', {
          user_id,
          lottery_campaign_id,
          empty_streak,
          effective_budget
        })
      }
    }

    return result
  }

  /**
   * 选择强制发放的档位
   *
   * 按优先级尝试选择可负担的非空奖档位
   *
   * @param {Object} params - 参数
   * @param {Object} params.available_tiers - 可用档位
   * @param {number} params.effective_budget - 有效预算
   * @param {Object} params.prizes_by_tier - 按档位分组的奖品
   * @param {Array} params.attempted_tiers - 记录尝试过的档位
   * @returns {string|null} 选中的档位或 null
   * @private
   */
  _selectForcedTier(params) {
    const { available_tiers, effective_budget, prizes_by_tier, attempted_tiers } = params

    for (const tier of this.config.forced_tier_priority) {
      attempted_tiers.push(tier)

      // 检查档位是否可用
      if (!available_tiers[tier]) {
        this._log('debug', `档位 ${tier} 不可用，跳过`, { tier })
        continue
      }

      // 获取该档位的最低成本奖品
      const tier_prizes = prizes_by_tier[tier] || []
      if (tier_prizes.length === 0) {
        this._log('debug', `档位 ${tier} 无奖品，跳过`, { tier })
        continue
      }

      // 找出最低成本（用 budget_cost 与过滤/扣减口径一致，避免"幽灵保底"）
      const min_cost = Math.min(...tier_prizes.map(p => p.budget_cost || 0))

      // 检查预算是否足够
      if (effective_budget >= min_cost || effective_budget === Infinity) {
        this._log('debug', `选中档位 ${tier}`, {
          tier,
          min_cost,
          effective_budget
        })
        return tier
      }

      this._log('debug', `档位 ${tier} 预算不足`, {
        tier,
        min_cost,
        effective_budget
      })
    }

    return null
  }

  /**
   * 检查是否需要强制干预
   *
   * 快速检查方法，用于判断是否需要调用完整的 handle()
   *
   * @param {number} empty_streak - 连续空奖次数
   * @param {string} selected_tier - 当前选中档位
   * @returns {boolean} 是否需要强制干预
   */
  shouldForce(empty_streak, selected_tier) {
    /* 100% 出奖：仅 'empty' 需要干预，fallback 是真实保底奖品 */
    if (selected_tier && selected_tier !== 'empty') {
      return false
    }
    return empty_streak >= this.config.force_threshold
  }

  /**
   * 获取距离强制触发的剩余次数
   *
   * @param {number} empty_streak - 当前连续空奖次数
   * @returns {number} 剩余次数（0 表示已触发或超过）
   */
  getRemainingUntilForce(empty_streak) {
    return Math.max(0, this.config.force_threshold - empty_streak)
  }

  /**
   * 获取配置信息
   *
   * @returns {Object} 当前配置
   */
  getConfig() {
    return { ...this.config }
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
      handler: 'AntiEmptyStreakHandler',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[AntiEmptyStreakHandler] ${message}`, log_data)
    }
  }
}

// 导出常量
AntiEmptyStreakHandler.ANTI_EMPTY_RESULT = ANTI_EMPTY_RESULT
AntiEmptyStreakHandler.DEFAULT_CONFIG = DEFAULT_ANTI_EMPTY_CONFIG

module.exports = AntiEmptyStreakHandler
