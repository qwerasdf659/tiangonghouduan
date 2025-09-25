/**
 * 系统监控模块
 *
 * @description 系统状态监控、仪表板和性能监控相关路由
 * @version 4.0.0
 * @date 2025-09-24
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  getSimpleSystemStats,
  adminAuthMiddleware,
  asyncHandler,
  models,
  BeijingTimeHelper
} = require('./shared/middleware')

/**
 * GET /status - 获取系统状态
 *
 * @description 获取系统运行状态、数据库连接状态、Redis状态等
 * @route GET /api/v4/unified-engine/admin/status
 * @access Private (需要管理员权限)
 */
router.get('/status', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    // 获取系统统计信息
    const systemStats = await getSimpleSystemStats()

    // 获取数据库连接状态
    let dbStatus = 'connected'
    try {
      await models.sequelize.authenticate()
    } catch (error) {
      dbStatus = 'disconnected'
      sharedComponents.logger.error('数据库连接检查失败', { error: error.message })
    }

    // 获取抽奖引擎状态
    const engineStatus = {
      initialized: !!sharedComponents.lotteryEngine,
      strategies: {
        management: !!sharedComponents.managementStrategy
      },
      performance: sharedComponents.performanceMonitor.getStats ? sharedComponents.performanceMonitor.getStats() : {}
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
        last_check: BeijingTimeHelper.getCurrentTime()
      }
    }

    return res.apiSuccess(statusInfo, '系统状态获取成功')
  } catch (error) {
    sharedComponents.logger.error('系统状态获取失败', { error: error.message })
    return res.apiInternalError('系统状态获取失败', error.message, 'SYSTEM_STATUS_ERROR')
  }
}))

/**
 * GET /dashboard - 获取管理员仪表板数据
 *
 * @description 获取管理员仪表板展示数据，包括用户统计、抽奖统计、系统概览
 * @route GET /api/v4/unified-engine/admin/dashboard
 * @access Private (需要管理员权限)
 */
router.get('/dashboard', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    // 获取基础统计
    const systemStats = await getSimpleSystemStats()

    // 获取今日详细统计
    const today = new Date()
    const todayStart = new Date(today.setHours(0, 0, 0, 0))

    const [todayLotteries, todayWins, todayNewUsers] = await Promise.all([
      models.LotteryDraw.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: todayStart
          }
        }
      }),
      models.LotteryDraw.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: todayStart
          },
          is_winner: true
        }
      }),
      models.User.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: todayStart
          }
        }
      })
    ])

    // 获取抽奖引擎性能统计
    let engineStats = {}
    try {
      if (sharedComponents.performanceMonitor.getDetailedStats) {
        engineStats = sharedComponents.performanceMonitor.getDetailedStats()
      }
    } catch (error) {
      sharedComponents.logger.warn('获取引擎统计失败', { error: error.message })
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
        win_rate: todayLotteries > 0 ? ((todayWins / todayLotteries) * 100).toFixed(2) : 0
      },
      system: {
        uptime: systemStats.system.uptime,
        memory_usage: systemStats.system.memory,
        cpu_usage: systemStats.system.cpu_usage,
        timestamp: systemStats.system.timestamp
      },
      engine: engineStats,
      last_updated: BeijingTimeHelper.getCurrentTime()
    }

    return res.apiSuccess(dashboardData, '仪表板数据获取成功')
  } catch (error) {
    sharedComponents.logger.error('仪表板数据获取失败', { error: error.message })
    return res.apiInternalError('仪表板数据获取失败', error.message, 'DASHBOARD_ERROR')
  }
}))

/**
 * GET /management-status - 获取管理策略状态
 *
 * @description 获取抽奖管理策略的当前状态和配置
 * @route GET /api/v4/unified-engine/admin/management-status
 * @access Private (需要管理员权限)
 */
router.get('/management-status', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const result = await sharedComponents.managementStrategy.getStatus()

    if (result.success) {
      return res.apiSuccess(result.data, '管理状态获取成功')
    } else {
      return res.apiError(result.error || '管理状态获取失败', 'MANAGEMENT_STATUS_FAILED')
    }
  } catch (error) {
    sharedComponents.logger.error('管理状态获取失败', { error: error.message })
    return res.apiInternalError('管理状态获取失败', error.message, 'MANAGEMENT_STATUS_ERROR')
  }
}))

module.exports = router
