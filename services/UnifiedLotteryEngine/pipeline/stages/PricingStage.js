'use strict'

/**
 * PricingStage - 抽奖定价计算 Stage
 *
 * 职责：
 * 1. 调用 LotteryPricingService 统一定价服务计算抽奖价格
 * 2. 支持多抽折扣（连抽优惠）
 * 3. 验证用户积分是否足够支付
 * 4. 硬护栏1：draw_count 必须在活动配置的启用按钮列表中（由 LotteryPricingService 验证）
 *
 * @see services/lottery/LotteryPricingService.js - 统一定价服务
 *
 * 配置来源（由 LotteryPricingService 管理）：
 * - lottery_campaign_pricing_config 表（活动级版本化配置）
 * - system_settings.lottery_cost_points（全局单抽成本）
 * - 配置缺失时严格报错阻断，不允许兜底默认值
 *
 * 输入依赖：
 * - LoadCampaignStage.data.campaign
 * - BudgetContextStage.data.budget_before
 *
 * 输出到上下文：
 * - draw_cost: 本次抽奖批次的总消耗积分（= total_cost，用于扣款）
 * - per_draw_cost: 每次抽奖的单位成本（= per_draw，用于记录到 lottery_draws.cost_points）
 * - original_cost: 原价
 * - discount: 折扣率（如 0.9）
 * - discount_label: 折扣标签（如 "10连抽(九折)"）
 * - saved_points: 节省积分
 * - pricing_source: 配置来源（pricing_config_table / cache）
 * - cost_source: 单抽成本来源（campaign / global）
 * - points_sufficient: 积分是否充足
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 严格报错阻断：配置缺失直接拒绝，不使用默认值兜底
 * - DRY原则：定价逻辑统一由 LotteryPricingService 管理
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/PricingStage
 * @author 统一抽奖架构重构
 * @since 2026
 */

const BaseStage = require('./BaseStage')

/**
 * 抽奖定价服务 - 统一定价计算入口
 */
const LotteryPricingService = require('../../../lottery/LotteryPricingService')

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
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {number} context.draw_count - 抽奖次数（默认1）
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id, draw_count = 1 } = context

    this.log('info', '开始定价计算', { user_id, lottery_campaign_id, draw_count })

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

      // 调用 LotteryPricingService 统一定价服务
      const transaction = context.transaction // 从上下文获取事务（如有）
      const pricing = await LotteryPricingService.getDrawPricing(
        draw_count,
        campaign.lottery_campaign_id,
        {
          transaction
        }
      )

      /**
       * 🔧 P1修复：连抽场景下积分充足性检查逻辑
       *
       * 问题根因（2026-01-28 修复）：
       * - 连抽场景下，execute_draw 在外层已经统一扣除全部积分
       * - 然后循环调用 executeLottery，传递 skip_points_deduction: true
       * - 但 BudgetContextStage 从数据库读取的是已扣除后的余额
       * - 导致 PricingStage 检查时发现"积分不足"，事务回滚
       *
       * 解决方案：
       * - 当 skip_points_deduction: true 时，跳过积分充足性检查
       * - 因为积分已在外层被扣除，此处只需计算定价信息
       */
      const skip_points_deduction = context.skip_points_deduction === true

      // 验证积分是否充足（跳过检查条件：skip_points_deduction=true）
      let points_sufficient = true
      if (!skip_points_deduction) {
        // 正常流程：检查积分是否充足
        points_sufficient = user_points >= pricing.total_cost

        if (!points_sufficient) {
          throw this.createError(
            `积分不足：需要 ${pricing.total_cost} 积分，当前余额 ${user_points} 积分`,
            'INSUFFICIENT_POINTS',
            true
          )
        }
      } else {
        // 连抽场景：积分已在外层扣除，跳过检查
        this.log('info', '跳过积分充足性检查（连抽模式：积分已在外层统一扣除）', {
          user_id,
          lottery_campaign_id,
          draw_count,
          skip_points_deduction: true,
          budget_before_from_db: user_points,
          required_cost: pricing.total_cost,
          note: '积分已在 execute_draw 外层统一扣除，此处无需再验证'
        })
      }

      /**
       * 构建返回数据
       *
       * LotteryPricingService 返回字段映射：
       * - total_cost → total_cost, draw_cost
       * - per_draw → unit_cost（折后单价）
       * - base_cost → 用于计算 original_cost
       * - discount → discount, discount_rate
       * - label → label, discount_label
       * - source → pricing_source
       */
      const original_cost = pricing.base_cost * draw_count // 原价 = 单抽成本 × 次数
      const saved_points = original_cost - pricing.total_cost // 节省 = 原价 - 实际价

      const result = {
        // 核心字段
        draw_cost: pricing.total_cost, // 批次总成本（用于扣款）
        total_cost: pricing.total_cost, // 批次总成本（同 draw_cost）
        per_draw_cost: pricing.per_draw, // 单次抽奖成本（用于 lottery_draws.cost_points）
        unit_cost: pricing.per_draw, // 折后单价（同 per_draw_cost）
        original_cost,

        // 折扣相关
        discount: pricing.discount,
        discount_rate: pricing.discount,
        discount_label: pricing.label,
        label: pricing.label,
        saved_points,

        // 来源和验证
        pricing_source: pricing.source,
        cost_source: pricing.cost_source, // 单抽成本来源（campaign/global）
        points_before: user_points,
        points_after: user_points - pricing.total_cost,
        points_sufficient: true,

        // 额外信息（便于审计）
        draw_count,
        lottery_campaign_id,
        base_cost: pricing.base_cost // 单抽基础成本
      }

      this.log('info', '定价计算完成', {
        user_id,
        lottery_campaign_id,
        draw_count,
        total_cost: pricing.total_cost,
        discount: pricing.discount,
        saved_points,
        points_sufficient: true
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '定价计算失败', {
        user_id,
        lottery_campaign_id,
        draw_count,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = PricingStage
