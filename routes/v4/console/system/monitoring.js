/**
 * 管理后台 - 系统监控模块
 *
 * 业务范围：
 * - 系统状态监控
 * - 管理员仪表板
 * - 管理策略状态
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 *
 */

const express = require('express')
const router = express.Router()
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('../shared/middleware')

/**
 * GET /status - 获取系统状态
 *
 * @description 获取系统运行状态、数据库连接状态、Redis状态等
 * @route GET /api/v4/console/status
 * @access Private (需要管理员权限)
 */
router.get(
  '/status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    // 获取系统监控服务
    const SystemMonitoringService = req.app.locals.services.getService('system_monitoring')

    const statusInfo = await SystemMonitoringService.getSystemStatus(
      sharedComponents.lotteryEngine,
      sharedComponents.performanceMonitor
    )

    return res.apiSuccess(statusInfo, '系统状态获取成功')
  })
)

/**
 * GET /dashboard - 获取管理员仪表板数据
 *
 * @description 获取管理员仪表板展示数据，包括用户统计、抽奖统计、系统概览
 * @route GET /api/v4/console/dashboard
 * @access Private (需要管理员权限)
 */
router.get(
  '/dashboard',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    // 获取系统监控服务
    const SystemMonitoringService = req.app.locals.services.getService('system_monitoring')

    const dashboardData = await SystemMonitoringService.getDashboardData(
      sharedComponents.lotteryEngine,
      sharedComponents.performanceMonitor
    )

    return res.apiSuccess(dashboardData, '仪表板数据获取成功')
  })
)

/**
 * GET /management-status - 获取管理策略状态
 *
 * @description 获取抽奖管理策略的当前状态和配置
 * @route GET /api/v4/console/management-status
 * @access Private (需要管理员权限)
 */
router.get(
  '/management-status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    // 获取系统监控服务
    const SystemMonitoringService = req.app.locals.services.getService('system_monitoring')

    const result = await SystemMonitoringService.getManagementStatus(
      sharedComponents.managementQueryStrategy
    )

    if (result.success) {
      return res.apiSuccess(result.data, '管理状态获取成功')
    } else {
      return res.apiError(result.error || '管理状态获取失败', 'MANAGEMENT_STATUS_FAILED')
    }
  })
)

/**
 * GET /api-performance - 获取API性能统计
 *
 * @description 获取API接口性能统计数据，包括响应时间、错误率、调用量等
 * @route GET /api/v4/console/system/api-performance
 * @access Private (需要管理员权限，role_level >= 100)
 *
 * @query {number} [hours=24] - 统计小时数（默认24小时）
 * @query {string} [endpoint] - 筛选指定端点（可选）
 *
 * @returns {Object} API性能统计数据
 * @returns {Object} data.summary - 汇总数据（平均响应时间、总请求数、错误率）
 * @returns {Array} data.endpoints - 各端点性能数据
 * @returns {Array} data.time_series - 时间序列数据
 * @returns {Array} data.slow_queries - 慢请求列表
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/system/api-performance?hours=24
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "summary": {
 *       "total_requests": 12580,
 *       "avg_response_ms": 85,
 *       "error_rate": 0.0023,
 *       "p95_response_ms": 250,
 *       "p99_response_ms": 500
 *     },
 *     "endpoints": [
 *       {
 *         "path": "/api/v4/lottery/draw",
 *         "method": "POST",
 *         "request_count": 3200,
 *         "avg_response_ms": 120,
 *         "error_count": 5
 *       }
 *     ],
 *     "time_series": [
 *       { "hour": "2026-02-03 14:00", "request_count": 520, "avg_response_ms": 75 }
 *     ],
 *     "slow_queries": [
 *       { "path": "/api/v4/reports/export", "response_ms": 2500, "timestamp": "..." }
 *     ],
 *     "updated_at": "2026-02-03T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * 关联需求：§4.6 API响应时间统计
 */
router.get(
  '/api-performance',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { hours = 24, endpoint } = req.query

    sharedComponents.logger.info('[系统监控] 获取API性能统计', {
      admin_id: req.user?.user_id,
      hours: parseInt(hours),
      endpoint
    })

    // 🔄 通过 ServiceManager 获取 APIPerformanceService
    const APIPerformanceService = req.app.locals.services.getService('api_performance')
    const result = await APIPerformanceService.getPerformanceStats({
      hours: parseInt(hours) || 24,
      endpoint: endpoint || null
    })

    return res.apiSuccess(result, '获取成功')
  })
)

/**
 * GET /sms-failure-stats - 获取短信发送失败统计（按 fail_code 聚合，O7 可观测）
 *
 * @description 运营查看某日短信发送失败情况（如"多少条因日限流/签名/模板未发出"），
 *              数据来源 Redis 按天聚合，验证码只走 Redis 不落库，与现有设计一致。
 * @route GET /api/v4/console/system/sms-failure-stats
 * @access Private (需要管理员权限)
 *
 * @query {string} [date] - 北京时间日期 YYYY-MM-DD，默认今天
 * @returns {Object} data.date - 日期
 * @returns {number} data.total - 当日失败总数
 * @returns {Object} data.by_fail_code - 各失败业务码次数映射
 */
router.get(
  '/sms-failure-stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { date } = req.query
    // 通过 ServiceManager 获取 SmsService（路由不直接 require 领域 Service）
    const SmsService = req.app.locals.services.getService('sms')
    const stats = await SmsService.getSendFailureStats(date)
    return res.apiSuccess(stats, '短信失败统计获取成功')
  })
)

module.exports = router
