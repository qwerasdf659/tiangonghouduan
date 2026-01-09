/**
 * 商家积分管理路由 - 管理员端
 *
 * 功能说明：
 * - 提供商家积分申请的审核管理功能
 * - 查看待审核/已审核的申请列表
 * - 审核通过/拒绝商家积分申请
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 通过 req.app.locals.services 统一获取服务实例
 *
 * API路径：/api/v4/console/merchant-points/*
 *
 * 创建时间：2026年01月09日
 * 作者：AI Assistant
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
/*
 * P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）
 * const ContentAuditEngine = require('../../../services/ContentAuditEngine')
 * const MerchantPointsService = require('../../../services/MerchantPointsService')
 */
const TransactionManager = require('../../../utils/TransactionManager')
const { logger } = require('../../../utils/logger')

// 所有路由都需要管理员权限
router.use(authenticateToken)
router.use(requireAdmin)

/**
 * 获取商家积分申请完整统计
 * @route GET /api/v4/console/merchant-points/stats/pending
 *
 * ⚠️ 重要：此路由必须在 /:audit_id 之前定义，否则会被 /:audit_id 匹配
 *
 * @returns {Object} 完整统计信息（待审核、已通过、已拒绝、今日发放积分）
 */
router.get('/stats/pending', async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const MerchantPointsService = req.app.locals.services.getService('merchant_points')

    // 并行获取各状态统计
    const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
      MerchantPointsService.getApplications({ status: 'pending' }, 1, 1),
      MerchantPointsService.getApplications({ status: 'approved' }, 1, 1000), // 获取足够多来计算积分
      MerchantPointsService.getApplications({ status: 'rejected' }, 1, 1)
    ])

    // 计算今日发放的积分总额
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayPoints = approvedResult.rows
      .filter(r => new Date(r.audited_at) >= today)
      .reduce((sum, r) => sum + (r.points_amount || 0), 0)

    return res.apiSuccess(
      {
        pending_count: pendingResult.count,
        approved_count: approvedResult.count,
        rejected_count: rejectedResult.count,
        today_points: todayPoints
      },
      '获取统计成功'
    )
  } catch (error) {
    logger.error('❌ 获取统计失败:', error.message)
    return res.apiError('获取统计失败', 'GET_STATS_FAILED', null, 500)
  }
})

/**
 * 获取商家积分申请列表
 * @route GET /api/v4/console/merchant-points
 *
 * @query {string} [status] - 审核状态筛选（pending/approved/rejected/cancelled）
 * @query {number} [user_id] - 申请用户ID筛选
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=10] - 每页数量
 *
 * @returns {Object} 申请列表和分页信息
 * @returns {Array} data.rows - 申请列表
 * @returns {number} data.count - 总数量
 * @returns {Object} data.pagination - 分页信息
 */
router.get('/', async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const MerchantPointsService = req.app.locals.services.getService('merchant_points')

    const { status, user_id, page = 1, page_size = 10 } = req.query

    const filters = {}
    if (status) {
      filters.status = status
    }
    if (user_id) {
      filters.userId = parseInt(user_id, 10)
    }

    const result = await MerchantPointsService.getApplications(
      filters,
      parseInt(page, 10),
      parseInt(page_size, 10)
    )

    return res.apiSuccess(result, '获取商家积分申请列表成功')
  } catch (error) {
    logger.error('❌ 获取商家积分申请列表失败:', error.message)
    return res.apiError('获取商家积分申请列表失败', 'GET_APPLICATIONS_FAILED', null, 500)
  }
})

/**
 * 获取单个商家积分申请详情
 * @route GET /api/v4/console/merchant-points/:audit_id
 *
 * @param {number} audit_id - 审核记录ID
 *
 * @returns {Object} 申请详情
 */
router.get('/:audit_id', async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const MerchantPointsService = req.app.locals.services.getService('merchant_points')

    const { audit_id } = req.params

    const application = await MerchantPointsService.getApplicationById(parseInt(audit_id, 10))

    if (!application) {
      return res.apiError('商家积分申请不存在', 'APPLICATION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(application, '获取商家积分申请详情成功')
  } catch (error) {
    logger.error('❌ 获取商家积分申请详情失败:', error.message)
    return res.apiError('获取商家积分申请详情失败', 'GET_APPLICATION_FAILED', null, 500)
  }
})

/**
 * 审核通过商家积分申请
 * @route POST /api/v4/console/merchant-points/:audit_id/approve
 *
 * @param {number} audit_id - 审核记录ID
 * @body {string} [reason] - 审核意见（可选）
 *
 * @returns {Object} 审核结果
 */
router.post('/:audit_id/approve', async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const ContentAuditEngine = req.app.locals.services.getService('content_audit')

    const { audit_id } = req.params
    const { reason = '' } = req.body
    const auditorId = req.user.user_id

    // 使用 TransactionManager 统一管理事务
    const result = await TransactionManager.execute(
      async transaction => {
        /*
         * 调用 ContentAuditEngine 进行审核通过操作
         * 审核引擎会触发 MerchantPointsAuditCallback.approved() 回调
         * 参数顺序：(auditId, auditorId, reason, options)
         */
        return await ContentAuditEngine.approve(
          parseInt(audit_id, 10),
          auditorId,
          reason || null, // 第三个参数：审核原因
          { transaction } // 第四个参数：选项对象
        )
      },
      {
        name: `approve_merchant_points_${audit_id}`
      }
    )

    logger.info(`[商家积分管理] 审核通过: audit_id=${audit_id}, auditor=${auditorId}`)

    return res.apiSuccess(result, '商家积分申请审核通过')
  } catch (error) {
    logger.error('❌ 商家积分申请审核通过失败:', error.message)

    // 处理业务错误
    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'APPLICATION_NOT_FOUND', null, 404)
    }
    if (error.message.includes('状态')) {
      return res.apiError(error.message, 'INVALID_STATUS', null, 400)
    }

    return res.apiError('商家积分申请审核通过失败', 'APPROVE_FAILED', null, 500)
  }
})

/**
 * 审核拒绝商家积分申请
 * @route POST /api/v4/console/merchant-points/:audit_id/reject
 *
 * @param {number} audit_id - 审核记录ID
 * @body {string} reason - 拒绝原因（必填）
 *
 * @returns {Object} 审核结果
 */
router.post('/:audit_id/reject', async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const ContentAuditEngine = req.app.locals.services.getService('content_audit')

    const { audit_id } = req.params
    const { reason } = req.body
    const auditorId = req.user.user_id

    // 验证拒绝原因
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.apiError('拒绝原因不能为空', 'REASON_REQUIRED', null, 400)
    }

    // 使用 TransactionManager 统一管理事务
    const result = await TransactionManager.execute(
      async transaction => {
        /*
         * 调用 ContentAuditEngine 进行审核拒绝操作
         * 审核引擎会触发 MerchantPointsAuditCallback.rejected() 回调
         * 参数顺序：(auditId, auditorId, reason, options)
         */
        return await ContentAuditEngine.reject(
          parseInt(audit_id, 10),
          auditorId,
          reason.trim(), // 第三个参数：拒绝原因
          { transaction } // 第四个参数：选项对象
        )
      },
      {
        name: `reject_merchant_points_${audit_id}`
      }
    )

    logger.info(
      `[商家积分管理] 审核拒绝: audit_id=${audit_id}, auditor=${auditorId}, reason=${reason}`
    )

    return res.apiSuccess(result, '商家积分申请已拒绝')
  } catch (error) {
    logger.error('❌ 商家积分申请审核拒绝失败:', error.message)

    // 处理业务错误
    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'APPLICATION_NOT_FOUND', null, 404)
    }
    if (error.message.includes('状态')) {
      return res.apiError(error.message, 'INVALID_STATUS', null, 400)
    }

    return res.apiError('商家积分申请审核拒绝失败', 'REJECT_FAILED', null, 500)
  }
})

module.exports = router
