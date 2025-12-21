/**
 * 餐厅积分抽奖系统 V4.0 - 用户统计和管理员概览API路由
 *
 * 功能：
 * - 获取用户个人统计数据
 * - 获取管理员系统概览
 *
 * 路由前缀：/api/v4/system
 *
 * 创建时间：2025年12月22日
 * 拆分自：system.js（符合Controller拆分规范 150-250行）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const BeijingTimeHelper = require('../../../utils/timeHelper')

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
router.get('/user/statistics/:user_id', authenticateToken, dataAccessControl, async (req, res) => {
  try {
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
    const isAdmin = req.isAdmin

    // 权限检查：只能查看自己的统计或管理员查看任何用户
    if (user_id !== currentUserId && !isAdmin) {
      return res.apiError('无权限查看其他用户统计', 'FORBIDDEN', null, 403)
    }

    // 🔄 通过 ServiceManager 获取 ReportingService（P2-C架构重构）
    const ReportingService = req.app.locals.services.getService('reporting')

    // ✅ 使用 ReportingService 获取用户统计数据
    const statistics = await ReportingService.getUserStatistics(user_id, isAdmin)

    return res.apiSuccess(
      {
        statistics
      },
      '获取用户统计成功'
    )
  } catch (error) {
    // 🔥 P1优化：详细错误日志记录（包含堆栈信息和请求上下文）
    logger.error('获取用户统计失败:', {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      user_id: req.params.user_id,
      current_user_id: req.user?.user_id,
      is_admin: req.isAdmin,
      timestamp: BeijingTimeHelper.now()
    })

    return handleServiceError(error, res, '获取用户统计失败')
  }
})

/**
 * @route GET /api/v4/system/admin/overview
 * @desc 获取管理员系统概览
 * @access Admin Only
 *
 * @returns {Object} 系统概览数据
 *
 * 权限验证：
 * - 仅管理员可访问
 */
router.get('/admin/overview', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.apiError('需要管理员权限', 'FORBIDDEN', null, 403)
    }

    // 🔄 通过 ServiceManager 获取 ReportingService（P2-C架构重构）
    const ReportingService = req.app.locals.services.getService('reporting')

    // ✅ 使用 ReportingService 获取系统概览
    const overview = await ReportingService.getSystemOverview()

    return res.apiSuccess(
      {
        overview
      },
      '获取系统概览成功'
    )
  } catch (error) {
    logger.error('获取系统概览失败:', error)
    return handleServiceError(error, res, '获取系统概览失败')
  }
})

module.exports = router
