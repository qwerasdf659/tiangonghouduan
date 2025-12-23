/**
 * 抽奖管理模块 - 用户状态查询和清理API
 *
 * 业务范围：
 * - 查询用户抽奖控制状态
 * - 清理用户抽奖设置
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 使用 AdminLotteryService 封装所有抽奖管理逻辑
 *
 * 创建时间：2025-12-22
 * 来源：从 lottery_management.js 拆分
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler, validators } = require('../shared/middleware')

/**
 * GET /user-status/:user_id - 查询用户抽奖控制状态
 *
 * @description 获取用户当前的抽奖控制设置，包括强制中奖、不中奖、概率调整等
 * @route GET /api/v4/admin/lottery-management/user-status/:user_id
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

      // 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 🔧 V4.3修复：调用正确的服务层方法名 getUserManagementStatus
      const result = await AdminLotteryService.getUserManagementStatus(validatedUserId)

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
 * @route DELETE /api/v4/admin/lottery-management/clear-user-settings/:user_id
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

      // 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 🔧 V4.3修复：调用正确的服务层方法名 clearUserSettings，参数顺序为(adminId, userId, settingType, reason)
      const result = await AdminLotteryService.clearUserSettings(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        null, // settingType: null表示清除所有设置
        reason
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
