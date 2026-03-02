/**
 * 报表服务 - 统计概览子服务（V4.7.0 大文件拆分）
 *
 * @description 从 ReportingService.js 拆分出的统计概览相关功能
 * @see docs/大文件拆分方案（保持单体架构）.md
 *
 * 职责范围：
 * - 系统性能报告
 * - 今日统计数据
 * - 简化系统统计
 * - 用户统计/画像
 * - 系统概览（管理员）
 * - 库存管理统计
 *
 * 使用场景：
 * - 管理后台仪表盘
 * - 系统健康监控
 * - 用户画像分析
 *
 * 依赖：
 * - models: 数据库模型
 * - BalanceService: 资产余额服务
 * - DataSanitizer: 数据脱敏服务
 * - BusinessCacheHelper: Redis 缓存助手
 * - BeijingTimeHelper: 北京时间处理助手
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
const DataSanitizer = require('../DataSanitizer')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('../asset/BalanceService')
const models = require('../../models')
const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 统计概览子服务
 *
 * @class StatsService
 */
class StatsService {
  /**
   * 获取系统性能报告
   *
   * @param {Object} performanceMonitor - 性能监控器实例
   * @returns {Promise<Object>} 性能报告数据
   */
  static async getPerformanceReport(performanceMonitor = null) {
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
  static async getTodayStats(options = {}) {
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

        // 库存统计（使用新表 Item）
        models.Item.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),
        // Item表没有used_at字段，改用updated_at + status='used'来统计今日使用的物品
        models.Item.count({
          where: {
            updated_at: {
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
  static async getSimpleSystemStats() {
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

  /**
   * 获取用户统计数据
   *
   * @param {number} user_id - 用户ID
   * @param {boolean} has_admin_access - 是否具有管理员访问权限（决定数据脱敏级别，role_level >= 100）
   * @returns {Promise<Object>} 用户统计数据
   */
  static async getUserStatistics(user_id, has_admin_access = false) {
    try {
      const dataLevel = has_admin_access ? 'full' : 'public'

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
              [fn('COUNT', literal("CASE WHEN reward_tier = 'high' THEN 1 END")), 'high_tier_draws']
            ],
            raw: true
          }),

          // 库存统计（使用新表 Item，通过 Account 关联查询）
          (async () => {
            const itemAccount = await models.Account.findOne({
              where: { user_id, account_type: 'user' },
              attributes: ['account_id']
            })
            if (!itemAccount) return [{ total_items: 0, available_items: 0 }]
            return models.Item.findAll({
              where: { owner_account_id: itemAccount.account_id },
              attributes: [
                [fn('COUNT', col('*')), 'total_items'],
                [
                  fn('COUNT', literal('CASE WHEN status = "available" THEN 1 END')),
                  'available_items'
                ]
              ],
              raw: true
            })
          })(),

          // 积分统计（使用 AssetTransaction，通过 Account 关联查询用户积分流水）
          (async () => {
            try {
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
                      literal(
                        'CASE WHEN delta_amount < 0 THEN -CAST(delta_amount AS DECIMAL(30,2)) ELSE 0 END'
                      )
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

          // 用户积分账户 - 使用 BalanceService 统一账户体系
          (async () => {
            try {
              const account = await BalanceService.getOrCreateAccount({ user_id })
              const balance = await BalanceService.getOrCreateBalance(account.account_id, 'POINTS')
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
        // 积分账户结构
        points_account: {
          available_points: pointsAccount?.available_points || 0,
          frozen_points: 0, // 统计场景暂无冻结概念
          total_points: pointsAccount?.available_points || 0
        },
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
  static async getSystemOverview() {
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
              fn('COUNT', literal("CASE WHEN reward_tier = 'high' THEN 1 END")),
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
              fn(
                'SUM',
                literal(
                  'CASE WHEN delta_amount < 0 THEN -CAST(delta_amount AS DECIMAL(30,2)) ELSE 0 END'
                )
              ),
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
  static async getInventoryAdminStatistics() {
    try {
      const { Item, sequelize } = models

      // 并行执行统计查询提升性能
      const [totalItems, statusStats, typeStats] = await Promise.all([
        // 总物品数
        Item.count(),

        // 按状态统计
        Item.findAll({
          attributes: ['status', [sequelize.fn('COUNT', sequelize.col('item_id')), 'count']],
          group: ['status'],
          raw: true
        }),

        // 按类型统计
        Item.findAll({
          attributes: ['item_type', [sequelize.fn('COUNT', sequelize.col('item_id')), 'count']],
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
        generated_at: BeijingTimeHelper.format(new Date(), 'YYYY-MM-DD HH:mm:ss')
      }

      logger.info('StatsService.getInventoryAdminStatistics 统计完成', {
        total_items: statistics.total_items,
        available_items: statistics.available_items
      })

      return statistics
    } catch (error) {
      logger.error('获取库存统计失败:', error)
      throw error
    }
  }

  /**
   * 获取用户管理统计数据
   *
   * @description 为管理后台用户管理模块提供统计概览数据
   *
   * 业务场景：
   * - 管理员查看用户总体情况
   * - 监控用户增长趋势
   * - 分析用户角色和状态分布
   *
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 用户管理统计数据
   * @returns {number} returns.total_users - 总用户数
   * @returns {number} returns.new_users_today - 今日新增
   * @returns {number} returns.new_users_last_7_days - 近7日新增
   * @returns {number} returns.active_users_today - 今日活跃（有登录）
   * @returns {number} returns.active_users_last_7_days - 近7日活跃
   * @returns {Object} returns.status_distribution - 用户状态分布
   * @returns {Object} returns.role_distribution - 用户角色分布
   * @returns {Array} returns.recent_registrations - 近期注册趋势（7日）
   * @returns {string} returns.generated_at - 生成时间（北京时间ISO格式）
   *
   * @since 2026-02-05（用户管理模块统计接口）
   */
  static async getUserManagementStats(options = {}) {
    const { refresh = false } = options

    try {
      // ========== Redis 缓存读取（缓存优化）==========
      const cacheParams = { type: 'user_management' }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getStats('user_management', cacheParams)
        if (cached) {
          logger.debug('[报表缓存] user_management 命中')
          return cached
        }
      }

      // 获取时间范围（北京时间）
      const todayStart = BeijingTimeHelper.todayStart()
      const todayEnd = BeijingTimeHelper.todayEnd()
      const nowBeijing = BeijingTimeHelper.now()

      // 近7天、近30天起始时间
      const sevenDaysAgo = new Date(new Date(nowBeijing).getTime() - 7 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgo = new Date(new Date(nowBeijing).getTime() - 30 * 24 * 60 * 60 * 1000)

      // 并行查询各类统计数据
      const [
        // 基础用户统计
        totalUsers,
        newUsersToday,
        newUsersLast7Days,
        newUsersLast30Days,
        activeUsersToday,
        activeUsersLast7Days,

        // 用户状态分布
        statusDistribution,

        // 用户角色分布
        roleDistribution,

        // 近7日注册趋势
        registrationTrend
      ] = await Promise.all([
        // 总用户数
        models.User.count(),

        // 今日新增
        models.User.count({
          where: {
            created_at: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),

        // 近7日新增
        models.User.count({
          where: {
            created_at: {
              [Op.gte]: sevenDaysAgo
            }
          }
        }),

        // 近30日新增
        models.User.count({
          where: {
            created_at: {
              [Op.gte]: thirtyDaysAgo
            }
          }
        }),

        // 今日活跃（有登录记录）
        models.User.count({
          where: {
            last_login: {
              [Op.gte]: todayStart,
              [Op.lte]: todayEnd
            }
          }
        }),

        // 近7日活跃
        models.User.count({
          where: {
            last_login: {
              [Op.gte]: sevenDaysAgo
            }
          }
        }),

        // 用户状态分布
        models.User.findAll({
          attributes: ['status', [fn('COUNT', col('user_id')), 'count']],
          group: ['status'],
          raw: true
        }),

        // 用户角色分布（通过 UserRole 关联查询）
        models.sequelize.query(
          `
          SELECT r.role_name, r.description, COUNT(ur.user_id) as user_count
          FROM roles r
          LEFT JOIN user_roles ur ON r.role_id = ur.role_id AND ur.is_active = 1
          WHERE r.is_active = 1
          GROUP BY r.role_id, r.role_name, r.description
          ORDER BY user_count DESC
          `,
          { type: models.sequelize.QueryTypes.SELECT }
        ),

        // 近7日注册趋势
        models.sequelize.query(
          `
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as count
          FROM users
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
          GROUP BY DATE(created_at)
          ORDER BY date ASC
          `,
          { type: models.sequelize.QueryTypes.SELECT }
        )
      ])

      // 转换状态分布为对象格式
      const statusMap = {
        active: 0,
        inactive: 0,
        banned: 0
      }
      statusDistribution.forEach(item => {
        const status = item.status || 'unknown'
        statusMap[status] = parseInt(item.count, 10)
      })

      // 转换角色分布为数组格式
      const roleList = roleDistribution.map(item => ({
        role_name: item.role_name,
        description: item.description || item.role_name,
        user_count: parseInt(item.user_count, 10)
      }))

      // 计算增长率
      const dailyGrowthRate =
        totalUsers > 0 ? ((newUsersToday / totalUsers) * 100).toFixed(2) : '0.00'
      const weeklyGrowthRate =
        totalUsers > 0 ? ((newUsersLast7Days / totalUsers) * 100).toFixed(2) : '0.00'
      const activeRate =
        totalUsers > 0 ? ((activeUsersLast7Days / totalUsers) * 100).toFixed(2) : '0.00'

      // 构建统计结果
      const stats = {
        // 概览指标
        summary: {
          total_users: totalUsers,
          new_users_today: newUsersToday,
          new_users_last_7_days: newUsersLast7Days,
          new_users_last_30_days: newUsersLast30Days,
          active_users_today: activeUsersToday,
          active_users_last_7_days: activeUsersLast7Days
        },

        // 增长率指标
        growth_rates: {
          daily_growth_rate: parseFloat(dailyGrowthRate),
          weekly_growth_rate: parseFloat(weeklyGrowthRate),
          active_rate: parseFloat(activeRate)
        },

        // 用户状态分布
        status_distribution: statusMap,

        // 用户角色分布
        role_distribution: roleList,

        // 近期注册趋势（补全7天）
        recent_registrations: this._fillRegistrationTrend(registrationTrend, 7),

        // 元数据
        generated_at: BeijingTimeHelper.format(new Date(), 'YYYY-MM-DD HH:mm:ss')
      }

      logger.info('用户管理统计数据获取成功', {
        total_users: stats.summary.total_users,
        new_users_today: stats.summary.new_users_today,
        active_users_today: stats.summary.active_users_today
      })

      // ========== 写入 Redis 缓存（60s TTL）==========
      await BusinessCacheHelper.setStats('user_management', cacheParams, stats)

      return stats
    } catch (error) {
      logger.error('获取用户管理统计数据失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 填充注册趋势数据（补全空缺日期）
   * @private
   * @param {Array} rawData - 原始趋势数据
   * @param {number} days - 天数
   * @returns {Array} 补全后的趋势数据
   */
  static _fillRegistrationTrend(rawData, days) {
    const result = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 创建日期到数量的映射
    const dataMap = {}
    rawData.forEach(item => {
      const dateStr =
        item.date instanceof Date
          ? item.date.toISOString().split('T')[0]
          : String(item.date).split('T')[0]
      dataMap[dateStr] = parseInt(item.count, 10)
    })

    // 填充每一天的数据
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]

      result.push({
        date: dateStr,
        count: dataMap[dateStr] || 0
      })
    }

    return result
  }

  // ==================== 辅助方法 ====================

  /**
   * 格式化运行时间
   * @private
   * @param {number} uptimeSeconds - 运行时间（秒）
   * @returns {string} 格式化的时间字符串
   */
  static _formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / (24 * 60 * 60))
    const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60))
    const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60)
    const seconds = Math.floor(uptimeSeconds % 60)

    return `${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`
  }
}

module.exports = StatsService
