/**
 * 餐厅积分抽奖系统 V4.0 - 用户信息API
 *
 * 业务范围：
 * - 获取当前登录用户信息
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 使用统一响应 res.apiSuccess / res.apiError
 *
 * 创建时间：2025-12-22
 * 来源：从 auth.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 🛡️ 获取当前用户信息
 * GET /api/v4/auth/profile
 *
 * 返回当前登录用户的完整信息（需要认证）
 */
router.get('/profile', authenticateToken, async (req, res) => {
  const user_id = req.user.user_id

  // 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  // 使用 UserService 获取用户信息（含状态验证）
  const user = await UserService.getUserWithValidation(user_id)

  // 获取用户角色信息
  const userRoles = await getUserRoles(user_id)

  const responseData = {
    user: {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      role_based_admin: userRoles.isAdmin,
      roles: userRoles.roles,
      status: user.status,
      consecutive_fail_count: user.consecutive_fail_count,
      history_total_points: user.history_total_points,
      created_at: BeijingTimeHelper.formatToISO(user.created_at),
      last_login: BeijingTimeHelper.formatToISO(user.last_login),
      login_count: user.login_count
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  return res.apiSuccess(responseData, '用户信息获取成功')
})

module.exports = router
