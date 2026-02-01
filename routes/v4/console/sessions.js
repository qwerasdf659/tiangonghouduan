/**
 * 会话管理路由 - Console API
 *
 * @description 管理员查看和管理用户认证会话
 *
 * 功能说明：
 * - 查看所有认证会话（分页、筛选）
 * - 强制登出用户（单个会话/用户所有会话）
 * - 清理过期会话
 * - 在线用户统计
 *
 * 业务场景：
 * - 安全事件响应：发现异常登录时强制登出用户
 * - 运维管理：清理过期会话，释放资源
 * - 监控分析：查看在线用户分布和活跃度
 *
 * 权限要求：
 * - 仅限管理员（role_level >= 100）访问
 *
 * 架构规范：
 * - 读操作通过 SessionQueryService 执行（Phase 3 收口）
 * - 写操作通过 SessionManagementService 执行
 *
 * @see docs/会话管理功能补齐方案.md
 * @since 2026-01-21
 * @updated 2026-02-02（Phase 3 读写分层收口）
 */
const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * GET /api/v4/console/sessions - 会话列表（分页、筛选）
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 * @query {string} user_type - 筛选用户类型（user/admin）
 * @query {string} is_active - 筛选活跃状态（true/false）
 * @query {number} user_id - 筛选特定用户
 * @query {string} sort_by - 排序字段（last_activity/created_at/expires_at）
 * @query {string} sort_order - 排序方向（asc/desc）
 *
 * @returns {Object} 会话列表和分页信息
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // 通过 ServiceManager 获取查询服务
    const SessionQueryService = req.app.locals.services.getService('console_session_query')

    const result = await SessionQueryService.getSessions(req.query)

    return res.apiSuccess(result, '获取会话列表成功')
  } catch (error) {
    logger.error(`❌ [Sessions] 获取会话列表失败: ${error.message}`)
    return res.apiError('获取会话列表失败', 'SESSION_LIST_FAILED', { error: error.message }, 500)
  }
})

/**
 * GET /api/v4/console/sessions/stats - 会话统计
 *
 * @returns {Object} 会话统计信息
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const SessionQueryService = req.app.locals.services.getService('console_session_query')

    const result = await SessionQueryService.getSessionStats()

    return res.apiSuccess(result, '获取会话统计成功')
  } catch (error) {
    logger.error(`❌ [Sessions] 获取会话统计失败: ${error.message}`)
    return res.apiError('获取会话统计失败', 'SESSION_STATS_FAILED', { error: error.message }, 500)
  }
})

/**
 * GET /api/v4/console/sessions/online-users - 在线用户列表
 *
 * @returns {Object} 在线用户列表
 */
router.get('/online-users', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const SessionQueryService = req.app.locals.services.getService('console_session_query')

    const result = await SessionQueryService.getOnlineUsers()

    return res.apiSuccess(result, '获取在线用户列表成功')
  } catch (error) {
    logger.error(`❌ [Sessions] 获取在线用户列表失败: ${error.message}`)
    return res.apiError(
      '获取在线用户列表失败',
      'ONLINE_USERS_FAILED',
      { error: error.message },
      500
    )
  }
})

/**
 * GET /api/v4/console/sessions/:id - 会话详情
 *
 * @param {number} id - 会话ID（user_session_id）
 * @returns {Object} 会话详情
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10)
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('无效的会话ID', 'INVALID_SESSION_ID', null, 400)
    }

    const SessionQueryService = req.app.locals.services.getService('console_session_query')

    const session = await SessionQueryService.getSessionById(sessionId)

    if (!session) {
      return res.apiError('会话不存在', 'SESSION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(session, '获取会话详情成功')
  } catch (error) {
    logger.error(`❌ [Sessions] 获取会话详情失败: ${error.message}`)
    return res.apiError('获取会话详情失败', 'SESSION_DETAIL_FAILED', { error: error.message }, 500)
  }
})

/**
 * POST /api/v4/console/sessions/:id/deactivate - 失效单个会话
 *
 * @param {number} id - 会话ID（user_session_id）
 * @body {string} reason - 失效原因（可选）
 * @returns {Object} 操作结果
 */
router.post('/:id/deactivate', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10)
    const { reason } = req.body
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('无效的会话ID', 'INVALID_SESSION_ID', null, 400)
    }

    // 通过 ServiceManager 获取写服务
    const SessionManagementService = req.app.locals.services.getService('session_management')

    const result = await SessionManagementService.deactivateSession(sessionId, {
      operator_user_id: req.user.user_id,
      reason
    })

    return res.apiSuccess(
      {
        session_id: result.session_id,
        user_id: result.user_id,
        already_inactive: result.already_inactive || false,
        deactivated_at: result.deactivated_at
      },
      result.already_inactive ? '会话已经失效（幂等返回）' : '会话已失效',
      'SESSION_DEACTIVATED'
    )
  } catch (error) {
    logger.error(`❌ [Sessions] 失效会话失败: ${error.message}`)
    // 处理服务层抛出的业务错误
    if (error.message === '会话不存在') {
      return res.apiError('会话不存在', 'SESSION_NOT_FOUND', null, 404)
    }
    return res.apiError('失效会话失败', 'SESSION_DEACTIVATE_FAILED', { error: error.message }, 500)
  }
})

/**
 * POST /api/v4/console/sessions/deactivate-user - 失效用户所有会话
 *
 * @body {string} user_type - 用户类型（user/admin）
 * @body {number} user_id - 用户ID
 * @body {string} reason - 失效原因（可选）
 * @returns {Object} 操作结果
 */
router.post('/deactivate-user', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { user_type, user_id, reason } = req.body

    // 参数校验
    if (!user_type || !['user', 'admin'].includes(user_type)) {
      return res.apiError('无效的用户类型', 'INVALID_USER_TYPE', null, 400)
    }
    const userIdNum = parseInt(user_id, 10)
    if (isNaN(userIdNum) || userIdNum <= 0) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }

    // 通过 ServiceManager 获取写服务
    const SessionManagementService = req.app.locals.services.getService('session_management')

    const result = await SessionManagementService.deactivateUserSessions(
      { user_type, user_id: userIdNum },
      {
        operator_user_id: req.user.user_id,
        reason
      }
    )

    return res.apiSuccess(
      {
        user_type: result.user_type,
        user_id: result.user_id,
        affected_count: result.affected_count,
        reason: result.reason
      },
      `已失效该用户的 ${result.affected_count} 个会话`,
      'USER_SESSIONS_DEACTIVATED'
    )
  } catch (error) {
    logger.error(`❌ [Sessions] 失效用户会话失败: ${error.message}`)
    // 处理服务层抛出的业务错误
    if (error.message === '不能踢出自己的所有会话') {
      return res.apiError('不能踢出自己的会话', 'CANNOT_DEACTIVATE_SELF', null, 400)
    }
    return res.apiError(
      '失效用户会话失败',
      'USER_SESSIONS_DEACTIVATE_FAILED',
      { error: error.message },
      500
    )
  }
})

/**
 * POST /api/v4/console/sessions/cleanup - 清理过期会话
 *
 * @returns {Object} 清理结果
 */
router.post('/cleanup', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // 通过 ServiceManager 获取写服务
    const SessionManagementService = req.app.locals.services.getService('session_management')

    const result = await SessionManagementService.cleanupExpiredSessions({
      operator_user_id: req.user.user_id
    })

    return res.apiSuccess(
      {
        deleted_count: result.deleted_count,
        cleanup_at: result.cleanup_at
      },
      `已清理 ${result.deleted_count} 个过期会话`,
      'CLEANUP_COMPLETED'
    )
  } catch (error) {
    logger.error(`❌ [Sessions] 清理过期会话失败: ${error.message}`)
    return res.apiError('清理过期会话失败', 'CLEANUP_FAILED', { error: error.message }, 500)
  }
})

module.exports = router
