/**
 * 餐厅积分抽奖系统 V4.0 - 统一报表服务（ReportingService）
 *
 * @description 整合统计、分析、报表相关的所有功能，提供统一的数据查询和报表生成服务
 *
 * 业务场景：
 * - 管理员查看系统运营数据统计
 * - 生成多维度数据分析报告
 * - 导出统计数据为Excel
 * - 查看用户画像和系统概览
 *
 * 核心功能：
 * 1. 决策分析（抽奖决策数据、用户分布、每日统计）
 * 2. 趋势分析（抽奖趋势、用户趋势、奖品趋势）
 * 3. 性能报告（系统性能、数据库性能、引擎性能）
 * 4. 今日统计（用户、抽奖、积分、库存、聊天统计）
 * 5. 图表数据（用户增长、抽奖趋势、消费趋势、积分流水）
 * 6. 用户画像（用户统计、活跃度评分、成就徽章）
 * 7. 系统概览（系统级统计、健康状态监控）
 *
 * 设计原则：
 * - **Service层职责**：封装所有统计相关的业务逻辑和数据库操作
 * - **北京时间处理**：统一使用BeijingTimeHelper处理时间
 * - **并行查询**：使用Promise.all()提升查询性能
 * - **数据补全**：生成完整的日期/时段序列，填充缺失数据
 * - **错误隔离**：单个模块查询失败不影响其他模块
 *
 * 数据模型关联：
 * - User：用户表
 * - LotteryDraw：抽奖记录表
 * - ConsumptionRecord：消费记录表
 * - AssetTransaction：资产流水表（已替换废弃的PointsTransaction）
 * - ItemInstance：物品实例表（背包双轨架构 - 不可叠加物品轨）
 * - CustomerServiceSession：客服会话表
 * - ChatMessage：聊天消息表
 * - Role：角色表
 *
 * 创建时间：2025年12月11日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const DataSanitizer = require('./DataSanitizer')
const AssetService = require('./AssetService')
const models = require('../models')
const { Op, fn, col, literal } = require('sequelize')

const logger = require('../utils/logger').logger

/**
 * 业务缓存助手（2026-01-03 Redis L2 缓存方案）
 * @see docs/Redis缓存策略现状与DB压力风险评估-2026-01-02.md
 */
const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')

/**
 * 统一报表服务类
 *
 * @class ReportingService
 */
class ReportingService {
  // ==================== 决策分析相关方法 ====================

  /**
   * 获取决策分析数据
   *
   * @param {number} days - 统计天数（1-90）
   * @param {number|null} userFilter - 用户ID过滤（可选）
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 决策分析数据
   */
  static async getDecisionAnalytics (days = 7, userFilter = null, options = {}) {
    const { refresh = false } = options

    try {
      // 参数验证
      const dayCount = Math.min(Math.max(parseInt(days) || 7, 1), 90)

      // ========== Redis 缓存读取（2026-01-03 P1 缓存优化）==========
      const cacheParams = { days: dayCount, user: userFilter || 'all' }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getStats('decision', cacheParams)
        if (cached) {
          logger.debug('[报表缓存] decision 命中', { days: dayCount, userFilter })
          return cached
        }
      }

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

      /*
       * 并行获取统计数据
       * V4.0语义更新：使用 highTierDraws 替代 winningDraws
       */
      const [totalDraws, highTierDraws, dailyStats, userDistribution] = await Promise.all([
        // 总抽奖次数
        models.LotteryDraw.count({ where: whereClause }),

        // V4.0语义更新：高档奖励次数（替代原中奖次数）
        models.LotteryDraw.count({
          where: { ...whereClause, reward_tier: 'high' }
        }),

        // 按日期统计
        models.LotteryDraw.findAll({
          where: whereClause,
          attributes: [
            [fn('DATE', col('created_at')), 'date'],
            [fn('COUNT', col('draw_id')), 'draws'], // 🔧 V4.3修复：使用col('draw_id')
            // V4.0语义更新：统计高档奖励次数
            [
              fn('SUM', literal('CASE WHEN reward_tier = \'high\' THEN 1 ELSE 0 END')),
              'high_tier_wins'
            ]
          ],
          group: [fn('DATE', col('created_at'))],
          order: [[fn('DATE', col('created_at')), 'ASC']],
          raw: true
        }),

        // 用户分布统计
        models.LotteryDraw.findAll({
          where: whereClause,
          attributes: [
            'user_id',
            [fn('COUNT', col('draw_id')), 'draws'], // 🔧 V4.3修复：使用col('draw_id')
            // V4.0语义更新：统计高档奖励次数
            [
              fn('SUM', literal('CASE WHEN reward_tier = \'high\' THEN 1 ELSE 0 END')),
              'high_tier_wins'
            ]
          ],
          group: ['user_id'],
          order: [[fn('COUNT', col('draw_id')), 'DESC']], // 🔧 V4.3修复：使用col('draw_id')
          limit: 20,
          raw: true
        })
      ])

      // V4.0语义更新：计算高档奖励率（替代原中奖率）
      const highTierRate = totalDraws > 0 ? ((highTierDraws / totalDraws) * 100).toFixed(2) : 0

      // 处理每日统计数据
      const processedDailyStats = dailyStats.map(stat => ({
        date: stat.date,
        draws: parseInt(stat.draws),
        // V4.0语义更新：使用 high_tier_wins 替代 wins
        high_tier_wins: parseInt(stat.high_tier_wins || 0),
        high_tier_rate:
          stat.draws > 0 ? ((parseInt(stat.high_tier_wins || 0) / stat.draws) * 100).toFixed(2) : 0
      }))

      // 处理用户分布数据
      const processedUserDistribution = userDistribution.map(stat => ({
        user_id: stat.user_id,
        draws: parseInt(stat.draws),
        // V4.0语义更新：使用 high_tier_wins 替代 wins
        high_tier_wins: parseInt(stat.high_tier_wins || 0),
        personal_high_tier_rate:
          stat.draws > 0 ? ((parseInt(stat.high_tier_wins || 0) / stat.draws) * 100).toFixed(2) : 0
      }))

      const analyticsData = {
        period: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          days: dayCount
        },
        overview: {
          total_draws: totalDraws,
          // V4.0语义更新：使用 high_tier_draws 和 high_tier_rate 替代原中奖统计
          high_tier_draws: highTierDraws,
          high_tier_rate: highTierRate,
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

      // ========== 写入 Redis 缓存（60s TTL）==========
      await BusinessCacheHelper.setStats('decision', cacheParams, analyticsData)

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
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 趋势分析数据
   */
  static async getLotteryTrends (period = 'week', granularity = 'daily', options = {}) {
    const { refresh = false } = options

    try {
      // ========== Redis 缓存读取（2026-01-03 P1 缓存优化）==========
      const cacheParams = { period, granularity }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getStats('trends', cacheParams)
        if (cached) {
          logger.debug('[报表缓存] trends 命中', { period, granularity })
          return cached
        }
      }

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
            [fn('DATE_FORMAT', col('created_at'), dateFormat), 'period'],
            [fn('COUNT', col('draw_id')), 'total_draws'], // 🔧 V4.3修复：使用col('draw_id')而不是'*'
            // V4.0语义更新：统计高档奖励次数
            [
              fn('SUM', literal('CASE WHEN reward_tier = \'high\' THEN 1 ELSE 0 END')),
              'high_tier_wins'
            ],
            [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
          ],
          group: [fn('DATE_FORMAT', col('created_at'), dateFormat)],
          order: [[fn('DATE_FORMAT', col('created_at'), dateFormat), 'ASC']],
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
            [fn('DATE_FORMAT', col('last_login'), dateFormat), 'period'],
            [fn('COUNT', col('user_id')), 'active_users'] // 🔧 V4.3修复：使用col('user_id')而不是'*'
          ],
          group: [fn('DATE_FORMAT', col('last_login'), dateFormat)],
          order: [[fn('DATE_FORMAT', col('last_login'), dateFormat), 'ASC']],
          raw: true
        }),

        // 奖品发放趋势（统计奖品池中奖品的创建情况）
        models.LotteryPrize
          ? models.LotteryPrize.findAll({
            where: {
              created_at: {
                [Op.gte]: startDate,
                [Op.lte]: endDate
              }
            },
            attributes: [
              [fn('DATE_FORMAT', col('created_at'), dateFormat), 'period'],
              [fn('COUNT', col('prize_id')), 'prizes_added'], // 🔧 V4.3修复：使用prize_id（lottery_prizes表主键）
              [fn('SUM', col('stock_quantity')), 'total_quantity']
            ],
            group: [fn('DATE_FORMAT', col('created_at'), dateFormat)],
            order: [[fn('DATE_FORMAT', col('created_at'), dateFormat), 'ASC']],
            raw: true
          })
          : Promise.resolve([])
      ])

      /*
       * 处理数据
       * V4.0语义更新：使用 high_tier_wins 替代 wins
       */
      const processedLotteryTrends = lotteryTrends.map(trend => ({
        period: trend.period,
        total_draws: parseInt(trend.total_draws),
        high_tier_wins: parseInt(trend.high_tier_wins || 0),
        unique_users: parseInt(trend.unique_users),
        high_tier_rate:
          trend.total_draws > 0
            ? ((parseInt(trend.high_tier_wins || 0) / trend.total_draws) * 100).toFixed(2)
            : 0
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
          // V4.0语义更新：使用 average_high_tier_rate 替代 average_win_rate
          average_high_tier_rate:
            processedLotteryTrends.length > 0
              ? (
                processedLotteryTrends.reduce((sum, t) => sum + parseFloat(t.high_tier_rate), 0) /
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

      // ========== 写入 Redis 缓存（60s TTL）==========
      await BusinessCacheHelper.setStats('trends', cacheParams, trendsData)

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
          database_responsive: true,
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
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 今日统计数据
   */
  static async getTodayStats (options = {}) {
    const { refresh = false } = options

    try {
      // ========== Redis 缓存读取（2026-01-03 P1 缓存优化）==========
      const cacheParams = { type: 'today' }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getStats('today', cacheParams)
        if (cached) {
          logger.debug('[报表缓存] today 命中')
          return cached
        }
      }

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
        // V4.0语义更新：使用 todayHighTierDraws 替代 todayWinningDraws
        todayHighTierDraws,
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
        // V4.0语义更新：高档奖励次数
        models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            },
            reward_tier: 'high'
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

        // 积分交易统计（使用 AssetTransaction，过滤 asset_code='POINTS'）
        models.AssetTransaction.count({
          where: {
            asset_code: 'POINTS',
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        // 积分收入（delta_amount > 0 表示增加）
        models.AssetTransaction.sum('delta_amount', {
          where: {
            asset_code: 'POINTS',
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            },
            delta_amount: {
              [Op.gt]: 0
            }
          }
        }) || 0,
        // 积分支出（delta_amount < 0 表示扣减，取绝对值）
        (async () => {
          const spent = await models.AssetTransaction.sum('delta_amount', {
            where: {
              asset_code: 'POINTS',
              created_at: {
                [Op.gte]: todayStart,
                [Op.lte]: todayEnd
              },
              delta_amount: {
                [Op.lt]: 0
              }
            }
          })
          return Math.abs(spent || 0)
        })(),

        // 库存统计（使用新表 ItemInstance）
        models.ItemInstance.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        models.ItemInstance.count({
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

      /*
       * 计算统计指标
       * V4.0语义更新：使用 highTierRate 替代 winRate
       */
      const highTierRate =
        todayLotteryDraws > 0 ? ((todayHighTierDraws / todayLotteryDraws) * 100).toFixed(2) : 0
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
          // V4.0语义更新：使用 high_tier_draws_today 和 high_tier_rate 替代原中奖统计
          high_tier_draws_today: todayHighTierDraws,
          high_tier_rate: parseFloat(highTierRate),
          total_points_consumed: todayTotalPointsConsumed,
          avg_points_per_draw: parseFloat(avgPointsPerDraw)
        },

        // 积分系统统计
        points_stats: {
          transactions_today: todayPointsTransactions,
          points_earned_today: Math.abs(todayPointsEarned),
          points_spent_today: Math.abs(todayPointsSpent),
          net_points_change: todayPointsEarned + todayPointsSpent
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

      // ========== 写入 Redis 缓存（60s TTL）==========
      await BusinessCacheHelper.setStats('today', cacheParams, todayStats)

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

      /*
       * 并行获取基础统计
       * V4.0语义更新：使用 highTierLotteries 替代 winLotteries
       */
      const [totalUsers, activeUsers, newUsers, totalLotteries, highTierLotteries] =
        await Promise.all([
          models.User.count(),
          models.User.count({
            where: {
              last_login: {
                [Op.gte]: new Date(BeijingTimeHelper.timestamp() - 30 * 24 * 60 * 60 * 1000)
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
          // V4.0语义更新：高档奖励次数
          models.LotteryDraw.count({
            where: {
              reward_tier: 'high'
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
          // V4.0语义更新：使用 high_tier_wins 和 high_tier_rate
          high_tier_wins: highTierLotteries,
          high_tier_rate:
            totalLotteries > 0 ? ((highTierLotteries / totalLotteries) * 100).toFixed(2) : 0
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

  // ==================== 图表数据相关方法 ====================

  /**
   * 获取图表统计数据
   *
   * @description 获取多维度的图表统计数据，支持不同时间周期
   *
   * @param {number} days - 统计天数（7/30/90）
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 包含所有图表数据的对象
   * @throws {Error} 参数错误、数据库查询失败等
   */
  static async getChartsData (days = 30, options = {}) {
    const { refresh = false } = options

    // 1. 验证查询参数
    if (![7, 30, 90].includes(days)) {
      const error = new Error('参数错误：days必须是7、30或90')
      error.code = 'INVALID_DAYS_PARAMETER'
      error.allowedValues = [7, 30, 90]
      throw error
    }

    // ========== Redis 缓存读取（2026-01-03 P1 缓存优化）==========
    const cacheParams = { days }
    if (!refresh) {
      const cached = await BusinessCacheHelper.getStats('charts', cacheParams)
      if (cached) {
        logger.debug('[报表缓存] charts 命中', { days })
        return cached
      }
    }

    logger.info(`开始查询图表数据，时间范围: 最近${days}天`)

    // 2. 计算时间范围（北京时间）
    const now = new Date()
    const beijing_now = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))

    // 设置结束时间为今天23:59:59
    const end_date = new Date(beijing_now)
    end_date.setHours(23, 59, 59, 999)

    // 设置开始时间为N天前的00:00:00
    const start_date = new Date(beijing_now)
    start_date.setDate(start_date.getDate() - days)
    start_date.setHours(0, 0, 0, 0)

    logger.info(
      `查询时间范围: ${start_date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} ~ ${end_date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
    )

    // 3. 并行查询所有统计数据
    const start_time = Date.now()

    const [
      user_growth,
      user_types,
      lottery_trend,
      consumption_trend,
      points_flow,
      top_prizes,
      active_hours
    ] = await Promise.all([
      this.getUserGrowthData(start_date, end_date, days),
      this.getUserTypesData(),
      this.getLotteryTrendData(start_date, end_date, days),
      this.getConsumptionTrendData(start_date, end_date, days),
      this.getPointsFlowData(start_date, end_date, days),
      this.getTopPrizesData(start_date, end_date),
      this.getActiveHoursData(start_date, end_date)
    ])

    const query_time = Date.now() - start_time
    logger.info(`图表数据查询完成，耗时: ${query_time}ms`)

    // 4. 组装响应数据
    const chartsData = {
      user_growth,
      user_types,
      lottery_trend,
      consumption_trend,
      points_flow,
      top_prizes,
      active_hours,

      // 元数据
      metadata: {
        days,
        start_date: start_date.toISOString().replace('Z', '+08:00'),
        end_date: end_date.toISOString().replace('Z', '+08:00'),
        query_time_ms: query_time,
        generated_at: beijing_now.toISOString().replace('Z', '+08:00')
      }
    }

    // ========== 写入 Redis 缓存（60s TTL）==========
    await BusinessCacheHelper.setStats('charts', cacheParams, chartsData)

    return chartsData
  }

  /**
   * 获取用户增长趋势数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 用户增长数据数组
   */
  static async getUserGrowthData (start_date, end_date, days) {
    try {
      // 查询每天新增用户数
      const daily_users = await models.User.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('user_id')), 'count']
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      // 查询总用户数（用于计算累计值）
      const total_users_before = await models.User.count({
        where: {
          created_at: {
            [Op.lt]: start_date
          }
        }
      })

      // 生成完整的日期序列（填充缺失日期）
      const growth_data = []
      let cumulative = total_users_before

      for (let i = 0; i < days; i++) {
        const current_date = new Date(start_date)
        current_date.setDate(current_date.getDate() + i)
        const date_str = current_date.toISOString().split('T')[0]

        // 查找当天的数据
        const day_data = daily_users.find(item => item.date === date_str)
        const count = day_data ? parseInt(day_data.count) : 0

        cumulative += count

        growth_data.push({
          date: date_str,
          count,
          cumulative
        })
      }

      logger.info(
        `用户增长数据: ${days}天内新增${cumulative - total_users_before}人，总用户${cumulative}人`
      )
      return growth_data
    } catch (error) {
      logger.error('获取用户增长数据失败:', error)
      return []
    }
  }

  /**
   * 获取用户类型分布数据
   *
   * @returns {Promise<Object>} 用户类型统计对象
   */
  static async getUserTypesData () {
    try {
      const Role = models.Role

      // 查询各类型用户数量（通过角色关联）
      const [user_role_users, admin_role_users, merchant_role_users, all_users] = await Promise.all(
        [
          // 普通用户：拥有user角色
          models.User.count({
            distinct: true,
            include: [
              {
                model: Role,
                as: 'roles',
                where: { role_name: 'user', is_active: true },
                through: { where: { is_active: true } },
                required: true
              }
            ]
          }),

          // 管理员用户：拥有admin角色
          models.User.count({
            distinct: true,
            include: [
              {
                model: Role,
                as: 'roles',
                where: { role_name: 'admin', is_active: true },
                through: { where: { is_active: true } },
                required: true
              }
            ]
          }),

          // 商家用户：拥有merchant角色
          models.User.count({
            distinct: true,
            include: [
              {
                model: Role,
                as: 'roles',
                where: { role_name: 'merchant', is_active: true },
                through: { where: { is_active: true } },
                required: true
              }
            ]
          }),

          // 总用户数
          models.User.count()
        ]
      )

      const types_data = {
        regular: {
          count: user_role_users,
          percentage: all_users > 0 ? ((user_role_users / all_users) * 100).toFixed(2) : '0.00'
        },
        admin: {
          count: admin_role_users,
          percentage: all_users > 0 ? ((admin_role_users / all_users) * 100).toFixed(2) : '0.00'
        },
        merchant: {
          count: merchant_role_users,
          percentage: all_users > 0 ? ((merchant_role_users / all_users) * 100).toFixed(2) : '0.00'
        },
        total: all_users
      }

      logger.info(
        `用户类型分布: 普通${user_role_users}, 管理员${admin_role_users}, 商家${merchant_role_users}, 总用户${all_users}`
      )
      return types_data
    } catch (error) {
      logger.error('获取用户类型数据失败:', error)
      return {
        regular: { count: 0, percentage: '0.00' },
        admin: { count: 0, percentage: '0.00' },
        merchant: { count: 0, percentage: '0.00' },
        total: 0
      }
    }
  }

  /**
   * 获取抽奖趋势数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 抽奖趋势数据数组
   */
  static async getLotteryTrendData (start_date, end_date, days) {
    try {
      // 查询每天抽奖数据
      const daily_lottery = await models.LotteryDraw.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('draw_id')), 'count'],
          // V4.0语义更新：统计高档奖励次数
          [
            fn('SUM', literal('CASE WHEN reward_tier = \'high\' THEN 1 ELSE 0 END')),
            'high_tier_count'
          ]
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      // 生成完整的日期序列
      const trend_data = []

      for (let i = 0; i < days; i++) {
        const current_date = new Date(start_date)
        current_date.setDate(current_date.getDate() + i)
        const date_str = current_date.toISOString().split('T')[0]

        const day_data = daily_lottery.find(item => item.date === date_str)
        const count = day_data ? parseInt(day_data.count) : 0
        // V4.0语义更新：使用 high_tier_count 替代 win_count
        const high_tier_count = day_data ? parseInt(day_data.high_tier_count || 0) : 0
        const high_tier_rate = count > 0 ? ((high_tier_count / count) * 100).toFixed(2) : '0.00'

        trend_data.push({
          date: date_str,
          count,
          // V4.0语义更新：使用 high_tier_count 和 high_tier_rate 替代 win_count 和 win_rate
          high_tier_count,
          high_tier_rate
        })
      }

      const total_draws = trend_data.reduce((sum, item) => sum + item.count, 0)
      logger.info(`抽奖趋势数据: ${days}天内共${total_draws}次抽奖`)
      return trend_data
    } catch (error) {
      logger.error('获取抽奖趋势数据失败:', error)
      return []
    }
  }

  /**
   * 获取消费趋势数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 消费趋势数据数组
   */
  static async getConsumptionTrendData (start_date, end_date, days) {
    try {
      // 查询每天消费数据（只统计已审核通过的记录）
      const daily_consumption = await models.ConsumptionRecord.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('consumption_id')), 'count'],
          [fn('SUM', col('consumption_amount')), 'amount'],
          [fn('AVG', col('consumption_amount')), 'avg_amount']
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          },
          audit_status: 'approved'
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      // 生成完整的日期序列
      const trend_data = []

      for (let i = 0; i < days; i++) {
        const current_date = new Date(start_date)
        current_date.setDate(current_date.getDate() + i)
        const date_str = current_date.toISOString().split('T')[0]

        const day_data = daily_consumption.find(item => item.date === date_str)

        trend_data.push({
          date: date_str,
          count: day_data ? parseInt(day_data.count) : 0,
          amount: day_data ? parseFloat(day_data.amount).toFixed(2) : '0.00',
          avg_amount: day_data ? parseFloat(day_data.avg_amount).toFixed(2) : '0.00'
        })
      }

      const total_amount = trend_data.reduce((sum, item) => sum + parseFloat(item.amount), 0)
      logger.info(`消费趋势数据: ${days}天内消费总额¥${total_amount.toFixed(2)}`)
      return trend_data
    } catch (error) {
      logger.error('获取消费趋势数据失败:', error)
      return []
    }
  }

  /**
   * 获取积分流水数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 积分流水数据数组
   */
  static async getPointsFlowData (start_date, end_date, days) {
    try {
      /**
       * 查询每天积分流水（使用 AssetTransaction，过滤 asset_code='POINTS'）
       * delta_amount > 0 表示收入，delta_amount < 0 表示支出
       */
      const daily_points = await models.AssetTransaction.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('SUM', literal('CASE WHEN delta_amount > 0 THEN delta_amount ELSE 0 END')), 'earned'],
          [
            fn('SUM', literal('CASE WHEN delta_amount < 0 THEN ABS(delta_amount) ELSE 0 END')),
            'spent'
          ]
        ],
        where: {
          asset_code: 'POINTS',
          created_at: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      // 生成完整的日期序列
      const flow_data = []

      for (let i = 0; i < days; i++) {
        const current_date = new Date(start_date)
        current_date.setDate(current_date.getDate() + i)
        const date_str = current_date.toISOString().split('T')[0]

        const day_data = daily_points.find(item => item.date === date_str)
        const earned = day_data ? parseInt(day_data.earned) : 0
        const spent = day_data ? parseInt(day_data.spent) : 0

        flow_data.push({
          date: date_str,
          earned,
          spent,
          balance_change: earned - spent
        })
      }

      const total_earned = flow_data.reduce((sum, item) => sum + item.earned, 0)
      const total_spent = flow_data.reduce((sum, item) => sum + item.spent, 0)
      logger.info(`积分流水数据: ${days}天内收入${total_earned}分，支出${total_spent}分`)
      return flow_data
    } catch (error) {
      logger.error('获取积分流水数据失败:', error)
      return []
    }
  }

  /**
   * 获取热门奖品TOP10数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @returns {Promise<Array>} 热门奖品数据数组
   */
  static async getTopPrizesData (start_date, end_date) {
    try {
      // V4.0语义更新：查询高档奖励记录，统计各奖品的获得次数
      const prize_stats = await models.LotteryDraw.findAll({
        attributes: ['prize_name', [fn('COUNT', col('draw_id')), 'count']],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          },
          reward_tier: 'high', // V4.0：只统计高档奖励
          prize_name: {
            [Op.ne]: null
          }
        },
        group: ['prize_name'],
        order: [[fn('COUNT', col('draw_id')), 'DESC']],
        limit: 10,
        raw: true
      })

      // 计算总中奖数（用于计算百分比）
      const total_wins = prize_stats.reduce((sum, item) => sum + parseInt(item.count), 0)

      // 格式化数据
      const top_prizes = prize_stats.map(item => ({
        prize_name: item.prize_name,
        count: parseInt(item.count),
        percentage: total_wins > 0 ? ((parseInt(item.count) / total_wins) * 100).toFixed(2) : '0.00'
      }))

      logger.info(`热门奖品TOP10: 共${prize_stats.length}个奖品，总中奖${total_wins}次`)
      return top_prizes
    } catch (error) {
      logger.error('获取热门奖品数据失败:', error)
      return []
    }
  }

  /**
   * 获取活跃时段分布数据（0-23时）
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @returns {Promise<Array>} 活跃时段数据数组
   */
  static async getActiveHoursData (start_date, end_date) {
    try {
      // 统计各个时段的用户活动（以抽奖记录为活跃度指标）
      const hourly_activity = await models.LotteryDraw.findAll({
        attributes: [
          [fn('HOUR', col('created_at')), 'hour'],
          [fn('COUNT', col('draw_id')), 'activity_count']
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('HOUR', col('created_at'))],
        order: [[fn('HOUR', col('created_at')), 'ASC']],
        raw: true
      })

      // 生成完整的24小时数据（0-23时）
      const hours_data = []

      for (let hour = 0; hour < 24; hour++) {
        const hour_data = hourly_activity.find(item => parseInt(item.hour) === hour)

        hours_data.push({
          hour,
          hour_label: `${hour.toString().padStart(2, '0')}:00`,
          activity_count: hour_data ? parseInt(hour_data.activity_count) : 0
        })
      }

      const peak_hour = hours_data.reduce(
        (max, item) => (item.activity_count > max.activity_count ? item : max),
        hours_data[0]
      )
      logger.info(
        `活跃时段数据: 高峰时段${peak_hour.hour_label}，活跃度${peak_hour.activity_count}`
      )
      return hours_data
    } catch (error) {
      logger.error('获取活跃时段数据失败:', error)
      return []
    }
  }

  // ==================== 用户画像相关方法 ====================

  /**
   * 获取用户统计数据
   *
   * @param {number} user_id - 用户ID
   * @param {boolean} isAdmin - 是否管理员（决定数据脱敏级别）
   * @returns {Promise<Object>} 用户统计数据
   */
  static async getUserStatistics (user_id, isAdmin = false) {
    try {
      const dataLevel = isAdmin ? 'full' : 'public'

      // 并行查询各种统计数据
      const [userInfo, lotteryStats, inventoryStats, pointsStats, pointsAccount, consumptionStats] =
        await Promise.all([
          // 基本用户信息
          models.User.findByPk(user_id, {
            attributes: ['user_id', 'nickname', 'created_at', 'updated_at']
          }),

          /*
           * 抽奖统计
           * V4.0语义更新：统计高档奖励次数
           */
          models.LotteryDraw.findAll({
            where: { user_id },
            attributes: [
              [fn('COUNT', col('*')), 'total_draws'],
              [fn('COUNT', literal('CASE WHEN reward_tier = \'high\' THEN 1 END')), 'high_tier_draws']
            ],
            raw: true
          }),

          // 库存统计（使用新表 ItemInstance）
          models.ItemInstance.findAll({
            where: { owner_user_id: user_id },
            attributes: [
              [fn('COUNT', col('*')), 'total_items'],
              [fn('COUNT', literal('CASE WHEN status = "available" THEN 1 END')), 'available_items']
            ],
            raw: true
          }),

          // 积分统计（使用 AssetTransaction，通过 Account 关联查询用户积分流水）
          (async () => {
            try {
              // 先获取用户的 account_id
              const account = await models.Account.findOne({
                where: { user_id, account_type: 'user' },
                attributes: ['account_id']
              })
              if (!account) {
                return { total_earned: 0, total_consumed: 0, total_transactions: 0 }
              }
              // 统计积分流水（asset_code='POINTS'）
              const stats = await models.AssetTransaction.findAll({
                where: {
                  account_id: account.account_id,
                  asset_code: 'POINTS'
                },
                attributes: [
                  [
                    fn('SUM', literal('CASE WHEN delta_amount > 0 THEN delta_amount ELSE 0 END')),
                    'total_earned'
                  ],
                  [
                    fn(
                      'SUM',
                      literal('CASE WHEN delta_amount < 0 THEN ABS(delta_amount) ELSE 0 END')
                    ),
                    'total_consumed'
                  ],
                  [fn('COUNT', col('transaction_id')), 'total_transactions']
                ],
                raw: true
              })
              return stats[0] || { total_earned: 0, total_consumed: 0, total_transactions: 0 }
            } catch (error) {
              logger.warn('获取用户积分统计失败:', error.message)
              return { total_earned: 0, total_consumed: 0, total_transactions: 0 }
            }
          })(),

          // 用户积分账户 - 使用 AssetService 统一账户体系
          (async () => {
            try {
              const account = await AssetService.getOrCreateAccount({ user_id })
              const balance = await AssetService.getOrCreateBalance(account.account_id, 'POINTS')
              return {
                available_points: Number(balance.available_amount) || 0,
                total_earned: Number(balance.total_earned) || 0,
                total_consumed: Number(balance.total_consumed) || 0
              }
            } catch (error) {
              logger.warn('获取用户积分账户失败:', error.message)
              return { available_points: 0, total_earned: 0, total_consumed: 0 }
            }
          })(),

          // 消费记录统计
          (async () => {
            try {
              if (models.ConsumptionRecord) {
                return await models.ConsumptionRecord.findAll({
                  where: { user_id },
                  attributes: [
                    [fn('COUNT', col('*')), 'total_consumptions'],
                    [fn('SUM', col('consumption_amount')), 'total_amount'],
                    [fn('SUM', col('points_to_award')), 'total_points']
                  ],
                  raw: true
                })
              } else {
                return [{ total_consumptions: 0, total_amount: 0, total_points: 0 }]
              }
            } catch (error) {
              logger.warn('ConsumptionRecord查询失败（可能表不存在）:', error.message)
              return [{ total_consumptions: 0, total_amount: 0, total_points: 0 }]
            }
          })()
        ])

      if (!userInfo) {
        throw new Error('用户不存在')
      }

      // 构建统计数据
      const statistics = {
        user_id: parseInt(user_id),
        account_created: userInfo.dataValues?.created_at || userInfo.created_at,
        last_activity: userInfo.dataValues?.updated_at || userInfo.updated_at,

        // 抽奖统计
        lottery_count: parseInt(lotteryStats[0]?.total_draws || 0),
        // V4.0语义更新：使用 high_tier_draws 和 high_tier_rate 替代原中奖统计
        high_tier_draws: parseInt(lotteryStats[0]?.high_tier_draws || 0),
        high_tier_rate:
          lotteryStats[0]?.total_draws > 0
            ? (
              ((lotteryStats[0]?.high_tier_draws || 0) / lotteryStats[0]?.total_draws) *
                100
            ).toFixed(1) + '%'
            : '0%',

        // 库存统计
        inventory_total: parseInt(inventoryStats[0]?.total_items || 0),
        inventory_available: parseInt(inventoryStats[0]?.available_items || 0),

        // 积分统计
        total_points_earned: parseInt(pointsStats[0]?.total_earned || 0),
        total_points_consumed: parseInt(pointsStats[0]?.total_consumed || 0),
        points_balance: pointsAccount?.available_points || 0,
        transaction_count: parseInt(pointsStats[0]?.total_transactions || 0),

        // 消费记录统计
        consumption_count: parseInt(consumptionStats[0]?.total_consumptions || 0),
        consumption_amount: parseFloat(consumptionStats[0]?.total_amount || 0),
        consumption_points: parseInt(consumptionStats[0]?.total_points || 0),

        // 活跃度评分（简单算法）
        activity_score: Math.min(
          100,
          Math.floor(
            parseInt(lotteryStats[0]?.total_draws || 0) * 2 +
              parseInt(consumptionStats[0]?.total_consumptions || 0) * 5
          )
        ),

        // 成就徽章
        achievements: []
      }

      // 添加成就徽章
      if (statistics.lottery_count >= 10) {
        statistics.achievements.push({ name: '抽奖达人', icon: '🎰', unlocked: true })
      }
      // V4.0语义更新：使用 high_tier_rate 替代 lottery_win_rate
      if (statistics.high_tier_rate && parseFloat(statistics.high_tier_rate) >= 30) {
        statistics.achievements.push({ name: '幸运之星', icon: '⭐', unlocked: true })
      }
      if (statistics.exchange_count >= 5) {
        statistics.achievements.push({ name: '兑换专家', icon: '🛒', unlocked: true })
      }
      if (statistics.consumption_count >= 10) {
        statistics.achievements.push({ name: '消费达人', icon: '💳', unlocked: true })
      }
      if (statistics.consumption_amount >= 1000) {
        statistics.achievements.push({ name: '千元大客', icon: '💰', unlocked: true })
      }

      // 数据脱敏处理
      const sanitizedStatistics = DataSanitizer.sanitizeUserStatistics(statistics, dataLevel)

      return sanitizedStatistics
    } catch (error) {
      logger.error('获取用户统计失败:', {
        error_name: error.name,
        error_message: error.message,
        error_stack: error.stack,
        user_id,
        timestamp: BeijingTimeHelper.now()
      })
      throw error
    }
  }

  /**
   * 获取系统概览统计（管理员专用）
   *
   * @returns {Promise<Object>} 系统概览数据
   */
  static async getSystemOverview () {
    try {
      // 并行查询系统统计数据
      const [userStats, lotteryStats, pointsStats, systemHealth] = await Promise.all([
        // 用户统计
        models.User.findAll({
          attributes: [
            [fn('COUNT', col('*')), 'total_users'],
            [
              fn('COUNT', literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')),
              'new_users_today'
            ],
            [
              fn(
                'COUNT',
                literal('CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END')
              ),
              'active_users_24h'
            ]
          ],
          raw: true
        }),

        /*
         * 抽奖统计
         * V4.0语义更新：统计高档奖励次数
         */
        models.LotteryDraw.findAll({
          attributes: [
            [fn('COUNT', col('*')), 'total_draws'],
            [
              fn('COUNT', literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')),
              'draws_today'
            ],
            [
              fn('COUNT', literal('CASE WHEN reward_tier = \'high\' THEN 1 END')),
              'total_high_tier_wins'
            ]
          ],
          raw: true
        }),

        // 积分统计（使用 AssetTransaction，过滤 asset_code='POINTS'）
        models.AssetTransaction.findAll({
          where: {
            asset_code: 'POINTS'
          },
          attributes: [
            [
              fn('SUM', literal('CASE WHEN delta_amount > 0 THEN delta_amount ELSE 0 END')),
              'total_points_issued'
            ],
            [
              fn('SUM', literal('CASE WHEN delta_amount < 0 THEN ABS(delta_amount) ELSE 0 END')),
              'total_points_consumed'
            ],
            [
              fn('COUNT', literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')),
              'transactions_today'
            ]
          ],
          raw: true
        }),

        // 系统健康状态
        Promise.resolve({
          server_uptime: process.uptime(),
          memory_usage: process.memoryUsage(),
          node_version: process.version
        })
      ])

      const overview = {
        timestamp: BeijingTimeHelper.nowLocale(),

        // 用户数据
        users: {
          total: parseInt(userStats[0]?.total_users || 0),
          new_today: parseInt(userStats[0]?.new_users_today || 0),
          active_24h: parseInt(userStats[0]?.active_users_24h || 0)
        },

        // 抽奖数据
        lottery: {
          total_draws: parseInt(lotteryStats[0]?.total_draws || 0),
          draws_today: parseInt(lotteryStats[0]?.draws_today || 0),
          // V4.0语义更新：使用 total_high_tier_wins 和 high_tier_rate 替代原中奖统计
          total_high_tier_wins: parseInt(lotteryStats[0]?.total_high_tier_wins || 0),
          high_tier_rate:
            lotteryStats[0]?.total_draws > 0
              ? (
                ((lotteryStats[0]?.total_high_tier_wins || 0) / lotteryStats[0]?.total_draws) *
                  100
              ).toFixed(1) + '%'
              : '0%'
        },

        // 积分数据
        points: {
          total_issued: parseInt(pointsStats[0]?.total_points_issued || 0),
          total_consumed: parseInt(pointsStats[0]?.total_points_consumed || 0),
          transactions_today: parseInt(pointsStats[0]?.transactions_today || 0),
          circulation_rate:
            pointsStats[0]?.total_points_issued > 0
              ? (
                ((pointsStats[0]?.total_points_consumed || 0) /
                    pointsStats[0]?.total_points_issued) *
                  100
              ).toFixed(1) + '%'
              : '0%'
        },

        // 系统状态
        system: {
          uptime_hours: Math.floor(systemHealth.server_uptime / 3600),
          memory_used_mb: Math.floor(systemHealth.memory_usage.used / 1024 / 1024),
          memory_total_mb: Math.floor(systemHealth.memory_usage.rss / 1024 / 1024),
          node_version: systemHealth.node_version,
          status: 'healthy'
        }
      }

      // 管理员看完整数据，无需脱敏
      const sanitizedOverview = DataSanitizer.sanitizeSystemOverview(overview, 'full')

      return sanitizedOverview
    } catch (error) {
      logger.error('获取系统概览失败:', error)
      throw error
    }
  }

  // ==================== 库存统计相关方法 ====================

  /**
   * 获取管理员库存统计数据
   *
   * @description 提供系统库存的全面统计分析，包括物品总数、状态分布、类型分布
   *
   * 业务场景：
   * - 管理员查看系统库存运营数据
   * - 监控物品状态分布和健康度
   * - 分析物品类型结构
   *
   * @returns {Promise<Object>} 库存统计数据
   * @returns {number} returns.total_items - 物品总数
   * @returns {number} returns.available_items - 可用物品数
   * @returns {number} returns.locked_items - 锁定物品数（市场上架中）
   * @returns {number} returns.used_items - 已使用物品数
   * @returns {number} returns.expired_items - 已过期物品数
   * @returns {Object} returns.by_status - 按状态统计的明细
   * @returns {Object} returns.by_type - 按类型统计的明细
   * @returns {string} returns.generated_at - 生成时间（北京时间ISO格式）
   */
  static async getInventoryAdminStatistics () {
    try {
      const { ItemInstance, sequelize } = models

      // 并行执行统计查询提升性能
      const [totalItems, statusStats, typeStats] = await Promise.all([
        // 总物品数
        ItemInstance.count(),

        // 按状态统计
        ItemInstance.findAll({
          attributes: [
            'status',
            [sequelize.fn('COUNT', sequelize.col('item_instance_id')), 'count']
          ],
          group: ['status'],
          raw: true
        }),

        // 按类型统计
        ItemInstance.findAll({
          attributes: [
            'item_type',
            [sequelize.fn('COUNT', sequelize.col('item_instance_id')), 'count']
          ],
          group: ['item_type'],
          raw: true
        })
      ])

      // 转换为对象格式
      const statusMap = {}
      statusStats.forEach(stat => {
        statusMap[stat.status] = parseInt(stat.count, 10)
      })

      const typeMap = {}
      typeStats.forEach(stat => {
        typeMap[stat.item_type || 'unknown'] = parseInt(stat.count, 10)
      })

      const statistics = {
        total_items: totalItems,
        available_items: statusMap.available || 0,
        locked_items: statusMap.locked || 0,
        used_items: statusMap.used || 0,
        expired_items: statusMap.expired || 0,
        by_status: statusMap,
        by_type: typeMap,
        generated_at: BeijingTimeHelper.formatBeijingTime(new Date())
      }

      logger.info('ReportingService.getInventoryAdminStatistics 统计完成', {
        total_items: statistics.total_items,
        available_items: statistics.available_items
      })

      return statistics
    } catch (error) {
      logger.error('获取库存统计失败:', error)
      throw error
    }
  }

  // ==================== 辅助方法 ====================

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

module.exports = ReportingService
