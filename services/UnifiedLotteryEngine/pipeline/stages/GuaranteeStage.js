'use strict'

/**
 * GuaranteeStage - 保底机制检查 Stage
 *
 * 职责：
 * 1. 检查用户是否触发保底机制（累计N次抽奖必中高档奖）
 * 2. 如果触发保底，覆盖前面的抽奖结果
 * 3. 记录保底触发信息
 *
 * 保底规则（已拍板）：
 * - 累计抽奖次数达到阈值（如10次）触发保底
 * - 保底时强制中高档奖品（或指定的保底奖品）
 * - 触发后重置累计计数器
 *
 * 输出到上下文：
 * - guarantee_triggered: 是否触发保底
 * - guarantee_prize: 保底奖品（如果触发）
 * - user_draw_count: 用户累计抽奖次数
 * - guarantee_threshold: 保底触发阈值
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 保底判断在奖品抽取之后进行
 * - 保底触发时覆盖 PrizePickStage 的结果
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/GuaranteeStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryDraw, LotteryPrize } = require('../../../../models')
const { Op } = require('sequelize')

/**
 * 默认保底阈值（抽奖次数）
 */
const DEFAULT_GUARANTEE_THRESHOLD = 10

/**
 * 保底机制检查 Stage
 */
class GuaranteeStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('GuaranteeStage', {
      is_writer: false,
      required: false // 保底是可选功能
    })
  }

  /**
   * 执行保底机制检查
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id } = context

    this.log('info', '开始检查保底机制', { user_id, campaign_id })

    try {
      // 获取活动配置（从 LoadCampaignStage 的结果中）
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
      if (!campaign_data || !campaign_data.campaign) {
        // 没有活动配置，跳过保底检查
        return this.success({
          guarantee_triggered: false,
          reason: '缺少活动配置'
        })
      }

      const campaign = campaign_data.campaign
      const prizes = campaign_data.prizes || []

      // 检查活动是否启用保底机制
      const guarantee_enabled = campaign.guarantee_enabled !== false
      if (!guarantee_enabled) {
        this.log('info', '活动未启用保底机制', { campaign_id })
        return this.success({
          guarantee_triggered: false,
          reason: '活动未启用保底机制'
        })
      }

      // 获取保底配置
      const guarantee_threshold = campaign.guarantee_threshold || DEFAULT_GUARANTEE_THRESHOLD
      const guarantee_prize_id = campaign.guarantee_prize_id || null

      // 1. 获取用户累计抽奖次数（不含当前这次）
      const user_draw_count = await this._getUserDrawCount(user_id, campaign_id)
      const next_draw_number = user_draw_count + 1 // 即将进行的抽奖次数

      // 2. 检查是否触发保底
      const is_guarantee_draw = next_draw_number % guarantee_threshold === 0

      if (!is_guarantee_draw) {
        // 未触发保底，返回正常结果
        const remaining_to_guarantee = guarantee_threshold - (next_draw_number % guarantee_threshold)

        this.log('info', '未触发保底机制', {
          user_id,
          campaign_id,
          user_draw_count,
          next_draw_number,
          remaining_to_guarantee
        })

        return this.success({
          guarantee_triggered: false,
          user_draw_count: user_draw_count,
          next_draw_number: next_draw_number,
          guarantee_threshold: guarantee_threshold,
          remaining_to_guarantee: remaining_to_guarantee
        })
      }

      // 3. 触发保底，获取保底奖品
      const guarantee_prize = await this._getGuaranteePrize(
        campaign_id,
        prizes,
        guarantee_prize_id
      )

      if (!guarantee_prize) {
        // 没有配置保底奖品，降级为使用当前抽中的奖品
        this.log('warn', '未配置保底奖品，保底机制降级', {
          user_id,
          campaign_id,
          guarantee_prize_id
        })

        return this.success({
          guarantee_triggered: false,
          reason: '未配置保底奖品',
          user_draw_count: user_draw_count,
          next_draw_number: next_draw_number,
          guarantee_threshold: guarantee_threshold
        })
      }

      // 4. 构建保底结果
      this.log('info', '触发保底机制', {
        user_id,
        campaign_id,
        next_draw_number,
        guarantee_prize_id: guarantee_prize.prize_id,
        guarantee_prize_name: guarantee_prize.prize_name
      })

      return this.success({
        guarantee_triggered: true,
        guarantee_prize: guarantee_prize,
        user_draw_count: user_draw_count,
        next_draw_number: next_draw_number,
        guarantee_threshold: guarantee_threshold,
        remaining_to_guarantee: 0,
        guarantee_reason: `累计抽奖${next_draw_number}次，触发保底机制`
      })
    } catch (error) {
      this.log('error', '保底机制检查失败', {
        user_id,
        campaign_id,
        error: error.message
      })

      // 保底检查失败不应该阻断抽奖流程
      return this.success({
        guarantee_triggered: false,
        reason: `保底检查失败: ${error.message}`
      })
    }
  }

  /**
   * 获取用户累计抽奖次数
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<number>} 累计抽奖次数
   * @private
   */
  async _getUserDrawCount(user_id, campaign_id) {
    try {
      const count = await LotteryDraw.count({
        where: {
          user_id,
          campaign_id
        }
      })

      return count
    } catch (error) {
      this.log('warn', '获取用户累计抽奖次数失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 获取保底奖品
   *
   * 优先级：
   * 1. 如果指定了 guarantee_prize_id，使用指定奖品
   * 2. 否则自动选择 reward_tier = 'high' 的第一个奖品
   * 3. 如果没有高档奖品，选择 reward_tier = 'mid' 的第一个奖品
   *
   * @param {number} campaign_id - 活动ID
   * @param {Array} prizes - 奖品列表
   * @param {number|null} guarantee_prize_id - 指定的保底奖品ID
   * @returns {Promise<Object|null>} 保底奖品
   * @private
   */
  async _getGuaranteePrize(campaign_id, prizes, guarantee_prize_id) {
    // 1. 如果指定了保底奖品ID，查找该奖品
    if (guarantee_prize_id) {
      const specified_prize = prizes.find(p => p.prize_id === guarantee_prize_id)
      if (specified_prize) {
        return specified_prize
      }

      // 指定的奖品不在列表中，从数据库查询
      try {
        const db_prize = await LotteryPrize.findOne({
          where: {
            prize_id: guarantee_prize_id,
            campaign_id,
            status: 'active'
          }
        })
        if (db_prize) {
          return db_prize.toJSON()
        }
      } catch (error) {
        this.log('warn', '查询指定保底奖品失败', {
          guarantee_prize_id,
          error: error.message
        })
      }
    }

    // 2. 自动选择高档奖品
    const high_tier_prizes = prizes.filter(p =>
      p.reward_tier === 'high' &&
      p.status === 'active' &&
      (p.stock_quantity === null || p.stock_quantity > 0)
    )

    if (high_tier_prizes.length > 0) {
      // 按 sort_order 排序，选择第一个
      high_tier_prizes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      return high_tier_prizes[0]
    }

    // 3. 降级到中档奖品
    const mid_tier_prizes = prizes.filter(p =>
      p.reward_tier === 'mid' &&
      p.status === 'active' &&
      (p.stock_quantity === null || p.stock_quantity > 0)
    )

    if (mid_tier_prizes.length > 0) {
      mid_tier_prizes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      return mid_tier_prizes[0]
    }

    // 没有合适的保底奖品
    return null
  }
}

module.exports = GuaranteeStage

