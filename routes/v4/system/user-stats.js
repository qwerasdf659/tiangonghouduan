/**
 * 天工商户营销平台 V4.0 - 用户统计API路由
 *
 * 功能：
 * - 获取用户个人统计数据
 *
 * 路由前缀：/api/v4/system
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const dataAccessControl = require('../../../middleware/dataAccessControl')

/**
 * @route GET /api/v4/system/user/statistics/:user_id
 * @desc 获取用户个人统计数据
 * @access Private
 *
 * @param {number} user_id - 用户ID
 *
 * @returns {Object} 用户统计数据
 *
 * 权限验证：
 * - 普通用户只能查看自己的统计
 * - 管理员可以查看任何用户的统计
 */
router.get(
  '/user/statistics/:user_id',
  authenticateToken,
  dataAccessControl,
  asyncHandler(async (req, res) => {
    const { user_id: rawUserId } = req.params

    // 🔥 方案A步骤1：类型转换和验证（P0 - 安全性和稳定性风险）
    const user_id = parseInt(rawUserId, 10)

    // 🔥 有效性检查
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('无效的用户ID格式，必须为正整数', 'INVALID_PARAMETER', null, 400)
    }

    // 🔥 范围检查（可选 - 防止枚举攻击）
    if (user_id > 1000000) {
      // 根据实际业务调整
      return res.apiError('用户ID超出有效范围', 'INVALID_PARAMETER', null, 400)
    }

    const currentUserId = req.user.user_id
    const hasAdminAccess = req.role_level >= 100

    // 权限检查：只能查看自己的统计或管理员（role_level >= 100）查看任何用户
    if (user_id !== currentUserId && !hasAdminAccess) {
      return res.apiError('无权限查看其他用户统计', 'FORBIDDEN', null, 403)
    }

    // 🔄 通过 ServiceManager 获取 UserStatsService（V4.7.1 服务拆分）
    const UserStatsService = req.app.locals.services.getService('reporting_user_stats')

    const statistics = await UserStatsService.getUserStatistics(user_id, hasAdminAccess)

    return res.apiSuccess(
      {
        statistics
      },
      '获取用户统计成功'
    )
  })
)

/*
 * 注：管理员系统概览已迁至 GET /api/v4/console/dashboard/overview
 * （2026-07-11 技术债务方案 四.6：管理员功能统一挂 console 域，不再错挂 system 域）
 */

module.exports = router
