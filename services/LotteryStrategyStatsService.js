'use strict'

/**
 * @file 抽奖策略统计服务
 * @description 抽奖策略引擎监控仪表盘的统计数据查询服务
 *
 * 基于《抽奖策略引擎监控方案》文档实现
 *
 * 核心功能：
 * 1. 实时概览数据查询（Redis + lottery_draws）
 * 2. 小时趋势数据查询（双轨：24h内查明细，历史查聚合）
 * 3. 日报趋势数据查询（lottery_daily_metrics）
 * 4. Budget Tier 分布统计
 * 5. 体验机制触发统计
 * 6. 预算消耗统计
 *
 * 双轨查询策略：
 * - 今日/最近24小时：lottery_draws（实时性优先）
 * - 最近7-90天：lottery_hourly_metrics（性能优先）
 * - 90天以上：lottery_daily_metrics（存储效率优先）
 *
 * @module services/LotteryStrategyStatsService
 * @author 抽奖策略引擎监控方案实施
 * @since 2026-01-21
 */

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../utils/logger').logger
const { getRedisClient, isRedisHealthy } = require('../utils/UnifiedRedisClient')

/**
 * Redis Key 前缀常量
 * @constant
 */
const REDIS_KEY_PREFIX = {
  /** 实时抽奖计数器前缀 */
  REALTIME_DRAWS: 'lottery:stats:realtime:',
  /** 当前小时计数器前缀 */
  HOURLY_COUNTER: 'lottery:stats:hourly:'
}

/**
 * 时间范围类型枚举
 * @constant
 */
const TIME_RANGE_TYPE = {
  /** 今日/最近24小时 - 使用 lottery_draws */
  REALTIME: 'realtime',
  /** 7-90天 - 使用 lottery_hourly_metrics */
  HOURLY: 'hourly',
  /** 90天以上 - 使用 lottery_daily_metrics */
  DAILY: 'daily'
}

/**
 * 抽奖策略统计服务
 * 提供监控仪表盘所需的统计数据查询功能
 *
 * @class LotteryStrategyStatsService
 */
class LotteryStrategyStatsService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.logger = logger
  }

  /**
   * 获取Redis客户端（带健康检查）
   * @private
   * @returns {Promise<Object|null>} Redis客户端或null（不可用时）
   */
  async _getRedisClient() {
    try {
      const healthy = await isRedisHealthy()
      if (!healthy) {
        this.logger.warn('Redis不健康，降级到MySQL查询')
        return null
      }
      return await getRedisClient()
    } catch (error) {
      this.logger.warn('获取Redis客户端失败，降级到MySQL查询', { error: error.message })
      return null
    }
  }

  /**
   * 确定时间范围使用的查询策略
   * @private
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {string} 查询策略类型
   */
  _determineQueryStrategy(start_time, end_time) {
    const now = new Date()
    const hoursAgo24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const daysAgo90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // 如果结束时间在24小时内，使用实时查询
    if (end_time >= hoursAgo24) {
      return TIME_RANGE_TYPE.REALTIME
    }

    // 如果开始时间在90天内，使用小时聚合表
    if (start_time >= daysAgo90) {
      return TIME_RANGE_TYPE.HOURLY
    }

    // 超过90天，使用日报表
    return TIME_RANGE_TYPE.DAILY
  }

  /**
   * 获取今日北京时间日期范围
   * @private
   * @returns {Object} { start: Date, end: Date }
   */
  _getTodayRange() {
    const now = new Date()
    // 北京时间UTC+8
    const beijingOffset = 8 * 60 * 60 * 1000
    const beijingNow = new Date(now.getTime() + beijingOffset)

    // 今日开始（北京时间0点）
    const start = new Date(
      Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate()) -
        beijingOffset
    )
    // 今日结束（北京时间23:59:59.999）
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)

    return { start, end }
  }

  /**
   * 获取当前小时范围
   * @private
   * @returns {Object} { start: Date, end: Date }
   */
  _getCurrentHourRange() {
    const now = new Date()
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    )
    const end = new Date(start.getTime() + 60 * 60 * 1000 - 1)
    return { start, end }
  }

  /**
   * 获取实时概览数据
   *
   * 数据源优先级：
   * 1. Redis实时计数器（优先）
   * 2. lottery_draws表查询（降级方案）
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 实时概览数据
   */
  async getRealtimeOverview(campaign_id) {
    this.logger.info('获取实时概览数据', { campaign_id })

    const todayRange = this._getTodayRange()
    const hourRange = this._getCurrentHourRange()

    // 尝试从Redis获取实时数据
    const redis = await this._getRedisClient()
    let redis_data = null

    if (redis) {
      try {
        const today_key = `${REDIS_KEY_PREFIX.REALTIME_DRAWS}${campaign_id}:${todayRange.start.toISOString().slice(0, 10)}`
        const hour_key = `${REDIS_KEY_PREFIX.HOURLY_COUNTER}${campaign_id}:${hourRange.start.toISOString().slice(0, 13)}`

        const [today_draws, hour_draws] = await Promise.all([
          redis.get(today_key),
          redis.get(hour_key)
        ])

        if (today_draws !== null || hour_draws !== null) {
          redis_data = {
            today_draws: parseInt(today_draws) || 0,
            hour_draws: parseInt(hour_draws) || 0
          }
          this.logger.debug('从Redis获取实时数据成功', redis_data)
        }
      } catch (error) {
        this.logger.warn('Redis查询失败，降级到MySQL', { error: error.message })
      }
    }

    // 从MySQL查询完整数据
    const [today_stats, hour_stats] = await Promise.all([
      this._getTodayStatsFromDraws(campaign_id, todayRange),
      this._getHourStatsFromDraws(campaign_id, hourRange)
    ])

    // 合并Redis和MySQL数据
    const result = {
      today: {
        total_draws: redis_data?.today_draws || today_stats.total_draws,
        unique_users: today_stats.unique_users,
        empty_rate: today_stats.empty_rate,
        total_budget_consumed: today_stats.total_budget_consumed,
        avg_budget_per_draw: today_stats.avg_budget_per_draw
      },
      current_hour: {
        total_draws: redis_data?.hour_draws || hour_stats.total_draws,
        empty_rate: hour_stats.empty_rate
      },
      data_source: redis_data ? 'redis' : 'mysql',
      generated_at: new Date().toISOString()
    }

    return result
  }

  /**
   * 从lottery_draws表获取今日统计
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Object} range - 时间范围
   * @returns {Promise<Object>} 统计数据
   */
  async _getTodayStatsFromDraws(campaign_id, range) {
    const LotteryDraw = this.models.LotteryDraw
    const LotteryDrawDecision = this.models.LotteryDrawDecision

    // 基础统计
    const draws = await LotteryDraw.findAll({
      where: {
        campaign_id,
        created_at: {
          [Op.gte]: range.start,
          [Op.lte]: range.end
        }
      },
      include: [
        {
          model: LotteryDrawDecision,
          as: 'decision',
          required: false,
          // 只查询需要的字段，避免模型定义与数据库不一致的问题
          attributes: ['decision_id', 'budget_deducted', 'budget_tier', 'pressure_tier']
        }
      ],
      raw: false
    })

    const total_draws = draws.length
    const unique_users = new Set(draws.map(d => d.user_id)).size
    // empty_count 只统计真正空奖（empty 或 prize_id 为空），不包括正常保底（fallback）
    const empty_count = draws.filter(d => d.prize_type === 'empty' || !d.prize_id).length
    const empty_rate = total_draws > 0 ? empty_count / total_draws : 0

    // 预算消耗计算（从decision表，字段为 budget_deducted）
    let total_budget_consumed = 0
    for (const draw of draws) {
      if (draw.decision?.budget_deducted) {
        total_budget_consumed += parseFloat(draw.decision.budget_deducted) || 0
      }
    }

    const avg_budget_per_draw = total_draws > 0 ? total_budget_consumed / total_draws : 0

    return {
      total_draws,
      unique_users,
      empty_rate: parseFloat(empty_rate.toFixed(4)),
      total_budget_consumed: parseFloat(total_budget_consumed.toFixed(2)),
      avg_budget_per_draw: parseFloat(avg_budget_per_draw.toFixed(2))
    }
  }

  /**
   * 从lottery_draws表获取当前小时统计
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Object} range - 时间范围
   * @returns {Promise<Object>} 统计数据
   */
  async _getHourStatsFromDraws(campaign_id, range) {
    const LotteryDraw = this.models.LotteryDraw

    const draws = await LotteryDraw.count({
      where: {
        campaign_id,
        created_at: {
          [Op.gte]: range.start,
          [Op.lte]: range.end
        }
      }
    })

    // empty_count 只统计真正空奖（empty 或 prize_id 为空），不包括正常保底（fallback）
    const empty_count = await LotteryDraw.count({
      where: {
        campaign_id,
        created_at: {
          [Op.gte]: range.start,
          [Op.lte]: range.end
        },
        [Op.or]: [{ prize_type: 'empty' }, { prize_id: null }]
      }
    })

    const empty_rate = draws > 0 ? empty_count / draws : 0

    return {
      total_draws: draws,
      empty_rate: parseFloat(empty_rate.toFixed(4))
    }
  }

  /**
   * 获取小时趋势数据
   * 使用双轨查询策略
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_time - 开始时间
   * @param {Date|string} options.end_time - 结束时间
   * @returns {Promise<Object>} 小时趋势数据
   */
  async getHourlyTrend(campaign_id, options = {}) {
    const start_time = options.start_time
      ? new Date(options.start_time)
      : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const end_time = options.end_time ? new Date(options.end_time) : new Date()

    const strategy = this._determineQueryStrategy(start_time, end_time)
    this.logger.info('获取小时趋势数据', { campaign_id, strategy, start_time, end_time })

    if (strategy === TIME_RANGE_TYPE.REALTIME) {
      return await this._getHourlyFromDraws(campaign_id, start_time, end_time)
    } else {
      return await this._getHourlyFromMetrics(campaign_id, start_time, end_time)
    }
  }

  /**
   * 从lottery_draws表聚合小时数据
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 小时聚合数据
   */
  async _getHourlyFromDraws(campaign_id, start_time, end_time) {
    const LotteryDraw = this.models.LotteryDraw

    /*
     * 使用SQL按小时分组聚合
     * 注意：fallback 和 empty 分开统计
     * - fallback_tier_count：正常保底机制触发次数
     * - empty_count：真正空奖次数（系统异常，需要运营关注）
     */
    const hourly_data = await LotteryDraw.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00'), 'hour_bucket'],
        [fn('COUNT', col('draw_id')), 'total_draws'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users'],
        // 保底奖品次数（正常保底机制）
        [
          fn('SUM', literal("CASE WHEN prize_type = 'fallback' THEN 1 ELSE 0 END")),
          'fallback_tier_count'
        ],
        // 真正空奖次数（系统异常导致）
        [
          fn(
            'SUM',
            literal("CASE WHEN prize_type = 'empty' OR prize_id IS NULL THEN 1 ELSE 0 END")
          ),
          'empty_count'
        ]
      ],
      where: {
        campaign_id,
        created_at: {
          [Op.gte]: start_time,
          [Op.lte]: end_time
        }
      },
      group: [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00')],
      order: [[fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00'), 'ASC']],
      raw: true
    })

    // 计算空奖率（使用真正空奖数 empty_count，而非保底数 fallback_tier_count）
    const result = hourly_data.map(row => ({
      hour_bucket: row.hour_bucket,
      total_draws: parseInt(row.total_draws) || 0,
      unique_users: parseInt(row.unique_users) || 0,
      fallback_tier_count: parseInt(row.fallback_tier_count) || 0,
      empty_count: parseInt(row.empty_count) || 0,
      empty_rate:
        row.total_draws > 0 ? (parseInt(row.empty_count) || 0) / parseInt(row.total_draws) : 0
    }))

    return {
      data: result,
      data_source: 'lottery_draws',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_hourly_metrics表查询
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 小时指标数据
   */
  async _getHourlyFromMetrics(campaign_id, start_time, end_time) {
    const LotteryHourlyMetrics = this.models.LotteryHourlyMetrics

    const metrics = await LotteryHourlyMetrics.findAll({
      where: {
        campaign_id,
        hour_bucket: {
          [Op.gte]: start_time,
          [Op.lte]: end_time
        }
      },
      order: [['hour_bucket', 'ASC']],
      raw: true
    })

    return {
      data: metrics.map(row => ({
        hour_bucket: row.hour_bucket,
        total_draws: row.total_draws,
        unique_users: row.unique_users,
        fallback_tier_count: row.fallback_tier_count,
        empty_count: row.empty_count || 0, // 真正空奖次数
        empty_rate: parseFloat(row.empty_rate) || 0,
        high_tier_count: row.high_tier_count,
        mid_tier_count: row.mid_tier_count,
        low_tier_count: row.low_tier_count
      })),
      data_source: 'lottery_hourly_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 获取日报趋势数据
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_date - 开始日期
   * @param {Date|string} options.end_date - 结束日期
   * @param {number} options.days - 查询天数（默认30）
   * @returns {Promise<Object>} 日报趋势数据
   */
  async getDailyTrend(campaign_id, options = {}) {
    const days = options.days || 30
    const end_date = options.end_date ? new Date(options.end_date) : new Date()
    const start_date = options.start_date
      ? new Date(options.start_date)
      : new Date(end_date.getTime() - days * 24 * 60 * 60 * 1000)

    this.logger.info('获取日报趋势数据', { campaign_id, start_date, end_date })

    const LotteryDailyMetrics = this.models.LotteryDailyMetrics

    const metrics = await LotteryDailyMetrics.findAll({
      where: {
        campaign_id,
        metric_date: {
          [Op.gte]: start_date.toISOString().slice(0, 10),
          [Op.lte]: end_date.toISOString().slice(0, 10)
        }
      },
      order: [['metric_date', 'ASC']],
      raw: true
    })

    return {
      data: metrics.map(row => ({
        metric_date: row.metric_date,
        total_draws: row.total_draws,
        unique_users: row.unique_users,
        empty_rate: parseFloat(row.empty_rate) || 0,
        high_value_rate: parseFloat(row.high_value_rate) || 0,
        total_budget_consumed: parseFloat(row.total_budget_consumed) || 0,
        avg_budget_per_draw: parseFloat(row.avg_budget_per_draw) || 0,
        pity_trigger_count: row.pity_trigger_count,
        anti_empty_trigger_count: row.anti_empty_trigger_count,
        anti_high_trigger_count: row.anti_high_trigger_count,
        luck_debt_trigger_count: row.luck_debt_trigger_count
      })),
      data_source: 'lottery_daily_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 获取Budget Tier分布统计
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_time - 开始时间
   * @param {Date|string} options.end_time - 结束时间
   * @returns {Promise<Object>} Budget Tier分布数据
   */
  async getTierDistribution(campaign_id, options = {}) {
    const start_time = options.start_time
      ? new Date(options.start_time)
      : this._getTodayRange().start
    const end_time = options.end_time ? new Date(options.end_time) : new Date()

    const strategy = this._determineQueryStrategy(start_time, end_time)
    this.logger.info('获取Budget Tier分布', { campaign_id, strategy })

    if (strategy === TIME_RANGE_TYPE.REALTIME) {
      return await this._getTierDistributionFromDecisions(campaign_id, start_time, end_time)
    } else if (strategy === TIME_RANGE_TYPE.HOURLY) {
      return await this._getTierDistributionFromHourly(campaign_id, start_time, end_time)
    } else {
      return await this._getTierDistributionFromDaily(campaign_id, start_time, end_time)
    }
  }

  /**
   * 从lottery_draw_decisions表获取Budget Tier分布
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} Budget Tier分布数据
   */
  async _getTierDistributionFromDecisions(campaign_id, start_time, end_time) {
    const LotteryDrawDecision = this.models.LotteryDrawDecision
    const LotteryDraw = this.models.LotteryDraw

    // 通过 draw_id 关联 LotteryDraw 表来过滤 campaign_id
    const distribution = await LotteryDrawDecision.findAll({
      attributes: ['budget_tier', [fn('COUNT', col('LotteryDrawDecision.decision_id')), 'count']],
      include: [
        {
          model: LotteryDraw,
          as: 'draw',
          attributes: [],
          where: {
            campaign_id,
            created_at: {
              [Op.gte]: start_time,
              [Op.lte]: end_time
            }
          },
          required: true
        }
      ],
      group: ['LotteryDrawDecision.budget_tier'],
      raw: true
    })

    const total = distribution.reduce((sum, row) => sum + parseInt(row.count), 0)

    const budget_tiers = {
      B0: { count: 0, percentage: 0 },
      B1: { count: 0, percentage: 0 },
      B2: { count: 0, percentage: 0 },
      B3: { count: 0, percentage: 0 }
    }

    for (const row of distribution) {
      const tier = row.budget_tier
      if (budget_tiers[tier]) {
        budget_tiers[tier].count = parseInt(row.count)
        budget_tiers[tier].percentage = total > 0 ? parseInt(row.count) / total : 0
      }
    }

    return {
      budget_tiers,
      total,
      data_source: 'lottery_draw_decisions',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_hourly_metrics表聚合Budget Tier分布
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} Budget Tier分布数据
   */
  async _getTierDistributionFromHourly(campaign_id, start_time, end_time) {
    const LotteryHourlyMetrics = this.models.LotteryHourlyMetrics

    const metrics = await LotteryHourlyMetrics.findAll({
      attributes: [
        [fn('SUM', col('b0_tier_count')), 'b0_count'],
        [fn('SUM', col('b1_tier_count')), 'b1_count'],
        [fn('SUM', col('b2_tier_count')), 'b2_count'],
        [fn('SUM', col('b3_tier_count')), 'b3_count'],
        [fn('SUM', col('total_draws')), 'total']
      ],
      where: {
        campaign_id,
        hour_bucket: {
          [Op.gte]: start_time,
          [Op.lte]: end_time
        }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total = parseInt(row.total) || 0

    const budget_tiers = {
      B0: { count: parseInt(row.b0_count) || 0, percentage: 0 },
      B1: { count: parseInt(row.b1_count) || 0, percentage: 0 },
      B2: { count: parseInt(row.b2_count) || 0, percentage: 0 },
      B3: { count: parseInt(row.b3_count) || 0, percentage: 0 }
    }

    if (total > 0) {
      Object.keys(budget_tiers).forEach(tier => {
        budget_tiers[tier].percentage = budget_tiers[tier].count / total
      })
    }

    return {
      budget_tiers,
      total,
      data_source: 'lottery_hourly_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_daily_metrics表聚合Budget Tier分布
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} Budget Tier分布数据
   */
  async _getTierDistributionFromDaily(campaign_id, start_time, end_time) {
    const LotteryDailyMetrics = this.models.LotteryDailyMetrics

    const metrics = await LotteryDailyMetrics.findAll({
      attributes: [
        [fn('SUM', col('b0_count')), 'b0_count'],
        [fn('SUM', col('b1_count')), 'b1_count'],
        [fn('SUM', col('b2_count')), 'b2_count'],
        [fn('SUM', col('b3_count')), 'b3_count'],
        [fn('SUM', col('total_draws')), 'total']
      ],
      where: {
        campaign_id,
        metric_date: {
          [Op.gte]: start_time.toISOString().slice(0, 10),
          [Op.lte]: end_time.toISOString().slice(0, 10)
        }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total = parseInt(row.total) || 0

    const budget_tiers = {
      B0: { count: parseInt(row.b0_count) || 0, percentage: 0 },
      B1: { count: parseInt(row.b1_count) || 0, percentage: 0 },
      B2: { count: parseInt(row.b2_count) || 0, percentage: 0 },
      B3: { count: parseInt(row.b3_count) || 0, percentage: 0 }
    }

    if (total > 0) {
      Object.keys(budget_tiers).forEach(tier => {
        budget_tiers[tier].percentage = budget_tiers[tier].count / total
      })
    }

    return {
      budget_tiers,
      total,
      data_source: 'lottery_daily_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 获取体验机制触发统计
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_time - 开始时间
   * @param {Date|string} options.end_time - 结束时间
   * @returns {Promise<Object>} 体验机制触发统计
   */
  async getExperienceTriggers(campaign_id, options = {}) {
    const start_time = options.start_time
      ? new Date(options.start_time)
      : this._getTodayRange().start
    const end_time = options.end_time ? new Date(options.end_time) : new Date()

    const strategy = this._determineQueryStrategy(start_time, end_time)
    this.logger.info('获取体验机制触发统计', { campaign_id, strategy })

    if (strategy === TIME_RANGE_TYPE.REALTIME) {
      return await this._getExperienceTriggersFromDecisions(campaign_id, start_time, end_time)
    } else if (strategy === TIME_RANGE_TYPE.HOURLY) {
      return await this._getExperienceTriggersFromHourly(campaign_id, start_time, end_time)
    } else {
      return await this._getExperienceTriggersFromDaily(campaign_id, start_time, end_time)
    }
  }

  /**
   * 从lottery_draw_decisions表获取体验机制触发统计
   * @private
   * @description 通过关联 LotteryDraw 表来过滤 campaign_id
   *              使用实际数据库字段：
   *              - pity_decision: 保底机制触发
   *              - fallback_triggered: 兜底机制触发（防空奖）
   *              - guarantee_triggered: 保证机制触发
   *              - luck_debt_decision: 运气债务机制触发
   *              - system_advance_triggered: 系统预付机制触发
   *              - tier_downgrade_triggered: 档位降级触发
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 体验机制触发统计数据
   */
  async _getExperienceTriggersFromDecisions(campaign_id, start_time, end_time) {
    const LotteryDrawDecision = this.models.LotteryDrawDecision
    const LotteryDraw = this.models.LotteryDraw

    // 修正：通过关联 LotteryDraw 来过滤 campaign_id
    const [total_count, triggers] = await Promise.all([
      LotteryDrawDecision.count({
        include: [
          {
            model: LotteryDraw,
            as: 'draw',
            attributes: [],
            where: {
              campaign_id,
              created_at: { [Op.gte]: start_time, [Op.lte]: end_time }
            },
            required: true
          }
        ]
      }),
      LotteryDrawDecision.findAll({
        attributes: [
          // 修正：使用实际数据库字段名
          [
            fn(
              'SUM',
              literal(
                "CASE WHEN `LotteryDrawDecision`.`pity_decision` IS NOT NULL AND `LotteryDrawDecision`.`pity_decision` != '' THEN 1 ELSE 0 END"
              )
            ),
            'pity_count'
          ],
          [
            fn(
              'SUM',
              literal('CASE WHEN `LotteryDrawDecision`.`fallback_triggered` = 1 THEN 1 ELSE 0 END')
            ),
            'anti_empty_count'
          ],
          [
            fn(
              'SUM',
              literal('CASE WHEN `LotteryDrawDecision`.`guarantee_triggered` = 1 THEN 1 ELSE 0 END')
            ),
            'guarantee_count'
          ],
          [
            fn(
              'SUM',
              literal(
                "CASE WHEN `LotteryDrawDecision`.`luck_debt_decision` IS NOT NULL AND `LotteryDrawDecision`.`luck_debt_decision` != '' THEN 1 ELSE 0 END"
              )
            ),
            'luck_debt_count'
          ],
          [
            fn(
              'SUM',
              literal(
                'CASE WHEN `LotteryDrawDecision`.`system_advance_triggered` = 1 THEN 1 ELSE 0 END'
              )
            ),
            'system_advance_count'
          ],
          [
            fn(
              'SUM',
              literal(
                'CASE WHEN `LotteryDrawDecision`.`tier_downgrade_triggered` = 1 THEN 1 ELSE 0 END'
              )
            ),
            'tier_downgrade_count'
          ]
        ],
        include: [
          {
            model: LotteryDraw,
            as: 'draw',
            attributes: [],
            where: {
              campaign_id,
              created_at: { [Op.gte]: start_time, [Op.lte]: end_time }
            },
            required: true
          }
        ],
        raw: true
      })
    ])

    const row = triggers[0] || {}
    const total = total_count || 1

    return {
      experience_triggers: {
        pity: {
          count: parseInt(row.pity_count) || 0,
          rate: (parseInt(row.pity_count) || 0) / total
        },
        anti_empty: {
          count: parseInt(row.anti_empty_count) || 0,
          rate: (parseInt(row.anti_empty_count) || 0) / total
        },
        guarantee: {
          count: parseInt(row.guarantee_count) || 0,
          rate: (parseInt(row.guarantee_count) || 0) / total
        },
        luck_debt: {
          count: parseInt(row.luck_debt_count) || 0,
          rate: (parseInt(row.luck_debt_count) || 0) / total
        },
        system_advance: {
          count: parseInt(row.system_advance_count) || 0,
          rate: (parseInt(row.system_advance_count) || 0) / total
        },
        tier_downgrade: {
          count: parseInt(row.tier_downgrade_count) || 0,
          rate: (parseInt(row.tier_downgrade_count) || 0) / total
        }
      },
      total_draws: total_count,
      data_source: 'lottery_draw_decisions',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_hourly_metrics表获取体验机制触发统计
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 体验机制触发统计数据
   */
  async _getExperienceTriggersFromHourly(campaign_id, start_time, end_time) {
    const LotteryHourlyMetrics = this.models.LotteryHourlyMetrics

    const metrics = await LotteryHourlyMetrics.findAll({
      attributes: [
        [fn('SUM', col('pity_triggered_count')), 'pity_count'],
        [fn('SUM', col('anti_empty_triggered_count')), 'anti_empty_count'],
        [fn('SUM', col('anti_high_triggered_count')), 'anti_high_count'],
        [fn('SUM', col('luck_debt_triggered_count')), 'luck_debt_count'],
        [fn('SUM', col('guarantee_triggered_count')), 'guarantee_count'], // 🔴 添加保底机制触发统计
        [fn('SUM', col('total_draws')), 'total']
      ],
      where: {
        campaign_id,
        hour_bucket: { [Op.gte]: start_time, [Op.lte]: end_time }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total = parseInt(row.total) || 1

    return {
      experience_triggers: {
        pity: {
          count: parseInt(row.pity_count) || 0,
          rate: (parseInt(row.pity_count) || 0) / total
        },
        anti_empty: {
          count: parseInt(row.anti_empty_count) || 0,
          rate: (parseInt(row.anti_empty_count) || 0) / total
        },
        anti_high: {
          count: parseInt(row.anti_high_count) || 0,
          rate: (parseInt(row.anti_high_count) || 0) / total
        },
        luck_debt: {
          count: parseInt(row.luck_debt_count) || 0,
          rate: (parseInt(row.luck_debt_count) || 0) / total
        },
        guarantee: {
          count: parseInt(row.guarantee_count) || 0,
          rate: (parseInt(row.guarantee_count) || 0) / total
        }
      },
      total_draws: parseInt(row.total) || 0,
      data_source: 'lottery_hourly_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_daily_metrics表获取体验机制触发统计
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 体验机制触发统计数据
   */
  async _getExperienceTriggersFromDaily(campaign_id, start_time, end_time) {
    const LotteryDailyMetrics = this.models.LotteryDailyMetrics

    const metrics = await LotteryDailyMetrics.findAll({
      attributes: [
        [fn('SUM', col('pity_trigger_count')), 'pity_count'],
        [fn('SUM', col('anti_empty_trigger_count')), 'anti_empty_count'],
        [fn('SUM', col('anti_high_trigger_count')), 'anti_high_count'],
        [fn('SUM', col('luck_debt_trigger_count')), 'luck_debt_count'],
        [fn('SUM', col('total_draws')), 'total']
      ],
      where: {
        campaign_id,
        metric_date: {
          [Op.gte]: start_time.toISOString().slice(0, 10),
          [Op.lte]: end_time.toISOString().slice(0, 10)
        }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total = parseInt(row.total) || 1

    return {
      experience_triggers: {
        pity: {
          count: parseInt(row.pity_count) || 0,
          rate: (parseInt(row.pity_count) || 0) / total
        },
        anti_empty: {
          count: parseInt(row.anti_empty_count) || 0,
          rate: (parseInt(row.anti_empty_count) || 0) / total
        },
        anti_high: {
          count: parseInt(row.anti_high_count) || 0,
          rate: (parseInt(row.anti_high_count) || 0) / total
        },
        luck_debt: {
          count: parseInt(row.luck_debt_count) || 0,
          rate: (parseInt(row.luck_debt_count) || 0) / total
        },
        /*
         * 🔴 注意：lottery_daily_metrics 表没有 guarantee 字段
         * 为保持 API 返回格式一致性，此处返回 0
         * 如需要精确的日级 guarantee 统计，需添加数据库迁移
         */
        guarantee: {
          count: 0,
          rate: 0
        }
      },
      total_draws: parseInt(row.total) || 0,
      data_source: 'lottery_daily_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 获取预算消耗统计
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_time - 开始时间
   * @param {Date|string} options.end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计
   */
  async getBudgetConsumption(campaign_id, options = {}) {
    const start_time = options.start_time
      ? new Date(options.start_time)
      : this._getTodayRange().start
    const end_time = options.end_time ? new Date(options.end_time) : new Date()

    const strategy = this._determineQueryStrategy(start_time, end_time)
    this.logger.info('获取预算消耗统计', { campaign_id, strategy })

    if (strategy === TIME_RANGE_TYPE.HOURLY) {
      return await this._getBudgetConsumptionFromHourly(campaign_id, start_time, end_time)
    } else if (strategy === TIME_RANGE_TYPE.DAILY) {
      return await this._getBudgetConsumptionFromDaily(campaign_id, start_time, end_time)
    } else {
      // 实时查询从draws表
      return await this._getBudgetConsumptionFromDraws(campaign_id, start_time, end_time)
    }
  }

  /**
   * 从lottery_draws获取预算消耗
   * @private
   * @description 修正字段名：
   *              - lottery_draws.prize_value_points: 奖品价值点数
   *              - lottery_draw_decisions.budget_deducted: 预算扣减金额
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计数据
   */
  async _getBudgetConsumptionFromDraws(campaign_id, start_time, end_time) {
    const LotteryDraw = this.models.LotteryDraw
    const LotteryDrawDecision = this.models.LotteryDrawDecision

    const draws = await LotteryDraw.findAll({
      attributes: ['draw_id', 'prize_value_points'], // 修正：使用正确字段名 prize_value_points
      where: {
        campaign_id,
        created_at: { [Op.gte]: start_time, [Op.lte]: end_time }
      },
      include: [
        {
          model: LotteryDrawDecision,
          as: 'decision',
          attributes: ['budget_deducted'], // budget_deducted 是正确的字段名
          required: false
        }
      ],
      raw: true,
      nest: true
    })

    const total_draws = draws.length
    let total_budget_consumed = 0
    let total_prize_value = 0

    for (const draw of draws) {
      total_budget_consumed += parseFloat(draw.decision?.budget_deducted) || 0
      total_prize_value += parseInt(draw.prize_value_points) || 0 // 修正：使用正确字段名
    }

    return {
      budget_consumption: {
        total_budget_consumed: parseFloat(total_budget_consumed.toFixed(2)),
        total_prize_value,
        avg_budget_per_draw:
          total_draws > 0 ? parseFloat((total_budget_consumed / total_draws).toFixed(2)) : 0,
        avg_prize_value:
          total_draws > 0 ? parseFloat((total_prize_value / total_draws).toFixed(2)) : 0
      },
      total_draws,
      data_source: 'lottery_draws',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_hourly_metrics获取预算消耗
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计数据
   */
  async _getBudgetConsumptionFromHourly(campaign_id, start_time, end_time) {
    const LotteryHourlyMetrics = this.models.LotteryHourlyMetrics

    const metrics = await LotteryHourlyMetrics.findAll({
      attributes: [
        [fn('SUM', col('total_budget_consumed')), 'total_budget_consumed'],
        [fn('SUM', col('total_prize_value')), 'total_prize_value'],
        [fn('SUM', col('total_draws')), 'total_draws']
      ],
      where: {
        campaign_id,
        hour_bucket: { [Op.gte]: start_time, [Op.lte]: end_time }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total_draws = parseInt(row.total_draws) || 0
    const total_budget_consumed = parseFloat(row.total_budget_consumed) || 0
    const total_prize_value = parseFloat(row.total_prize_value) || 0

    return {
      budget_consumption: {
        total_budget_consumed,
        total_prize_value,
        avg_budget_per_draw:
          total_draws > 0 ? parseFloat((total_budget_consumed / total_draws).toFixed(2)) : 0,
        avg_prize_value:
          total_draws > 0 ? parseFloat((total_prize_value / total_draws).toFixed(2)) : 0
      },
      total_draws,
      data_source: 'lottery_hourly_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_daily_metrics获取预算消耗
   * @private
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计数据
   */
  async _getBudgetConsumptionFromDaily(campaign_id, start_time, end_time) {
    const LotteryDailyMetrics = this.models.LotteryDailyMetrics

    const metrics = await LotteryDailyMetrics.findAll({
      attributes: [
        [fn('SUM', col('total_budget_consumed')), 'total_budget_consumed'],
        [fn('SUM', col('total_prize_value')), 'total_prize_value'],
        [fn('SUM', col('total_draws')), 'total_draws']
      ],
      where: {
        campaign_id,
        metric_date: {
          [Op.gte]: start_time.toISOString().slice(0, 10),
          [Op.lte]: end_time.toISOString().slice(0, 10)
        }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total_draws = parseInt(row.total_draws) || 0
    const total_budget_consumed = parseFloat(row.total_budget_consumed) || 0
    const total_prize_value = parseFloat(row.total_prize_value) || 0

    return {
      budget_consumption: {
        total_budget_consumed,
        total_prize_value,
        avg_budget_per_draw:
          total_draws > 0 ? parseFloat((total_budget_consumed / total_draws).toFixed(2)) : 0,
        avg_prize_value:
          total_draws > 0 ? parseFloat((total_prize_value / total_draws).toFixed(2)) : 0
      },
      total_draws,
      data_source: 'lottery_daily_metrics',
      generated_at: new Date().toISOString()
    }
  }
}

module.exports = LotteryStrategyStatsService
