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
 * @route GET /api/v4/admin/status
 * @access Private (需要管理员权限)
 */
router.get(
  '/status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

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
 * @route GET /api/v4/admin/dashboard
 * @access Private (需要管理员权限)
 */
router.get(
  '/dashboard',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

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
 * @route GET /api/v4/admin/management-status
 * @access Private (需要管理员权限)
 */
router.get(
  '/management-status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 获取系统监控服务
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

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

module.exports = router
