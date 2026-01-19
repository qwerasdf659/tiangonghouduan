/**
 * 餐厅积分抽奖系统 V4.0 - 用户积分和统计API路由
 *
 * 功能：
 * - 获取用户积分信息
 * - 获取用户抽奖统计
 * - 抽奖系统健康检查
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
const { pointsRateLimiter } = require('./middleware')

/**
 * @route GET /api/v4/lottery/points/:user_id
 * @desc 获取用户积分信息
 * @access Private (需要认证 + 限流保护60次/分钟)
 *
 * @param {number} user_id - 用户ID
 *
 * @returns {Object} 用户积分信息
 *
 * 安全防护：
 * - 限流保护：60次/分钟/用户
 * - 审计日志：记录管理员查询他人积分的操作
 */
router.get('/points/:user_id', authenticateToken, pointsRateLimiter, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)

    // 🔴 P0优化：参数验证
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('user_id参数无效，必须为正整数', 'INVALID_USER_ID', {}, 400)
    }

    // 🛡️ 权限检查：只能查看自己的积分，除非是超级管理员（role_level >= 100）
    const currentUserRoles = await getUserRoles(req.user.user_id)
    const hasAdminAccess = currentUserRoles.role_level >= 100
    if (req.user.user_id !== user_id && !hasAdminAccess) {
      return res.apiError('无权查看其他用户的积分信息', 'ACCESS_DENIED', {}, 403)
    }

    // ✅ 审计日志：记录管理员查询他人积分的操作（安全审计和合规性要求）
    if (hasAdminAccess && req.user.user_id !== user_id) {
      logger.warn('[Audit] 管理员查询他人积分', {
        operator_id: req.user.user_id, // 操作者（管理员）
        operator_mobile: req.user.mobile, // 操作者手机号
        target_user_id: user_id, // 被查询的用户ID
        action: 'query_user_points', // 操作类型
        ip: req.ip, // 请求来源IP
        user_agent: req.headers['user-agent'], // 请求客户端
        timestamp: BeijingTimeHelper.now() // 北京时间
      })
    }

    // ✅ 通过UserService验证用户和积分账户（不再直连models）
    const UserService = req.app.locals.services.getService('user')
    const { user: _user, points_account: points_info } = await UserService.getUserWithPoints(
      user_id,
      {
        checkPointsAccount: true,
        checkStatus: true
      }
    )

    return res.apiSuccess(points_info, '用户积分获取成功', 'POINTS_SUCCESS')
  } catch (error) {
    // 详细错误日志（包含上下文信息，便于调试）
    logger.error('[Points API] 获取用户积分失败', {
      user_id: req.params.user_id,
      requester: req.user?.user_id,
      error: error.message,
      stack: error.stack,
      timestamp: BeijingTimeHelper.now()
    })
    return handleServiceError(error, res, '获取用户积分失败')
  }
})

/**
 * @route GET /api/v4/lottery/statistics/:user_id
 * @desc 获取用户抽奖统计
 * @access Private
 *
 * @param {number} user_id - 用户ID
 *
 * @returns {Object} 用户抽奖统计数据（V4.0语义）
 *
 * 返回数据结构（V4.0语义更新）：
 * - user_id: 用户ID
 * - total_draws: 总抽奖次数
 * - total_high_tier_wins: 总高档奖励次数（V4.0语义）
 * - guarantee_wins: 保底触发次数
 * - normal_high_tier_wins: 正常高档奖励次数
 * - high_tier_rate: 高档奖励率（百分比数字，V4.0语义）
 * - today_draws: 今日抽奖次数
 * - today_high_tier_wins: 今日高档奖励次数
 * - today_high_tier_rate: 今日高档奖励率（V4.0语义）
 * - total_points_cost: 总消耗积分
 * - reward_tier_distribution: 奖励档位分布（V4.0语义）
 * - last_high_tier_win: 最近一次高档奖励记录
 */
router.get('/statistics/:user_id', authenticateToken, async (req, res) => {
  try {
    // 📊 解析用户ID参数（URL路径参数转换为整数）
    const user_id = parseInt(req.params.user_id)

    /*
     * 🛡️ 权限检查（Access Control - 严格权限验证）：
     * 业务规则1：普通用户只能查看自己的统计（user_id必须匹配JWT token中的用户ID）
     * 业务规则2：超级管理员admin（role_level >= 100）可以查看任何用户的统计（用于后台管理和数据分析）
     * 安全保障：防止用户A查看用户B的统计数据，保护用户隐私
     */
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && currentUserRoles.role_level < 100) {
      return res.apiError('无权查看其他用户的统计信息', 'ACCESS_DENIED', {}, 403)
    }

    /*
     * 📡 调用统一抽奖引擎的统计服务（核心业务逻辑在Service层）
     * 服务层方法：UnifiedLotteryEngine.get_user_statistics(user_id)
     */
    const lottery_engine = req.app.locals.services.getService('unified_lottery_engine')
    const statistics = await lottery_engine.get_user_statistics(user_id)

    /*
     * ✅ 成功返回统计数据（使用统一的API响应格式ApiResponse）
     */
    return res.apiSuccess(statistics, '统计信息获取成功', 'STATISTICS_SUCCESS')
  } catch (error) {
    // ❌ 错误处理（记录错误日志并返回友好的错误信息）
    logger.error('获取统计信息失败:', error)
    return handleServiceError(error, res, '获取统计信息失败')
  }
})

/**
 * @route GET /api/v4/lottery/health
 * @desc 抽奖系统健康检查
 * @access Public
 *
 * @returns {Object} 系统健康状态
 */
/**
 * V4.6 抽奖系统健康检查（Pipeline 架构）
 *
 * 2026-01-19 Phase 5 迁移：
 * - 更新为 Pipeline 管线名称
 * - 保留 ManagementStrategy 用于管理 API
 */
router.get('/health', (req, res) => {
  try {
    return res.apiSuccess(
      {
        status: 'healthy',
        service: 'V4.6统一抽奖引擎',
        version: '4.6.0',
        architecture: 'pipeline',
        pipelines: ['NormalDrawPipeline'], // Phase 5：统一管线
        decision_sources: ['normal', 'preset', 'override'], // 决策来源类型
        management_strategy: 'ManagementStrategy',
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      'V4.6抽奖系统运行正常（Phase 5 统一管线架构）'
    )
  } catch (error) {
    logger.error('抽奖系统健康检查失败:', error)
    return handleServiceError(error, res, '抽奖系统健康检查失败')
  }
})

module.exports = router
