'use strict'

/**
 * 管理后台仪表盘查询服务
 *
 * @description 提供管理后台仪表盘的只读查询功能
 *
 * 遵循架构规范：读写分层策略 Phase 3
 * 热点仪表盘数据启用缓存
 *
 * 涵盖查询：
 * - 系统总览统计
 * - 用户统计
 * - 业务统计
 * - 实时活动监控
 * - 趋势分析
 *
 * @module services/console/DashboardQueryService
 * @version 1.0.0
 * @date 2026-02-01
 */

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const BusinessCacheHelper = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 缓存配置
 * @constant
 */
const CACHE_CONFIG = {
  /** 系统总览缓存 TTL (60秒) */
  SYSTEM_OVERVIEW: 60,
  /** 用户统计缓存 TTL (120秒) */
  USER_STATS: 120,
  /** 业务统计缓存 TTL (120秒) */
  BUSINESS_STATS: 120,
  /** 趋势分析缓存 TTL (300秒) */
  TREND_ANALYSIS: 300
}

/**
 * 管理后台仪表盘查询服务类
 *
 * @class DashboardQueryService
 */
class DashboardQueryService {
  /**
   * 获取系统总览
   * 热点查询 - 启用缓存
   *
   * @returns {Promise<Object>} 系统总览数据
   */
  static async getSystemOverview() {
    const cacheKey = 'console:dashboard:overview'

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('系统总览命中缓存', { cacheKey })
      return cached
    }

    const { User, LotteryDraw, MarketListing, ConsumptionRecord, Account } = require('../../models')

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 并行获取各项统计
    const [
      totalUsers,
      todayNewUsers,
      activeUsers,
      totalDraws,
      todayDraws,
      totalListings,
      activeListings,
      totalConsumptions,
      todayConsumptions,
      totalAccounts
    ] = await Promise.all([
      // 用户统计
      User.count(),
      User.count({ where: { created_at: { [Op.gte]: today } } }),
      User.count({ where: { last_login: { [Op.gte]: today } } }),
      // 抽奖统计
      LotteryDraw.count(),
      LotteryDraw.count({ where: { created_at: { [Op.gte]: today } } }),
      // 市场统计
      MarketListing.count(),
      MarketListing.count({ where: { status: 'available' } }),
      // 消费统计
      ConsumptionRecord.count(),
      ConsumptionRecord.count({ where: { created_at: { [Op.gte]: today } } }),
      // 账户统计
      Account.count({ where: { account_type: 'user', status: 'active' } })
    ])

    const result = {
      users: {
        total: totalUsers,
        today_new: todayNewUsers,
        active_today: activeUsers
      },
      lottery: {
        total_draws: totalDraws,
        today_draws: todayDraws
      },
      market: {
        total_listings: totalListings,
        active_listings: activeListings
      },
      consumption: {
        total: totalConsumptions,
        today: todayConsumptions
      },
      accounts: {
        total_user_accounts: totalAccounts
      },
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.SYSTEM_OVERVIEW)
    logger.info('系统总览已缓存', { cacheKey })

    return result
  }

  /**
   * 获取用户增长趋势
   * 热点查询 - 启用缓存
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.days=7] - 天数
   * @returns {Promise<Object>} 用户增长趋势
   */
  static async getUserGrowthTrend(options = {}) {
    const { days = 7 } = options
    const cacheKey = `console:dashboard:user_growth:${days}`

    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('用户增长趋势命中缓存', { cacheKey })
      return cached
    }

    const { User } = require('../../models')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // 按天统计用户增长
    const growth = await User.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('user_id')), 'new_users']
      ],
      where: {
        created_at: { [Op.gte]: startDate }
      },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    })

    const result = {
      days,
      data_points: growth.map(item => ({
        date: item.date,
        new_users: parseInt(item.new_users) || 0
      }))
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.TREND_ANALYSIS)

    return result
  }

  /**
   * 获取抽奖活动趋势
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.days=7] - 天数
   * @returns {Promise<Object>} 抽奖趋势
   */
  static async getLotteryTrend(options = {}) {
    const { days = 7 } = options
    const cacheKey = `console:dashboard:lottery_trend:${days}`

    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      return cached
    }

    const { LotteryDraw } = require('../../models')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // 按天统计抽奖
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
      where: {
        created_at: { [Op.gte]: startDate }
      },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    })

    const result = {
      days,
      data_points: trend.map(item => ({
        date: item.date,
        draw_count: parseInt(item.draw_count) || 0,
        win_count: parseInt(item.win_count) || 0,
        unique_users: parseInt(item.unique_users) || 0
      }))
    }

    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.TREND_ANALYSIS)

    return result
  }

  /**
   * 获取市场交易趋势
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.days=7] - 天数
   * @returns {Promise<Object>} 市场交易趋势
   */
  static async getMarketTrend(options = {}) {
    const { days = 7 } = options
    const cacheKey = `console:dashboard:market_trend:${days}`

    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      return cached
    }

    const { MarketListing } = require('../../models')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // 按天统计市场活动
    const [newListings, soldListings] = await Promise.all([
      // 新挂牌
      MarketListing.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('market_listing_id')), 'count']
        ],
        where: {
          created_at: { [Op.gte]: startDate }
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      }),
      // 售出
      MarketListing.findAll({
        attributes: [
          [fn('DATE', col('sold_at')), 'date'],
          [fn('COUNT', col('market_listing_id')), 'count']
        ],
        where: {
          status: 'sold',
          sold_at: { [Op.gte]: startDate }
        },
        group: [fn('DATE', col('sold_at'))],
        raw: true
      })
    ])

    // 合并数据
    const dateMap = new Map()
    newListings.forEach(item => {
      dateMap.set(item.date, { date: item.date, new_listings: parseInt(item.count), sold: 0 })
    })
    soldListings.forEach(item => {
      const existing = dateMap.get(item.date)
      if (existing) {
        existing.sold = parseInt(item.count)
      } else {
        dateMap.set(item.date, { date: item.date, new_listings: 0, sold: parseInt(item.count) })
      }
    })

    const result = {
      days,
      data_points: Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
    }

    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.TREND_ANALYSIS)

    return result
  }

  /**
   * 获取消费趋势
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.days=7] - 天数
   * @returns {Promise<Object>} 消费趋势
   */
  static async getConsumptionTrend(options = {}) {
    const { days = 7 } = options
    const cacheKey = `console:dashboard:consumption_trend:${days}`

    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      return cached
    }

    const { ConsumptionRecord } = require('../../models')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // 按天统计消费
    const trend = await ConsumptionRecord.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('consumption_record_id')), 'record_count'],
        [fn('SUM', col('consumption_amount')), 'total_amount'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
      ],
      where: {
        created_at: { [Op.gte]: startDate }
      },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    })

    const result = {
      days,
      data_points: trend.map(item => ({
        date: item.date,
        record_count: parseInt(item.record_count) || 0,
        total_amount: parseFloat(item.total_amount) || 0,
        unique_users: parseInt(item.unique_users) || 0
      }))
    }

    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.TREND_ANALYSIS)

    return result
  }

  /**
   * 获取实时活动监控
   * 热点查询 - 短缓存
   *
   * @returns {Promise<Object>} 实时活动数据
   */
  static async getRealtimeActivity() {
    const cacheKey = 'console:dashboard:realtime'

    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      return cached
    }

    const {
      LotteryDraw,
      MarketListing,
      ConsumptionRecord,
      AuthenticationSession
    } = require('../../models')

    const now = new Date()
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000)
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000)

    // 获取近期活动
    const [recentDraws, recentListings, recentConsumptions, activeSessions] = await Promise.all([
      // 近1小时抽奖
      LotteryDraw.count({ where: { created_at: { [Op.gte]: lastHour } } }),
      // 近1小时市场挂牌
      MarketListing.count({ where: { created_at: { [Op.gte]: lastHour } } }),
      // 近1小时消费记录
      ConsumptionRecord.count({ where: { created_at: { [Op.gte]: lastHour } } }),
      // 活跃会话
      AuthenticationSession.count({
        where: {
          is_active: true,
          last_activity: { [Op.gte]: last5Minutes }
        }
      })
    ])

    const result = {
      last_hour: {
        draws: recentDraws,
        listings: recentListings,
        consumptions: recentConsumptions
      },
      active_sessions: activeSessions,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    // 短缓存：30秒
    await BusinessCacheHelper.set(cacheKey, result, 30)

    return result
  }
}

module.exports = DashboardQueryService
