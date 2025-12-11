/**
 * 数据分析模块
 *
 * @description 数据分析相关路由，包括决策分析、统计报表、趋势分析等
 * @version 4.0.0
 * @date 2025-09-24
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler
} = require('./shared/middleware')

/**
 * GET /decisions/analytics - 获取决策分析数据
 *
 * @description 获取抽奖引擎的决策分析数据和统计信息
 * @route GET /api/v4/admin/analytics/decisions/analytics
 * @access Private (需要管理员权限)
 */
router.get(
  '/decisions/analytics',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { days = 7, user_filter } = req.query

      // 获取数据分析服务
      const AdminAnalyticsService = req.app.locals.services.getService('adminAnalytics')

      // 调用服务层方法获取决策分析数据
      const analyticsData = await AdminAnalyticsService.getDecisionAnalytics(
        parseInt(days),
        user_filter ? parseInt(user_filter) : null,
        sharedComponents.performanceMonitor
      )

      sharedComponents.logger.info('决策分析数据生成成功', {
        period_days: analyticsData.period.days,
        total_draws: analyticsData.overview.total_draws,
        admin_id: req.user?.user_id
      })

      return res.apiSuccess(analyticsData, '决策分析数据获取成功')
    } catch (error) {
      sharedComponents.logger.error('决策分析数据获取失败', { error: error.message })
      return res.apiInternalError('决策分析数据获取失败', error.message, 'ANALYTICS_ERROR')
    }
  })
)

/**
 * GET /lottery/trends - 获取抽奖趋势分析
 *
 * @description 获取抽奖活动的趋势分析数据
 * @route GET /api/v4/admin/analytics/lottery/trends
 * @access Private (需要管理员权限)
 */
router.get(
  '/lottery/trends',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { period = 'week', granularity = 'daily' } = req.query

      // 获取数据分析服务
      const AdminAnalyticsService = req.app.locals.services.getService('adminAnalytics')

      // 调用服务层方法获取趋势分析数据
      const trendsData = await AdminAnalyticsService.getLotteryTrends(period, granularity)

      return res.apiSuccess(trendsData, '趋势分析数据获取成功')
    } catch (error) {
      sharedComponents.logger.error('趋势分析数据获取失败', { error: error.message })
      return res.apiInternalError('趋势分析数据获取失败', error.message, 'TRENDS_ANALYTICS_ERROR')
    }
  })
)

/**
 * GET /performance/report - 获取系统性能报告
 *
 * @description 获取系统性能和引擎运行报告
 * @route GET /api/v4/admin/analytics/performance/report
 * @access Private (需要管理员权限)
 */
router.get(
  '/performance/report',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 获取数据分析服务
      const AdminAnalyticsService = req.app.locals.services.getService('adminAnalytics')

      // 调用服务层方法获取性能报告
      const performanceReport = await AdminAnalyticsService.getPerformanceReport(
        sharedComponents.performanceMonitor,
        sharedComponents.lotteryEngine
      )

      return res.apiSuccess(performanceReport, '性能报告获取成功')
    } catch (error) {
      sharedComponents.logger.error('性能报告获取失败', { error: error.message })
      return res.apiInternalError('性能报告获取失败', error.message, 'PERFORMANCE_REPORT_ERROR')
    }
  })
)

/**
 * GET /stats/today - 获取管理员今日统计数据
 *
 * @description 获取今日系统运营数据统计，包括用户活动、抽奖数据、积分数据等
 * @route GET /api/v4/admin/analytics/stats/today
 * @access Private (需要管理员权限)
 */
router.get(
  '/stats/today',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      sharedComponents.logger.info('管理员请求今日统计数据', {
        admin_id: req.user.user_id
      })

      // 获取数据分析服务
      const AdminAnalyticsService = req.app.locals.services.getService('adminAnalytics')

      // 调用服务层方法获取今日统计数据
      const todayStats = await AdminAnalyticsService.getTodayStats()

      sharedComponents.logger.info('管理员今日统计数据获取成功', {
        admin_id: req.user.user_id,
        stats_summary: {
          new_users: todayStats.user_stats.new_users_today,
          draws: todayStats.lottery_stats.draws_today,
          active_users: todayStats.user_stats.active_users_today
        }
      })

      return res.apiSuccess(todayStats, '今日统计数据获取成功')
    } catch (error) {
      sharedComponents.logger.error('管理员今日统计获取失败', {
        admin_id: req.user.user_id,
        error: error.message,
        stack: error.stack
      })
      return res.apiInternalError('今日统计数据获取失败', error.message, 'ADMIN_TODAY_STATS_ERROR')
    }
  })
)

module.exports = router
