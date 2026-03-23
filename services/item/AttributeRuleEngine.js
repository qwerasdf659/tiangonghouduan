/**
 * @file 物品实例属性规则引擎（静态、无状态）
 * @description 依据 ItemTemplate.meta.attribute_rules 生成随机品质分、花纹编号等实例属性
 */

'use strict'

const { logger } = require('../../utils/logger')

/**
 * 默认品质分档分布（当未配置 attribute_rules 但 meta 含 trade_cooldown_days 时的兼容回退）
 * @type {Array<{min:number,max:number,weight:number,grade:string}>}
 */
const DEFAULT_DISTRIBUTION = [
  { min: 0, max: 19.99, weight: 15, grade: '微瑕' },
  { min: 20, max: 49.99, weight: 35, grade: '普通' },
  { min: 50, max: 79.99, weight: 35, grade: '良好' },
  { min: 80, max: 94.99, weight: 13, grade: '精良' },
  { min: 95, max: 100, weight: 2, grade: '完美无瑕' }
]

/**
 * 物品模板属性规则引擎（静态类）
 */
class AttributeRuleEngine {
  /**
   * 主入口：读取模板 meta.attribute_rules，生成实例属性对象
   *
   * @param {Object} itemTemplate - ItemTemplate 实例（需含 meta）
   * @param {Object} [skuSpecValues={}] - SKU 规格快照（透传合并到结果）
   * @returns {Object} 含 quality_score、quality_grade、pattern_id 及 skuSpecValues 展开的扁平对象
   */
  static generate(itemTemplate, skuSpecValues = {}) {
    const meta =
      itemTemplate?.meta && typeof itemTemplate.meta === 'object' ? itemTemplate.meta : {}
    let rules = meta.attribute_rules

    if (rules == null && meta.trade_cooldown_days != null) {
      rules = {
        quality_score: {
          enabled: true,
          distribution: DEFAULT_DISTRIBUTION
        }
      }
    }

    if (rules == null || typeof rules !== 'object') {
      return { ...skuSpecValues }
    }

    const out = { ...skuSpecValues }

    if (rules.quality_score && typeof rules.quality_score === 'object') {
      const qs = AttributeRuleEngine.generateQualityScore(rules.quality_score)
      if (qs && typeof qs.quality_score === 'number') {
        out.quality_score = qs.quality_score
        out.quality_grade = qs.quality_grade
      }
    }

    if (rules.pattern_id && typeof rules.pattern_id === 'object') {
      const pid = AttributeRuleEngine.generatePatternId(rules.pattern_id)
      if (pid != null) {
        out.pattern_id = pid
      }
    }

    return out
  }

  /**
   * 按加权分档 + 档内均匀随机生成品质分
   *
   * @param {Object} config - attribute_rules.quality_score
   * @param {boolean} [config.enabled] - 是否启用
   * @param {Array} [config.distribution] - 分档定义
   * @returns {{quality_score:number,quality_grade:string}|{}} 未启用或无效时返回空对象
   */
  static generateQualityScore(config) {
    if (!config || config.enabled === false) {
      return {}
    }

    let distribution = config.distribution
    if (!Array.isArray(distribution) || distribution.length === 0) {
      distribution = DEFAULT_DISTRIBUTION
    }

    const tier = AttributeRuleEngine.selectWeightedTier(distribution)
    if (!tier) {
      logger.warn('AttributeRuleEngine.generateQualityScore: 分档选择失败，使用默认分布', {
        had_config_distribution: Array.isArray(config.distribution)
      })
      const fallback = AttributeRuleEngine.selectWeightedTier(DEFAULT_DISTRIBUTION)
      if (!fallback) return {}
      const score = AttributeRuleEngine.uniformRandom(fallback.min, fallback.max, 2)
      return { quality_score: score, quality_grade: fallback.grade || '' }
    }

    const qualityScore = AttributeRuleEngine.uniformRandom(tier.min, tier.max, 2)
    return {
      quality_score: qualityScore,
      quality_grade: tier.grade != null ? String(tier.grade) : ''
    }
  }

  /**
   * 在 [min,max] 内均匀随机整数花纹编号
   *
   * @param {Object} config - attribute_rules.pattern_id
   * @param {boolean} [config.enabled] - 是否启用
   * @param {number} [config.min] - 最小值
   * @param {number} [config.max] - 最大值
   * @returns {number|null} 花纹编号或 null
   */
  static generatePatternId(config) {
    if (!config || config.enabled === false) {
      return null
    }
    const min = Number(config.min)
    const max = Number(config.max)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      logger.warn('AttributeRuleEngine.generatePatternId: min/max 无效', {
        min: config.min,
        max: config.max
      })
      return null
    }
    return AttributeRuleEngine.uniformRandomInt(Math.floor(min), Math.floor(max))
  }

  /**
   * 加权随机选择一档（权重之和为总权重，随机数落点所在档）
   *
   * @param {Array} distribution - 权重分布数组（含 weight, min, max, grade 字段）
   * @returns {Object|null} 选中的档位或 null
   */
  static selectWeightedTier(distribution) {
    if (!Array.isArray(distribution) || distribution.length === 0) {
      return null
    }

    const totalWeight = distribution.reduce((sum, tier) => {
      const w = Number(tier.weight)
      return sum + (Number.isFinite(w) && w > 0 ? w : 0)
    }, 0)

    if (totalWeight <= 0) {
      return null
    }

    const r = Math.random() * totalWeight
    let acc = 0
    for (const tier of distribution) {
      const w = Number(tier.weight)
      const weight = Number.isFinite(w) && w > 0 ? w : 0
      acc += weight
      if (r < acc) {
        return tier
      }
    }

    return distribution[distribution.length - 1]
  }

  /**
   * [min,max] 均匀随机浮点数，保留指定位小数
   *
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @param {number} [decimals=2] - 小数位数
   * @returns {number} 随机浮点数
   */
  static uniformRandom(min, max, decimals = 2) {
    const lo = Number(min)
    const hi = Number(max)
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) {
      return 0
    }
    const v = lo + Math.random() * (hi - lo)
    return Number(v.toFixed(decimals))
  }

  /**
   * [min,max] 闭区间均匀随机整数
   *
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 随机整数
   */
  static uniformRandomInt(min, max) {
    const lo = Math.ceil(Number(min))
    const hi = Math.floor(Number(max))
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) {
      return lo
    }
    return lo + Math.floor(Math.random() * (hi - lo + 1))
  }
}

module.exports = AttributeRuleEngine
module.exports.DEFAULT_DISTRIBUTION = DEFAULT_DISTRIBUTION
