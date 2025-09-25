/**
 * V4统一抽奖引擎API路由
 *
 * @description 直接使用UnifiedLotteryEngine，简化架构
 * @version 4.0.0
 * @date 2025-09-25
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')

// ✅ 直接使用UnifiedLotteryEngine，移除多余的包装层
const UnifiedLotteryEngine = require('../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
const { lottery_service_container } = require('../../../services/lottery')

// 使用服务容器中的用户服务和历史服务（保留有用的服务）
const user_service = lottery_service_container.get_user_service()
const history_service = lottery_service_container.get_history_service()

// 直接实例化UnifiedLotteryEngine（避免重复实例化）
const lottery_engine = new UnifiedLotteryEngine({
  engineVersion: '4.0.0',
  enableMetrics: true,
  enableCache: true
})

/**
 * 基础保底抽奖 API
 * POST /api/v4/unified-engine/lottery/draw
 *
 * @description 统一的抽奖接口，单次消耗100积分，第10次保底获得奖品
 */
router.post('/draw', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id
    const lottery_params = req.body

    // 检查用户积分（统一为100积分）
    const has_enough_points = await user_service.check_user_points(user_id, 100)
    if (!has_enough_points) {
      return res.apiError('积分不足，需要100积分进行抽奖', 'INSUFFICIENT_POINTS', {}, 400)
    }

    // ✅ 基础保底抽奖上下文
    const context = {
      user_id,
      strategy_type: 'basic_guarantee',
      ...lottery_params,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    const result = await lottery_engine.executeLottery(context)

    return res.apiSuccess(result, '基础保底抽奖执行成功', 'LOTTERY_SUCCESS')
  } catch (error) {
    console.error('基础保底抽奖失败:', error)
    return res.apiError(error.message, 'LOTTERY_ERROR', {}, 500)
  }
})

/**
 * 管理员预设抽奖 API
 * POST /api/v4/unified-engine/lottery/admin-preset
 */
router.post('/admin-preset', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id
    const { target_user_id, preset_config } = req.body

    // 检查管理员权限（这里应该有权限验证）
    // TODO: 添加管理员权限验证

    // ✅ 管理员预设抽奖上下文
    const context = {
      user_id: target_user_id || user_id,
      operation_type: 'admin_preset',
      admin_user_id: user_id,
      preset_config,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    const result = await lottery_engine.executeLottery(context)

    return res.apiSuccess(result, '管理员预设抽奖执行成功', 'ADMIN_PRESET_SUCCESS')
  } catch (error) {
    console.error('管理员预设抽奖失败:', error)
    return res.apiError(error.message, 'ADMIN_PRESET_ERROR', {}, 500)
  }
})

/**
 * 获取抽奖历史
 * GET /api/v4/unified-engine/lottery/history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id
    const { page = 1, limit = 20 } = req.query

    const history = await history_service.get_user_lottery_history(user_id, {
      page: parseInt(page),
      limit: parseInt(limit)
    })

    return res.apiSuccess(history, '抽奖历史获取成功', 'LOTTERY_HISTORY_SUCCESS')
  } catch (error) {
    console.error('获取抽奖历史失败:', error)
    return res.apiError(error.message, 'LOTTERY_HISTORY_ERROR', {}, 500)
  }
})

/**
 * 获取抽奖统计
 * GET /api/v4/unified-engine/lottery/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id

    const stats = await history_service.get_user_lottery_stats(user_id)

    return res.apiSuccess(stats, '抽奖统计获取成功', 'LOTTERY_STATS_SUCCESS')
  } catch (error) {
    console.error('获取抽奖统计失败:', error)
    return res.apiError(error.message, 'LOTTERY_STATS_ERROR', {}, 500)
  }
})

/**
 * 获取引擎状态（调试接口）
 * GET /api/v4/unified-engine/lottery/engine-status
 */
router.get('/engine-status', authenticateToken, async (req, res) => {
  try {
    const health_status = lottery_engine.getHealthStatus()
    const metrics = lottery_engine.getMetrics()

    return res.apiSuccess({
      health: health_status,
      metrics,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }, '引擎状态获取成功', 'ENGINE_STATUS_SUCCESS')
  } catch (error) {
    console.error('获取引擎状态失败:', error)
    return res.apiError(error.message, 'ENGINE_STATUS_ERROR', {}, 500)
  }
})

/**
 * 获取用户积分信息 API
 * GET /api/v4/unified-engine/lottery/points/:userId
 */
router.get('/points/:userId', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.userId)

    // 权限检查
    if (req.user.id !== user_id && !req.user.is_admin) {
      return res.apiError('无权查看其他用户的积分信息', 'ACCESS_DENIED', {}, 403)
    }

    // 获取用户积分信息
    const points_info = await user_service.get_user_points(user_id)
    return res.apiSuccess(points_info, '用户积分获取成功', 'POINTS_SUCCESS')
  } catch (error) {
    console.error('获取用户积分失败:', error)
    return res.apiError(error.message, 'POINTS_ERROR', {}, 500)
  }
})

/**
 * 获取用户资料 API
 * GET /api/v4/unified-engine/lottery/user/profile
 */
router.get('/user/profile', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id
    const profile = await user_service.get_user_profile(user_id)
    return res.apiSuccess(profile, '用户资料获取成功', 'PROFILE_SUCCESS')
  } catch (error) {
    console.error('获取用户资料失败:', error)
    return res.apiError(error.message, 'PROFILE_ERROR', {}, 500)
  }
})

/**
 * 获取用户当前积分 API
 * GET /api/v4/unified-engine/lottery/user/points
 */
router.get('/user/points', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id
    const points_info = await user_service.get_user_points(user_id)
    return res.apiSuccess(points_info, '当前用户积分获取成功', 'USER_POINTS_SUCCESS')
  } catch (error) {
    console.error('获取当前用户积分失败:', error)
    return res.apiError(error.message, 'USER_POINTS_ERROR', {}, 500)
  }
})

/**
 * 获取支持的抽奖策略列表 API
 * GET /api/v4/unified-engine/lottery/strategies
 */
router.get('/strategies', async (req, res) => {
  try {
    const engine_status = lottery_engine.getHealthStatus() // 直接使用UnifiedLotteryEngine的getHealthStatus
    const strategies_info = {
      strategies: engine_status.strategies,
      engine_version: engine_status.engine_version
    }
    return res.apiSuccess(strategies_info, '抽奖策略列表获取成功', 'STRATEGIES_SUCCESS')
  } catch (error) {
    console.error('获取策略列表失败:', error)
    return res.apiError(error.message, 'STRATEGIES_ERROR', {}, 500)
  }
})

/**
 * 健康检查 API
 * GET /api/v4/unified-engine/lottery/health
 */
router.get('/health', async (req, res) => {
  try {
    const health_status = lottery_engine.getHealthStatus() // 直接使用UnifiedLotteryEngine的getHealthStatus
    const health_info = {
      status: 'healthy',
      engine_version: health_status.engine_version,
      strategies_count: health_status.strategies.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
    return res.apiSuccess(health_info, 'V4统一抽奖引擎健康状态正常', 'LOTTERY_HEALTH_OK')
  } catch (error) {
    console.error('抽奖引擎健康检查失败:', error)
    const error_info = {
      status: 'unhealthy',
      error: error.message
    }
    return res.apiError('抽奖引擎健康检查失败', 'LOTTERY_HEALTH_ERROR', error_info, 500)
  }
})

/**
 * 全局错误处理中间件
 */
router.use((error, req, res, _next) => {
  console.error('抽奖路由全局错误:', error)
  const error_message = process.env.NODE_ENV === 'development' ? error.message : '系统内部错误'
  return res.apiError(error_message, 'INTERNAL_ERROR', {}, 500)
})

module.exports = router
