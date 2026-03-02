'use strict'

/**
 * LotteryComputeEngine - 抽奖计算引擎（Facade 入口）
 *
 * 职责：
 * 1. 统一调度所有策略计算器（BudgetTier、PressureTier、Pity、LuckDebt 等）
 * 2. 为 Pipeline Stages 提供简洁的 API 接口
 * 3. 封装策略计算的复杂性，对外暴露清晰的业务接口
 *
 * 设计原则：
 * - Facade 模式：隐藏内部计算器实现细节
 * - 单一职责：每个计算器只负责一个策略维度
 * - 可测试性：每个计算器可独立单元测试
 * - 可扩展性：新增策略只需添加新计算器
 *
 * 核心接口：
 * - computeBudgetContext(params): 计算预算上下文（EffectiveBudget、BudgetTier、PressureTier）
 * - computeWeightAdjustment(params): 计算档位权重调整（BxPx矩阵映射）
 * - applyExperienceSmoothing(params): 应用体验平滑机制（Pity、AntiEmpty、AntiHigh）
 * - updateExperienceState(params): 更新用户体验状态
 * - getLuckDebtMultiplier(params): 获取运气债务乘数
 *
 * 集成点：
 * - BudgetContextStage: 调用 computeBudgetContext
 * - BuildPrizePoolStage: 调用 computeWeightAdjustment
 * - TierPickStage: 调用 applyExperienceSmoothing
 * - SettleStage: 调用 updateExperienceState
 *
 * @module services/UnifiedLotteryEngine/compute/LotteryComputeEngine
 * @author 抽奖模块策略重构
 * @since 2026-01-20
 */

const logger = require('../../../utils/logger').logger

/* ========== 计算器导入（Phase 3-6 已实现） ========== */
const BudgetTierCalculator = require('./calculators/BudgetTierCalculator')
const PressureTierCalculator = require('./calculators/PressureTierCalculator')
const TierMatrixCalculator = require('./calculators/TierMatrixCalculator')

/* ========== Phase 9-12 新增计算器 ========== */
const PityCalculator = require('./calculators/PityCalculator')
const LuckDebtCalculator = require('./calculators/LuckDebtCalculator')
const AntiEmptyStreakHandler = require('./calculators/AntiEmptyStreakHandler')
const AntiHighStreakHandler = require('./calculators/AntiHighStreakHandler')

/* ========== Phase 15 状态管理器 ========== */
const { ExperienceStateManager, GlobalStateManager } = require('./state')

/* ========== Phase 6 策略配置（配置与代码分离） ========== */
const {
  BUDGET_TIER_CONFIG,
  BUDGET_TIER_AVAILABILITY,
  PRESSURE_TIER_CONFIG,
  TIER_MATRIX_CONFIG,
  PITY_CONFIG: _PITY_CONFIG, // 预留供未来计算器使用
  LUCK_DEBT_CONFIG: _LUCK_DEBT_CONFIG, // 预留供运气债务计算使用
  ANTI_EMPTY_CONFIG: _ANTI_EMPTY_CONFIG, // 预留供防连续空奖处理使用
  ANTI_HIGH_CONFIG: _ANTI_HIGH_CONFIG, // 预留供防连续高价值处理使用
  isFeatureEnabled,
  getGrayscaleSummary // Phase P2：获取灰度配置摘要
} = require('./config/ComputeConfig')

/**
 * 预算档位定义（B0-B3）
 *
 * 基于 StrategyConfig.BUDGET_TIER_CONFIG 动态生成
 * - B0: effective_budget < threshold_low（仅 fallback）
 * - B1: threshold_low <= effective_budget < threshold_mid
 * - B2: threshold_mid <= effective_budget < threshold_high
 * - B3: effective_budget >= threshold_high
 *
 * @type {Object<string, {min: number, max: number, description: string, allowed_tiers: string[]}>}
 */
const BUDGET_TIERS = {
  B0: {
    min: 0,
    max: BUDGET_TIER_CONFIG.threshold_low - 1,
    description: '无预算（只能抽空奖）',
    allowed_tiers: BUDGET_TIER_AVAILABILITY.B0
  },
  B1: {
    min: BUDGET_TIER_CONFIG.threshold_low,
    max: BUDGET_TIER_CONFIG.threshold_mid - 1,
    description: `低预算（${BUDGET_TIER_CONFIG.threshold_low}-${BUDGET_TIER_CONFIG.threshold_mid - 1}分）`,
    allowed_tiers: BUDGET_TIER_AVAILABILITY.B1
  },
  B2: {
    min: BUDGET_TIER_CONFIG.threshold_mid,
    max: BUDGET_TIER_CONFIG.threshold_high - 1,
    description: `中预算（${BUDGET_TIER_CONFIG.threshold_mid}-${BUDGET_TIER_CONFIG.threshold_high - 1}分）`,
    allowed_tiers: BUDGET_TIER_AVAILABILITY.B2
  },
  B3: {
    min: BUDGET_TIER_CONFIG.threshold_high,
    max: Infinity,
    description: `高预算（>=${BUDGET_TIER_CONFIG.threshold_high}分）`,
    allowed_tiers: BUDGET_TIER_AVAILABILITY.B3
  }
}

/**
 * 活动压力档位定义（P0-P2）
 *
 * 基于 StrategyConfig.PRESSURE_TIER_CONFIG 动态生成
 * - P0: pressure_index < threshold_low（低压）
 * - P1: threshold_low <= pressure_index < threshold_high（中压）
 * - P2: pressure_index >= threshold_high（高压）
 *
 * @type {Object<string, {min: number, max: number, description: string}>}
 */
const PRESSURE_TIERS = {
  P0: {
    min: 0,
    max: PRESSURE_TIER_CONFIG.threshold_low,
    description: `低压（消耗<${PRESSURE_TIER_CONFIG.threshold_low * 100}%预算）`
  },
  P1: {
    min: PRESSURE_TIER_CONFIG.threshold_low,
    max: PRESSURE_TIER_CONFIG.threshold_high,
    description: `中压（消耗${PRESSURE_TIER_CONFIG.threshold_low * 100}%-${PRESSURE_TIER_CONFIG.threshold_high * 100}%预算）`
  },
  P2: {
    min: PRESSURE_TIER_CONFIG.threshold_high,
    max: Infinity,
    description: `高压（消耗>${PRESSURE_TIER_CONFIG.threshold_high * 100}%预算）`
  }
}

/**
 * 抽奖计算引擎
 *
 * 职责定位：计算引擎（负责预算分层、权重调整、概率计算），不是策略执行器
 * Pipeline 架构中由 PipelineOrchestrator 负责流程编排，本类专注计算逻辑
 */
class LotteryComputeEngine {
  /**
   * 创建策略引擎实例
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.enable_pity - 是否启用 Pity 系统（env 级默认值，运行时会被 DB 活动级覆盖）
   * @param {boolean} options.enable_luck_debt - 是否启用运气债务（env 级默认值）
   * @param {boolean} options.enable_anti_empty - 是否启用防连空（env 级默认值）
   * @param {boolean} options.enable_anti_high - 是否启用防连高（env 级默认值）
   */
  constructor(options = {}) {
    this.options = {
      enable_pity: isFeatureEnabled('pity'),
      enable_luck_debt: isFeatureEnabled('luck_debt'),
      enable_anti_empty: isFeatureEnabled('anti_empty'),
      enable_anti_high: isFeatureEnabled('anti_high'),
      ...options
    }

    // 初始化日志
    this.logger = logger

    /* 初始化各计算器实例（Phase 3-6 已实现） */
    // 使用 StrategyConfig 作为默认配置
    this.budgetTierCalculator = new BudgetTierCalculator(
      options.budget_tier_config || BUDGET_TIER_CONFIG
    )
    this.pressureTierCalculator = new PressureTierCalculator(
      options.pressure_tier_config || PRESSURE_TIER_CONFIG
    )
    this.tierMatrixCalculator = new TierMatrixCalculator(
      options.tier_matrix_config || TIER_MATRIX_CONFIG
    )

    /* Phase 9-12 新增计算器实例 */
    this.pityCalculator = new PityCalculator(
      options.pity_config ? { pity_config: options.pity_config } : {}
    )
    this.luckDebtCalculator = new LuckDebtCalculator(
      options.luck_debt_config ? { luck_debt_config: options.luck_debt_config } : {}
    )
    this.antiEmptyHandler = new AntiEmptyStreakHandler(
      options.anti_empty_config ? { anti_empty_config: options.anti_empty_config } : {}
    )
    this.antiHighHandler = new AntiHighStreakHandler(
      options.anti_high_config ? { anti_high_config: options.anti_high_config } : {}
    )

    /* Phase 15 状态管理器实例 */
    this.experienceStateManager = new ExperienceStateManager()
    this.globalStateManager = new GlobalStateManager()

    this._log('info', 'LotteryComputeEngine 初始化完成', {
      options: this.options,
      calculators_initialized: [
        'BudgetTierCalculator',
        'PressureTierCalculator',
        'TierMatrixCalculator',
        'PityCalculator',
        'LuckDebtCalculator',
        'AntiEmptyStreakHandler',
        'AntiHighStreakHandler'
      ],
      state_managers_initialized: ['ExperienceStateManager', 'GlobalStateManager']
    })
  }

  // ========== 核心接口：预算上下文计算 ==========

  /**
   * 计算预算上下文
   *
   * 集成点：BudgetContextStage
   *
   * 输入：
   * - user_id: 用户ID
   * - campaign: 活动配置（包含 budget_mode, allowed_campaign_ids 等）
   * - transaction: 事务对象（可选）
   *
   * 输出：
   * - effective_budget: 有效预算（统一口径）
   * - budget_tier: 预算档位（B0-B3）
   * - pressure_index: 压力指数（0-1+）
   * - pressure_tier: 压力档位（P0-P2）
   * - wallet_available: 钱包是否可用
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {Object} params.campaign - 活动配置对象
   * @param {string} params.campaign.budget_mode - 预算模式（'user'|'pool'|'hybrid'|'none'）
   * @param {Array<string>} params.campaign.allowed_campaign_ids - 允许的预算来源桶（user 模式）
   * @param {number} params.campaign.pool_budget_remaining - 奖池剩余预算（pool/hybrid 模式）
   * @param {number} params.campaign.pool_budget_total - 奖池总预算（pool/hybrid 模式）
   * @param {Object} params.transaction - Sequelize 事务对象（可选）
   * @returns {Promise<Object>} 预算上下文对象
   */
  async computeBudgetContext(params) {
    const { user_id, campaign, prizes, transaction } = params
    const budget_mode = campaign?.budget_mode || 'none'
    const lottery_campaign_id = campaign?.lottery_campaign_id

    this._log('debug', '开始计算预算上下文', {
      user_id,
      budget_mode,
      lottery_campaign_id
    })

    try {
      // 1. 使用 BudgetTierCalculator 计算预算分层
      const budget_context = {
        user_id,
        lottery_campaign_id,
        campaign,
        prizes
      }

      const budget_result = await this.budgetTierCalculator.calculate(budget_context, {
        transaction
      })

      // 2. 使用 PressureTierCalculator 计算活动压力分层
      const pressure_result = await this.pressureTierCalculator.calculate(budget_context, {
        transaction
      })

      // 3. 组合结果
      const result = {
        // 预算分层结果
        effective_budget: budget_result.effective_budget,
        budget_tier: budget_result.budget_tier,
        available_tiers: budget_result.available_tiers,
        budget_sufficiency: budget_result.budget_sufficiency,

        // 压力分层结果
        pressure_index: pressure_result.pressure_index,
        pressure_tier: pressure_result.pressure_tier,
        time_progress: pressure_result.time_progress,
        virtual_consumption: pressure_result.virtual_consumption,
        weight_adjustment: pressure_result.weight_adjustment,

        // 元数据
        wallet_available: budget_result.effective_budget > 0 || budget_mode === 'none',
        budget_mode,

        // 详细计算结果（用于调试和审计）
        _budget_result: budget_result,
        _pressure_result: pressure_result
      }

      this._log('info', '预算上下文计算完成', {
        user_id,
        lottery_campaign_id,
        effective_budget: result.effective_budget,
        budget_tier: result.budget_tier,
        pressure_tier: result.pressure_tier
      })

      return result
    } catch (error) {
      this._log('error', '预算上下文计算失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  // ========== 核心接口：权重调整计算 ==========

  /**
   * 计算档位权重调整
   *
   * 集成点：BuildPrizePoolStage / TierPickStage
   *
   * 基于 BxPx 矩阵计算档位权重调整乘数
   * 使用 TierMatrixCalculator 进行完整的矩阵计算
   *
   * @param {Object} params - 参数对象
   * @param {string} params.budget_tier - 预算档位（B0-B3）
   * @param {string} params.pressure_tier - 压力档位（P0-P2）
   * @param {Object} params.base_tier_weights - 基础档位权重（来自 segment 配置）
   * @returns {Object} 调整后的权重配置
   */
  computeWeightAdjustment(params) {
    const { budget_tier, pressure_tier, base_tier_weights } = params

    this._log('debug', '开始计算权重调整', {
      budget_tier,
      pressure_tier
    })

    // 使用 TierMatrixCalculator 进行完整的矩阵计算
    const matrix_result = this.tierMatrixCalculator.calculate({
      budget_tier,
      pressure_tier,
      base_weights: base_tier_weights
    })

    /* 权重调整结果 */
    const result = {
      adjusted_weights: matrix_result.final_weights,
      original_weights: base_tier_weights,
      budget_tier,
      pressure_tier,
      // 完整的矩阵计算结果
      matrix_result: {
        multipliers: matrix_result.multipliers,
        available_tiers: matrix_result.available_tiers,
        matrix_key: matrix_result.matrix_key
      }
    }

    this._log('info', '权重调整计算完成', {
      budget_tier,
      pressure_tier,
      matrix_key: matrix_result.matrix_key,
      available_tiers: matrix_result.available_tiers
    })

    return result
  }

  // ========== 核心接口：体验平滑机制 ==========

  /**
   * 应用体验平滑机制
   *
   * 集成点：TierPickStage
   *
   * 包含：Pity 系统、AntiEmpty、AntiHigh
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {string} params.selected_tier - 当前选中的档位
   * @param {Object} params.tier_weights - 当前档位权重
   * @param {Object} params.experience_state - 用户体验状态
   * @param {Object} params.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 平滑后的结果
   */
  async applyExperienceSmoothing(params) {
    const {
      user_id,
      lottery_campaign_id,
      selected_tier,
      tier_weights,
      experience_state,
      available_tiers,
      effective_budget,
      prizes_by_tier
    } = params

    this._log('debug', '开始应用体验平滑', {
      user_id,
      lottery_campaign_id,
      selected_tier
    })

    const { DynamicConfigLoader } = require('./config/ComputeConfig')
    const campaign_opts = { lottery_campaign_id }

    /**
     * 活动级开关读取（优先级：DB活动级 > env环境变量 > 代码默认true）
     * 拆分 enable_anti_streak 为 anti_empty / anti_high 两个独立开关
     */
    const pity_enabled = await DynamicConfigLoader.getValue(
      'pity',
      'enabled',
      this.options.enable_pity,
      campaign_opts
    )
    const anti_empty_enabled = await DynamicConfigLoader.getValue(
      'anti_empty',
      'enabled',
      isFeatureEnabled('anti_empty'),
      campaign_opts
    )
    const anti_high_enabled = await DynamicConfigLoader.getValue(
      'anti_high',
      'enabled',
      isFeatureEnabled('anti_high'),
      campaign_opts
    )
    const luck_debt_enabled = await DynamicConfigLoader.getValue(
      'luck_debt',
      'enabled',
      this.options.enable_luck_debt,
      campaign_opts
    )

    let final_tier = selected_tier
    let final_weights = { ...tier_weights }
    const applied_mechanisms = []

    // 1. Pity 系统：根据连续空奖次数提升非空奖概率
    if (pity_enabled && experience_state) {
      const pity_result = this._applyPitySystem({
        empty_streak: experience_state.empty_streak || 0,
        tier_weights: final_weights
      })

      if (pity_result.pity_triggered) {
        final_weights = pity_result.adjusted_weights
        applied_mechanisms.push({
          type: 'pity',
          empty_streak: experience_state.empty_streak,
          boost_multiplier: pity_result.boost_multiplier
        })
      }
    }

    // 2. AntiEmpty：连续空奖保护（独立开关）
    if (anti_empty_enabled && experience_state) {
      const anti_empty_result = this._applyAntiEmptyStreak({
        empty_streak: experience_state.empty_streak || 0,
        selected_tier: final_tier,
        tier_weights: final_weights,
        available_tiers,
        effective_budget,
        prizes_by_tier,
        user_id,
        lottery_campaign_id
      })

      if (anti_empty_result.forced) {
        final_tier = anti_empty_result.final_tier
        applied_mechanisms.push({
          type: 'anti_empty',
          empty_streak: experience_state.empty_streak,
          forced_tier: final_tier
        })
      }
    }

    // 3. AntiHigh：连续高价值保护（独立开关）
    if (anti_high_enabled && experience_state) {
      const anti_high_result = this._applyAntiHighStreak({
        recent_high_count: experience_state.recent_high_count || 0,
        anti_high_cooldown: experience_state.anti_high_cooldown || 0,
        selected_tier: final_tier,
        tier_weights: final_weights,
        prizes_by_tier,
        user_id,
        lottery_campaign_id
      })

      if (anti_high_result.tier_capped) {
        final_tier = anti_high_result.final_tier
        applied_mechanisms.push({
          type: 'anti_high',
          recent_high_count: experience_state.recent_high_count,
          capped_tier: anti_high_result.final_tier
        })
      }
    }

    const result = {
      final_tier,
      final_weights,
      original_tier: selected_tier,
      original_weights: tier_weights,
      applied_mechanisms,
      smoothing_applied: applied_mechanisms.length > 0,
      switch_states: { pity_enabled, anti_empty_enabled, anti_high_enabled, luck_debt_enabled }
    }

    this._log('info', '体验平滑应用完成', {
      user_id,
      lottery_campaign_id,
      smoothing_applied: result.smoothing_applied,
      mechanisms_count: applied_mechanisms.length
    })

    return result
  }

  // ========== 核心接口：状态更新 ==========

  /**
   * 更新用户体验状态
   *
   * 集成点：SettleStage
   *
   * 抽奖结算后更新用户的体验状态计数器
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {string} params.reward_tier - 获得的奖品档位
   * @param {number} params.prize_value_points - 奖品积分价值
   * @param {boolean} params.is_empty_prize - 是否为空奖
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<Object>} 更新后的状态
   */
  async updateExperienceState(params) {
    const {
      user_id,
      lottery_campaign_id,
      reward_tier,
      prize_value_points: _prize_value_points, // eslint-disable-line no-unused-vars -- 保留参数完整性，不再用于 is_empty 判定
      is_empty_prize,
      transaction
    } = params

    this._log('debug', '开始更新体验状态', {
      user_id,
      lottery_campaign_id,
      reward_tier,
      is_empty_prize
    })

    try {
      /**
       * 🔴 2026-02-15 修复：is_empty 判定逻辑
       * 只有 'fallback' 和 'empty' 档位才是真正的空奖
       * prize_value_points=0 的 low 档位奖品是"参与奖"，不计入空奖
       */
      const is_empty = is_empty_prize || reward_tier === 'empty' || reward_tier === 'fallback'

      const experience_state = await this.experienceStateManager.updateState(
        {
          user_id,
          lottery_campaign_id,
          is_empty,
          draw_tier: reward_tier
        },
        { transaction }
      )

      // 2. 更新全局状态（跨活动统计）
      const is_first_draw = await this.globalStateManager.isFirstParticipation(
        { user_id, lottery_campaign_id },
        { transaction }
      )

      const global_state = await this.globalStateManager.updateState(
        {
          user_id,
          lottery_campaign_id,
          draw_tier: reward_tier,
          is_first_draw_in_campaign: is_first_draw
        },
        { transaction }
      )

      const result = {
        user_id,
        lottery_campaign_id,
        updated: true,
        experience_state,
        global_state
      }

      this._log('info', '体验状态更新完成', {
        user_id,
        lottery_campaign_id,
        empty_streak: experience_state?.empty_streak,
        luck_debt_level: global_state?.luck_debt_level
      })

      return result
    } catch (error) {
      this._log('error', '体验状态更新失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })

      // 状态更新失败不应阻断主流程
      return {
        user_id,
        lottery_campaign_id,
        updated: false,
        error: error.message
      }
    }
  }

  /* ========== 核心接口：运气债务 ========== */

  /**
   * 获取运气债务乘数
   *
   * 集成点：TierPickStage / BuildPrizePoolStage
   *
   * 基于用户历史空奖率计算补偿乘数
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {Object} params.global_state - 用户全局状态
   * @param {Object} params.tier_weights - 当前档位权重（可选，用于调整）
   * @returns {Object} 运气债务信息
   */
  getLuckDebtMultiplier(params) {
    const { global_state, tier_weights } = params

    if (!this.options.enable_luck_debt || !global_state) {
      return {
        multiplier: 1.0,
        debt_level: 'none',
        enabled: false,
        adjusted_weights: tier_weights
      }
    }

    // 使用 LuckDebtCalculator 计算运气债务
    const result = this.luckDebtCalculator.calculate({
      global_state,
      tier_weights
    })

    return {
      multiplier: result.multiplier, // 正确字段名
      debt_level: result.debt_level, // 正确字段名
      enabled: true,
      adjusted_weights: result.adjusted_weights,
      historical_empty_rate: result.historical_empty_rate,
      sample_sufficient: result.sample_sufficient
    }
  }

  /* ========== 内部方法：EffectiveBudget 计算 ========== */

  /**
   * 计算有效预算（核心算法）
   *
   * 🔴 关键逻辑：修正文档中发现的 allowed_campaign_ids 误读问题
   *
   * 规则：
   * - user 模式：从 allowed_campaign_ids 指定的来源桶汇总 BUDGET_POINTS
   * - pool 模式：使用 pool_budget_remaining
   * - hybrid 模式：min(user_budget, pool_budget_remaining)
   * - none 模式：返回 0
   *
   * @param {Object} params - 参数对象
   * @returns {Promise<Object>} { effective_budget, wallet_available }
   * @private
   */
  async _calculateEffectiveBudget(params) {
    const { user_id, campaign, budget_mode, transaction } = params

    // none 模式：无预算限制，但也无预算可用
    if (budget_mode === 'none') {
      return {
        effective_budget: 0,
        wallet_available: false
      }
    }

    // user 模式：从用户钱包获取 BUDGET_POINTS
    if (budget_mode === 'user') {
      const allowed_ids = campaign?.allowed_campaign_ids || []

      // 🔴 关键修正：allowed_campaign_ids 为空视为钱包不可用
      if (!allowed_ids || allowed_ids.length === 0) {
        this._log('warn', 'user 模式但 allowed_campaign_ids 为空，返回 0 预算', {
          user_id,
          lottery_campaign_id: campaign?.lottery_campaign_id
        })
        return {
          effective_budget: 0,
          wallet_available: false
        }
      }

      // 使用 QueryService.getBudgetPointsByCampaigns 正确获取预算
      const QueryService = require('../../asset/QueryService')
      const user_budget = await QueryService.getBudgetPointsByCampaigns(
        { user_id, lottery_campaign_ids: allowed_ids },
        { transaction }
      )

      return {
        effective_budget: user_budget,
        wallet_available: true
      }
    }

    // pool 模式：使用奖池剩余预算
    if (budget_mode === 'pool') {
      const pool_remaining = campaign?.pool_budget_remaining ?? 0

      // 🔴 关键修正：pool_remaining 为 0 视为钱包不可用
      if (pool_remaining <= 0) {
        return {
          effective_budget: 0,
          wallet_available: false
        }
      }

      return {
        effective_budget: pool_remaining,
        wallet_available: true
      }
    }

    // hybrid 模式：取用户预算和奖池预算的较小值
    if (budget_mode === 'hybrid') {
      const allowed_ids = campaign?.allowed_campaign_ids || []
      const pool_remaining = campaign?.pool_budget_remaining ?? 0

      // 分别检查两个钱包
      let user_budget = 0
      let user_wallet_available = false

      if (allowed_ids && allowed_ids.length > 0) {
        const QueryService = require('../../asset/QueryService')
        user_budget = await QueryService.getBudgetPointsByCampaigns(
          { user_id, lottery_campaign_ids: allowed_ids },
          { transaction }
        )
        user_wallet_available = true
      }

      const pool_wallet_available = pool_remaining > 0

      // 两个钱包都不可用
      if (!user_wallet_available && !pool_wallet_available) {
        return {
          effective_budget: 0,
          wallet_available: false
        }
      }

      // 取较小值
      const effective_budget = Math.min(
        user_wallet_available ? user_budget : Infinity,
        pool_wallet_available ? pool_remaining : Infinity
      )

      return {
        effective_budget,
        wallet_available: true
      }
    }

    // 未知模式：降级为无预算
    this._log('warn', '未知的 budget_mode，降级为 none', { budget_mode })
    return {
      effective_budget: 0,
      wallet_available: false
    }
  }

  // ========== 内部方法：BudgetTier 判定 ==========

  /**
   * 判定预算档位
   *
   * @param {number} effective_budget - 有效预算
   * @returns {string} 预算档位（B0-B3）
   * @private
   */
  _determineBudgetTier(effective_budget) {
    if (effective_budget <= 0) return 'B0'
    if (effective_budget <= 100) return 'B1'
    if (effective_budget <= 500) return 'B2'
    return 'B3'
  }

  // ========== 内部方法：Pressure 计算 ==========

  /**
   * 计算活动压力
   *
   * 基于虚拟消耗法：pressure_index = actual_cost / (total_budget * time_progress)
   *
   * @param {Object} params - 参数对象
   * @returns {Object} { pressure_index, pressure_tier }
   * @private
   */
  _calculatePressure(params) {
    const { campaign, budget_mode } = params

    // none 模式无压力概念
    if (budget_mode === 'none') {
      return {
        pressure_index: 0,
        pressure_tier: 'P0'
      }
    }

    // 获取活动总预算和已消耗
    const total_budget = campaign?.pool_budget_total || campaign?.budget_total || 0
    const remaining_budget = campaign?.pool_budget_remaining ?? total_budget
    const actual_cost = total_budget - remaining_budget

    // 计算时间进度
    const time_progress = this._calculateTimeProgress(campaign)

    // 计算压力指数
    let pressure_index = 0
    if (total_budget > 0 && time_progress > 0) {
      const expected_cost = total_budget * time_progress
      pressure_index = expected_cost > 0 ? actual_cost / expected_cost : 0
    }

    // 判定压力档位
    const pressure_tier = this._determinePressureTier(pressure_index)

    return {
      pressure_index,
      pressure_tier
    }
  }

  /**
   * 计算时间进度
   *
   * @param {Object} campaign - 活动配置
   * @returns {number} 时间进度（0-1）
   * @private
   */
  _calculateTimeProgress(campaign) {
    if (!campaign?.start_time || !campaign?.end_time) {
      return 0.5 // 无时间配置时默认 50%
    }

    const now = Date.now()
    const start = new Date(campaign.start_time).getTime()
    const end = new Date(campaign.end_time).getTime()

    if (now <= start) return 0
    if (now >= end) return 1

    return (now - start) / (end - start)
  }

  /**
   * 判定压力档位
   *
   * @param {number} pressure_index - 压力指数
   * @returns {string} 压力档位（P0-P2）
   * @private
   */
  _determinePressureTier(pressure_index) {
    if (pressure_index < 0.5) return 'P0'
    if (pressure_index < 0.8) return 'P1'
    return 'P2'
  }

  // ========== 内部方法：矩阵乘数 ==========

  /**
   * 获取 BxPx 矩阵乘数
   *
   * @param {string} budget_tier - 预算档位
   * @param {string} pressure_tier - 压力档位
   * @returns {number} 空奖权重乘数
   * @private
   */
  _getMatrixMultiplier(budget_tier, pressure_tier) {
    // 使用 TIER_MATRIX_CONFIG 获取 empty_weight_multiplier
    const tier_config = TIER_MATRIX_CONFIG[budget_tier]
    if (!tier_config) {
      this._log('warn', '未知的 budget_tier，使用默认乘数', { budget_tier })
      return 1.0
    }

    const pressure_config = tier_config[pressure_tier]
    if (!pressure_config || pressure_config.empty_weight_multiplier === undefined) {
      this._log('warn', '未知的 pressure_tier，使用默认乘数', { pressure_tier })
      return 1.0
    }

    return pressure_config.empty_weight_multiplier
  }

  // ========== 内部方法：Pity 系统 ==========

  /**
   * 应用 Pity 系统
   *
   * 委托给 PityCalculator 执行
   *
   * @param {Object} params - 参数对象
   * @returns {Object} Pity 计算结果
   * @private
   */
  _applyPitySystem(params) {
    return this.pityCalculator.calculate(params)
  }

  /* ========== 内部方法：AntiEmpty ========== */

  /**
   * 应用防连续空奖机制
   *
   * 委托给 AntiEmptyStreakHandler 执行
   *
   * @param {Object} params - 参数对象
   * @returns {Object} 处理结果
   * @private
   */
  _applyAntiEmptyStreak(params) {
    return this.antiEmptyHandler.handle(params)
  }

  /* ========== 内部方法：AntiHigh ========== */

  /**
   * 应用防连续高价值机制
   *
   * 委托给 AntiHighStreakHandler 执行
   *
   * @param {Object} params - 参数对象
   * @returns {Object} 处理结果
   * @private
   */
  _applyAntiHighStreak(params) {
    return this.antiHighHandler.handle(params)
  }

  /* ========== 工具方法 ========== */

  /**
   * 日志记录
   *
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void}
   * @private
   */
  _log(level, message, data = {}) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[LotteryComputeEngine] ${message}`, data)
    }
  }

  /**
   * 获取策略引擎状态
   *
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      engine_name: 'LotteryComputeEngine',
      version: '2.0.0',
      options: this.options,
      budget_tiers: BUDGET_TIERS,
      pressure_tiers: PRESSURE_TIERS,
      matrix: TIER_MATRIX_CONFIG,
      grayscale_summary: getGrayscaleSummary() // Phase P2：灰度配置摘要
    }
  }

  /*
   * 2026-02-23 9策略活动级开关改造：删除约350行死代码
   * checkFeatureWithGrayscale / applyExperienceSmoothingWithGrayscale
   * checkFeatureWithFeatureFlag / applyExperienceSmoothingWithFeatureFlag
   * getLuckDebtMultiplierWithFeatureFlag
   * 灰度逻辑已由 DynamicConfigLoader 活动级配置完全覆盖，如需恢复查阅 git 历史
   */
}

/* 导出类和常量 */
module.exports = LotteryComputeEngine
module.exports.BUDGET_TIERS = BUDGET_TIERS
module.exports.PRESSURE_TIERS = PRESSURE_TIERS
module.exports.TIER_MATRIX_CONFIG = TIER_MATRIX_CONFIG
