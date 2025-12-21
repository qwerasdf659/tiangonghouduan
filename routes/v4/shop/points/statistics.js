/**
 * 积分统计模块 - 统计分析相关API
 *
 * @route /api/v4/shop/points
 * @description 处理积分统计分析功能，包括管理员全局统计和用户个人统计
 *
 * API清单：
 * - GET /admin/statistics         - 管理员获取积分系统全局统计
 * - GET /user/statistics/:user_id - 获取用户统计数据
 *
 * 创建时间：2025年12月22日
 * 从原points.js拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const logger = require('../../../../utils/logger').logger

/**
 * GET /admin/statistics - 获取积分系统全局统计信息
 *
 * @description 管理员专用接口，获取积分系统全局统计数据
 * @route GET /api/v4/shop/points/admin/statistics
 * @access Private (需要超级管理员权限)
 */
router.get('/admin/statistics', authenticateToken, async (req, res) => {
  const startTime = Date.now()

  try {
    const admin_id = req.user.user_id

    // 权限检查：只有超级管理员可以查看统计信息
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限查看统计信息', 'PERMISSION_DENIED', {}, 403)
    }

    const PointsService = req.app.locals.services.getService('points')

    logger.info('[AdminStatistics] 🔍 开始查询积分系统统计数据...')

    const { statistics } = await PointsService.getAdminStatistics()

    const queryTime = Date.now() - startTime
    logger.info(`[AdminStatistics] ✅ 数据库查询完成，耗时: ${queryTime}ms`)

    logger.info(
      `[AdminStatistics] 📊 统计数据摘要: 总账户${statistics.total_accounts}, 活跃${statistics.active_accounts}, 总交易${statistics.total_transactions}, 系统负债${statistics.total_balance}`
    )

    return res.apiSuccess(
      {
        statistics,
        timestamp: BeijingTimeHelper.apiTimestamp(),
        query_time_ms: queryTime
      },
      '积分统计信息获取成功'
    )
  } catch (error) {
    const queryTime = Date.now() - startTime
    logger.error(`[AdminStatistics] ❌ 获取积分统计失败: time=${queryTime}ms`, error)
    return handleServiceError(error, res, '获取积分统计失败')
  }
})

/**
 * GET /user/statistics/:user_id - 获取用户统计数据
 *
 * @description 获取用户的完整统计信息，包括抽奖、兑换、消费、库存等数据
 * @route GET /api/v4/shop/points/user/statistics/:user_id
 * @access Private (需要认证)
 */
router.get('/user/statistics/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id: rawUserId } = req.params

    // 参数验证：类型转换和有效性检查
    const user_id = parseInt(rawUserId, 10)

    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('无效的用户ID格式，必须为正整数', 'INVALID_PARAMETER', {}, 400)
    }

    // 范围检查（防止枚举攻击）
    if (user_id > 1000000) {
      return res.apiError('用户ID超出有效范围', 'INVALID_PARAMETER', {}, 400)
    }

    const current_user_id = req.user.user_id

    // 权限检查：只能查询自己的统计数据，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (user_id !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户统计', 'PERMISSION_DENIED', {}, 403)
    }

    const PointsService = req.app.locals.services.getService('points')

    const statistics = await PointsService.getUserStatisticsResponse(user_id)

    return res.apiSuccess(
      {
        statistics,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '用户统计数据获取成功'
    )
  } catch (error) {
    logger.error('获取用户统计失败:', error)
    return handleServiceError(error, res, '获取用户统计失败')
  }
})

module.exports = router
