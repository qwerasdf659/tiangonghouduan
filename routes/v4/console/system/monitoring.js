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
 * 创建时间：2025-12-22
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
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('admin_system')

      // 调用服务层方法获取系统状态
      const statusInfo = await AdminSystemService.getSystemStatus(
        sharedComponents.lotteryEngine,
        sharedComponents.performanceMonitor
      )

      return res.apiSuccess(statusInfo, '系统状态获取成功')
    } catch (error) {
      sharedComponents.logger.error('系统状态获取失败', { error: error.message })
      return res.apiInternalError('系统状态获取失败', error.message, 'SYSTEM_STATUS_ERROR')
    }
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
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('admin_system')

      // 调用服务层方法获取仪表板数据
      const dashboardData = await AdminSystemService.getDashboardData(
        sharedComponents.lotteryEngine,
        sharedComponents.performanceMonitor
      )

      return res.apiSuccess(dashboardData, '仪表板数据获取成功')
    } catch (error) {
      sharedComponents.logger.error('仪表板数据获取失败', { error: error.message })
      return res.apiInternalError('仪表板数据获取失败', error.message, 'DASHBOARD_ERROR')
    }
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
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('admin_system')

      // 调用服务层方法获取管理策略状态
      const result = await AdminSystemService.getManagementStatus(
        sharedComponents.managementStrategy
      )

      if (result.success) {
        return res.apiSuccess(result.data, '管理状态获取成功')
      } else {
        return res.apiError(result.error || '管理状态获取失败', 'MANAGEMENT_STATUS_FAILED')
      }
    } catch (error) {
      sharedComponents.logger.error('管理状态获取失败', { error: error.message })
      return res.apiInternalError('管理状态获取失败', error.message, 'MANAGEMENT_STATUS_ERROR')
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
    try {
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
    } catch (error) {
      sharedComponents.logger.error('[系统监控] API性能统计获取失败', { error: error.message })
      return res.apiInternalError('API性能统计获取失败', error.message, 'API_PERFORMANCE_ERROR')
    }
  })
)

module.exports = router
