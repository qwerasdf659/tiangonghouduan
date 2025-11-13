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
 * @route GET /api/v4/admin/analytics/decisions/analytics
 * @access Private (需要管理员权限)
 */
router.get(
  '/decisions/analytics',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { days = 7, user_filter } = req.query

      // 参数验证
      const dayCount = Math.min(Math.max(parseInt(days) || 7, 1), 90) // 限制1-90天

      // 计算时间范围
      const endDate = BeijingTimeHelper.createBeijingTime()
      const startDate = new Date(endDate.getTime() - dayCount * 24 * 60 * 60 * 1000)

      // 构建查询条件
      const whereClause = {
        created_at: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      }

      /*
       * ✅ P0-1修复: 移除strategy_used字段使用（字段不存在）
       * strategy_filter功能已移除，因为数据库中无strategy_used字段
       * 如需策略分析，可使用draw_type字段作为简化维度
       */

      if (user_filter) {
        whereClause.user_id = parseInt(user_filter)
      }

      // 并行获取统计数据
      const [
        totalDraws,
        winningDraws,
        _strategiesStats, // 已移除，保留变量名避免解构错误
        dailyStats,
        userDistribution,
        _winRateByStrategy // 已移除，保留变量名避免解构错误
      ] = await Promise.all([
        // 总抽奖次数
        models.LotteryDraw.count({ where: whereClause }),

        // 中奖次数
        models.LotteryDraw.count({
          where: { ...whereClause, is_winner: true }
        }),

        /*
         * ✅ P0-1修复: 移除strategy_used查询（字段不存在）
         * 返回空数组，保持Promise.all结构不变
         */
        Promise.resolve([]),

        // 按日期统计
        models.LotteryDraw.findAll({
          where: whereClause,
          attributes: [
            [models.sequelize.fn('DATE', models.sequelize.col('created_at')), 'date'],
            [models.sequelize.fn('COUNT', '*'), 'draws'],
            [
              models.sequelize.fn(
                'SUM',
                models.sequelize.literal('CASE WHEN is_winner THEN 1 ELSE 0 END')
              ),
              'wins'
            ]
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
            [
              models.sequelize.fn(
                'SUM',
                models.sequelize.literal('CASE WHEN is_winner THEN 1 ELSE 0 END')
              ),
              'wins'
            ]
          ],
          group: ['user_id'],
          order: [[models.sequelize.fn('COUNT', '*'), 'DESC']],
          limit: 20,
          raw: true
        }),

        /*
         * ✅ P0-1 & P0-2修复: 移除strategy_used和win_probability查询（字段不存在）
         * 返回空数组，保持Promise.all结构不变
         */
        Promise.resolve([])
      ])

      // 计算整体统计
      const overallWinRate = totalDraws > 0 ? ((winningDraws / totalDraws) * 100).toFixed(2) : 0

      // ✅ P0-1修复: strategiesStats已改为空数组，无需处理
      const processedStrategiesStats = []

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

      // ✅ P0-1 & P0-2修复: winRateByStrategy已改为空数组，无需处理
      const processedWinRateAnalysis = []

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
        generated_at: BeijingTimeHelper.now()
      }

      sharedComponents.logger.info('决策分析数据生成成功', {
        period_days: dayCount,
        total_draws: totalDraws,
        admin_id: req.user?.user_id
      })

      return res.apiSuccess(analyticsData, '决策分析数据获取成功')
    } catch (error) {
      sharedComponents.logger.error('决策分析数据获取失败', { error: error.message })
      return res.apiInternalError('决策分析数据获取失败', error.message, 'ANALYTICS_ERROR')
    }
  })
)

/**
 * GET /lottery/trends - 获取抽奖趋势分析
 *
 * @description 获取抽奖活动的趋势分析数据
 * @route GET /api/v4/admin/analytics/lottery/trends
 * @access Private (需要管理员权限)
 */
router.get(
  '/lottery/trends',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
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

      const endDate = BeijingTimeHelper.createBeijingTime()
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
            [
              models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat),
              'period'
            ],
            [models.sequelize.fn('COUNT', '*'), 'total_draws'],
            [
              models.sequelize.fn(
                'SUM',
                models.sequelize.literal('CASE WHEN is_winner THEN 1 ELSE 0 END')
              ),
              'wins'
            ],
            [
              models.sequelize.fn(
                'COUNT',
                models.sequelize.fn('DISTINCT', models.sequelize.col('user_id'))
              ),
              'unique_users'
            ]
          ],
          group: [
            models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat)
          ],
          order: [
            [
              models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat),
              'ASC'
            ]
          ],
          raw: true
        }),

        /*
         * ✅ P0-4修复: last_login_at → last_login (User模型实际字段)
         * ✅ P0-5修复: 移除admin_users统计（需要复杂的roles表JOIN，且非核心功能）
         */
        models.User.findAll({
          where: {
            last_login: {
              [Op.gte]: startDate,
              [Op.lte]: endDate
            }
          },
          attributes: [
            [
              models.sequelize.fn('DATE_FORMAT', models.sequelize.col('last_login'), dateFormat),
              'period'
            ],
            [models.sequelize.fn('COUNT', '*'), 'active_users']
            // admin_users统计已移除（需要复杂的belongsToMany关联）
          ],
          group: [
            models.sequelize.fn('DATE_FORMAT', models.sequelize.col('last_login'), dateFormat)
          ],
          order: [
            [
              models.sequelize.fn('DATE_FORMAT', models.sequelize.col('last_login'), dateFormat),
              'ASC'
            ]
          ],
          raw: true
        }),

        // 奖品发放趋势（使用LotteryPrize模型）
        models.LotteryPrize
          ? models.LotteryPrize.findAll({
            where: {
              created_at: {
                [Op.gte]: startDate,
                [Op.lte]: endDate
              }
            },
            attributes: [
              [
                models.sequelize.fn(
                  'DATE_FORMAT',
                  models.sequelize.col('created_at'),
                  dateFormat
                ),
                'period'
              ],
              [models.sequelize.fn('COUNT', '*'), 'prizes_added'],
              [models.sequelize.fn('SUM', models.sequelize.col('stock_quantity')), 'total_quantity']
            ],
            group: [
              models.sequelize.fn('DATE_FORMAT', models.sequelize.col('created_at'), dateFormat)
            ],
            order: [
              [
                models.sequelize.fn(
                  'DATE_FORMAT',
                  models.sequelize.col('created_at'),
                  dateFormat
                ),
                'ASC'
              ]
            ],
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

      // ✅ P0-5修复: 移除admin_users字段（查询中已删除）
      const processedUserTrends = userTrends.map(trend => ({
        period: trend.period,
        active_users: parseInt(trend.active_users)
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
          average_win_rate:
            processedLotteryTrends.length > 0
              ? (
                processedLotteryTrends.reduce((sum, t) => sum + parseFloat(t.win_rate), 0) /
                  processedLotteryTrends.length
              ).toFixed(2)
              : 0
        },
        generated_at: BeijingTimeHelper.now()
      }

      return res.apiSuccess(trendsData, '趋势分析数据获取成功')
    } catch (error) {
      sharedComponents.logger.error('趋势分析数据获取失败', { error: error.message })
      return res.apiInternalError('趋势分析数据获取失败', error.message, 'TRENDS_ANALYTICS_ERROR')
    }
  })
)

/**
 * GET /performance/report - 获取系统性能报告
 *
 * @description 获取系统性能和引擎运行报告
 * @route GET /api/v4/admin/analytics/performance/report
 * @access Private (需要管理员权限)
 */
router.get(
  '/performance/report',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
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
        models.sequelize.query(
          `
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM lottery_draws) as total_lottery_draws,
          (SELECT COUNT(*) FROM lottery_draws WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as draws_last_24h,
          (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as new_users_last_24h
      `,
          { type: models.sequelize.QueryTypes.SELECT }
        ),

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
        timestamp: BeijingTimeHelper.now(),
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
  })
)

/**
 * GET /stats/today - 获取管理员今日统计数据
 *
 * @description 获取今日系统运营数据统计，包括用户活动、抽奖数据、积分数据等
 * @route GET /api/v4/admin/analytics/stats/today
 * @access Private (需要管理员权限)
 */
router.get(
  '/stats/today',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 获取今日时间范围（北京时间）
      const todayStart = BeijingTimeHelper.todayStart()
      const todayEnd = BeijingTimeHelper.todayEnd()
      const nowBeijing = BeijingTimeHelper.now()

      sharedComponents.logger.info('管理员请求今日统计数据', {
        admin_id: req.user.user_id,
        date_range: { start: todayStart, end: todayEnd }
      })

      // 并行获取各类统计数据
      const [
        // 用户数据
        totalUsers,
        todayNewUsers,
        todayActiveUsers,

        // 抽奖数据
        todayLotteryDraws,
        todayWinningDraws,
        todayTotalPointsConsumed,

        // 积分系统数据
        todayPointsTransactions,
        todayPointsEarned,
        todayPointsSpent,

        // 库存和兑换数据
        todayInventoryItems,
        todayUsedItems,

        // 聊天和客服数据
        todayChatSessions,
        todayMessages,

        // 系统活动数据
        todayLogins,
        todayConsumptions
      ] = await Promise.all([
        // 用户统计
        models.User.count(),
        models.User.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        models.User.count({
          where: {
            last_login: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),

        // 抽奖统计
        models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            },
            is_winner: true
          }
        }),
        // ✅ P0-3修复: points_consumed → cost_points (LotteryDraw模型实际字段)
        models.LotteryDraw.sum('cost_points', {
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }) || 0,

        // 积分交易统计
        models.PointsTransaction.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        models.PointsTransaction.sum('points_amount', {
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            },
            transaction_type: 'earn'
          }
        }) || 0,
        models.PointsTransaction.sum('points_amount', {
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            },
            transaction_type: 'consume'
          }
        }) || 0,

        // 库存统计
        models.UserInventory.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        models.UserInventory.count({
          where: {
            used_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            },
            status: 'used'
          }
        }),

        // 聊天统计
        models.CustomerServiceSession.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        models.ChatMessage.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),

        /*
         * 活动统计（登录会话数）
         * ✅ 修复: login_time → created_at (AuthenticationSession模型实际字段)
         */
        models.AuthenticationSession.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        // 消费记录统计（替代原PhotoUpload）
        models.ConsumptionRecord
          ? models.ConsumptionRecord.count({
            where: {
              created_at: {
                [Op.gte]: todayStart,
                [Op.lte]: todayEnd
              }
            }
          })
          : 0
      ])

      // 计算统计指标
      const winRate =
        todayLotteryDraws > 0 ? ((todayWinningDraws / todayLotteryDraws) * 100).toFixed(2) : 0
      const avgPointsPerDraw =
        todayLotteryDraws > 0 ? (todayTotalPointsConsumed / todayLotteryDraws).toFixed(1) : 0
      const activeUserRate = totalUsers > 0 ? ((todayActiveUsers / totalUsers) * 100).toFixed(2) : 0

      // 构建响应数据
      const todayStats = {
        date: BeijingTimeHelper.formatForAPI(nowBeijing).formatted,
        timestamp: nowBeijing,

        // 用户相关统计
        user_stats: {
          total_users: totalUsers,
          new_users_today: todayNewUsers,
          active_users_today: todayActiveUsers,
          active_rate: parseFloat(activeUserRate),
          total_logins_today: todayLogins
        },

        // 抽奖系统统计
        lottery_stats: {
          draws_today: todayLotteryDraws,
          winning_draws_today: todayWinningDraws,
          win_rate: parseFloat(winRate),
          total_points_consumed: todayTotalPointsConsumed,
          avg_points_per_draw: parseFloat(avgPointsPerDraw)
        },

        // 积分系统统计
        points_stats: {
          transactions_today: todayPointsTransactions,
          points_earned_today: Math.abs(todayPointsEarned),
          points_spent_today: Math.abs(todayPointsSpent),
          net_points_change: todayPointsEarned + todayPointsSpent // spent是负数
        },

        // 库存和物品统计
        inventory_stats: {
          new_items_today: todayInventoryItems,
          used_items_today: todayUsedItems,
          consumptions_today: todayConsumptions
        },

        // 客服和聊天统计
        communication_stats: {
          new_chat_sessions_today: todayChatSessions,
          total_messages_today: todayMessages,
          avg_messages_per_session:
            todayChatSessions > 0 ? (todayMessages / todayChatSessions).toFixed(1) : 0
        },

        // 系统健康指标
        system_health: {
          status: 'healthy',
          response_time:
            BeijingTimeHelper.timestamp() -
            new Date(req.start_time || BeijingTimeHelper.timestamp()),
          last_updated: nowBeijing
        }
      }

      // 使用DataSanitizer进行数据脱敏（管理员看完整数据）
      const DataSanitizer = require('../../../../services/DataSanitizer')
      const sanitizedStats = DataSanitizer.sanitizeAdminTodayStats
        ? DataSanitizer.sanitizeAdminTodayStats(todayStats, 'full')
        : todayStats

      sharedComponents.logger.info('管理员今日统计数据获取成功', {
        admin_id: req.user.user_id,
        stats_summary: {
          new_users: todayNewUsers,
          draws: todayLotteryDraws,
          active_users: todayActiveUsers
        }
      })

      return res.apiSuccess(sanitizedStats, '今日统计数据获取成功')
    } catch (error) {
      sharedComponents.logger.error('管理员今日统计获取失败', {
        admin_id: req.user.user_id,
        error: error.message,
        stack: error.stack
      })
      return res.apiInternalError('今日统计数据获取失败', error.message, 'ADMIN_TODAY_STATS_ERROR')
    }
  })
)

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
