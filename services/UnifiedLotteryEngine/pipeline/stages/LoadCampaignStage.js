'use strict'

/**
 * LoadCampaignStage - 加载活动配置 Stage
 *
 * 职责：
 * 1. 加载活动基础配置
 * 2. 验证活动状态（是否可用）
 * 3. 加载活动关联的奖品列表
 * 4. 加载档位规则（lottery_tier_rules）
 *
 * 输出到上下文：
 * - campaign: 活动配置对象
 * - prizes: 活动奖品列表
 * - tier_rules: 档位规则列表
 * - fallback_prize: 兜底奖品
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/LoadCampaignStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryCampaign, LotteryPrize, LotteryTierRule } = require('../../../../models')
/* eslint-disable-next-line spaced-comment -- Op 操作符预留用于复杂查询条件（当前版本使用默认查询） */
// const { Op } = require('sequelize')

/**
 * 加载活动配置 Stage
 */
class LoadCampaignStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('LoadCampaignStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行 Stage
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { lottery_campaign_id } = context

    this.log('info', '开始加载活动配置', { lottery_campaign_id })

    try {
      // 1. 加载活动基础配置
      const campaign = await this._loadCampaign(lottery_campaign_id)

      if (!campaign) {
        throw this.createError(`活动不存在: ${lottery_campaign_id}`, 'CAMPAIGN_NOT_FOUND', true)
      }

      // 2. 验证活动状态
      this._validateCampaignStatus(campaign)

      // 3. 加载活动奖品
      const prizes = await this._loadPrizes(lottery_campaign_id)

      // 4. 加载档位规则
      const tier_rules = await this._loadTierRules(lottery_campaign_id)

      // 5. 获取兜底奖品
      const fallback_prize = await this._getFallbackPrize(prizes, campaign)

      // 6. 返回结果
      const result = {
        campaign: campaign.toJSON(),
        prizes: prizes.map(p => p.toJSON()),
        tier_rules: tier_rules.map(r => r.toJSON()),
        fallback_prize: fallback_prize ? fallback_prize.toJSON() : null,
        pick_method: campaign.pick_method || 'tier_first',
        budget_mode: campaign.budget_mode || 'none'
      }

      this.log('info', '活动配置加载完成', {
        lottery_campaign_id,
        prize_count: prizes.length,
        tier_rule_count: tier_rules.length,
        has_fallback: !!fallback_prize,
        pick_method: result.pick_method,
        budget_mode: result.budget_mode
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '加载活动配置失败', {
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 加载活动基础配置
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} 活动配置
   * @private
   */
  async _loadCampaign(lottery_campaign_id) {
    return await LotteryCampaign.findByPk(lottery_campaign_id)
  }

  /**
   * 验证活动状态
   *
   * @param {Object} campaign - 活动配置
   * @returns {void}
   * @throws {Error} 活动状态无效时抛出错误
   * @private
   */
  _validateCampaignStatus(campaign) {
    // 检查活动状态
    if (campaign.status !== 'active') {
      throw this.createError(`活动状态无效: ${campaign.status}`, 'CAMPAIGN_INACTIVE', true)
    }

    // 检查活动时间
    const now = new Date()

    if (campaign.start_time && new Date(campaign.start_time) > now) {
      throw this.createError('活动尚未开始', 'CAMPAIGN_NOT_STARTED', true)
    }

    if (campaign.end_time && new Date(campaign.end_time) < now) {
      throw this.createError('活动已结束', 'CAMPAIGN_ENDED', true)
    }
  }

  /**
   * 加载活动奖品
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 奖品列表
   * @private
   */
  async _loadPrizes(lottery_campaign_id) {
    return await LotteryPrize.findAll({
      where: {
        lottery_campaign_id,
        status: 'active'
      },
      order: [
        ['reward_tier', 'DESC'], // high > mid > low
        ['sort_order', 'ASC'],
        ['lottery_prize_id', 'ASC']
      ]
    })
  }

  /**
   * 加载档位规则
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 档位规则列表
   * @private
   */
  async _loadTierRules(lottery_campaign_id) {
    return await LotteryTierRule.findAll({
      where: {
        lottery_campaign_id,
        status: 'active'
      },
      order: [
        ['segment_key', 'ASC'],
        ['tier_name', 'DESC'] // high > mid > low
      ]
    })
  }

  /**
   * 获取兜底奖品
   *
   * 规则（已拍板 0.10.2）：
   * 1. 如果活动配置了 tier_fallback_lottery_prize_id，使用该奖品
   * 2. 否则自动选取 prize_value_points=0 且 is_fallback=true 的奖品
   * 3. 按 sort_order ASC, lottery_prize_id ASC 排序取第一个
   *
   * @param {Array} prizes - 奖品列表
   * @param {Object} campaign - 活动配置
   * @returns {Object|null} 兜底奖品
   * @private
   */
  async _getFallbackPrize(prizes, campaign) {
    // 从 lottery_strategy_config 读取档位降级兜底奖品ID
    const { DynamicConfigLoader } = require('../../compute/config/StrategyConfig')
    const tier_fallback_prize_id = await DynamicConfigLoader.getValue(
      'tier_fallback',
      'prize_id',
      null,
      { lottery_campaign_id: campaign.lottery_campaign_id }
    )

    // 1. 检查是否配置了指定的兜底奖品
    if (tier_fallback_prize_id) {
      const specified_fallback = prizes.find(p => p.lottery_prize_id === tier_fallback_prize_id)
      if (specified_fallback) {
        return specified_fallback
      }
    }

    // 2. 自动选择：prize_value_points=0 或 is_fallback=true 的奖品
    const fallback_candidates = prizes.filter(
      p => p.prize_value_points === 0 || p.is_fallback === true
    )

    if (fallback_candidates.length === 0) {
      this.log('warn', '活动没有配置兜底奖品', {
        lottery_campaign_id: campaign.lottery_campaign_id
      })
      return null
    }

    // 按 sort_order ASC, prize_id ASC 排序取第一个
    fallback_candidates.sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return (a.sort_order || 0) - (b.sort_order || 0)
      }
      return a.lottery_prize_id - b.lottery_prize_id
    })

    return fallback_candidates[0]
  }
}

module.exports = LoadCampaignStage
