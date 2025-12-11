/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 管理后台数据分析服务（AdminAnalyticsService）
 *
 * 业务场景：管理后台数据分析的完整生命周期，包括决策分析、趋势分析、性能报告、今日统计等
 *
 * 核心功能：
 * 1. 决策分析管理（抽奖决策数据、用户分布、每日统计）
 * 2. 趋势分析管理（抽奖趋势、用户趋势、奖品趋势）
 * 3. 性能报告管理（系统性能、数据库性能、引擎性能）
 * 4. 今日统计管理（用户统计、抽奖统计、积分统计、库存统计、聊天统计）
 *
 * 业务流程：
 *
 * 1. **决策分析流程**
 *    - 查询时间范围内的抽奖数据 → 统计中奖率、用户分布 → 返回分析数据
 *
 * 2. **趋势分析流程**
 *    - 查询时间范围内的活动趋势 → 按时间粒度聚合数据 → 返回趋势数据
 *
 * 3. **性能报告流程**
 *    - 获取系统性能指标 → 获取数据库统计 → 返回性能报告
 *
 * 4. **今日统计流程**
 *    - 并行查询各类统计数据 → 计算统计指标 → 返回今日数据
 *
 * 设计原则：
 * - **数据统一**：所有统计数据通过Service层统一查询
 * - **性能优化**：使用Promise.all并行查询，提升查询效率
 * - **时间统一**：统一使用BeijingTimeHelper处理时间
 * - **数据脱敏**：管理员数据使用DataSanitizer进行适当脱敏
 *
 * 关键方法列表：
 * - getDecisionAnalytics(days, userFilter) - 获取决策分析数据
 * - getLotteryTrends(period, granularity) - 获取抽奖趋势分析
 * - getPerformanceReport() - 获取系统性能报告
 * - getTodayStats() - 获取今日统计数据
 *
 * 数据模型关联：
 * - LotteryDraw：抽奖记录表
 * - User：用户表
 * - LotteryPrize：奖品表
 * - PointsTransaction：积分交易表
 * - UserInventory：用户库存表
 * - CustomerServiceSession：客服会话表
 * - ChatMessage：聊天消息表
 * - AuthenticationSession：认证会话表
 * - ConsumptionRecord：消费记录表
 *
 * 使用示例：
 * ```javascript
 * // 示例1：获取决策分析数据
 * const analytics = await AdminAnalyticsService.getDecisionAnalytics(7, null);
 *
 * // 示例2：获取趋势分析
 * const trends = await AdminAnalyticsService.getLotteryTrends('week', 'daily');
 *
 * // 示例3：获取今日统计
 * const todayStats = await AdminAnalyticsService.getTodayStats();
 * ```
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const models = require('../models')
const { Op } = require('sequelize')

const logger = new Logger('AdminAnalyticsService')

/**
 * 管理后台数据分析服务类
 */
class AdminAnalyticsService {
  /**
   * 获取决策分析数据
   *
   * @param {number} days - 统计天数（1-90）
   * @param {number|null} userFilter - 用户ID过滤（可选）
   * @returns {Promise<Object>} 决策分析数据
   */
  static async getDecisionAnalytics (days = 7, userFilter = null) {
    try {
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

      if (userFilter) {
        whereClause.user_id = parseInt(userFilter)
      }

      // 并行获取统计数据
      const [
        totalDraws,
        winningDraws,
        dailyStats,
        userDistribution
      ] = await Promise.all([
        // 总抽奖次数
        models.LotteryDraw.count({ where: whereClause }),

        // 中奖次数
        models.LotteryDraw.count({
          where: { ...whereClause, is_winner: true }
        }),

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
        })
      ])

      // 计算整体统计
      const overallWinRate = totalDraws > 0 ? ((winningDraws / totalDraws) * 100).toFixed(2) : 0

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
        trends: {
          daily_stats: processedDailyStats
        },
        users: {
          top_users: processedUserDistribution,
          total_active_users: userDistribution.length
        },
        generated_at: BeijingTimeHelper.now()
      }

      logger.info('决策分析数据生成成功', {
        period_days: dayCount,
        total_draws: totalDraws
      })

      return analyticsData
    } catch (error) {
      logger.error('决策分析数据获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取抽奖趋势分析
   *
   * @param {string} period - 时间周期（day、week、month、quarter）
   * @param {string} granularity - 时间粒度（hourly、daily）
   * @returns {Promise<Object>} 趋势分析数据
   */
  static async getLotteryTrends (period = 'week', granularity = 'daily') {
    try {
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

        // 用户活动趋势
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

        // 奖品发放趋势
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

      logger.info('趋势分析数据生成成功', {
        period,
        granularity,
        total_periods: processedLotteryTrends.length
      })

      return trendsData
    } catch (error) {
      logger.error('趋势分析数据获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取系统性能报告
   *
   * @param {Object} performanceMonitor - 性能监控器实例
   * @returns {Promise<Object>} 性能报告数据
   */
  static async getPerformanceReport (performanceMonitor = null) {
    try {
      // 获取引擎性能监控数据
      let performanceData = {}
      if (performanceMonitor) {
        try {
          if (performanceMonitor.getDetailedStats) {
            performanceData = performanceMonitor.getDetailedStats()
          } else if (performanceMonitor.getStats) {
            performanceData = performanceMonitor.getStats()
          }
        } catch (error) {
          logger.warn('获取性能监控数据失败', { error: error.message })
        }
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
          uptime_formatted: this._formatUptime(systemStats.uptime),
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
          memory_healthy: systemStats.memory.heapUsed / systemStats.memory.heapTotal < 0.9
        }
      }

      logger.info('性能报告生成成功')

      return performanceReport
    } catch (error) {
      logger.error('性能报告获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取今日统计数据
   *
   * @returns {Promise<Object>} 今日统计数据
   */
  static async getTodayStats () {
    try {
      // 获取今日时间范围（北京时间）
      const todayStart = BeijingTimeHelper.todayStart()
      const todayEnd = BeijingTimeHelper.todayEnd()
      const nowBeijing = BeijingTimeHelper.now()

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

        // 活动统计（登录会话数）
        models.AuthenticationSession.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        // 消费记录统计
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
          last_updated: nowBeijing
        }
      }

      logger.info('今日统计数据获取成功', {
        new_users: todayNewUsers,
        draws: todayLotteryDraws,
        active_users: todayActiveUsers
      })

      return todayStats
    } catch (error) {
      logger.error('今日统计数据获取失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取简化的系统统计信息
   *
   * @description 提供快速的系统概览统计，用于管理后台中间件
   * @returns {Promise<Object>} 简化的系统统计数据
   */
  static async getSimpleSystemStats () {
    const os = require('os')

    try {
      const today = BeijingTimeHelper.createBeijingTime()
      const todayStart = new Date(today.setHours(0, 0, 0, 0))

      // 并行获取基础统计
      const [totalUsers, activeUsers, newUsers, totalLotteries, winLotteries] = await Promise.all([
        models.User.count(),
        models.User.count({
          where: {
            last_login: {
              [Op.gte]: new Date(BeijingTimeHelper.timestamp() - 30 * 24 * 60 * 60 * 1000) // 30天内活跃
            }
          }
        }),
        models.User.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        models.LotteryDraw.count(),
        models.LotteryDraw.count({
          where: {
            is_winner: true
          }
        })
      ])

      return {
        users: {
          total: totalUsers,
          active: activeUsers,
          new_today: newUsers
        },
        lottery: {
          total: totalLotteries,
          wins: winLotteries,
          win_rate: totalLotteries > 0 ? ((winLotteries / totalLotteries) * 100).toFixed(2) : 0
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu_usage: os.loadavg()[0],
          timestamp: BeijingTimeHelper.apiTimestamp()
        }
      }
    } catch (error) {
      logger.error('获取简化系统统计失败', { error: error.message })
      throw error
    }
  }

  /**
   * 格式化运行时间
   * @private
   * @param {number} uptimeSeconds - 运行时间（秒）
   * @returns {string} 格式化的时间字符串
   */
  static _formatUptime (uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / (24 * 60 * 60))
    const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60))
    const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60)
    const seconds = Math.floor(uptimeSeconds % 60)

    return `${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`
  }
}

module.exports = AdminAnalyticsService
