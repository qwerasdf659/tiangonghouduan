/**
 * 数据分析模块
 *
 * @description 数据分析相关路由，包括决策分析、统计报表、趋势分析等
 * @version 4.0.0
 * @date 2025-09-24
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler,
  models,
  BeijingTimeHelper,
  Op
} = require('./shared/middleware')

/**
 * GET /decisions/analytics - 获取决策分析数据
 *
 * @description 获取抽奖引擎的决策分析数据和统计信息
 * @route GET /api/v4/unified-engine/admin/analytics/decisions/analytics
 * @access Private (需要管理员权限)
 */
router.get('/decisions/analytics', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { days = 7, strategy_filter, user_filter } = req.query

    // 参数验证
    const dayCount = Math.min(Math.max(parseInt(days) || 7, 1), 90) // 限制1-90天

    // 计算时间范围
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - dayCount * 24 * 60 * 60 * 1000)

    // 构建查询条件
    const whereClause = {
      created_at: {
        [Op.gte]: startDate,
        [Op.lte]: endDate
      }
    }

    if (strategy_filter) {
      whereClause.strategy_used = strategy_filter
    }

    if (user_filter) {
      whereClause.user_id = parseInt(user_filter)
    }

    // 并行获取统计数据
    const [
      totalDraws,
      winningDraws,
      strategiesStats,
      dailyStats,
      userDistribution,
      winRateByStrategy
    ] = await Promise.all([
      // 总抽奖次数
      models.LotteryDraw.count({ where: whereClause }),

      // 中奖次数
      models.LotteryDraw.count({
        where: { ...whereClause, is_winner: true }
      }),

      // 按策略统计
      models.LotteryDraw.findAll({
        where: whereClause,
        attributes: [
          'strategy_used',
          [models.sequelize.fn('COUNT', '*'), 'count'],
          [models.sequelize.fn('SUM', models.sequelize.literal('CASE WHEN is_winner THEN 1 ELSE 0 END')), 'wins']
        ],
        group: ['strategy_used'],
        raw: true
      }),

      // 按日期统计
      models.LotteryDraw.findAll({
        where: whereClause,
        attributes: [
          [models.sequelize.fn('DATE', models.sequelize.col('created_at')), 'date'],
          [models.sequelize.fn('COUNT', '*'), 'draws'],
          [models.sequelize.fn('SUM', models.sequelize.literal('CASE WHEN is_winner THEN 1 ELSE 0 END')), 'wins']
        ],
        group: [models.sequelize.fn('DATE', models.sequelize.col('created_at'))],
        order: [[models.sequelize.fn('DATE', models.sequelize.col('created_at')), 'ASC']],
        raw: true
      }),

      // 用户分布统计
      models.LotteryDraw.findAll({
        where: whereClause,
        attributes: [
          'user_id',
          [models.sequelize.fn('COUNT', '*'), 'draws'],
          [models.sequelize.fn('SUM', models.sequelize.literal('CASE WHEN is_winner THEN 1 ELSE 0 END')), 'wins']
        ],
        group: ['user_id'],
        order: [[models.sequelize.fn('COUNT', '*'), 'DESC']],
        limit: 20,
        raw: true
      }),

      // 按策略的中奖率分析
      models.LotteryDraw.findAll({
        where: whereClause,
        attributes: [
          'strategy_used',
          [models.sequelize.fn('AVG', models.sequelize.col('win_probability')), 'avg_probability'],
          [models.sequelize.fn('COUNT', '*'), 'total_draws'],
          [models.sequelize.fn('SUM', models.sequelize.literal('CASE WHEN is_winner THEN 1 ELSE 0 END')), 'actual_wins']
        ],
        group: ['strategy_used'],
        raw: true
      })
    ])

    // 计算整体统计
    const overallWinRate = totalDraws > 0 ? ((winningDraws / totalDraws) * 100).toFixed(2) : 0

    // 处理策略统计数据
    const processedStrategiesStats = strategiesStats.map(stat => ({
      strategy: stat.strategy_used || 'unknown',
      total_draws: parseInt(stat.count),
      wins: parseInt(stat.wins),
      win_rate: stat.count > 0 ? ((stat.wins / stat.count) * 100).toFixed(2) : 0
    }))

    // 处理每日统计数据
    const processedDailyStats = dailyStats.map(stat => ({
      date: stat.date,
      draws: parseInt(stat.draws),
      wins: parseInt(stat.wins),
      win_rate: stat.draws > 0 ? ((stat.wins / stat.draws) * 100).toFixed(2) : 0
    }))

    // 处理用户分布数据
    const processedUserDistribution = userDistribution.map(stat => ({
      user_id: stat.user_id,
      draws: parseInt(stat.draws),
      wins: parseInt(stat.wins),
      personal_win_rate: stat.draws > 0 ? ((stat.wins / stat.draws) * 100).toFixed(2) : 0
    }))

    // 处理策略效率分析
    const processedWinRateAnalysis = winRateByStrategy.map(stat => ({
      strategy: stat.strategy_used || 'unknown',
      expected_probability: parseFloat(stat.avg_probability || 0).toFixed(4),
      actual_win_rate: stat.total_draws > 0 ? ((stat.actual_wins / stat.total_draws) * 100).toFixed(2) : 0,
      efficiency: stat.avg_probability > 0
        ? ((stat.actual_wins / stat.total_draws) / stat.avg_probability * 100).toFixed(2)
        : 0,
      total_draws: parseInt(stat.total_draws),
      actual_wins: parseInt(stat.actual_wins)
    }))

    // 获取引擎性能统计
    let enginePerformanceStats = {}
    try {
      if (sharedComponents.performanceMonitor.getAnalyticsData) {
        enginePerformanceStats = sharedComponents.performanceMonitor.getAnalyticsData()
      }
    } catch (error) {
      sharedComponents.logger.warn('获取引擎性能统计失败', { error: error.message })
    }

    const analyticsData = {
      period: {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        days: dayCount
      },
      overview: {
        total_draws: totalDraws,
        winning_draws: winningDraws,
        overall_win_rate: overallWinRate,
        average_daily_draws: dayCount > 0 ? Math.round(totalDraws / dayCount) : 0
      },
      strategies: {
        distribution: processedStrategiesStats,
        efficiency_analysis: processedWinRateAnalysis
      },
      trends: {
        daily_stats: processedDailyStats
      },
      users: {
        top_users: processedUserDistribution,
        total_active_users: userDistribution.length
      },
      engine_performance: enginePerformanceStats,
      generated_at: BeijingTimeHelper.getCurrentTime()
    }

    sharedComponents.logger.info('决策分析数据生成成功', {
      period_days: dayCount,
      total_draws: totalDraws,
      admin_id: req.user?.id
    })

    return res.apiSuccess(analyticsData, '决策分析数据获取成功')
  } catch (error) {
    sharedComponents.logger.error('决策分析数据获取失败', { error: error.message })
    return res.apiInternalError('决策分析数据获取失败', error.message, 'ANALYTICS_ERROR')
  }
}))

/**
 * GET /lottery/trends - 获取抽奖趋势分析
 *
 * @description 获取抽奖活动的趋势分析数据
 * @route GET /api/v4/unified-engine/admin/analytics/lottery/trends
 * @access Private (需要管理员权限)
 */
router.get('/lottery/trends', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { period = 'week', granularity = 'daily' } = req.query

    // 计算时间范围
    let days = 7
    switch (period) {
    case 'day':
      days = 1
      break
    case 'week':
      days = 7
      break
    case 'month':
      days = 30
      break
    case 'quarter':
      days = 90
      break
    default:
      days = 7
    }

    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)

    // 设置聚合粒度
    let dateFormat = '%Y-%m-%d'

    if (granularity === 'hourly' && days <= 3) {
      dateFormat = '%Y-%m-%d %H:00:00'
    }

    // 获取趋势数据
    const [lotteryTrends, userTrends, prizeTrends] = await Promise.all([
      // 抽奖活动趋势
      models.LotteryDraw.findAll({
        where: {
          created_at: {
            [Op.gte]: startDate,
            [Op.lte]: endDate
          }
        },
        attributes: [
          [models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat), 'period'],
          [models.sequelize.fn('COUNT', '*'), 'total_draws'],
          [models.sequelize.fn('SUM', models.sequelize.literal('CASE WHEN is_winner THEN 1 ELSE 0 END')), 'wins'],
          [models.sequelize.fn('COUNT', models.sequelize.fn('DISTINCT', models.sequelize.col('user_id'))), 'unique_users']
        ],
        group: [models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat)],
        order: [[models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat), 'ASC']],
        raw: true
      }),

      // 用户活跃度趋势
      models.User.findAll({
        where: {
          last_login_at: {
            [Op.gte]: startDate,
            [Op.lte]: endDate
          }
        },
        attributes: [
          [models.sequelize.fn('DATE_FORMAT', models.sequelize.col('last_login_at'), dateFormat), 'period'],
          [models.sequelize.fn('COUNT', '*'), 'active_users'],
          [models.sequelize.fn('COUNT', models.sequelize.literal('CASE WHEN is_admin THEN 1 END')), 'admin_users']
        ],
        group: [models.sequelize.fn('DATE_FORMAT', models.sequelize.col('last_login_at'), dateFormat)],
        order: [[models.sequelize.fn('DATE_FORMAT', models.sequelize.col('last_login_at'), dateFormat), 'ASC']],
        raw: true
      }),

      // 奖品发放趋势（如果有Prize模型）
      models.Prize
        ? models.Prize.findAll({
          where: {
            created_at: {
              [Op.gte]: startDate,
              [Op.lte]: endDate
            }
          },
          attributes: [
            [models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat), 'period'],
            [models.sequelize.fn('COUNT', '*'), 'prizes_added'],
            [models.sequelize.fn('SUM', models.sequelize.col('quantity')), 'total_quantity']
          ],
          group: [models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat)],
          order: [[models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat), 'ASC']],
          raw: true
        })
        : Promise.resolve([])
    ])

    // 处理数据
    const processedLotteryTrends = lotteryTrends.map(trend => ({
      period: trend.period,
      total_draws: parseInt(trend.total_draws),
      wins: parseInt(trend.wins),
      unique_users: parseInt(trend.unique_users),
      win_rate: trend.total_draws > 0 ? ((trend.wins / trend.total_draws) * 100).toFixed(2) : 0
    }))

    const processedUserTrends = userTrends.map(trend => ({
      period: trend.period,
      active_users: parseInt(trend.active_users),
      admin_users: parseInt(trend.admin_users || 0)
    }))

    const processedPrizeTrends = prizeTrends.map(trend => ({
      period: trend.period,
      prizes_added: parseInt(trend.prizes_added),
      total_quantity: parseInt(trend.total_quantity)
    }))

    const trendsData = {
      period: {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        granularity,
        days
      },
      lottery_activity: processedLotteryTrends,
      user_activity: processedUserTrends,
      prize_activity: processedPrizeTrends,
      summary: {
        total_periods: processedLotteryTrends.length,
        peak_draws: Math.max(...processedLotteryTrends.map(t => t.total_draws), 0),
        peak_users: Math.max(...processedUserTrends.map(t => t.active_users), 0),
        average_win_rate: processedLotteryTrends.length > 0
          ? (processedLotteryTrends.reduce((sum, t) => sum + parseFloat(t.win_rate), 0) / processedLotteryTrends.length).toFixed(2)
          : 0
      },
      generated_at: BeijingTimeHelper.getCurrentTime()
    }

    return res.apiSuccess(trendsData, '趋势分析数据获取成功')
  } catch (error) {
    sharedComponents.logger.error('趋势分析数据获取失败', { error: error.message })
    return res.apiInternalError('趋势分析数据获取失败', error.message, 'TRENDS_ANALYTICS_ERROR')
  }
}))

/**
 * GET /performance/report - 获取系统性能报告
 *
 * @description 获取系统性能和引擎运行报告
 * @route GET /api/v4/unified-engine/admin/analytics/performance/report
 * @access Private (需要管理员权限)
 */
router.get('/performance/report', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    // 获取引擎性能监控数据
    let performanceData = {}
    try {
      if (sharedComponents.performanceMonitor.getDetailedStats) {
        performanceData = sharedComponents.performanceMonitor.getDetailedStats()
      } else if (sharedComponents.performanceMonitor.getStats) {
        performanceData = sharedComponents.performanceMonitor.getStats()
      }
    } catch (error) {
      sharedComponents.logger.warn('获取性能监控数据失败', { error: error.message })
    }

    // 获取数据库性能指标
    const [dbStats, systemStats] = await Promise.all([
      // 数据库统计
      models.sequelize.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM lottery_draws) as total_lottery_draws,
          (SELECT COUNT(*) FROM lottery_draws WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as draws_last_24h,
          (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as new_users_last_24h
      `, { type: models.sequelize.QueryTypes.SELECT }),

      // 系统统计
      Promise.resolve({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu_usage: require('os').loadavg()[0],
        node_version: process.version,
        platform: process.platform
      })
    ])

    const performanceReport = {
      timestamp: BeijingTimeHelper.getCurrentTime(),
      system: {
        uptime_seconds: systemStats.uptime,
        uptime_formatted: formatUptime(systemStats.uptime),
        memory: {
          rss: Math.round(systemStats.memory.rss / 1024 / 1024) + ' MB',
          heap_used: Math.round(systemStats.memory.heapUsed / 1024 / 1024) + ' MB',
          heap_total: Math.round(systemStats.memory.heapTotal / 1024 / 1024) + ' MB',
          external: Math.round(systemStats.memory.external / 1024 / 1024) + ' MB'
        },
        cpu_load: systemStats.cpu_usage,
        node_version: systemStats.node_version,
        platform: systemStats.platform
      },
      database: {
        total_users: dbStats[0]?.total_users || 0,
        total_lottery_draws: dbStats[0]?.total_lottery_draws || 0,
        activity_last_24h: {
          new_draws: dbStats[0]?.draws_last_24h || 0,
          new_users: dbStats[0]?.new_users_last_24h || 0
        }
      },
      lottery_engine: performanceData,
      health_indicators: {
        database_responsive: true, // 如果能查询就说明响应
        engine_initialized: !!sharedComponents.lotteryEngine,
        monitor_active: !!sharedComponents.performanceMonitor,
        memory_healthy: systemStats.memory.heapUsed / systemStats.memory.heapTotal < 0.9
      }
    }

    return res.apiSuccess(performanceReport, '性能报告获取成功')
  } catch (error) {
    sharedComponents.logger.error('性能报告获取失败', { error: error.message })
    return res.apiInternalError('性能报告获取失败', error.message, 'PERFORMANCE_REPORT_ERROR')
  }
}))

/**
 * 格式化运行时间
 * @param {number} uptimeSeconds 运行时间（秒）
 * @returns {string} 格式化的时间字符串
 */
function formatUptime (uptimeSeconds) {
  const days = Math.floor(uptimeSeconds / (24 * 60 * 60))
  const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60))
  const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60)
  const seconds = Math.floor(uptimeSeconds % 60)

  return `${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`
}

module.exports = router
