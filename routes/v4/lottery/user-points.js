/**
 * 餐厅积分抽奖系统 V4.0 - 用户积分和统计API路由
 *
 * 功能：
 * - 获取当前登录用户的积分信息（从JWT Token取身份）
 * - 获取当前登录用户的抽奖统计（从JWT Token取身份）
 * - 抽奖系统健康检查
 *
 * 路由前缀：/api/v4/lottery
 *
 * 安全设计（路由分离方案 V4.8.0）：
 * - 用户端路由不含 :user_id 参数，身份纯从 JWT Token 获取
 * - 管理员查看他人数据走 /api/v4/console/lottery-user-analysis/
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年2月12日（路由分离方案 - 抽奖接口安全改造）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { pointsRateLimiter } = require('./middleware')

/**
 * @route GET /api/v4/lottery/points
 * @desc 获取当前登录用户的积分信息
 * @access Private（JWT Token 认证 + 限流保护60次/分钟）
 *
 * @returns {Object} 用户积分信息
 *
 * 安全设计（路由分离方案 V4.8.0）：
 * - 用户端路由不含 :user_id 参数，身份纯从 JWT Token 获取
 * - 管理员查看他人积分走 /api/v4/console/lottery-user-analysis/points/:user_id
 */
router.get('/points', authenticateToken, pointsRateLimiter, async (req, res) => {
  try {
    const user_id = req.user.user_id

    const UserService = req.app.locals.services.getService('user')
    const AssetQueryService = req.app.locals.services.getService('asset_query')

    // 并行查询积分账户 + 今日收支汇总，减少响应延迟
    const [pointsResult, todaySummary] = await Promise.all([
      UserService.getUserWithPoints(user_id, {
        checkPointsAccount: true,
        checkStatus: true
      }),
      AssetQueryService.getTodaySummary({ user_id, asset_code: 'POINTS' })
    ])

    const responseData = {
      ...pointsResult.points_account,
      today_summary: {
        today_earned: todaySummary.today_earned,
        today_consumed: todaySummary.today_consumed,
        transaction_count: todaySummary.transaction_count
      }
    }

    return res.apiSuccess(responseData, '用户积分获取成功', 'POINTS_SUCCESS')
  } catch (error) {
    logger.error('[Points API] 获取用户积分失败', {
      user_id: req.user?.user_id,
      error: error.message,
      stack: error.stack,
      timestamp: BeijingTimeHelper.now()
    })
    return handleServiceError(error, res, '获取用户积分失败')
  }
})

/**
 * @route GET /api/v4/lottery/statistics
 * @desc 获取当前登录用户的抽奖统计
 * @access Private（JWT Token 认证）
 *
 * @returns {Object} 用户抽奖统计数据（V4.0语义）
 *
 * 返回数据结构：
 * - user_id: 用户ID
 * - total_draws: 总抽奖次数
 * - total_high_tier_wins: 总高档奖励次数
 * - high_tier_rate: 高档奖励率
 * - today_draws: 今日抽奖次数
 * - reward_tier_distribution: 奖励档位分布
 *
 * 安全设计（路由分离方案 V4.8.0）：
 * - 用户端路由不含 :user_id 参数，身份纯从 JWT Token 获取
 * - 管理员查看他人统计走 /api/v4/console/lottery-user-analysis/statistics/:user_id
 */
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    // 通过 ServiceManager 获取 LotteryQueryService
    const LotteryQueryService = req.app.locals.services.getService('lottery_query')
    const statistics = await LotteryQueryService.getUserStatistics(user_id)

    return res.apiSuccess(statistics, '统计信息获取成功', 'STATISTICS_SUCCESS')
  } catch (error) {
    logger.error('获取统计信息失败', {
      user_id: req.user?.user_id,
      error: error.message,
      stack: error.stack,
      timestamp: BeijingTimeHelper.now()
    })
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
