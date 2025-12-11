/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 用户画像服务（UserDashboardService）
 *
 * 业务场景：管理用户统计数据和系统概览的聚合查询
 *
 * 核心功能：
 * 1. 用户统计数据聚合（抽奖、库存、积分、兑换、消费）
 * 2. 活跃度评分计算
 * 3. 成就徽章系统
 * 4. 系统概览统计（管理员专用）
 *
 * 业务流程：
 *
 * 1. **用户统计流程**
 *    - 并行查询各业务模块数据 → 聚合统计信息 → 计算活跃度评分 → 生成成就徽章
 *
 * 2. **系统概览流程**
 *    - 并行查询系统级统计 → 聚合各模块数据 → 计算系统健康状态
 *
 * 设计原则：
 * - **数据聚合**：通过Service层聚合多个业务模块的数据
 * - **并行查询**：使用Promise.all提升查询性能
 * - **错误隔离**：单个模块查询失败不影响其他模块
 * - **数据脱敏**：根据用户角色返回不同级别的数据
 *
 * 关键方法列表：
 * - getUserStatistics(userId, isAdmin) - 获取用户统计数据
 * - getSystemOverview() - 获取系统概览（管理员专用）
 *
 * 数据模型关联：
 * - User：用户基本信息
 * - LotteryDraw：抽奖记录
 * - UserInventory：用户库存
 * - PointsTransaction：积分交易记录
 * - UserPointsAccount：用户积分账户
 * - ExchangeRecords：兑换记录
 * - ConsumptionRecord：消费记录
 *
 * 使用示例：
 * ```javascript
 * // 示例1：获取用户统计数据
 * const stats = await UserDashboardService.getUserStatistics(userId, false);
 *
 * // 示例2：获取系统概览（管理员）
 * const overview = await UserDashboardService.getSystemOverview();
 * ```
 *
 * 创建时间：2025年12月10日
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

const BeijingTimeHelper = require('../utils/timeHelper')
const DataSanitizer = require('./DataSanitizer')
const models = require('../models')

/**
 * 用户画像服务类
 */
class UserDashboardService {
  /**
   * 构建安全的查询条件（兼容软删除字段）
   * @param {Object} model - Sequelize模型
   * @param {number} user_id - 用户ID
   * @returns {Object} where条件对象
   * @private
   */
  static _buildSafeWhereCondition (model, user_id) {
    /*
     * 仅返回user_id过滤条件
     * is_deleted过滤由模型的defaultScope自动处理
     */
    return { user_id }
  }

  /**
   * 获取用户统计数据
   *
   * 业务场景：
   * - 用户查看个人中心统计数据
   * - 管理员查看用户画像
   *
   * @param {number} user_id - 用户ID
   * @param {boolean} isAdmin - 是否管理员（决定数据脱敏级别）
   * @returns {Promise<Object>} 用户统计数据
   */
  static async getUserStatistics (user_id, isAdmin = false) {
    try {
      const dataLevel = isAdmin ? 'full' : 'public'

      // 并行查询各种统计数据
      const [
        userInfo,
        lotteryStats,
        inventoryStats,
        pointsStats,
        pointsAccount,
        exchangeStats,
        consumptionStats
      ] = await Promise.all([
        // 基本用户信息
        models.User.findByPk(user_id, {
          attributes: ['user_id', 'nickname', 'created_at', 'updated_at']
        }),

        // 抽奖统计
        models.LotteryDraw.findAll({
          where: { user_id },
          attributes: [
            [models.sequelize.fn('COUNT', models.sequelize.col('*')), 'total_draws'],
            [
              models.sequelize.fn(
                'COUNT',
                models.sequelize.literal('CASE WHEN is_winner = 1 THEN 1 END')
              ),
              'winning_draws'
            ]
          ],
          raw: true
        }),

        // 库存统计
        models.UserInventory.findAll({
          where: { user_id },
          attributes: [
            [models.sequelize.fn('COUNT', models.sequelize.col('*')), 'total_items'],
            [
              models.sequelize.fn(
                'COUNT',
                models.sequelize.literal('CASE WHEN status = "available" THEN 1 END')
              ),
              'available_items'
            ]
          ],
          raw: true
        }),

        // 积分统计
        models.PointsTransaction.findAll({
          where: this._buildSafeWhereCondition(models.PointsTransaction, user_id),
          attributes: [
            [
              models.sequelize.fn(
                'SUM',
                models.sequelize.literal(
                  'CASE WHEN transaction_type = "earn" THEN points_amount ELSE 0 END'
                )
              ),
              'total_earned'
            ],
            [
              models.sequelize.fn(
                'SUM',
                models.sequelize.literal(
                  'CASE WHEN transaction_type = "consume" THEN points_amount ELSE 0 END'
                )
              ),
              'total_consumed'
            ],
            [models.sequelize.fn('COUNT', models.sequelize.col('*')), 'total_transactions']
          ],
          raw: true
        }),

        // 用户积分账户
        models.UserPointsAccount.findOne({
          where: { user_id },
          attributes: ['available_points', 'total_earned', 'total_consumed']
        }),

        // 兑换统计
        models.ExchangeRecords.findAll({
          where: this._buildSafeWhereCondition(models.ExchangeRecords, user_id),
          attributes: [
            [models.sequelize.fn('COUNT', models.sequelize.col('*')), 'total_exchanges'],
            [
              models.sequelize.fn('SUM', models.sequelize.col('total_points')),
              'total_points_spent'
            ]
          ],
          raw: true
        }),

        // 消费记录统计
        (async () => {
          try {
            if (models.ConsumptionRecord) {
              return await models.ConsumptionRecord.findAll({
                where: this._buildSafeWhereCondition(models.ConsumptionRecord, user_id),
                attributes: [
                  [
                    models.sequelize.fn('COUNT', models.sequelize.col('*')),
                    'total_consumptions'
                  ],
                  [
                    models.sequelize.fn('SUM', models.sequelize.col('consumption_amount')),
                    'total_amount'
                  ],
                  [
                    models.sequelize.fn('SUM', models.sequelize.col('points_to_award')),
                    'total_points'
                  ]
                ],
                raw: true
              })
            } else {
              return [{ total_consumptions: 0, total_amount: 0, total_points: 0 }]
            }
          } catch (error) {
            console.warn('⚠️ ConsumptionRecord查询失败（可能表不存在）:', error.message)
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
        lottery_wins: parseInt(lotteryStats[0]?.winning_draws || 0),
        lottery_win_rate:
          lotteryStats[0]?.total_draws > 0
            ? (((lotteryStats[0]?.winning_draws || 0) / lotteryStats[0]?.total_draws) * 100).toFixed(
              1
            ) + '%'
            : '0%',

        // 库存统计
        inventory_total: parseInt(inventoryStats[0]?.total_items || 0),
        inventory_available: parseInt(inventoryStats[0]?.available_items || 0),

        // 积分统计
        total_points_earned: parseInt(pointsStats[0]?.total_earned || 0),
        total_points_consumed: parseInt(pointsStats[0]?.total_consumed || 0),
        points_balance: pointsAccount?.available_points || 0,
        transaction_count: parseInt(pointsStats[0]?.total_transactions || 0),

        // 兑换统计
        exchange_count: parseInt(exchangeStats[0]?.total_exchanges || 0),
        exchange_points_spent: parseInt(exchangeStats[0]?.total_points_spent || 0),

        // 消费记录统计
        consumption_count: parseInt(consumptionStats[0]?.total_consumptions || 0),
        consumption_amount: parseFloat(consumptionStats[0]?.total_amount || 0),
        consumption_points: parseInt(consumptionStats[0]?.total_points || 0),

        // 活跃度评分（简单算法）
        activity_score: Math.min(
          100,
          Math.floor(
            parseInt(lotteryStats[0]?.total_draws || 0) * 2 +
              parseInt(exchangeStats[0]?.total_exchanges || 0) * 3 +
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
      if (statistics.lottery_win_rate && parseFloat(statistics.lottery_win_rate) >= 30) {
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
      console.error('获取用户统计失败:', {
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
   * 获取简单的系统状态信息（Public API）
   *
   * 业务场景：
   * - 公开的系统状态接口
   * - 提供基础的系统统计信息
   *
   * @returns {Promise<Object>} 系统状态信息
   * @returns {number} return.total_users - 用户总数
   * @returns {number} return.active_announcements - 活跃公告数
   * @returns {number} return.pending_feedbacks - 待处理反馈数
   */
  static async getSystemStatus () {
    try {
      // 并行查询系统状态统计（使用Promise.allSettled实现错误隔离）
      const results = await Promise.allSettled([
        models.User.count(), // 用户总数
        models.SystemAnnouncement.count({ where: { is_active: true } }), // 活跃公告数
        models.Feedback.count({ where: { status: 'pending' } }) // 待处理反馈数
      ])

      // 安全提取查询结果，失败时使用默认值0
      const totalUsers = results[0].status === 'fulfilled' ? results[0].value : 0
      const activeAnnouncements = results[1].status === 'fulfilled' ? results[1].value : 0
      const pendingFeedbacks = results[2].status === 'fulfilled' ? results[2].value : 0

      // 记录失败的查询（便于排查问题）
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const queryNames = ['User.count', 'SystemAnnouncement.count', 'Feedback.count']
          console.error(`❌ 系统状态统计查询失败 - ${queryNames[index]}:`, result.reason.message)
        }
      })

      return {
        total_users: totalUsers,
        active_announcements: activeAnnouncements,
        pending_feedbacks: pendingFeedbacks
      }
    } catch (error) {
      console.error('获取系统状态失败:', error)
      throw error
    }
  }

  /**
   * 获取系统概览统计（管理员专用）
   *
   * 业务场景：
   * - 管理后台首页显示系统概览
   * - 监控系统整体运行状态
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
            [models.sequelize.fn('COUNT', models.sequelize.col('*')), 'total_users'],
            [
              models.sequelize.fn(
                'COUNT',
                models.sequelize.literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
              ),
              'new_users_today'
            ],
            [
              models.sequelize.fn(
                'COUNT',
                models.sequelize.literal(
                  'CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END'
                )
              ),
              'active_users_24h'
            ]
          ],
          raw: true
        }),

        // 抽奖统计
        models.LotteryDraw.findAll({
          attributes: [
            [models.sequelize.fn('COUNT', models.sequelize.col('*')), 'total_draws'],
            [
              models.sequelize.fn(
                'COUNT',
                models.sequelize.literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
              ),
              'draws_today'
            ],
            [
              models.sequelize.fn(
                'COUNT',
                models.sequelize.literal('CASE WHEN is_winner = 1 THEN 1 END')
              ),
              'total_wins'
            ]
          ],
          raw: true
        }),

        // 积分统计（过滤已删除记录）
        models.PointsTransaction.findAll({
          where: {
            is_deleted: 0
          },
          attributes: [
            [
              models.sequelize.fn(
                'SUM',
                models.sequelize.literal(
                  'CASE WHEN transaction_type = "earn" THEN points_amount ELSE 0 END'
                )
              ),
              'total_points_issued'
            ],
            [
              models.sequelize.fn(
                'SUM',
                models.sequelize.literal(
                  'CASE WHEN transaction_type = "consume" THEN points_amount ELSE 0 END'
                )
              ),
              'total_points_consumed'
            ],
            [
              models.sequelize.fn(
                'COUNT',
                models.sequelize.literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
              ),
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
          total_wins: parseInt(lotteryStats[0]?.total_wins || 0),
          win_rate:
            lotteryStats[0]?.total_draws > 0
              ? (((lotteryStats[0]?.total_wins || 0) / lotteryStats[0]?.total_draws) * 100).toFixed(
                1
              ) + '%'
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
      console.error('获取系统概览失败:', error)
      throw error
    }
  }
}

module.exports = UserDashboardService
