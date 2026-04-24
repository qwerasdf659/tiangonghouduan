/**
 * 系统监控服务（SystemMonitoringService）
 *
 * @description 从 AdminSystemService 拆分而来，负责系统监控/仪表盘相关功能
 *
 * 核心功能：
 * 1. 系统状态查询（数据库连接、引擎状态、系统统计）
 * 2. 仪表板数据聚合（用户统计、抽奖统计、客服统计）
 * 3. 管理策略状态查询
 *
 * 拆分日期：2026-04-24
 */

const BusinessError = require('../utils/BusinessError')
const BeijingTimeHelper = require('../utils/timeHelper')
const models = require('../models')
const { Op } = require('sequelize')
const logger = require('../utils/logger').logger

/**
 * 系统监控服务
 * @class SystemMonitoringService
 */
class SystemMonitoringService {
  /**
   * 获取系统状态（数据库连接、抽奖引擎、性能监控）
   * @param {Object|null} lotteryEngine - 抽奖引擎实例
   * @param {Object|null} performanceMonitor - 性能监控实例
   * @returns {Promise<Object>} 系统状态信息
   */
  static async getSystemStatus(lotteryEngine = null, performanceMonitor = null) {
    try {
      logger.info('获取系统状态')
      const systemStats = await this._getSimpleSystemStats()
      let dbStatus = 'connected'
      try {
        await models.sequelize.authenticate()
      } catch (error) {
        dbStatus = 'disconnected'
        logger.error('数据库连接检查失败', { error: error.message })
      }
      const engineStatus = {
        initialized: !!lotteryEngine,
        strategies: { management: !!lotteryEngine },
        performance:
          performanceMonitor && performanceMonitor.getStats ? performanceMonitor.getStats() : {}
      }
      // STUB_STATUS_RETURN
      const statusInfo = {
        system: systemStats.system,
        database: { status: dbStatus, host: process.env.DB_HOST, database: process.env.DB_NAME },
        lottery_engine: engineStatus,
        api: { version: '4.0.0', last_check: BeijingTimeHelper.apiTimestamp() }
      }
      logger.info('系统状态获取成功')
      return statusInfo
    } catch (error) {
      logger.error('系统状态获取失败', { error: error.message })
      throw error
    }
  }

  // STUB_DASHBOARD
  /**
   * 获取仪表板聚合数据（用户/抽奖/客服/系统/引擎统计）
   * @param {Object|null} _lotteryEngine - 抽奖引擎实例（当前未使用）
   * @param {Object|null} performanceMonitor - 性能监控实例
   * @returns {Promise<Object>} 仪表板数据
   */
  static async getDashboardData(_lotteryEngine = null, performanceMonitor = null) {
    try {
      logger.info('获取仪表板数据')
      const systemStats = await this._getSimpleSystemStats()
      const today = BeijingTimeHelper.createBeijingTime()
      const todayStart = new Date(today.setHours(0, 0, 0, 0))
      const [
        todayLotteries, todayWins, todayNewUsers,
        todayCustomerSessions, todayMessages, todayPointsConsumedRaw
      ] = await Promise.all([
        models.LotteryDraw.count({ where: { created_at: { [Op.gte]: todayStart } } }),
        models.LotteryDraw.count({ where: { created_at: { [Op.gte]: todayStart }, reward_tier: 'high' } }),
        models.User.count({ where: { created_at: { [Op.gte]: todayStart } } }),
        models.CustomerServiceSession.count({ where: { created_at: { [Op.gte]: todayStart } } }),
        models.ChatMessage.count({ where: { created_at: { [Op.gte]: todayStart } } }),
        models.LotteryDraw.sum('cost_points', { where: { created_at: { [Op.gte]: todayStart } } })
      ])
      // STUB_DASHBOARD_RESULT
      const todayPointsConsumed = Number(todayPointsConsumedRaw) || 0
      let engineStats = {}
      try {
        if (performanceMonitor && performanceMonitor.getDetailedStats) {
          engineStats = performanceMonitor.getDetailedStats()
        }
      } catch (error) {
        logger.warn('获取引擎统计失败', { error: error.message })
      }
      const dashboardData = {
        overview: {
          total_users: systemStats.users.total,
          active_users: systemStats.users.active,
          total_lotteries: systemStats.lottery.total,
          high_tier_rate: systemStats.lottery.high_tier_rate
        },
        // STUB_DASHBOARD_TODAY
        today: {
          new_users: todayNewUsers,
          lottery_draws: todayLotteries,
          high_tier_wins: todayWins,
          high_tier_rate:
            todayLotteries > 0 ? ((todayWins / todayLotteries) * 100).toFixed(2) : '0.00',
          points_consumed: todayPointsConsumed
        },
        customer_service: {
          today_sessions: todayCustomerSessions || 0,
          today_messages: todayMessages || 0
        },
        system: {
          uptime: systemStats.system.uptime,
          memory_usage: systemStats.system.memory,
          cpu_usage: systemStats.system.cpu_usage,
          timestamp: systemStats.system.timestamp
        },
        engine: engineStats,
        last_updated: BeijingTimeHelper.apiTimestamp()
      }
      return dashboardData
    } catch (error) {
      logger.error('仪表板数据获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取管理策略运行状态
   * @param {Object} managementStrategy - 管理策略实例
   * @returns {Promise<Object>} 策略状态
   */
  static async getManagementStatus(managementStrategy) {
    try {
      logger.info('获取管理策略状态')
      if (!managementStrategy) {
        throw new BusinessError('管理策略未初始化', 'SERVICE_NOT_CONFIGURED', 500)
      }
      const result = await managementStrategy.getStatus()
      logger.info('管理策略状态获取成功')
      return result
    } catch (error) {
      logger.error('管理策略状态获取失败', { error: error.message })
      throw error
    }
  }

  // STUB_SIMPLE_STATS
  /**
   * 获取基础系统统计（用户数/抽奖数/系统资源）
   * @returns {Promise<Object>} 系统统计数据
   */
  static async _getSimpleSystemStats() {
    try {
      const [totalUsers, activeUsers, totalLotteries, totalHighTierWins] = await Promise.all([
        models.User.count(),
        models.User.count({
          where: { last_login: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
        }),
        models.LotteryDraw.count(),
        models.LotteryDraw.count({ where: { reward_tier: 'high' } })
      ])
      const highTierRate =
        totalLotteries > 0 ? ((totalHighTierWins / totalLotteries) * 100).toFixed(2) : '0.00'
      return {
        users: { total: totalUsers, active: activeUsers },
        lottery: { total: totalLotteries, high_tier_wins: totalHighTierWins, high_tier_rate: highTierRate },
        // STUB_SYSTEM_INFO
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu_usage: require('os').loadavg()[0],
          timestamp: BeijingTimeHelper.apiTimestamp()
        }
      }
    } catch (error) {
      logger.error('获取系统统计信息失败', { error: error.message })
      throw error
    }
  }
}

module.exports = SystemMonitoringService
