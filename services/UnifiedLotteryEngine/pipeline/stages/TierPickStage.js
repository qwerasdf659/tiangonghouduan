'use strict'

/**
 * TierPickStage - 档位抽取 Stage
 *
 * 职责：
 * 1. 根据用户分群（segment）获取对应的档位权重配置
 * 2. 使用整数权重系统（SCALE = 1,000,000）进行档位抽取
 * 3. 实现固定降级路径：high → mid → low → fallback
 * 4. 当选中档位无可用奖品时自动降级
 *
 * 输出到上下文：
 * - selected_tier: 最终选中的档位
 * - original_tier: 原始抽中的档位（降级前）
 * - tier_downgrade_path: 降级路径（如 ['high', 'mid', 'low']）
 * - random_value: 抽取时使用的随机数
 * - tier_weights: 使用的档位权重配置
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
const { User } = require('../../../../models')

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
  }

  /**
   * 执行档位抽取
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id } = context

    this.log('info', '开始档位抽取', { user_id, campaign_id })

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
        const preset_tier = preset.reward_tier || 'high'
        this.log('info', '预设模式：跳过档位抽取，使用预设档位', {
          user_id,
          decision_source,
          preset_tier
        })
        return this.success({
          selected_tier: preset_tier,
          original_tier: preset_tier,
          tier_downgrade_path: [],
          random_value: 0,
          tier_weights: {},
          decision_source,
          skipped: true,
          skip_reason: 'preset_mode'
        })
      }

      // override 模式：根据干预类型决定档位
      if (decision_source === 'override' && decision_data?.override) {
        const override = decision_data.override
        const override_type = override.setting_type || override.override_type
        // force_win 使用 high 档位，force_lose 使用 fallback 档位
        const override_tier = override_type === 'force_win' ? 'high' : 'fallback'
        this.log('info', '干预模式：跳过档位抽取，使用干预档位', {
          user_id,
          decision_source,
          override_type,
          override_tier
        })
        return this.success({
          selected_tier: override_tier,
          original_tier: override_tier,
          tier_downgrade_path: [],
          random_value: 0,
          tier_weights: {},
          decision_source,
          skipped: true,
          skip_reason: 'override_mode'
        })
      }

      // guarantee 模式：使用高档位
      if (decision_source === 'guarantee') {
        this.log('info', '保底模式：强制使用高档位', {
          user_id,
          decision_source
        })
        return this.success({
          selected_tier: 'high',
          original_tier: 'high',
          tier_downgrade_path: [],
          random_value: 0,
          tier_weights: {},
          decision_source,
          skipped: true,
          skip_reason: 'guarantee_mode'
        })
      }

      // normal 模式：继续正常的档位抽取流程

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

      // 获取奖品池信息（从 BuildPrizePoolStage 的结果中）
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

      // 1. 解析用户分群
      const user_segment = await this._resolveUserSegment(user_id, campaign)

      // 2. 获取分群对应的档位权重
      const tier_weights = this._getTierWeights(user_segment, tier_rules, campaign)

      // 3. 执行档位抽取
      const random_value = Math.random() * WEIGHT_SCALE
      const original_tier = this._pickTier(tier_weights, random_value)

      // 4. 检查选中档位是否有可用奖品，必要时降级
      const { selected_tier, downgrade_path } = this._applyDowngrade(
        original_tier,
        prizes_by_tier,
        available_tiers
      )

      // 5. 构建返回数据
      const result = {
        selected_tier,
        original_tier,
        tier_downgrade_path: downgrade_path,
        random_value,
        tier_weights,
        user_segment,
        weight_scale: WEIGHT_SCALE
      }

      this.log('info', '档位抽取完成', {
        user_id,
        campaign_id,
        user_segment,
        original_tier,
        selected_tier,
        downgrade_count: downgrade_path.length - 1,
        random_value: ((random_value / WEIGHT_SCALE) * 100).toFixed(4) + '%'
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '档位抽取失败', {
        user_id,
        campaign_id,
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

      // 查询用户信息用于分群规则匹配
      const user = await User.findByPk(user_id, {
        attributes: ['user_id', 'created_at', 'last_active_at']
      })

      if (!user) {
        this.log('warn', '用户不存在，使用默认分群', { user_id })
        return 'default'
      }

      // 调用 SegmentResolver.resolveSegment(version, user) 解析分群
      const segment = SegmentResolver.resolveSegment(resolver_version, user.toJSON())

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
   * @param {string} segment - 用户分群
   * @param {Array} tier_rules - 档位规则列表
   * @param {Object} _campaign - 活动配置（预留用于扩展权重计算）
   * @returns {Object} 档位权重 { high: weight, mid: weight, low: weight, fallback: weight }
   * @private
   */
  _getTierWeights(segment, tier_rules, _campaign) {
    // 默认权重配置（已拍板0.10.2）
    const default_weights = {
      high: 50000, // 5%
      mid: 150000, // 15%
      low: 300000, // 30%
      fallback: 500000 // 50%
    }

    // 从 tier_rules 中查找匹配的分群配置
    const segment_rules = tier_rules.filter(r => r.segment_key === segment)

    if (segment_rules.length === 0) {
      this.log('debug', '未找到分群配置，使用默认权重', {
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

    // 如果所有档位都没有奖品（不应该发生），返回 fallback
    if (tier_index >= TIER_DOWNGRADE_PATH.length) {
      current_tier = 'fallback'
      if (downgrade_path[downgrade_path.length - 1] !== 'fallback') {
        downgrade_path.push('fallback')
      }
    }

    return {
      selected_tier: current_tier,
      downgrade_path
    }
  }
}

module.exports = TierPickStage
