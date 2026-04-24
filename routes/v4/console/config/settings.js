/**
 * 系统设置管理路由模块
 *
 * @description 系统配置管理相关路由（基础设置、抽奖设置、积分设置、通知设置、安全设置）
 * @version 4.0.0
 * @date 2025-11-23 北京时间
 * @updated 2026-01-05（事务边界治理改造）
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 通过 ServiceManager 统一获取服务实例
 */

const express = require('express')
const router = express.Router()
const TransactionManager = require('../../../../utils/TransactionManager')
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('../shared/middleware')

/**
 * GET /settings/:code - 获取指定分类的所有设置
 *
 * @description 获取某个分类下的所有配置项（如基础设置、抽奖设置等）
 * @route GET /api/v4/console/settings/basic
 * @route GET /api/v4/console/settings/lottery
 * @route GET /api/v4/console/settings/points
 * @route GET /api/v4/console/settings/notification
 * @route GET /api/v4/console/settings/security
 * @access Private (需要管理员权限)
 *
 * API路径参数设计规范 V2.2：
 * - 系统设置是配置实体，使用业务码（:code）作为标识符
 * - 业务码格式：lowercase（如 basic, lottery, points）
 */
router.get(
  '/settings/:code',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const category = req.params.code

    const AdminSystemService = req.app.locals.services.getService('admin_system')

    const result = await AdminSystemService.getSettingsByCategory(category)

    sharedComponents.logger.info('管理员查询系统设置', {
      admin_id: req.user.user_id,
      category,
      count: result.count
    })

    return res.apiSuccess(result, `${category}设置获取成功`)
  })
)

/**
 * PUT /settings/:code - 批量更新指定分类的设置
 *
 * @description 批量更新某个分类下的配置项
 * @route PUT /api/v4/console/settings/basic
 * @route PUT /api/v4/console/settings/lottery
 * @route PUT /api/v4/console/settings/points
 * @route PUT /api/v4/console/settings/notification
 * @route PUT /api/v4/console/settings/security
 * @access Private (需要管理员权限)
 *
 * API路径参数设计规范 V2.2：
 * - 系统设置是配置实体，使用业务码（:code）作为标识符
 * - 业务码格式：lowercase（如 basic, lottery, points）
 *
 * @body {Object} settings - 要更新的配置项键值对
 * @body.example { "system_name": "新系统名称", "customer_phone": "400-123-4567" }
 */
router.put(
  '/settings/:code',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const category = req.params.code
    const { settings: settingsToUpdate } = req.body

    const AdminSystemService = req.app.locals.services.getService('admin_system')

    const result = await TransactionManager.execute(
      async transaction => {
        return await AdminSystemService.updateSettings(
          category,
          settingsToUpdate,
          req.user.user_id,
          { transaction }
        )
      },
      { description: 'updateSettings' }
    )

    if (result.error_count === result.total_requested) {
      return res.apiError('所有设置项更新失败', 'ALL_SETTINGS_UPDATE_FAILED', result, 400)
    }

    return res.apiSuccess(result, `${category}设置更新完成`)
  })
)

/**
 * GET /settings - 获取所有分类的设置概览
 *
 * @description 获取所有分类的配置项数量和基本信息
 * @route GET /api/v4/console/settings
 * @access Private (需要管理员权限)
 */
router.get(
  '/settings',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')

    const summary = await AdminSystemService.getSettingsSummary()

    return res.apiSuccess(summary, '系统设置概览获取成功')
  })
)

/**
 * POST /cache/clear - 清除系统缓存
 *
 * @description 清除Redis缓存（支持清除所有缓存或指定模式的缓存）
 * @route POST /api/v4/console/cache/clear
 * @access Private (需要管理员权限)
 *
 * @body {string} pattern - 缓存key模式（可选，如"rate_limit:*"，不提供则清除所有）
 * @body {boolean} confirm - 确认清除（必须为true）
 */
router.post(
  '/cache/clear',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { pattern, confirm } = req.body

    if (confirm !== true) {
      return res.apiError(
        '清除缓存需要确认，请设置confirm=true',
        'CACHE_CLEAR_NOT_CONFIRMED',
        null,
        400
      )
    }

    const AdminSystemService = req.app.locals.services.getService('admin_system')

    const result = await AdminSystemService.clearCache(pattern)

    sharedComponents.logger.warn('管理员清除系统缓存', {
      admin_id: req.user.user_id,
      pattern: result.pattern,
      cleared_count: result.cleared_count,
      total_keys: result.matched_keys
    })

    return res.apiSuccess(result, '缓存清除成功')
  })
)

module.exports = router
