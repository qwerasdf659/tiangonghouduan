/**
 * 抽奖管理模块 - 用户状态查询和清理API
 *
 * 业务范围：
 * - 查询用户抽奖控制状态
 * - 清理用户抽奖设置
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 使用 AdminLotteryCoreService (admin_lottery_core) 封装核心干预逻辑（V4.7.0 拆分后）
 *
 */

const express = require('express')
const router = express.Router()
const TransactionManager = require('../../../../utils/TransactionManager')
const { adminAuthMiddleware, asyncHandler, validators } = require('../shared/middleware')

/**
 * GET /user-status/:user_id - 查询用户抽奖控制状态
 *
 * @description 获取用户当前的抽奖控制设置，包括强制中奖、不中奖、概率调整等
 * @route GET /api/v4/console/lottery-management/user-status/:user_id
 * @access Private (需要管理员权限)
 */
router.get(
  '/user-status/:user_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id } = req.params

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      // 通过 ServiceManager 获取 AdminLotteryCoreService（V4.7.0 拆分后：核心干预操作）
      const AdminLotteryCoreService = req.app.locals.services.getService('admin_lottery_core')

      // 🔧 V4.3修复：调用正确的服务层方法名 getUserManagementStatus
      const result = await AdminLotteryCoreService.getUserManagementStatus(validatedUserId)

      return res.apiSuccess(result, '用户抽奖控制状态查询成功')
    } catch (error) {
      if (error.message.includes('无效的') || error.code === 'USER_NOT_FOUND') {
        return res.apiError(error.message, error.code || 'VALIDATION_ERROR')
      }
      return res.apiInternalError('用户状态查询失败', error.message, 'USER_STATUS_QUERY_ERROR')
    }
  })
)

/**
 * DELETE /clear-user-settings/:user_id - 清理用户抽奖设置
 *
 * @description 清除用户的所有抽奖控制设置（强制中奖、不中奖、概率调整）
 * @route DELETE /api/v4/console/lottery-management/clear-user-settings/:user_id
 * @access Private (需要管理员权限)
 */
router.delete(
  '/clear-user-settings/:user_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id } = req.params
      const { reason = '管理员主动清理' } = req.body || {}

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      // 通过 ServiceManager 获取 AdminLotteryCoreService（V4.7.0 拆分后：核心干预操作）
      const AdminLotteryCoreService = req.app.locals.services.getService('admin_lottery_core')

      // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
      const result = await TransactionManager.execute(
        async transaction => {
          return await AdminLotteryCoreService.clearUserSettings(
            req.user?.user_id || req.user?.id,
            validatedUserId,
            null, // settingType: null表示清除所有设置
            reason,
            { transaction }
          )
        },
        { description: 'clearUserSettings' }
      )

      return res.apiSuccess(result, '用户抽奖设置清理成功')
    } catch (error) {
      if (error.message.includes('无效的') || error.code === 'USER_NOT_FOUND') {
        return res.apiError(error.message, error.code || 'VALIDATION_ERROR')
      }
      return res.apiInternalError('用户设置清理失败', error.message, 'USER_SETTINGS_CLEAR_ERROR')
    }
  })
)

module.exports = router
