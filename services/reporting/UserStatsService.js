/**
 * 用户维度统计子服务（V4.7.1 StatsService 拆分）
 *
 * @description 从 StatsService.js 拆分出的用户维度统计功能
 *
 * 职责范围：
 * - 用户统计/画像（getUserStatistics）
 * - 用户管理统计（getUserManagementStats）
 *
 * 依赖：
 * - models: 数据库模型
 * - BalanceService: 资产余额服务
 * - DataSanitizer: 数据脱敏服务
 * - BusinessCacheHelper: Redis 缓存助手
 * - BeijingTimeHelper: 北京时间处理助手
 */

const BusinessError = require('../../utils/BusinessError')
const BeijingTimeHelper = require('../../utils/timeHelper')
const DataSanitizer = require('../DataSanitizer')
const BalanceService = require('../asset/BalanceService')
const { AssetCode } = require('../../constants/AssetCode')
const models = require('../../models')
const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 用户维度统计子服务
 *
 * @class UserStatsService
 */
class UserStatsService {
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

      const [userInfo, lotteryStats, inventoryStats, pointsStats, pointsAccount, consumptionStats] =
        await Promise.all([
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

          (async () => {
            try {
              const account = await models.Account.findOne({
                where: { user_id, account_type: 'user' },
                attributes: ['account_id']
              })
              if (!account) {
                return { total_earned: 0, total_consumed: 0, total_transactions: 0 }
              }
              const stats = await models.AssetTransaction.findAll({
                where: {
                  account_id: account.account_id,
                  asset_code: AssetCode.POINTS
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

          (async () => {
            try {
              const account = await BalanceService.getOrCreateAccount({ user_id })
              const balance = await BalanceService.getOrCreateBalance(
                account.account_id,
                AssetCode.POINTS
              )
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
        throw new BusinessError('用户不存在', 'SERVICE_NOT_FOUND', 404)
      }

      const statistics = {
        user_id: parseInt(user_id),
        account_created: userInfo.dataValues?.created_at || userInfo.created_at,
        last_activity: userInfo.dataValues?.updated_at || userInfo.updated_at,
        lottery_count: parseInt(lotteryStats[0]?.total_draws || 0),
        high_tier_draws: parseInt(lotteryStats[0]?.high_tier_draws || 0),
        high_tier_rate:
          lotteryStats[0]?.total_draws > 0
            ? (
                ((lotteryStats[0]?.high_tier_draws || 0) / lotteryStats[0]?.total_draws) *
                100
              ).toFixed(1) + '%'
            : '0%',
        inventory_total: parseInt(inventoryStats[0]?.total_items || 0),
        inventory_available: parseInt(inventoryStats[0]?.available_items || 0),
        total_points_earned: parseInt(pointsStats[0]?.total_earned || 0),
        total_points_consumed: parseInt(pointsStats[0]?.total_consumed || 0),
        points_account: {
          available_points: pointsAccount?.available_points || 0,
          frozen_points: 0,
          total_points: pointsAccount?.available_points || 0
        },
        transaction_count: parseInt(pointsStats[0]?.total_transactions || 0),
        consumption_count: parseInt(consumptionStats[0]?.total_consumptions || 0),
        consumption_amount: parseFloat(consumptionStats[0]?.total_amount || 0),
        consumption_points: parseInt(consumptionStats[0]?.total_points || 0),
        activity_score: Math.min(
          100,
          Math.floor(
            parseInt(lotteryStats[0]?.total_draws || 0) * 2 +
              parseInt(consumptionStats[0]?.total_consumptions || 0) * 5
          )
        ),
        achievements: []
      }

      if (statistics.lottery_count >= 10) {
        statistics.achievements.push({ name: '抽奖达人', icon: '🎰', unlocked: true })
      }
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
   * 获取用户管理统计数据
   *
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 用户管理统计数据
   * @since 2026
   */
  static async getUserManagementStats(options = {}) {
    const { refresh = false } = options

    try {
      const cacheParams = { type: 'user_management' }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getStats('user_management', cacheParams)
        if (cached) {
          logger.debug('[报表缓存] user_management 命中')
          return cached
        }
      }

      const todayStart = BeijingTimeHelper.todayStart()
      const todayEnd = BeijingTimeHelper.todayEnd()
      const nowBeijing = BeijingTimeHelper.now()

      const sevenDaysAgo = new Date(new Date(nowBeijing).getTime() - 7 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgo = new Date(new Date(nowBeijing).getTime() - 30 * 24 * 60 * 60 * 1000)

      const [
        totalUsers,
        newUsersToday,
        newUsersLast7Days,
        newUsersLast30Days,
        activeUsersToday,
        activeUsersLast7Days,
        statusDistribution,
        roleDistribution,
        registrationTrend
      ] = await Promise.all([
        models.User.count(),
        models.User.count({
          where: { created_at: { [Op.gte]: todayStart, [Op.lte]: todayEnd } }
        }),
        models.User.count({
          where: { created_at: { [Op.gte]: sevenDaysAgo } }
        }),
        models.User.count({
          where: { created_at: { [Op.gte]: thirtyDaysAgo } }
        }),
        models.User.count({
          where: { last_login: { [Op.gte]: todayStart, [Op.lte]: todayEnd } }
        }),
        models.User.count({
          where: { last_login: { [Op.gte]: sevenDaysAgo } }
        }),
        models.User.findAll({
          attributes: ['status', [fn('COUNT', col('user_id')), 'count']],
          group: ['status'],
          raw: true
        }),
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

      const statusMap = { active: 0, inactive: 0, banned: 0 }
      statusDistribution.forEach(item => {
        const status = item.status || 'unknown'
        statusMap[status] = parseInt(item.count, 10)
      })

      const roleList = roleDistribution.map(item => ({
        role_name: item.role_name,
        description: item.description || item.role_name,
        user_count: parseInt(item.user_count, 10)
      }))

      const dailyGrowthRate =
        totalUsers > 0 ? ((newUsersToday / totalUsers) * 100).toFixed(2) : '0.00'
      const weeklyGrowthRate =
        totalUsers > 0 ? ((newUsersLast7Days / totalUsers) * 100).toFixed(2) : '0.00'
      const activeRate =
        totalUsers > 0 ? ((activeUsersLast7Days / totalUsers) * 100).toFixed(2) : '0.00'

      const stats = {
        summary: {
          total_users: totalUsers,
          new_users_today: newUsersToday,
          new_users_last_7_days: newUsersLast7Days,
          new_users_last_30_days: newUsersLast30Days,
          active_users_today: activeUsersToday,
          active_users_last_7_days: activeUsersLast7Days
        },
        growth_rates: {
          daily_growth_rate: parseFloat(dailyGrowthRate),
          weekly_growth_rate: parseFloat(weeklyGrowthRate),
          active_rate: parseFloat(activeRate)
        },
        status_distribution: statusMap,
        role_distribution: roleList,
        recent_registrations: this._fillRegistrationTrend(registrationTrend, 7),
        generated_at: BeijingTimeHelper.format(new Date(), 'YYYY-MM-DD HH:mm:ss')
      }

      logger.info('用户管理统计数据获取成功', {
        total_users: stats.summary.total_users,
        new_users_today: stats.summary.new_users_today,
        active_users_today: stats.summary.active_users_today
      })

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

    const dataMap = {}
    rawData.forEach(item => {
      const dateStr =
        item.date instanceof Date
          ? item.date.toISOString().split('T')[0]
          : String(item.date).split('T')[0]
      dataMap[dateStr] = parseInt(item.count, 10)
    })

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      result.push({ date: dateStr, count: dataMap[dateStr] || 0 })
    }

    return result
  }
}

module.exports = UserStatsService
