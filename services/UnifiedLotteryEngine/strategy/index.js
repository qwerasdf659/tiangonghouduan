'use strict'

/**
 * 策略模块索引
 *
 * 统一导出策略引擎和相关组件
 *
 * 导出内容：
 * - StrategyEngine：策略引擎主类（Facade 模式）
 * - 独立计算器：可单独使用的策略计算组件
 * - 状态管理器：用户体验状态和全局状态管理
 * - 配置模块：静态配置和动态配置加载
 * - 工厂函数：单例模式获取引擎实例
 *
 * @module services/UnifiedLotteryEngine/strategy
 * @author 抽奖模块策略重构
 * @since 2026-01-20
 */

// ========== 核心引擎 ==========
const StrategyEngine = require('./StrategyEngine')

// ========== 独立计算器（Phase 3+ 直接导出） ==========
const BudgetTierCalculator = require('./calculators/BudgetTierCalculator')
const PressureTierCalculator = require('./calculators/PressureTierCalculator')
const TierMatrixCalculator = require('./calculators/TierMatrixCalculator')
const PityCalculator = require('./calculators/PityCalculator')
const LuckDebtCalculator = require('./calculators/LuckDebtCalculator')
const AntiEmptyStreakHandler = require('./calculators/AntiEmptyStreakHandler')
const AntiHighStreakHandler = require('./calculators/AntiHighStreakHandler')

// ========== 状态管理器 ==========
const ExperienceStateManager = require('./state/ExperienceStateManager')
const GlobalStateManager = require('./state/GlobalStateManager')

// ========== 配置模块 ==========
const StrategyConfig = require('./config/StrategyConfig')

// ========== 从 StrategyEngine 提取常量（向后兼容） ==========
const { BUDGET_TIERS, PRESSURE_TIERS, TIER_WEIGHT_MATRIX } = StrategyEngine

// ========== 默认实例（单例模式） ==========
let _defaultInstance = null

/**
 * 获取默认策略引擎实例（单例）
 *
 * 单例模式确保整个应用使用同一个策略引擎实例
 * 避免重复初始化计算器和状态管理器
 *
 * @param {Object} options - 配置选项（仅首次创建时生效）
 * @param {Object} options.pity_config - Pity 配置覆盖
 * @param {Object} options.luck_debt_config - Luck Debt 配置覆盖
 * @param {Object} options.anti_empty_config - Anti-Empty 配置覆盖
 * @param {Object} options.anti_high_config - Anti-High 配置覆盖
 * @returns {StrategyEngine} 策略引擎实例
 *
 * @example
 * // 获取默认实例
 * const engine = getStrategyEngine()
 *
 * // 首次调用时可传入配置
 * const engine = getStrategyEngine({
 *   pity_config: { hard_guarantee_threshold: 8 }
 * })
 */
function getStrategyEngine(options = {}) {
  if (!_defaultInstance) {
    _defaultInstance = new StrategyEngine(options)
  }
  return _defaultInstance
}

/**
 * 重置默认实例（仅用于测试）
 *
 * 清除单例实例，下次调用 getStrategyEngine 将创建新实例
 *
 * @returns {void}
 */
function resetStrategyEngine() {
  _defaultInstance = null
}

/**
 * 创建策略引擎新实例
 *
 * 用于需要独立配置的场景（如 A/B 测试）
 * 不影响默认单例实例
 *
 * @param {Object} options - 配置选项
 * @returns {StrategyEngine} 新的策略引擎实例
 *
 * @example
 * // 创建带有自定义配置的独立实例
 * const testEngine = createStrategyEngine({
 *   pity_config: { enabled: false }
 * })
 */
function createStrategyEngine(options = {}) {
  return new StrategyEngine(options)
}

module.exports = {
  /* ======================================== */
  /* 核心引擎                                 */
  /* ======================================== */
  StrategyEngine,

  /* ======================================== */
  /* 单例管理                                 */
  /* ======================================== */
  getStrategyEngine,
  resetStrategyEngine,
  createStrategyEngine,

  /* ======================================== */
  /* 常量导出（向后兼容）                     */
  /* ======================================== */
  BUDGET_TIERS,
  PRESSURE_TIERS,
  TIER_WEIGHT_MATRIX,

  /* ======================================== */
  /* 独立计算器（Phase 3+ 直接导出）          */
  /* ======================================== */

  /**
   * Budget Tier 计算器
   *
   * 计算用户 EffectiveBudget 和 Budget Tier（B0-B3）
   *
   * @see BudgetTierCalculator
   */
  BudgetTierCalculator,

  /**
   * Pressure Tier 计算器
   *
   * 计算活动压力指数和 Pressure Tier（P0-P2）
   *
   * @see PressureTierCalculator
   */
  PressureTierCalculator,

  /**
   * Tier Matrix 计算器
   *
   * 根据 BxPx 矩阵计算权重调整乘数
   *
   * @see TierMatrixCalculator
   */
  TierMatrixCalculator,

  /**
   * Pity 计算器
   *
   * 实现软保底机制，根据连续空奖次数调整概率
   *
   * @see PityCalculator
   */
  PityCalculator,

  /**
   * Luck Debt 计算器
   *
   * 实现运气债务机制，根据历史空奖率计算补偿
   *
   * @see LuckDebtCalculator
   */
  LuckDebtCalculator,

  /**
   * Anti-Empty Streak 处理器
   *
   * 实现防连续空奖硬保底机制
   *
   * @see AntiEmptyStreakHandler
   */
  AntiEmptyStreakHandler,

  /**
   * Anti-High Streak 处理器
   *
   * 实现防连续高价值机制，平滑奖品分布
   *
   * @see AntiHighStreakHandler
   */
  AntiHighStreakHandler,

  /* ======================================== */
  /* 状态管理器                               */
  /* ======================================== */

  /**
   * 体验状态管理器
   *
   * 管理用户在单个活动内的体验状态（空奖连击、近期高价值等）
   *
   * @see ExperienceStateManager
   */
  ExperienceStateManager,

  /**
   * 全局状态管理器
   *
   * 管理用户跨活动的全局抽奖统计（运气债务计算基础）
   *
   * @see GlobalStateManager
   */
  GlobalStateManager,

  /* ======================================== */
  /* 配置模块（Phase 3+ 动态配置）            */
  /* ======================================== */

  /**
   * 策略配置模块
   *
   * 包含静态配置常量和动态配置加载器
   *
   * @see StrategyConfig
   */
  StrategyConfig,

  /**
   * 动态配置加载器
   *
   * 从数据库加载策略配置，支持运行时热更新
   *
   * @see DynamicConfigLoader
   */
  DynamicConfigLoader: StrategyConfig.DynamicConfigLoader,

  /* ======================================== */
  /* 配置常量快捷访问                         */
  /* ======================================== */

  /**
   * Budget Tier 阈值配置
   */
  BUDGET_TIER_CONFIG: StrategyConfig.BUDGET_TIER_CONFIG,

  /**
   * Pressure Tier 阈值配置
   */
  PRESSURE_TIER_CONFIG: StrategyConfig.PRESSURE_TIER_CONFIG,

  /**
   * Pity 系统配置
   */
  PITY_CONFIG: StrategyConfig.PITY_CONFIG,

  /**
   * Luck Debt 运气债务配置
   */
  LUCK_DEBT_CONFIG: StrategyConfig.LUCK_DEBT_CONFIG,

  /**
   * Anti-Empty 防连续空奖配置
   */
  ANTI_EMPTY_CONFIG: StrategyConfig.ANTI_EMPTY_CONFIG,

  /**
   * Anti-High 防连续高价值配置
   */
  ANTI_HIGH_CONFIG: StrategyConfig.ANTI_HIGH_CONFIG,

  /* ======================================== */
  /* Phase P2：灰度发布相关                   */
  /* ======================================== */

  /**
   * 灰度发布配置
   */
  GRAYSCALE_CONFIG: StrategyConfig.GRAYSCALE_CONFIG,

  /**
   * 判断功能是否对特定上下文启用（带灰度控制）
   *
   * @param {string} feature - 特性名称
   * @param {Object} context - 上下文信息
   * @returns {Object} 启用状态详情
   */
  isFeatureEnabledForContext: StrategyConfig.isFeatureEnabledForContext,

  /**
   * 获取灰度配置摘要
   *
   * @returns {Object} 灰度配置摘要
   */
  getGrayscaleSummary: StrategyConfig.getGrayscaleSummary,

  /**
   * 判断功能是否全局启用（无灰度）
   *
   * @param {string} feature - 特性名称
   * @returns {boolean} 是否启用
   */
  isFeatureEnabled: StrategyConfig.isFeatureEnabled
}
