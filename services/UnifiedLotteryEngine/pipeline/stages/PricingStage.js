'use strict'

/**
 * PricingStage - 抽奖定价计算 Stage
 *
 * 职责：
 * 1. 根据活动配置计算抽奖价格
 * 2. 支持多抽折扣（连抽优惠）
 * 3. 验证用户积分是否足够支付
 * 4. 验证 draw_count 在活动配置的启用按钮列表中（硬护栏1）
 *
 * ⚠️ 关键约束：
 * - 必须复用旧链路 UnifiedLotteryEngine.getDrawPricing() 的语义
 * - 输出字段必须与旧链路一致（total_cost/discount/label/saved_points）
 * - draw_count 范围：1-20，但必须在活动配置的启用按钮列表中
 * - 配置缺失时严格报错阻断，不允许兜底默认值
 *
 * 配置来源优先级（Phase 3 已拍板 2026-01-18）：
 * 1. lottery_campaign_pricing_config 表（活动级版本化配置，优先）
 * 2. campaign.prize_distribution_config.draw_pricing（活动JSON字段，降级兼容）
 * 3. 默认配置（最终兜底）
 *
 * 输入依赖：
 * - LoadCampaignStage.data.campaign
 * - BudgetContextStage.data.budget_before
 *
 * 输出到上下文：
 * - draw_cost: 本次抽奖消耗积分（= total_cost）
 * - original_cost: 原价
 * - discount: 折扣率（如 0.95）
 * - discount_label: 折扣标签（如 "10连抽 9折"）
 * - saved_points: 节省积分
 * - pricing_source: 配置来源（pricing_config_table / campaign_json / default）
 * - points_sufficient: 积分是否充足
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 严格报错阻断：配置缺失直接拒绝，不使用默认值兜底
 * - 硬护栏1：draw_count 必须在活动配置的启用按钮列表中
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/PricingStage
 * @author 统一抽奖架构重构
 * @since 2026-01-19
 * @updated 2026-01-19 - Phase 3: 优先从 pricing_config 表读取
 */

const BaseStage = require('./BaseStage')
const AdminSystemService = require('../../../AdminSystemService')
const { LotteryCampaignPricingConfig } = require('../../../../models')

/**
 * 抽奖定价计算 Stage
 */
class PricingStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('PricingStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行定价计算
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {number} context.draw_count - 抽奖次数（默认1）
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id, draw_count = 1 } = context

    this.log('info', '开始定价计算', { user_id, campaign_id, draw_count })

    try {
      // 🔴 校验 draw_count 基础范围（已拍板 2026-01-18：动态 1-20）
      if (draw_count < 1 || draw_count > 20) {
        throw this.createError(
          `抽奖次数必须在 1-20 之间，当前: ${draw_count}`,
          'INVALID_DRAW_COUNT',
          true
        )
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

      // 获取用户积分余额（从 BudgetContextStage 的结果中）
      const budget_data = this.getContextData(context, 'BudgetContextStage.data') || {}
      const user_points = budget_data.budget_before || 0

      // 🎯 核心：调用定价计算逻辑（复用旧链路 getDrawPricing 的语义）
      const pricing = await this._getDrawPricing(draw_count, campaign)

      // 验证积分是否充足
      const points_sufficient = user_points >= pricing.total_cost

      if (!points_sufficient) {
        throw this.createError(
          `积分不足：需要 ${pricing.total_cost} 积分，当前余额 ${user_points} 积分`,
          'INSUFFICIENT_POINTS',
          true
        )
      }

      // 构建返回数据（与旧链路 getDrawPricing() 输出一致）
      const result = {
        // 核心字段
        draw_cost: pricing.total_cost,
        total_cost: pricing.total_cost,
        unit_cost: pricing.unit_cost,
        original_cost: pricing.original_cost,

        // 折扣相关
        discount: pricing.discount,
        discount_rate: pricing.discount,
        discount_label: pricing.label,
        label: pricing.label,
        saved_points: pricing.saved_points,

        // 来源和验证
        pricing_source: pricing.pricing_source,
        points_before: user_points,
        points_after: user_points - pricing.total_cost,
        points_sufficient: true,

        // 额外信息（便于审计）
        draw_count,
        campaign_id
      }

      this.log('info', '定价计算完成', {
        user_id,
        campaign_id,
        draw_count,
        total_cost: pricing.total_cost,
        discount: pricing.discount,
        saved_points: pricing.saved_points,
        points_sufficient: true
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '定价计算失败', {
        user_id,
        campaign_id,
        draw_count,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取抽奖定价配置
   *
   * 复用旧链路 UnifiedLotteryEngine.getDrawPricing() 的语义
   *
   * 配置来源优先级（Phase 3 已拍板 2026-01-18）：
   * 1. lottery_campaign_pricing_config 表（活动级版本化配置，优先）
   * 2. 活动配置 prize_distribution_config.draw_pricing（活动级覆盖，降级）
   * 3. 数据库 system_settings.lottery_cost_points（全局配置）
   *
   * 定价模式（已拍板 2026-01-18）：
   * - 运营配 discount，后端用 `单抽成本(DB) × count × discount` 动态计算
   *
   * @param {number} draw_count - 抽奖次数
   * @param {Object} campaign - 活动配置对象
   * @returns {Promise<Object>} 定价配置
   * @private
   */
  async _getDrawPricing(draw_count, campaign) {
    /*
     * ================================================================
     * 步骤1：优先从 lottery_campaign_pricing_config 表获取配置（Phase 3）
     * ================================================================
     */
    let draw_pricing_config = {}
    let pricing_source = 'default'

    try {
      // 尝试从新表获取活跃的定价配置
      const pricingConfig = await LotteryCampaignPricingConfig.getActivePricingConfig(
        campaign.campaign_id
      )

      if (pricingConfig) {
        // 新表有配置，使用新表数据
        draw_pricing_config = pricingConfig.pricing_config || {}
        pricing_source = 'pricing_config_table'

        this.log('info', '从 pricing_config 表加载定价配置', {
          campaign_id: campaign.campaign_id,
          config_id: pricingConfig.config_id,
          version: pricingConfig.version,
          status: pricingConfig.status
        })
      }
    } catch (error) {
      // 新表查询失败，记录警告但不阻断，降级到旧逻辑
      this.log('warn', 'pricing_config 表查询失败，降级到活动JSON配置', {
        campaign_id: campaign.campaign_id,
        error: error.message
      })
    }

    /*
     * ================================================================
     * 步骤1.5：如果新表无配置，降级到活动JSON字段（兼容迁移过渡期）
     * ================================================================
     */
    if (pricing_source === 'default') {
      const prize_distribution_config = campaign.prize_distribution_config || {}
      const legacy_draw_pricing = prize_distribution_config.draw_pricing || {}

      if (Object.keys(legacy_draw_pricing).length > 0) {
        draw_pricing_config = legacy_draw_pricing
        pricing_source = 'campaign_json'

        this.log('info', '从活动 JSON 字段加载定价配置（降级模式）', {
          campaign_id: campaign.campaign_id,
          config_keys: Object.keys(legacy_draw_pricing)
        })
      }
    }

    // 步骤2：获取单抽积分消耗配置（严格模式：配置缺失直接报错）
    let base_cost
    try {
      base_cost = await AdminSystemService.getSettingValue(
        'points',
        'lottery_cost_points',
        null,
        { strict: true } // 🔴 严格模式：配置缺失直接报错
      )
      base_cost = parseInt(base_cost, 10)
    } catch (error) {
      this.log('error', '获取单抽积分配置失败', { error: error.message })
      throw this.createError(
        '系统配置缺失：lottery_cost_points 未配置，请联系管理员',
        'MISSING_PRICING_CONFIG',
        true
      )
    }

    // 步骤3：验证 base_cost 是否有效
    if (!base_cost || base_cost <= 0 || isNaN(base_cost)) {
      throw this.createError(
        `无效的单抽积分配置：${base_cost}，必须为正整数`,
        'INVALID_PRICING_CONFIG',
        true
      )
    }

    // 步骤4：加载折扣配置
    const discount_config = this._loadDiscountConfig(draw_count, draw_pricing_config)

    // 步骤5：🔴 硬护栏1 - 验证 draw_count 是否在活动配置的启用按钮列表中
    const enabled_draw_buttons = this._getEnabledDrawButtons(draw_pricing_config)
    if (!enabled_draw_buttons.includes(draw_count)) {
      throw this.createError(
        `不支持的抽奖次数: ${draw_count}，可选: ${enabled_draw_buttons.join(', ')}`,
        'INVALID_DRAW_COUNT_NOT_IN_WHITELIST',
        true
      )
    }

    /*
     * 步骤6：动态计算定价
     * 公式：total_cost = 单抽成本(DB) × count × discount
     */
    const original_cost = base_cost * draw_count
    const total_cost = Math.floor(original_cost * discount_config.discount)
    const saved_points = original_cost - total_cost

    // 步骤7：记录日志（便于调试和问题排查）
    this.log('info', '定价配置加载完成', {
      draw_count,
      base_cost,
      discount: discount_config.discount,
      label: discount_config.label,
      original_cost,
      total_cost,
      saved_points,
      enabled_buttons: enabled_draw_buttons
    })

    return {
      total_cost,
      discount: discount_config.discount,
      label: discount_config.label,
      saved_points,
      pricing_source, // 使用实际加载来源：pricing_config_table / campaign_json / default
      unit_cost: base_cost,
      original_cost
    }
  }

  /**
   * 加载折扣配置
   *
   * 根据抽奖次数从活动配置中查找对应的折扣规则
   *
   * @param {number} draw_count - 抽奖次数
   * @param {Object} draw_pricing_config - 活动定价配置
   * @returns {Object} 折扣配置 { discount, label }
   * @private
   */
  _loadDiscountConfig(draw_count, draw_pricing_config) {
    // 从活动配置读取折扣档位
    const discount_tiers = draw_pricing_config.discount_tiers || []

    // 如果活动有配置，尝试匹配
    if (discount_tiers.length > 0) {
      const matched_tier = discount_tiers.find(
        tier => tier.count === draw_count && tier.enabled !== false
      )

      if (matched_tier) {
        return {
          discount: matched_tier.discount || 1.0,
          label: matched_tier.label || `${draw_count}连抽`
        }
      }
    }

    // 使用默认折扣配置（已拍板 2026-01-19：A方案 5连无折扣）
    const default_discounts = {
      1: { discount: 1.0, label: '单抽' },
      3: { discount: 1.0, label: '3连抽' },
      5: { discount: 1.0, label: '5连抽' },
      10: { discount: 0.9, label: '10连抽(九折)' }
    }

    const default_config = default_discounts[draw_count]
    if (default_config) {
      return default_config
    }

    // 其他档位默认无折扣
    return {
      discount: 1.0,
      label: `${draw_count}连抽`
    }
  }

  /**
   * 获取活动配置中启用的抽奖按钮列表
   *
   * 🔴 硬护栏1：draw_count 只能取该活动配置里启用的按钮档位
   *
   * @param {Object} draw_pricing_config - 活动定价配置
   * @returns {Array<number>} 启用的抽奖次数列表
   * @private
   */
  _getEnabledDrawButtons(draw_pricing_config) {
    // 如果活动配置了 draw_buttons
    const draw_buttons = draw_pricing_config.draw_buttons || []
    if (draw_buttons.length > 0) {
      // 过滤启用的按钮
      return draw_buttons.filter(btn => btn.enabled !== false).map(btn => btn.count)
    }

    // 如果活动配置了 discount_tiers
    const discount_tiers = draw_pricing_config.discount_tiers || []
    if (discount_tiers.length > 0) {
      // 过滤启用的档位
      return discount_tiers.filter(tier => tier.enabled !== false).map(tier => tier.count)
    }

    /*
     * 默认启用的按钮（与 business.config.js 保持一致）
     * 单抽、3连抽、5连抽、10连抽
     */
    return [1, 3, 5, 10]
  }
}

module.exports = PricingStage
