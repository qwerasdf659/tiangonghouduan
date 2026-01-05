/**
 * 商家积分审核路由模块
 *
 * @route /api/v4/merchant/reviews
 * @description 商家扫码审核冻结积分的完整业务流程
 *
 * API列表：
 * - POST /submit - 商家提交审核（冻结积分）
 * - POST /:review_id/approve - 审核通过（从冻结结算）
 * - POST /:review_id/reject - 审核拒绝（积分仍冻结）
 * - POST /admin/:review_id/handle - 客服处理冻结积分
 * - GET /user - 获取用户审核记录
 * - GET /merchant - 获取商家审核记录
 * - GET /admin/stats - 获取需处理的审核统计
 *
 * 业务规则（拍板决策）：
 * - 只要没审核通过就不可以增加到可用积分中
 * - 冻结会无限期存在，接受用户资产长期不可用
 * - 审核拒绝/超时：积分不退回，需客服手工处理
 *
 * 创建时间：2025-12-29
 * 使用模型：Claude Opus 4.5
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * @route POST /api/v4/merchant/reviews/submit
 * @desc 商家提交审核（冻结积分）
 * @access Private (商家)
 *
 * @body {number} user_id - 被审核用户ID（必填）
 * @body {number} points_amount - 审核积分金额（必填）
 * @body {string} qr_code_data - 二维码数据（可选）
 * @body {Object} metadata - 审核元数据（可选）
 *
 * @returns {Object} 审核单信息
 */
router.post('/submit', authenticateToken, async (req, res) => {
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

    logger.info('商家提交积分审核', {
      merchant_id,
      user_id,
      points_amount
    })

    const result = await MerchantReviewService.submitReview({
      user_id,
      merchant_id,
      points_amount,
      qr_code_data,
      metadata
    })

    logger.info('积分审核提交成功', {
      review_id: result.review.review_id,
      user_id,
      points_amount
    })

    return res.apiSuccess(
      {
        review_id: result.review.review_id,
        user_id: result.review.user_id,
        merchant_id: result.review.merchant_id,
        points_amount: Number(result.review.points_amount),
        status: result.review.status,
        expires_at: result.review.expires_at,
        created_at: result.review.created_at
      },
      '审核提交成功，用户积分已冻结'
    )
  } catch (error) {
    logger.error('提交积分审核失败', { error: error.message })
    return handleServiceError(error, res, '提交积分审核失败')
  }
})

/**
 * @route POST /api/v4/merchant/reviews/:review_id/approve
 * @desc 审核通过（从冻结结算）
 * @access Private (商家/管理员)
 *
 * @param {string} review_id - 审核单ID
 *
 * @returns {Object} 审核结果
 */
router.post('/:review_id/approve', authenticateToken, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const { review_id } = req.params
    const operator_user_id = req.user.user_id

    logger.info('审核通过请求', { review_id, operator_user_id })

    const result = await MerchantReviewService.approveReview({
      review_id,
      operator_user_id
    })

    logger.info('审核通过成功', {
      review_id,
      user_id: result.review.user_id,
      points_amount: result.review.points_amount
    })

    return res.apiSuccess(
      {
        review_id: result.review.review_id,
        status: result.review.status,
        user_id: result.review.user_id,
        points_amount: Number(result.review.points_amount),
        settled: true
      },
      '审核通过，积分已从冻结结算'
    )
  } catch (error) {
    logger.error('审核通过失败', { error: error.message })
    return handleServiceError(error, res, '审核通过失败')
  }
})

/**
 * @route POST /api/v4/merchant/reviews/:review_id/reject
 * @desc 审核拒绝（积分仍冻结，需客服处理）
 * @access Private (商家/管理员)
 *
 * @param {string} review_id - 审核单ID
 * @body {string} reject_reason - 拒绝原因
 *
 * @returns {Object} 审核结果
 */
router.post('/:review_id/reject', authenticateToken, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const { review_id } = req.params
    const { reject_reason } = req.body
    const operator_user_id = req.user.user_id

    logger.info('审核拒绝请求', { review_id, operator_user_id, reject_reason })

    const result = await MerchantReviewService.rejectReview({
      review_id,
      reject_reason,
      operator_user_id
    })

    logger.warn('审核拒绝，积分仍冻结', {
      review_id,
      user_id: result.review.user_id,
      frozen_points: result.frozen_points
    })

    return res.apiSuccess(
      {
        review_id: result.review.review_id,
        status: result.review.status,
        user_id: result.review.user_id,
        frozen_points: result.frozen_points,
        needs_admin_handle: true
      },
      '审核拒绝，积分仍冻结，需客服处理'
    )
  } catch (error) {
    logger.error('审核拒绝失败', { error: error.message })
    return handleServiceError(error, res, '审核拒绝失败')
  }
})

/**
 * @route POST /api/v4/merchant/reviews/admin/:review_id/handle
 * @desc 客服处理冻结积分（解冻退回或作废）
 * @access Private (管理员)
 *
 * @param {string} review_id - 审核单ID
 * @body {string} action - 处理动作：unfreeze（解冻退回）或 confiscate（作废）
 * @body {string} handle_reason - 处理原因
 *
 * @returns {Object} 处理结果
 */
router.post('/admin/:review_id/handle', authenticateToken, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const { review_id } = req.params
    const { action, handle_reason } = req.body
    const admin_user_id = req.user.user_id

    // 参数验证
    if (!['unfreeze', 'confiscate'].includes(action)) {
      return res.apiError('action 必须是 \'unfreeze\' 或 \'confiscate\'', 'BAD_REQUEST', null, 400)
    }

    logger.info('客服处理冻结积分请求', {
      review_id,
      action,
      admin_user_id,
      handle_reason
    })

    const result = await MerchantReviewService.adminHandleFrozenReview({
      review_id,
      action,
      admin_user_id,
      handle_reason
    })

    const message = action === 'unfreeze' ? '积分已解冻退回用户' : '积分已作废'

    logger.info('客服处理完成', {
      review_id,
      action,
      admin_user_id
    })

    return res.apiSuccess(
      {
        review_id: result.review.review_id,
        status: result.review.status,
        action: result.action,
        user_id: result.review.user_id,
        points_amount: Number(result.review.points_amount)
      },
      message
    )
  } catch (error) {
    logger.error('客服处理失败', { error: error.message })
    return handleServiceError(error, res, '客服处理失败')
  }
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
 * @desc 获取需要客服处理的审核单统计
 * @access Private (管理员)
 *
 * @returns {Object} 统计数据
 */
router.get('/admin/stats', authenticateToken, async (req, res) => {
  try {
    const MerchantReviewService = req.app.locals.services.getService('merchantReview')

    const stats = await MerchantReviewService.getNeedsHandleStats()

    return res.apiSuccess(
      {
        needs_handle_reviews: stats.needs_handle_reviews,
        total_count: stats.total_count,
        total_frozen_points: stats.total_frozen_points
      },
      '获取统计数据成功'
    )
  } catch (error) {
    logger.error('获取审核统计失败', { error: error.message })
    return handleServiceError(error, res, '获取统计失败')
  }
})

module.exports = router
