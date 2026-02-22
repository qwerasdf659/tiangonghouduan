/**
 * 广告竞价服务层（AdBiddingService）
 *
 * 业务场景：
 * - 统一内容投放引擎：从多个广告计划中选出展示内容
 * - 三层优先级出队逻辑：system（最高）→ operational（固定排序）→ commercial（竞价排序）
 * - 支持固定包天（直接包含）和竞价（按出价排序）两种商业计费模式
 * - 3秒内完成选择逻辑（SLA要求）
 * - 记录所有竞价日志（胜出者和失败者）
 *
 * 服务对象：
 * - /api/v4/system/ad-delivery（统一前端内容获取，D5 定论）
 * - /api/v4/ads/select（小程序端 - 获取广告）
 *
 * 创建时间：2026-02-18
 * 更新时间：2026-02-22（内容投放合并 — 三层优先级出队）
 *
 * @see docs/内容投放系统-重复功能合并方案.md 第二节 2.7
 */

const logger = require('../utils/logger').logger
const { AdSlot, AdCampaign, AdBidLog, AdCreative, UserAdTag } = require('../models')
const { Op } = require('sequelize')
const { sequelize } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告竞价服务类
 */
class AdBiddingService {
  /**
   * 核心竞价逻辑：选出胜出广告
   *
   * @param {string} slotKey - 广告位标识（如：home_popup）
   * @param {number} userId - 用户ID（用于定向匹配）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Array>} 胜出广告列表（包含创意数据）
   */
  static async selectWinners(slotKey, userId, options = {}) {
    const startTime = Date.now()
    const { transaction } = options

    try {
      logger.info('[AdBiddingService] 开始竞价选择', { slotKey, userId })

      // 1. 获取广告位配置
      const adSlot = await AdSlot.findOne({
        where: { slot_key: slotKey, is_active: true },
        transaction
      })

      if (!adSlot) {
        logger.warn('[AdBiddingService] 广告位不存在或已禁用', { slotKey })
        return []
      }

      // 2. 查找有效的广告计划
      const now = BeijingTimeHelper.createDatabaseTime()
      const activeCampaigns = await AdCampaign.findAll({
        where: {
          ad_slot_id: adSlot.ad_slot_id,
          status: 'active',
          start_date: { [Op.lte]: now },
          end_date: { [Op.gte]: now },
          [Op.or]: [
            { budget_total_diamond: null },
            { budget_total_diamond: { [Op.gt]: sequelize.col('budget_spent_diamond') } }
          ]
        },
        include: [
          {
            model: AdCreative,
            as: 'creatives',
            where: { review_status: 'approved' },
            required: true
          }
        ],
        transaction
      })

      if (activeCampaigns.length === 0) {
        logger.info('[AdBiddingService] 无有效广告计划', { slotKey })
        return []
      }

      // 3. 获取用户标签（用于定向匹配）
      let userTags = null
      if (userId) {
        userTags = await AdBiddingService._getUserTags(userId, { transaction })
      }

      // 4. 三层优先级分组：system → operational → commercial
      const systemCampaigns = []
      const operationalCampaigns = []
      const fixedDailyCampaigns = []
      const biddingCampaigns = []

      for (const campaign of activeCampaigns) {
        // 定向匹配检查（仅 commercial 需要定向，operational/system 跳过）
        if (
          campaign.campaign_category === 'commercial' &&
          campaign.targeting_rules &&
          userTags
        ) {
          const rules =
            typeof campaign.targeting_rules === 'string'
              ? JSON.parse(campaign.targeting_rules)
              : campaign.targeting_rules
          const matched = AdBiddingService._matchTargeting(rules, userTags)
          if (!matched) {
            await AdBidLog.create(
              {
                ad_slot_id: adSlot.ad_slot_id,
                ad_campaign_id: campaign.ad_campaign_id,
                target_user_id: userId,
                bid_amount_diamond: campaign.daily_bid_diamond || 0,
                is_winner: false,
                lose_reason: 'targeting_mismatch'
              },
              { transaction }
            )
            continue
          }
        }

        if (campaign.campaign_category === 'system') {
          systemCampaigns.push(campaign)
        } else if (campaign.campaign_category === 'operational') {
          operationalCampaigns.push(campaign)
        } else if (campaign.billing_mode === 'fixed_daily') {
          fixedDailyCampaigns.push(campaign)
        } else if (campaign.billing_mode === 'bidding') {
          biddingCampaigns.push(campaign)
        }
      }

      // 5. 各层内部排序
      systemCampaigns.sort((a, b) => (b.priority || 0) - (a.priority || 0))
      operationalCampaigns.sort((a, b) => (b.priority || 0) - (a.priority || 0))
      biddingCampaigns.sort((a, b) => (b.daily_bid_diamond || 0) - (a.daily_bid_diamond || 0))

      // 6. 合并：system 最先 → operational 其次 → commercial（固定包天 + 竞价）最后
      const allCandidates = [
        ...systemCampaigns,
        ...operationalCampaigns,
        ...fixedDailyCampaigns,
        ...biddingCampaigns
      ]
      const winners = allCandidates.slice(0, adSlot.max_display_count)

      // 7. 记录所有竞价日志
      const bidLogs = []
      for (let i = 0; i < allCandidates.length; i++) {
        const campaign = allCandidates[i]
        const isWinner = i < winners.length

        bidLogs.push({
          ad_slot_id: adSlot.ad_slot_id,
          ad_campaign_id: campaign.ad_campaign_id,
          target_user_id: userId,
          bid_amount_diamond: campaign.daily_bid_diamond || 0,
          is_winner: isWinner,
          lose_reason: isWinner ? null : i >= adSlot.max_display_count ? 'outbid' : null
        })
      }

      if (bidLogs.length > 0) {
        await AdBidLog.bulkCreate(bidLogs, { transaction })
      }

      // 8. 组装返回结果（包含创意数据 + 合并字段）
      const winnerResults = winners.map(campaign => {
        const creative =
          campaign.creatives && campaign.creatives.length > 0 ? campaign.creatives[0] : null

        return {
          ad_campaign_id: campaign.ad_campaign_id,
          campaign_name: campaign.campaign_name,
          campaign_category: campaign.campaign_category,
          billing_mode: campaign.billing_mode,
          priority: campaign.priority,
          frequency_rule: campaign.frequency_rule,
          frequency_value: campaign.frequency_value,
          force_show: campaign.force_show,
          slide_interval_ms: campaign.slide_interval_ms,
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          creative: creative
            ? {
                ad_creative_id: creative.ad_creative_id,
                title: creative.title,
                content_type: creative.content_type,
                image_url: creative.image_url,
                image_width: creative.image_width,
                image_height: creative.image_height,
                text_content: creative.text_content,
                link_url: creative.link_url,
                link_type: creative.link_type,
                display_mode: creative.display_mode
              }
            : null
        }
      })

      const duration = Date.now() - startTime
      logger.info('[AdBiddingService] 竞价选择完成', {
        slotKey,
        userId,
        totalCampaigns: activeCampaigns.length,
        winnersCount: winners.length,
        duration_ms: duration
      })

      // SLA检查：超过3秒警告
      if (duration > 3000) {
        logger.warn('[AdBiddingService] 竞价耗时超过SLA', { duration_ms: duration })
      }

      return winnerResults
    } catch (error) {
      logger.error('[AdBiddingService] 竞价选择失败', {
        slotKey,
        userId,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 匹配定向规则
   *
   * @param {Object} targetingRules - 定向规则对象
   * @param {Map<string, string>} userTags - 用户标签Map
   * @returns {boolean} 是否匹配
   */
  static _matchTargeting(targetingRules, userTags) {
    if (!targetingRules || !userTags || userTags.size === 0) {
      return true // 无定向规则则默认匹配
    }

    const { match_type = 'match_all', rules = [] } = targetingRules

    if (!Array.isArray(rules) || rules.length === 0) {
      return true // 无规则则默认匹配
    }

    const results = rules.map(rule => {
      const { tag_key, operator, value } = rule
      const userTagValue = userTags.get(tag_key)

      if (userTagValue === undefined || userTagValue === null) {
        return false // 用户无此标签，不匹配
      }

      switch (operator) {
        case 'eq':
          return userTagValue === String(value)
        case 'neq':
          return userTagValue !== String(value)
        case 'gt':
          return parseFloat(userTagValue) > parseFloat(value)
        case 'gte':
          return parseFloat(userTagValue) >= parseFloat(value)
        case 'lt':
          return parseFloat(userTagValue) < parseFloat(value)
        case 'lte':
          return parseFloat(userTagValue) <= parseFloat(value)
        default:
          logger.warn('[AdBiddingService] 未知的定向操作符', { operator })
          return false
      }
    })

    /*
     * match_all: 所有规则必须匹配（AND）
     * match_any: 任一规则匹配即可（OR）
     */
    if (match_type === 'match_all') {
      return results.every(r => r === true)
    } else {
      return results.some(r => r === true)
    }
  }

  /**
   * 获取用户标签Map
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Map<string, string>>} 用户标签Map
   */
  static async _getUserTags(userId, options = {}) {
    const { transaction } = options

    try {
      const tags = await UserAdTag.findAll({
        where: { user_id: userId },
        attributes: ['tag_key', 'tag_value'],
        transaction
      })

      const tagMap = new Map()
      tags.forEach(tag => {
        tagMap.set(tag.tag_key, tag.tag_value)
      })

      return tagMap
    } catch (error) {
      logger.error('[AdBiddingService] 获取用户标签失败', {
        userId,
        error: error.message
      })
      return new Map() // 失败时返回空Map，不影响竞价流程
    }
  }
}

module.exports = AdBiddingService
