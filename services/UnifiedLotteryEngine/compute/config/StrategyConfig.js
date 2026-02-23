'use strict'

const { logger } = require('../../../../utils/logger')

/**
 * StrategyConfig - 抽奖策略引擎配置
 *
 * 集中管理所有策略相关的配置参数，包括：
 * - Budget Tier 阈值配置
 * - Pressure Tier 阈值配置
 * - BxPx 矩阵配置
 * - Pity 系统配置
 * - Luck Debt 运气债务配置
 * - Anti-Streak 防连续机制配置
 *
 * 设计原则：
 * - 配置与代码分离，便于调整和测试
 * - 支持运行时动态加载配置（从数据库或环境变量）
 * - 提供合理的默认值，确保系统稳定运行
 *
 * 配置层级：
 * 1. 默认配置（本文件定义）
 * 2. 环境变量覆盖（可选）
 * 3. 数据库配置覆盖（lottery_budget_tier_config / lottery_tier_matrix_config）
 *
 * @module services/UnifiedLotteryEngine/compute/config/StrategyConfig
 * @author 抽奖模块策略重构
 * @since 2026-01-20
 */

/**
 * Budget Tier 预算分层阈值配置
 *
 * 根据用户 EffectiveBudget 划分预算层级：
 * - B0: effective_budget < threshold_low（仅 fallback）
 * - B1: threshold_low <= effective_budget < threshold_mid（low + fallback）
 * - B2: threshold_mid <= effective_budget < threshold_high（mid + low + fallback）
 * - B3: effective_budget >= threshold_high（all tiers）
 *
 * @type {Object}
 */
const BUDGET_TIER_CONFIG = {
  /**
   * B3 阈值：预算 >= 此值可抽所有档位（包括 high）
   * 默认 1000 积分
   */
  threshold_high: parseInt(process.env.BUDGET_TIER_THRESHOLD_HIGH) || 1000,

  /**
   * B2 阈值：预算 >= 此值可抽 mid + low + fallback
   * 默认 500 积分
   */
  threshold_mid: parseInt(process.env.BUDGET_TIER_THRESHOLD_MID) || 500,

  /**
   * B1 阈值：预算 >= 此值可抽 low + fallback
   * 默认 100 积分
   */
  threshold_low: parseInt(process.env.BUDGET_TIER_THRESHOLD_LOW) || 100
}

/**
 * Budget Tier 允许的档位映射
 *
 * 定义每个 Budget Tier 可以参与的奖品档位
 *
 * @type {Object<string, string[]>}
 */
const BUDGET_TIER_AVAILABILITY = {
  B0: ['fallback'],
  B1: ['low', 'fallback'],
  B2: ['mid', 'low', 'fallback'],
  B3: ['high', 'mid', 'low', 'fallback']
}

/**
 * Pressure Tier 活动压力分层阈值配置
 *
 * 根据 pressure_index = actual_consumption / expected_consumption 划分：
 * - P0: pressure_index < threshold_low（低压：消耗慢，可以宽松）
 * - P1: threshold_low <= pressure_index < threshold_high（中压：正常）
 * - P2: pressure_index >= threshold_high（高压：消耗快，需要收紧）
 *
 * @type {Object}
 */
const PRESSURE_TIER_CONFIG = {
  /**
   * P2 阈值：压力指数 >= 此值为高压
   * 默认 0.8（80%）
   */
  threshold_high: parseFloat(process.env.PRESSURE_TIER_THRESHOLD_HIGH) || 0.8,

  /**
   * P1 阈值：压力指数 >= 此值为中压
   * 默认 0.5（50%）
   */
  threshold_low: parseFloat(process.env.PRESSURE_TIER_THRESHOLD_LOW) || 0.5
}

/**
 * BxPx 矩阵配置
 *
 * 定义 Budget Tier（Bx）和 Pressure Tier（Px）组合下的：
 * - cap_multiplier：预算上限乘数（相对于 EffectiveBudget）
 * - empty_weight_multiplier：空奖权重乘数（调整 fallback 概率）
 *
 * 矩阵解读：
 * - multiplier < 1.0：抑制空奖（提高非空奖概率）
 * - multiplier = 1.0：保持原权重
 * - multiplier > 1.0：增强空奖（降低非空奖概率）
 *
 * B0 档强制全空奖，乘数设为极大值
 *
 * @type {Object<string, Object<string, Object>>}
 */
const TIER_MATRIX_CONFIG = {
  B0: {
    P0: { cap_multiplier: 0, empty_weight_multiplier: 10.0 },
    P1: { cap_multiplier: 0, empty_weight_multiplier: 10.0 },
    P2: { cap_multiplier: 0, empty_weight_multiplier: 10.0 }
  },
  B1: {
    P0: { cap_multiplier: 1.0, empty_weight_multiplier: 1.2 },
    P1: { cap_multiplier: 1.0, empty_weight_multiplier: 1.0 },
    P2: { cap_multiplier: 0.8, empty_weight_multiplier: 0.8 }
  },
  B2: {
    P0: { cap_multiplier: 1.0, empty_weight_multiplier: 1.0 },
    P1: { cap_multiplier: 1.0, empty_weight_multiplier: 0.9 },
    P2: { cap_multiplier: 0.9, empty_weight_multiplier: 0.7 }
  },
  B3: {
    P0: { cap_multiplier: 1.0, empty_weight_multiplier: 0.8 },
    P1: { cap_multiplier: 1.0, empty_weight_multiplier: 0.7 },
    P2: { cap_multiplier: 1.0, empty_weight_multiplier: 0.6 }
  }
}

/**
 * Pity 系统配置
 *
 * 根据连续空奖次数（empty_streak）提升非空奖概率：
 * - 软保底：达到 soft_guarantee_threshold 后开始线性提升
 * - 硬保底：达到 hard_guarantee_threshold 后强制保底
 *
 * @type {Object}
 */
const PITY_CONFIG = {
  /**
   * 是否启用 Pity 系统
   */
  enabled: process.env.PITY_ENABLED !== 'false',

  /**
   * 软保底触发阈值（连续空奖次数）
   * 达到此值后开始线性提升非空奖概率
   */
  soft_guarantee_threshold: parseInt(process.env.PITY_SOFT_THRESHOLD) || 5,

  /**
   * 硬保底触发阈值（连续空奖次数）
   * 达到此值后强制保底（如果预算足够）
   */
  hard_guarantee_threshold: parseInt(process.env.PITY_HARD_THRESHOLD) || 10,

  /**
   * 每次空奖后的概率提升幅度（百分比）
   * 例如：5 表示每次空奖后非空奖概率 +5%
   */
  increment_per_empty: parseFloat(process.env.PITY_INCREMENT) || 5,

  /**
   * 最大概率提升上限（百分比）
   * 防止过度补偿
   */
  max_boost_percentage: parseFloat(process.env.PITY_MAX_BOOST) || 50
}

/**
 * Luck Debt 运气债务配置
 *
 * 基于用户历史空奖率计算补偿乘数：
 * - historical_empty_rate > expected_rate：需要补偿（multiplier > 1）
 * - historical_empty_rate < expected_rate：运气好（multiplier <= 1）
 *
 * @type {Object}
 */
const LUCK_DEBT_CONFIG = {
  /**
   * 是否启用运气债务机制
   */
  enabled: process.env.LUCK_DEBT_ENABLED !== 'false',

  /**
   * 期望空奖率（系统设计目标）
   * 默认 50%（对应方案中的 fallback 占比）
   */
  expected_empty_rate: parseFloat(process.env.LUCK_DEBT_EXPECTED_RATE) || 0.5,

  /**
   * 最小样本量
   * 全局抽奖次数 < 此值时不计算运气债务
   */
  min_sample_size: parseInt(process.env.LUCK_DEBT_MIN_SAMPLE) || 20,

  /**
   * 运气债务等级阈值
   * deviation = historical_empty_rate - expected_empty_rate
   */
  level_thresholds: {
    /** 高债务：偏离 > 0.15 */
    high: 0.15,
    /** 中债务：偏离 > 0.08 */
    medium: 0.08,
    /** 低债务：偏离 > 0.03 */
    low: 0.03
  },

  /**
   * 各等级对应的补偿乘数
   * 用于调整非空奖权重
   */
  level_multipliers: {
    /** 高债务：权重乘 1.3 */
    high: 1.3,
    /** 中债务：权重乘 1.15 */
    medium: 1.15,
    /** 低债务：权重乘 1.05 */
    low: 1.05,
    /** 无债务：不调整 */
    none: 1.0
  }
}

/**
 * Anti-Empty Streak 防连续空奖配置
 *
 * 当连续空奖次数达到阈值时，强制发放一个非空奖品
 * （需要预算足够支付最低档非空奖）
 *
 * @type {Object}
 */
const ANTI_EMPTY_CONFIG = {
  /**
   * 是否启用防连续空奖机制
   */
  enabled: process.env.ANTI_EMPTY_ENABLED !== 'false',

  /**
   * 强制干预阈值（连续空奖次数）
   * 达到此值后强制发放非空奖
   */
  force_threshold: parseInt(process.env.ANTI_EMPTY_THRESHOLD) || 8,

  /**
   * 强制发放的最低档位
   * 'low' 表示至少发放 low 档奖品
   */
  forced_min_tier: 'low'
}

/**
 * Anti-High Streak 防连续高价值配置
 *
 * 当近期高价值奖品次数过多时，降低高档奖品概率
 * 防止单用户过度占用预算
 *
 * @type {Object}
 */
const ANTI_HIGH_CONFIG = {
  /**
   * 是否启用防连续高价值机制
   */
  enabled: process.env.ANTI_HIGH_ENABLED !== 'false',

  /**
   * 统计窗口大小（最近 N 次抽奖）
   */
  window_size: parseInt(process.env.ANTI_HIGH_WINDOW) || 10,

  /**
   * 高价值奖品次数阈值
   * 在窗口内获得 >= 此数量的高档奖品后触发
   */
  high_count_threshold: parseInt(process.env.ANTI_HIGH_THRESHOLD) || 3,

  /**
   * 触发后的档位上限
   * 'mid' 表示最高只能抽到 mid 档
   */
  capped_max_tier: 'mid',

  /**
   * 高档权重降低系数
   */
  high_tier_penalty: parseFloat(process.env.ANTI_HIGH_PENALTY) || 0.5
}

/**
 * 体验状态配置
 *
 * 配置体验状态表的行为参数
 *
 * @type {Object}
 */
const EXPERIENCE_STATE_CONFIG = {
  /**
   * 高价值档位定义
   * 抽中这些档位会增加 recent_high_count
   */
  high_value_tiers: ['high'],

  /**
   * 空奖档位定义
   * 抽中这些档位会增加 empty_streak
   */
  empty_tiers: ['fallback', 'empty'],

  /**
   * 近期高价值统计窗口（次数）
   */
  recent_high_window: parseInt(process.env.EXPERIENCE_HIGH_WINDOW) || 10
}

/**
 * 灰度发布配置（Phase P2 增强）
 *
 * 支持多维度的细粒度灰度控制：
 * - 百分比灰度：按用户ID hash决定是否命中
 * - 用户白名单：指定用户ID强制启用
 * - 活动白名单：指定活动ID强制启用
 * - 时间窗口：指定时间段内生效
 *
 * 环境变量格式：
 * - PITY_GRAYSCALE_PERCENTAGE=50     # 50% 用户启用
 * - PITY_USER_WHITELIST=1,2,3        # 指定用户ID白名单
 * - PITY_CAMPAIGN_WHITELIST=100,101  # 指定活动ID白名单
 *
 * @type {Object}
 */
const GRAYSCALE_CONFIG = {
  /**
   * Pity 系统灰度配置
   */
  pity: {
    /** 灰度百分比（0-100），100表示全量开放 */
    percentage: parseInt(process.env.PITY_GRAYSCALE_PERCENTAGE) || 100,
    /** 用户ID白名单（强制启用） */
    user_whitelist: parseEnvArray(process.env.PITY_USER_WHITELIST),
    /** 活动ID白名单（强制启用） */
    campaign_whitelist: parseEnvArray(process.env.PITY_CAMPAIGN_WHITELIST)
  },

  /**
   * 运气债务灰度配置
   */
  luck_debt: {
    percentage: parseInt(process.env.LUCK_DEBT_GRAYSCALE_PERCENTAGE) || 100,
    user_whitelist: parseEnvArray(process.env.LUCK_DEBT_USER_WHITELIST),
    campaign_whitelist: parseEnvArray(process.env.LUCK_DEBT_CAMPAIGN_WHITELIST)
  },

  /**
   * 防连续空奖灰度配置
   */
  anti_empty: {
    percentage: parseInt(process.env.ANTI_EMPTY_GRAYSCALE_PERCENTAGE) || 100,
    user_whitelist: parseEnvArray(process.env.ANTI_EMPTY_USER_WHITELIST),
    campaign_whitelist: parseEnvArray(process.env.ANTI_EMPTY_CAMPAIGN_WHITELIST)
  },

  /**
   * 防连续高价值灰度配置
   */
  anti_high: {
    percentage: parseInt(process.env.ANTI_HIGH_GRAYSCALE_PERCENTAGE) || 100,
    user_whitelist: parseEnvArray(process.env.ANTI_HIGH_USER_WHITELIST),
    campaign_whitelist: parseEnvArray(process.env.ANTI_HIGH_CAMPAIGN_WHITELIST)
  }
}

/**
 * 解析环境变量数组
 *
 * 将逗号分隔的字符串解析为数字数组
 * 例如："1,2,3" -> [1, 2, 3]
 *
 * @param {string} env_value - 环境变量值
 * @returns {number[]} 数字数组
 * @private
 */
function parseEnvArray(env_value) {
  if (!env_value) return []
  return env_value
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n))
}

/**
 * 获取完整的策略配置
 *
 * @returns {Object} 完整的策略配置对象
 */
function getFullConfig() {
  return {
    budget_tier: BUDGET_TIER_CONFIG,
    budget_tier_availability: BUDGET_TIER_AVAILABILITY,
    pressure_tier: PRESSURE_TIER_CONFIG,
    tier_matrix: TIER_MATRIX_CONFIG,
    pity: PITY_CONFIG,
    luck_debt: LUCK_DEBT_CONFIG,
    anti_empty: ANTI_EMPTY_CONFIG,
    anti_high: ANTI_HIGH_CONFIG,
    experience_state: EXPERIENCE_STATE_CONFIG
  }
}

/**
 * 获取 BxPx 矩阵值
 *
 * @param {string} budget_tier - 预算分层（B0/B1/B2/B3）
 * @param {string} pressure_tier - 压力分层（P0/P1/P2）
 * @returns {Object} { cap_multiplier, empty_weight_multiplier }
 */
function getMatrixValue(budget_tier, pressure_tier) {
  const budget_config = TIER_MATRIX_CONFIG[budget_tier]
  if (!budget_config) {
    return { cap_multiplier: 1.0, empty_weight_multiplier: 1.0 }
  }

  const matrix_value = budget_config[pressure_tier]
  if (!matrix_value) {
    return { cap_multiplier: 1.0, empty_weight_multiplier: 1.0 }
  }

  return matrix_value
}

/**
 * 判断是否启用某个策略特性（全局开关检查）
 *
 * 只检查环境变量中的全局开关，不考虑灰度
 *
 * @param {string} feature - 特性名称（pity/luck_debt/anti_empty/anti_high）
 * @returns {boolean} 是否启用
 */
function isFeatureEnabled(feature) {
  switch (feature) {
    case 'pity':
      return PITY_CONFIG.enabled
    case 'luck_debt':
      return LUCK_DEBT_CONFIG.enabled
    case 'anti_empty':
      return ANTI_EMPTY_CONFIG.enabled
    case 'anti_high':
      return ANTI_HIGH_CONFIG.enabled
    default:
      return false
  }
}

/**
 * 判断是否启用某个策略特性（带上下文的灰度控制）
 *
 * 支持多维度灰度判断：
 * 1. 全局开关检查（环境变量 *_ENABLED）
 * 2. 用户白名单检查（强制启用）
 * 3. 活动白名单检查（强制启用）
 * 4. 百分比灰度检查（按用户ID hash）
 *
 * 判断优先级：
 * 全局关闭 → 直接返回 false
 * 用户白名单命中 → 返回 true
 * 活动白名单命中 → 返回 true
 * 百分比灰度判断 → 按 hash 计算
 *
 * @param {string} feature - 特性名称（pity/luck_debt/anti_empty/anti_high）
 * @param {Object} context - 上下文信息
 * @param {number} context.user_id - 用户ID（用于灰度 hash 计算）
 * @param {number} context.lottery_campaign_id - 活动ID（用于活动白名单检查）
 * @returns {Object} 启用状态详情
 *
 * @example
 * 返回结果格式：
 * {
 *   enabled: true,                    // 最终是否启用
 *   reason: 'user_whitelist',         // 启用原因
 *   grayscale_percentage: 50,         // 配置的灰度百分比
 *   user_hash_value: 42               // 用户 hash 值（0-99）
 * }
 */
async function isFeatureEnabledForContext(feature, context = {}) {
  const { user_id, lottery_campaign_id } = context

  // 1. 全局开关检查（env 级）
  if (!isFeatureEnabled(feature)) {
    return {
      enabled: false,
      reason: 'global_disabled',
      grayscale_percentage: 0,
      user_hash_value: null
    }
  }

  // 2. 获取灰度百分比（优先级：DB活动级 > env > 默认100%）
  const grayscale = GRAYSCALE_CONFIG[feature] || {
    percentage: 100,
    user_whitelist: [],
    campaign_whitelist: []
  }
  const percentage_key = `${feature}_percentage`
  let effective_percentage = grayscale.percentage

  if (lottery_campaign_id) {
    const db_percentage = await DynamicConfigLoader.getValue('grayscale', percentage_key, null, {
      lottery_campaign_id
    })
    if (db_percentage !== null && db_percentage !== undefined) {
      effective_percentage = db_percentage
    }
  }

  // 3. 用户白名单检查（保持 env 配置）
  if (user_id && grayscale.user_whitelist.includes(user_id)) {
    return {
      enabled: true,
      reason: 'user_whitelist',
      grayscale_percentage: effective_percentage,
      user_hash_value: null
    }
  }

  // 4. 活动白名单检查
  if (lottery_campaign_id && grayscale.campaign_whitelist.includes(lottery_campaign_id)) {
    return {
      enabled: true,
      reason: 'campaign_whitelist',
      grayscale_percentage: effective_percentage,
      user_hash_value: null
    }
  }

  // 5. 百分比灰度检查
  if (effective_percentage >= 100) {
    return {
      enabled: true,
      reason: 'full_rollout',
      grayscale_percentage: 100,
      user_hash_value: null
    }
  }

  if (effective_percentage <= 0) {
    return {
      enabled: false,
      reason: 'zero_percentage',
      grayscale_percentage: 0,
      user_hash_value: null
    }
  }

  // 6. 按用户ID hash 计算灰度命中
  const hash_value = user_id ? calculateUserHash(user_id) : Math.floor(Math.random() * 100)
  const is_hit = hash_value < effective_percentage

  return {
    enabled: is_hit,
    reason: is_hit ? 'percentage_hit' : 'percentage_miss',
    grayscale_percentage: effective_percentage,
    user_hash_value: hash_value
  }
}

/**
 * 计算用户ID的灰度 hash 值
 *
 * 使用简单的 hash 算法将用户ID映射到 0-99 的范围
 * 保证同一用户每次计算结果一致
 *
 * @param {number} user_id - 用户ID
 * @returns {number} hash 值（0-99）
 * @private
 */
function calculateUserHash(user_id) {
  /* 使用用户ID的简单 hash，保证同一用户结果稳定，公式：(user_id * 31 + 17) % 100 */
  return Math.abs((user_id * 31 + 17) % 100)
}

/**
 * 获取灰度配置摘要
 *
 * 用于监控和调试，返回所有特性的灰度配置状态
 *
 * @returns {Object} 灰度配置摘要
 */
function getGrayscaleSummary() {
  return {
    pity: {
      global_enabled: PITY_CONFIG.enabled,
      percentage: GRAYSCALE_CONFIG.pity.percentage,
      user_whitelist_count: GRAYSCALE_CONFIG.pity.user_whitelist.length,
      campaign_whitelist_count: GRAYSCALE_CONFIG.pity.campaign_whitelist.length
    },
    luck_debt: {
      global_enabled: LUCK_DEBT_CONFIG.enabled,
      percentage: GRAYSCALE_CONFIG.luck_debt.percentage,
      user_whitelist_count: GRAYSCALE_CONFIG.luck_debt.user_whitelist.length,
      campaign_whitelist_count: GRAYSCALE_CONFIG.luck_debt.campaign_whitelist.length
    },
    anti_empty: {
      global_enabled: ANTI_EMPTY_CONFIG.enabled,
      percentage: GRAYSCALE_CONFIG.anti_empty.percentage,
      user_whitelist_count: GRAYSCALE_CONFIG.anti_empty.user_whitelist.length,
      campaign_whitelist_count: GRAYSCALE_CONFIG.anti_empty.campaign_whitelist.length
    },
    anti_high: {
      global_enabled: ANTI_HIGH_CONFIG.enabled,
      percentage: GRAYSCALE_CONFIG.anti_high.percentage,
      user_whitelist_count: GRAYSCALE_CONFIG.anti_high.user_whitelist.length,
      campaign_whitelist_count: GRAYSCALE_CONFIG.anti_high.campaign_whitelist.length
    }
  }
}

/* ========================================= */
/* 动态配置加载（Phase 3+）                  */
/* ========================================= */

/**
 * 动态配置缓存
 *
 * 存储从数据库加载的配置，避免重复查询
 * 使用 TTL（Time To Live）机制定期刷新
 *
 * @type {Object}
 * @private
 */
/**
 * 动态配置缓存（按活动ID隔离）
 *
 * Map 结构：lottery_campaign_id | 'global' → { data, matrix, loaded_at, loading }
 * 每个活动的配置独立缓存，互不干扰
 *
 * @type {Map<string|number, Object>}
 */
const _dynamicConfigCache = new Map()

/**
 * 获取指定活动的缓存槽位（不存在时创建空槽位）
 *
 * @param {number|null} lottery_campaign_id - 活动ID（null 表示全局）
 * @returns {Object} 缓存槽位 { data, matrix, loaded_at, loading }
 * @private
 */
function _getCacheSlot(lottery_campaign_id) {
  const key = lottery_campaign_id || 'global'
  if (!_dynamicConfigCache.has(key)) {
    _dynamicConfigCache.set(key, {
      data: null,
      matrix: null,
      loaded_at: null,
      loading: false
    })
  }
  return _dynamicConfigCache.get(key)
}

/**
 * 配置缓存 TTL（毫秒）
 * 默认 5 分钟刷新一次
 */
const CONFIG_CACHE_TTL = parseInt(process.env.STRATEGY_CONFIG_CACHE_TTL) || 5 * 60 * 1000

/**
 * DynamicConfigLoader - 动态配置加载器
 *
 * 从数据库读取策略配置，支持：
 * - 缓存机制（减少数据库查询）
 * - 配置热更新（不重启服务即可生效）
 * - 配置优先级（数据库 > 环境变量 > 默认值）
 * - 配置校验（确保数据有效性）
 *
 * @class DynamicConfigLoader
 */
class DynamicConfigLoader {
  /**
   * 检查缓存是否有效
   *
   * @param {number|null} [lottery_campaign_id] - 活动ID（按活动检查缓存有效性）
   * @returns {boolean} 缓存是否有效
   */
  static isCacheValid(lottery_campaign_id) {
    const slot = _getCacheSlot(lottery_campaign_id)
    if (!slot.loaded_at) return false
    const age = Date.now() - slot.loaded_at
    return age < CONFIG_CACHE_TTL
  }

  /**
   * 从数据库加载全部策略配置
   *
   * @param {Object} options - 选项
   * @param {boolean} options.force_refresh - 强制刷新（忽略缓存）
   * @returns {Promise<Object|null>} 配置对象或 null（加载失败）
   *
   * @example
   * const config = await DynamicConfigLoader.loadConfig()
   * // 返回: {
   * //   budget_tier: { threshold_high: 1000, ... },
   * //   pity: { enabled: true, ... },
   * //   ...
   * // }
   */
  static async loadConfig(options = {}) {
    const { force_refresh = false, lottery_campaign_id } = options
    const cache = _getCacheSlot(lottery_campaign_id)

    // 1. 检查缓存（按活动隔离）
    if (!force_refresh && this.isCacheValid(lottery_campaign_id) && cache.data) {
      return cache.data
    }

    // 2. 避免并发加载 - 等待当前加载完成
    if (cache.loading) {
      await new Promise(resolve => {
        setTimeout(resolve, 100)
      })
      return cache.data
    }

    cache.loading = true

    try {
      // 3. 动态导入模型（避免循环依赖）
      const { LotteryStrategyConfig } = require('../../../../models')

      if (!LotteryStrategyConfig) {
        logger.warn('[StrategyConfig] LotteryStrategyConfig 模型未就绪，使用默认配置')
        return null
      }

      // 4. 从数据库加载配置（按活动ID隔离）
      const db_config = await LotteryStrategyConfig.getAllConfig(lottery_campaign_id)

      // 5. 合并配置（数据库覆盖默认值）
      const merged_config = this.mergeConfig(db_config)

      // 6. 更新缓存
      cache.data = merged_config
      cache.loaded_at = Date.now()

      logger.info('[StrategyConfig] 动态配置加载成功', {
        lottery_campaign_id: lottery_campaign_id || 'global'
      })
      return merged_config
    } catch (error) {
      logger.error('[StrategyConfig] 动态配置加载失败:', error.message)
      return null
    } finally {
      cache.loading = false
    }
  }

  /**
   * 从数据库加载矩阵配置
   *
   * @param {Object} options - 选项
   * @param {boolean} options.force_refresh - 强制刷新
   * @returns {Promise<Object|null>} 矩阵配置或 null
   */
  static async loadMatrixConfig(options = {}) {
    const { force_refresh = false, lottery_campaign_id } = options
    const cache = _getCacheSlot(lottery_campaign_id)

    // 1. 检查缓存（按活动隔离）
    if (!force_refresh && this.isCacheValid(lottery_campaign_id) && cache.matrix) {
      return cache.matrix
    }

    try {
      // 2. 动态导入模型
      const { LotteryTierMatrixConfig } = require('../../../../models')

      if (!LotteryTierMatrixConfig) {
        logger.warn('[StrategyConfig] LotteryTierMatrixConfig 模型未就绪，使用默认矩阵')
        return null
      }

      // 3. 从数据库加载矩阵（按活动ID隔离）
      const db_matrix = await LotteryTierMatrixConfig.getFullMatrix(lottery_campaign_id)

      if (Object.keys(db_matrix).length === 0) {
        return null
      }

      // 4. 更新缓存
      cache.matrix = db_matrix

      logger.info('[StrategyConfig] 矩阵配置加载成功', {
        lottery_campaign_id: lottery_campaign_id || 'global'
      })
      return db_matrix
    } catch (error) {
      logger.error('[StrategyConfig] 矩阵配置加载失败:', error.message)
      return null
    }
  }

  /**
   * 合并数据库配置和默认配置
   *
   * 优先级：数据库值 > 环境变量值 > 代码默认值
   *
   * @param {Object} db_config - 数据库配置
   * @returns {Object} 合并后的配置
   * @private
   */
  static mergeConfig(db_config) {
    return {
      budget_tier: {
        ...BUDGET_TIER_CONFIG,
        ...(db_config.budget_tier || {})
      },
      budget_tier_availability: BUDGET_TIER_AVAILABILITY, // 档位映射固定，不支持动态配置
      pressure_tier: {
        ...PRESSURE_TIER_CONFIG,
        ...(db_config.pressure_tier || {})
      },
      /** 活动压力策略开关（lottery_strategy_config 表 pressure.enabled） */
      pressure: {
        enabled: true, // 默认开启，保持现有行为
        ...(db_config.pressure || {})
      },
      /** BxPx 矩阵策略开关（lottery_strategy_config 表 matrix.enabled） */
      matrix: {
        enabled: true, // 默认开启，保持现有行为
        ...(db_config.matrix || {})
      },
      pity: {
        ...PITY_CONFIG,
        ...(db_config.pity || {})
      },
      luck_debt: {
        ...LUCK_DEBT_CONFIG,
        ...(db_config.luck_debt || {})
      },
      anti_empty: {
        ...ANTI_EMPTY_CONFIG,
        ...(db_config.anti_empty || {})
      },
      anti_high: {
        ...ANTI_HIGH_CONFIG,
        ...(db_config.anti_high || {})
      },
      experience_state: {
        ...EXPERIENCE_STATE_CONFIG,
        ...(db_config.experience_state || {})
      }
    }
  }

  /**
   * 获取动态配置值（支持活动级隔离）
   *
   * @param {string} group - 配置分组（如 pity、anti_empty、pressure_tier）
   * @param {string} key - 配置键名（如 enabled、threshold）
   * @param {*} default_value - 默认值（DB 无记录时返回）
   * @param {Object} [options={}] - 选项（透传给 loadConfig）
   * @param {number} [options.lottery_campaign_id] - 活动ID（按活动读取配置）
   * @returns {Promise<*>} 配置值
   *
   * @example
   * const threshold = await DynamicConfigLoader.getValue('budget_tier', 'threshold_high', 1000, { lottery_campaign_id: 1 })
   */
  static async getValue(group, key, default_value, options = {}) {
    const config = await this.loadConfig(options)

    if (config && config[group] && config[group][key] !== undefined) {
      return config[group][key]
    }

    return default_value
  }

  /**
   * 获取矩阵配置值
   *
   * @param {string} budget_tier - Budget Tier
   * @param {string} pressure_tier - Pressure Tier
   * @returns {Promise<Object>} 矩阵配置值
   */
  static async getMatrixValue(budget_tier, pressure_tier) {
    const matrix = await this.loadMatrixConfig()

    // 优先使用数据库配置
    if (matrix && matrix[budget_tier] && matrix[budget_tier][pressure_tier]) {
      return matrix[budget_tier][pressure_tier]
    }

    // 回退到静态配置
    return getMatrixValue(budget_tier, pressure_tier)
  }

  /**
   * 清除配置缓存（用于配置更新后强制刷新）
   *
   * @param {number|null} [lottery_campaign_id] - 活动ID（传入则只清该活动，不传清全部）
   * @returns {void}
   */
  static clearCache(lottery_campaign_id) {
    if (lottery_campaign_id) {
      const key = lottery_campaign_id
      if (_dynamicConfigCache.has(key)) {
        _dynamicConfigCache.delete(key)
      }
      logger.info('[StrategyConfig] 活动配置缓存已清除', { lottery_campaign_id })
    } else {
      _dynamicConfigCache.clear()
      logger.info('[StrategyConfig] 全部配置缓存已清除')
    }
  }

  /**
   * 获取缓存状态
   *
   * @param {number|null} [lottery_campaign_id] - 活动ID（查看指定活动的缓存状态）
   * @returns {Object} 缓存状态信息
   */
  static getCacheStatus(lottery_campaign_id) {
    const slot = _getCacheSlot(lottery_campaign_id)
    return {
      lottery_campaign_id: lottery_campaign_id || 'global',
      has_config_cache: !!slot.data,
      has_matrix_cache: !!slot.matrix,
      loaded_at: slot.loaded_at ? new Date(slot.loaded_at).toISOString() : null,
      cache_age_ms: slot.loaded_at ? Date.now() - slot.loaded_at : null,
      cache_ttl_ms: CONFIG_CACHE_TTL,
      is_valid: DynamicConfigLoader.isCacheValid(lottery_campaign_id),
      total_cached_campaigns: _dynamicConfigCache.size
    }
  }
}

/**
 * 获取动态配置的完整策略配置
 *
 * 异步版本，优先从数据库加载
 *
 * @returns {Promise<Object>} 完整配置对象
 */
async function getFullConfigAsync() {
  const dynamic_config = await DynamicConfigLoader.loadConfig()
  if (dynamic_config) {
    return dynamic_config
  }
  return getFullConfig()
}

/**
 * 获取动态配置的矩阵值
 *
 * 异步版本，优先从数据库加载
 *
 * @param {string} budget_tier - Budget Tier
 * @param {string} pressure_tier - Pressure Tier
 * @returns {Promise<Object>} 矩阵配置值
 */
async function getMatrixValueAsync(budget_tier, pressure_tier) {
  return DynamicConfigLoader.getMatrixValue(budget_tier, pressure_tier)
}

module.exports = {
  // 配置常量（静态默认值）
  BUDGET_TIER_CONFIG,
  BUDGET_TIER_AVAILABILITY,
  PRESSURE_TIER_CONFIG,
  TIER_MATRIX_CONFIG,
  PITY_CONFIG,
  LUCK_DEBT_CONFIG,
  ANTI_EMPTY_CONFIG,
  ANTI_HIGH_CONFIG,
  EXPERIENCE_STATE_CONFIG,
  GRAYSCALE_CONFIG, // Phase P2：灰度发布配置

  // 同步工具函数（使用静态配置）
  getFullConfig,
  getMatrixValue,
  isFeatureEnabled,
  isFeatureEnabledForContext, // Phase P2：带上下文的灰度判断
  getGrayscaleSummary, // Phase P2：获取灰度配置摘要

  // Phase 3+：动态配置加载
  DynamicConfigLoader,
  getFullConfigAsync,
  getMatrixValueAsync,
  CONFIG_CACHE_TTL
}
