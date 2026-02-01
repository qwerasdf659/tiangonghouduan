'use strict'

/**
 * @file 报表生成服务（Report Service）
 * @description 提供抽奖系统的运营日报和报表生成功能
 *
 * 拆分自原 LotteryAnalyticsService.js
 * 包含日报生成、活动报告、同比环比计算等功能
 *
 * 核心功能：
 * 1. generateDailyReport() - 生成运营日报
 * 2. getCampaignROI() - 获取活动ROI聚合数据
 *
 * @module services/lottery-analytics/ReportService
 * @version 1.0.0
 * @date 2026-01-31
 */

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger

/**
 * 报表生成服务
 * 提供抽奖系统的运营日报和报表生成功能
 *
 * @class ReportService
 */
class ReportService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.logger = logger
  }

  /**
   * 生成运营日报数据
   *
   * P2 需求：运营日报聚合 API
   * 遵循项目规范：所有数据查询和业务计算逻辑在 Service 层封装
   *
   * @param {string} reportDate - 报告日期 (YYYY-MM-DD)，默认昨日
   * @param {number|null} campaignId - 活动 ID，不传则汇总所有活动
   * @returns {Promise<Object>} 运营日报数据
   */
  async generateDailyReport(reportDate, campaignId = null) {
    this.logger.info('生成运营日报', { report_date: reportDate, lottery_campaign_id: campaignId })

    try {
      // 1. 解析报告日期（北京时间）
      const {
        startTime,
        endTime,
        yesterdayStart,
        yesterdayEnd,
        lastWeekStart,
        lastWeekEnd,
        displayDate
      } = this._parseDailyReportDateRange(reportDate)

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
        campaignId
          ? Promise.resolve([])
          : this._getDailyReportCampaignsBreakdown(startTime, endTime)
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
        lottery_campaign_id: campaignId,
        total_draws: summary.total_draws,
        alerts_count: alerts.length
      })

      return response
    } catch (error) {
      this.logger.error('生成运营日报失败', {
        report_date: reportDate,
        lottery_campaign_id: campaignId,
        error: error.message
      })
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
    const lastWeekEnd = new Date(
      targetDate.getTime() - 7 * 24 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1
    )

    // 格式化显示日期
    const displayDate = new Date(targetDate.getTime() + beijingOffset).toISOString().split('T')[0]

    return {
      startTime,
      endTime,
      yesterdayStart,
      yesterdayEnd,
      lastWeekStart,
      lastWeekEnd,
      displayDate
    }
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
    if (campaignId) whereClause.lottery_campaign_id = campaignId

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
      attributes: ['lottery_draw_id', 'user_id', 'cost_points', 'lottery_prize_id', 'reward_tier'],
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
      if (d.lottery_prize_id && d.prize?.cost_points) {
        totalCost += parseFloat(d.prize.cost_points)
      }
    })
    const totalRevenue = draws.reduce((sum, d) => sum + (parseFloat(d.cost_points) || 0), 0)
    const profit = totalRevenue - totalCost
    const roi = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

    // 计算用户数
    const userIds = new Set(draws.map(d => d.user_id))
    const activeUsers = userIds.size

    // 新用户统计查询
    let newUsers = 0
    try {
      const { QueryTypes } = require('sequelize')
      const [newUserResult] = await this.models.sequelize.query(
        `SELECT COUNT(DISTINCT ld.user_id) as new_users
         FROM lottery_draws ld
         INNER JOIN (
           SELECT user_id, MIN(created_at) as first_draw_time
           FROM lottery_draws
           GROUP BY user_id
         ) first_draws ON ld.user_id = first_draws.user_id 
                       AND ld.created_at = first_draws.first_draw_time
         WHERE ld.created_at BETWEEN :startTime AND :endTime`,
        {
          replacements: { startTime, endTime },
          type: QueryTypes.SELECT
        }
      )
      newUsers = parseInt(newUserResult?.new_users || 0, 10)
    } catch (error) {
      this.logger.warn('新用户统计查询失败，使用默认值0', { error: error.message })
    }

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
    if (campaignId) whereClause.lottery_campaign_id = campaignId

    const hourlyData = await this.models.LotteryDraw.findAll({
      attributes: [
        [literal("HOUR(CONVERT_TZ(created_at, '+00:00', '+08:00'))"), 'hour'],
        [fn('COUNT', col('lottery_draw_id')), 'draws'],
        [
          fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
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
    if (campaignId) whereClause.lottery_campaign_id = campaignId

    const tierData = await this.models.LotteryDraw.findAll({
      attributes: [
        'reward_tier',
        [fn('COUNT', col('lottery_draw_id')), 'count'],
        [fn('SUM', col('cost_points')), 'cost']
      ],
      where: whereClause,
      group: ['reward_tier'],
      raw: true
    })

    return tierData.map(t => ({
      tier: t.reward_tier || 'unknown',
      count: parseInt(t.count || 0),
      cost: parseFloat(t.cost || 0)
    }))
  }

  /**
   * 获取热门奖品统计（内部方法）
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @param {number} limit - 返回数量
   * @returns {Promise<Array>} 热门奖品数组
   */
  async _getDailyReportTopPrizes(startTime, endTime, limit = 10) {
    const prizeData = await this.models.LotteryDraw.findAll({
      attributes: [
        'lottery_prize_id',
        [fn('COUNT', col('lottery_draw_id')), 'win_count'],
        [fn('SUM', col('prize_value_points')), 'total_value']
      ],
      where: {
        created_at: { [Op.between]: [startTime, endTime] },
        lottery_prize_id: { [Op.ne]: null }
      },
      include: [
        {
          model: this.models.LotteryPrize,
          as: 'prize',
          attributes: ['prize_name', 'reward_tier', 'cost_points']
        }
      ],
      group: ['lottery_prize_id'],
      order: [[literal('win_count'), 'DESC']],
      limit,
      raw: false
    })

    return prizeData.map(p => ({
      lottery_prize_id: p.lottery_prize_id,
      prize_name: p.prize?.prize_name || '未知奖品',
      reward_tier: p.prize?.reward_tier || 'unknown',
      win_count: parseInt(p.dataValues.win_count || 0),
      total_value: parseInt(p.dataValues.total_value || 0),
      cost_points: p.prize?.cost_points || 0
    }))
  }

  /**
   * 获取各活动分布数据（内部方法）
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Promise<Array>} 活动分布数组
   */
  async _getDailyReportCampaignsBreakdown(startTime, endTime) {
    const campaignData = await this.models.LotteryDraw.findAll({
      attributes: [
        'lottery_campaign_id',
        [fn('COUNT', col('lottery_draw_id')), 'draws'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'users'],
        [
          fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
          'wins'
        ]
      ],
      where: {
        created_at: { [Op.between]: [startTime, endTime] }
      },
      include: [
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_name', 'status']
        }
      ],
      group: ['lottery_campaign_id'],
      order: [[literal('draws'), 'DESC']],
      raw: false
    })

    return campaignData.map(c => ({
      lottery_campaign_id: c.lottery_campaign_id,
      campaign_name: c.campaign?.campaign_name || '未知活动',
      status: c.campaign?.status || 'unknown',
      draws: parseInt(c.dataValues.draws || 0),
      users: parseInt(c.dataValues.users || 0),
      wins: parseInt(c.dataValues.wins || 0),
      win_rate:
        c.dataValues.draws > 0
          ? parseFloat(((c.dataValues.wins / c.dataValues.draws) * 100).toFixed(1))
          : 0
    }))
  }

  /**
   * 生成日报告警（内部方法）
   * @private
   * @param {Object} summary - 统计汇总数据
   * @param {Array} tierBreakdown - 档位分布
   * @param {number|null} campaignId - 活动 ID
   * @returns {Promise<Array>} 告警列表
   */
  async _generateDailyReportAlerts(summary, tierBreakdown, campaignId) {
    const alerts = []

    // 1. ROI 低于阈值告警
    if (summary.roi < 30) {
      alerts.push({
        level: 'danger',
        type: 'roi_low',
        message: `日报 ROI 偏低 (${summary.roi}%)，低于 30% 安全线`,
        suggestion: '建议检查奖品成本配置或调整中奖概率'
      })
    } else if (summary.roi < 50) {
      alerts.push({
        level: 'warning',
        type: 'roi_warning',
        message: `日报 ROI 较低 (${summary.roi}%)，接近警戒线`,
        suggestion: '建议关注成本趋势'
      })
    }

    // 2. 中奖率异常告警
    if (summary.win_rate > 90) {
      alerts.push({
        level: 'warning',
        type: 'win_rate_high',
        message: `中奖率过高 (${summary.win_rate}%)`,
        suggestion: '建议检查概率配置是否异常'
      })
    } else if (summary.win_rate < 50) {
      alerts.push({
        level: 'info',
        type: 'win_rate_low',
        message: `中奖率偏低 (${summary.win_rate}%)`,
        suggestion: '建议检查体验机制配置'
      })
    }

    // 3. 低库存奖品告警
    const lowStockPrizes = await this._checkLowStockPrizes(campaignId)
    if (lowStockPrizes.length > 0) {
      alerts.push({
        level: 'warning',
        type: 'stock_low',
        message: `${lowStockPrizes.length} 个奖品库存偏低`,
        value: lowStockPrizes.length,
        details: lowStockPrizes
      })
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
   * 获取活动 ROI 聚合数据
   *
   * ROI 计算公式：(总收入 - 总成本) / 总收入 * 100
   * - 总收入：用户消耗的积分总额（lottery_draws.cost_points）
   * - 总成本：发放的奖品成本总额（lottery_prizes.cost_points）
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {string} [options.start_time] - 开始时间（ISO8601）
   * @param {string} [options.end_time] - 结束时间（ISO8601）
   * @returns {Promise<Object>} 活动 ROI 聚合数据
   */
  async getCampaignROI(lottery_campaign_id, options = {}) {
    const { start_time, end_time } = options

    this.logger.info('获取活动ROI数据', { lottery_campaign_id, start_time, end_time })

    try {
      // 获取活动信息
      const campaign = await this.models.LotteryCampaign.findByPk(lottery_campaign_id, {
        attributes: [
          'lottery_campaign_id',
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
      const whereClause = { lottery_campaign_id }
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
              'lottery_prize_id',
              'prize_name',
              'cost_points',
              'prize_value_points',
              'reward_tier'
            ],
            required: false
          }
        ]
      })

      // 计算总成本和各档位成本
      let totalCost = 0
      const tierCostBreakdown = { high: 0, mid: 0, low: 0, fallback: 0 }

      draws.forEach(d => {
        const tier = d.reward_tier || 'fallback'
        const costValue = d.prize?.cost_points || 0

        if (d.lottery_prize_id && costValue > 0) {
          totalCost += costValue

          if (Object.prototype.hasOwnProperty.call(tierCostBreakdown, tier)) {
            tierCostBreakdown[tier] += costValue
          }
        }
      })

      // 计算总收入
      const totalRevenue = draws.reduce((sum, d) => sum + (parseInt(d.cost_points) || 0), 0)

      // 计算 ROI
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
        lottery_campaign_id,
        campaign_name: campaign.campaign_name,
        time_range: {
          start_time: start_time || campaign.start_time,
          end_time: end_time || campaign.end_time || new Date().toISOString()
        },
        roi: parseFloat(roi.toFixed(1)),
        total_cost: totalCost,
        total_revenue: totalRevenue,
        profit,
        unique_users: uniqueUsers,
        total_draws: draws.length,
        avg_draws_per_user: parseFloat(avgDrawsPerUser.toFixed(2)),
        repeat_users: repeatUsers,
        repeat_rate: parseFloat(repeatRate.toFixed(1)),
        tier_cost_breakdown: tierCostBreakdown
      }

      this.logger.info('获取活动ROI数据成功', {
        lottery_campaign_id,
        roi: roiData.roi,
        unique_users: uniqueUsers,
        total_draws: draws.length
      })

      return roiData
    } catch (error) {
      this.logger.error('获取活动ROI数据失败', { lottery_campaign_id, error: error.message })
      throw error
    }
  }
}

module.exports = ReportService
