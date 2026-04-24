/**
 * 商家积分申请路由 - 用户端
 *
 * 功能说明：
 * - 提供商家提交积分申请的功能
 * - 查看自己的申请列表和详情
 * - 获取申请统计信息
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 通过 req.app.locals.services 统一获取服务实例
 *
 * API路径：/api/v4/merchant-points/*
 *
 * 作者：AI Assistant
 */

const { asyncHandler } = require('../../middleware/validation')
const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../middleware/auth')
const TransactionManager = require('../../utils/TransactionManager')
const { logger } = require('../../utils/logger')

// 所有路由都需要用户认证
router.use(authenticateToken)

/**
 * 提交商家积分申请
 * @route POST /api/v4/merchant-points
 *
 * @body {number} points_amount - 申请的积分数量
 * @body {string} description - 申请描述/说明
 *
 * @returns {Object} 创建的审核记录
 */
router.post('/', asyncHandler(async (req, res) => {
  const { points_amount, description } = req.body
  const userId = req.user.user_id

  if (!points_amount || typeof points_amount !== 'number' || points_amount <= 0) {
    return res.apiError('申请积分数量必须为正整数', 'INVALID_POINTS_AMOUNT', null, 400)
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return res.apiError('申请描述不能为空', 'DESCRIPTION_REQUIRED', null, 400)
  }
  if (description.trim().length > 500) {
    return res.apiError('申请描述不能超过500字', 'DESCRIPTION_TOO_LONG', null, 400)
  }
  if (points_amount > 100000) {
    return res.apiError('单次申请积分不能超过100000', 'POINTS_AMOUNT_TOO_LARGE', null, 400)
  }

  const MerchantPointsService = req.app.locals.services.getService('merchant_points')
  const result = await TransactionManager.execute(
    async transaction => {
      return await MerchantPointsService.submitApplication(
        userId,
        points_amount,
        description.trim(),
        { transaction }
      )
    },
    {
      name: `submit_merchant_points_${userId}`
    }
  )

  logger.info(`[商家积分申请] 提交成功: user_id=${userId}, points=${points_amount}`)

  return res.apiSuccess(result, '商家积分申请提交成功，请等待审核')
}))

/**
 * 获取我的商家积分申请列表
 * @route GET /api/v4/merchant-points
 *
 * @query {string} [status] - 审核状态筛选（pending/approved/rejected/cancelled）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=10] - 每页数量
 *
 * @returns {Object} 申请列表和分页信息
 */
router.get('/', asyncHandler(async (req, res) => {
  const { status, page = 1, page_size = 10 } = req.query
  const userId = req.user.user_id

  const filters = {
    userId
  }
  if (status) {
    filters.status = status
  }

  const MerchantPointsService = req.app.locals.services.getService('merchant_points')
  const result = await MerchantPointsService.getApplications(
    filters,
    parseInt(page, 10),
    parseInt(page_size, 10)
  )

  return res.apiSuccess(result, '获取商家积分申请列表成功')
}))

/**
 * 获取我的申请统计
 * @route GET /api/v4/merchant-points/stats
 *
 * @returns {Object} 申请统计信息
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const userId = req.user.user_id

  const MerchantPointsService = req.app.locals.services.getService('merchant_points')
  const stats = await MerchantPointsService.getUserApplicationStats(userId)

  return res.apiSuccess(stats, '获取申请统计成功')
}))

/**
 * 获取单个申请详情
 * @route GET /api/v4/merchant-points/:audit_id
 *
 * @param {number} audit_id - 审核记录ID
 *
 * @returns {Object} 申请详情
 */
router.get('/:audit_id', asyncHandler(async (req, res) => {
  const { audit_id } = req.params
  const userId = req.user.user_id

  const MerchantPointsService = req.app.locals.services.getService('merchant_points')
  const application = await MerchantPointsService.getApplicationById(parseInt(audit_id, 10))

  if (!application) {
    return res.apiError('商家积分申请不存在', 'APPLICATION_NOT_FOUND', null, 404)
  }

  if (application.user_id !== userId) {
    return res.apiError('无权查看此申请', 'FORBIDDEN', null, 403)
  }

  return res.apiSuccess(application, '获取商家积分申请详情成功')
}))

module.exports = router
