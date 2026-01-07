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
const TransactionManager = require('../../../utils/TransactionManager')
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('./shared/middleware')

/**
 * GET /settings/:category - 获取指定分类的所有设置
 *
 * @description 获取某个分类下的所有配置项（如基础设置、抽奖设置等）
 * @route GET /api/v4/console/settings/basic
 * @route GET /api/v4/console/settings/lottery
 * @route GET /api/v4/console/settings/points
 * @route GET /api/v4/console/settings/notification
 * @route GET /api/v4/console/settings/security
 * @access Private (需要管理员权限)
 */
router.get(
  '/settings/:category',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { category } = req.params

      // 获取管理后台系统服务（P2-C架构重构：已合并SystemSettingsService）
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

      // 调用服务层方法（服务层负责验证和数据查询）
      const result = await AdminSystemService.getSettingsByCategory(category)

      sharedComponents.logger.info('管理员查询系统设置', {
        admin_id: req.user.user_id,
        category,
        count: result.count
      })

      return res.apiSuccess(result, `${category}设置获取成功`)
    } catch (error) {
      sharedComponents.logger.error('获取系统设置失败', {
        error: error.message,
        category: req.params.category
      })

      // 处理业务错误
      if (error.message.includes('无效的设置分类')) {
        return res.apiError(error.message, 'INVALID_CATEGORY', null, 400)
      }

      return res.apiInternalError('获取系统设置失败', error.message, 'SETTINGS_GET_ERROR')
    }
  })
)

/**
 * PUT /settings/:category - 批量更新指定分类的设置
 *
 * @description 批量更新某个分类下的配置项
 * @route PUT /api/v4/console/settings/basic
 * @route PUT /api/v4/console/settings/lottery
 * @route PUT /api/v4/console/settings/points
 * @route PUT /api/v4/console/settings/notification
 * @route PUT /api/v4/console/settings/security
 * @access Private (需要管理员权限)
 *
 * @body {Object} settings - 要更新的配置项键值对
 * @body.example { "system_name": "新系统名称", "customer_phone": "400-123-4567" }
 */
router.put(
  '/settings/:category',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { category } = req.params
      const { settings: settingsToUpdate } = req.body

      // 获取管理后台系统服务（P2-C架构重构：已合并SystemSettingsService）
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

      /*
       * 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
       * 缓存失效已在 Service 层处理（决策7：失效逻辑归 Service 层）
       */
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

      // 根据更新结果返回响应
      if (result.error_count === result.total_requested) {
        return res.apiError('所有设置项更新失败', 'ALL_SETTINGS_UPDATE_FAILED', result, 400)
      }

      return res.apiSuccess(result, `${category}设置更新完成`)
    } catch (error) {
      sharedComponents.logger.error('更新系统设置失败', {
        error: error.message,
        category: req.params.category
      })

      // 处理业务错误
      if (error.message.includes('无效的设置分类')) {
        return res.apiError(error.message, 'INVALID_CATEGORY', null, 400)
      }
      if (error.message.includes('请提供要更新的设置项')) {
        return res.apiError(error.message, 'INVALID_SETTINGS_DATA', null, 400)
      }

      return res.apiInternalError('更新系统设置失败', error.message, 'SETTINGS_UPDATE_ERROR')
    }
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
    try {
      // 获取管理后台系统服务（P2-C架构重构）
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

      // 调用服务层方法
      const summary = await AdminSystemService.getSettingsSummary()

      return res.apiSuccess(summary, '系统设置概览获取成功')
    } catch (error) {
      sharedComponents.logger.error('获取系统设置概览失败', {
        error: error.message
      })
      return res.apiInternalError('获取系统设置概览失败', error.message, 'SETTINGS_SUMMARY_ERROR')
    }
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
    try {
      const { pattern, confirm } = req.body

      // 安全确认机制
      if (confirm !== true) {
        return res.apiError(
          '清除缓存需要确认，请设置confirm=true',
          'CACHE_CLEAR_NOT_CONFIRMED',
          null,
          400
        )
      }

      // 获取管理后台系统服务（P2-C架构重构）
      const AdminSystemService = req.app.locals.services.getService('adminSystem')

      // 调用服务层方法（服务层负责Redis操作）
      const result = await AdminSystemService.clearCache(pattern)

      sharedComponents.logger.warn('管理员清除系统缓存', {
        admin_id: req.user.user_id,
        pattern: result.pattern,
        cleared_count: result.cleared_count,
        total_keys: result.matched_keys
      })

      return res.apiSuccess(result, '缓存清除成功')
    } catch (error) {
      sharedComponents.logger.error('清除缓存失败', { error: error.message })
      return res.apiInternalError('清除缓存失败', error.message, 'CACHE_CLEAR_ERROR')
    }
  })
)

module.exports = router
