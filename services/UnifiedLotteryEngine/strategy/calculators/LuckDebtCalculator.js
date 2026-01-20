'use strict'

/**
 * LuckDebtCalculator - 运气债务计算器
 *
 * 核心职责：
 * 1. 计算用户历史空奖率与系统期望值的偏离程度
 * 2. 根据偏离程度确定运气债务等级（none/low/medium/high）
 * 3. 返回补偿乘数，用于提升"欠运"用户的非空奖概率
 *
 * 业务背景（来自方案文档 5.6 + 决策6）：
 * - 长期视角：跨活动统计用户历史空奖率
 * - 公平性保障：历史空奖率过高的用户获得概率补偿
 * - 轻量调整：补偿乘数较小（1.05-1.25），避免破坏活动平衡
 *
 * 运气债务等级和乘数（可配置）：
 * - none: 偏离 <= 5%，乘数 1.0（无补偿）
 * - low: 偏离 5%-10%，乘数 1.05
 * - medium: 偏离 10%-15%，乘数 1.15
 * - high: 偏离 > 15%，乘数 1.25
 *
 * 集成点：
 * - BuildPrizePoolStage / TierPickStage：调用 calculate() 获取补偿乘数
 * - StrategyEngine.getLuckDebtMultiplier()：通过 Facade 调用
 * - LotteryUserGlobalState 模型：数据来源
 *
 * @module services/UnifiedLotteryEngine/strategy/calculators/LuckDebtCalculator
 * @author 抽奖模块策略重构 - Phase 10
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')

/**
 * 运气债务等级常量
 * @enum {string}
 */
const LUCK_DEBT_LEVEL = {
  /** 无债务：空奖率接近期望值 */
  NONE: 'none',
  /** 低债务：空奖率略高于期望值 */
  LOW: 'low',
  /** 中债务：空奖率明显高于期望值 */
  MEDIUM: 'medium',
  /** 高债务：空奖率严重高于期望值 */
  HIGH: 'high'
}

/**
 * 默认运气债务配置
 * 基于方案文档设计
 */
const DEFAULT_LUCK_DEBT_CONFIG = {
  /**
   * 系统期望空奖率
   * 用于计算用户实际空奖率与期望值的偏离
   */
  expected_empty_rate: 0.3,

  /**
   * 最小抽奖次数
   * 用户抽奖次数低于此值时不计算运气债务（样本量不足）
   */
  min_draw_count: 10,

  /**
   * 债务等级阈值配置
   * deviation = 用户空奖率 - 期望空奖率
   */
  thresholds: {
    /** 低债务阈值：偏离 5%-10% */
    low: {
      min_deviation: 0.05,
      max_deviation: 0.1,
      multiplier: 1.05,
      description: '偏离5%-10%：权重提升5%'
    },
    /** 中债务阈值：偏离 10%-15% */
    medium: {
      min_deviation: 0.1,
      max_deviation: 0.15,
      multiplier: 1.15,
      description: '偏离10%-15%：权重提升15%'
    },
    /** 高债务阈值：偏离 > 15% */
    high: {
      min_deviation: 0.15,
      max_deviation: Infinity,
      multiplier: 1.25,
      description: '偏离>15%：权重提升25%'
    }
  },

  /**
   * 债务衰减系数
   * 长期不活跃用户的债务会逐步衰减
   * 衰减公式：effective_multiplier = 1 + (multiplier - 1) * decay_factor
   */
  decay_enabled: false, // 暂不启用衰减机制
  decay_days: 30 // 30天未抽奖开始衰减
}

/**
 * 运气债务计算器
 */
class LuckDebtCalculator {
  /**
   * 创建计算器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.luck_debt_config - 自定义运气债务配置（可选）
   */
  constructor(options = {}) {
    /**
     * 运气债务配置
     * 支持外部覆盖，用于 A/B 测试或特殊活动
     */
    this.config = {
      ...DEFAULT_LUCK_DEBT_CONFIG,
      ...options.luck_debt_config
    }

    // 合并阈值配置
    if (options.luck_debt_config?.thresholds) {
      this.config.thresholds = {
        ...DEFAULT_LUCK_DEBT_CONFIG.thresholds,
        ...options.luck_debt_config.thresholds
      }
    }

    this.logger = logger
  }

  /**
   * 计算运气债务效果
   *
   * 主入口方法，根据用户全局状态计算运气债务补偿
   *
   * @param {Object} context - 计算上下文
   * @param {Object} context.global_state - 用户全局状态（来自 LotteryUserGlobalState）
   * @param {number} context.global_state.global_draw_count - 全局抽奖次数
   * @param {number} context.global_state.global_empty_count - 全局空奖次数
   * @param {number} context.global_state.historical_empty_rate - 历史空奖率（可选，会自动计算）
   * @param {Date} context.global_state.last_draw_at - 最后抽奖时间（可选，用于衰减计算）
   * @param {number} context.user_id - 用户ID（用于日志）
   * @param {boolean} context.enabled - 是否启用运气债务（默认 true）
   * @returns {Object} 计算结果
   *
   * @example
   * 返回结果格式：
   * {
   *   debt_level: 'medium',          // 债务等级
   *   multiplier: 1.15,              // 补偿乘数
   *   historical_empty_rate: 0.42,   // 用户历史空奖率
   *   expected_empty_rate: 0.30,     // 系统期望空奖率
   *   deviation: 0.12,               // 偏离值
   *   global_draw_count: 50,         // 全局抽奖次数
   *   global_empty_count: 21,        // 全局空奖次数
   *   debt_enabled: true,            // 是否启用运气债务
   *   sample_sufficient: true,       // 样本是否充足
   *   decay_applied: false           // 是否应用了衰减
   * }
   */
  calculate(context) {
    const { global_state, user_id, enabled = true } = context

    this._log('debug', '开始计算运气债务', { user_id })

    // 初始化结果对象
    const result = {
      debt_level: LUCK_DEBT_LEVEL.NONE,
      multiplier: 1.0,
      historical_empty_rate: 0,
      expected_empty_rate: this.config.expected_empty_rate,
      deviation: 0,
      global_draw_count: 0,
      global_empty_count: 0,
      debt_enabled: enabled,
      sample_sufficient: false,
      decay_applied: false
    }

    // 未启用运气债务
    if (!enabled) {
      this._log('debug', '运气债务未启用', { user_id })
      return result
    }

    // 无全局状态数据
    if (!global_state) {
      this._log('debug', '无全局状态数据，跳过运气债务计算', { user_id })
      return result
    }

    // 提取全局统计数据
    const global_draw_count = global_state.global_draw_count || 0
    const global_empty_count = global_state.global_empty_count || 0

    result.global_draw_count = global_draw_count
    result.global_empty_count = global_empty_count

    // 样本量检查
    if (global_draw_count < this.config.min_draw_count) {
      this._log('debug', '样本量不足，跳过运气债务计算', {
        user_id,
        global_draw_count,
        min_draw_count: this.config.min_draw_count
      })
      return result
    }

    result.sample_sufficient = true

    // 计算历史空奖率
    const historical_empty_rate = this._calculateHistoricalEmptyRate(
      global_draw_count,
      global_empty_count
    )
    result.historical_empty_rate = historical_empty_rate

    // 计算偏离值
    const deviation = historical_empty_rate - this.config.expected_empty_rate
    result.deviation = deviation

    // 只有正向偏离（空奖率高于期望）才产生债务
    if (deviation <= 0) {
      this._log('debug', '用户空奖率低于期望值，无运气债务', {
        user_id,
        historical_empty_rate,
        expected_empty_rate: this.config.expected_empty_rate,
        deviation
      })
      return result
    }

    // 确定债务等级和乘数
    const debt_info = this._determineLuckDebtLevel(deviation)
    result.debt_level = debt_info.level
    result.multiplier = debt_info.multiplier

    // 应用衰减（如果启用）
    if (this.config.decay_enabled && global_state.last_draw_at) {
      const decayed = this._applyDecay(debt_info.multiplier, global_state.last_draw_at)
      if (decayed.applied) {
        result.multiplier = decayed.multiplier
        result.decay_applied = true
      }
    }

    this._log('info', '运气债务计算完成', {
      user_id,
      debt_level: result.debt_level,
      multiplier: result.multiplier,
      historical_empty_rate,
      deviation
    })

    return result
  }

  /**
   * 计算历史空奖率
   *
   * @param {number} draw_count - 总抽奖次数
   * @param {number} empty_count - 空奖次数
   * @returns {number} 空奖率（0.0 - 1.0）
   * @private
   */
  _calculateHistoricalEmptyRate(draw_count, empty_count) {
    if (draw_count <= 0) return 0
    return empty_count / draw_count
  }

  /**
   * 确定运气债务等级
   *
   * @param {number} deviation - 空奖率偏离值
   * @returns {{ level: string, multiplier: number }} 债务等级和乘数
   * @private
   */
  _determineLuckDebtLevel(deviation) {
    const thresholds = this.config.thresholds

    // 从高到低检查阈值
    if (deviation >= thresholds.high.min_deviation) {
      return {
        level: LUCK_DEBT_LEVEL.HIGH,
        multiplier: thresholds.high.multiplier
      }
    }

    if (deviation >= thresholds.medium.min_deviation) {
      return {
        level: LUCK_DEBT_LEVEL.MEDIUM,
        multiplier: thresholds.medium.multiplier
      }
    }

    if (deviation >= thresholds.low.min_deviation) {
      return {
        level: LUCK_DEBT_LEVEL.LOW,
        multiplier: thresholds.low.multiplier
      }
    }

    return {
      level: LUCK_DEBT_LEVEL.NONE,
      multiplier: 1.0
    }
  }

  /**
   * 应用衰减系数
   *
   * 长期不活跃用户的债务会逐步衰减
   *
   * @param {number} multiplier - 原始乘数
   * @param {Date|string} last_draw_at - 最后抽奖时间
   * @returns {{ multiplier: number, applied: boolean }} 衰减后的乘数
   * @private
   */
  _applyDecay(multiplier, last_draw_at) {
    if (!last_draw_at) {
      return { multiplier, applied: false }
    }

    const last_draw_date = new Date(last_draw_at)
    const now = new Date()
    const days_since_last_draw = Math.floor((now - last_draw_date) / (1000 * 60 * 60 * 24))

    // 未超过衰减天数
    if (days_since_last_draw < this.config.decay_days) {
      return { multiplier, applied: false }
    }

    // 计算衰减因子（每超过 30 天衰减 10%）
    const decay_periods = Math.floor((days_since_last_draw - this.config.decay_days) / 30)
    const decay_factor = Math.pow(0.9, decay_periods + 1)

    // 应用衰减：effective_multiplier = 1 + (multiplier - 1) * decay_factor
    const decayed_multiplier = 1 + (multiplier - 1) * decay_factor

    this._log('debug', '应用运气债务衰减', {
      original_multiplier: multiplier,
      days_since_last_draw,
      decay_factor,
      decayed_multiplier
    })

    return {
      multiplier: decayed_multiplier,
      applied: true
    }
  }

  /**
   * 调整档位权重（便捷方法）
   *
   * 根据运气债务乘数调整非空奖档位权重
   *
   * @param {Object} tier_weights - 原始档位权重
   * @param {number} multiplier - 运气债务乘数
   * @returns {Object} 调整后的权重
   */
  adjustWeights(tier_weights, multiplier) {
    if (!multiplier || multiplier <= 1.0) {
      return { ...tier_weights }
    }

    const adjusted = { ...tier_weights }
    const non_empty_tiers = ['high', 'mid', 'low']

    // 提升非空奖档位权重
    for (const tier of non_empty_tiers) {
      if (adjusted[tier] !== undefined && adjusted[tier] > 0) {
        adjusted[tier] = Math.round(adjusted[tier] * multiplier)
      }
    }

    return adjusted
  }

  /**
   * 从全局状态模型实例计算运气债务
   *
   * 便捷方法，直接使用 LotteryUserGlobalState 模型实例
   *
   * @param {Object} global_state_model - LotteryUserGlobalState 模型实例
   * @param {Object} options - 选项
   * @returns {Object} 计算结果
   */
  calculateFromModel(global_state_model, options = {}) {
    if (!global_state_model) {
      return this.calculate({ global_state: null, ...options })
    }

    // 从模型实例提取数据
    const global_state = {
      global_draw_count: global_state_model.global_draw_count,
      global_empty_count: global_state_model.global_empty_count,
      historical_empty_rate: global_state_model.historical_empty_rate,
      last_draw_at: global_state_model.last_draw_at
    }

    return this.calculate({ global_state, ...options })
  }

  /**
   * 获取用户的债务状态描述
   *
   * 用于前端展示或调试
   *
   * @param {Object} global_state - 用户全局状态
   * @returns {Object} 债务状态描述
   */
  getDebtStatus(global_state) {
    const result = this.calculate({ global_state, enabled: true })

    const descriptions = {
      [LUCK_DEBT_LEVEL.NONE]: '运气正常',
      [LUCK_DEBT_LEVEL.LOW]: '稍有欠运，概率略有提升',
      [LUCK_DEBT_LEVEL.MEDIUM]: '运气偏低，概率有所提升',
      [LUCK_DEBT_LEVEL.HIGH]: '运气较差，概率大幅提升'
    }

    return {
      ...result,
      description: descriptions[result.debt_level] || '未知状态',
      boost_percentage: Math.round((result.multiplier - 1) * 100)
    }
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
      calculator: 'LuckDebtCalculator',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[LuckDebtCalculator] ${message}`, log_data)
    }
  }
}

// 导出常量
LuckDebtCalculator.LUCK_DEBT_LEVEL = LUCK_DEBT_LEVEL
LuckDebtCalculator.DEFAULT_LUCK_DEBT_CONFIG = DEFAULT_LUCK_DEBT_CONFIG

module.exports = LuckDebtCalculator
