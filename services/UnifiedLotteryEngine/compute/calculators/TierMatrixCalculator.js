'use strict'

/**
 * TierMatrixCalculator - Pressure-Only 档位权重矩阵计算器
 *
 * 核心职责：
 * 1. 根据 Pressure Tier (P0-P2) 查询权重矩阵（不再使用 Budget Tier 维度）
 * 2. 计算最终的档位权重调整乘数（high/mid/low/fallback + cap/empty 共 6 字段）
 * 3. 应用权重调整到基础档位权重
 *
 * 2026-03-04 架构重构：
 * - Budget Tier 降级为纯监控指标，不再参与概率决策
 * - 矩阵从 4×3（B0-B3 × P0-P2）简化为 1×3（仅 P0/P1/P2）
 * - 资格控制由 BuildPrizePoolStage._filterByResourceEligibility 唯一负责
 * - 此计算器统一管理全部 6 个乘数字段（合并原 ComputeConfig.TIER_MATRIX_CONFIG）
 *
 * Pressure Tier 设计原则：
 * - P0（低压）：活动消耗慢，高档概率略提，吸引参与
 * - P1（中压）：正常速度，保持原始权重
 * - P2（高压）：消耗快，压低高档，保护剩余库存
 *
 * @module services/UnifiedLotteryEngine/compute/calculators/TierMatrixCalculator
 * @author 抽奖模块策略重构
 * @since 2026
 */

const { logger } = require('../../../../utils/logger')
const PressureTierCalculator = require('./PressureTierCalculator')
const { LotteryTierMatrixConfig } = require('../../../../models')

const { PRESSURE_TIER } = PressureTierCalculator

/**
 * 权重缩放比例（整数权重系统）
 * 与 TierPickStage 保持一致
 */
const WEIGHT_SCALE = 1000000

/**
 * Pressure-Only 矩阵默认配置（DB 不可用时的兜底）
 *
 * 矩阵格式：matrix[pressure_tier] = { high, mid, low, fallback, cap, empty }
 * 值含义：档位权重乘数（1.0 表示保持原权重，0.5 表示减半，2.0 表示翻倍）
 *
 * @type {Object<string, {high: number, mid: number, low: number, fallback: number, cap: number, empty: number}>}
 */
const DEFAULT_PRESSURE_MATRIX = {
  /** P0：低压 — 高档概率略提，吸引参与 */
  [PRESSURE_TIER.P0]: { high: 1.3, mid: 1.1, low: 0.9, fallback: 0.8, cap: 1.0, empty: 1.0 },
  /** P1：中压 — 保持原始权重 */
  [PRESSURE_TIER.P1]: { high: 1.0, mid: 1.0, low: 1.0, fallback: 1.0, cap: 1.0, empty: 1.0 },
  /** P2：高压 — 压低高档，提高低档，保护库存 */
  [PRESSURE_TIER.P2]: { high: 0.6, mid: 0.8, low: 1.2, fallback: 1.5, cap: 1.0, empty: 1.0 }
}

/**
 * Pressure-Only 档位权重矩阵计算器
 */
class TierMatrixCalculator {
  /**
   * 创建计算器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.matrix - 自定义矩阵配置（可选）
   */
  constructor(options = {}) {
    /**
     * 矩阵配置（Pressure-Only 结构）
     * 可以通过 options.matrix 完全覆盖，或通过数据库加载动态配置
     */
    this.matrix = options.matrix || { ...DEFAULT_PRESSURE_MATRIX }

    this.logger = logger
  }

  /**
   * 根据 Pressure Tier 计算最终档位权重
   *
   * @param {Object} context - 计算上下文
   * @param {string} context.pressure_tier - 压力分层（P0/P1/P2）
   * @param {Object} context.base_weights - 基础档位权重
   * @returns {Object} 计算结果（包含 final_weights、multipliers 等）
   */
  calculate(context) {
    const { pressure_tier, base_weights } = context

    this._log('info', '开始计算 Pressure 矩阵权重', {
      pressure_tier
    })

    try {
      // 1. 查询矩阵乘数
      const multipliers = this._getMatrixMultipliers(pressure_tier)

      // 2. 计算调整后的权重
      const adjusted_weights = this._applyMultipliers(base_weights, multipliers)

      // 3. 确保权重总和为 WEIGHT_SCALE（归一化）
      const normalized_weights = this._normalizeWeights(adjusted_weights)

      const result = {
        pressure_tier,
        matrix_key: pressure_tier,
        multipliers,
        base_weights,
        adjusted_weights,
        final_weights: normalized_weights,
        weight_scale: WEIGHT_SCALE,
        timestamp: new Date().toISOString()
      }

      this._log('info', 'Pressure 矩阵权重计算完成', {
        pressure_tier,
        matrix_key: result.matrix_key,
        final_weights: normalized_weights
      })

      return result
    } catch (error) {
      this._log('error', 'Pressure 矩阵权重计算失败', {
        pressure_tier,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取矩阵乘数（全部 6 字段：high/mid/low/fallback + cap/empty）
   *
   * @param {string} pressure_tier - 压力分层
   * @returns {Object} 乘数配置 { high, mid, low, fallback, cap, empty }
   * @private
   */
  _getMatrixMultipliers(pressure_tier) {
    if (!this.matrix[pressure_tier]) {
      this._log('warn', '未知的 Pressure Tier，使用 P1', { pressure_tier })
      pressure_tier = PRESSURE_TIER.P1
    }

    const multipliers = this.matrix[pressure_tier]

    this._log('debug', '获取矩阵乘数', {
      pressure_tier,
      multipliers
    })

    return { ...multipliers }
  }

  /**
   * 应用乘数到基础权重
   *
   * @param {Object} base_weights - 基础权重 { high, mid, low, fallback }
   * @param {Object} multipliers - 乘数 { high, mid, low, fallback }
   * @returns {Object} 调整后的权重
   * @private
   */
  _applyMultipliers(base_weights, multipliers) {
    const adjusted = {}

    const safe_base_weights = base_weights || { high: 0, mid: 0, low: 0, fallback: WEIGHT_SCALE }
    const safe_multipliers = multipliers || { high: 1, mid: 1, low: 1, fallback: 1 }

    for (const tier of ['high', 'mid', 'low', 'fallback']) {
      const base = safe_base_weights[tier] || 0
      const multiplier = safe_multipliers[tier] || 0
      adjusted[tier] = Math.round(base * multiplier)
    }

    return adjusted
  }

  /**
   * 归一化权重到 WEIGHT_SCALE
   *
   * 确保所有权重之和等于 WEIGHT_SCALE
   *
   * @param {Object} weights - 权重
   * @returns {Object} 归一化后的权重
   * @private
   */
  _normalizeWeights(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0)

    if (total === 0) {
      return {
        high: 0,
        mid: 0,
        low: 0,
        fallback: WEIGHT_SCALE
      }
    }

    const normalized = {}
    let accumulated = 0

    for (const tier of ['high', 'mid', 'low']) {
      const proportion = weights[tier] / total
      normalized[tier] = Math.round(proportion * WEIGHT_SCALE)
      accumulated += normalized[tier]
    }

    normalized.fallback = WEIGHT_SCALE - accumulated

    return normalized
  }

  /**
   * 更新矩阵配置
   *
   * @param {Object} new_matrix - 新的矩阵配置（Pressure-Only 结构）
   * @returns {void}
   */
  updateMatrix(new_matrix) {
    if (!new_matrix || typeof new_matrix !== 'object') {
      this._log('error', '无效的矩阵配置', { new_matrix })
      throw new Error('无效的矩阵配置')
    }

    this.matrix = { ...DEFAULT_PRESSURE_MATRIX, ...new_matrix }
    this._log('info', '矩阵配置已更新', {
      pressure_tiers: Object.keys(this.matrix)
    })
  }

  /**
   * 从数据库加载矩阵配置
   *
   * 三层优先级：DB → 环境变量 → DEFAULT_PRESSURE_MATRIX 硬编码兜底
   *
   * @param {number} lottery_campaign_id - 活动ID（可选，用于活动级配置）
   * @param {Object} _options - 额外选项（预留扩展）
   * @returns {Promise<Object>} 加载的矩阵配置
   */
  async loadFromDatabase(lottery_campaign_id = null, _options = {}) {
    try {
      const db_matrix = await LotteryTierMatrixConfig.getFullMatrix(lottery_campaign_id)

      if (!db_matrix || Object.keys(db_matrix).length === 0) {
        this._log('warn', '数据库无矩阵配置，使用默认配置', { lottery_campaign_id })
        return this.matrix
      }

      /*
       * 将数据库配置映射到计算器内部格式
       * DB 字段：high_multiplier → 内部：high（同理 mid/low/fallback/cap/empty）
       */
      for (const [pressure_tier, db_values] of Object.entries(db_matrix)) {
        this.matrix[pressure_tier] = {
          high: db_values.high_multiplier,
          mid: db_values.mid_multiplier,
          low: db_values.low_multiplier,
          fallback: db_values.fallback_multiplier,
          cap: db_values.cap_multiplier,
          empty: db_values.empty_weight_multiplier
        }
      }

      const config_count = Object.keys(db_matrix).length

      this._log('info', '从数据库加载矩阵配置成功', {
        lottery_campaign_id,
        config_count,
        pressure_tiers: Object.keys(db_matrix)
      })

      return this.matrix
    } catch (error) {
      this._log('error', '加载矩阵配置失败，使用默认配置', {
        lottery_campaign_id,
        error: error.message
      })
      return this.matrix
    }
  }

  /**
   * 获取所有 Pressure Tier 组合（用于诊断）
   *
   * @returns {Array} 所有组合的列表
   */
  getAllCombinations() {
    const combinations = []

    for (const pressure_tier of Object.values(PRESSURE_TIER)) {
      const multipliers = this._getMatrixMultipliers(pressure_tier)
      combinations.push({
        pressure_tier,
        matrix_key: pressure_tier,
        multipliers
      })
    }

    return combinations
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
      calculator: 'TierMatrixCalculator',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[TierMatrixCalculator] ${message}`, log_data)
    }
  }
}

TierMatrixCalculator.DEFAULT_MATRIX = DEFAULT_PRESSURE_MATRIX
TierMatrixCalculator.WEIGHT_SCALE = WEIGHT_SCALE

module.exports = TierMatrixCalculator
