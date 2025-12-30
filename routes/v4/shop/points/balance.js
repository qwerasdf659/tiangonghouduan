/**
 * 积分余额模块 - 余额查询相关API
 *
 * @route /api/v4/shop/points
 * @description 处理积分余额查询、概览、冻结积分等功能
 *
 * API清单：
 * - GET /balance           - 获取当前用户积分余额（JWT自动识别）
 * - GET /balance/:user_id  - 获取指定用户积分余额（管理员权限）
 * - GET /overview          - 获取用户积分概览（含冻结积分）
 * - GET /frozen            - 获取冻结积分明细（分页）
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

// 限流中间件
const { getRateLimiter } = require('../../../../middleware/RateLimiterMiddleware')
const rateLimiter = getRateLimiter()

/**
 * 积分余额查询限流配置 - 10次/分钟/用户
 * 说明：防止恶意频繁查询，保护服务端资源
 */
const balanceRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'rate_limit:points:balance:',
  keyGenerator: 'user',
  message: '查询过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    logger.warn('[PointsBalance] 查询限流触发', {
      user_id: req.user?.user_id,
      count,
      limit: 10,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * 按用户ID查询积分余额限流配置 - 60次/分钟/用户
 * 说明：与lottery路由的积分查询限流保持一致
 */
const pointsBalanceByIdRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: 'rate_limit:points:balance_by_id:',
  keyGenerator: 'user',
  message: '查询过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    logger.warn('[PointsBalanceById] 查询限流触发', {
      user_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      count,
      limit: 60,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * GET /balance - 获取当前用户积分余额
 *
 * @description 从JWT token中自动获取当前用户的积分余额信息
 * @route GET /api/v4/shop/points/balance
 * @access Private (需要认证)
 */
router.get('/balance', authenticateToken, balanceRateLimiter, async (req, res) => {
  const startTime = Date.now()
  const user_id = req.user.user_id

  try {
    const PointsService = req.app.locals.services.getService('points')

    logger.info(`[PointsBalance] 用户${user_id}查询积分余额`)

    const balanceData = await PointsService.getBalanceResponse(user_id)

    const queryTime = Date.now() - startTime
    if (queryTime > 100) {
      logger.warn(`[PointsBalance] 查询耗时过长: ${queryTime}ms, user_id=${user_id}`)
    } else {
      logger.info(
        `[PointsBalance] 查询成功: ${queryTime}ms, user_id=${user_id}, available=${balanceData.available_points}`
      )
    }

    balanceData.query_time_ms = queryTime

    return res.apiSuccess(balanceData, '积分余额查询成功')
  } catch (error) {
    const queryTime = Date.now() - startTime
    logger.error(`[PointsBalance] 查询失败: user_id=${user_id}, time=${queryTime}ms`, error)
    return handleServiceError(error, res, '积分余额查询失败')
  }
})

/**
 * GET /balance/:user_id - 获取指定用户积分余额
 *
 * @description 获取指定用户的积分余额信息（管理员可查询任意用户）
 * @route GET /api/v4/shop/points/balance/:user_id
 * @access Private (需要认证 + 限流保护)
 */
router.get(
  '/balance/:user_id',
  authenticateToken,
  pointsBalanceByIdRateLimiter,
  async (req, res) => {
    try {
      const PointsService = req.app.locals.services.getService('points')

      const { user_id } = req.params
      const current_user_id = req.user.user_id

      // 参数严格验证
      const target_user_id = parseInt(user_id)
      if (isNaN(target_user_id) || target_user_id <= 0) {
        return res.apiError(
          'user_id参数无效，必须为正整数',
          'INVALID_USER_ID',
          { received_user_id: user_id },
          400
        )
      }

      // 权限检查：只能查询自己的积分，除非是超级管理员
      const currentUserRoles = await getUserRoles(current_user_id)
      if (target_user_id !== current_user_id && !currentUserRoles.isAdmin) {
        return res.apiError('无权限查询其他用户积分', 'PERMISSION_DENIED', {}, 403)
      }

      // 审计日志：记录管理员查询他人积分的操作
      if (currentUserRoles.isAdmin && target_user_id !== current_user_id) {
        logger.warn('[Audit] 管理员查询他人积分', {
          operator_id: current_user_id,
          operator_mobile: req.user.mobile,
          target_user_id,
          action: 'query_user_points_balance',
          ip: req.ip,
          user_agent: req.headers['user-agent'],
          timestamp: BeijingTimeHelper.now()
        })
      }

      const { account } = await PointsService.getUserAccount(target_user_id)

      const points_info = {
        available_points: parseFloat(account.available_points),
        total_earned: parseFloat(account.total_earned),
        total_consumed: parseFloat(account.total_consumed)
      }

      return res.apiSuccess(
        {
          user_id: target_user_id,
          available_points: points_info.available_points,
          total_earned: points_info.total_earned,
          total_consumed: points_info.total_consumed,
          timestamp: BeijingTimeHelper.apiTimestamp()
        },
        '积分余额查询成功'
      )
    } catch (error) {
      logger.error('❌ 积分余额查询失败:', error)
      return handleServiceError(error, res, '积分余额查询失败')
    }
  }
)

/**
 * GET /overview - 获取用户积分概览
 *
 * @description 为用户提供完整的积分账户概览，包括可用积分、冻结积分等
 * @route GET /api/v4/shop/points/overview
 * @access Private (需要认证)
 */
router.get('/overview', authenticateToken, async (req, res) => {
  const startTime = Date.now()

  try {
    const PointsService = req.app.locals.services.getService('points')
    const user_id = req.user.user_id

    logger.info(`📊 获取用户积分概览 - 用户ID: ${user_id}`)

    // 验证用户账户存在性
    await PointsService.getUserAccount(user_id)

    // 获取积分概览
    const overview = await PointsService.getUserPointsOverview(user_id)

    // 性能监控
    const queryTime = Date.now() - startTime
    if (queryTime > 500) {
      logger.warn('⚠️ [PointsOverview] 慢查询告警', {
        query_time_ms: queryTime,
        user_id,
        record_count: overview.pending_records?.length || 0,
        threshold_ms: 500,
        suggestion: '检查数据库索引是否失效，或数据量是否异常增长'
      })
    } else {
      logger.info(
        `✅ 积分概览获取成功 - 用户ID: ${user_id}, 可用: ${overview.available_points}, 待审核: ${overview.pending_points}, 耗时: ${queryTime}ms`
      )
    }

    return res.apiSuccess(overview, '积分概览获取成功')
  } catch (error) {
    const queryTime = Date.now() - startTime
    logger.error('❌ 获取积分概览失败:', {
      error_message: error.message,
      error_stack: error.stack,
      user_id: req.user?.user_id,
      query_time_ms: queryTime,
      timestamp: BeijingTimeHelper.now()
    })
    return handleServiceError(error, res, '获取积分概览失败')
  }
})

/**
 * GET /pending - 获取用户待审核积分明细（分页）
 *
 * @description 提供待审核积分的详细列表，支持分页查询
 * @route GET /api/v4/shop/points/pending
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 * @access Private (需要认证)
 */
router.get('/pending', authenticateToken, async (req, res) => {
  const startTime = Date.now()

  try {
    const PointsService = req.app.locals.services.getService('points')
    const user_id = req.user.user_id
    const { page = 1, page_size = 20 } = req.query

    logger.info(`📋 获取待审核积分明细 - 用户ID: ${user_id}, 页码: ${page}, 每页: ${page_size}`)

    const pendingDetails = await PointsService.getUserPendingPoints(user_id, {
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    const queryTime = Date.now() - startTime

    if (queryTime > 500) {
      logger.warn('⚠️ [PendingPoints] 慢查询告警', {
        query_time_ms: queryTime,
        user_id,
        page: parseInt(page),
        page_size: parseInt(page_size),
        record_count: pendingDetails.total_count,
        threshold_ms: 500,
        suggestion: '检查数据库索引是否失效，或数据量是否异常增长'
      })
    } else {
      logger.info(
        `✅ 待审核积分明细获取成功 - 用户ID: ${user_id}, 记录数: ${pendingDetails.total_count}, 耗时: ${queryTime}ms`
      )
    }

    return res.apiSuccess(pendingDetails, '待审核积分明细获取成功')
  } catch (error) {
    const queryTime = Date.now() - startTime
    logger.error('❌ 获取待审核积分明细失败:', {
      error_message: error.message,
      error_stack: error.stack,
      user_id: req.user?.user_id,
      page: req.query.page,
      page_size: req.query.page_size,
      query_time_ms: queryTime,
      timestamp: BeijingTimeHelper.now()
    })
    return handleServiceError(error, res, '获取待审核积分明细失败')
  }
})

module.exports = router
