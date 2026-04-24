/**
 * 客服管理 - 会话操作模块
 *
 * 业务范围：
 * - 客服接单（accept）- waiting → assigned
 * - 转接会话（transfer）
 * - 关闭会话（close）
 * - 会话打标签（tag）
 * - 请求满意度评价（satisfaction）- WebSocket 推送
 * - 管理员在线状态管理（online / busy / offline）
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 写操作使用 TransactionManager.execute 包裹事务
 *
 * 最后更新：2026-02-15（新增管理员在线状态 API）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const { asyncHandler } = require('../../../../middleware/validation')

// 所有路由都需要后台访问权限（role_level >= 1 即可访问客服功能）
router.use(authenticateToken, requireRoleLevel(1))

/**
 * POST /:id/transfer - 转接会话
 *
 * API路径参数设计规范 V2.2：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * @description 将会话转接给其他客服
 * @route POST /api/v4/console/customer-service/sessions/:id/transfer
 * @param {number} id - 会话ID（事务实体）
 * @access Admin
 */
router.post('/:id/transfer', asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.id)

  if (isNaN(sessionId) || sessionId <= 0) {
    return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
  }

  const { target_admin_id } = req.body

  if (!target_admin_id) {
    return res.apiError('目标客服ID不能为空', 'BAD_REQUEST', null, 400)
  }

  const currentAdminId = req.user.user_id
  const targetId = parseInt(target_admin_id)

  if (currentAdminId === targetId) {
    return res.apiError('不能转接给自己', 'BAD_REQUEST', null, 400)
  }

  const CustomerServiceSessionService = req.app.locals.services.getService(
    'customer_service_session'
  )

  const result = await TransactionManager.execute(
    async transaction => {
      return await CustomerServiceSessionService.transferSession(
        sessionId,
        currentAdminId,
        targetId,
        { transaction }
      )
    },
    { description: 'transferSession' }
  )

  return res.apiSuccess(result, '转接会话成功')
}))

/**
 * POST /:id/close - 关闭会话
 *
 * API路径参数设计规范 V2.2：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * @description 关闭客服会话
 * @route POST /api/v4/console/customer-service/sessions/:id/close
 * @param {number} id - 会话ID（事务实体）
 * @access Admin
 */
router.post('/:id/close', asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.id)

  if (isNaN(sessionId) || sessionId <= 0) {
    return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
  }

  const { close_reason } = req.body

  const data = {
    admin_id: req.user.user_id,
    close_reason: close_reason || '问题已解决'
  }

  const CustomerServiceSessionService = req.app.locals.services.getService(
    'customer_service_session'
  )

  const result = await TransactionManager.execute(
    async transaction => {
      return await CustomerServiceSessionService.closeSession(sessionId, data, { transaction })
    },
    { description: 'closeSession' }
  )

  return res.apiSuccess(result, '关闭会话成功')
}))

/**
 * POST /:id/accept - 客服接单
 *
 * @description 客服显式认领等待中的会话（状态 waiting → assigned）
 * @route POST /api/v4/console/customer-service/sessions/:id/accept
 * @param {number} id - 会话ID（事务实体，customer_service_session_id）
 * @access Admin（role_level >= 1）
 */
router.post('/:id/accept', asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.id)

  if (isNaN(sessionId) || sessionId <= 0) {
    return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
  }

  const adminId = req.user.user_id
  const CustomerServiceSessionService = req.app.locals.services.getService(
    'customer_service_session'
  )

  const result = await TransactionManager.execute(
    async transaction => {
      return await CustomerServiceSessionService.acceptSession(sessionId, adminId, {
        transaction
      })
    },
    { description: 'acceptSession' }
  )

  return res.apiSuccess(result, '接单成功')
}))

/**
 * POST /:id/tag - 会话打标签
 *
 * @description 客服对会话打标签，用于分类问题类型和跟踪处理状态
 * @route POST /api/v4/console/customer-service/sessions/:id/tag
 * @param {number} id - 会话ID（事务实体，customer_service_session_id）
 * @body {string[]} tags - 标签数组（如 ["交易纠纷", "已补偿"]）
 * @access Admin（role_level >= 1）
 */
router.post('/:id/tag', asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.id)

  if (isNaN(sessionId) || sessionId <= 0) {
    return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
  }

  const { tags } = req.body

  if (!Array.isArray(tags)) {
    return res.apiError('tags 必须是数组', 'BAD_REQUEST', null, 400)
  }

  const adminId = req.user.user_id
  const CustomerServiceSessionService = req.app.locals.services.getService(
    'customer_service_session'
  )

  const result = await TransactionManager.execute(
    async transaction => {
      return await CustomerServiceSessionService.updateSessionTags(sessionId, tags, adminId, {
        transaction
      })
    },
    { description: 'updateSessionTags' }
  )

  return res.apiSuccess(result, '标签更新成功')
}))

/**
 * POST /:id/satisfaction - 请求满意度评价
 *
 * @description 客服通过 WebSocket 向用户推送满意度评价邀请
 * @route POST /api/v4/console/customer-service/sessions/:id/satisfaction
 * @param {number} id - 会话ID（事务实体，customer_service_session_id）
 * @access Admin（role_level >= 1）
 */
router.post('/:id/satisfaction', asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.id)

  if (isNaN(sessionId) || sessionId <= 0) {
    return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
  }

  const adminId = req.user.user_id
  const CustomerServiceSessionService = req.app.locals.services.getService(
    'customer_service_session'
  )

  const result = await CustomerServiceSessionService.requestSatisfactionRating(sessionId, adminId)

  return res.apiSuccess(result, '满意度评价邀请已推送')
}))

/**
 * POST /status - 更新管理员在线状态
 *
 * @description 管理员更新自身的客服在线状态（online / busy / offline）
 * @route POST /api/v4/console/customer-service/sessions/status
 * @access Admin
 *
 * 业务场景：
 * - 管理员进入客服工作台时设置为 online
 * - 管理员暂时离开时设置为 busy
 * - 管理员退出客服工作台时设置为 offline
 *
 * @body {string} status - 在线状态（必填，枚举：online / busy / offline）
 *
 * @returns {Object} { admin_id, status, updated_at }
 */
router.post('/status', asyncHandler(async (req, res) => {
  const admin_id = req.user.user_id
  const { status } = req.body

  if (!status) {
    return res.apiError('status 是必填参数（online / busy / offline）', 'BAD_REQUEST', null, 400)
  }

  /* 通过 ServiceManager 获取 AdminCustomerServiceService */
  const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')

  const result = await AdminCustomerServiceService.updateAdminOnlineStatus(admin_id, status)

  return res.apiSuccess(result, '在线状态更新成功')
}))

/**
 * GET /status - 获取管理员在线状态列表
 *
 * @description 批量查询管理员的客服在线状态
 * @route GET /api/v4/console/customer-service/sessions/status
 * @access Admin
 *
 * @query {string} admin_ids - 管理员ID列表，逗号分隔（如 1,2,3）
 *
 * @returns {Array<{admin_id: number, status: string}>} 管理员状态列表
 */
router.get('/status', asyncHandler(async (req, res) => {
  const { admin_ids } = req.query

  if (!admin_ids) {
    return res.apiError(
      'admin_ids 是必填参数（逗号分隔的管理员ID列表）',
      'BAD_REQUEST',
      null,
      400
    )
  }

  /* 解析并验证 admin_ids 参数 */
  const parsedIds = admin_ids
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => !isNaN(id) && id > 0)

  if (parsedIds.length === 0) {
    return res.apiError('admin_ids 参数无有效ID', 'BAD_REQUEST', null, 400)
  }

  /* 通过 ServiceManager 获取 AdminCustomerServiceService */
  const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')

  const statuses = await AdminCustomerServiceService.getAdminOnlineStatuses(parsedIds)

  return res.apiSuccess(statuses, '获取在线状态成功')
}))

module.exports = router
