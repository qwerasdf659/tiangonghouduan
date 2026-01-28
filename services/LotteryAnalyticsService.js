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

    // 并行查询各项统计数据（包含预算进度）
    const [
      currentStats,
      prevStats,
      hourlyTrend,
      prizeDistribution,
      recentDraws,
      prizeStats,
      budgetProgress
    ] = await Promise.all([
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
      this._getPrizeStats(baseWhere, startTime, endTime),
      // 预算进度统计（P1需求：ADR-002）
      this._getBudgetProgress(campaign_id)
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
      // P1需求：预算进度（ADR-002）
      budget_progress: budgetProgress,
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
   * 获取活动预算进度统计
   *
   * P1需求（ADR-002）：为运营后台提供预算消耗进度监控
   *
   * 计算逻辑：
   * - 今日消耗：统计今日所有抽奖记录的成本（cost_points from lottery_draws）
   * - 每日预算上限：来源于 lottery_campaigns.daily_budget_limit
   * - 总消耗：活动总预算 - 剩余预算（pool_budget_total - pool_budget_remaining）
   * - 总预算：来源于 lottery_campaigns.pool_budget_total
   * - 预警状态：进度 >= 80% 时触发预警
   *
   * @private
   * @param {number|null} campaign_id - 活动ID（null时返回汇总统计）
   * @returns {Promise<Object>} 预算进度统计数据
   */
  async _getBudgetProgress(campaign_id) {
    try {
      // 导入预警阈值配置
      const alertThresholds = require('../config/alert-thresholds')
      const warningThreshold = alertThresholds.budget_consumption_warning_threshold || 80

      // 如果没有指定活动，返回空的预算进度
      if (!campaign_id) {
        return {
          daily_consumed: null,
          daily_limit: null,
          daily_progress_percentage: null,
          total_consumed: null,
          total_budget: null,
          total_progress_percentage: null,
          is_warning: false,
          message: '未指定活动，无法计算预算进度'
        }
      }

      // 获取活动信息
      const campaign = await this.models.LotteryCampaign.findByPk(campaign_id, {
        attributes: [
          'campaign_id',
          'campaign_name',
          'daily_budget_limit',
          'pool_budget_total',
          'pool_budget_remaining',
          'budget_mode'
        ]
      })

      if (!campaign) {
        return {
          daily_consumed: null,
          daily_limit: null,
          daily_progress_percentage: null,
          total_consumed: null,
          total_budget: null,
          total_progress_percentage: null,
          is_warning: false,
          message: '活动不存在'
        }
      }

      // 计算今日时间范围（北京时间）
      const now = new Date()
      const beijingOffset = 8 * 60 * 60 * 1000
      const beijingNow = new Date(now.getTime() + beijingOffset)
      const todayStart = new Date(beijingNow)
      todayStart.setHours(0, 0, 0, 0)
      const todayStartUTC = new Date(todayStart.getTime() - beijingOffset)
      const todayEndUTC = new Date(todayStart.getTime() - beijingOffset + 24 * 60 * 60 * 1000 - 1)

      /*
       * 查询今日消耗（统计今日抽奖记录中奖品的成本总额）
       * 注意：cost_points 在 lottery_draws 和 lottery_prizes 两表都有，需指定表名
       */
      const todayCostResult = await this.models.LotteryDraw.findOne({
        attributes: [[fn('SUM', literal('COALESCE(`prize`.`cost_points`, 0)')), 'daily_consumed']],
        include: [
          {
            model: this.models.LotteryPrize,
            as: 'prize',
            attributes: []
          }
        ],
        where: {
          campaign_id,
          created_at: { [Op.between]: [todayStartUTC, todayEndUTC] }
        },
        raw: true
      })

      // 解析数值
      const dailyConsumed = parseFloat(todayCostResult?.daily_consumed || 0)
      const dailyLimit = campaign.daily_budget_limit
        ? parseFloat(campaign.daily_budget_limit)
        : null
      const poolBudgetTotal = campaign.pool_budget_total
        ? parseFloat(campaign.pool_budget_total)
        : null
      const poolBudgetRemaining = campaign.pool_budget_remaining
        ? parseFloat(campaign.pool_budget_remaining)
        : null

      // 计算总消耗（仅 pool 模式有意义）
      let totalConsumed = null
      if (campaign.budget_mode === 'pool' && poolBudgetTotal !== null) {
        totalConsumed =
          poolBudgetRemaining !== null ? poolBudgetTotal - poolBudgetRemaining : dailyConsumed
      }

      // 计算进度百分比
      const dailyProgressPercentage =
        dailyLimit && dailyLimit > 0
          ? parseFloat(((dailyConsumed / dailyLimit) * 100).toFixed(1))
          : null

      const totalProgressPercentage =
        poolBudgetTotal && poolBudgetTotal > 0 && totalConsumed !== null
          ? parseFloat(((totalConsumed / poolBudgetTotal) * 100).toFixed(1))
          : null

      // 判断是否预警（任一进度 >= 阈值）
      const isWarning =
        (dailyProgressPercentage !== null && dailyProgressPercentage >= warningThreshold) ||
        (totalProgressPercentage !== null && totalProgressPercentage >= warningThreshold)

      return {
        // 每日预算进度
        daily_consumed: dailyConsumed,
        daily_limit: dailyLimit,
        daily_progress_percentage: dailyProgressPercentage,
        // 总预算进度（仅 pool 模式有效）
        total_consumed: totalConsumed,
        total_budget: poolBudgetTotal,
        total_progress_percentage: totalProgressPercentage,
        // 预警状态
        is_warning: isWarning,
        warning_threshold: warningThreshold,
        budget_mode: campaign.budget_mode
      }
    } catch (error) {
      this.logger.error('获取预算进度失败', { campaign_id, error: error.message })
      return {
        daily_consumed: null,
        daily_limit: null,
        daily_progress_percentage: null,
        total_consumed: null,
        total_budget: null,
        total_progress_percentage: null,
        is_warning: false,
        error: error.message
      }
    }
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

  /*
   * ==========================================
   * 第四部分：用户抽奖档案相关方法
   * ==========================================
   */

  /**
   * 获取用户抽奖记录
   * P0 用户档案聚合 API 的核心方法
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {number} [options.campaign_id] - 活动ID（可选，不传则查询所有活动）
   * @param {number} [options.limit=100] - 返回记录数限制
   * @param {number} [options.offset=0] - 偏移量
   * @param {string} [options.start_time] - 开始时间
   * @param {string} [options.end_time] - 结束时间
   * @returns {Promise<Array>} 用户抽奖记录数组
   */
  async getUserDrawRecords(user_id, options = {}) {
    const { campaign_id, limit = 100, offset = 0, start_time, end_time } = options

    this.logger.info('获取用户抽奖记录', { user_id, campaign_id, limit, offset })

    const where = { user_id }

    // 活动ID过滤
    if (campaign_id) {
      where.campaign_id = campaign_id
    }

    // 时间范围过滤
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.created_at[Op.lte] = new Date(end_time)
      }
    }

    try {
      const draws = await this.models.LotteryDraw.findAll({
        where,
        include: [
          {
            model: this.models.LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_id', 'campaign_name', 'status']
          },
          {
            model: this.models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'prize_name', 'prize_value_points', 'reward_tier'],
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset
      })

      return draws.map(draw => draw.get({ plain: true }))
    } catch (error) {
      this.logger.error('获取用户抽奖记录失败', { user_id, error: error.message })
      throw error
    }
  }

  /**
   * 获取用户抽奖档案聚合数据
   * P0 用户档案聚合 API 的主入口方法
   *
   * 聚合内容：
   * - stats: 抽奖统计（总次数、中奖率、档位分布）
   * - experience: 用户体验状态（empty_streak等）
   * - global_state: 用户全局状态（luck_debt_level等）
   * - quotas: 用户配额信息
   * - recent_draws: 最近抽奖记录
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {number} [options.campaign_id] - 活动ID（可选）
   * @param {number} [options.recent_limit=20] - 返回最近记录数
   * @returns {Promise<Object>} 用户抽奖档案聚合数据
   */
  async getUserProfile(user_id, options = {}) {
    const { campaign_id, recent_limit = 20 } = options

    this.logger.info('获取用户抽奖档案', { user_id, campaign_id })

    try {
      // 并行查询所有数据（优化性能）
      const [draws, experienceStates, globalStates, quotas] = await Promise.all([
        // 获取用户所有抽奖记录（用于统计）
        this.getUserDrawRecords(user_id, { campaign_id, limit: 1000 }),
        // 获取用户体验状态
        this.getUserExperienceStates({ user_id, campaign_id }),
        // 获取用户全局状态
        this.getUserGlobalStates({ user_id }),
        // 获取用户配额
        this.getUserQuotas({ user_id, campaign_id })
      ])

      // 计算统计数据
      const totalDraws = draws.length

      /*
       * V4.0 中奖判定规则：
       * - reward_tier IN ('high', 'mid', 'low') 视为中奖
       * - fallback 是保底奖品，通常不视为"中奖"
       */
      const wins = draws.filter(d => ['high', 'mid', 'low'].includes(d.reward_tier))
      const totalWins = wins.length
      const winRate = totalDraws > 0 ? ((totalWins / totalDraws) * 100).toFixed(1) : '0.0'

      // 计算档位分布
      const tierDistribution = { high: 0, mid: 0, low: 0, fallback: 0 }
      draws.forEach(d => {
        const tier = d.reward_tier || 'fallback'
        if (Object.prototype.hasOwnProperty.call(tierDistribution, tier)) {
          tierDistribution[tier]++
        }
      })

      // 获取首次和最近抽奖时间
      const sortedDraws = [...draws].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      const firstDrawTime = sortedDraws[0]?.created_at || null
      const lastDrawTime = sortedDraws[sortedDraws.length - 1]?.created_at || null

      // 组装响应数据
      const profile = {
        user_id,
        stats: {
          total_draws: totalDraws,
          total_wins: totalWins,
          win_rate: winRate,
          tier_distribution: tierDistribution,
          first_draw_time: firstDrawTime,
          last_draw_time: lastDrawTime
        },
        // 体验状态：取第一条（如果有campaign_id过滤则精确到活动）
        experience: experienceStates.states?.[0] || null,
        // 全局状态：取第一条
        global_state: globalStates.states?.[0] || null,
        // 配额列表
        quotas: quotas.quotas || [],
        // 最近抽奖记录
        recent_draws: draws.slice(0, recent_limit).map(d => ({
          draw_id: d.draw_id,
          user_id: d.user_id,
          campaign_id: d.campaign_id,
          campaign_name: d.campaign?.campaign_name || null,
          reward_tier: d.reward_tier,
          prize_id: d.prize_id,
          prize_name: d.prize_name || d.prize?.prize_name || null,
          prize_value_points: d.prize_value_points,
          cost_points: d.cost_points,
          created_at: d.created_at
        }))
      }

      this.logger.info('获取用户抽奖档案成功', {
        user_id,
        total_draws: totalDraws,
        total_wins: totalWins
      })

      return profile
    } catch (error) {
      this.logger.error('获取用户抽奖档案失败', { user_id, error: error.message })
      throw error
    }
  }

  /**
   * 获取活动 ROI 聚合数据
   * P1 活动 ROI 聚合 API 的核心方法
   *
   * ROI 计算公式：(总收入 - 总成本) / 总收入 * 100
   * - 总收入：用户消耗的积分总额（lottery_draws.cost_points）
   * - 总成本：发放的奖品成本总额（lottery_prizes.cost_points）
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {string} [options.start_time] - 开始时间（ISO8601）
   * @param {string} [options.end_time] - 结束时间（ISO8601）
   * @returns {Promise<Object>} 活动 ROI 聚合数据
   */
  async getCampaignROI(campaign_id, options = {}) {
    const { start_time, end_time } = options

    this.logger.info('获取活动ROI数据', { campaign_id, start_time, end_time })

    try {
      // 获取活动信息
      const campaign = await this.models.LotteryCampaign.findByPk(campaign_id, {
        attributes: [
          'campaign_id',
          'campaign_name',
          'status',
          'start_time',
          'end_time',
          'daily_budget_limit'
        ]
      })

      if (!campaign) {
        throw new Error('活动不存在')
      }

      // 构建查询条件
      const whereClause = { campaign_id }
      if (start_time || end_time) {
        whereClause.created_at = {}
        if (start_time) {
          whereClause.created_at[Op.gte] = new Date(start_time)
        }
        if (end_time) {
          whereClause.created_at[Op.lte] = new Date(end_time)
        }
      }

      // 获取时间范围内的抽奖记录
      const draws = await this.models.LotteryDraw.findAll({
        where: whereClause,
        include: [
          {
            model: this.models.LotteryPrize,
            as: 'prize',
            attributes: [
              'prize_id',
              'prize_name',
              'cost_points',
              'prize_value_points',
              'reward_tier'
            ],
            required: false
          }
        ]
      })

      /*
       * 计算总成本和各档位成本
       * V4.0 中奖判定：reward_tier IN ('high', 'mid', 'low') 视为中奖
       */
      let totalCost = 0
      const tierCostBreakdown = { high: 0, mid: 0, low: 0, fallback: 0 }

      draws.forEach(d => {
        const tier = d.reward_tier || 'fallback'
        // 使用奖品的 cost_points 作为成本（如果有奖品）
        const costValue = d.prize?.cost_points || 0

        // 只统计有奖品的记录
        if (d.prize_id && costValue > 0) {
          totalCost += costValue

          if (Object.prototype.hasOwnProperty.call(tierCostBreakdown, tier)) {
            tierCostBreakdown[tier] += costValue
          }
        }
      })

      // 计算总收入（用户消耗积分）
      const totalRevenue = draws.reduce((sum, d) => sum + (parseInt(d.cost_points) || 0), 0)

      // 计算 ROI（收入 - 成本）/ 收入 * 100
      const roi = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0
      const profit = totalRevenue - totalCost

      // 计算用户统计
      const userDrawCounts = {}
      draws.forEach(d => {
        userDrawCounts[d.user_id] = (userDrawCounts[d.user_id] || 0) + 1
      })

      const uniqueUsers = Object.keys(userDrawCounts).length
      const repeatUsers = Object.values(userDrawCounts).filter(c => c > 1).length
      const repeatRate = uniqueUsers > 0 ? (repeatUsers / uniqueUsers) * 100 : 0
      const avgDrawsPerUser = uniqueUsers > 0 ? draws.length / uniqueUsers : 0

      // 组装响应数据
      const roiData = {
        campaign_id,
        campaign_name: campaign.campaign_name,
        time_range: {
          start_time: start_time || campaign.start_time,
          end_time: end_time || campaign.end_time || new Date().toISOString()
        },
        // ROI 相关
        roi: parseFloat(roi.toFixed(1)),
        total_cost: totalCost,
        total_revenue: totalRevenue,
        profit,
        // 用户相关
        unique_users: uniqueUsers,
        total_draws: draws.length,
        avg_draws_per_user: parseFloat(avgDrawsPerUser.toFixed(2)),
        repeat_users: repeatUsers,
        repeat_rate: parseFloat(repeatRate.toFixed(1)),
        // 档位成本明细
        tier_cost_breakdown: tierCostBreakdown
      }

      this.logger.info('获取活动ROI数据成功', {
        campaign_id,
        roi: roiData.roi,
        unique_users: uniqueUsers,
        total_draws: draws.length
      })

      return roiData
    } catch (error) {
      this.logger.error('获取活动ROI数据失败', { campaign_id, error: error.message })
      throw error
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

  /*
   * ==========================================
   * 第六部分：运营日报聚合（P2 需求）
   * ==========================================
   */

  /**
   * 生成运营日报数据
   *
   * P2 需求：运营日报聚合 API
   * 遵循项目规范：所有数据查询和业务计算逻辑在 Service 层封装
   *
   * @param {string} reportDate - 报告日期 (YYYY-MM-DD)，默认昨日
   * @param {number|null} campaignId - 活动 ID，不传则汇总所有活动
   * @returns {Promise<Object>} 运营日报数据
   *
   * @see docs/后端API开发需求文档-抽奖运营后台.md 第九节
   */
  async generateDailyReport(reportDate, campaignId = null) {
    this.logger.info('生成运营日报', { report_date: reportDate, campaign_id: campaignId })

    try {
      // 1. 解析报告日期（北京时间）
      const { startTime, endTime, yesterdayStart, yesterdayEnd, lastWeekStart, lastWeekEnd, displayDate } =
        this._parseDailyReportDateRange(reportDate)

      // 2. 并行查询所有数据
      const [
        summary,
        yesterdaySummary,
        lastWeekSummary,
        hourlyBreakdown,
        tierBreakdown,
        topPrizes,
        campaignsBreakdown
      ] = await Promise.all([
        this._getDailyReportStats(startTime, endTime, campaignId),
        this._getDailyReportStats(yesterdayStart, yesterdayEnd, campaignId),
        this._getDailyReportStats(lastWeekStart, lastWeekEnd, campaignId),
        this._getDailyReportHourlyBreakdown(startTime, endTime, campaignId),
        this._getDailyReportTierBreakdown(startTime, endTime, campaignId),
        this._getDailyReportTopPrizes(startTime, endTime, 10),
        campaignId ? Promise.resolve([]) : this._getDailyReportCampaignsBreakdown(startTime, endTime)
      ])

      // 3. 计算同比环比
      const vsYesterday = this._calculateDailyReportChange(summary, yesterdaySummary)
      const vsLastWeek = this._calculateDailyReportChange(summary, lastWeekSummary)

      // 4. 生成告警
      const alerts = await this._generateDailyReportAlerts(summary, tierBreakdown, campaignId)

      // 5. 组装响应
      const response = {
        report_date: displayDate,
        generated_at: new Date().toISOString().replace('Z', '+08:00'),
        summary,
        vs_yesterday: vsYesterday,
        vs_last_week: vsLastWeek,
        hourly_breakdown: hourlyBreakdown,
        tier_breakdown: tierBreakdown,
        top_prizes: topPrizes,
        campaigns_breakdown: campaignsBreakdown,
        alerts
      }

      this.logger.info('生成运营日报成功', {
        report_date: displayDate,
        campaign_id: campaignId,
        total_draws: summary.total_draws,
        alerts_count: alerts.length
      })

      return response
    } catch (error) {
      this.logger.error('生成运营日报失败', { report_date: reportDate, campaign_id: campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 解析日报日期范围（内部方法）
   * @private
   * @param {string} reportDate - 报告日期 (YYYY-MM-DD)
   * @returns {Object} 包含各时间范围的对象
   */
  _parseDailyReportDateRange(reportDate) {
    const beijingOffset = 8 * 60 * 60 * 1000
    const now = new Date()

    // 解析报告日期（北京时间）
    let targetDate
    if (reportDate) {
      // 将 YYYY-MM-DD 解析为北京时间 00:00:00
      const [year, month, day] = reportDate.split('-').map(Number)
      targetDate = new Date(Date.UTC(year, month - 1, day) - beijingOffset)
    } else {
      // 默认昨日（北京时间）
      const beijingNow = new Date(now.getTime() + beijingOffset)
      beijingNow.setUTCHours(0, 0, 0, 0)
      targetDate = new Date(beijingNow.getTime() - beijingOffset - 24 * 60 * 60 * 1000)
    }

    // 报告日期范围
    const startTime = new Date(targetDate)
    const endTime = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1)

    // 昨日范围
    const yesterdayStart = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayEnd = new Date(targetDate.getTime() - 1)

    // 上周同日范围
    const lastWeekStart = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    const lastWeekEnd = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1)

    // 格式化显示日期
    const displayDate = new Date(targetDate.getTime() + beijingOffset).toISOString().split('T')[0]

    return { startTime, endTime, yesterdayStart, yesterdayEnd, lastWeekStart, lastWeekEnd, displayDate }
  }

  /**
   * 获取日报统计数据（内部方法）
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @param {number|null} campaignId - 活动 ID
   * @returns {Promise<Object>} 统计数据对象
   */
  async _getDailyReportStats(startTime, endTime, campaignId) {
    const whereClause = {
      created_at: { [Op.between]: [startTime, endTime] }
    }
    if (campaignId) whereClause.campaign_id = campaignId

    // 查询抽奖记录
    const draws = await this.models.LotteryDraw.findAll({
      where: whereClause,
      include: [
        {
          model: this.models.LotteryPrize,
          as: 'prize',
          attributes: ['cost_points'],
          required: false
        }
      ],
      attributes: ['draw_id', 'user_id', 'cost_points', 'prize_id', 'reward_tier'],
      raw: false,
      nest: true
    })

    // 计算统计指标
    const totalDraws = draws.length
    const totalWins = draws.filter(d => ['high', 'mid', 'low'].includes(d.reward_tier)).length
    const winRate = totalDraws > 0 ? (totalWins / totalDraws) * 100 : 0

    // 计算成本和收入
    let totalCost = 0
    draws.forEach(d => {
      if (d.prize_id && d.prize?.cost_points) {
        totalCost += parseFloat(d.prize.cost_points)
      }
    })
    const totalRevenue = draws.reduce((sum, d) => sum + (parseFloat(d.cost_points) || 0), 0)
    const profit = totalRevenue - totalCost
    const roi = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

    // 计算用户数
    const userIds = new Set(draws.map(d => d.user_id))
    const activeUsers = userIds.size

    // 新用户数（需要单独查询，这里简化处理）
    const newUsers = 0 // TODO: 需要查询用户首次抽奖时间

    return {
      total_draws: totalDraws,
      total_wins: totalWins,
      win_rate: parseFloat(winRate.toFixed(1)),
      total_cost: parseFloat(totalCost.toFixed(2)),
      total_revenue: parseFloat(totalRevenue.toFixed(2)),
      profit: parseFloat(profit.toFixed(2)),
      roi: parseFloat(roi.toFixed(1)),
      active_users: activeUsers,
      new_users: newUsers
    }
  }

  /**
   * 计算同比/环比变化（内部方法）
   * @private
   * @param {Object} current - 当前统计数据
   * @param {Object} previous - 对比期统计数据
   * @returns {Object} 变化百分比对象
   */
  _calculateDailyReportChange(current, previous) {
    const calculateChange = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? 100 : 0
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1))
    }

    return {
      draws_change: calculateChange(current.total_draws, previous.total_draws),
      wins_change: calculateChange(current.total_wins, previous.total_wins),
      cost_change: calculateChange(current.total_cost, previous.total_cost),
      revenue_change: calculateChange(current.total_revenue, previous.total_revenue),
      roi_change: calculateChange(current.roi, previous.roi),
      users_change: calculateChange(current.active_users, previous.active_users)
    }
  }

  /**
   * 获取小时分布数据（内部方法）
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @param {number|null} campaignId - 活动 ID
   * @returns {Promise<Array>} 24 小时分布数组
   */
  async _getDailyReportHourlyBreakdown(startTime, endTime, campaignId) {
    const whereClause = {
      created_at: { [Op.between]: [startTime, endTime] }
    }
    if (campaignId) whereClause.campaign_id = campaignId

    const hourlyData = await this.models.LotteryDraw.findAll({
      attributes: [
        [literal("HOUR(CONVERT_TZ(created_at, '+00:00', '+08:00'))"), 'hour'],
        [fn('COUNT', col('draw_id')), 'draws'],
        [
          fn(
            'SUM',
            literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")
          ),
          'wins'
        ],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'users']
      ],
      where: whereClause,
      group: [literal("HOUR(CONVERT_TZ(created_at, '+00:00', '+08:00'))")],
      order: [[literal('hour'), 'ASC']],
      raw: true
    })

    // 补齐 24 小时
    const hourlyMap = new Map()
    hourlyData.forEach(h => {
      hourlyMap.set(parseInt(h.hour), {
        draws: parseInt(h.draws),
        wins: parseInt(h.wins),
        users: parseInt(h.users)
      })
    })

    const result = []
    for (let i = 0; i < 24; i++) {
      const data = hourlyMap.get(i) || { draws: 0, wins: 0, users: 0 }
      result.push({
        hour: i,
        ...data
      })
    }

    return result
  }

  /**
   * 获取档位分布数据（内部方法）
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @param {number|null} campaignId - 活动 ID
   * @returns {Promise<Array>} 档位分布数组
   */
  async _getDailyReportTierBreakdown(startTime, endTime, campaignId) {
    const whereClause = {
      created_at: { [Op.between]: [startTime, endTime] }
    }
    if (campaignId) whereClause.campaign_id = campaignId

    const tierData = await this.models.LotteryDraw.findAll({
      attributes: [
        'reward_tier',
        [fn('COUNT', col('draw_id')), 'count'],
        [fn('SUM', col('cost_points')), 'cost']
      ],
      where: whereClause,
      group: ['reward_tier'],
      raw: true
    })

    const totalCount = tierData.reduce((sum, t) => sum + parseInt(t.count || 0), 0)

    return tierData.map(t => ({
      tier: t.reward_tier || 'unknown',
      count: parseInt(t.count || 0),
      cost: parseFloat(t.cost || 0),
      percentage: totalCount > 0 ? parseFloat(((parseInt(t.count) / totalCount) * 100).toFixed(1)) : 0
    }))
  }

  /**
   * 获取热门奖品数据（内部方法）
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @param {number} limit - 返回数量限制
   * @returns {Promise<Array>} 热门奖品数组
   */
  async _getDailyReportTopPrizes(startTime, endTime, limit = 10) {
    const prizeData = await this.models.LotteryDraw.findAll({
      attributes: [
        'prize_id',
        [fn('COUNT', col('draw_id')), 'count']
      ],
      include: [
        {
          model: this.models.LotteryPrize,
          as: 'prize',
          attributes: ['prize_name', 'cost_points', 'reward_tier']
        }
      ],
      where: {
        created_at: { [Op.between]: [startTime, endTime] },
        prize_id: { [Op.ne]: null }
      },
      group: ['prize_id'],
      order: [[literal('count'), 'DESC']],
      limit,
      raw: false,
      nest: true
    })

    return prizeData.map(p => ({
      prize_id: p.prize_id,
      prize_name: p.prize?.prize_name || '未知奖品',
      count: parseInt(p.dataValues.count || 0),
      tier: p.prize?.reward_tier || 'unknown',
      total_cost: parseFloat((parseInt(p.dataValues.count || 0) * parseFloat(p.prize?.cost_points || 0)).toFixed(2))
    }))
  }

  /**
   * 获取活动分解数据（内部方法）
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Promise<Array>} 活动分解数组
   */
  async _getDailyReportCampaignsBreakdown(startTime, endTime) {
    const campaignData = await this.models.LotteryDraw.findAll({
      attributes: [
        'campaign_id',
        [fn('COUNT', col('draw_id')), 'draws'],
        [fn('SUM', col('cost_points')), 'revenue']
      ],
      include: [
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_name']
        }
      ],
      where: {
        created_at: { [Op.between]: [startTime, endTime] }
      },
      group: ['campaign_id'],
      order: [[literal('draws'), 'DESC']],
      raw: false,
      nest: true
    })

    // 计算每个活动的 ROI（使用 Promise.all 并行查询，避免 await-in-loop）
    const costQueries = campaignData.map(c => {
      return this.models.LotteryDraw.findOne({
        attributes: [[fn('SUM', literal('COALESCE(`prize`.`cost_points`, 0)')), 'total_cost']],
        include: [
          {
            model: this.models.LotteryPrize,
            as: 'prize',
            attributes: []
          }
        ],
        where: {
          campaign_id: c.campaign_id,
          created_at: { [Op.between]: [startTime, endTime] },
          prize_id: { [Op.ne]: null }
        },
        raw: true
      })
    })

    const costResults = await Promise.all(costQueries)

    const result = campaignData.map((c, index) => {
      const draws = parseInt(c.dataValues.draws || 0)
      const revenue = parseFloat(c.dataValues.revenue || 0)
      const cost = parseFloat(costResults[index]?.total_cost || 0)
      const roi = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0

      return {
        campaign_id: c.campaign_id,
        campaign_name: c.campaign?.campaign_name || '未知活动',
        draws,
        cost: parseFloat(cost.toFixed(2)),
        roi: parseFloat(roi.toFixed(1))
      }
    })

    return result
  }

  /**
   * 生成日报告警（内部方法）
   * @private
   * @param {Object} summary - 统计汇总数据
   * @param {Array} tierBreakdown - 档位分布数据
   * @param {number|null} campaignId - 活动 ID
   * @returns {Promise<Array>} 告警数组
   */
  async _generateDailyReportAlerts(summary, tierBreakdown, campaignId) {
    const alertThresholds = require('../config/alert-thresholds')
    const alerts = []

    // 1. ROI 告警
    if (summary.roi < 0) {
      alerts.push({
        type: 'NEGATIVE_ROI',
        level: 'danger',
        message: `ROI 为负 (${summary.roi}%)，活动处于亏损状态`,
        value: summary.roi,
        threshold: 0
      })
    }

    // 2. 中奖率告警
    if (summary.win_rate < (alertThresholds.conversion_low_threshold || 50)) {
      alerts.push({
        type: 'LOW_WIN_RATE',
        level: 'warning',
        message: `中奖率偏低 (${summary.win_rate}%)`,
        value: summary.win_rate,
        threshold: alertThresholds.conversion_low_threshold || 50
      })
    }

    // 3. 高价值奖品比例告警
    const highTier = tierBreakdown.find(t => t.tier === 'high')
    if (highTier && highTier.percentage > (alertThresholds.high_tier_ratio_threshold || 5)) {
      alerts.push({
        type: 'HIGH_TIER_RATIO',
        level: 'warning',
        message: `高价值奖品发放比例过高 (${highTier.percentage}%)`,
        value: highTier.percentage,
        threshold: alertThresholds.high_tier_ratio_threshold || 5
      })
    }

    // 4. 预算消耗告警（需要查询活动预算）
    if (campaignId) {
      const campaign = await this.models.LotteryCampaign.findByPk(campaignId, {
        attributes: ['daily_budget_limit', 'pool_budget_total', 'pool_budget_remaining']
      })

      if (campaign) {
        const dailyLimit = parseFloat(campaign.daily_budget_limit || 0)
        if (dailyLimit > 0) {
          const consumptionRate = (summary.total_cost / dailyLimit) * 100
          if (consumptionRate > (alertThresholds.budget_consumption_danger_threshold || 80)) {
            alerts.push({
              type: 'HIGH_COST',
              level: 'danger',
              message: `单日成本超过预算 ${consumptionRate.toFixed(1)}%`,
              value: consumptionRate,
              threshold: alertThresholds.budget_consumption_danger_threshold || 80
            })
          }
        }
      }
    }

    // 5. 库存告警
    const lowStockPrizes = await this._checkLowStockPrizes(campaignId)
    if (lowStockPrizes.length > 0) {
      alerts.push({
        type: 'STOCK_LOW',
        level: 'info',
        message: `${lowStockPrizes.length} 个奖品库存偏低`,
        value: lowStockPrizes.length,
        details: lowStockPrizes
      })
    }

    return alerts
  }

  /**
   * 检查低库存奖品（内部方法）
   * @private
   * @param {number|null} campaignId - 活动 ID
   * @returns {Promise<Array>} 低库存奖品数组
   */
  async _checkLowStockPrizes(campaignId) {
    const whereClause = { status: 'active' }
    if (campaignId) whereClause.campaign_id = campaignId

    const prizes = await this.models.LotteryPrize.findAll({
      where: whereClause,
      attributes: ['prize_id', 'prize_name', 'stock_quantity', 'total_win_count']
    })

    const lowStockPrizes = []
    prizes.forEach(prize => {
      const remaining = (prize.stock_quantity || 0) - (prize.total_win_count || 0)
      if (remaining < 10) {
        lowStockPrizes.push({
          prize_id: prize.prize_id,
          prize_name: prize.prize_name,
          remaining
        })
      }
    })

    return lowStockPrizes
  }

  /*
   * ==========================================
   * 第七部分：待规划 API 实现（2026-01-28 新增）
   * ==========================================
   */

  /**
   * 获取实时告警列表
   *
   * P0 优先级需求：为运营后台提供实时风险预警
   *
   * 告警规则：
   * - budget_exhaust: 预算消耗 ≥ 90%（danger）
   * - budget_warning: 预算消耗 ≥ 80%（warning）
   * - stock_low: high层级库存 < 100（danger）
   * - stock_warning: 任意奖品库存 < 初始库存10%（warning）
   * - win_rate_high: 实时中奖率 > 配置值 × 1.5（danger）
   * - win_rate_low: 实时中奖率 < 配置值 × 0.5（warning）
   * - high_frequency_user: 单用户1小时内抽奖 > 100次（warning）
   * - empty_streak_high: 连空≥10次用户占比 > 5%（warning）
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {string} [options.level] - 告警级别过滤（danger/warning/info）
   * @param {boolean} [options.acknowledged] - 是否已确认
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 告警列表和汇总
   */
  async getRealtimeAlerts(options = {}) {
    const { campaign_id, level, acknowledged, page = 1, page_size = 20 } = options
    this.logger.info('获取实时告警列表', { campaign_id, level, page })

    const alerts = []
    const now = new Date()

    try {
      // 1. 检查预算告警
      const budgetAlerts = await this._checkBudgetAlerts(campaign_id)
      alerts.push(...budgetAlerts)

      // 2. 检查库存告警
      const stockAlerts = await this._checkStockAlerts(campaign_id)
      alerts.push(...stockAlerts)

      // 3. 检查中奖率告警（最近1小时）
      const winRateAlerts = await this._checkWinRateAlerts(campaign_id)
      alerts.push(...winRateAlerts)

      // 4. 检查高频用户告警（最近1小时）
      const highFrequencyAlerts = await this._checkHighFrequencyAlerts(campaign_id)
      alerts.push(...highFrequencyAlerts)

      // 5. 检查连空用户告警
      const emptyStreakAlerts = await this._checkEmptyStreakAlerts(campaign_id)
      alerts.push(...emptyStreakAlerts)

      // 为每个告警添加唯一ID和时间戳
      alerts.forEach((alert, index) => {
        alert.alert_id = `alert_${now.toISOString().slice(0, 10).replace(/-/g, '')}_${String(index + 1).padStart(3, '0')}`
        alert.created_at = now.toISOString().replace('Z', '+08:00')
        alert.acknowledged = false
      })

      // 过滤条件
      let filteredAlerts = alerts
      if (level) {
        filteredAlerts = filteredAlerts.filter(a => a.level === level)
      }
      if (acknowledged !== undefined) {
        filteredAlerts = filteredAlerts.filter(a => a.acknowledged === acknowledged)
      }

      // 按严重程度排序（danger > warning > info）
      const levelOrder = { danger: 0, warning: 1, info: 2 }
      filteredAlerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level])

      // 分页
      const total = filteredAlerts.length
      const offset = (page - 1) * page_size
      const pagedAlerts = filteredAlerts.slice(offset, offset + page_size)

      // 汇总
      const summary = {
        total: filteredAlerts.length,
        danger: filteredAlerts.filter(a => a.level === 'danger').length,
        warning: filteredAlerts.filter(a => a.level === 'warning').length,
        info: filteredAlerts.filter(a => a.level === 'info').length
      }

      return {
        alerts: pagedAlerts,
        summary,
        pagination: {
          total,
          page,
          page_size,
          total_pages: Math.ceil(total / page_size)
        }
      }
    } catch (error) {
      this.logger.error('获取实时告警失败', { error: error.message })
      throw error
    }
  }

  /**
   * 检查预算告警（内部方法）
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 预算告警列表
   */
  async _checkBudgetAlerts(campaignId) {
    const alerts = []
    const whereClause = { status: 'active' }
    if (campaignId) whereClause.campaign_id = campaignId

    const campaigns = await this.models.LotteryCampaign.findAll({
      where: whereClause,
      attributes: ['campaign_id', 'campaign_name', 'pool_budget_total', 'pool_budget_remaining', 'daily_budget_limit']
    })

    campaigns.forEach(campaign => {
      const total = parseFloat(campaign.pool_budget_total || 0)
      const remaining = parseFloat(campaign.pool_budget_remaining || 0)

      if (total > 0) {
        const consumptionRate = ((total - remaining) / total) * 100

        if (consumptionRate >= 90) {
          alerts.push({
            level: 'danger',
            type: 'budget_exhaust',
            message: `${campaign.campaign_name} 预算消耗已达${consumptionRate.toFixed(1)}%`,
            related_entity: { type: 'campaign', id: campaign.campaign_id, name: campaign.campaign_name },
            threshold: 90,
            current_value: consumptionRate,
            suggestion: '建议立即增加预算或暂停活动'
          })
        } else if (consumptionRate >= 80) {
          alerts.push({
            level: 'warning',
            type: 'budget_warning',
            message: `${campaign.campaign_name} 预算消耗已达${consumptionRate.toFixed(1)}%`,
            related_entity: { type: 'campaign', id: campaign.campaign_id, name: campaign.campaign_name },
            threshold: 80,
            current_value: consumptionRate,
            suggestion: '建议关注预算消耗速度'
          })
        }
      }
    })

    return alerts
  }

  /**
   * 检查库存告警（内部方法）
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 库存告警列表
   */
  async _checkStockAlerts(campaignId) {
    const alerts = []
    const whereClause = { status: 'active' }
    if (campaignId) whereClause.campaign_id = campaignId

    const prizes = await this.models.LotteryPrize.findAll({
      where: whereClause,
      attributes: ['prize_id', 'prize_name', 'reward_tier', 'stock_quantity', 'total_win_count', 'campaign_id'],
      include: [{
        model: this.models.LotteryCampaign,
        as: 'campaign',
        attributes: ['campaign_name']
      }]
    })

    prizes.forEach(prize => {
      const remaining = (prize.stock_quantity || 0) - (prize.total_win_count || 0)
      const initialStock = prize.stock_quantity || 0

      // high层级库存 < 100 为 danger
      if (prize.reward_tier === 'high' && remaining < 100 && remaining >= 0) {
        alerts.push({
          level: 'danger',
          type: 'stock_low',
          message: `高档位奖品「${prize.prize_name}」库存告急，仅剩${remaining}件`,
          related_entity: { type: 'prize', id: prize.prize_id, name: prize.prize_name },
          threshold: 100,
          current_value: remaining,
          suggestion: '建议立即补充库存或调整配置'
        })
      } else if (initialStock > 0 && remaining < initialStock * 0.1 && remaining > 0) {
        // 任意奖品库存 < 初始库存10% 为 warning
        alerts.push({
          level: 'warning',
          type: 'stock_warning',
          message: `奖品「${prize.prize_name}」库存偏低，剩余${((remaining / initialStock) * 100).toFixed(1)}%`,
          related_entity: { type: 'prize', id: prize.prize_id, name: prize.prize_name },
          threshold: 10,
          current_value: (remaining / initialStock) * 100,
          suggestion: '建议关注库存消耗速度'
        })
      }
    })

    return alerts
  }

  /**
   * 检查中奖率告警（内部方法）
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 中奖率告警列表
   */
  async _checkWinRateAlerts(campaignId) {
    const alerts = []
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const whereClause = { created_at: { [Op.gte]: oneHourAgo } }
    if (campaignId) whereClause.campaign_id = campaignId

    // 查询最近1小时的抽奖统计
    const stats = await this.models.LotteryDraw.findAll({
      attributes: [
        'campaign_id',
        [fn('COUNT', col('draw_id')), 'total_draws'],
        [fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")), 'total_wins']
      ],
      where: whereClause,
      group: ['campaign_id'],
      include: [{
        model: this.models.LotteryCampaign,
        as: 'campaign',
        attributes: ['campaign_name']
      }],
      raw: false
    })

    // 预设的正常中奖率范围（可从配置读取）
    const normalWinRate = 70 // 70%

    stats.forEach(stat => {
      const totalDraws = parseInt(stat.dataValues.total_draws || 0)
      const totalWins = parseInt(stat.dataValues.total_wins || 0)

      if (totalDraws >= 10) { // 至少10次抽奖才判定
        const winRate = (totalWins / totalDraws) * 100

        if (winRate > normalWinRate * 1.5) {
          alerts.push({
            level: 'danger',
            type: 'win_rate_high',
            message: `活动「${stat.campaign?.campaign_name || '未知'}」最近1小时中奖率异常高 (${winRate.toFixed(1)}%)`,
            related_entity: { type: 'campaign', id: stat.campaign_id, name: stat.campaign?.campaign_name },
            threshold: normalWinRate * 1.5,
            current_value: winRate,
            suggestion: '建议检查概率配置是否异常'
          })
        } else if (winRate < normalWinRate * 0.5) {
          alerts.push({
            level: 'warning',
            type: 'win_rate_low',
            message: `活动「${stat.campaign?.campaign_name || '未知'}」最近1小时中奖率偏低 (${winRate.toFixed(1)}%)`,
            related_entity: { type: 'campaign', id: stat.campaign_id, name: stat.campaign?.campaign_name },
            threshold: normalWinRate * 0.5,
            current_value: winRate,
            suggestion: '建议检查是否存在系统问题'
          })
        }
      }
    })

    return alerts
  }

  /**
   * 检查高频用户告警（内部方法）
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 高频用户告警列表
   */
  async _checkHighFrequencyAlerts(campaignId) {
    const alerts = []
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const whereClause = { created_at: { [Op.gte]: oneHourAgo } }
    if (campaignId) whereClause.campaign_id = campaignId

    // 查询1小时内抽奖超过100次的用户
    const highFreqUsers = await this.models.LotteryDraw.findAll({
      attributes: [
        'user_id',
        [fn('COUNT', col('draw_id')), 'draw_count']
      ],
      where: whereClause,
      group: ['user_id'],
      having: literal('COUNT(draw_id) > 100'),
      include: [{
        model: this.models.User,
        as: 'user',
        attributes: ['nickname', 'phone']
      }],
      raw: false
    })

    highFreqUsers.forEach(record => {
      const drawCount = parseInt(record.dataValues.draw_count || 0)
      const userDisplay = record.user?.nickname || `用户${record.user_id}`

      alerts.push({
        level: 'warning',
        type: 'high_frequency_user',
        message: `用户「${userDisplay}」1小时内抽奖${drawCount}次，疑似刷单`,
        related_entity: { type: 'user', id: record.user_id, name: userDisplay },
        threshold: 100,
        current_value: drawCount,
        suggestion: '建议人工核查或限制该用户抽奖频率'
      })
    })

    return alerts
  }

  /**
   * 检查连空用户告警（内部方法）
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 连空告警列表
   */
  async _checkEmptyStreakAlerts(campaignId) {
    const alerts = []

    const whereClause = { empty_streak: { [Op.gte]: 10 } }
    if (campaignId) whereClause.campaign_id = campaignId

    // 统计连空≥10次的用户数量
    const emptyStreakCount = await this.models.LotteryUserExperienceState.count({
      where: whereClause
    })

    // 统计总用户数
    const totalUserCount = await this.models.LotteryUserExperienceState.count({
      where: campaignId ? { campaign_id: campaignId } : {}
    })

    if (totalUserCount > 0) {
      const emptyStreakRate = (emptyStreakCount / totalUserCount) * 100

      if (emptyStreakRate > 5) {
        alerts.push({
          level: 'warning',
          type: 'empty_streak_high',
          message: `连续空奖≥10次的用户占比达${emptyStreakRate.toFixed(1)}%，用户体验可能受损`,
          related_entity: { type: 'system', id: null, name: '体验系统' },
          threshold: 5,
          current_value: emptyStreakRate,
          suggestion: '建议检查Pity/AntiEmpty机制配置'
        })
      }
    }

    return alerts
  }

  /**
   * 获取单次抽奖Pipeline详情
   *
   * P1 优先级需求：为运营后台提供抽奖决策过程可视化
   *
   * @param {string} drawId - 抽奖记录ID
   * @returns {Promise<Object|null>} 抽奖详情或null
   */
  async getDrawDetails(drawId) {
    this.logger.info('获取单次抽奖详情', { draw_id: drawId })

    try {
      // 1. 查询抽奖记录和关联的决策快照
      const draw = await this.models.LotteryDraw.findOne({
        where: { draw_id: drawId },
        include: [
          {
            model: this.models.LotteryDrawDecision,
            as: 'decision'
          },
          {
            model: this.models.LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_id', 'campaign_name']
          },
          {
            model: this.models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'prize_name', 'cost_points']
          },
          {
            model: this.models.User,
            as: 'user',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      if (!draw) {
        return null
      }

      // 2. 获取用户在抽奖前的体验状态（通过决策记录中的数据）
      const decision = draw.decision
      let userStateBefore = null

      if (decision) {
        // 从决策记录的JSON字段提取用户状态
        userStateBefore = {
          empty_streak: decision.pity_decision?.empty_streak || 0,
          pity_progress: decision.pity_decision?.boost_multiplier || 0,
          luck_debt: decision.luck_debt_decision?.debt_level || 'none'
        }
      }

      // 3. 构建Pipeline执行详情
      const pipelineExecution = this._buildPipelineExecution(decision)

      // 4. 构建决策快照
      const decisionSnapshot = decision
? {
        decision_id: decision.decision_id,
        random_number: decision.random_seed ? decision.random_seed / 1000000 : null,
        selected_tier: decision.selected_tier || decision.final_tier,
        original_tier: decision.original_tier,
        downgrade_count: decision.downgrade_count || 0,
        fallback_triggered: decision.fallback_triggered || false,
        is_preset: decision.preset_used || false,
        preset_id: decision.preset_id
      }
: null

      // 5. 组装返回数据
      return {
        draw_id: draw.draw_id,
        basic_info: {
          user_id: draw.user_id,
          user_name: draw.user?.nickname || `用户${draw.user_id}`,
          campaign_id: draw.campaign_id,
          campaign_name: draw.campaign?.campaign_name || '未知活动',
          created_at: draw.created_at,
          cost_points: draw.cost_points || 0,
          is_winner: draw.reward_tier && draw.reward_tier !== 'fallback',
          reward_tier: draw.reward_tier,
          prize_name: draw.prize?.prize_name || '未知奖品',
          prize_cost: draw.prize?.cost_points || 0
        },
        pipeline_execution: pipelineExecution,
        decision_snapshot: decisionSnapshot,
        user_state_before: userStateBefore
      }
    } catch (error) {
      this.logger.error('获取单次抽奖详情失败', { draw_id: drawId, error: error.message })
      throw error
    }
  }

  /**
   * 构建Pipeline执行详情（内部方法）
   * @private
   * @param {Object|null} decision - 决策记录对象
   * @returns {Array<Object>} Pipeline阶段执行详情数组
   */
  _buildPipelineExecution(decision) {
    if (!decision) {
      return [{ stage: 0, name: 'Unknown', status: 'no_decision_record', duration_ms: 0, output: {} }]
    }

    // 基于统一抽奖架构的11阶段Pipeline构建执行详情
    const stages = [
      { stage: 1, name: 'LoadCampaignStage', status: 'success', duration_ms: 2, output: { campaign_valid: true } },
      { stage: 2, name: 'LoadPrizesStage', status: 'success', duration_ms: 3, output: { prizes_loaded: true } },
      { stage: 3, name: 'CheckQuotaStage', status: 'success', duration_ms: 2, output: { quota_valid: true } },
      { stage: 4, name: 'LoadUserContextStage', status: 'success', duration_ms: 5, output: { user_loaded: true } },
      {
        stage: 5,
        name: 'BudgetContextStage',
        status: 'success',
        duration_ms: 3,
        output: {
          budget_tier: decision.budget_tier,
          effective_budget: decision.effective_budget
        }
      },
      {
        stage: 6,
        name: 'SegmentResolverStage',
        status: 'success',
        duration_ms: 2,
        output: {
          segment_key: decision.segment_key,
          pressure_tier: decision.pressure_tier
        }
      },
      {
        stage: 7,
        name: 'ComputeProbStage',
        status: 'success',
        duration_ms: 5,
        output: {
          weight_adjustment: decision.weight_adjustment,
          available_tiers: decision.available_tiers,
          cap_value: decision.cap_value
        }
      },
      {
        stage: 8,
        name: 'ExperienceSmoothingStage',
        status: 'success',
        duration_ms: 4,
        output: {
          pity_decision: decision.pity_decision,
          experience_smoothing: decision.experience_smoothing
        }
      },
      {
        stage: 9,
        name: 'TierSelectionStage',
        status: 'success',
        duration_ms: 2,
        output: {
          original_tier: decision.original_tier,
          final_tier: decision.final_tier,
          downgrade_count: decision.downgrade_count
        }
      },
      {
        stage: 10,
        name: 'PrizeSelectionStage',
        status: 'success',
        duration_ms: 3,
        output: {
          selected_tier: decision.selected_tier,
          fallback_triggered: decision.fallback_triggered
        }
      },
      {
        stage: 11,
        name: 'RecordDrawStage',
        status: 'success',
        duration_ms: decision.processing_time_ms ? decision.processing_time_ms - 30 : 10,
        output: { draw_recorded: true }
      }
    ]

    // 调整总时间
    if (decision.processing_time_ms) {
      const totalEstimated = stages.reduce((sum, s) => sum + s.duration_ms, 0)
      const ratio = decision.processing_time_ms / totalEstimated
      stages.forEach(s => { s.duration_ms = Math.round(s.duration_ms * ratio) })
    }

    return stages
  }

  /**
   * 获取异常用户列表
   *
   * P1 优先级需求：检测刷单/脚本用户，风控预警
   *
   * @param {Object} options - 查询参数
   * @param {string} [options.type='all'] - 异常类型
   * @param {string} [options.time_range='24h'] - 时间范围
   * @param {number} [options.campaign_id] - 活动ID
   * @param {number} [options.min_risk_score] - 最小风险分数
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 异常用户列表
   */
  async getAbnormalUsers(options = {}) {
    const { type = 'all', time_range = '24h', campaign_id, min_risk_score, page = 1, page_size = 20 } = options
    this.logger.info('获取异常用户列表', { type, time_range, campaign_id })

    try {
      // 计算时间范围
      const timeRangeMs = { '1h': 3600000, '24h': 86400000, '7d': 604800000 }
      const startTime = new Date(Date.now() - (timeRangeMs[time_range] || 86400000))

      const whereClause = { created_at: { [Op.gte]: startTime } }
      if (campaign_id) whereClause.campaign_id = campaign_id

      // 查询用户抽奖聚合数据
      const userStats = await this.models.LotteryDraw.findAll({
        attributes: [
          'user_id',
          [fn('COUNT', col('draw_id')), 'draw_count'],
          [fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")), 'win_count'],
          [fn('SUM', literal("CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END")), 'high_tier_count'],
          [fn('MAX', col('created_at')), 'last_draw_time']
        ],
        where: whereClause,
        group: ['user_id'],
        having: literal('COUNT(draw_id) >= 10'), // 至少10次抽奖才分析
        include: [{
          model: this.models.User,
          as: 'user',
          attributes: ['nickname', 'phone']
        }],
        raw: false
      })

      // 计算平均值用于判定异常
      const _avgDrawCount = userStats.length > 0
        ? userStats.reduce((sum, u) => sum + parseInt(u.dataValues.draw_count), 0) / userStats.length
        : 0
      void _avgDrawCount // 保留用于后续扩展
      const avgWinRate = userStats.length > 0
        ? userStats.reduce((sum, u) => {
          const draws = parseInt(u.dataValues.draw_count)
          const wins = parseInt(u.dataValues.win_count)
          return sum + (draws > 0 ? wins / draws : 0)
        }, 0) / userStats.length * 100
        : 0

      // 分析每个用户
      const abnormalUsers = []

      for (const stat of userStats) {
        const drawCount = parseInt(stat.dataValues.draw_count || 0)
        const winCount = parseInt(stat.dataValues.win_count || 0)
        const highTierCount = parseInt(stat.dataValues.high_tier_count || 0)
        const winRate = drawCount > 0 ? (winCount / drawCount) * 100 : 0

        // 计算风险分数和类型
        let riskScore = 0
        const abnormalTypes = []

        // 高频抽奖检测
        if (drawCount > 100) {
          riskScore += 30
          abnormalTypes.push('high_frequency')
        }

        // 高中奖率检测
        if (avgWinRate > 0 && winRate > avgWinRate * 2) {
          riskScore += 25
          abnormalTypes.push('high_win_rate')
        }

        // 高档位异常检测
        if (drawCount > 20 && highTierCount / drawCount > 0.1) { // high档位中奖率 > 10%
          riskScore += 35
          abnormalTypes.push('high_tier_abnormal')
        }

        // 根据抽奖次数增加基础风险分
        if (drawCount > 50) riskScore += 10

        // 过滤无异常用户
        if (abnormalTypes.length === 0) continue
        if (type !== 'all' && !abnormalTypes.includes(type)) continue
        if (min_risk_score !== undefined && riskScore < min_risk_score) continue

        // 确定风险等级
        let riskLevel = 'low'
        if (riskScore >= 60) riskLevel = 'high'
        else if (riskScore >= 30) riskLevel = 'medium'

        // 生成建议
        let suggestion = '建议持续观察'
        if (riskLevel === 'high') suggestion = '建议限制抽奖频率或人工审核'
        else if (riskLevel === 'medium') suggestion = '建议加强监控'

        abnormalUsers.push({
          user_id: stat.user_id,
          nickname: stat.user?.nickname || `用户${stat.user_id}`,
          abnormal_type: abnormalTypes[0], // 主要异常类型
          abnormal_types: abnormalTypes,
          metrics: {
            draw_count_1h: null, // 需要单独计算
            draw_count_24h: drawCount,
            win_rate: parseFloat(winRate.toFixed(1)),
            high_tier_count: highTierCount
          },
          risk_score: Math.min(100, riskScore),
          risk_level: riskLevel,
          suggestion,
          last_draw_time: stat.dataValues.last_draw_time
        })
      }

      // 按风险分数排序
      abnormalUsers.sort((a, b) => b.risk_score - a.risk_score)

      // 分页
      const total = abnormalUsers.length
      const offset = (page - 1) * page_size
      const pagedUsers = abnormalUsers.slice(offset, offset + page_size)

      // 汇总
      const summary = {
        high_risk_count: abnormalUsers.filter(u => u.risk_level === 'high').length,
        medium_risk_count: abnormalUsers.filter(u => u.risk_level === 'medium').length,
        low_risk_count: abnormalUsers.filter(u => u.risk_level === 'low').length
      }

      return {
        users: pagedUsers,
        pagination: {
          total,
          page,
          page_size,
          total_pages: Math.ceil(total / page_size)
        },
        summary
      }
    } catch (error) {
      this.logger.error('获取异常用户列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 生成活动复盘报告
   *
   * P2 优先级需求：活动结束后的完整复盘报告
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 复盘报告数据
   */
  async generateCampaignReport(campaignId) {
    this.logger.info('生成活动复盘报告', { campaign_id: campaignId })

    try {
      // 1. 获取活动信息
      const campaign = await this.models.LotteryCampaign.findByPk(campaignId)
      if (!campaign) {
        throw new Error('活动不存在')
      }

      const startTime = new Date(campaign.start_time)
      const endTime = campaign.end_time ? new Date(campaign.end_time) : new Date()
      const durationDays = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000))

      // 2. 查询基础统计数据
      const whereClause = { campaign_id: campaignId }

      // 抽奖统计
      const drawStats = await this.models.LotteryDraw.findOne({
        attributes: [
          [fn('COUNT', col('draw_id')), 'total_draws'],
          [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users'],
          [fn('SUM', col('cost_points')), 'total_cost_points'],
          [fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")), 'total_wins']
        ],
        where: whereClause,
        raw: true
      })

      const totalDraws = parseInt(drawStats.total_draws || 0)
      const uniqueUsers = parseInt(drawStats.unique_users || 0)
      const totalCostPoints = parseFloat(drawStats.total_cost_points || 0)
      const totalWins = parseInt(drawStats.total_wins || 0)

      // 奖品成本统计
      const prizeStats = await this.models.LotteryDraw.findOne({
        attributes: [
          [fn('SUM', literal('COALESCE(prize.cost_points, 0)')), 'total_prize_value']
        ],
        where: whereClause,
        include: [{
          model: this.models.LotteryPrize,
          as: 'prize',
          attributes: []
        }],
        raw: true
      })

      const totalPrizeValue = parseFloat(prizeStats.total_prize_value || 0)
      const roi = totalCostPoints > 0 ? ((totalCostPoints - totalPrizeValue) / totalCostPoints) * 100 : 0

      // 复购用户统计（至少2次抽奖的用户）
      const repeatUsers = await this.models.LotteryDraw.count({
        where: whereClause,
        group: ['user_id'],
        having: literal('COUNT(draw_id) > 1')
      })

      const repeatRate = uniqueUsers > 0 ? (repeatUsers.length / uniqueUsers) * 100 : 0

      // 3. 时间分布
      const hourlyDistribution = await this._getCampaignHourlyDistribution(campaignId)
      const dailyDistribution = await this._getCampaignDailyDistribution(campaignId)

      // 4. 奖品分析
      const tierDistribution = await this._getCampaignTierDistribution(campaignId)
      const topPrizes = await this._getCampaignTopPrizes(campaignId, 10)

      // 5. 用户分析
      const userAnalysis = await this._getCampaignUserAnalysis(campaignId)

      // 6. 体验指标
      const experienceMetrics = await this._getCampaignExperienceMetrics(campaignId)

      // 7. 历史对比（查找上一个活动）
      const comparisonWithHistory = await this._getCampaignHistoryComparison(campaignId, {
        total_draws: totalDraws,
        unique_users: uniqueUsers,
        roi
      })

      // 组装报告
      return {
        campaign_info: {
          campaign_id: campaignId,
          campaign_name: campaign.campaign_name,
          period: {
            start_time: startTime.toISOString().replace('Z', '+08:00'),
            end_time: endTime.toISOString().replace('Z', '+08:00'),
            duration_days: durationDays
          }
        },
        overview: {
          total_draws: totalDraws,
          unique_users: uniqueUsers,
          total_cost_points: totalCostPoints,
          total_prize_value: totalPrizeValue,
          roi: parseFloat(roi.toFixed(1)),
          repeat_rate: parseFloat(repeatRate.toFixed(1))
        },
        participation_funnel: {
          actual_draws: totalDraws,
          winners: totalWins,
          conversion_rate: {
            draw_to_win: totalDraws > 0 ? parseFloat(((totalWins / totalDraws) * 100).toFixed(1)) : 0
          }
        },
        time_distribution: {
          hourly_draws: hourlyDistribution,
          daily_draws: dailyDistribution,
          peak_hour: hourlyDistribution.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 }).hour,
          peak_day: dailyDistribution.length > 0
            ? dailyDistribution.reduce((max, d) => d.count > max.count ? d : max, { date: '', count: 0 }).date
            : null
        },
        prize_analysis: {
          tier_distribution: tierDistribution,
          top_prizes: topPrizes
        },
        user_analysis: userAnalysis,
        experience_metrics: experienceMetrics,
        comparison_with_history: comparisonWithHistory,
        generated_at: new Date().toISOString().replace('Z', '+08:00')
      }
    } catch (error) {
      this.logger.error('生成活动复盘报告失败', { campaign_id: campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 获取活动小时分布（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Array>} 24小时分布数组
   */
  async _getCampaignHourlyDistribution(campaignId) {
    const results = await this.models.LotteryDraw.findAll({
      attributes: [
        [fn('HOUR', col('created_at')), 'hour'],
        [fn('COUNT', col('draw_id')), 'count']
      ],
      where: { campaign_id: campaignId },
      group: [fn('HOUR', col('created_at'))],
      order: [[fn('HOUR', col('created_at')), 'ASC']],
      raw: true
    })

    // 填充完整24小时
    const distribution = []
    for (let h = 0; h < 24; h++) {
      const found = results.find(r => parseInt(r.hour) === h)
      distribution.push({ hour: h, count: found ? parseInt(found.count) : 0 })
    }
    return distribution
  }

  /**
   * 获取活动日分布（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Array>} 日期分布数组
   */
  async _getCampaignDailyDistribution(campaignId) {
    const results = await this.models.LotteryDraw.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('draw_id')), 'count']
      ],
      where: { campaign_id: campaignId },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    })

    return results.map(r => ({ date: r.date, count: parseInt(r.count) }))
  }

  /**
   * 获取活动档位分布（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 档位分布对象
   */
  async _getCampaignTierDistribution(campaignId) {
    const results = await this.models.LotteryDraw.findAll({
      attributes: [
        'reward_tier',
        [fn('COUNT', col('draw_id')), 'count']
      ],
      where: { campaign_id: campaignId },
      group: ['reward_tier'],
      raw: true
    })

    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0)
    const distribution = {}

    results.forEach(r => {
      const tier = r.reward_tier || 'unknown'
      distribution[tier] = {
        count: parseInt(r.count),
        rate: total > 0 ? parseFloat(((parseInt(r.count) / total) * 100).toFixed(1)) : 0
      }
    })

    return distribution
  }

  /**
   * 获取活动热门奖品（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @param {number} limit - 返回数量限制
   * @returns {Promise<Array>} 热门奖品数组
   */
  async _getCampaignTopPrizes(campaignId, limit) {
    const results = await this.models.LotteryDraw.findAll({
      attributes: [
        'prize_id',
        [fn('COUNT', col('draw_id')), 'count']
      ],
      where: { campaign_id: campaignId, prize_id: { [Op.ne]: null } },
      group: ['prize_id'],
      order: [[fn('COUNT', col('draw_id')), 'DESC']],
      limit,
      include: [{
        model: this.models.LotteryPrize,
        as: 'prize',
        attributes: ['prize_name', 'cost_points']
      }],
      raw: false
    })

    return results.map(r => ({
      prize_name: r.prize?.prize_name || '未知奖品',
      count: parseInt(r.dataValues.count),
      value: r.prize?.cost_points || 0
    }))
  }

  /**
   * 获取活动用户分析（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 用户分析数据
   */
  async _getCampaignUserAnalysis(campaignId) {
    // 人均抽奖次数
    const avgStats = await this.models.LotteryDraw.findOne({
      attributes: [
        [fn('COUNT', col('draw_id')), 'total_draws'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
      ],
      where: { campaign_id: campaignId },
      raw: true
    })

    const avgDrawsPerUser = parseInt(avgStats.unique_users) > 0
      ? parseFloat((parseInt(avgStats.total_draws) / parseInt(avgStats.unique_users)).toFixed(1))
      : 0

    // 最高抽奖次数用户
    const maxDrawUser = await this.models.LotteryDraw.findOne({
      attributes: [
        'user_id',
        [fn('COUNT', col('draw_id')), 'count']
      ],
      where: { campaign_id: campaignId },
      group: ['user_id'],
      order: [[fn('COUNT', col('draw_id')), 'DESC']],
      raw: true
    })

    return {
      avg_draws_per_user: avgDrawsPerUser,
      max_draws_user: maxDrawUser
? {
        user_id: maxDrawUser.user_id,
        count: parseInt(maxDrawUser.count)
      }
: null
    }
  }

  /**
   * 获取活动体验指标（内部方法）
   * @private
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 体验指标数据
   */
  async _getCampaignExperienceMetrics(campaignId) {
    const states = await this.models.LotteryUserExperienceState.findAll({
      where: { campaign_id: campaignId },
      attributes: ['empty_streak', 'pity_trigger_count', 'anti_empty_trigger_count']
    })

    if (states.length === 0) {
      return { avg_empty_streak: 0, pity_trigger_count: 0, anti_empty_trigger_count: 0 }
    }

    const avgEmptyStreak = states.reduce((sum, s) => sum + (s.empty_streak || 0), 0) / states.length
    const pityTriggerCount = states.reduce((sum, s) => sum + (s.pity_trigger_count || 0), 0)
    const antiEmptyTriggerCount = states.reduce((sum, s) => sum + (s.anti_empty_trigger_count || 0), 0)

    return {
      avg_empty_streak: parseFloat(avgEmptyStreak.toFixed(1)),
      pity_trigger_count: pityTriggerCount,
      anti_empty_trigger_count: antiEmptyTriggerCount
    }
  }

  /** 获取活动历史对比（内部方法）@private */
  async _getCampaignHistoryComparison(campaignId, currentStats) {
    // 查找上一个活动
    const previousCampaign = await this.models.LotteryCampaign.findOne({
      where: { campaign_id: { [Op.lt]: campaignId } },
      order: [['campaign_id', 'DESC']]
    })

    if (!previousCampaign) {
      return { vs_last_campaign: null }
    }

    // 获取上一个活动的统计
    const prevStats = await this.models.LotteryDraw.findOne({
      attributes: [
        [fn('COUNT', col('draw_id')), 'total_draws'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
      ],
      where: { campaign_id: previousCampaign.campaign_id },
      raw: true
    })

    const prevDraws = parseInt(prevStats.total_draws || 0)
    const prevUsers = parseInt(prevStats.unique_users || 0)

    return {
      vs_last_campaign: {
        draws_change: prevDraws > 0 ? parseFloat((((currentStats.total_draws - prevDraws) / prevDraws) * 100).toFixed(1)) : null,
        users_change: prevUsers > 0 ? parseFloat((((currentStats.unique_users - prevUsers) / prevUsers) * 100).toFixed(1)) : null
      }
    }
  }

  /**
   * 获取策略效果分析
   *
   * P2 优先级需求：评估策略配置效果
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {string} [options.time_range='7d'] - 时间范围
   * @param {string} [options.strategy_type='all'] - 策略类型
   * @returns {Promise<Object>} 策略效果分析数据
   */
  async getStrategyEffectiveness(options = {}) {
    const { campaign_id, time_range = '7d', strategy_type = 'all' } = options
    this.logger.info('获取策略效果分析', { campaign_id, time_range, strategy_type })

    try {
      // 计算时间范围
      const timeRangeMs = { '7d': 604800000, '30d': 2592000000, '90d': 7776000000 }
      const startTime = new Date(Date.now() - (timeRangeMs[time_range] || 604800000))
      const endTime = new Date()

      const whereClause = { created_at: { [Op.gte]: startTime } }
      if (campaign_id) whereClause.campaign_id = campaign_id

      // 1. BxPx 矩阵分析
      let bxpxMatrixAnalysis = null
      if (strategy_type === 'all' || strategy_type === 'bxpx') {
        bxpxMatrixAnalysis = await this._analyzeBxPxMatrix(whereClause)
      }

      // 2. 体验机制分析
      let experienceMechanismAnalysis = null
      if (strategy_type === 'all' || ['pity', 'anti_empty', 'luck_debt'].includes(strategy_type)) {
        experienceMechanismAnalysis = await this._analyzeExperienceMechanisms(whereClause)
      }

      // 3. 档位降级分析
      const tierDowngradeAnalysis = await this._analyzeTierDowngrade(whereClause)

      // 4. 计算整体策略评分
      const overallStrategyScore = this._calculateOverallStrategyScore(
        bxpxMatrixAnalysis,
        experienceMechanismAnalysis,
        tierDowngradeAnalysis
      )

      // 5. 生成优化建议
      const optimizationRecommendations = this._generateOptimizationRecommendations(
        bxpxMatrixAnalysis,
        experienceMechanismAnalysis,
        tierDowngradeAnalysis
      )

      return {
        analysis_period: {
          start: startTime.toISOString().replace('Z', '+08:00'),
          end: endTime.toISOString().replace('Z', '+08:00')
        },
        bxpx_matrix_analysis: bxpxMatrixAnalysis,
        experience_mechanism_analysis: experienceMechanismAnalysis,
        tier_downgrade_analysis: tierDowngradeAnalysis,
        overall_strategy_score: overallStrategyScore,
        optimization_recommendations: optimizationRecommendations
      }
    } catch (error) {
      this.logger.error('获取策略效果分析失败', { error: error.message })
      throw error
    }
  }

  /** 分析BxPx矩阵（内部方法）@private */
  async _analyzeBxPxMatrix(whereClause) {
    // 从决策记录中分析BxPx命中分布
    const decisions = await this.models.LotteryDrawDecision.findAll({
      attributes: [
        'budget_tier',
        'pressure_tier',
        [fn('COUNT', col('decision_id')), 'count']
      ],
      where: whereClause,
      group: ['budget_tier', 'pressure_tier'],
      raw: true
    })

    const total = decisions.reduce((sum, d) => sum + parseInt(d.count), 0)
    const hitDistribution = {}

    decisions.forEach(d => {
      const key = `${d.budget_tier || 'B0'}_${d.pressure_tier || 'P0'}`
      hitDistribution[key] = {
        count: parseInt(d.count),
        rate: total > 0 ? parseFloat(((parseInt(d.count) / total) * 100).toFixed(1)) : 0
      }
    })

    // 计算效果评分（基于分布均匀度）
    const expectedRate = 100 / Object.keys(hitDistribution).length || 12.5
    const variance = Object.values(hitDistribution).reduce((sum, v) => {
      return sum + Math.pow(v.rate - expectedRate, 2)
    }, 0) / Object.keys(hitDistribution).length || 1

    const effectivenessScore = Math.max(0, Math.min(100, 100 - variance))

    return {
      hit_distribution: hitDistribution,
      effectiveness_score: Math.round(effectivenessScore),
      suggestions: effectivenessScore < 70 ? ['BxPx矩阵配置可能需要调整，部分格子命中率不均衡'] : []
    }
  }

  /** 分析体验机制（内部方法）@private */
  async _analyzeExperienceMechanisms(whereClause) {
    // Pity机制分析
    const pityStats = await this.models.LotteryDrawDecision.findOne({
      attributes: [
        [fn('COUNT', literal("CASE WHEN JSON_EXTRACT(pity_decision, '$.triggered') = true THEN 1 END")), 'trigger_count'],
        [fn('COUNT', col('decision_id')), 'total']
      ],
      where: whereClause,
      raw: true
    })

    const pityTriggerCount = parseInt(pityStats?.trigger_count || 0)
    const total = parseInt(pityStats?.total || 1)
    const pityTriggerRate = (pityTriggerCount / total) * 100

    // 体验状态统计
    const experienceStats = await this.models.LotteryUserExperienceState.findOne({
      attributes: [
        [fn('SUM', col('pity_trigger_count')), 'total_pity'],
        [fn('SUM', col('anti_empty_trigger_count')), 'total_anti_empty'],
        [fn('AVG', col('empty_streak')), 'avg_empty_streak']
      ],
      raw: true
    })

    return {
      pity_mechanism: {
        trigger_count: pityTriggerCount,
        trigger_rate: parseFloat(pityTriggerRate.toFixed(1)),
        effectiveness: pityTriggerRate > 1 && pityTriggerRate < 10 ? '触发频率适中' : '需要调整'
      },
      anti_empty_mechanism: {
        trigger_count: parseInt(experienceStats?.total_anti_empty || 0),
        effectiveness: '正常运行'
      },
      luck_debt_mechanism: {
        avg_empty_streak: parseFloat(experienceStats?.avg_empty_streak || 0).toFixed(1),
        effectiveness: '正常运行'
      }
    }
  }

  /** 分析档位降级（内部方法）@private */
  async _analyzeTierDowngrade(whereClause) {
    const downgradeStats = await this.models.LotteryDrawDecision.findOne({
      attributes: [
        [fn('SUM', col('downgrade_count')), 'total_downgrades'],
        [fn('COUNT', col('decision_id')), 'total'],
        [fn('SUM', literal('CASE WHEN fallback_triggered = true THEN 1 ELSE 0 END')), 'fallback_count']
      ],
      where: whereClause,
      raw: true
    })

    const totalDowngrades = parseInt(downgradeStats?.total_downgrades || 0)
    const total = parseInt(downgradeStats?.total || 1)
    const fallbackCount = parseInt(downgradeStats?.fallback_count || 0)
    const downgradeRate = (totalDowngrades / total) * 100

    return {
      total_downgrades: totalDowngrades,
      downgrade_rate: parseFloat(downgradeRate.toFixed(1)),
      fallback_count: fallbackCount,
      main_cause: downgradeRate > 10 ? 'stock_insufficient' : 'normal',
      suggestions: downgradeRate > 10 ? ['降级率偏高，建议检查库存配置'] : []
    }
  }

  /** 计算整体策略评分（内部方法）@private */
  _calculateOverallStrategyScore(bxpx, experience, downgrade) {
    let score = 70 // 基础分

    if (bxpx) {
      score += (bxpx.effectiveness_score - 50) * 0.2
    }

    if (experience) {
      const pityRate = experience.pity_mechanism?.trigger_rate || 0
      if (pityRate > 1 && pityRate < 10) score += 10
    }

    if (downgrade) {
      if (downgrade.downgrade_rate < 5) score += 10
      else if (downgrade.downgrade_rate > 20) score -= 10
    }

    return Math.max(0, Math.min(100, Math.round(score)))
  }

  /** 生成优化建议（内部方法）@private */
  _generateOptimizationRecommendations(bxpx, experience, downgrade) {
    const recommendations = []

    if (bxpx && bxpx.effectiveness_score < 70) {
      recommendations.push({
        priority: 'medium',
        area: 'BxPx矩阵',
        recommendation: 'BxPx格子命中分布不均，建议调整概率系数'
      })
    }

    if (downgrade && downgrade.downgrade_rate > 10) {
      recommendations.push({
        priority: 'high',
        area: '库存管理',
        recommendation: `档位降级率${downgrade.downgrade_rate}%偏高，建议补充库存`
      })
    }

    if (experience?.pity_mechanism?.trigger_rate > 10) {
      recommendations.push({
        priority: 'medium',
        area: '体验机制',
        recommendation: 'Pity触发率偏高，建议检查连空阈值配置'
      })
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        area: '整体',
        recommendation: '当前策略配置效果良好，建议持续监控'
      })
    }

    return recommendations
  }
}

module.exports = LotteryAnalyticsService
