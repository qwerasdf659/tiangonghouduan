'use strict'

/**
 * 测试配置动态加载器（Test Config Loader）
 *
 * 职责：
 * - 从数据库动态加载抽奖策略配置（LotteryStrategyConfig）
 * - 提供保底配置（guarantee）、Pity配置（pity）等的获取方法
 * - 支持配置缓存和手动刷新
 * - 为测试提供真实的业务配置数据，避免硬编码
 *
 * 使用场景：
 * - 保底触发测试需要知道保底阈值（guarantee.threshold）
 * - Pity系统测试需要知道连续空奖阈值（pity.empty_streak_threshold）
 * - 压力测试需要知道硬保底阈值
 *
 * 配置来源优先级：
 * 1. 数据库 LotteryStrategyConfig 表（最高优先级）
 * 2. 默认配置（当数据库无配置时使用）
 *
 * 数据库表结构：
 * - config_group: 配置分组（guarantee/pity/budget_tier等）
 * - config_key: 配置键名
 * - config_value: 配置值（JSON格式）
 * - value_type: 值类型（number/boolean/string/array/object）
 * - is_active: 是否启用
 * - priority: 优先级（数值越大优先级越高）
 *
 * @module tests/helpers/test-config-loader
 * @author 测试审计标准文档 P1-1
 * @since 2026-01-28
 */

const { LotteryStrategyConfig } = require('../../models')

/**
 * 配置缓存（避免频繁查询数据库）
 * @type {Map<string, {data: Object, timestamp: number}>}
 */
const configCache = new Map()

/**
 * 缓存有效期（5分钟）
 */
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * 默认保底配置（当数据库无配置时使用）
 * 
 * 业务说明：
 * - enabled: 保底功能是否启用
 * - threshold: 连续抽奖N次未获得高档位奖品后触发保底
 * - target_tier: 保底时优先选择的奖品档位
 * - reset_on_trigger: 触发保底后是否重置计数器
 * - hard_pity_threshold: 硬保底阈值（必定触发，无条件）
 */
const DEFAULT_GUARANTEE_CONFIG = {
  enabled: true,
  threshold: 10,
  target_tier: 'high',
  reset_on_trigger: true,
  hard_pity_threshold: 10
}

/**
 * 默认Pity配置（当数据库无配置时使用）
 * 
 * 业务说明：
 * - enabled: Pity系统是否启用
 * - empty_streak_threshold: 连续空奖N次后触发软保底
 * - boost_multiplier: 软保底触发时概率提升倍数
 * - max_empty_streak: 最大连续空奖次数（硬保底触发点）
 * - multiplier_table: 不同空奖次数对应的概率提升表
 */
const DEFAULT_PITY_CONFIG = {
  enabled: true,
  empty_streak_threshold: 3,
  boost_multiplier: 1.5,
  max_empty_streak: 10,
  multiplier_table: {
    threshold_1: { count: 3, multiplier: 1.1 },
    threshold_2: { count: 5, multiplier: 1.25 },
    threshold_3: { count: 7, multiplier: 1.5 },
    hard_pity: { count: 10, multiplier: 2.0 }
  }
}

/**
 * 默认预算分层配置
 */
const DEFAULT_BUDGET_TIER_CONFIG = {
  threshold_high: 1000,
  threshold_mid: 500,
  threshold_low: 100
}

/**
 * 检查缓存是否有效
 * @param {string} cacheKey - 缓存键
 * @returns {boolean} 缓存是否有效
 */
function isCacheValid(cacheKey) {
  const cached = configCache.get(cacheKey)
  if (!cached) return false
  return (Date.now() - cached.timestamp) < CACHE_TTL_MS
}

/**
 * 从缓存获取配置
 * @param {string} cacheKey - 缓存键
 * @returns {Object|null} 配置对象或null
 */
function getFromCache(cacheKey) {
  if (isCacheValid(cacheKey)) {
    return configCache.get(cacheKey).data
  }
  return null
}

/**
 * 设置缓存
 * @param {string} cacheKey - 缓存键
 * @param {Object} data - 配置数据
 */
function setCache(cacheKey, data) {
  configCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  })
}

/**
 * 清除指定缓存或全部缓存
 * @param {string} [cacheKey] - 缓存键（可选，不传则清除全部）
 */
function clearCache(cacheKey) {
  if (cacheKey) {
    configCache.delete(cacheKey)
  } else {
    configCache.clear()
  }
}

/**
 * 从数据库加载保底配置
 * 
 * @param {Object} [options] - 选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新缓存
 * @returns {Promise<Object>} 保底配置对象
 * 
 * @example
 * const config = await loadGuaranteeConfig()
 * console.log(config.threshold) // 10
 * console.log(config.hard_pity_threshold) // 10
 */
async function loadGuaranteeConfig(options = {}) {
  const { forceRefresh = false } = options
  const cacheKey = 'guarantee'

  // 检查缓存
  if (!forceRefresh) {
    const cached = getFromCache(cacheKey)
    if (cached) {
      return cached
    }
  }

  try {
    // 从数据库加载配置
    const dbConfig = await LotteryStrategyConfig.getConfigByGroup('guarantee')
    
    // 合并默认配置和数据库配置
    const config = {
      ...DEFAULT_GUARANTEE_CONFIG,
      ...dbConfig
    }

    // 尝试从 pity 配置组获取 hard_pity 阈值
    const pityConfig = await LotteryStrategyConfig.getConfigByGroup('pity')
    if (pityConfig?.hard_pity_threshold) {
      config.hard_pity_threshold = pityConfig.hard_pity_threshold
    }

    // 设置缓存
    setCache(cacheKey, config)

    console.log('[TestConfigLoader] 保底配置加载成功:', {
      threshold: config.threshold,
      hard_pity_threshold: config.hard_pity_threshold,
      source: Object.keys(dbConfig).length > 0 ? 'database' : 'default'
    })

    return config
  } catch (error) {
    console.warn('[TestConfigLoader] 数据库加载保底配置失败，使用默认值:', error.message)
    
    // 数据库不可用时使用默认配置
    setCache(cacheKey, DEFAULT_GUARANTEE_CONFIG)
    return DEFAULT_GUARANTEE_CONFIG
  }
}

/**
 * 从数据库加载Pity系统配置
 * 
 * @param {Object} [options] - 选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新缓存
 * @returns {Promise<Object>} Pity配置对象
 * 
 * @example
 * const config = await loadPityConfig()
 * console.log(config.empty_streak_threshold) // 3
 * console.log(config.max_empty_streak) // 10
 */
async function loadPityConfig(options = {}) {
  const { forceRefresh = false } = options
  const cacheKey = 'pity'

  // 检查缓存
  if (!forceRefresh) {
    const cached = getFromCache(cacheKey)
    if (cached) {
      return cached
    }
  }

  try {
    // 从数据库加载配置
    const dbConfig = await LotteryStrategyConfig.getConfigByGroup('pity')
    
    // 合并默认配置和数据库配置
    const config = {
      ...DEFAULT_PITY_CONFIG,
      ...dbConfig
    }

    // 设置缓存
    setCache(cacheKey, config)

    console.log('[TestConfigLoader] Pity配置加载成功:', {
      empty_streak_threshold: config.empty_streak_threshold,
      max_empty_streak: config.max_empty_streak,
      source: Object.keys(dbConfig).length > 0 ? 'database' : 'default'
    })

    return config
  } catch (error) {
    console.warn('[TestConfigLoader] 数据库加载Pity配置失败，使用默认值:', error.message)
    
    // 数据库不可用时使用默认配置
    setCache(cacheKey, DEFAULT_PITY_CONFIG)
    return DEFAULT_PITY_CONFIG
  }
}

/**
 * 从数据库加载预算分层配置
 * 
 * @param {Object} [options] - 选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新缓存
 * @returns {Promise<Object>} 预算分层配置对象
 */
async function loadBudgetTierConfig(options = {}) {
  const { forceRefresh = false } = options
  const cacheKey = 'budget_tier'

  // 检查缓存
  if (!forceRefresh) {
    const cached = getFromCache(cacheKey)
    if (cached) {
      return cached
    }
  }

  try {
    // 从数据库加载配置
    const dbConfig = await LotteryStrategyConfig.getConfigByGroup('budget_tier')
    
    // 合并默认配置和数据库配置
    const config = {
      ...DEFAULT_BUDGET_TIER_CONFIG,
      ...dbConfig
    }

    // 设置缓存
    setCache(cacheKey, config)

    return config
  } catch (error) {
    console.warn('[TestConfigLoader] 数据库加载预算分层配置失败，使用默认值:', error.message)
    
    // 数据库不可用时使用默认配置
    setCache(cacheKey, DEFAULT_BUDGET_TIER_CONFIG)
    return DEFAULT_BUDGET_TIER_CONFIG
  }
}

/**
 * 加载所有策略配置
 * 
 * @param {Object} [options] - 选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新缓存
 * @returns {Promise<Object>} 所有配置对象
 * 
 * @example
 * const allConfig = await loadAllStrategyConfig()
 * console.log(allConfig.guarantee.threshold)
 * console.log(allConfig.pity.max_empty_streak)
 */
async function loadAllStrategyConfig(options = {}) {
  const { forceRefresh = false } = options
  const cacheKey = 'all_strategy'

  // 检查缓存
  if (!forceRefresh) {
    const cached = getFromCache(cacheKey)
    if (cached) {
      return cached
    }
  }

  try {
    // 并行加载所有配置
    const [guarantee, pity, budget_tier] = await Promise.all([
      loadGuaranteeConfig({ forceRefresh }),
      loadPityConfig({ forceRefresh }),
      loadBudgetTierConfig({ forceRefresh })
    ])

    const config = {
      guarantee,
      pity,
      budget_tier
    }

    // 设置缓存
    setCache(cacheKey, config)

    return config
  } catch (error) {
    console.warn('[TestConfigLoader] 加载所有策略配置失败:', error.message)
    
    // 返回默认配置
    const defaultConfig = {
      guarantee: DEFAULT_GUARANTEE_CONFIG,
      pity: DEFAULT_PITY_CONFIG,
      budget_tier: DEFAULT_BUDGET_TIER_CONFIG
    }
    
    setCache(cacheKey, defaultConfig)
    return defaultConfig
  }
}

/**
 * 获取保底阈值（便捷方法）
 * 
 * @param {Object} [options] - 选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新缓存
 * @returns {Promise<number>} 保底阈值
 * 
 * @example
 * const threshold = await getGuaranteeThreshold()
 * console.log(`保底阈值: ${threshold}次`) // 保底阈值: 10次
 */
async function getGuaranteeThreshold(options = {}) {
  const config = await loadGuaranteeConfig(options)
  return config.threshold || DEFAULT_GUARANTEE_CONFIG.threshold
}

/**
 * 获取硬保底阈值（便捷方法）
 * 
 * @param {Object} [options] - 选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新缓存
 * @returns {Promise<number>} 硬保底阈值
 */
async function getHardPityThreshold(options = {}) {
  const config = await loadGuaranteeConfig(options)
  return config.hard_pity_threshold || DEFAULT_GUARANTEE_CONFIG.hard_pity_threshold
}

/**
 * 获取软保底阈值（便捷方法）
 * 
 * @param {Object} [options] - 选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新缓存
 * @returns {Promise<number>} 软保底阈值（连续空奖触发点）
 */
async function getSoftPityThreshold(options = {}) {
  const config = await loadPityConfig(options)
  return config.empty_streak_threshold || DEFAULT_PITY_CONFIG.empty_streak_threshold
}

/**
 * 获取Pity倍率表（便捷方法）
 * 
 * @param {Object} [options] - 选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新缓存
 * @returns {Promise<Object>} Pity倍率表
 */
async function getPityMultiplierTable(options = {}) {
  const config = await loadPityConfig(options)
  return config.multiplier_table || DEFAULT_PITY_CONFIG.multiplier_table
}

/**
 * 验证配置是否已加载到数据库
 * 用于测试环境检查
 * 
 * @returns {Promise<Object>} 验证结果
 */
async function validateConfigExists() {
  const result = {
    guarantee: false,
    pity: false,
    budget_tier: false,
    details: {}
  }

  try {
    const guaranteeConfig = await LotteryStrategyConfig.findAll({
      where: { config_group: 'guarantee', is_active: true }
    })
    result.guarantee = guaranteeConfig.length > 0
    result.details.guarantee_count = guaranteeConfig.length

    const pityConfig = await LotteryStrategyConfig.findAll({
      where: { config_group: 'pity', is_active: true }
    })
    result.pity = pityConfig.length > 0
    result.details.pity_count = pityConfig.length

    const budgetConfig = await LotteryStrategyConfig.findAll({
      where: { config_group: 'budget_tier', is_active: true }
    })
    result.budget_tier = budgetConfig.length > 0
    result.details.budget_tier_count = budgetConfig.length

  } catch (error) {
    result.error = error.message
  }

  return result
}

module.exports = {
  // 主要加载方法
  loadGuaranteeConfig,
  loadPityConfig,
  loadBudgetTierConfig,
  loadAllStrategyConfig,
  
  // 便捷获取方法
  getGuaranteeThreshold,
  getHardPityThreshold,
  getSoftPityThreshold,
  getPityMultiplierTable,
  
  // 缓存管理
  clearCache,
  
  // 验证方法
  validateConfigExists,
  
  // 导出默认配置（供测试回退使用）
  DEFAULT_GUARANTEE_CONFIG,
  DEFAULT_PITY_CONFIG,
  DEFAULT_BUDGET_TIER_CONFIG
}




