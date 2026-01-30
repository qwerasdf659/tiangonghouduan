'use strict'

/**
 * TierMatrixCalculator - BxPx 档位权重矩阵计算器
 *
 * 核心职责：
 * 1. 根据 Budget Tier (B0-B3) 和 Pressure Tier (P0-P2) 组合查询权重矩阵
 * 2. 计算最终的档位权重调整乘数
 * 3. 应用权重调整到基础档位权重
 *
 * 业务背景（来自方案文档）：
 * - Budget Tier：预算分层，决定用户可参与哪些档位
 * - Pressure Tier：活动压力分层，决定高价值奖品的发放速度调控
 * - BxPx 矩阵：两个维度的交叉组合，共 4*3=12 种场景
 *
 * 矩阵设计原则：
 * - B0（预算不足）：任何压力下都只能抽 fallback
 * - B3P0（高预算+宽松）：high 档位概率最高
 * - B3P2（高预算+紧张）：high 档位概率受限
 * - B1P2（低预算+紧张）：仅能抽 low/fallback，且 fallback 概率提高
 *
 * @module services/UnifiedLotteryEngine/compute/calculators/TierMatrixCalculator
 * @author 抽奖模块策略重构 - Phase 5
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')
const BudgetTierCalculator = require('./BudgetTierCalculator')
const PressureTierCalculator = require('./PressureTierCalculator')

const { BUDGET_TIER, TIER_AVAILABILITY } = BudgetTierCalculator
const { PRESSURE_TIER } = PressureTierCalculator

/**
 * 权重缩放比例（整数权重系统）
 * 与 TierPickStage 保持一致
 */
const WEIGHT_SCALE = 1000000

/**
 * BxPx 矩阵默认配置
 *
 * 矩阵格式：matrix[budget_tier][pressure_tier] = { high, mid, low, fallback }
 * 值含义：档位权重乘数（1.0 表示保持原权重，0.5 表示减半，2.0 表示翻倍）
 *
 * 设计原则：
 * - 行按 Budget Tier 分层（B0 到 B3）
 * - 列按 Pressure Tier 分层（P0 到 P2）
 * - B0 行：所有压力下都只有 fallback
 * - 压力越大（P2），high 乘数越低
 * - 预算越高（B3），high 乘数上限越高
 */
const DEFAULT_TIER_MATRIX = {
  // B0：预算不足，仅能抽 fallback
  [BUDGET_TIER.B0]: {
    [PRESSURE_TIER.P0]: { high: 0, mid: 0, low: 0, fallback: 1.0 },
    [PRESSURE_TIER.P1]: { high: 0, mid: 0, low: 0, fallback: 1.0 },
    [PRESSURE_TIER.P2]: { high: 0, mid: 0, low: 0, fallback: 1.0 }
  },

  // B1：低预算，可抽 low + fallback
  [BUDGET_TIER.B1]: {
    [PRESSURE_TIER.P0]: { high: 0, mid: 0, low: 1.2, fallback: 0.9 },
    [PRESSURE_TIER.P1]: { high: 0, mid: 0, low: 1.0, fallback: 1.0 },
    [PRESSURE_TIER.P2]: { high: 0, mid: 0, low: 0.8, fallback: 1.2 }
  },

  // B2：中预算，可抽 mid + low + fallback
  [BUDGET_TIER.B2]: {
    [PRESSURE_TIER.P0]: { high: 0, mid: 1.3, low: 1.1, fallback: 0.8 },
    [PRESSURE_TIER.P1]: { high: 0, mid: 1.0, low: 1.0, fallback: 1.0 },
    [PRESSURE_TIER.P2]: { high: 0, mid: 0.7, low: 1.1, fallback: 1.3 }
  },

  // B3：高预算，可抽所有档位
  [BUDGET_TIER.B3]: {
    [PRESSURE_TIER.P0]: { high: 1.5, mid: 1.2, low: 0.9, fallback: 0.7 },
    [PRESSURE_TIER.P1]: { high: 1.0, mid: 1.0, low: 1.0, fallback: 1.0 },
    [PRESSURE_TIER.P2]: { high: 0.6, mid: 0.8, low: 1.2, fallback: 1.5 }
  }
}

/**
 * BxPx 档位权重矩阵计算器
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
     * 矩阵配置
     * 可以通过 options.matrix 完全覆盖，或通过数据库加载动态配置
     */
    this.matrix = options.matrix || { ...DEFAULT_TIER_MATRIX }

    this.logger = logger
  }

  /**
   * 根据 Budget Tier 和 Pressure Tier 计算最终档位权重
   *
   * @param {Object} context - 计算上下文
   * @param {string} context.budget_tier - 预算分层（B0/B1/B2/B3）
   * @param {string} context.pressure_tier - 压力分层（P0/P1/P2）
   * @param {Object} context.base_weights - 基础档位权重
   * @returns {Object} 计算结果
   */
  calculate(context) {
    const { budget_tier, pressure_tier, base_weights } = context

    this._log('info', '开始计算 BxPx 矩阵权重', {
      budget_tier,
      pressure_tier
    })

    try {
      // 1. 查询矩阵乘数
      const multipliers = this._getMatrixMultipliers(budget_tier, pressure_tier)

      // 2. 计算调整后的权重
      const adjusted_weights = this._applyMultipliers(base_weights, multipliers)

      // 3. 获取该组合允许的档位
      const available_tiers = TIER_AVAILABILITY[budget_tier] || ['fallback']

      // 4. 过滤禁用档位的权重（设为 0）
      const filtered_weights = this._filterByAvailability(adjusted_weights, available_tiers)

      // 5. 确保权重总和为 WEIGHT_SCALE（归一化）
      const normalized_weights = this._normalizeWeights(filtered_weights)

      const result = {
        budget_tier,
        pressure_tier,
        matrix_key: `${budget_tier}x${pressure_tier}`,
        multipliers,
        base_weights,
        adjusted_weights,
        available_tiers,
        final_weights: normalized_weights,
        weight_scale: WEIGHT_SCALE,
        timestamp: new Date().toISOString()
      }

      this._log('info', 'BxPx 矩阵权重计算完成', {
        budget_tier,
        pressure_tier,
        matrix_key: result.matrix_key,
        final_weights: normalized_weights
      })

      return result
    } catch (error) {
      this._log('error', 'BxPx 矩阵权重计算失败', {
        budget_tier,
        pressure_tier,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取矩阵乘数
   *
   * @param {string} budget_tier - 预算分层
   * @param {string} pressure_tier - 压力分层
   * @returns {Object} 乘数配置 { high, mid, low, fallback }
   * @private
   */
  _getMatrixMultipliers(budget_tier, pressure_tier) {
    // 验证 Budget Tier
    if (!this.matrix[budget_tier]) {
      this._log('warn', '未知的 Budget Tier，使用 B0', { budget_tier })
      budget_tier = BUDGET_TIER.B0
    }

    // 验证 Pressure Tier
    if (!this.matrix[budget_tier][pressure_tier]) {
      this._log('warn', '未知的 Pressure Tier，使用 P1', { pressure_tier })
      pressure_tier = PRESSURE_TIER.P1
    }

    const multipliers = this.matrix[budget_tier][pressure_tier]

    this._log('debug', '获取矩阵乘数', {
      budget_tier,
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

    // 安全检查：如果 base_weights 为空，使用默认的 fallback 权重
    const safe_base_weights = base_weights || { high: 0, mid: 0, low: 0, fallback: WEIGHT_SCALE }
    const safe_multipliers = multipliers || { high: 0, mid: 0, low: 0, fallback: 1 }

    for (const tier of ['high', 'mid', 'low', 'fallback']) {
      const base = safe_base_weights[tier] || 0
      const multiplier = safe_multipliers[tier] || 0
      adjusted[tier] = Math.round(base * multiplier)
    }

    return adjusted
  }

  /**
   * 根据可用档位过滤权重
   *
   * 不可用的档位权重设为 0
   *
   * @param {Object} weights - 权重
   * @param {Array} available_tiers - 可用档位列表
   * @returns {Object} 过滤后的权重
   * @private
   */
  _filterByAvailability(weights, available_tiers) {
    const filtered = {}

    for (const tier of ['high', 'mid', 'low', 'fallback']) {
      if (available_tiers.includes(tier)) {
        filtered[tier] = weights[tier] || 0
      } else {
        filtered[tier] = 0
      }
    }

    return filtered
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

    // 如果总权重为 0，返回 fallback = WEIGHT_SCALE
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

    // fallback 使用剩余权重，确保总和精确等于 WEIGHT_SCALE
    normalized.fallback = WEIGHT_SCALE - accumulated

    return normalized
  }

  /**
   * 更新矩阵配置
   *
   * 支持运行时动态更新矩阵配置
   *
   * @param {Object} new_matrix - 新的矩阵配置
   * @returns {void}
   */
  updateMatrix(new_matrix) {
    if (!new_matrix || typeof new_matrix !== 'object') {
      this._log('error', '无效的矩阵配置', { new_matrix })
      throw new Error('无效的矩阵配置')
    }

    this.matrix = { ...DEFAULT_TIER_MATRIX, ...new_matrix }
    this._log('info', '矩阵配置已更新', {
      budget_tiers: Object.keys(this.matrix)
    })
  }

  /**
   * 从数据库加载矩阵配置
   *
   * 实现逻辑（P0修复 - 2026-01-30）：
   * 1. 调用 LotteryTierMatrixConfig.getFullMatrix() 获取数据库配置
   * 2. 将数据库字段映射到计算器内部格式（high_multiplier → high）
   * 3. 如果数据库无配置，回退到默认矩阵
   *
   * @param {number} campaign_id - 活动ID（可选，用于活动级配置，预留扩展）
   * @param {Object} _options - 额外选项（预留扩展）
   * @returns {Promise<Object>} 加载的矩阵配置
   */
  async loadFromDatabase(campaign_id = null, _options = {}) {
    try {
      // 动态引入模型（避免循环依赖）
      const { LotteryTierMatrixConfig } = require('../../../../models')

      // 从数据库获取完整矩阵配置
      const db_matrix = await LotteryTierMatrixConfig.getFullMatrix()

      // 检查数据库是否有配置
      if (!db_matrix || Object.keys(db_matrix).length === 0) {
        this._log('warn', '数据库无矩阵配置，使用默认配置', { campaign_id })
        return this.matrix
      }

      /*
       * 将数据库配置映射到计算器内部格式
       * 数据库字段：high_multiplier, mid_multiplier, low_multiplier, fallback_multiplier
       * 内部格式：high, mid, low, fallback
       */
      for (const [budget_tier, pressure_configs] of Object.entries(db_matrix)) {
        if (!this.matrix[budget_tier]) {
          this.matrix[budget_tier] = {}
        }

        for (const [pressure_tier, db_values] of Object.entries(pressure_configs)) {
          this.matrix[budget_tier][pressure_tier] = {
            high: db_values.high_multiplier,
            mid: db_values.mid_multiplier,
            low: db_values.low_multiplier,
            fallback: db_values.fallback_multiplier
          }
        }
      }

      // 统计加载的配置数量
      const config_count = Object.values(db_matrix).reduce(
        (sum, pressure_configs) => sum + Object.keys(pressure_configs).length,
        0
      )

      this._log('info', '从数据库加载矩阵配置成功', {
        campaign_id,
        config_count,
        budget_tiers: Object.keys(db_matrix)
      })

      return this.matrix
    } catch (error) {
      // 加载失败时回退到默认配置，不影响业务流程
      this._log('error', '加载矩阵配置失败，使用默认配置', {
        campaign_id,
        error: error.message
      })
      return this.matrix
    }
  }

  /**
   * 获取所有可能的 BxPx 组合
   *
   * @returns {Array} 所有组合的列表
   */
  getAllCombinations() {
    const combinations = []

    for (const budget_tier of Object.values(BUDGET_TIER)) {
      for (const pressure_tier of Object.values(PRESSURE_TIER)) {
        const multipliers = this._getMatrixMultipliers(budget_tier, pressure_tier)
        combinations.push({
          budget_tier,
          pressure_tier,
          matrix_key: `${budget_tier}x${pressure_tier}`,
          multipliers,
          available_tiers: TIER_AVAILABILITY[budget_tier]
        })
      }
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

// 导出常量
TierMatrixCalculator.DEFAULT_MATRIX = DEFAULT_TIER_MATRIX
TierMatrixCalculator.WEIGHT_SCALE = WEIGHT_SCALE

module.exports = TierMatrixCalculator
