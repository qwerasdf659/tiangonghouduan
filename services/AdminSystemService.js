/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 管理后台系统监控服务（AdminSystemService）
 *
 * 业务场景：管理后台系统监控的完整生命周期，包括系统状态、仪表板数据、管理策略状态等
 *
 * 核心功能：
 * 1. 系统状态管理（系统运行状态、数据库连接、引擎状态）
 * 2. 仪表板数据管理（用户统计、抽奖统计、系统概览）
 * 3. 管理策略状态（抽奖管理策略状态查询）
 *
 * 业务流程：
 *
 * 1. **系统状态查询流程**
 *    - 获取系统统计信息 → 检查数据库连接 → 获取引擎状态 → 返回状态信息
 *
 * 2. **仪表板数据查询流程**
 *    - 获取基础统计 → 获取今日详细统计 → 获取引擎性能 → 返回仪表板数据
 *
 * 3. **管理策略状态查询流程**
 *    - 查询管理策略实例 → 获取策略状态 → 返回策略信息
 *
 * 设计原则：
 * - **数据统一**：所有系统监控数据通过Service层统一处理
 * - **性能优化**：使用Promise.all并行查询，提升查询效率
 * - **错误隔离**：单个模块失败不影响其他模块
 * - **时间统一**：统一使用BeijingTimeHelper处理时间
 *
 * 关键方法列表：
 * - getSystemStatus(sequelize, lotteryEngine, performanceMonitor) - 获取系统状态
 * - getDashboardData(sequelize, lotteryEngine, performanceMonitor) - 获取仪表板数据
 * - getManagementStatus(managementStrategy) - 获取管理策略状态
 *
 * 数据模型关联：
 * - User：用户表
 * - LotteryDraw：抽奖记录表
 * - CustomerServiceSession：客服会话表
 * - ChatMessage：聊天消息表
 *
 * 使用示例：
 * ```javascript
 * // 示例1：获取系统状态
 * const status = await AdminSystemService.getSystemStatus(
 *   lotteryEngine,
 *   performanceMonitor
 * );
 *
 * // 示例2：获取仪表板数据
 * const dashboard = await AdminSystemService.getDashboardData(
 *   lotteryEngine,
 *   performanceMonitor
 * );
 *
 * // 示例3：获取管理策略状态
 * const managementStatus = await AdminSystemService.getManagementStatus(
 *   managementStrategy
 * );
 * ```
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const models = require('../models')
const { Op } = require('sequelize')

const logger = new Logger('AdminSystemService')

/**
 * 管理后台系统监控服务类
 */
class AdminSystemService {
  /**
   * 获取系统状态
   *
   * @param {Object} lotteryEngine - 抽奖引擎实例（可选）
   * @param {Object} performanceMonitor - 性能监控器实例（可选）
   * @returns {Promise<Object>} 系统状态信息
   * @returns {Object} return.system - 系统统计信息
   * @returns {Object} return.database - 数据库连接状态
   * @returns {Object} return.lottery_engine - 抽奖引擎状态
   * @returns {Object} return.api - API版本信息
   */
  static async getSystemStatus (lotteryEngine = null, performanceMonitor = null) {
    try {
      logger.info('获取系统状态')

      // 获取系统统计信息
      const systemStats = await this._getSimpleSystemStats()

      // 获取数据库连接状态
      let dbStatus = 'connected'
      try {
        await models.sequelize.authenticate()
      } catch (error) {
        dbStatus = 'disconnected'
        logger.error('数据库连接检查失败', { error: error.message })
      }

      // 获取抽奖引擎状态
      const engineStatus = {
        initialized: !!lotteryEngine,
        strategies: {
          management: !!lotteryEngine
        },
        performance: performanceMonitor && performanceMonitor.getStats
          ? performanceMonitor.getStats()
          : {}
      }

      const statusInfo = {
        system: systemStats.system,
        database: {
          status: dbStatus,
          host: process.env.DB_HOST,
          database: process.env.DB_NAME
        },
        lottery_engine: engineStatus,
        api: {
          version: '4.0.0',
          last_check: BeijingTimeHelper.apiTimestamp()
        }
      }

      logger.info('系统状态获取成功')

      return statusInfo
    } catch (error) {
      logger.error('系统状态获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取管理员仪表板数据
   *
   * @param {Object} _lotteryEngine - 抽奖引擎实例（预留参数，暂未使用）
   * @param {Object} performanceMonitor - 性能监控器实例（可选）
   * @returns {Promise<Object>} 仪表板数据
   * @returns {Object} return.overview - 总览数据
   * @returns {Object} return.today - 今日数据
   * @returns {Object} return.customer_service - 客服数据
   * @returns {Object} return.system - 系统信息
   * @returns {Object} return.engine - 引擎性能
   * @returns {string} return.last_updated - 最后更新时间
   */
  static async getDashboardData (_lotteryEngine = null, performanceMonitor = null) {
    try {
      logger.info('获取仪表板数据')

      // 获取基础统计
      const systemStats = await this._getSimpleSystemStats()

      // 获取今日详细统计
      const today = BeijingTimeHelper.createBeijingTime()
      const todayStart = new Date(today.setHours(0, 0, 0, 0))

      const [
        todayLotteries,
        todayWins,
        todayNewUsers,
        todayCustomerSessions,
        todayMessages,
        todayPointsConsumed
      ] = await Promise.all([
        // 今日抽奖次数
        models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日中奖次数
        models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            },
            is_winner: true
          }
        }),
        // 今日新增用户
        models.User.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日客服会话数量
        models.CustomerServiceSession.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日聊天消息数量
        models.ChatMessage.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日积分消耗（所有抽奖消耗的积分总和）
        models.LotteryDraw.sum('cost_points', {
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }) || 0
      ])

      // 获取抽奖引擎性能统计
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
          win_rate: systemStats.lottery.win_rate
        },
        today: {
          new_users: todayNewUsers,
          lottery_draws: todayLotteries,
          wins: todayWins,
          win_rate: todayLotteries > 0 ? ((todayWins / todayLotteries) * 100).toFixed(2) : '0.00',
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

      logger.info('仪表板数据获取成功')

      return dashboardData
    } catch (error) {
      logger.error('仪表板数据获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取管理策略状态
   *
   * @param {Object} managementStrategy - 管理策略实例
   * @returns {Promise<Object>} 管理策略状态
   */
  static async getManagementStatus (managementStrategy) {
    try {
      logger.info('获取管理策略状态')

      if (!managementStrategy) {
        throw new Error('管理策略未初始化')
      }

      const result = await managementStrategy.getStatus()

      logger.info('管理策略状态获取成功')

      return result
    } catch (error) {
      logger.error('管理策略状态获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取简单的系统统计信息
   * @private
   * @returns {Promise<Object>} 系统统计信息
   */
  static async _getSimpleSystemStats () {
    try {
      // 并行查询统计数据
      const [totalUsers, activeUsers, totalLotteries, totalWins] = await Promise.all([
        models.User.count(),
        models.User.count({
          where: {
            last_login: {
              [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30天内活跃
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

      const winRate = totalLotteries > 0 ? ((totalWins / totalLotteries) * 100).toFixed(2) : '0.00'

      return {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        lottery: {
          total: totalLotteries,
          wins: totalWins,
          win_rate: winRate
        },
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

module.exports = AdminSystemService
