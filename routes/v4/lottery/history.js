/**
 * 餐厅积分抽奖系统 V4.0 - 抽奖历史和活动API路由
 *
 * 功能：
 * - 获取用户抽奖历史
 * - 获取活动列表
 *
 * 路由前缀：/api/v4/lottery
 *
 * 创建时间：2025年12月22日
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * @route GET /api/v4/lottery/history/:user_id
 * @desc 获取用户抽奖历史
 * @access Private
 *
 * @param {number} user_id - 用户ID
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认20，最大50）
 *
 * @returns {Object} 抽奖历史记录
 *
 * 权限验证：
 * - 普通用户只能查看自己的历史
 * - 管理员可以查看任何用户的历史
 */
router.get('/history/:user_id', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)
    const { page = 1, limit = 20 } = req.query

    // 🎯 参数验证（防止NaN和负数）
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('user_id参数无效，必须为正整数', 'INVALID_USER_ID', {}, 400)
    }

    const finalPage = Math.max(parseInt(page) || 1, 1) // 确保page>=1
    const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50) // 确保1<=limit<=50

    // 🛡️ 权限检查：只能查看自己的抽奖历史，除非是超级管理员（role_level >= 100）
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && currentUserRoles.role_level < 100) {
      return res.apiError('无权查看其他用户的抽奖历史', 'ACCESS_DENIED', {}, 403)
    }

    // 获取抽奖历史
    const lottery_engine = req.app.locals.services.getService('unified_lottery_engine')
    const history = await lottery_engine.get_user_history(user_id, {
      page: finalPage,
      limit: finalLimit
    })

    return res.apiSuccess(history, '抽奖历史获取成功', 'HISTORY_SUCCESS')
  } catch (error) {
    // ✅ 完整错误上下文记录（服务端日志）
    logger.error('🔴 获取抽奖历史失败', {
      error_message: error.message,
      error_stack: error.stack, // 堆栈信息
      user_id: parseInt(req.params.user_id),
      current_user_id: req.user?.user_id,
      query_params: { page: req.query.page, limit: req.query.limit }, // 请求参数
      timestamp: BeijingTimeHelper.now() // 北京时间
    })

    return handleServiceError(error, res, '获取抽奖历史失败')
  }
})

/**
 * @route GET /api/v4/lottery/campaigns
 * @desc 获取活动列表
 * @access Private
 *
 * @query {string} status - 活动状态筛选（默认active）
 *
 * @returns {Object} 活动列表
 */
router.get('/campaigns', authenticateToken, async (req, res) => {
  try {
    const { status = 'active' } = req.query

    // 获取活动列表
    const lottery_engine = req.app.locals.services.getService('unified_lottery_engine')
    const campaigns = await lottery_engine.get_campaigns({
      status,
      user_id: req.user.user_id
    })

    return res.apiSuccess(campaigns, '活动列表获取成功', 'CAMPAIGNS_SUCCESS')
  } catch (error) {
    logger.error('获取活动列表失败:', error)
    return handleServiceError(error, res, '获取活动列表失败')
  }
})

module.exports = router
