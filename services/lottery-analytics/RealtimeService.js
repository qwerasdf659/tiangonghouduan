'use strict'

/**
 * @file 实时监控服务（Realtime Service）
 * @description 提供抽奖系统的实时监控和告警功能
 *
 * 拆分自原 LotteryAnalyticsService.js
 * 包含实时概览、告警检测、监控统计等功能
 *
 * 核心功能：
 * 1. getRealtimeOverview() - 实时概览数据（Redis优先，MySQL降级）
 * 2. getRealtimeAlerts() - 实时告警列表
 * 3. getMonitoringStats() - 综合监控统计
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
 * 数据源优先级：
 * 1. Redis实时计数器（优先）
 * 2. lottery_draws表查询（降级方案）
 *
 * @module services/lottery-analytics/RealtimeService
 * @version 1.0.0
 * @date 2026-01-31
 */

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const { getRedisClient, isRedisHealthy } = require('../../utils/UnifiedRedisClient')

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
 * 实时监控服务
 * 提供抽奖系统的实时监控和告警功能
 *
 * @class RealtimeService
 */
class RealtimeService {
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
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} 实时概览数据
   */
  async getRealtimeOverview(lottery_campaign_id) {
    this.logger.info('获取实时概览数据', { lottery_campaign_id })

    const todayRange = this._getTodayRange()
    const hourRange = this._getCurrentHourRange()

    // 尝试从Redis获取实时数据
    const redis = await this._getRedisClient()
    let redis_data = null

    if (redis) {
      try {
        const today_key = `${REDIS_KEY_PREFIX.REALTIME_DRAWS}${lottery_campaign_id}:${todayRange.start.toISOString().slice(0, 10)}`
        const hour_key = `${REDIS_KEY_PREFIX.HOURLY_COUNTER}${lottery_campaign_id}:${hourRange.start.toISOString().slice(0, 13)}`

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
      this._getTodayStatsFromDraws(lottery_campaign_id, todayRange),
      this._getHourStatsFromDraws(lottery_campaign_id, hourRange)
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
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} range - 时间范围
   * @returns {Promise<Object>} 统计数据
   */
  async _getTodayStatsFromDraws(lottery_campaign_id, range) {
    const LotteryDraw = this.models.LotteryDraw
    const LotteryDrawDecision = this.models.LotteryDrawDecision

    // 基础统计
    const draws = await LotteryDraw.findAll({
      where: {
        lottery_campaign_id,
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
          attributes: [
            'lottery_draw_decision_id',
            'budget_deducted',
            'budget_tier',
            'pressure_tier'
          ]
        }
      ],
      raw: false
    })

    const total_draws = draws.length
    const unique_users = new Set(draws.map(d => d.user_id)).size
    // empty_count 只统计真正空奖（empty 或 prize_id 为空），不包括正常保底（fallback）
    const empty_count = draws.filter(d => d.prize_type === 'empty' || !d.lottery_prize_id).length
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
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} range - 时间范围
   * @returns {Promise<Object>} 统计数据
   */
  async _getHourStatsFromDraws(lottery_campaign_id, range) {
    const LotteryDraw = this.models.LotteryDraw

    const draws = await LotteryDraw.count({
      where: {
        lottery_campaign_id,
        created_at: {
          [Op.gte]: range.start,
          [Op.lte]: range.end
        }
      }
    })

    // empty_count 只统计真正空奖（empty 或 prize_id 为空），不包括正常保底（fallback）
    const empty_count = await LotteryDraw.count({
      where: {
        lottery_campaign_id,
        created_at: {
          [Op.gte]: range.start,
          [Op.lte]: range.end
        },
        [Op.or]: [{ prize_type: 'empty' }, { lottery_prize_id: null }]
      }
    })

    const empty_rate = draws > 0 ? empty_count / draws : 0

    return {
      total_draws: draws,
      empty_rate: parseFloat(empty_rate.toFixed(4))
    }
  }

  /**
   * 获取实时告警列表
   *
   * P0 优先级需求：为运营后台提供实时风险预警
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.lottery_campaign_id] - 活动ID
   * @param {string} [options.level] - 告警级别过滤（danger/warning/info）
   * @param {boolean} [options.acknowledged] - 是否已确认
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 告警列表和汇总
   */
  async getRealtimeAlerts(options = {}) {
    const { lottery_campaign_id, level, acknowledged, page = 1, page_size = 20 } = options
    this.logger.info('获取实时告警列表', { lottery_campaign_id, level, page })

    const alerts = []
    const now = new Date()

    try {
      // 1. 检查预算告警
      const budgetAlerts = await this._checkBudgetAlerts(lottery_campaign_id)
      alerts.push(...budgetAlerts)

      // 2. 检查库存告警
      const stockAlerts = await this._checkStockAlerts(lottery_campaign_id)
      alerts.push(...stockAlerts)

      // 3. 检查中奖率告警（最近1小时）
      const winRateAlerts = await this._checkWinRateAlerts(lottery_campaign_id)
      alerts.push(...winRateAlerts)

      // 4. 检查高频用户告警（最近1小时）
      const highFrequencyAlerts = await this._checkHighFrequencyAlerts(lottery_campaign_id)
      alerts.push(...highFrequencyAlerts)

      // 5. 检查连空用户告警
      const emptyStreakAlerts = await this._checkEmptyStreakAlerts(lottery_campaign_id)
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
   * 检查预算告警
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 预算告警列表
   */
  async _checkBudgetAlerts(campaignId) {
    const alerts = []
    const whereClause = { status: 'active' }
    if (campaignId) whereClause.lottery_campaign_id = campaignId

    const campaigns = await this.models.LotteryCampaign.findAll({
      where: whereClause,
      attributes: [
        'lottery_campaign_id',
        'campaign_name',
        'pool_budget_total',
        'pool_budget_remaining',
        'daily_budget_limit'
      ]
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
            related_entity: {
              type: 'campaign',
              id: campaign.lottery_campaign_id,
              name: campaign.campaign_name
            },
            threshold: 90,
            current_value: consumptionRate,
            suggestion: '建议立即增加预算或暂停活动'
          })
        } else if (consumptionRate >= 80) {
          alerts.push({
            level: 'warning',
            type: 'budget_warning',
            message: `${campaign.campaign_name} 预算消耗已达${consumptionRate.toFixed(1)}%`,
            related_entity: {
              type: 'campaign',
              id: campaign.lottery_campaign_id,
              name: campaign.campaign_name
            },
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
   * 检查库存告警
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 库存告警列表
   */
  async _checkStockAlerts(campaignId) {
    const alerts = []
    const whereClause = { status: 'active' }
    if (campaignId) whereClause.lottery_campaign_id = campaignId

    const prizes = await this.models.LotteryPrize.findAll({
      where: whereClause,
      attributes: [
        'lottery_prize_id',
        'prize_name',
        'reward_tier',
        'stock_quantity',
        'total_win_count',
        'lottery_campaign_id'
      ],
      include: [
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_name']
        }
      ]
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
          related_entity: { type: 'prize', id: prize.lottery_prize_id, name: prize.prize_name },
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
          related_entity: { type: 'prize', id: prize.lottery_prize_id, name: prize.prize_name },
          threshold: 10,
          current_value: (remaining / initialStock) * 100,
          suggestion: '建议关注库存消耗速度'
        })
      }
    })

    return alerts
  }

  /**
   * 检查中奖率告警
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 中奖率告警列表
   */
  async _checkWinRateAlerts(campaignId) {
    const alerts = []
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const whereClause = { created_at: { [Op.gte]: oneHourAgo } }
    if (campaignId) whereClause.lottery_campaign_id = campaignId

    // 查询最近1小时的抽奖统计
    const stats = await this.models.LotteryDraw.findAll({
      attributes: [
        'lottery_campaign_id',
        [fn('COUNT', col('lottery_draw_id')), 'total_draws'],
        [
          fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
          'total_wins'
        ]
      ],
      where: whereClause,
      group: ['lottery_campaign_id'],
      include: [
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_name']
        }
      ],
      raw: false
    })

    // 预设的正常中奖率范围（可从配置读取）
    const normalWinRate = 70 // 70%

    stats.forEach(stat => {
      const totalDraws = parseInt(stat.dataValues.total_draws || 0)
      const totalWins = parseInt(stat.dataValues.total_wins || 0)

      if (totalDraws >= 10) {
        // 至少10次抽奖才判定
        const winRate = (totalWins / totalDraws) * 100

        if (winRate > normalWinRate * 1.5) {
          alerts.push({
            level: 'danger',
            type: 'win_rate_high',
            message: `活动「${stat.campaign?.campaign_name || '未知'}」最近1小时中奖率异常高 (${winRate.toFixed(1)}%)`,
            related_entity: {
              type: 'campaign',
              id: stat.lottery_campaign_id,
              name: stat.campaign?.campaign_name
            },
            threshold: normalWinRate * 1.5,
            current_value: winRate,
            suggestion: '建议检查概率配置是否异常'
          })
        } else if (winRate < normalWinRate * 0.5) {
          alerts.push({
            level: 'warning',
            type: 'win_rate_low',
            message: `活动「${stat.campaign?.campaign_name || '未知'}」最近1小时中奖率偏低 (${winRate.toFixed(1)}%)`,
            related_entity: {
              type: 'campaign',
              id: stat.lottery_campaign_id,
              name: stat.campaign?.campaign_name
            },
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
   * 检查高频用户告警
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 高频用户告警列表
   */
  async _checkHighFrequencyAlerts(campaignId) {
    const alerts = []
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const whereClause = { created_at: { [Op.gte]: oneHourAgo } }
    if (campaignId) whereClause.lottery_campaign_id = campaignId

    // 查询1小时内抽奖超过100次的用户
    const highFreqUsers = await this.models.LotteryDraw.findAll({
      attributes: ['user_id', [fn('COUNT', col('lottery_draw_id')), 'draw_count']],
      where: whereClause,
      group: ['user_id'],
      having: literal('COUNT(lottery_draw_id) > 100'),
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['nickname', 'mobile']
        }
      ],
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
   * 检查连空用户告警
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 连空告警列表
   */
  async _checkEmptyStreakAlerts(campaignId) {
    const alerts = []

    const whereClause = { empty_streak: { [Op.gte]: 10 } }
    if (campaignId) whereClause.lottery_campaign_id = campaignId

    // 统计连空≥10次的用户数量
    const emptyStreakCount = await this.models.LotteryUserExperienceState.count({
      where: whereClause
    })

    // 统计总用户数
    const totalUserCount = await this.models.LotteryUserExperienceState.count({
      where: campaignId ? { lottery_campaign_id: campaignId } : {}
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
   * 检查低库存奖品
   * @private
   * @param {number|null} campaignId - 活动ID
   * @returns {Promise<Array>} 低库存奖品数组
   */
  async _checkLowStockPrizes(campaignId) {
    const whereClause = { status: 'active' }
    if (campaignId) whereClause.lottery_campaign_id = campaignId

    const prizes = await this.models.LotteryPrize.findAll({
      where: whereClause,
      attributes: ['lottery_prize_id', 'prize_name', 'stock_quantity', 'total_win_count']
    })

    const lowStockPrizes = []
    prizes.forEach(prize => {
      const remaining = (prize.stock_quantity || 0) - (prize.total_win_count || 0)
      if (remaining < 10) {
        lowStockPrizes.push({
          lottery_prize_id: prize.lottery_prize_id,
          prize_name: prize.prize_name,
          remaining
        })
      }
    })

    return lowStockPrizes
  }

  /**
   * 获取综合监控统计数据
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.lottery_campaign_id] - 活动ID
   * @param {Date|string} [options.start_time] - 开始时间
   * @param {Date|string} [options.end_time] - 结束时间
   * @returns {Promise<Object>} 综合监控统计
   */
  async getMonitoringStats(options = {}) {
    const { lottery_campaign_id, start_time, end_time } = options
    this.logger.info('获取综合监控统计', { lottery_campaign_id, start_time, end_time })

    const whereClause = {}
    if (lottery_campaign_id) whereClause.lottery_campaign_id = lottery_campaign_id
    if (start_time || end_time) {
      whereClause.created_at = {}
      if (start_time) whereClause.created_at[Op.gte] = new Date(start_time)
      if (end_time) whereClause.created_at[Op.lte] = new Date(end_time)
    }

    // 查询基础统计
    const [totalDraws, uniqueUsers, drawStats] = await Promise.all([
      this.models.LotteryDraw.count({ where: whereClause }),
      this.models.LotteryDraw.count({
        where: whereClause,
        distinct: true,
        col: 'user_id'
      }),
      this.models.LotteryDraw.findAll({
        attributes: [
          [fn('COUNT', col('lottery_draw_id')), 'total'],
          [
            fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
            'wins'
          ],
          [
            fn(
              'SUM',
              literal(
                "CASE WHEN prize_type = 'empty' OR lottery_prize_id IS NULL THEN 1 ELSE 0 END"
              )
            ),
            'empty'
          ]
        ],
        where: whereClause,
        raw: true
      })
    ])

    const stats = drawStats[0] || { total: 0, wins: 0, empty: 0 }
    const winRate = stats.total > 0 ? (parseInt(stats.wins) / parseInt(stats.total)) * 100 : 0
    const emptyRate = stats.total > 0 ? (parseInt(stats.empty) / parseInt(stats.total)) * 100 : 0

    // 获取低库存奖品
    const lowStockPrizes = await this._checkLowStockPrizes(lottery_campaign_id)

    return {
      total_draws: totalDraws,
      unique_users: uniqueUsers,
      win_rate: parseFloat(winRate.toFixed(2)),
      empty_rate: parseFloat(emptyRate.toFixed(2)),
      low_stock_prizes: lowStockPrizes,
      generated_at: new Date().toISOString()
    }
  }
}

module.exports = RealtimeService
