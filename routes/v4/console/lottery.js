/**
 * 抽奖分析Dashboard路由（Lottery Dashboard）
 *
 * @route /api/v4/console/lottery
 * @description 为运营仪表盘"抽奖分析"模块提供数据接口
 *
 * 📌 模块说明：
 * - 此模块属于 console 域，仅限 admin（role_level >= 100）访问
 * - 提供抽奖分析所需的统计、趋势、分布、排行等聚合数据
 *
 * API列表：
 * - GET /stats - 抽奖统计数据（总抽奖次数、中奖次数、中奖率、奖品价值）
 * - GET /trend - 抽奖趋势数据（按时间范围的趋势图表数据）
 * - GET /prize-distribution - 奖品分布数据（各类型奖品的分布占比）
 * - GET /campaign-ranking - 活动排行数据（按抽奖次数/中奖率排序的活动列表）
 *
 * 创建时间：2026年02月04日
 * 需求来源：运营仪表盘-抽奖分析页面 E2E 测试发现 API 缺失
 *
 * @module routes/v4/console/lottery
 */

'use strict'

const express = require('express')
const router = express.Router()
const { Op, fn, col, literal } = require('sequelize')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 获取时间范围的起止时间（北京时间）
 * @param {string} range - 时间范围（7d/30d/90d）
 * @returns {Object} { start_time, end_time }
 */
function getTimeRange(range = '7d') {
  const now = new Date()
  const days = parseInt(range) || 7
  const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  return {
    start_time: startTime,
    end_time: now
  }
}

/**
 * @route GET /api/v4/console/lottery/stats
 * @desc 获取抽奖统计数据（总抽奖次数、中奖次数、中奖率、奖品总价值）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [range=7d] - 统计时间范围（7d/30d/90d）
 *
 * @returns {Object} 抽奖统计数据
 * @returns {number} data.total_draws - 总抽奖次数
 * @returns {number} data.total_wins - 中奖次数（high/mid/low档位）
 * @returns {number} data.win_rate - 中奖率（百分比）
 * @returns {number} data.total_prize_value - 奖品总价值（积分）
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/lottery/stats?range=7d
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "total_draws": 32000,
 *     "total_wins": 4722,
 *     "win_rate": 14.8,
 *     "total_prize_value": 141000,
 *     "updated_at": "2026-02-04T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { range = '7d' } = req.query
    const { start_time, end_time } = getTimeRange(range)

    logger.info('[抽奖分析] 获取抽奖统计数据', {
      admin_id: req.user.user_id,
      range
    })

    const { LotteryDraw } = req.app.locals.models

    // 查询抽奖统计
    const stats = await LotteryDraw.findAll({
      attributes: [
        [fn('COUNT', col('lottery_draw_id')), 'total_draws'],
        [
          fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
          'total_wins'
        ],
        [fn('SUM', col('prize_value_points')), 'total_prize_value']
      ],
      where: {
        created_at: { [Op.between]: [start_time, end_time] }
      },
      raw: true
    })

    const result = stats[0] || {}
    const totalDraws = parseInt(result.total_draws || 0)
    const totalWins = parseInt(result.total_wins || 0)
    const winRate = totalDraws > 0 ? parseFloat(((totalWins / totalDraws) * 100).toFixed(1)) : 0
    const totalPrizeValue = parseInt(result.total_prize_value || 0)

    return res.apiSuccess(
      {
        total_draws: totalDraws,
        total_wins: totalWins,
        win_rate: winRate,
        total_prize_value: totalPrizeValue,
        updated_at: BeijingTimeHelper.apiTimestamp()
      },
      '获取成功'
    )
  } catch (error) {
    logger.error('[抽奖分析] 获取抽奖统计失败', { error: error.message })
    return handleServiceError(error, res, '获取抽奖统计失败')
  }
})

/**
 * @route GET /api/v4/console/lottery/trend
 * @desc 获取抽奖趋势数据（按天/小时的抽奖次数和中奖率趋势）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [range=7d] - 统计时间范围（7d/30d/90d）
 * @query {string} [granularity=day] - 数据粒度（hour/day）
 *
 * @returns {Object} 抽奖趋势数据
 * @returns {Array} data.trend - 趋势数据数组
 * @returns {string} data.trend[].date - 日期/时间
 * @returns {number} data.trend[].draws - 抽奖次数
 * @returns {number} data.trend[].wins - 中奖次数
 * @returns {number} data.trend[].win_rate - 中奖率
 *
 * @example
 * GET /api/v4/console/lottery/trend?range=7d&granularity=day
 */
router.get('/trend', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { range = '7d', granularity = 'day' } = req.query
    const { start_time, end_time } = getTimeRange(range)

    logger.info('[抽奖分析] 获取抽奖趋势数据', {
      admin_id: req.user.user_id,
      range,
      granularity
    })

    const { LotteryDraw } = req.app.locals.models

    // 根据粒度构建分组条件（北京时间）
    const dateFormat =
      granularity === 'hour'
        ? "DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:00')"
        : "DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d')"

    const trendData = await LotteryDraw.findAll({
      attributes: [
        [literal(dateFormat), 'date'],
        [fn('COUNT', col('lottery_draw_id')), 'draws'],
        [
          fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
          'wins'
        ]
      ],
      where: {
        created_at: { [Op.between]: [start_time, end_time] }
      },
      group: [literal(dateFormat)],
      order: [[literal('date'), 'ASC']],
      raw: true
    })

    // 计算中奖率
    const trend = trendData.map(item => ({
      date: item.date,
      draws: parseInt(item.draws || 0),
      wins: parseInt(item.wins || 0),
      win_rate:
        parseInt(item.draws) > 0
          ? parseFloat(((parseInt(item.wins) / parseInt(item.draws)) * 100).toFixed(1))
          : 0
    }))

    return res.apiSuccess(
      {
        trend,
        range,
        granularity,
        updated_at: BeijingTimeHelper.apiTimestamp()
      },
      '获取成功'
    )
  } catch (error) {
    logger.error('[抽奖分析] 获取抽奖趋势失败', { error: error.message })
    return handleServiceError(error, res, '获取抽奖趋势失败')
  }
})

/**
 * @route GET /api/v4/console/lottery/prize-distribution
 * @desc 获取奖品分布数据（各档位奖品的分布占比）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [range=7d] - 统计时间范围（7d/30d/90d）
 *
 * @returns {Object} 奖品分布数据
 * @returns {Array} data.distribution - 分布数据数组
 * @returns {string} data.distribution[].tier - 奖品档位（high/mid/low/fallback）
 * @returns {string} data.distribution[].tier_name - 档位名称
 * @returns {number} data.distribution[].count - 数量
 * @returns {number} data.distribution[].percentage - 占比
 * @returns {number} data.distribution[].value - 总价值
 *
 * @example
 * GET /api/v4/console/lottery/prize-distribution?range=7d
 */
router.get('/prize-distribution', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { range = '7d' } = req.query
    const { start_time, end_time } = getTimeRange(range)

    logger.info('[抽奖分析] 获取奖品分布数据', {
      admin_id: req.user.user_id,
      range
    })

    const { LotteryDraw } = req.app.locals.models

    // 按档位分组统计
    const distributionData = await LotteryDraw.findAll({
      attributes: [
        'reward_tier',
        [fn('COUNT', col('lottery_draw_id')), 'count'],
        [fn('SUM', col('prize_value_points')), 'value']
      ],
      where: {
        created_at: { [Op.between]: [start_time, end_time] }
      },
      group: ['reward_tier'],
      raw: true
    })

    // 计算总数用于计算占比
    const totalCount = distributionData.reduce((sum, item) => sum + parseInt(item.count || 0), 0)

    // 档位名称映射
    const tierNames = {
      high: '高级奖品',
      mid: '中级奖品',
      low: '低级奖品',
      fallback: '保底奖品',
      unknown: '未知'
    }

    const distribution = distributionData.map(item => ({
      tier: item.reward_tier || 'unknown',
      tier_name: tierNames[item.reward_tier] || '未知',
      count: parseInt(item.count || 0),
      percentage:
        totalCount > 0
          ? parseFloat(((parseInt(item.count || 0) / totalCount) * 100).toFixed(1))
          : 0,
      value: parseInt(item.value || 0)
    }))

    // 按count降序排列
    distribution.sort((a, b) => b.count - a.count)

    return res.apiSuccess(
      {
        distribution,
        total_count: totalCount,
        range,
        updated_at: BeijingTimeHelper.apiTimestamp()
      },
      '获取成功'
    )
  } catch (error) {
    logger.error('[抽奖分析] 获取奖品分布失败', { error: error.message })
    return handleServiceError(error, res, '获取奖品分布失败')
  }
})

/**
 * @route GET /api/v4/console/lottery/campaign-ranking
 * @desc 获取活动排行数据（按抽奖次数排序的活动列表）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [range=7d] - 统计时间范围（7d/30d/90d）
 * @query {string} [sort_by=draws] - 排序字段（draws/wins/win_rate）
 * @query {number} [limit=10] - 返回数量
 *
 * @returns {Object} 活动排行数据
 * @returns {Array} data.ranking - 排行数据数组
 * @returns {number} data.ranking[].lottery_campaign_id - 活动ID
 * @returns {string} data.ranking[].campaign_name - 活动名称
 * @returns {string} data.ranking[].status - 活动状态
 * @returns {number} data.ranking[].draws - 抽奖次数
 * @returns {number} data.ranking[].wins - 中奖次数
 * @returns {number} data.ranking[].win_rate - 中奖率
 * @returns {number} data.ranking[].users - 参与用户数
 *
 * @example
 * GET /api/v4/console/lottery/campaign-ranking?range=7d&limit=10
 */
router.get('/campaign-ranking', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { range = '7d', sort_by = 'draws', limit = 10 } = req.query
    const { start_time, end_time } = getTimeRange(range)

    logger.info('[抽奖分析] 获取活动排行数据', {
      admin_id: req.user.user_id,
      range,
      sort_by,
      limit
    })

    const { LotteryDraw, LotteryCampaign } = req.app.locals.models

    // 按活动分组统计
    const rankingData = await LotteryDraw.findAll({
      attributes: [
        'lottery_campaign_id',
        [fn('COUNT', col('lottery_draw_id')), 'draws'],
        [
          fn('SUM', literal("CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END")),
          'wins'
        ],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'users']
      ],
      where: {
        created_at: { [Op.between]: [start_time, end_time] }
      },
      include: [
        {
          model: LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_name', 'status'],
          required: false
        }
      ],
      group: ['lottery_campaign_id'],
      order: [[literal(sort_by === 'wins' ? 'wins' : 'draws'), 'DESC']],
      limit: parseInt(limit),
      raw: false
    })

    const ranking = rankingData.map((item, index) => {
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
    })

    return res.apiSuccess(
      {
        ranking,
        range,
        sort_by,
        updated_at: BeijingTimeHelper.apiTimestamp()
      },
      '获取成功'
    )
  } catch (error) {
    logger.error('[抽奖分析] 获取活动排行失败', { error: error.message })
    return handleServiceError(error, res, '获取活动排行失败')
  }
})

module.exports = router
