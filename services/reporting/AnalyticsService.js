/**
 * 报表服务 - 决策分析子服务（V4.7.0 大文件拆分）
 *
 * @description 从 ReportingService.js 拆分出的决策分析相关功能
 * @see docs/大文件拆分方案（保持单体架构）.md
 *
 * 职责范围：
 * - 决策分析数据（抽奖决策、用户分布、每日统计）
 * - 趋势分析（抽奖趋势、用户趋势、奖品趋势）
 *
 * 使用场景：
 * - 管理员查看运营决策数据
 * - 生成多维度趋势分析报告
 *
 * 依赖：
 * - models: 数据库模型（LotteryDraw, User, LotteryPrize）
 * - BusinessCacheHelper: Redis 缓存助手
 * - BeijingTimeHelper: 北京时间处理助手
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
const models = require('../../models')
const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 决策分析子服务
 *
 * @class AnalyticsService
 */
class AnalyticsService {
  /**
   * 获取决策分析数据
   *
   * @param {number} days - 统计天数（1-90）
   * @param {number|null} userFilter - 用户ID过滤（可选）
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 决策分析数据
   */
  static async getDecisionAnalytics(days = 7, userFilter = null, options = {}) {
    const { refresh = false, start_time = null, end_time = null } = options

    try {
      // 参数验证
      const dayCount = Math.min(Math.max(parseInt(days) || 7, 1), 90)

      // 计算时间范围（优先使用传入的自定义日期范围）
      let startDate, endDate
      if (start_time && end_time) {
        // 使用用户指定的日期范围
        startDate = new Date(start_time)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(end_time)
        endDate.setHours(23, 59, 59, 999)
        logger.info('[Analytics] 使用自定义日期范围', { start_time, end_time })
      } else {
        // 使用 days 参数计算日期范围
        endDate = BeijingTimeHelper.createBeijingTime()
        startDate = new Date(endDate.getTime() - dayCount * 24 * 60 * 60 * 1000)
      }

      // ========== Redis 缓存读取（2026-01-03 P1 缓存优化）==========
      const cacheParams = {
        days: dayCount,
        user: userFilter || 'all',
        start: start_time || 'default',
        end: end_time || 'default'
      }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getStats('decision', cacheParams)
        if (cached) {
          logger.debug('[报表缓存] decision 命中', {
            days: dayCount,
            userFilter,
            start_time,
            end_time
          })
          return cached
        }
      }

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
            [fn('COUNT', col('lottery_draw_id')), 'draws'],
            // V4.0语义更新：统计高档奖励次数
            [
              fn('SUM', literal("CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END")),
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
            [fn('COUNT', col('lottery_draw_id')), 'draws'],
            // V4.0语义更新：统计高档奖励次数
            [
              fn('SUM', literal("CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END")),
              'high_tier_wins'
            ]
          ],
          group: ['user_id'],
          order: [[fn('COUNT', col('lottery_draw_id')), 'DESC']],
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
  static async getLotteryTrends(period = 'week', granularity = 'daily', options = {}) {
    const { refresh = false, start_time = null, end_time = null } = options

    try {
      // ========== Redis 缓存读取（2026-01-03 P1 缓存优化）==========
      const cacheParams = {
        period,
        granularity,
        start: start_time || 'default',
        end: end_time || 'default'
      }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getStats('trends', cacheParams)
        if (cached) {
          logger.debug('[报表缓存] trends 命中', { period, granularity, start_time, end_time })
          return cached
        }
      }

      // 计算时间范围（优先使用传入的自定义日期范围）
      let startDate, endDate
      let days = 7

      if (start_time && end_time) {
        // 使用用户指定的日期范围
        startDate = new Date(start_time)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(end_time)
        endDate.setHours(23, 59, 59, 999)
        // 计算实际天数以便后续逻辑使用
        days = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000))
        logger.info('[Trends] 使用自定义日期范围', { start_time, end_time, days })
      } else {
        // 使用 period 参数计算日期范围
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
        endDate = BeijingTimeHelper.createBeijingTime()
        startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
      }

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
            [fn('COUNT', col('lottery_draw_id')), 'total_draws'],
            // V4.0语义更新：统计高档奖励次数
            [
              fn('SUM', literal("CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END")),
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
            [fn('COUNT', col('user_id')), 'active_users']
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
                [fn('COUNT', col('lottery_prize_id')), 'prizes_added'],
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
}

module.exports = AnalyticsService
