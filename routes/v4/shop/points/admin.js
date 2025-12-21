/**
 * 积分管理员模块 - 管理员专用操作API
 *
 * @route /api/v4/shop/points/admin
 * @description 管理员专用的积分操作功能
 *
 * API清单：
 * - POST /adjust - 管理员调整用户积分（增加/扣除）
 *
 * 创建时间：2025年12月22日
 * 从原points.js拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * POST /adjust - 管理员调整用户积分
 *
 * @description 管理员专用接口，用于调整用户积分（增加或扣除）
 * @route POST /api/v4/shop/points/admin/adjust
 * @access Private (需要超级管理员权限)
 *
 * @body {number} user_id - 目标用户ID
 * @body {number} amount - 调整数量（正数增加，负数扣除）
 * @body {string} reason - 调整原因
 * @body {string} type - 调整类型（默认admin_adjust）
 * @body {string} request_id - 请求ID（用于幂等性）
 */
router.post('/adjust', authenticateToken, async (req, res) => {
  try {
    const PointsService = req.app.locals.services.getService('points')

    const { user_id, amount, reason, type = 'admin_adjust', request_id } = req.body
    const admin_id = req.user.user_id

    // 权限检查：只有超级管理员可以调整积分
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限执行此操作', 'PERMISSION_DENIED', {}, 403)
    }

    // 参数验证：user_id 必须为有效正整数
    const target_user_id = parseInt(user_id)
    if (isNaN(target_user_id) || target_user_id <= 0) {
      return res.apiError('user_id参数无效，必须为正整数', 'INVALID_USER_ID', {}, 400)
    }

    // 调用 Service 层执行积分调整
    const result = await PointsService.adminAdjustPoints({
      admin_id,
      user_id: target_user_id,
      amount,
      reason,
      type,
      request_id
    })

    return res.apiSuccess(result, '积分调整成功')
  } catch (error) {
    logger.error('❌ 管理员积分调整失败:', error)
    return handleServiceError(error, res, '积分调整失败')
  }
})

module.exports = router
