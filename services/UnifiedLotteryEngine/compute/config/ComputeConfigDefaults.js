'use strict'

/**
 * ComputeConfigDefaults - 策略引擎默认配置常量
 *
 * 所有静态默认配置集中管理：
 * - Budget Tier / Pressure Tier 阈值
 * - Pity / Luck Debt / Anti-Streak 参数
 * - 体验状态配置
 * - 同步工具函数（getFullConfig / getMatrixValue / isFeatureEnabled）
 *
 * @module services/UnifiedLotteryEngine/compute/config/ComputeConfigDefaults
 */

const BUDGET_ALLOCATION_RATIO = parseFloat(process.env.BUDGET_ALLOCATION_RATIO) || 0.22
const BUDGET_TIER_CONFIG = {
  threshold_high: Math.round(100 * BUDGET_ALLOCATION_RATIO * 5),
  threshold_mid: Math.round(100 * BUDGET_ALLOCATION_RATIO * 2),
  threshold_low: Math.round(100 * BUDGET_ALLOCATION_RATIO * 1),
  budget_allocation_ratio: BUDGET_ALLOCATION_RATIO
}

const BUDGET_TIER_AVAILABILITY = {
  B0: ['low', 'fallback'],
  B1: ['low', 'fallback'],
  B2: ['mid', 'low', 'fallback'],
  B3: ['high', 'mid', 'low', 'fallback']
}

const PRESSURE_TIER_CONFIG = {
  threshold_high: parseFloat(process.env.PRESSURE_TIER_THRESHOLD_HIGH) || 0.8,
  threshold_low: parseFloat(process.env.PRESSURE_TIER_THRESHOLD_LOW) || 0.5
}

const PRESSURE_MATRIX_FALLBACK = {
  P0: { cap_multiplier: 1.0, empty_weight_multiplier: 1.0 },
  P1: { cap_multiplier: 1.0, empty_weight_multiplier: 1.0 },
  P2: { cap_multiplier: 1.0, empty_weight_multiplier: 1.0 }
}

const PITY_CONFIG = {
  enabled: process.env.PITY_ENABLED !== 'false',
  soft_guarantee_threshold: parseInt(process.env.PITY_SOFT_THRESHOLD) || 5,
  hard_guarantee_threshold: parseInt(process.env.PITY_HARD_THRESHOLD) || 10,
  increment_per_empty: parseFloat(process.env.PITY_INCREMENT) || 5,
  max_boost_percentage: parseFloat(process.env.PITY_MAX_BOOST) || 50
}

const LUCK_DEBT_CONFIG = {
  enabled: process.env.LUCK_DEBT_ENABLED !== 'false',
  expected_empty_rate: parseFloat(process.env.LUCK_DEBT_EXPECTED_RATE) || 0.0,
  min_sample_size: parseInt(process.env.LUCK_DEBT_MIN_SAMPLE) || 20,
  level_thresholds: { high: 0.15, medium: 0.08, low: 0.03 },
  level_multipliers: { high: 1.3, medium: 1.15, low: 1.05, none: 1.0 }
}

const ANTI_EMPTY_CONFIG = {
  enabled: process.env.ANTI_EMPTY_ENABLED !== 'false',
  force_threshold: parseInt(process.env.ANTI_EMPTY_THRESHOLD) || 5,
  forced_min_tier: 'low'
}

const ANTI_HIGH_CONFIG = {
  enabled: process.env.ANTI_HIGH_ENABLED !== 'false',
  window_size: parseInt(process.env.ANTI_HIGH_WINDOW) || 10,
  high_count_threshold: parseInt(process.env.ANTI_HIGH_THRESHOLD) || 3,
  capped_max_tier: 'mid',
  high_tier_penalty: parseFloat(process.env.ANTI_HIGH_PENALTY) || 0.5
}

const EXPERIENCE_STATE_CONFIG = {
  high_value_tiers: ['high'],
  empty_tiers: ['empty'],
  recent_high_window: parseInt(process.env.EXPERIENCE_HIGH_WINDOW) || 10
}

/**
 * 解析环境变量中的逗号分隔整数数组
 * @param {string} env_value - 环境变量值
 * @returns {number[]} 解析后的整数数组
 */
function parseEnvArray(env_value) {
  if (!env_value) return []
  return env_value
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n))
}

/**
 * 获取所有策略引擎默认配置的完整副本
 * @returns {Object} 包含所有配置项的对象
 */
function getFullConfig() {
  return {
    budget_tier: BUDGET_TIER_CONFIG,
    budget_tier_availability: BUDGET_TIER_AVAILABILITY,
    pressure_tier: PRESSURE_TIER_CONFIG,
    pressure_matrix: PRESSURE_MATRIX_FALLBACK,
    pity: PITY_CONFIG,
    luck_debt: LUCK_DEBT_CONFIG,
    anti_empty: ANTI_EMPTY_CONFIG,
    anti_high: ANTI_HIGH_CONFIG,
    experience_state: EXPERIENCE_STATE_CONFIG
  }
}

/**
 * 根据压力等级获取对应的矩阵参数
 * @param {string} pressure_tier - 压力等级标识
 * @returns {Object} 包含 cap_multiplier 和 empty_weight_multiplier 的对象
 */
function getMatrixValue(pressure_tier) {
  const matrix_value = PRESSURE_MATRIX_FALLBACK[pressure_tier]
  if (!matrix_value) {
    return { cap_multiplier: 1.0, empty_weight_multiplier: 1.0 }
  }
  return matrix_value
}

/**
 * 检查指定功能特性是否全局启用
 * @param {string} feature - 功能名称（pity/luck_debt/anti_empty/anti_high）
 * @returns {boolean} 是否启用
 */
function isFeatureEnabled(feature) {
  switch (feature) {
    case 'pity': return PITY_CONFIG.enabled
    case 'luck_debt': return LUCK_DEBT_CONFIG.enabled
    case 'anti_empty': return ANTI_EMPTY_CONFIG.enabled
    case 'anti_high': return ANTI_HIGH_CONFIG.enabled
    default: return false
  }
}

module.exports = {
  BUDGET_ALLOCATION_RATIO,
  BUDGET_TIER_CONFIG,
  BUDGET_TIER_AVAILABILITY,
  PRESSURE_TIER_CONFIG,
  PRESSURE_MATRIX_FALLBACK,
  PITY_CONFIG,
  LUCK_DEBT_CONFIG,
  ANTI_EMPTY_CONFIG,
  ANTI_HIGH_CONFIG,
  EXPERIENCE_STATE_CONFIG,
  parseEnvArray,
  getFullConfig,
  getMatrixValue,
  isFeatureEnabled
}
