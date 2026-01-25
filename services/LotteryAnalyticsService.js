'use strict'

/**
 * @file 抽奖分析服务（Lottery Analytics Service）
 * @description 统一的抽奖监控和统计分析服务
 *
 * 服务合并记录（2026-01-21）：
 * - 合并 LotteryMonitoringService（P2表只读查询）
 * - 合并 LotteryStrategyStatsService（策略引擎监控仪表盘统计）
 * - 原因：减少服务数量，统一抽奖分析相关操作
 *
 * 覆盖P2优先级表：
 * - lottery_hourly_metrics: 抽奖小时统计指标
 * - lottery_user_experience_state: 用户体验状态（Pity/AntiEmpty/AntiHigh）
 * - lottery_user_global_state: 用户全局状态（运气债务）
 * - lottery_campaign_quota_grants: 配额赠送记录
 * - lottery_campaign_user_quota: 用户配额状态
 * - lottery_daily_metrics: 日级统计指标
 * - lottery_draws: 抽奖记录
 * - lottery_draw_decisions: 抽奖决策记录
 *
 * 核心功能模块：
 * 1. 监控数据查询（原 LotteryMonitoringService）
 *    - 小时统计指标查询
 *    - 用户体验状态查询
 *    - 用户全局状态查询
 *    - 配额赠送记录查询
 *    - 用户配额状态查询
 *    - 综合监控统计
 *
 * 2. 策略统计分析（原 LotteryStrategyStatsService）
 *    - 实时概览数据查询（Redis + lottery_draws）
 *    - 小时趋势数据查询（双轨：24h内查明细，历史查聚合）
 *    - 日报趋势数据查询（lottery_daily_metrics）
 *    - Budget Tier 分布统计
 *    - 体验机制触发统计
 *    - 预算消耗统计
 *
 * 双轨查询策略：
 * - 今日/最近24小时：lottery_draws（实时性优先）
 * - 最近7-90天：lottery_hourly_metrics（性能优先）
 * - 90天以上：lottery_daily_metrics（存储效率优先）
 *
 * 架构原则：
 * - 只读查询服务，不涉及写操作
 * - 所有方法均为查询方法，无需事务管理
 * - 严格遵循项目 snake_case 命名规范
 *
 * @version 2.0.0
 * @date 2026-01-21
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
 * 抽奖分析服务
 * 提供监控数据查询和策略统计分析功能
 *
 * @class LotteryAnalyticsService
 */
class LotteryAnalyticsService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.logger = logger
  }

  /*
   * ==========================================
   * 第一部分：监控数据查询（原 LotteryMonitoringService）
   * ==========================================
   */

  /*
   * ==========================================
   * 1.1 lottery_hourly_metrics - 抽奖小时统计指标
   * ==========================================
   */

  /**
   * 查询抽奖小时统计指标列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID（可选，不传则查询所有活动）
   * @param {string} [options.start_time] - 开始时间（ISO8601格式，北京时间）
   * @param {string} [options.end_time] - 结束时间（ISO8601格式，北京时间）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=24] - 每页数量（默认24，即一天的小时数）
   * @returns {Promise<Object>} 统计指标列表和分页信息
   */
  async getHourlyMetrics(options = {}) {
    const { campaign_id, start_time, end_time, page = 1, page_size = 24 } = options

    const where = {}

    // 活动ID过滤
    if (campaign_id) {
      where.campaign_id = campaign_id
    }

    // 时间范围过滤
    if (start_time || end_time) {
      where.hour_bucket = {}
      if (start_time) {
        where.hour_bucket[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.hour_bucket[Op.lte] = new Date(end_time)
      }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryHourlyMetrics.findAndCountAll({
      where,
      include: [
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ],
      order: [['hour_bucket', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      metrics: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个统计指标详情
   *
   * @param {number} metric_id - 指标记录ID
   * @returns {Promise<Object|null>} 指标详情或null
   */
  async getHourlyMetricById(metric_id) {
    const metric = await this.models.LotteryHourlyMetrics.findByPk(metric_id, {
      include: [
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status', 'budget_type']
        }
      ]
    })

    return metric ? metric.get({ plain: true }) : null
  }

  /**
   * 获取活动的统计汇总数据
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} [start_time] - 开始时间
   * @param {string} [end_time] - 结束时间
   * @returns {Promise<Object>} 汇总统计数据
   */
  async getHourlyMetricsSummary(campaign_id, start_time, end_time) {
    const where = { campaign_id }
    if (start_time || end_time) {
      where.hour_bucket = {}
      if (start_time) where.hour_bucket[Op.gte] = new Date(start_time)
      if (end_time) where.hour_bucket[Op.lte] = new Date(end_time)
    }

    const summary = await this.models.LotteryHourlyMetrics.findOne({
      attributes: [
        [fn('SUM', col('total_draws')), 'total_draws'],
        [fn('SUM', col('unique_users')), 'total_unique_users'],
        [fn('SUM', col('high_tier_count')), 'total_high_tier'],
        [fn('SUM', col('mid_tier_count')), 'total_mid_tier'],
        [fn('SUM', col('low_tier_count')), 'total_low_tier'],
        [fn('SUM', col('fallback_tier_count')), 'total_fallback_tier'],
        [fn('SUM', col('total_budget_consumed')), 'total_budget_consumed'],
        [fn('SUM', col('pity_triggered_count')), 'total_pity_triggered'],
        [fn('AVG', col('empty_rate')), 'avg_empty_rate'],
        [fn('AVG', col('high_value_rate')), 'avg_high_value_rate'],
        [fn('COUNT', col('metric_id')), 'record_count']
      ],
      where,
      raw: true
    })

    return {
      campaign_id,
      period: { start_time, end_time },
      summary: {
        total_draws: parseInt(summary.total_draws) || 0,
        total_unique_users: parseInt(summary.total_unique_users) || 0,
        total_high_tier: parseInt(summary.total_high_tier) || 0,
        total_mid_tier: parseInt(summary.total_mid_tier) || 0,
        total_low_tier: parseInt(summary.total_low_tier) || 0,
        total_fallback_tier: parseInt(summary.total_fallback_tier) || 0,
        total_budget_consumed: parseInt(summary.total_budget_consumed) || 0,
        total_pity_triggered: parseInt(summary.total_pity_triggered) || 0,
        avg_empty_rate: parseFloat(summary.avg_empty_rate) || 0,
        avg_high_value_rate: parseFloat(summary.avg_high_value_rate) || 0,
        record_count: parseInt(summary.record_count) || 0
      }
    }
  }

  /*
   * ==========================================
   * 1.2 lottery_user_experience_state - 用户体验状态
   * ==========================================
   */

  /**
   * 查询用户体验状态列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {number} [options.user_id] - 用户ID
   * @param {number} [options.min_empty_streak] - 最小连续空奖次数
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户体验状态列表和分页信息
   */
  async getUserExperienceStates(options = {}) {
    const { campaign_id, user_id, min_empty_streak, page = 1, page_size = 20 } = options

    const where = {}
    if (campaign_id) where.campaign_id = campaign_id
    if (user_id) where.user_id = user_id
    if (min_empty_streak !== undefined) {
      where.empty_streak = { [Op.gte]: min_empty_streak }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryUserExperienceState.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ],
      order: [['empty_streak', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      states: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个用户在特定活动的体验状态
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 用户体验状态或null
   */
  async getUserExperienceState(user_id, campaign_id) {
    const state = await this.models.LotteryUserExperienceState.findOne({
      where: { user_id, campaign_id },
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ]
    })

    return state ? state.get({ plain: true }) : null
  }

  /*
   * ==========================================
   * 1.3 lottery_user_global_state - 用户全局状态
   * ==========================================
   */

  /**
   * 查询用户全局状态列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.user_id] - 用户ID
   * @param {string} [options.luck_debt_level] - 运气债务等级（none/low/medium/high）
   * @param {number} [options.min_draw_count] - 最小抽奖次数
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户全局状态列表和分页信息
   */
  async getUserGlobalStates(options = {}) {
    const { user_id, luck_debt_level, min_draw_count, page = 1, page_size = 20 } = options

    const where = {}
    if (user_id) where.user_id = user_id
    if (luck_debt_level) where.luck_debt_level = luck_debt_level
    if (min_draw_count !== undefined) {
      where.global_draw_count = { [Op.gte]: min_draw_count }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryUserGlobalState.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [['global_draw_count', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      states: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个用户的全局状态
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object|null>} 用户全局状态或null
   */
  async getUserGlobalState(user_id) {
    const state = await this.models.LotteryUserGlobalState.findOne({
      where: { user_id },
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ]
    })

    return state ? state.get({ plain: true }) : null
  }

  /*
   * ==========================================
   * 1.4 lottery_campaign_quota_grants - 配额赠送记录
   * ==========================================
   */

  /**
   * 查询配额赠送记录列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {number} [options.user_id] - 被赠送用户ID
   * @param {number} [options.granted_by] - 赠送操作者ID
   * @param {string} [options.grant_source] - 赠送来源
   * @param {string} [options.start_time] - 开始时间
   * @param {string} [options.end_time] - 结束时间
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 配额赠送记录列表和分页信息
   */
  async getQuotaGrants(options = {}) {
    const {
      campaign_id,
      user_id,
      granted_by,
      grant_source,
      start_time,
      end_time,
      page = 1,
      page_size = 20
    } = options

    const where = {}
    if (campaign_id) where.campaign_id = campaign_id
    if (user_id) where.user_id = user_id
    if (granted_by) where.granted_by = granted_by
    if (grant_source) where.grant_source = grant_source

    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) where.created_at[Op.gte] = new Date(start_time)
      if (end_time) where.created_at[Op.lte] = new Date(end_time)
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryCampaignQuotaGrant.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.User,
          as: 'granter',
          attributes: ['user_id', 'nickname']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      grants: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个配额赠送记录详情
   *
   * @param {number} grant_id - 赠送记录ID
   * @returns {Promise<Object|null>} 赠送记录详情或null
   */
  async getQuotaGrantById(grant_id) {
    const grant = await this.models.LotteryCampaignQuotaGrant.findByPk(grant_id, {
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.User,
          as: 'granter',
          attributes: ['user_id', 'nickname']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ]
    })

    return grant ? grant.get({ plain: true }) : null
  }

  /*
   * ==========================================
   * 1.5 lottery_campaign_user_quota - 用户配额状态
   * ==========================================
   */

  /**
   * 查询用户配额状态列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {number} [options.user_id] - 用户ID
   * @param {boolean} [options.has_remaining] - 是否有剩余配额
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户配额列表和分页信息
   */
  async getUserQuotas(options = {}) {
    const { campaign_id, user_id, has_remaining, page = 1, page_size = 20 } = options

    const where = {}
    if (campaign_id) where.campaign_id = campaign_id
    if (user_id) where.user_id = user_id
    if (has_remaining !== undefined) {
      where.quota_remaining = has_remaining ? { [Op.gt]: 0 } : { [Op.lte]: 0 }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryCampaignUserQuota.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ],
      order: [['quota_remaining', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      quotas: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取用户在特定活动的配额状态
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 用户配额状态或null
   */
  async getUserQuota(user_id, campaign_id) {
    const quota = await this.models.LotteryCampaignUserQuota.findOne({
      where: { user_id, campaign_id },
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status', 'budget_type']
        }
      ]
    })

    return quota ? quota.get({ plain: true }) : null
  }

  /**
   * 获取活动配额统计汇总
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 配额统计汇总
   */
  async getCampaignQuotaStats(campaign_id) {
    const stats = await this.models.LotteryCampaignUserQuota.getCampaignQuotaStats(campaign_id)

    // 获取活动信息
    const campaign = await this.models.LotteryCampaign.findByPk(campaign_id, {
      attributes: ['campaign_id', 'campaign_name', 'status', 'budget_type']
    })

    return {
      campaign: campaign ? campaign.get({ plain: true }) : null,
      stats
    }
  }

  /*
   * ==========================================
   * 1.6 综合监控统计 - 用于抽奖监控仪表盘
   * ==========================================
   */

  /**
   * 获取抽奖监控综合统计数据
   * 用于前端抽奖监控仪表盘展示
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID（可选，不传则统计所有活动）
   * @param {string} [options.time_range] - 时间范围：today/yesterday/week/month/custom
   * @param {string} [options.start_date] - 自定义开始日期（YYYY-MM-DD）
   * @param {string} [options.end_date] - 自定义结束日期（YYYY-MM-DD）
   * @returns {Promise<Object>} 综合监控统计数据
   */
  async getMonitoringStats(options = {}) {
    const { campaign_id, time_range = 'today', start_date, end_date } = options

    // 计算时间范围
    const { startTime, endTime, prevStartTime, prevEndTime } = this._calculateTimeRange(
      time_range,
      start_date,
      end_date
    )

    // 基础查询条件
    const baseWhere = campaign_id ? { campaign_id } : {}

    // 并行查询各项统计数据
    const [currentStats, prevStats, hourlyTrend, prizeDistribution, recentDraws, prizeStats] =
      await Promise.all([
        // 当前时段统计
        this._getDrawStats(baseWhere, startTime, endTime),
        // 上一时段统计（用于计算趋势）
        this._getDrawStats(baseWhere, prevStartTime, prevEndTime),
        // 小时趋势数据
        this._getHourlyTrend(baseWhere, startTime, endTime),
        // 奖品分布
        this._getPrizeDistribution(baseWhere, startTime, endTime),
        // 最近抽奖记录
        this._getRecentDraws(baseWhere, 20),
        // 奖品发放统计
        this._getPrizeStats(baseWhere, startTime, endTime)
      ])

    // 计算趋势百分比
    const calculateTrend = (current, prev) => {
      if (!prev || prev === 0) return current > 0 ? 100 : 0
      return ((current - prev) / prev) * 100
    }

    return {
      summary: {
        total_draws: currentStats.total_draws || 0,
        total_wins: currentStats.total_wins || 0,
        win_rate: currentStats.total_draws
          ? ((currentStats.total_wins / currentStats.total_draws) * 100).toFixed(1)
          : 0,
        total_value: currentStats.total_value || 0,
        // 趋势数据
        draws_trend: calculateTrend(currentStats.total_draws, prevStats.total_draws).toFixed(1),
        wins_trend: calculateTrend(currentStats.total_wins, prevStats.total_wins).toFixed(1),
        rate_trend: calculateTrend(
          currentStats.total_draws ? (currentStats.total_wins / currentStats.total_draws) * 100 : 0,
          prevStats.total_draws ? (prevStats.total_wins / prevStats.total_draws) * 100 : 0
        ).toFixed(1),
        value_trend: calculateTrend(currentStats.total_value, prevStats.total_value).toFixed(1)
      },
      trend: hourlyTrend,
      prize_distribution: prizeDistribution,
      recent_draws: recentDraws,
      prize_stats: prizeStats
    }
  }

  /*
   * ==========================================
   * 第二部分：策略统计分析（原 LotteryStrategyStatsService）
   * ==========================================
   */

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
        [fn('SUM', col('guarantee_triggered_count')), 'guarantee_count'],
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
         * 注意：lottery_daily_metrics 表没有 guarantee 字段
         * 为保持 API 返回格式一致性，此处返回 0
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
   * @param {number} campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计数据
   */
  async _getBudgetConsumptionFromDraws(campaign_id, start_time, end_time) {
    const LotteryDraw = this.models.LotteryDraw
    const LotteryDrawDecision = this.models.LotteryDrawDecision

    const draws = await LotteryDraw.findAll({
      attributes: ['draw_id', 'prize_value_points'],
      where: {
        campaign_id,
        created_at: { [Op.gte]: start_time, [Op.lte]: end_time }
      },
      include: [
        {
          model: LotteryDrawDecision,
          as: 'decision',
          attributes: ['budget_deducted'],
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
      total_prize_value += parseInt(draw.prize_value_points) || 0
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

  /*
   * ==========================================
   * 第三部分：内部辅助方法（用于综合监控统计）
   * ==========================================
   */

  /**
   * 计算时间范围
   * @private
   * @param {string} time_range - 时间范围类型：today/yesterday/week/month/custom
   * @param {string} start_date - 自定义开始日期（仅 custom 模式）
   * @param {string} end_date - 自定义结束日期（仅 custom 模式）
   * @returns {Object} 时间范围对象 { startTime, endTime, prevStartTime, prevEndTime }
   */
  _calculateTimeRange(time_range, start_date, end_date) {
    const now = new Date()
    // 使用北京时间
    const beijingOffset = 8 * 60 * 60 * 1000
    const utcNow = now.getTime() + now.getTimezoneOffset() * 60 * 1000
    const beijingNow = new Date(utcNow + beijingOffset)

    let startTime, endTime, prevStartTime, prevEndTime

    const todayStart = new Date(beijingNow)
    todayStart.setHours(0, 0, 0, 0)

    const todayEnd = new Date(beijingNow)
    todayEnd.setHours(23, 59, 59, 999)

    switch (time_range) {
      case 'today':
        startTime = todayStart
        endTime = todayEnd
        prevStartTime = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
        prevEndTime = new Date(todayEnd.getTime() - 24 * 60 * 60 * 1000)
        break
      case 'yesterday':
        startTime = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
        endTime = new Date(todayEnd.getTime() - 24 * 60 * 60 * 1000)
        prevStartTime = new Date(startTime.getTime() - 24 * 60 * 60 * 1000)
        prevEndTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
        break
      case 'week':
        startTime = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
        endTime = todayEnd
        prevStartTime = new Date(startTime.getTime() - 7 * 24 * 60 * 60 * 1000)
        prevEndTime = new Date(startTime.getTime() - 1)
        break
      case 'month':
        startTime = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000)
        endTime = todayEnd
        prevStartTime = new Date(startTime.getTime() - 30 * 24 * 60 * 60 * 1000)
        prevEndTime = new Date(startTime.getTime() - 1)
        break
      case 'custom': {
        startTime = start_date ? new Date(start_date) : todayStart
        endTime = end_date ? new Date(end_date + 'T23:59:59') : todayEnd
        const duration = endTime.getTime() - startTime.getTime()
        prevStartTime = new Date(startTime.getTime() - duration)
        prevEndTime = new Date(startTime.getTime() - 1)
        break
      }
      default:
        startTime = todayStart
        endTime = todayEnd
        prevStartTime = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
        prevEndTime = new Date(todayEnd.getTime() - 24 * 60 * 60 * 1000)
    }

    return { startTime, endTime, prevStartTime, prevEndTime }
  }

  /**
   * 获取抽奖统计数据
   * @private
   * @param {Object} baseWhere - 基础查询条件
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Promise<Object>} 抽奖统计数据 { total_draws, total_wins, total_value }
   */
  async _getDrawStats(baseWhere, startTime, endTime) {
    try {
      // 从 lottery_draws 表查询（V4.0: reward_tier='high' 为中奖）
      const result = await this.models.LotteryDraw.findOne({
        attributes: [
          [fn('COUNT', col('draw_id')), 'total_draws'],
          [fn('SUM', literal("CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END")), 'total_wins'],
          [fn('SUM', literal('COALESCE(prize_value_points, 0)')), 'total_value']
        ],
        where: {
          ...baseWhere,
          created_at: {
            [Op.between]: [startTime, endTime]
          }
        },
        raw: true
      })

      return {
        total_draws: parseInt(result?.total_draws || 0),
        total_wins: parseInt(result?.total_wins || 0),
        total_value: parseFloat(result?.total_value || 0)
      }
    } catch (error) {
      this.logger.warn('获取抽奖统计失败，返回默认值', { error: error.message })
      return { total_draws: 0, total_wins: 0, total_value: 0 }
    }
  }

  /**
   * 获取小时趋势数据（用于综合监控统计）
   * @private
   * @param {Object} baseWhere - 基础查询条件
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Promise<Array>} 小时趋势数据数组
   */
  async _getHourlyTrend(baseWhere, startTime, endTime) {
    try {
      // 优先从小时指标表查询
      const metrics = await this.models.LotteryHourlyMetrics.findAll({
        attributes: ['hour_bucket', 'total_draws', 'high_tier_count'],
        where: {
          ...baseWhere,
          hour_bucket: {
            [Op.between]: [startTime, endTime]
          }
        },
        order: [['hour_bucket', 'ASC']],
        raw: true
      })

      // 如果有数据，直接返回
      if (metrics.length > 0) {
        return metrics.map(m => ({
          time: new Date(m.hour_bucket).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          draws: parseInt(m.total_draws || 0),
          wins: parseInt(m.high_tier_count || 0)
        }))
      }

      // 如果小时指标表没有数据，从 lottery_draws 表动态聚合
      this.logger.info('小时指标表无数据，从抽奖记录动态聚合趋势')

      const drawTrend = await this.models.LotteryDraw.findAll({
        attributes: [
          [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00'), 'hour_bucket'],
          [fn('COUNT', col('draw_id')), 'total_draws'],
          [
            fn('SUM', literal("CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END")),
            'high_tier_count'
          ]
        ],
        where: {
          ...baseWhere,
          created_at: {
            [Op.between]: [startTime, endTime]
          }
        },
        group: [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00')],
        order: [[fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00'), 'ASC']],
        raw: true
      })

      return drawTrend.map(m => ({
        time: new Date(m.hour_bucket).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        draws: parseInt(m.total_draws || 0),
        wins: parseInt(m.high_tier_count || 0)
      }))
    } catch (error) {
      this.logger.warn('获取小时趋势失败，返回空数组', { error: error.message })
      return []
    }
  }

  /**
   * 获取奖品分布（5种分类：一等奖、二等奖、三等奖、参与奖、谢谢参与）
   * @private
   * @param {Object} baseWhere - 基础查询条件
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Promise<Array<{name: string, value: number}>>} 奖品分布数据数组
   */
  async _getPrizeDistribution(baseWhere, startTime, endTime) {
    try {
      // 查询抽奖记录，关联奖品信息以获取更细致的分类
      const draws = await this.models.LotteryDraw.findAll({
        attributes: ['draw_id', 'reward_tier', 'prize_id'],
        where: {
          ...baseWhere,
          created_at: {
            [Op.between]: [startTime, endTime]
          }
        },
        include: [
          {
            model: this.models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_value_points', 'is_fallback'],
            required: false
          }
        ],
        raw: true,
        nest: true
      })

      // 5种分类计数
      const distribution = {
        一等奖: 0, // high档位
        二等奖: 0, // mid档位
        三等奖: 0, // low档位（有奖品价值>30）
        参与奖: 0, // low档位（有奖品但价值<=30）
        谢谢参与: 0 // fallback或无奖品
      }

      draws.forEach(draw => {
        const tier = draw.reward_tier
        const prizeValue = draw.prize?.prize_value_points || 0
        const isFallback = draw.prize?.is_fallback || false

        if (tier === 'high') {
          distribution['一等奖']++
        } else if (tier === 'mid') {
          distribution['二等奖']++
        } else if (tier === 'low') {
          if (isFallback || prizeValue === 0) {
            distribution['谢谢参与']++
          } else if (prizeValue <= 30) {
            distribution['参与奖']++
          } else {
            distribution['三等奖']++
          }
        } else if (tier === 'fallback' || !tier) {
          distribution['谢谢参与']++
        } else {
          distribution['参与奖']++
        }
      })

      // 转换为数组格式，保持固定顺序显示5种分类（即使数量为0也显示）
      const orderedCategories = ['一等奖', '二等奖', '三等奖', '参与奖', '谢谢参与']
      const result = orderedCategories.map(name => ({
        name,
        value: distribution[name] || 0
      }))

      return result
    } catch (error) {
      this.logger.warn('获取奖品分布失败，返回空数组', { error: error.message })
      return []
    }
  }

  /**
   * 获取最近抽奖记录
   * @private
   * @param {Object} baseWhere - 基础查询条件
   * @param {number} [limit=20] - 返回记录数限制
   * @returns {Promise<Array>} 最近抽奖记录数组
   */
  async _getRecentDraws(baseWhere, limit = 20) {
    try {
      const draws = await this.models.LotteryDraw.findAll({
        attributes: ['draw_id', 'user_id', 'reward_tier', 'created_at'],
        where: baseWhere,
        include: [
          {
            model: this.models.User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false
          },
          {
            model: this.models.LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_id', 'campaign_name'],
            required: false
          },
          {
            model: this.models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'prize_name'],
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        limit,
        raw: false
      })

      // V4.0: reward_tier 映射档位名称
      const tierNames = {
        high: '一等奖',
        mid: '二等奖',
        low: '三等奖'
      }

      return draws.map(d => {
        const plain = d.get({ plain: true })
        const mobile = plain.user?.mobile || ''
        const isWin = plain.reward_tier === 'high'
        return {
          time: plain.created_at,
          user:
            plain.user?.nickname ||
            (mobile ? `用户***${mobile.slice(-4)}` : `用户${plain.user_id}`),
          campaign: plain.campaign?.campaign_name || '未知活动',
          result: plain.prize?.prize_name || tierNames[plain.reward_tier] || plain.reward_tier,
          is_win: isWin
        }
      })
    } catch (error) {
      this.logger.warn('获取最近抽奖记录失败，返回空数组', { error: error.message })
      return []
    }
  }

  /**
   * 获取奖品发放统计
   * @private
   * @param {Object} baseWhere - 基础查询条件
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Promise<Array<{name: string, issued: number, stock: number, rate: number}>>} 奖品统计数组
   */
  async _getPrizeStats(baseWhere, startTime, endTime) {
    try {
      /*
       * 从 LotteryPrize 表获取奖品信息（V4.0: prize_name, stock_quantity, total_win_count）
       * 注意：不再限制status='active'，以便查看所有奖品的发放情况
       */
      const whereClause = baseWhere.campaign_id ? { campaign_id: baseWhere.campaign_id } : {}

      const prizes = await this.models.LotteryPrize.findAll({
        attributes: ['prize_id', 'prize_name', 'stock_quantity', 'total_win_count', 'status'],
        where: whereClause,
        raw: true
      })

      // 获取时间范围内每个奖品的发放数量
      const issuedCounts = await this.models.LotteryDraw.findAll({
        attributes: ['prize_id', [fn('COUNT', col('draw_id')), 'issued_count']],
        where: {
          ...baseWhere,
          prize_id: { [Op.ne]: null }, // 只统计有奖品的抽奖
          created_at: {
            [Op.between]: [startTime, endTime]
          }
        },
        group: ['prize_id'],
        raw: true
      })

      const issuedMap = new Map()
      issuedCounts.forEach(item => {
        if (item.prize_id) {
          issuedMap.set(item.prize_id, parseInt(item.issued_count || 0))
        }
      })

      return prizes.map(p => {
        const issued = issuedMap.get(p.prize_id) || 0
        // total_win_count 是历史总中奖次数，stock_quantity 是当前库存
        const total = (p.total_win_count || 0) + (p.stock_quantity || 0)
        const rate = total > 0 ? (issued / total) * 100 : 0
        return {
          name: p.prize_name, // V4.0: 使用 prize_name 字段
          issued,
          stock: p.stock_quantity || 0, // V4.0: 使用 stock_quantity 字段
          rate: parseFloat(rate.toFixed(1))
        }
      })
    } catch (error) {
      this.logger.warn('获取奖品发放统计失败，返回空数组', { error: error.message })
      return []
    }
  }
}

module.exports = LotteryAnalyticsService





