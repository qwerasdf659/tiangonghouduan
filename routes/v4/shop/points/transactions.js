/**
 * 积分交易记录模块 - 交易历史和趋势相关API
 *
 * @route /api/v4/shop/points
 * @description 处理积分交易记录查询、删除、恢复、趋势分析等功能
 *
 * API清单：
 * - GET /transactions/:user_id    - 获取用户积分交易历史
 * - GET /trend                    - 获取用户积分趋势数据
 * - DELETE /transaction/:id       - 软删除积分交易记录
 * - POST /transaction/:id/restore - 恢复已删除的交易记录（管理员）
 * - GET /restore-audit            - 查询恢复审计记录（管理员）
 *
 * 创建时间：2025年12月22日
 * 从原points.js拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles, requireAdmin } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const logger = require('../../../../utils/logger').logger

// 限流中间件
const { getRateLimiter } = require('../../../../middleware/RateLimiterMiddleware')
const rateLimiter = getRateLimiter()

/**
 * 积分趋势查询限流配置 - 30次/分钟/用户
 * 说明：比balance接口宽松，因为趋势查询频率更低
 */
const trendRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'rate_limit:points:trend:',
  keyGenerator: 'user',
  message: '趋势查询过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    logger.warn('[PointsTrend] 查询限流触发', {
      user_id: req.user?.user_id,
      count,
      limit: 30,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * GET /transactions/:user_id - 获取用户积分交易历史
 *
 * @description 获取用户的积分交易记录，支持分页和筛选
 * @route GET /api/v4/shop/points/transactions/:user_id
 * @access Private (需要认证)
 */
router.get('/transactions/:user_id', authenticateToken, async (req, res) => {
  try {
    const PointsService = req.app.locals.services.getService('points')

    const { user_id } = req.params
    const { page = 1, limit = 20, type } = req.query

    // 参数验证
    if (!user_id || user_id === 'undefined' || user_id === 'null') {
      return res.apiError(
        '用户ID参数无效，请确保已登录并正确传递用户ID',
        'INVALID_USER_ID',
        {
          received_user_id: user_id,
          hint: '前端应从登录状态或JWT token中获取user_id'
        },
        400
      )
    }

    const user_id_int = parseInt(user_id)
    if (isNaN(user_id_int) || user_id_int <= 0) {
      return res.apiError(
        '用户ID必须是正整数',
        'INVALID_USER_ID_FORMAT',
        { received_user_id: user_id },
        400
      )
    }

    // 分页安全保护：最大100条记录
    const finalLimit = Math.min(parseInt(limit), 100)
    const current_user_id = req.user.user_id

    // 权限检查
    const currentUserRoles = await getUserRoles(current_user_id)
    if (user_id_int !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户交易记录', 'PERMISSION_DENIED', {}, 403)
    }

    const transactions = await PointsService.getUserTransactions(user_id_int, {
      page: parseInt(page),
      limit: finalLimit,
      type
    })

    return res.apiSuccess(
      {
        user_id: user_id_int,
        transactions: transactions.data,
        pagination: {
          page: parseInt(page),
          limit: finalLimit,
          total: transactions.total,
          pages: Math.ceil(transactions.total / finalLimit)
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分交易记录查询成功'
    )
  } catch (error) {
    logger.error('积分交易记录查询失败:', error)
    return handleServiceError(error, res, '积分交易记录查询失败')
  }
})

/**
 * GET /trend - 获取用户积分趋势数据
 *
 * @description 获取用户指定天数内的积分获得/消费趋势数据
 * @route GET /api/v4/shop/points/trend
 * @query {number} days - 查询天数（默认30，范围7-90）
 * @query {string} end_date - 结束日期（默认今天）
 * @access Private (需要认证)
 */
router.get('/trend', authenticateToken, trendRateLimiter, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const { days, end_date } = req.query

    logger.info(
      `📊 查询积分趋势 - 用户ID: ${user_id}, 天数: ${days || 30}, 结束日期: ${end_date || '今天'}`
    )

    const PointsService = req.app.locals.services.getService('points')

    const trendData = await PointsService.getUserPointsTrend(user_id, {
      days: days ? parseInt(days) : 30,
      end_date
    })

    logger.info(
      `📈 数据处理完成 - 数据点: ${trendData.data_points}, 总获得: ${trendData.total_earn}, 总消费: ${trendData.total_consume}`
    )

    return res.apiSuccess(trendData, '积分趋势查询成功')
  } catch (error) {
    logger.error('❌ 获取积分趋势失败:', error)
    return handleServiceError(error, res, '积分趋势查询失败')
  }
})

/**
 * DELETE /transaction/:transaction_id - 软删除积分交易记录
 *
 * @description 积分交易记录软删除（混合权限模式）
 * @route DELETE /api/v4/shop/points/transaction/:transaction_id
 * @access Private (用户可删除部分状态，管理员可删除所有状态)
 *
 * 业务规则（混合模式）:
 * - 用户可删除: pending/failed/cancelled状态的记录
 * - 用户不可删除: completed状态的earn/consume/refund/expire记录
 * - 管理员可删除: 任何状态的记录（需填写删除原因）
 */
router.delete('/transaction/:transaction_id', authenticateToken, async (req, res) => {
  try {
    const PointsService = req.app.locals.services.getService('points')

    const userId = req.user.user_id
    const isAdmin = req.isAdmin === true
    const { transaction_id } = req.params
    const { deletion_reason } = req.body

    // 参数验证
    if (!transaction_id || isNaN(parseInt(transaction_id))) {
      return res.apiError('无效的交易记录ID', 'BAD_REQUEST', null, 400)
    }

    const transactionId = parseInt(transaction_id)

    const result = await PointsService.deleteTransaction(userId, transactionId, {
      isAdmin,
      deletion_reason
    })

    logger.info('交易记录软删除成功', {
      transaction_id: transactionId,
      user_id: userId,
      is_admin: isAdmin,
      deleted_at: result.deleted_at
    })

    return res.apiSuccess(
      {
        transaction_id: transactionId,
        is_deleted: 1,
        deleted_at: BeijingTimeHelper.formatForAPI(result.deleted_at),
        record_type: 'points_transaction',
        note: isAdmin ? '管理员已删除该交易记录' : '记录已隐藏，不会显示在历史列表中'
      },
      '交易记录已删除'
    )
  } catch (error) {
    logger.error('软删除交易记录失败', {
      error: error.message,
      transaction_id: req.params.transaction_id,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '删除失败')
  }
})

/**
 * POST /transaction/:transaction_id/restore - 恢复已删除的积分交易记录
 *
 * @description 管理员恢复已删除的积分交易记录（审计增强版）
 * @route POST /api/v4/shop/points/transaction/:transaction_id/restore
 * @access Private (仅管理员)
 *
 * 业务规则：
 * - 仅管理员可以恢复已删除的记录
 * - 恢复后用户端将重新显示该记录
 * - 记录完整审计日志
 * - 恢复次数>=10次拒绝，>=5次警告
 */
router.post(
  '/transaction/:transaction_id/restore',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const PointsService = req.app.locals.services.getService('points')

      const { transaction_id } = req.params
      const { reason } = req.body || {}
      const adminId = req.user.user_id

      // 参数验证
      if (!transaction_id || isNaN(parseInt(transaction_id))) {
        return res.apiError('无效的交易记录ID', 'BAD_REQUEST', null, 400)
      }

      const transactionId = parseInt(transaction_id)

      const result = await PointsService.restoreTransaction(adminId, transactionId, {
        restore_reason: reason
      })

      logger.info('交易记录恢复成功', {
        transaction_id: transactionId,
        admin_id: adminId,
        restored_at: result.restored_at
      })

      return res.apiSuccess(
        {
          transaction_id: transactionId,
          is_deleted: 0,
          user_id: result.user_id,
          restored_by: adminId,
          restored_at: BeijingTimeHelper.formatForAPI(result.restored_at).iso,
          restore_count: result.restore_count,
          note: '交易记录已恢复，用户端将重新显示该记录'
        },
        '交易记录已恢复'
      )
    } catch (error) {
      logger.error('恢复交易记录失败', {
        error: error.message,
        transaction_id: req.params.transaction_id,
        admin_id: req.user?.user_id
      })
      return handleServiceError(error, res, '恢复失败')
    }
  }
)

/**
 * GET /restore-audit - 查询积分交易恢复审计记录
 *
 * @description 管理员专用，查询恢复操作的审计日志
 * @route GET /api/v4/shop/points/restore-audit
 * @query {number} user_id - 用户ID（可选）
 * @query {number} admin_id - 管理员ID（可选）
 * @query {string} start_date - 开始日期（可选）
 * @query {string} end_date - 结束日期（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页记录数（默认20）
 * @access Private (仅管理员)
 */
router.get('/restore-audit', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const PointsService = req.app.locals.services.getService('points')

    const { user_id, admin_id, start_date, end_date, page = 1, limit = 20 } = req.query

    const result = await PointsService.getRestoreAudit({
      user_id: user_id ? parseInt(user_id) : undefined,
      admin_id: admin_id ? parseInt(admin_id) : undefined,
      start_date,
      end_date,
      page,
      limit
    })

    logger.info('获取恢复审计记录成功', {
      admin_id: req.user.user_id,
      filters: { user_id, admin_id, start_date, end_date },
      total: result.pagination.total
    })

    return res.apiSuccess(result, '获取恢复审计记录成功')
  } catch (error) {
    logger.error('获取恢复审计记录失败', {
      error: error.message,
      admin_id: req.user?.user_id,
      query: req.query
    })
    return handleServiceError(error, res, '获取审计记录失败')
  }
})

module.exports = router
