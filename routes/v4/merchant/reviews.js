/**
 * 商家积分审核路由模块
 *
 * @route /api/v4/merchant/reviews
 * @description 商家扫码审核积分奖励发放流程
 *
 * API列表：
 * - POST /submit - 商家提交审核（创建审核记录，待审批发放奖励）
 * - POST /:review_id/approve - 审核通过（发放积分奖励 + 预算积分）
 * - POST /:review_id/reject - 审核拒绝（仅更新状态）
 * - POST /admin/:review_id/handle - [废弃] 客服处理（新语义不再使用）
 * - GET /user - 获取用户审核记录
 * - GET /merchant - 获取商家审核记录
 * - GET /admin/stats - 获取审核统计
 * - GET /pending - 获取待审核列表（管理员）
 *
 * 业务规则（2026-01-08 重构）：
 * - submit: role_level >= 40（商家/ops）可提交
 * - approve/reject: role_level >= 100（管理员）可审批
 * - 审核通过直接发放积分奖励，不再使用冻结机制
 *
 * 创建时间：2025-12-29
 * 最后更新：2026-01-08（资产语义重构：冻结→奖励发放）
 * 使用模型：Claude Opus 4.5
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 商家权限验证中间件（role_level >= 40）
 *
 * 业务规则（2026-01-08 拍板）：
 * - role_level >= 40 的用户可以提交审核（sales_staff/business_manager/regional_manager/admin）
 * - ops 角色（role_level=30）为只读，不参与提交
 * - 普通用户（role_level < 40）不能提交审核
 *
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 * @returns {void} 无返回值
 */
const requireMerchantOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.apiError('未认证用户', 'UNAUTHENTICATED', null, 401)
  }

  const roleLevel = req.user.role_level || 0

  // role_level >= 40 可以提交审核
  if (roleLevel < 40) {
    logger.warn(
      `🚫 [MerchantReview] 权限不足: user_id=${req.user.user_id}, role_level=${roleLevel} < 40`
    )
    return res.apiError(
      '需要商家权限（role_level >= 40）才能提交审核',
      'INSUFFICIENT_ROLE_LEVEL',
      { required_role_level: 40, current_role_level: roleLevel },
      403
    )
  }

  return next()
}

/**
 * @route POST /api/v4/merchant/reviews/submit
 * @desc 商家提交审核（创建审核记录，待审批发放奖励）
 * @access Private (role_level >= 40：sales_staff/business_manager/regional_manager/admin)
 *
 * 权限说明（2026-01-08 拍板）：
 * - role_level >= 40 可提交审核（商家角色：sales_staff=40, business_manager=60, regional_manager=80）
 * - role_level >= 100 可审批/拒绝（管理员角色：admin=100）
 * - ops 角色（role_level=30）为只读，不参与提交
 *
 * @body {number} user_id - 待发放奖励的用户ID（必填）
 * @body {number} points_amount - 待发放积分金额（必填）
 * @body {string} qr_code_data - 二维码数据（可选）
 * @body {Object} metadata - 审核元数据（可选）
 *
 * @returns {Object} 审核单信息
 */
router.post('/submit', authenticateToken, requireMerchantOrAdmin, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const { user_id, points_amount, qr_code_data, metadata } = req.body
    const merchant_id = req.user.user_id

    // 参数验证
    if (!user_id) {
      return res.apiError('用户ID不能为空', 'BAD_REQUEST', null, 400)
    }
    if (!points_amount || points_amount <= 0) {
      return res.apiError('积分金额必须大于0', 'BAD_REQUEST', null, 400)
    }

    logger.info('商家提交积分审核（待审批发放奖励）', {
      merchant_id,
      user_id,
      points_amount,
      role_level: req.user.role_level
    })

    // 使用 TransactionManager 统一事务边界（符合治理决策）
    const result = await TransactionManager.execute(async transaction => {
      return await MerchantReviewService.submitReview(
        {
          user_id,
          merchant_id,
          points_amount,
          qr_code_data,
          metadata
        },
        { transaction }
      )
    })

    logger.info('积分审核提交成功', {
      review_id: result.review.review_id,
      user_id,
      points_amount,
      is_duplicate: result.is_duplicate
    })

    return res.apiSuccess(
      {
        review_id: result.review.review_id,
        user_id: result.review.user_id,
        merchant_id: result.review.merchant_id,
        points_amount: Number(result.review.points_amount),
        status: result.review.status,
        is_duplicate: result.is_duplicate,
        created_at: result.review.created_at
      },
      result.is_duplicate ? '审核记录已存在' : '审核提交成功，待管理员审批'
    )
  } catch (error) {
    logger.error('提交积分审核失败', { error: error.message })
    return handleServiceError(error, res, '提交积分审核失败')
  }
})

/**
 * @route POST /api/v4/merchant/reviews/:review_id/approve
 * @desc 审核通过（发放积分奖励 + 预算积分）
 * @access Private (role_level >= 100：管理员)
 *
 * @param {string} review_id - 审核单ID
 *
 * @returns {Object} 审核结果（含奖励发放信息）
 */
router.post('/:review_id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const { review_id } = req.params
    const operator_user_id = req.user.user_id

    logger.info('审核通过请求（发放奖励）', { review_id, operator_user_id })

    // 使用 TransactionManager 统一事务边界（符合治理决策）
    const result = await TransactionManager.execute(async transaction => {
      return await MerchantReviewService.approveReview(
        {
          review_id,
          operator_user_id
        },
        { transaction }
      )
    })

    logger.info('审核通过成功（奖励已发放）', {
      review_id,
      user_id: result.review.user_id,
      reward_points: result.reward_points,
      budget_points: result.budget_points
    })

    return res.apiSuccess(
      {
        review_id: result.review.review_id,
        status: result.review.status,
        user_id: result.review.user_id,
        reward_points: result.reward_points,
        budget_points: result.budget_points,
        reward_issued: true
      },
      `审核通过，已发放 ${result.reward_points} 积分 + ${result.budget_points} 预算积分`
    )
  } catch (error) {
    logger.error('审核通过失败', { error: error.message })
    return handleServiceError(error, res, '审核通过失败')
  }
})

/**
 * @route POST /api/v4/merchant/reviews/:review_id/reject
 * @desc 审核拒绝（仅更新状态，无积分操作）
 * @access Private (role_level >= 100：管理员)
 *
 * @param {string} review_id - 审核单ID
 * @body {string} reject_reason - 拒绝原因（必填，不少于5字）
 *
 * @returns {Object} 审核结果
 */
router.post('/:review_id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const { review_id } = req.params
    const { reject_reason } = req.body
    const operator_user_id = req.user.user_id

    // 参数验证
    if (!reject_reason || reject_reason.trim().length < 5) {
      return res.apiError('拒绝原因必须提供，且不少于5个字符', 'BAD_REQUEST', null, 400)
    }

    logger.info('审核拒绝请求', { review_id, operator_user_id, reject_reason })

    // 使用 TransactionManager 统一事务边界（符合治理决策）
    const result = await TransactionManager.execute(async transaction => {
      return await MerchantReviewService.rejectReview(
        {
          review_id,
          reject_reason,
          operator_user_id
        },
        { transaction }
      )
    })

    logger.info('审核拒绝完成', {
      review_id,
      user_id: result.review.user_id,
      reject_reason
    })

    return res.apiSuccess(
      {
        review_id: result.review.review_id,
        status: result.review.status,
        user_id: result.review.user_id,
        points_amount: Number(result.review.points_amount),
        reject_reason
      },
      '审核已拒绝'
    )
  } catch (error) {
    logger.error('审核拒绝失败', { error: error.message })
    return handleServiceError(error, res, '审核拒绝失败')
  }
})

/**
 * @deprecated 2026-01-08 - 冻结积分处理已废弃
 * @route POST /api/v4/merchant/reviews/admin/:review_id/handle
 * @desc [废弃] 客服处理冻结积分 - 新语义不再使用冻结机制
 * @access Private (管理员)
 *
 * @returns {Object} 废弃提示
 */
router.post('/admin/:review_id/handle', authenticateToken, requireAdmin, async (req, res) => {
  logger.warn('访问已废弃的接口: /admin/:review_id/handle', {
    review_id: req.params.review_id,
    admin_user_id: req.user.user_id
  })

  return res.apiError(
    '此接口已废弃（2026-01-08 资产语义重构）。新语义不再使用冻结机制，请直接使用 approve/reject 接口。',
    'DEPRECATED',
    {
      deprecated_since: '2026-01-08',
      alternative: 'POST /:review_id/approve 或 POST /:review_id/reject',
      reason: '用户上传凭证审核业务已废弃，积分发放改为直接奖励模式'
    },
    410
  )
})

/**
 * @route GET /api/v4/merchant/reviews/user
 * @desc 获取当前用户的审核记录
 * @access Private
 *
 * @query {string} status - 状态筛选（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 *
 * @returns {Object} 审核记录列表
 */
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const user_id = req.user.user_id
    const { status, page = 1, page_size = 20 } = req.query

    const result = await MerchantReviewService.getUserReviews({
      user_id,
      status,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    })

    return res.apiSuccess(
      {
        reviews: result.reviews.map(r => ({
          review_id: r.review_id,
          merchant_id: r.merchant_id,
          points_amount: Number(r.points_amount),
          status: r.status,
          expires_at: r.expires_at,
          created_at: r.created_at
        })),
        pagination: {
          total: result.total,
          page: result.page,
          page_size: result.page_size
        }
      },
      '获取审核记录成功'
    )
  } catch (error) {
    logger.error('获取用户审核记录失败', { error: error.message })
    return handleServiceError(error, res, '获取审核记录失败')
  }
})

/**
 * @route GET /api/v4/merchant/reviews/merchant
 * @desc 获取当前商家的审核记录
 * @access Private (商家)
 *
 * @query {string} status - 状态筛选（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 *
 * @returns {Object} 审核记录列表
 */
router.get('/merchant', authenticateToken, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const merchant_id = req.user.user_id
    const { status, page = 1, page_size = 20 } = req.query

    const result = await MerchantReviewService.getMerchantReviews({
      merchant_id,
      status,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    })

    return res.apiSuccess(
      {
        reviews: result.reviews.map(r => ({
          review_id: r.review_id,
          user_id: r.user_id,
          points_amount: Number(r.points_amount),
          status: r.status,
          expires_at: r.expires_at,
          created_at: r.created_at
        })),
        pagination: {
          total: result.total,
          page: result.page,
          page_size: result.page_size
        }
      },
      '获取审核记录成功'
    )
  } catch (error) {
    logger.error('获取商家审核记录失败', { error: error.message })
    return handleServiceError(error, res, '获取审核记录失败')
  }
})

/**
 * @route GET /api/v4/merchant/reviews/admin/stats
 * @desc 获取审核统计数据
 * @access Private (管理员)
 *
 * @returns {Object} 统计数据（pending/approved/rejected/legacy）
 */
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const stats = await MerchantReviewService.getReviewStats()

    return res.apiSuccess(
      {
        stats: stats.stats,
        pending_count: stats.pending_count,
        approved_count: stats.approved_count,
        rejected_count: stats.rejected_count,
        legacy_count: stats.legacy_count,
        total_count: stats.total_count
      },
      '获取统计数据成功'
    )
  } catch (error) {
    logger.error('获取审核统计失败', { error: error.message })
    return handleServiceError(error, res, '获取统计失败')
  }
})

/**
 * @route GET /api/v4/merchant/reviews/pending
 * @desc 获取待审核列表（管理员）
 * @access Private (管理员)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 *
 * @returns {Object} 待审核列表
 */
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { MerchantPointsReview } = require('../../../models')

    const page = parseInt(req.query.page, 10) || 1
    const page_size = parseInt(req.query.page_size, 10) || 20

    const { count, rows } = await MerchantPointsReview.findAndCountAll({
      where: { status: 'pending' },
      order: [['created_at', 'ASC']], // 早提交的优先
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return res.apiSuccess(
      {
        reviews: rows.map(r => ({
          review_id: r.review_id,
          user_id: r.user_id,
          merchant_id: r.merchant_id,
          points_amount: Number(r.points_amount),
          status: r.status,
          created_at: r.created_at,
          metadata: r.metadata
        })),
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      },
      '获取待审核列表成功'
    )
  } catch (error) {
    logger.error('获取待审核列表失败', { error: error.message })
    return handleServiceError(error, res, '获取待审核列表失败')
  }
})

module.exports = router
