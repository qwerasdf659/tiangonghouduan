'use strict'

/**
 * PityCalculator - Pity 软保底计算器
 *
 * 核心职责：
 * 1. 根据用户连续空奖次数（empty_streak）计算非空奖概率提升
 * 2. 实现渐进式概率提升机制（Pity System）
 * 3. 硬保底阈值检测（达到 10 次时强制触发非空奖）
 *
 * 业务背景（来自方案文档 5.5）：
 * - 灵感来源：游戏保底机制（如原神 Pity System）
 * - 连续空奖时逐步提升非空奖概率，改善用户体验
 * - 硬保底确保用户不会连续过多次抽到空奖
 *
 * Pity 阈值配置（可配置）：
 * - 3 次空奖：非空奖权重提升 10%（乘数 1.1）
 * - 5 次空奖：非空奖权重提升 25%（乘数 1.25）
 * - 7 次空奖：非空奖权重提升 50%（乘数 1.5）
 * - 10 次空奖：硬保底触发，强制返回非空奖
 *
 * 集成点：
 * - TierPickStage：在选择档位前调用 calculate() 获取概率调整
 * - LotteryComputeEngine.applyExperienceSmoothing()：通过 Facade 调用
 *
 * @module services/UnifiedLotteryEngine/compute/calculators/PityCalculator
 * @author 抽奖模块策略重构 - Phase 9
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')

/**
 * Pity 结果类型常量
 * @enum {string}
 */
const PITY_RESULT = {
  /** 无触发：连续空奖次数未达到任何阈值 */
  NONE: 'none',
  /** 软保底：概率提升（未达到硬保底） */
  SOFT: 'soft',
  /** 硬保底：强制触发非空奖 */
  HARD: 'hard'
}

/**
 * 默认 Pity 阈值配置
 * 基于方案文档 5.5 节设计
 */
const DEFAULT_PITY_CONFIG = {
  /** 第一阶段：3 次空奖触发，权重乘数 1.1 */
  threshold_1: {
    streak: 3,
    multiplier: 1.1,
    description: '3次空奖：非空奖权重+10%'
  },
  /** 第二阶段：5 次空奖触发，权重乘数 1.25 */
  threshold_2: {
    streak: 5,
    multiplier: 1.25,
    description: '5次空奖：非空奖权重+25%'
  },
  /** 第三阶段：7 次空奖触发，权重乘数 1.5 */
  threshold_3: {
    streak: 7,
    multiplier: 1.5,
    description: '7次空奖：非空奖权重+50%'
  },
  /** 硬保底：10 次空奖触发，强制非空奖 */
  hard_pity: {
    streak: 10,
    description: '10次空奖：强制触发非空奖'
  }
}

/**
 * Pity 软保底计算器
 */
class PityCalculator {
  /**
   * 创建计算器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.pity_config - 自定义 Pity 阈值配置（可选）
   */
  constructor(options = {}) {
    /**
     * Pity 阈值配置
     * 支持外部覆盖，用于 A/B 测试或特殊活动
     */
    this.pity_config = {
      ...DEFAULT_PITY_CONFIG,
      ...options.pity_config
    }

    this.logger = logger
  }

  /**
   * 计算 Pity 系统效果
   *
   * 主入口方法，根据用户连续空奖次数计算概率调整
   *
   * @param {Object} context - 计算上下文
   * @param {number} context.empty_streak - 当前连续空奖次数
   * @param {Object} context.tier_weights - 当前档位权重配置
   * @param {number} context.user_id - 用户ID（用于日志）
   * @param {number} context.campaign_id - 活动ID（用于日志）
   * @returns {Object} 计算结果
   *
   * @example
   * 返回结果格式：
   * {
   *   pity_type: 'soft',           // 'none' | 'soft' | 'hard'
   *   pity_triggered: true,         // 是否触发 Pity
   *   multiplier: 1.25,             // 非空奖权重乘数
   *   adjusted_weights: { ... },    // 调整后的档位权重
   *   original_weights: { ... },    // 原始档位权重
   *   empty_streak: 5,              // 当前连续空奖次数
   *   hard_pity_triggered: false,   // 是否触发硬保底
   *   threshold_matched: 'threshold_2', // 匹配的阈值级别
   *   pity_progress: 0.5            // Pity 进度（距离硬保底的比例）
   * }
   */
  calculate(context) {
    const { empty_streak = 0, tier_weights = {}, user_id, campaign_id } = context

    this._log('debug', '开始计算 Pity 效果', {
      user_id,
      campaign_id,
      empty_streak
    })

    // 初始化结果对象
    const result = {
      pity_type: PITY_RESULT.NONE,
      pity_triggered: false,
      multiplier: 1.0,
      adjusted_weights: { ...tier_weights },
      original_weights: tier_weights,
      empty_streak,
      hard_pity_triggered: false,
      threshold_matched: null,
      pity_progress: this._calculatePityProgress(empty_streak)
    }

    // 连续空奖次数为 0 或负数，直接返回
    if (empty_streak <= 0) {
      this._log('debug', 'Pity 未触发：无连续空奖', { user_id, campaign_id })
      return result
    }

    // 检查硬保底阈值
    if (empty_streak >= this.pity_config.hard_pity.streak) {
      this._log('info', '🎯 硬保底触发', {
        user_id,
        campaign_id,
        empty_streak,
        hard_pity_streak: this.pity_config.hard_pity.streak
      })

      result.pity_type = PITY_RESULT.HARD
      result.pity_triggered = true
      result.hard_pity_triggered = true
      result.multiplier = Infinity // 无限乘数，表示强制非空奖
      result.threshold_matched = 'hard_pity'
      // 硬保底时不调整权重，由上层强制选择非空奖
      return result
    }

    // 检查软保底阈值（从高到低检查）
    const thresholds = [
      { key: 'threshold_3', config: this.pity_config.threshold_3 },
      { key: 'threshold_2', config: this.pity_config.threshold_2 },
      { key: 'threshold_1', config: this.pity_config.threshold_1 }
    ]

    for (const { key, config } of thresholds) {
      if (empty_streak >= config.streak) {
        this._log('info', `🎯 软保底触发: ${config.description}`, {
          user_id,
          campaign_id,
          empty_streak,
          threshold_streak: config.streak,
          multiplier: config.multiplier
        })

        result.pity_type = PITY_RESULT.SOFT
        result.pity_triggered = true
        result.multiplier = config.multiplier
        result.threshold_matched = key

        // 调整档位权重
        result.adjusted_weights = this._adjustWeights(tier_weights, config.multiplier)

        break // 匹配最高阈值后退出
      }
    }

    if (!result.pity_triggered) {
      this._log('debug', 'Pity 未触发：未达到任何阈值', {
        user_id,
        campaign_id,
        empty_streak,
        min_threshold: this.pity_config.threshold_1.streak
      })
    }

    return result
  }

  /**
   * 调整档位权重
   *
   * 对非空奖档位（high/mid/low）应用乘数提升权重
   * 同时降低空奖档位（fallback）的权重
   *
   * @param {Object} tier_weights - 原始档位权重
   * @param {number} multiplier - 权重乘数
   * @returns {Object} 调整后的权重
   * @private
   */
  _adjustWeights(tier_weights, multiplier) {
    const adjusted = { ...tier_weights }
    const non_empty_tiers = ['high', 'mid', 'low']

    // 提升非空奖档位权重
    for (const tier of non_empty_tiers) {
      if (adjusted[tier] !== undefined && adjusted[tier] > 0) {
        adjusted[tier] = Math.round(adjusted[tier] * multiplier)
      }
    }

    // 降低空奖档位权重（反向乘数）
    if (adjusted.fallback !== undefined && adjusted.fallback > 0) {
      adjusted.fallback = Math.round(adjusted.fallback / multiplier)
      // 确保 fallback 权重不低于 1
      if (adjusted.fallback < 1) {
        adjusted.fallback = 1
      }
    }

    this._log('debug', 'Pity 权重调整完成', {
      original: tier_weights,
      adjusted,
      multiplier
    })

    return adjusted
  }

  /**
   * 计算 Pity 进度
   *
   * 返回距离硬保底的进度百分比（0.0 - 1.0）
   *
   * @param {number} empty_streak - 当前连续空奖次数
   * @returns {number} Pity 进度（0.0 - 1.0）
   * @private
   */
  _calculatePityProgress(empty_streak) {
    const hard_pity_streak = this.pity_config.hard_pity.streak
    if (empty_streak <= 0) return 0
    if (empty_streak >= hard_pity_streak) return 1.0
    return empty_streak / hard_pity_streak
  }

  /**
   * 检查是否应该强制选择非空奖
   *
   * 便捷方法，用于快速检查是否需要硬保底
   *
   * @param {number} empty_streak - 当前连续空奖次数
   * @returns {boolean} 是否应该强制选择非空奖
   */
  shouldForceNonEmpty(empty_streak) {
    return empty_streak >= this.pity_config.hard_pity.streak
  }

  /**
   * 获取当前阶段信息
   *
   * 返回用户当前所处的 Pity 阶段，用于前端展示
   *
   * @param {number} empty_streak - 当前连续空奖次数
   * @returns {Object} 阶段信息
   *
   * @example
   * 返回结果格式：
   * {
   *   current_streak: 5,
   *   current_stage: 'threshold_2',
   *   current_multiplier: 1.25,
   *   next_stage: 'threshold_3',
   *   next_streak: 7,
   *   hard_pity_remaining: 5
   * }
   */
  getPityStage(empty_streak) {
    const config = this.pity_config
    const hard_pity_streak = config.hard_pity.streak

    const result = {
      current_streak: empty_streak,
      current_stage: null,
      current_multiplier: 1.0,
      next_stage: null,
      next_streak: null,
      hard_pity_remaining: Math.max(0, hard_pity_streak - empty_streak)
    }

    // 确定当前阶段
    if (empty_streak >= hard_pity_streak) {
      result.current_stage = 'hard_pity'
      result.current_multiplier = Infinity
    } else if (empty_streak >= config.threshold_3.streak) {
      result.current_stage = 'threshold_3'
      result.current_multiplier = config.threshold_3.multiplier
      result.next_stage = 'hard_pity'
      result.next_streak = hard_pity_streak
    } else if (empty_streak >= config.threshold_2.streak) {
      result.current_stage = 'threshold_2'
      result.current_multiplier = config.threshold_2.multiplier
      result.next_stage = 'threshold_3'
      result.next_streak = config.threshold_3.streak
    } else if (empty_streak >= config.threshold_1.streak) {
      result.current_stage = 'threshold_1'
      result.current_multiplier = config.threshold_1.multiplier
      result.next_stage = 'threshold_2'
      result.next_streak = config.threshold_2.streak
    } else if (empty_streak > 0) {
      result.next_stage = 'threshold_1'
      result.next_streak = config.threshold_1.streak
    }

    return result
  }

  /**
   * 获取配置信息
   *
   * @returns {Object} 当前 Pity 配置
   */
  getConfig() {
    return { ...this.pity_config }
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
      calculator: 'PityCalculator',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[PityCalculator] ${message}`, log_data)
    }
  }
}

// 导出常量
PityCalculator.PITY_RESULT = PITY_RESULT
PityCalculator.DEFAULT_PITY_CONFIG = DEFAULT_PITY_CONFIG

module.exports = PityCalculator
