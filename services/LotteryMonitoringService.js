/**
 * @file 抽奖监控数据查询服务 - P2表只读查询API
 * @description 提供抽奖系统监控相关数据的只读查询功能
 *
 * 覆盖P2优先级表：
 * - lottery_hourly_metrics: 抽奖小时统计指标
 * - lottery_user_experience_state: 用户体验状态（Pity/AntiEmpty/AntiHigh）
 * - lottery_user_global_state: 用户全局状态（运气债务）
 * - lottery_campaign_quota_grants: 配额赠送记录
 * - lottery_campaign_user_quota: 用户配额状态
 *
 * 架构原则：
 * - 只读查询服务，不涉及写操作
 * - 所有方法均为查询方法，无需事务管理
 * - 严格遵循项目snake_case命名规范
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger

/**
 * 抽奖监控数据查询服务
 * 提供P2优先级表的只读查询API
 */
class LotteryMonitoringService {
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
   * 1. lottery_hourly_metrics - 抽奖小时统计指标
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
    const { fn, col } = require('sequelize')

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
   * 2. lottery_user_experience_state - 用户体验状态
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
   * 3. lottery_user_global_state - 用户全局状态
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
   * 4. lottery_campaign_quota_grants - 配额赠送记录
   * ==========================================
   */

  /**
   * 查询配额赠送记录列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {number} [options.user_id] - 被赠送用户ID
   * @param {number} [options.granted_by] - 赠送操作者ID
   * @param {string} [options.grant_type] - 赠送类型
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
   * 5. lottery_campaign_user_quota - 用户配额状态
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
   * 6. 综合监控统计 - 用于抽奖监控仪表盘
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
      const { fn, col, literal } = require('sequelize')

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
   * 获取小时趋势数据
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
      const { fn, col, literal } = require('sequelize')

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
      const { fn, col } = require('sequelize')

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

module.exports = LotteryMonitoringService
