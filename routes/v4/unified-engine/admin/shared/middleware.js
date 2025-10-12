/**
 * Admin模块共享中间件和工具函数
 *
 * @description 提供admin子模块共用的中间件、初始化组件和工具函数
 * @version 4.0.0
 * @date 2025-09-24
 */

const BeijingTimeHelper = require('../../../../../utils/timeHelper')
const models = require('../../../../../models')
const { UnifiedLotteryEngine } = require('../../../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
const ManagementStrategy = require('../../../../../services/UnifiedLotteryEngine/strategies/ManagementStrategy')
const PerformanceMonitor = require('../../../../../services/UnifiedLotteryEngine/utils/PerformanceMonitor')
const Logger = require('../../../../../services/UnifiedLotteryEngine/utils/Logger')
const { requireAdmin, authenticateToken } = require('../../../../../middleware/auth')
const { Op } = require('sequelize')

// 初始化共享组件
const sharedComponents = {
  lotteryEngine: new UnifiedLotteryEngine(),
  managementStrategy: new ManagementStrategy(),
  performanceMonitor: new PerformanceMonitor(),
  logger: new Logger('AdminAPIv4')
}

/**
 * ✅ 简化的系统统计函数 - 替代过度设计的DataCollector
 * @returns {Promise<Object>} 简化的系统统计信息
 */
async function getSimpleSystemStats () {
  const { User, LotteryDraw } = require('../../../../../models')
  const os = require('os')

  try {
    const today = BeijingTimeHelper.createBeijingTime()
    const todayStart = new Date(today.setHours(0, 0, 0, 0))

    // 并行获取基础统计
    const [totalUsers, activeUsers, newUsers, totalLotteries, winLotteries] = await Promise.all([
      User.count(),
      User.count({
        where: {
          last_login_at: {
            [Op.gte]: new Date(BeijingTimeHelper.timestamp() - 30 * 24 * 60 * 60 * 1000) // 30天内活跃
          }
        }
      }),
      User.count({
        where: {
          created_at: {
            [Op.gte]: todayStart
          }
        }
      }),
      LotteryDraw.count(),
      LotteryDraw.count({
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
        timestamp: BeijingTimeHelper.getCurrentTime()
      }
    }
  } catch (error) {
    console.error('获取系统统计失败:', error)
    throw error
  }
}

/**
 * 管理员权限验证中间件组合
 */
const adminAuthMiddleware = [authenticateToken, requireAdmin]

/**
 * 错误处理包装器
 * @param {Function} fn 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler (fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * 参数验证工具
 */
const validators = {
  /**
   * 验证用户ID
   */
  validateUserId: (user_id) => {
    if (!user_id || isNaN(parseInt(user_id))) {
      throw new Error('无效的用户ID')
    }
    return parseInt(user_id)
  },

  /**
   * 验证积分调整参数
   */
  validatePointsAdjustment: (points, reason) => {
    if (!points || isNaN(parseInt(points))) {
      throw new Error('无效的积分数量')
    }
    if (!reason || reason.trim().length === 0) {
      throw new Error('必须提供调整原因')
    }
    return {
      points: parseInt(points),
      reason: reason.trim()
    }
  },

  /**
   * 验证奖品池参数
   */
  validatePrizePool: (prizes) => {
    if (!Array.isArray(prizes) || prizes.length === 0) {
      throw new Error('奖品列表不能为空')
    }

    for (const prize of prizes) {
      if (!prize.name || !prize.type || !prize.quantity) {
        throw new Error('奖品信息不完整')
      }
      if (isNaN(parseInt(prize.quantity)) || parseInt(prize.quantity) <= 0) {
        throw new Error('奖品数量必须为正整数')
      }
    }
    return true
  }
}

module.exports = {
  sharedComponents,
  getSimpleSystemStats,
  adminAuthMiddleware,
  asyncHandler,
  validators,
  // 导出常用的依赖，避免重复引入
  models,
  BeijingTimeHelper,
  Op
}
