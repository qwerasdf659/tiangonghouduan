'use strict'

/**
 * 抽奖分析查询服务
 *
 * @description 提供抽奖统计分析的只读查询功能
 *
 * 遵循架构规范：读写分层策略 Phase 3
 * 热点分析查询启用缓存
 *
 * 涵盖查询：
 * - 抽奖趋势分析（按小时/天）
 * - 奖品分布统计
 * - 用户抽奖行为分析
 * - 活动效果分析
 * - 预算消耗分析
 *
 * @module services/lottery/AnalyticsQueryService
 * @version 1.0.0
 * @date 2026-02-01
 */

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 缓存配置
 * @constant
 */
const CACHE_CONFIG = {
  /** 趋势分析缓存 TTL (5分钟) */
  TREND_ANALYSIS: 300,
  /** 奖品分布缓存 TTL (5分钟) */
  PRIZE_DISTRIBUTION: 300,
  /** 活动效果缓存 TTL (5分钟) */
  CAMPAIGN_EFFECT: 300
}

/**
 * 抽奖分析查询服务类
 * 提供抽奖统计分析的只读查询功能
 *
 * @class LotteryAnalyticsQueryService
 */
class LotteryAnalyticsQueryService {
  /**
   * 获取抽奖趋势分析（按小时）
   * 热点查询 - 启用缓存
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @returns {Promise<Object>} 趋势数据
   */
  static async getHourlyTrend(campaign_id, options = {}) {
    const { start_date, end_date } = options
    const cacheKey = `lottery:analytics:hourly:${campaign_id}:${start_date || 'all'}:${end_date || 'all'}`

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('小时趋势分析命中缓存', { cacheKey })
      return cached
    }

    const { LotteryDraw } = require('../../models')

    // 构建日期过滤
    const where = { lottery_campaign_id: parseInt(campaign_id) }
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    // 按小时分组统计
    const trend = await LotteryDraw.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00'), 'hour'],
        [fn('COUNT', col('lottery_draw_id')), 'draw_count'],
        [
          fn('SUM', literal('CASE WHEN lottery_prize_id IS NOT NULL THEN 1 ELSE 0 END')),
          'win_count'
        ],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
      ],
      where,
      group: [literal('hour')],
      order: [[literal('hour'), 'ASC']],
      raw: true
    })

    const result = {
      campaign_id: parseInt(campaign_id),
      data_points: trend.map(item => ({
        hour: item.hour,
        draw_count: parseInt(item.draw_count) || 0,
        win_count: parseInt(item.win_count) || 0,
        unique_users: parseInt(item.unique_users) || 0,
        win_rate:
          item.draw_count > 0 ? ((item.win_count / item.draw_count) * 100).toFixed(2) : '0.00'
      })),
      date_range: { start_date, end_date }
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.TREND_ANALYSIS)

    return result
  }

  /**
   * 获取抽奖趋势分析（按天）
   * 热点查询 - 启用缓存
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @returns {Promise<Object>} 趋势数据
   */
  static async getDailyTrend(campaign_id, options = {}) {
    const { start_date, end_date } = options
    const cacheKey = `lottery:analytics:daily:${campaign_id}:${start_date || 'all'}:${end_date || 'all'}`

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('每日趋势分析命中缓存', { cacheKey })
      return cached
    }

    const { LotteryDraw } = require('../../models')

    // 构建日期过滤
    const where = { lottery_campaign_id: parseInt(campaign_id) }
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    // 按日期分组统计
    const trend = await LotteryDraw.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('lottery_draw_id')), 'draw_count'],
        [
          fn('SUM', literal('CASE WHEN lottery_prize_id IS NOT NULL THEN 1 ELSE 0 END')),
          'win_count'
        ],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
      ],
      where,
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    })

    const result = {
      campaign_id: parseInt(campaign_id),
      data_points: trend.map(item => ({
        date: item.date,
        draw_count: parseInt(item.draw_count) || 0,
        win_count: parseInt(item.win_count) || 0,
        unique_users: parseInt(item.unique_users) || 0,
        win_rate:
          item.draw_count > 0 ? ((item.win_count / item.draw_count) * 100).toFixed(2) : '0.00'
      })),
      date_range: { start_date, end_date }
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.TREND_ANALYSIS)

    return result
  }

  /**
   * 获取奖品分布统计
   * 热点查询 - 启用缓存
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 奖品分布统计
   */
  static async getPrizeDistribution(campaign_id) {
    const cacheKey = `lottery:analytics:prize_dist:${campaign_id}`

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('奖品分布命中缓存', { cacheKey })
      return cached
    }

    const { LotteryDraw, LotteryPrize } = require('../../models')

    // 按奖品分组统计
    const distribution = await LotteryDraw.findAll({
      attributes: ['lottery_prize_id', [fn('COUNT', col('lottery_draw_id')), 'win_count']],
      where: {
        lottery_campaign_id: parseInt(campaign_id),
        lottery_prize_id: { [Op.ne]: null }
      },
      include: [
        {
          model: LotteryPrize,
          as: 'prize',
          attributes: ['prize_name', 'prize_type', 'reward_tier'],
          required: true
        }
      ],
      group: ['lottery_prize_id', 'prize.lottery_prize_id'],
      order: [[fn('COUNT', col('lottery_draw_id')), 'DESC']],
      raw: true,
      nest: true
    })

    // 计算总中奖数
    const totalWins = distribution.reduce((sum, item) => sum + parseInt(item.win_count), 0)

    const result = {
      campaign_id: parseInt(campaign_id),
      total_wins: totalWins,
      prizes: distribution.map(item => ({
        lottery_prize_id: item.lottery_prize_id,
        prize_name: item.prize?.prize_name,
        prize_type: item.prize?.prize_type,
        reward_tier: item.prize?.reward_tier,
        win_count: parseInt(item.win_count) || 0,
        percentage: totalWins > 0 ? ((item.win_count / totalWins) * 100).toFixed(2) : '0.00'
      }))
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.PRIZE_DISTRIBUTION)

    return result
  }

  /**
   * 获取档位分布统计
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 档位分布统计
   */
  static async getTierDistribution(campaign_id) {
    const cacheKey = `lottery:analytics:tier_dist:${campaign_id}`

    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      return cached
    }

    const { LotteryDraw, LotteryPrize } = require('../../models')

    // 按档位分组统计
    const distribution = await LotteryDraw.findAll({
      attributes: [[fn('COUNT', col('LotteryDraw.lottery_draw_id')), 'win_count']],
      where: {
        lottery_campaign_id: parseInt(campaign_id),
        lottery_prize_id: { [Op.ne]: null }
      },
      include: [
        {
          model: LotteryPrize,
          as: 'prize',
          attributes: ['reward_tier'],
          required: true
        }
      ],
      group: ['prize.reward_tier'],
      order: [[literal('win_count'), 'DESC']],
      raw: true,
      nest: true
    })

    const totalWins = distribution.reduce((sum, item) => sum + parseInt(item.win_count), 0)

    const result = {
      campaign_id: parseInt(campaign_id),
      total_wins: totalWins,
      tiers: distribution.map(item => ({
        reward_tier: item.prize?.reward_tier,
        win_count: parseInt(item.win_count) || 0,
        percentage: totalWins > 0 ? ((item.win_count / totalWins) * 100).toFixed(2) : '0.00'
      }))
    }

    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.PRIZE_DISTRIBUTION)

    return result
  }

  /**
   * 获取活动效果分析
   * 热点查询 - 启用缓存
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 活动效果分析
   */
  static async getCampaignEffectAnalysis(campaign_id) {
    const cacheKey = `lottery:analytics:effect:${campaign_id}`

    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('活动效果分析命中缓存', { cacheKey })
      return cached
    }

    const { LotteryDraw, LotteryCampaign } = require('../../models')

    // 获取活动信息
    const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), {
      attributes: ['lottery_campaign_id', 'campaign_name', 'status', 'start_time', 'end_time']
    })

    if (!campaign) {
      return null
    }

    // 获取抽奖统计
    const [totalDraws, winDraws, uniqueUsers, repeatUsers] = await Promise.all([
      // 总抽奖次数
      LotteryDraw.count({
        where: { lottery_campaign_id: parseInt(campaign_id) }
      }),
      // 中奖次数
      LotteryDraw.count({
        where: {
          lottery_campaign_id: parseInt(campaign_id),
          lottery_prize_id: { [Op.ne]: null }
        }
      }),
      // 独立用户数
      LotteryDraw.count({
        where: { lottery_campaign_id: parseInt(campaign_id) },
        distinct: true,
        col: 'user_id'
      }),
      // 重复用户数（抽奖次数>1的用户）
      (async () => {
        const result = await LotteryDraw.findAll({
          attributes: ['user_id', [fn('COUNT', col('lottery_draw_id')), 'draw_count']],
          where: { lottery_campaign_id: parseInt(campaign_id) },
          group: ['user_id'],
          having: literal('draw_count > 1'),
          raw: true
        })
        return result.length
      })()
    ])

    const result = {
      campaign_id: parseInt(campaign_id),
      campaign_name: campaign.campaign_name,
      status: campaign.status,
      start_time: campaign.start_time,
      end_time: campaign.end_time,
      metrics: {
        total_draws: totalDraws,
        win_draws: winDraws,
        unique_users: uniqueUsers,
        repeat_users: repeatUsers,
        win_rate: totalDraws > 0 ? ((winDraws / totalDraws) * 100).toFixed(2) : '0.00',
        avg_draws_per_user: uniqueUsers > 0 ? (totalDraws / uniqueUsers).toFixed(2) : '0.00',
        repeat_rate: uniqueUsers > 0 ? ((repeatUsers / uniqueUsers) * 100).toFixed(2) : '0.00'
      }
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.CAMPAIGN_EFFECT)

    return result
  }

  /**
   * 获取用户抽奖行为分析
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {number} [options.campaign_id] - 活动ID（可选）
   * @returns {Promise<Object>} 用户行为分析
   */
  static async getUserBehaviorAnalysis(user_id, options = {}) {
    const { LotteryDraw, LotteryPrize } = require('../../models')

    const { campaign_id } = options

    // 构建查询条件
    const where = { user_id: parseInt(user_id) }
    if (campaign_id) where.lottery_campaign_id = parseInt(campaign_id)

    // 获取用户抽奖统计
    const [totalDraws, winDraws, prizeStats] = await Promise.all([
      // 总抽奖次数
      LotteryDraw.count({ where }),
      // 中奖次数
      LotteryDraw.count({
        where: {
          ...where,
          lottery_prize_id: { [Op.ne]: null }
        }
      }),
      // 按奖品类型统计
      LotteryDraw.findAll({
        attributes: [[fn('COUNT', col('lottery_draw_id')), 'win_count']],
        where: {
          ...where,
          lottery_prize_id: { [Op.ne]: null }
        },
        include: [
          {
            model: LotteryPrize,
            as: 'prize',
            attributes: ['prize_type', 'reward_tier'],
            required: true
          }
        ],
        group: ['prize.prize_type', 'prize.reward_tier'],
        raw: true,
        nest: true
      })
    ])

    return {
      user_id: parseInt(user_id),
      campaign_id: campaign_id ? parseInt(campaign_id) : null,
      metrics: {
        total_draws: totalDraws,
        win_draws: winDraws,
        win_rate: totalDraws > 0 ? ((winDraws / totalDraws) * 100).toFixed(2) : '0.00'
      },
      prize_breakdown: prizeStats.map(item => ({
        prize_type: item.prize?.prize_type,
        reward_tier: item.prize?.reward_tier,
        win_count: parseInt(item.win_count) || 0
      }))
    }
  }
  // ==================== Dashboard 级别跨活动聚合查询 ====================

  /**
   * 获取抽奖 Dashboard 统计（跨活动聚合）
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.range='7d'] - 时间范围
   * @param {number} [options.merchant_id] - 按商家筛选（通过 LotteryPrize 关联）
   * @returns {Promise<Object>} { total_draws, total_wins, win_rate, total_prize_value, updated_at }
   */
  static async getDashboardStats(options = {}) {
    const { range = '7d', merchant_id } = options
    const { start_time, end_time } = this._getTimeRange(range)
    const { LotteryDraw, LotteryPrize } = require('../../models')

    const queryOptions = {
      attributes: [
        [fn('COUNT', col('LotteryDraw.lottery_draw_id')), 'total_draws'],
        [
          fn(
            'SUM',
            literal("CASE WHEN LotteryDraw.reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")
          ),
          'total_wins'
        ],
        [fn('SUM', col('LotteryDraw.prize_value_points')), 'total_prize_value']
      ],
      where: { created_at: { [Op.between]: [start_time, end_time] } },
      raw: true
    }

    if (merchant_id) {
      queryOptions.include = [
        {
          model: LotteryPrize,
          as: 'prize',
          attributes: [],
          where: { merchant_id: parseInt(merchant_id) },
          required: true
        }
      ]
    }

    const stats = await LotteryDraw.findAll(queryOptions)
    const result = stats[0] || {}
    const totalDraws = parseInt(result.total_draws || 0)
    const totalWins = parseInt(result.total_wins || 0)

    return {
      total_draws: totalDraws,
      total_wins: totalWins,
      win_rate: totalDraws > 0 ? parseFloat(((totalWins / totalDraws) * 100).toFixed(1)) : 0,
      total_prize_value: parseInt(result.total_prize_value || 0),
      updated_at: new Date().toISOString()
    }
  }

  /**
   * 获取抽奖趋势（跨活动聚合，按天/小时分组）
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.range='7d'] - 时间范围
   * @param {string} [options.granularity='day'] - 粒度（hour/day）
   * @param {number} [options.merchant_id] - 按商家筛选
   * @returns {Promise<Object>} { trend, range, granularity, updated_at }
   */
  static async getDashboardTrend(options = {}) {
    const { range = '7d', granularity = 'day', merchant_id } = options
    const { start_time, end_time } = this._getTimeRange(range)
    const { LotteryDraw, LotteryPrize } = require('../../models')

    const dateFormat =
      granularity === 'hour'
        ? "DATE_FORMAT(CONVERT_TZ(`LotteryDraw`.`created_at`, '+00:00', '+08:00'), '%Y-%m-%d %H:00')"
        : "DATE_FORMAT(CONVERT_TZ(`LotteryDraw`.`created_at`, '+00:00', '+08:00'), '%Y-%m-%d')"

    const queryOptions = {
      attributes: [
        [literal(dateFormat), 'date'],
        [fn('COUNT', col('LotteryDraw.lottery_draw_id')), 'draws'],
        [
          fn(
            'SUM',
            literal(
              "CASE WHEN `LotteryDraw`.`reward_tier` IN ('high', 'mid', 'low') THEN 1 ELSE 0 END"
            )
          ),
          'wins'
        ]
      ],
      where: { created_at: { [Op.between]: [start_time, end_time] } },
      group: [literal(dateFormat)],
      order: [[literal('date'), 'ASC']],
      raw: true
    }

    if (merchant_id) {
      queryOptions.include = [
        {
          model: LotteryPrize,
          as: 'prize',
          attributes: [],
          where: { merchant_id: parseInt(merchant_id) },
          required: true
        }
      ]
    }

    const trendData = await LotteryDraw.findAll(queryOptions)

    return {
      trend: trendData.map(item => ({
        date: item.date,
        draws: parseInt(item.draws || 0),
        wins: parseInt(item.wins || 0),
        win_rate:
          parseInt(item.draws) > 0
            ? parseFloat(((parseInt(item.wins) / parseInt(item.draws)) * 100).toFixed(1))
            : 0
      })),
      range,
      granularity,
      updated_at: new Date().toISOString()
    }
  }

  /**
   * 获取奖品档位分布（跨活动聚合）
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.range='7d'] - 时间范围
   * @param {number} [options.merchant_id] - 按商家筛选
   * @returns {Promise<Object>} { distribution, total_count, range, updated_at }
   */
  static async getDashboardPrizeDistribution(options = {}) {
    const { range = '7d', merchant_id } = options
    const { start_time, end_time } = this._getTimeRange(range)
    const { LotteryDraw, LotteryPrize } = require('../../models')

    const TIER_NAMES = {
      high: '高级奖品',
      mid: '中级奖品',
      low: '低级奖品',
      fallback: '保底奖品',
      unknown: '未知'
    }

    const queryOptions = {
      attributes: [
        'reward_tier',
        [fn('COUNT', col('LotteryDraw.lottery_draw_id')), 'count'],
        [fn('SUM', col('LotteryDraw.prize_value_points')), 'value']
      ],
      where: { created_at: { [Op.between]: [start_time, end_time] } },
      group: ['reward_tier'],
      raw: true
    }

    if (merchant_id) {
      queryOptions.include = [
        {
          model: LotteryPrize,
          as: 'prize',
          attributes: [],
          where: { merchant_id: parseInt(merchant_id) },
          required: true
        }
      ]
    }

    const distributionData = await LotteryDraw.findAll(queryOptions)
    const totalCount = distributionData.reduce((sum, item) => sum + parseInt(item.count || 0), 0)

    const distribution = distributionData
      .map(item => ({
        tier: item.reward_tier || 'unknown',
        tier_name: TIER_NAMES[item.reward_tier] || '未知',
        count: parseInt(item.count || 0),
        percentage:
          totalCount > 0
            ? parseFloat(((parseInt(item.count || 0) / totalCount) * 100).toFixed(1))
            : 0,
        value: parseInt(item.value || 0)
      }))
      .sort((a, b) => b.count - a.count)

    return { distribution, total_count: totalCount, range, updated_at: new Date().toISOString() }
  }

  /**
   * 获取活动排行（跨活动聚合）
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.range='7d'] - 时间范围
   * @param {string} [options.sort_by='draws'] - 排序字段
   * @param {number} [options.limit=10] - 返回数量
   * @param {number} [options.merchant_id] - 按商家筛选
   * @returns {Promise<Object>} { ranking, range, sort_by, updated_at }
   */
  static async getDashboardCampaignRanking(options = {}) {
    const { range = '7d', sort_by = 'draws', limit = 10, merchant_id } = options
    const { start_time, end_time } = this._getTimeRange(range)
    const { LotteryDraw, LotteryCampaign, LotteryPrize } = require('../../models')

    const includeList = [
      {
        model: LotteryCampaign,
        as: 'campaign',
        attributes: ['campaign_name', 'status'],
        required: false
      }
    ]

    if (merchant_id) {
      includeList.push({
        model: LotteryPrize,
        as: 'prize',
        attributes: [],
        where: { merchant_id: parseInt(merchant_id) },
        required: true
      })
    }

    const rankingData = await LotteryDraw.findAll({
      attributes: [
        'lottery_campaign_id',
        [fn('COUNT', col('LotteryDraw.lottery_draw_id')), 'draws'],
        [
          fn(
            'SUM',
            literal(
              "CASE WHEN `LotteryDraw`.`reward_tier` IN ('high', 'mid', 'low') THEN 1 ELSE 0 END"
            )
          ),
          'wins'
        ],
        [fn('COUNT', fn('DISTINCT', col('LotteryDraw.user_id'))), 'users']
      ],
      where: { created_at: { [Op.between]: [start_time, end_time] } },
      include: includeList,
      group: ['lottery_campaign_id'],
      order: [[literal(sort_by === 'wins' ? 'wins' : 'draws'), 'DESC']],
      limit: parseInt(limit),
      raw: false
    })

    return {
      ranking: rankingData.map((item, index) => {
        const draws = parseInt(item.dataValues.draws || 0)
        const wins = parseInt(item.dataValues.wins || 0)
        return {
          rank: index + 1,
          lottery_campaign_id: item.lottery_campaign_id,
          campaign_name: item.campaign?.campaign_name || '未知活动',
          status: item.campaign?.status || 'unknown',
          draws,
          wins,
          win_rate: draws > 0 ? parseFloat(((wins / draws) * 100).toFixed(1)) : 0,
          users: parseInt(item.dataValues.users || 0)
        }
      }),
      range,
      sort_by,
      updated_at: new Date().toISOString()
    }
  }

  // ==================== 内部工具方法 ====================

  /**
   * 根据范围字符串计算起止时间
   * @param {string} range - 时间范围（如 '7d', '30d', '90d'）
   * @returns {Object} { start_time, end_time }
   * @private
   */
  static _getTimeRange(range = '7d') {
    const now = new Date()
    const days = parseInt(range) || 7
    return { start_time: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), end_time: now }
  }
}

module.exports = LotteryAnalyticsQueryService
