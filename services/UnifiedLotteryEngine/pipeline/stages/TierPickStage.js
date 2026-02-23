'use strict'

/**
 * TierPickStage - 档位抽取 Stage
 *
 * 职责：
 * 1. 根据用户分群（segment）获取对应的档位权重配置
 * 2. 应用 BxPx 矩阵权重调整（根据 budget_tier 和 pressure_tier）
 * 3. 使用整数权重系统（SCALE = 1,000,000）进行档位抽取
 * 4. 实现固定降级路径：high → mid → low → fallback
 * 5. 当选中档位无可用奖品时自动降级
 *
 * 输出到上下文：
 * - selected_tier: 最终选中的档位
 * - original_tier: 原始抽中的档位（降级前）
 * - tier_downgrade_path: 降级路径（如 ['high', 'mid', 'low']）
 * - random_value: 抽取时使用的随机数
 * - tier_weights: 基础档位权重配置
 * - adjusted_weights: BxPx 矩阵调整后的权重
 * - budget_tier: 预算分层（来自 BudgetContextStage）
 * - pressure_tier: 压力分层（来自 BudgetContextStage）
 *
 * 计算引擎集成：
 * - 从 BuildPrizePoolStage 获取 budget_tier 和 pressure_tier
 * - 调用 LotteryComputeEngine.computeWeightAdjustment() 获取权重调整
 * - 应用 BxPx 矩阵调整 fallback 档位权重
 *
 * 设计原则：
 * - 档位优先：先抽档位，再在档位内抽奖品
 * - 不做概率归一化：严格按照配置的权重执行
 * - 固定降级路径：high → mid → low → fallback
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/TierPickStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { SegmentResolver } = require('../../../../config/segment_rules')
const { User, LotteryUserExperienceState, LotteryDraw } = require('../../../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/* 抽奖计算引擎 */
const LotteryComputeEngine = require('../../compute/LotteryComputeEngine')

/* 动态配置加载器（读取活动级 pressure/matrix 开关） */
const { DynamicConfigLoader } = require('../../compute/config/StrategyConfig')

/**
 * 权重缩放比例（整数权重系统）
 * 例如：weight = 100000 表示 10% 的概率
 */
const WEIGHT_SCALE = 1000000

/**
 * 档位降级顺序（固定路径）
 */
const TIER_DOWNGRADE_PATH = ['high', 'mid', 'low', 'fallback']

/**
 * 档位抽取 Stage
 */
class TierPickStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('TierPickStage', {
      is_writer: false,
      required: true
    })

    /* 初始化抽奖计算引擎实例 */
    this.computeEngine = new LotteryComputeEngine()
  }

  /**
   * 执行档位抽取
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id } = context

    this.log('info', '开始档位抽取', { user_id, lottery_campaign_id })

    try {
      /*
       * 🎯 Phase 1 新增：根据 decision_source 判断是否跳过正常抽取
       * preset/override 模式不需要执行正常的档位抽取逻辑
       */
      const decision_data = this.getContextData(context, 'LoadDecisionSourceStage.data')
      const decision_source = decision_data?.decision_source || 'normal'

      // preset 模式：使用预设奖品，跳过档位抽取
      if (decision_source === 'preset' && decision_data?.preset) {
        const preset = decision_data.preset
        let preset_tier = preset.reward_tier || 'high'

        // 预设模式也受每日高档上限约束，防止运营配置大量高档预设绕过风控
        if (preset_tier === 'high') {
          preset_tier = await this._enforceDailyHighCap(
            user_id,
            lottery_campaign_id,
            preset_tier,
            context
          )
        }

        this.log('info', '预设模式：跳过档位抽取，使用预设档位', {
          user_id,
          decision_source,
          preset_tier
        })
        return this.success({
          selected_tier: preset_tier,
          original_tier: preset.reward_tier || 'high',
          tier_downgrade_path: [],
          random_value: 0,
          tier_weights: {},
          weight_scale: WEIGHT_SCALE,
          decision_source,
          skipped: true,
          skip_reason: 'preset_mode'
        })
      }

      // override 模式：根据干预类型决定档位
      if (decision_source === 'override' && decision_data?.override) {
        const override = decision_data.override
        const override_type = override.setting_type || override.override_type
        let override_tier = override_type === 'force_win' ? 'high' : 'fallback'

        if (override_tier === 'high') {
          override_tier = await this._enforceDailyHighCap(
            user_id,
            lottery_campaign_id,
            override_tier,
            context
          )
        }

        this.log('info', '干预模式：跳过档位抽取，使用干预档位', {
          user_id,
          decision_source,
          override_type,
          override_tier
        })
        return this.success({
          selected_tier: override_tier,
          original_tier: override_type === 'force_win' ? 'high' : 'fallback',
          tier_downgrade_path: [],
          random_value: 0,
          tier_weights: {},
          weight_scale: WEIGHT_SCALE,
          decision_source,
          skipped: true,
          skip_reason: 'override_mode'
        })
      }

      // guarantee 模式：使用高档位（同样受每日上限约束）
      if (decision_source === 'guarantee') {
        let guarantee_tier = 'high'
        guarantee_tier = await this._enforceDailyHighCap(
          user_id,
          lottery_campaign_id,
          guarantee_tier,
          context
        )

        this.log('info', '保底模式：强制使用高档位', {
          user_id,
          decision_source,
          final_tier: guarantee_tier
        })
        return this.success({
          selected_tier: guarantee_tier,
          original_tier: 'high',
          tier_downgrade_path: [],
          random_value: 0,
          tier_weights: {},
          weight_scale: WEIGHT_SCALE,
          decision_source,
          skipped: true,
          skip_reason: 'guarantee_mode'
        })
      }

      // 获取活动配置（从 LoadCampaignStage 的结果中）
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
      if (!campaign_data || !campaign_data.campaign) {
        throw this.createError(
          '缺少活动配置数据，请确保 LoadCampaignStage 已执行',
          'MISSING_CAMPAIGN_DATA',
          true
        )
      }

      const campaign = campaign_data.campaign
      const tier_rules = campaign_data.tier_rules || []

      /*
       * normalize 选奖模式：跳过档位选择，直接由 PrizePickStage 按 win_probability 归一化抽取
       * 此模式下不区分 reward_tier，所有奖品在同一个池中按概率竞争
       */
      if (campaign.pick_method === 'normalize') {
        this.log('info', 'normalize 模式：跳过档位选择，交由 PrizePickStage 按概率抽取', {
          user_id,
          lottery_campaign_id,
          pick_method: 'normalize'
        })
        return this.success({
          selected_tier: 'normalize',
          original_tier: 'normalize',
          tier_downgrade_path: [],
          random_value: 0,
          tier_weights: {},
          weight_scale: WEIGHT_SCALE,
          decision_source: 'normal',
          skipped: true,
          skip_reason: 'normalize_mode'
        })
      }

      /* 获取奖品池信息（从 BuildPrizePoolStage 的结果中） */
      const prize_pool_data = this.getContextData(context, 'BuildPrizePoolStage.data')
      if (!prize_pool_data) {
        throw this.createError(
          '缺少奖品池数据，请确保 BuildPrizePoolStage 已执行',
          'MISSING_PRIZE_POOL_DATA',
          true
        )
      }

      const prizes_by_tier = prize_pool_data.prizes_by_tier
      const available_tiers = prize_pool_data.available_tiers

      /* 获取预算分层信息（来自 BudgetContextStage，经由 BuildPrizePoolStage 传递） */
      const budget_tier = prize_pool_data.budget_tier || 'B1'
      const effective_budget = prize_pool_data.effective_budget || 0

      /**
       * 活动级 pressure.enabled 开关（lottery_strategy_config 表）
       * 关闭后固定返回 P0，乘数恒为 1.0，不影响权重
       */
      const pressure_enabled = await DynamicConfigLoader.getValue(
        'pressure_tier',
        'enabled',
        true,
        { lottery_campaign_id }
      )
      const pressure_tier = pressure_enabled ? prize_pool_data.pressure_tier || 'P1' : 'P0'

      if (!pressure_enabled) {
        this.log('info', '活动压力策略已关闭（pressure_tier.enabled=false），固定使用 P0', {
          user_id,
          lottery_campaign_id
        })
      }

      /* 1. 解析用户分群 */
      const user_segment = await this._resolveUserSegment(user_id, campaign)

      /* 2. 获取分群对应的基础档位权重 */
      const base_tier_weights = this._getTierWeights(user_segment, tier_rules, campaign)

      /**
       * 活动级 matrix.enabled 开关（lottery_strategy_config 表）
       * 关闭后 computeWeightAdjustment() 直接返回原始权重，所有乘数恒为 1.0
       */
      const matrix_enabled = await DynamicConfigLoader.getValue('matrix', 'enabled', true, {
        lottery_campaign_id
      })

      let adjusted_weights
      let weight_adjustment = { adjusted_weights: null, empty_weight_multiplier: 1.0 }
      if (matrix_enabled) {
        /* 3. 应用 BxPx 矩阵权重调整（策略引擎集成） */
        weight_adjustment = this.computeEngine.computeWeightAdjustment({
          budget_tier,
          pressure_tier,
          base_tier_weights
        })
        adjusted_weights = weight_adjustment.adjusted_weights

        this.log('info', 'BxPx 矩阵权重调整', {
          user_id,
          budget_tier,
          pressure_tier,
          base_weights: base_tier_weights,
          adjusted_weights,
          empty_weight_multiplier: weight_adjustment.empty_weight_multiplier
        })
      } else {
        /* 矩阵关闭：直接使用基础档位权重，不做任何调整 */
        adjusted_weights = { ...base_tier_weights }
        this.log('info', 'BxPx 矩阵已关闭（matrix.enabled=false），使用原始权重', {
          user_id,
          base_weights: base_tier_weights
        })
      }

      /**
       * 🛡️ 4a. 强制概率硬上限（不可绕过的安全网 - 2026-02-15 新增）
       *
       * 业务背景：
       * - 无论 BxPx 矩阵、体验平滑等机制如何调整权重
       * - high 档位的最终概率不得超过 MAX_HIGH_TIER_PROBABILITY
       * - 防止因配置错误、代码缺陷导致高价值奖品中奖率失控
       *
       * 实现方式：
       * - 如果 adjusted_weights.high 占比 > 上限，强制压缩到上限
       * - 被压缩的权重按比例分配给 low 和 mid
       */
      const MAX_HIGH_TIER_PROBABILITY = 0.08 // 最大 8% 高价值中奖率
      const capped_weights = this._enforceHighTierCap(adjusted_weights, MAX_HIGH_TIER_PROBABILITY)

      /* 4b. 执行档位抽取（使用限制后的权重） */
      const random_value = Math.random() * WEIGHT_SCALE
      const original_tier = this._pickTier(capped_weights, random_value)

      /* 5. 检查选中档位是否有可用奖品，必要时降级 */
      let { selected_tier, downgrade_path } = this._applyDowngrade(
        original_tier,
        prizes_by_tier,
        available_tiers
      )

      /* 🛡️ 单用户每日高价值中奖硬上限保护（统一入口方法） */
      let daily_high_capped = false

      if (selected_tier === 'high') {
        const capped_tier = await this._enforceDailyHighCap(
          user_id,
          lottery_campaign_id,
          selected_tier,
          context
        )
        if (capped_tier !== selected_tier) {
          const mid_prizes = prizes_by_tier.mid || []
          const low_prizes = prizes_by_tier.low || []
          if (capped_tier === 'mid' && mid_prizes.length > 0) {
            selected_tier = 'mid'
          } else if (low_prizes.length > 0) {
            selected_tier = 'low'
          } else {
            selected_tier = 'fallback'
          }
          daily_high_capped = true
        }
      }

      /* 6. 应用体验平滑机制（Pity / AntiEmpty / AntiHigh） */
      let experience_state = null
      let smoothing_result = null
      let final_tier = selected_tier

      try {
        // 获取用户活动级体验状态
        experience_state = await LotteryUserExperienceState.findOne({
          where: { user_id, lottery_campaign_id }
        })

        if (experience_state) {
          // 调用策略引擎应用体验平滑
          smoothing_result = await this.computeEngine.applyExperienceSmoothing({
            user_id,
            lottery_campaign_id,
            selected_tier,
            tier_weights: adjusted_weights,
            experience_state: experience_state.toJSON(),
            available_tiers,
            effective_budget,
            prizes_by_tier
          })

          // 如果体验平滑改变了档位，更新 final_tier
          if (smoothing_result.smoothing_applied) {
            final_tier = smoothing_result.final_tier
            this.log('info', '体验平滑已应用', {
              user_id,
              lottery_campaign_id,
              original_selected_tier: selected_tier,
              smoothed_tier: final_tier,
              applied_mechanisms: smoothing_result.applied_mechanisms.map(m => m.type)
            })
          }
        }
      } catch (smoothing_error) {
        // 体验平滑失败不应阻断抽奖，记录警告继续执行
        this.log('warn', '体验平滑处理失败（非致命）', {
          user_id,
          lottery_campaign_id,
          error: smoothing_error.message
        })
      }

      /* 7. 构建返回数据 */
      const result = {
        selected_tier: final_tier,
        original_tier,
        tier_downgrade_path: downgrade_path,
        random_value,
        tier_weights: base_tier_weights,
        adjusted_weights: capped_weights,
        user_segment,
        weight_scale: WEIGHT_SCALE,
        /* 策略引擎分层信息 */
        budget_tier,
        pressure_tier,
        effective_budget,
        empty_weight_multiplier: weight_adjustment.empty_weight_multiplier,
        /* 每日高价值硬上限保护 */
        daily_high_capped,
        /* 体验平滑信息 */
        experience_smoothing: smoothing_result
          ? {
              applied: smoothing_result.smoothing_applied,
              original_selected_tier: selected_tier,
              final_tier,
              mechanisms: smoothing_result.applied_mechanisms || []
            }
          : { applied: false, original_selected_tier: selected_tier, final_tier, mechanisms: [] }
      }

      this.log('info', '档位抽取完成', {
        user_id,
        lottery_campaign_id,
        user_segment,
        budget_tier,
        pressure_tier,
        original_tier,
        selected_tier: final_tier,
        downgrade_count: downgrade_path.length - 1,
        random_value: ((random_value / WEIGHT_SCALE) * 100).toFixed(4) + '%',
        smoothing_applied: smoothing_result?.smoothing_applied || false
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '档位抽取失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 解析用户分群
   *
   * 根据架构设计方案 DR-15 和 DR-17：
   * - segment_key 是代码级策略，存储在 config/segment_rules.js
   * - 通过 campaign.segment_resolver_version 指定使用哪个版本
   * - 需要查询用户信息（created_at, history_total_points 等）来匹配规则
   *
   * @param {number} user_id - 用户ID
   * @param {Object} campaign - 活动配置
   * @returns {Promise<string>} 用户分群标识
   * @private
   */
  async _resolveUserSegment(user_id, campaign) {
    try {
      // 获取分层规则版本（默认使用 'default' 版本）
      const resolver_version = campaign.segment_resolver_version || 'default'

      // 验证版本是否有效
      if (!SegmentResolver.isValidVersion(resolver_version)) {
        this.log('warn', '无效的分层规则版本，使用默认版本', {
          user_id,
          requested_version: resolver_version
        })
        return 'default'
      }

      /*
       * 查询用户信息用于分群规则匹配
       * 注意：users 表当前没有 last_active_at 字段，使用 updated_at 作为替代
       */
      const user = await User.findByPk(user_id, {
        attributes: ['user_id', 'created_at', 'updated_at']
      })

      if (!user) {
        this.log('warn', '用户不存在，使用默认分群', { user_id })
        return 'default'
      }

      // 优先从数据库加载自定义分群规则，回退到内置规则
      const segment = await SegmentResolver.resolveSegmentAsync(resolver_version, user.toJSON())

      this.log('info', '用户分群解析成功', {
        user_id,
        resolver_version,
        segment_key: segment
      })

      return segment || 'default'
    } catch (error) {
      this.log('warn', '解析用户分群失败，使用默认分群', {
        user_id,
        error: error.message
      })
      return 'default'
    }
  }

  /**
   * 获取分群对应的档位权重
   *
   * 🔴 2026-02-15 修复：增加分群回退逻辑
   * 问题根因：
   * - v1 segment resolver 返回 'regular_user'
   * - 但 lottery_tier_rules 表只有 'default'/'new_user'/'vip_user' 分群
   * - 导致匹配不到任何规则，使用代码硬编码的默认权重
   * - 数据库配置的 tier_rules 完全失效
   *
   * 修复方案：当指定分群无规则时，回退到 'default' 分群的规则
   *
   * @param {string} segment - 用户分群
   * @param {Array} tier_rules - 档位规则列表
   * @param {Object} _campaign - 活动配置（预留用于扩展权重计算）
   * @returns {Object} 档位权重 { high: weight, mid: weight, low: weight, fallback: weight }
   * @private
   */
  _getTierWeights(segment, tier_rules, _campaign) {
    /**
     * 默认权重配置
     *
     * 🔴 2026-02-15 修复：fallback 默认权重设为 0
     *
     * 修复根因：
     * - 数据库 lottery_tier_rules.tier_name 是 ENUM('high','mid','low')，不含 'fallback'
     * - 数据库中没有 reward_tier='fallback' 的奖品
     * - 原代码 fallback=500000（50%）导致大量抽奖选中 fallback 但无奖品可发
     * - fallback 降级路径是终点，无法向上回退，造成异常
     *
     * 修复方案：
     * - fallback 默认权重设为 0，正常抽奖不会选中 fallback
     * - B0 用户（预算不足）通过 BxPx 矩阵 _filterByAvailability 强制只能抽 fallback
     * - 只有在数据库显式配置了 fallback 奖品时，才需要为 fallback 分配权重
     */
    const default_weights = {
      high: 50000, // 5%
      mid: 150000, // 15%
      low: 800000, // 80%（包含零值安慰奖品）
      fallback: 0 // 0%（无 fallback 奖品时不分配权重）
    }

    // 从 tier_rules 中查找匹配的分群配置
    let segment_rules = tier_rules.filter(r => r.segment_key === segment)

    /**
     * 🔴 2026-02-15 修复：分群回退机制
     * 当指定分群无匹配规则时，回退到 'default' 分群
     * 确保数据库配置的 tier_rules 不会因为 segment 不匹配而被忽略
     */
    if (segment_rules.length === 0 && segment !== 'default') {
      this.log('warn', '未找到指定分群配置，回退到 default 分群', {
        original_segment: segment,
        fallback_segment: 'default'
      })
      segment_rules = tier_rules.filter(r => r.segment_key === 'default')
    }

    if (segment_rules.length === 0) {
      this.log('debug', '未找到任何分群配置，使用代码默认权重', {
        segment,
        default_weights
      })
      return default_weights
    }

    // 构建权重映射
    const weights = { ...default_weights }
    for (const rule of segment_rules) {
      if (rule.tier_name && typeof rule.tier_weight === 'number') {
        weights[rule.tier_name] = rule.tier_weight
      }
    }

    this.log('debug', '使用分群档位权重', {
      segment,
      weights
    })

    return weights
  }

  /**
   * 执行档位抽取
   *
   * @param {Object} weights - 档位权重 { high: weight, mid: weight, low: weight, fallback: weight }
   * @param {number} random_value - 随机数（0 ~ WEIGHT_SCALE）
   * @returns {string} 选中的档位
   * @private
   */
  _pickTier(weights, random_value) {
    let cumulative = 0

    // 按照固定顺序遍历档位
    for (const tier of TIER_DOWNGRADE_PATH) {
      const weight = weights[tier] || 0
      cumulative += weight

      if (random_value < cumulative) {
        return tier
      }
    }

    // 如果随机数超出总权重（理论上不应发生），返回 fallback
    this.log('warn', '随机数超出总权重范围，返回 fallback', {
      random_value,
      total_weight: cumulative
    })
    return 'fallback'
  }

  /**
   * 强制 high 档位概率硬上限（不可绕过的安全网）
   *
   * 无论权重如何计算，high 档位的占比不得超过 maxRatio
   * 超出的权重按比例分配给 low 和 mid 档位
   *
   * @param {Object} weights - 档位权重 { high, mid, low, fallback }
   * @param {number} maxRatio - high 档位最大概率（如 0.08 = 8%）
   * @returns {Object} 限制后的权重
   * @private
   */
  _enforceHighTierCap(weights, maxRatio) {
    const total = Object.values(weights).reduce((sum, w) => sum + (w || 0), 0)
    if (total === 0) return weights

    const high_ratio = (weights.high || 0) / total

    // 如果 high 档位未超限，直接返回
    if (high_ratio <= maxRatio) {
      return { ...weights }
    }

    // 计算 high 应有的最大权重
    const max_high_weight = Math.round(total * maxRatio)
    const excess_weight = (weights.high || 0) - max_high_weight

    // 将超出的权重分配给 low（80%）和 mid（20%）
    const capped = {
      high: max_high_weight,
      mid: (weights.mid || 0) + Math.round(excess_weight * 0.2),
      low: (weights.low || 0) + Math.round(excess_weight * 0.8),
      fallback: weights.fallback || 0
    }

    this.log('warn', '🛡️ 触发 high 档位概率硬上限保护', {
      original_high_ratio: (high_ratio * 100).toFixed(2) + '%',
      max_allowed: (maxRatio * 100).toFixed(2) + '%',
      original_high_weight: weights.high,
      capped_high_weight: capped.high,
      excess_redistributed: excess_weight
    })

    return capped
  }

  /**
   * 应用档位降级逻辑
   *
   * 规则（已拍板0.10.2）：
   * - 固定降级路径：high → mid → low → fallback
   * - 当选中档位无可用奖品时，自动降级到下一档位
   * - fallback 档位必须保证有奖品
   *
   * @param {string} original_tier - 原始抽中的档位
   * @param {Object} prizes_by_tier - 按档位分组的奖品
   * @param {Array} _available_tiers - 可用档位列表（预留用于优化降级逻辑）
   * @returns {Object} { selected_tier: string, downgrade_path: string[] }
   * @private
   */
  _applyDowngrade(original_tier, prizes_by_tier, _available_tiers) {
    const downgrade_path = [original_tier]
    let current_tier = original_tier

    // 获取当前档位在降级路径中的索引
    let tier_index = TIER_DOWNGRADE_PATH.indexOf(current_tier)
    if (tier_index === -1) {
      tier_index = 0 // 未知档位从 high 开始
      current_tier = 'high'
      downgrade_path[0] = 'high'
    }

    // 检查当前档位是否有可用奖品，没有则降级
    while (tier_index < TIER_DOWNGRADE_PATH.length) {
      const tier_prizes = prizes_by_tier[current_tier] || []

      if (tier_prizes.length > 0) {
        // 找到有奖品的档位
        break
      }

      // 降级到下一档位
      tier_index++
      if (tier_index < TIER_DOWNGRADE_PATH.length) {
        current_tier = TIER_DOWNGRADE_PATH[tier_index]
        downgrade_path.push(current_tier)

        this.log('debug', '档位降级', {
          from: downgrade_path[downgrade_path.length - 2],
          to: current_tier,
          reason: '当前档位无可用奖品'
        })
      }
    }

    /**
     * 🔴 2026-02-15 修复：当所有下级档位无奖品时，尝试向上回退
     *
     * 修复根因：
     * - 原代码只支持向下降级（high→mid→low→fallback）
     * - 当 fallback 无奖品时死锁在空档位（降级路径终点无法回退）
     * - 导致 PrizePickStage 收到空奖品列表
     *
     * 修复方案：
     * - 穷尽向下降级后，从第一个有奖品的档位开始向上搜索
     * - 优先选择低价值档位（low > mid > high）确保预算安全
     */
    if (tier_index >= TIER_DOWNGRADE_PATH.length) {
      /* 向下降级失败，尝试从 low 向上搜索有奖品的档位 */
      const reverse_path = [...TIER_DOWNGRADE_PATH].reverse() // ['fallback', 'low', 'mid', 'high']
      let found = false

      for (const reverse_tier of reverse_path) {
        const reverse_prizes = prizes_by_tier[reverse_tier] || []
        if (reverse_prizes.length > 0) {
          current_tier = reverse_tier
          downgrade_path.push(current_tier)
          found = true

          this.log('warn', '向下降级失败，反向搜索到有奖品的档位', {
            original_tier: downgrade_path[0],
            final_tier: current_tier,
            reason: '所有下级档位无可用奖品'
          })
          break
        }
      }

      if (!found) {
        current_tier = 'fallback'
        if (downgrade_path[downgrade_path.length - 1] !== 'fallback') {
          downgrade_path.push('fallback')
        }
      }
    }

    return {
      selected_tier: current_tier,
      downgrade_path
    }
  }

  /**
   * 统一的每日高档上限强制执行
   *
   * 适用于所有 decision_source（normal / preset / override / guarantee）
   * 无论奖品来源如何，单用户每天 high 档位中奖次数不得超过硬上限
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string} selected_tier - 当前选中的档位
   * @param {Object} context - 执行上下文（包含 transaction）
   * @returns {Promise<string>} 经过上限检查后的档位
   * @private
   */
  async _enforceDailyHighCap(user_id, lottery_campaign_id, selected_tier, context) {
    if (selected_tier !== 'high') return selected_tier

    const DAILY_HIGH_TIER_CAP = 5

    try {
      const today_start = BeijingTimeHelper.todayStart()

      const today_high_count = await LotteryDraw.count({
        where: {
          user_id,
          lottery_campaign_id,
          reward_tier: 'high',
          created_at: { [Op.gte]: today_start }
        },
        transaction: context.transaction || undefined
      })

      if (today_high_count >= DAILY_HIGH_TIER_CAP) {
        this.log('warn', '🛡️ 每日高档上限保护（统一入口）', {
          user_id,
          lottery_campaign_id,
          today_high_count,
          daily_cap: DAILY_HIGH_TIER_CAP,
          downgraded_to: 'mid'
        })
        return 'mid'
      }
    } catch (error) {
      this.log('warn', '每日高档上限检查失败（非致命）', {
        user_id,
        error: error.message
      })
    }

    return selected_tier
  }
}

module.exports = TierPickStage
