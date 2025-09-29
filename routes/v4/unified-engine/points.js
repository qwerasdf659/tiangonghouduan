/**
 * 积分管理路由 - V4.0 统一版本
 * 🛡️ 权限管理：只有超级管理员(admin)和普通用户(user)两种角色
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const user_service = require('../../../services/lottery/LotteryUserService')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * GET /balance/:userId - 获取用户积分余额
 *
 * @description 获取指定用户的积分余额信息
 * @route GET /api/v4/unified-engine/points/balance/:userId
 * @access Private (需要认证)
 */
router.get('/balance/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const current_user_id = req.user.id

    // 🛡️ 权限检查：只能查询自己的积分，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (parseInt(userId) !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户积分', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取用户积分信息
    const points_info = await user_service.get_user_points(parseInt(userId))

    return res.apiSuccess({
      user_id: parseInt(userId),
      available_points: points_info.available_points,
      total_earned: points_info.total_earned,
      total_consumed: points_info.total_consumed,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }, '积分余额查询成功')
  } catch (error) {
    console.error('积分余额查询失败:', error)
    return res.apiInternalError('积分余额查询失败', error.message, 'POINTS_BALANCE_ERROR')
  }
})

/**
 * GET /transactions/:userId - 获取用户积分交易历史
 *
 * @description 获取用户的积分交易记录，支持分页
 * @route GET /api/v4/unified-engine/points/transactions/:userId
 * @access Private (需要认证)
 */
router.get('/transactions/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const { page = 1, limit = 20, type } = req.query
    const current_user_id = req.user.id

    // 🛡️ 权限检查：只能查询自己的交易记录，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (parseInt(userId) !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户交易记录', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取交易记录
    const transactions = await user_service.get_user_transactions(parseInt(userId), {
      page: parseInt(page),
      limit: parseInt(limit),
      type
    })

    return res.apiSuccess({
      user_id: parseInt(userId),
      transactions: transactions.data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: transactions.total,
        pages: Math.ceil(transactions.total / parseInt(limit))
      },
      timestamp: BeijingTimeHelper.apiTimestamp()
    }, '积分交易记录查询成功')
  } catch (error) {
    console.error('积分交易记录查询失败:', error)
    return res.apiInternalError('积分交易记录查询失败', error.message, 'POINTS_TRANSACTIONS_ERROR')
  }
})

/**
 * POST /admin/adjust - 管理员调整用户积分
 *
 * @description 管理员专用接口，用于调整用户积分
 * @route POST /api/v4/unified-engine/points/admin/adjust
 * @access Private (需要超级管理员权限)
 */
router.post('/admin/adjust', authenticateToken, async (req, res) => {
  try {
    const { user_id, amount, reason, type = 'admin_adjust' } = req.body
    const admin_id = req.user.id

    // 🛡️ 权限检查：只有超级管理员可以调整积分
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限执行此操作', 'PERMISSION_DENIED', {}, 403)
    }

    // 参数验证
    if (!user_id || !amount || !reason) {
      return res.apiError('用户ID、积分数量和调整原因不能为空', 'INVALID_PARAMS', {}, 400)
    }

    if (typeof amount !== 'number' || amount === 0) {
      return res.apiError('积分数量必须是非零数字', 'INVALID_PARAMS', {}, 400)
    }

    // 执行积分调整
    const result = await user_service.admin_adjust_points(user_id, amount, reason, admin_id, type)

    return res.apiSuccess({
      user_id,
      adjustment: {
        amount,
        type,
        reason,
        admin_id,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      new_balance: result.new_balance
    }, '积分调整成功')
  } catch (error) {
    console.error('管理员积分调整失败:', error)
    return res.apiInternalError('积分调整失败', error.message, 'ADMIN_POINTS_ADJUST_ERROR')
  }
})

/**
 * GET /admin/statistics - 获取积分统计信息
 *
 * @description 管理员专用接口，获取积分系统统计信息
 * @route GET /api/v4/unified-engine/points/admin/statistics
 * @access Private (需要超级管理员权限)
 */
router.get('/admin/statistics', authenticateToken, async (req, res) => {
  try {
    const admin_id = req.user.id

    // 🛡️ 权限检查：只有超级管理员可以查看统计信息
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限查看统计信息', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取积分统计信息
    const statistics = await user_service.get_points_statistics()

    return res.apiSuccess({
      statistics,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }, '积分统计信息获取成功')
  } catch (error) {
    console.error('获取积分统计失败:', error)
    return res.apiInternalError('获取积分统计失败', error.message, 'POINTS_STATISTICS_ERROR')
  }
})

module.exports = router
