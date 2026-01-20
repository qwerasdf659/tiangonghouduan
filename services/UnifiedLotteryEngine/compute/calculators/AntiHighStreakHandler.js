'use strict'

/**
 * AntiHighStreakHandler - 防连续高价值处理器
 *
 * 核心职责：
 * 1. 检测用户近期是否获得过多高价值奖品
 * 2. 触发保护时将高档奖品降级为中档
 * 3. 防止"脸好"用户过度消耗活动预算
 *
 * 业务背景（来自方案文档 5.5）：
 * - 预算保护：防止个别用户连续获得高价值奖品导致活动预算快速耗尽
 * - 公平性：确保高价值奖品分布更均匀
 * - 用户体验：避免其他用户因预算耗尽而只能获得空奖
 *
 * 保护策略：
 * - 统计窗口内的高价值奖品次数
 * - 达到阈值时，将 high 档位降级为 mid
 * - 不会降级到 low 或 fallback（避免用户感知过于明显）
 *
 * 集成点：
 * - TierPickStage：在选择档位后调用 handle() 进行降级干预
 * - LotteryComputeEngine.applyExperienceSmoothing()：通过 Facade 调用
 *
 * @module services/UnifiedLotteryEngine/compute/calculators/AntiHighStreakHandler
 * @author 抽奖模块策略重构 - Phase 12
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')

/**
 * AntiHigh 处理结果常量
 * @enum {string}
 */
const ANTI_HIGH_RESULT = {
  /** 未触发：高价值次数未达到阈值 */
  NOT_TRIGGERED: 'not_triggered',
  /** 降级触发：高档奖品已降级为中档 */
  DOWNGRADED: 'downgraded',
  /** 无需处理：选中的档位不是 high */
  NOT_HIGH_TIER: 'not_high_tier',
  /** 冷却中：正在冷却期，暂不统计 */
  IN_COOLDOWN: 'in_cooldown'
}

/**
 * 默认 AntiHigh 配置
 */
const DEFAULT_ANTI_HIGH_CONFIG = {
  /**
   * 连续高价值触发阈值
   * 统计窗口内获得 high 档位奖品达到此次数时触发降级
   */
  high_streak_threshold: 3,

  /**
   * 降级目标档位
   * high 档位触发保护时降级到此档位
   */
  downgrade_to_tier: 'mid',

  /**
   * 触发后冷却次数
   * 触发降级后，接下来 N 次抽奖不再统计高价值次数
   * 防止用户被长期"锁定"在中档
   */
  cooldown_draws: 3,

  /**
   * 是否降低高档权重（软限制）
   * true: 同时降低高档权重，减少再次命中高档的概率
   * false: 仅在命中高档时降级
   */
  reduce_high_weight: true,

  /**
   * 高档权重降低系数
   * 达到阈值时，high 档位权重乘以此系数
   */
  high_weight_reduction: 0.5,

  /**
   * 预警阈值
   * 高价值次数达到此值时记录预警日志
   */
  warning_threshold: 2
}

/**
 * 防连续高价值处理器
 */
class AntiHighStreakHandler {
  /**
   * 创建处理器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.anti_high_config - 自定义配置（可选）
   */
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_ANTI_HIGH_CONFIG,
      ...options.anti_high_config
    }

    this.logger = logger
  }

  /**
   * 处理连续高价值保护
   *
   * 主入口方法，检测并处理连续高价值情况
   *
   * @param {Object} context - 处理上下文
   * @param {number} context.recent_high_count - 近期高价值奖品次数
   * @param {number} context.anti_high_cooldown - 冷却剩余次数（0 表示不在冷却期）
   * @param {string} context.selected_tier - 当前选中的档位
   * @param {Object} context.tier_weights - 当前档位权重（用于权重调整）
   * @param {number} context.user_id - 用户ID（用于日志）
   * @param {number} context.campaign_id - 活动ID（用于日志）
   * @returns {Object} 处理结果
   *
   * @example
   * 返回结果格式：
   * {
   *   result_type: 'downgraded',        // 结果类型
   *   tier_capped: true,                 // 是否进行了档位限制
   *   original_tier: 'high',             // 原始选中档位
   *   final_tier: 'mid',                 // 最终档位
   *   recent_high_count: 3,              // 近期高价值次数
   *   high_streak_threshold: 3,          // 触发阈值
   *   downgrade_reason: '连续高价值3次', // 降级原因
   *   cooldown_triggered: true,          // 是否触发冷却
   *   cooldown_draws: 3,                 // 冷却次数
   *   adjusted_weights: { ... }          // 调整后的权重（如果启用权重降低）
   * }
   */
  handle(context) {
    const {
      recent_high_count = 0,
      anti_high_cooldown = 0,
      selected_tier,
      tier_weights = {},
      user_id,
      campaign_id
    } = context

    this._log('debug', '开始处理防连续高价值', {
      user_id,
      campaign_id,
      recent_high_count,
      anti_high_cooldown,
      selected_tier
    })

    // 初始化结果对象
    const result = {
      result_type: ANTI_HIGH_RESULT.NOT_TRIGGERED,
      tier_capped: false,
      original_tier: selected_tier,
      final_tier: selected_tier,
      recent_high_count,
      high_streak_threshold: this.config.high_streak_threshold,
      downgrade_reason: null,
      cooldown_triggered: false,
      cooldown_draws: 0,
      adjusted_weights: null
    }

    // 检查是否在冷却期
    if (anti_high_cooldown > 0) {
      this._log('debug', '正在冷却期，跳过检测', {
        user_id,
        campaign_id,
        anti_high_cooldown
      })
      result.result_type = ANTI_HIGH_RESULT.IN_COOLDOWN
      return result
    }

    // 检查选中的档位是否是 high
    if (selected_tier !== 'high') {
      this._log('debug', '当前档位非 high，无需干预', {
        user_id,
        campaign_id,
        selected_tier
      })
      result.result_type = ANTI_HIGH_RESULT.NOT_HIGH_TIER

      // 即使不是 high 档位，如果达到阈值仍可能需要调整权重
      if (
        this.config.reduce_high_weight &&
        recent_high_count >= this.config.high_streak_threshold
      ) {
        result.adjusted_weights = this._adjustWeights(tier_weights)
      }

      return result
    }

    // 记录预警（达到预警阈值）
    if (
      recent_high_count >= this.config.warning_threshold &&
      recent_high_count < this.config.high_streak_threshold
    ) {
      this._log('warn', '⚠️ 用户近期高价值奖品次数较多', {
        user_id,
        campaign_id,
        recent_high_count,
        warning_threshold: this.config.warning_threshold,
        remaining_until_cap: this.config.high_streak_threshold - recent_high_count
      })
    }

    // 检查是否达到限制阈值
    if (recent_high_count < this.config.high_streak_threshold) {
      this._log('debug', '未达到限制阈值，不干预', {
        user_id,
        campaign_id,
        recent_high_count,
        high_streak_threshold: this.config.high_streak_threshold
      })

      // 权重调整（软限制）
      if (this.config.reduce_high_weight && recent_high_count >= this.config.warning_threshold) {
        result.adjusted_weights = this._adjustWeights(tier_weights)
      }

      return result
    }

    // 达到限制阈值，执行降级
    this._log('info', '🛡️ 达到防连续高价值阈值，执行降级', {
      user_id,
      campaign_id,
      recent_high_count,
      high_streak_threshold: this.config.high_streak_threshold,
      downgrade_to: this.config.downgrade_to_tier
    })

    result.result_type = ANTI_HIGH_RESULT.DOWNGRADED
    result.tier_capped = true
    result.final_tier = this.config.downgrade_to_tier
    result.downgrade_reason = `近期高价值奖品${recent_high_count}次，档位降级`
    result.cooldown_triggered = true
    result.cooldown_draws = this.config.cooldown_draws

    // 权重调整
    if (this.config.reduce_high_weight) {
      result.adjusted_weights = this._adjustWeights(tier_weights)
    }

    this._log('info', '🎯 降级执行成功', {
      user_id,
      campaign_id,
      original_tier: selected_tier,
      final_tier: result.final_tier,
      cooldown_draws: result.cooldown_draws
    })

    return result
  }

  /**
   * 调整档位权重
   *
   * 降低 high 档位的权重，减少命中概率
   *
   * @param {Object} tier_weights - 原始档位权重
   * @returns {Object} 调整后的权重
   * @private
   */
  _adjustWeights(tier_weights) {
    const adjusted = { ...tier_weights }

    if (adjusted.high !== undefined && adjusted.high > 0) {
      const original_high = adjusted.high
      adjusted.high = Math.round(adjusted.high * this.config.high_weight_reduction)
      // 确保权重不低于 1
      if (adjusted.high < 1) {
        adjusted.high = 1
      }

      this._log('debug', 'AntiHigh 权重调整', {
        original_high,
        adjusted_high: adjusted.high,
        reduction: this.config.high_weight_reduction
      })
    }

    return adjusted
  }

  /**
   * 检查是否需要降级干预
   *
   * 快速检查方法，用于判断是否需要调用完整的 handle()
   *
   * @param {number} recent_high_count - 近期高价值次数
   * @param {string} selected_tier - 当前选中档位
   * @param {number} anti_high_cooldown - 冷却剩余次数
   * @returns {boolean} 是否需要降级干预
   */
  shouldDowngrade(recent_high_count, selected_tier, anti_high_cooldown = 0) {
    // 冷却期不触发
    if (anti_high_cooldown > 0) return false
    // 非 high 档位不触发
    if (selected_tier !== 'high') return false
    // 检查是否达到阈值
    return recent_high_count >= this.config.high_streak_threshold
  }

  /**
   * 计算更新后的冷却次数
   *
   * 每次抽奖后调用，用于递减冷却计数
   *
   * @param {number} current_cooldown - 当前冷却次数
   * @returns {number} 更新后的冷却次数
   */
  decrementCooldown(current_cooldown) {
    return Math.max(0, current_cooldown - 1)
  }

  /**
   * 获取距离触发的剩余次数
   *
   * @param {number} recent_high_count - 当前高价值次数
   * @returns {number} 剩余次数（0 表示已触发或超过）
   */
  getRemainingUntilCap(recent_high_count) {
    return Math.max(0, this.config.high_streak_threshold - recent_high_count)
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
      handler: 'AntiHighStreakHandler',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[AntiHighStreakHandler] ${message}`, log_data)
    }
  }
}

// 导出常量
AntiHighStreakHandler.ANTI_HIGH_RESULT = ANTI_HIGH_RESULT
AntiHighStreakHandler.DEFAULT_CONFIG = DEFAULT_ANTI_HIGH_CONFIG

module.exports = AntiHighStreakHandler
