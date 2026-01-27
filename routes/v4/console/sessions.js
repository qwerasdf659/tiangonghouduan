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
 * @see docs/会话管理功能补齐方案.md
 * @since 2026-01-21
 */
const express = require('express')
const router = express.Router()
const { Op } = require('sequelize')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { AuthenticationSession, User } = require('../../../models')
const logger = require('../../../utils/logger').logger
const BeijingTimeHelper = require('../../../utils/timeHelper')
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
    const {
      page = 1,
      page_size = 20,
      user_type,
      is_active,
      user_id,
      sort_by = 'last_activity',
      sort_order = 'desc'
    } = req.query
    // 参数校验
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size, 10) || 20))
    // 构建查询条件
    const whereCondition = {}
    if (user_type && ['user', 'admin'].includes(user_type)) {
      whereCondition.user_type = user_type
    }
    if (is_active !== undefined && is_active !== '') {
      whereCondition.is_active = is_active === 'true'
    }
    if (user_id) {
      const userIdNum = parseInt(user_id, 10)
      if (!isNaN(userIdNum) && userIdNum > 0) {
        whereCondition.user_id = userIdNum
      }
    }
    // 排序配置
    const allowedSortFields = ['last_activity', 'created_at', 'expires_at']
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'last_activity'
    const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC'
    // 查询会话（不使用include避免模型scope问题）
    const { count, rows: sessions } = await AuthenticationSession.findAndCountAll({
      where: whereCondition,
      order: [[sortField, sortDirection]],
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum
    })
    // 批量查询关联的用户信息（避免N+1查询）
    const userIds = [...new Set(sessions.map(s => s.user_id).filter(Boolean))]
    const users =
      userIds.length > 0
        ? await User.findAll({
            where: { user_id: userIds },
            attributes: ['user_id', 'nickname', 'mobile', 'status']
          })
        : []
    const userMap = new Map(users.map(u => [u.user_id, u]))
    // 格式化返回数据
    const formattedSessions = sessions.map(session => {
      const userInfo = userMap.get(session.user_id)
      return {
        user_session_id: session.user_session_id,
        session_token: `${session.session_token.substring(0, 8)}...`, // 脱敏显示
        user_type: session.user_type,
        user_id: session.user_id,
        user_info: userInfo
          ? {
              nickname: userInfo.nickname,
              mobile: userInfo.mobile
                ? `${userInfo.mobile.substring(0, 3)}****${userInfo.mobile.substring(7)}`
                : null,
              status: userInfo.status
            }
          : null,
        login_ip: session.login_ip,
        is_active: session.is_active,
        is_expired: session.isExpired(),
        is_valid: session.isValid(),
        last_activity: BeijingTimeHelper.formatToISO(session.last_activity),
        expires_at: BeijingTimeHelper.formatToISO(session.expires_at),
        created_at: BeijingTimeHelper.formatToISO(session.created_at)
      }
    })
    return res.apiSuccess(
      {
        sessions: formattedSessions,
        pagination: {
          page: pageNum,
          page_size: pageSizeNum,
          total: count,
          total_pages: Math.ceil(count / pageSizeNum)
        }
      },
      '获取会话列表成功'
    )
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
    // 获取活跃会话统计（按用户类型分组）
    const activeStats = await AuthenticationSession.getActiveSessionStats()
    // 计算总活跃会话数
    const totalActiveSessions = Object.values(activeStats).reduce(
      (sum, stat) => sum + stat.active_sessions,
      0
    )
    // 获取待清理的过期会话数
    const expiredPendingCleanup = await AuthenticationSession.count({
      where: {
        expires_at: {
          [Op.lt]: BeijingTimeHelper.createBeijingTime()
        }
      }
    })
    // 获取今日新建会话数
    const todayStart = BeijingTimeHelper.createBeijingTime()
    todayStart.setHours(0, 0, 0, 0)
    const todayNewSessions = await AuthenticationSession.count({
      where: {
        created_at: {
          [Op.gte]: todayStart
        }
      }
    })
    return res.apiSuccess(
      {
        total_active_sessions: totalActiveSessions,
        by_user_type: {
          user: activeStats.user || { active_sessions: 0, unique_users: 0 },
          admin: activeStats.admin || { active_sessions: 0, unique_users: 0 }
        },
        expired_pending_cleanup: expiredPendingCleanup,
        today_new_sessions: todayNewSessions,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '获取会话统计成功'
    )
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
    const now = BeijingTimeHelper.createBeijingTime()
    /*
     * 查询所有活跃且未过期的会话，按用户分组
     * 查询活跃会话（不使用include避免模型scope问题）
     */
    const activeSessions = await AuthenticationSession.findAll({
      where: {
        is_active: true,
        expires_at: {
          [Op.gt]: now
        }
      },
      order: [['last_activity', 'DESC']]
    })

    // 批量查询关联用户信息
    const userIds = [...new Set(activeSessions.map(s => s.user_id).filter(Boolean))]
    const users =
      userIds.length > 0
        ? await User.findAll({
            where: { user_id: userIds },
            attributes: ['user_id', 'nickname', 'mobile', 'status']
          })
        : []
    const userMap = new Map(users.map(u => [u.user_id, u]))

    // 按用户聚合
    const userSessionMap = new Map()
    for (const session of activeSessions) {
      const userId = session.user_id
      const userType = session.user_type
      const userInfo = userMap.get(userId)
      if (!userSessionMap.has(userId)) {
        userSessionMap.set(userId, {
          user_id: userId,
          user_type: userType,
          nickname: userInfo?.nickname || null,
          mobile: userInfo?.mobile
            ? `${userInfo.mobile.substring(0, 3)}****${userInfo.mobile.substring(7)}`
            : null,
          status: userInfo?.status || null,
          active_sessions: 0,
          last_activity: session.last_activity,
          login_ips: new Set()
        })
      }
      const userData = userSessionMap.get(userId)
      userData.active_sessions++
      if (session.login_ip) {
        userData.login_ips.add(session.login_ip)
      }
      // 保留最近的活动时间
      if (session.last_activity > userData.last_activity) {
        userData.last_activity = session.last_activity
      }
    }
    // 格式化返回数据
    const onlineUsers = Array.from(userSessionMap.values()).map(user => ({
      user_id: user.user_id,
      user_type: user.user_type,
      nickname: user.nickname,
      mobile: user.mobile,
      status: user.status,
      active_sessions: user.active_sessions,
      last_activity: BeijingTimeHelper.formatToISO(user.last_activity),
      login_ips: Array.from(user.login_ips)
    }))
    return res.apiSuccess(
      {
        online_users: onlineUsers,
        total_online: onlineUsers.length
      },
      '获取在线用户列表成功'
    )
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

    // 查询会话（不使用include避免模型scope问题）
    const session = await AuthenticationSession.findOne({
      where: { user_session_id: sessionId }
    })

    if (!session) {
      return res.apiError('会话不存在', 'SESSION_NOT_FOUND', null, 404)
    }

    // 单独查询用户信息
    const userInfo = await User.findOne({
      where: { user_id: session.user_id },
      attributes: ['user_id', 'nickname', 'mobile', 'status', 'created_at', 'last_login']
    })

    return res.apiSuccess(
      {
        user_session_id: session.user_session_id,
        session_token: `${session.session_token.substring(0, 8)}...`, // 脱敏显示
        user_type: session.user_type,
        user_id: session.user_id,
        user_info: userInfo
          ? {
              user_id: userInfo.user_id,
              nickname: userInfo.nickname,
              mobile: userInfo.mobile
                ? `${userInfo.mobile.substring(0, 3)}****${userInfo.mobile.substring(7)}`
                : null,
              status: userInfo.status,
              created_at: BeijingTimeHelper.formatToISO(userInfo.created_at),
              last_login: BeijingTimeHelper.formatToISO(userInfo.last_login)
            }
          : null,
        login_ip: session.login_ip,
        is_active: session.is_active,
        is_expired: session.isExpired(),
        is_valid: session.isValid(),
        last_activity: BeijingTimeHelper.formatToISO(session.last_activity),
        expires_at: BeijingTimeHelper.formatToISO(session.expires_at),
        created_at: BeijingTimeHelper.formatToISO(session.created_at),
        updated_at: BeijingTimeHelper.formatToISO(session.updated_at)
      },
      '获取会话详情成功'
    )
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
    const session = await AuthenticationSession.findByPk(sessionId)
    if (!session) {
      return res.apiError('会话不存在', 'SESSION_NOT_FOUND', null, 404)
    }
    if (!session.is_active) {
      return res.apiError('会话已经失效', 'SESSION_ALREADY_INACTIVE', null, 400)
    }
    // 失效会话
    await session.deactivate(reason || `管理员手动登出 (operator: ${req.user.user_id})`)
    logger.info(
      `🔐 [Sessions] 管理员失效会话: session_id=${sessionId}, user_id=${session.user_id}, operator=${req.user.user_id}`
    )
    return res.apiSuccess(
      {
        session_id: sessionId,
        user_id: session.user_id,
        deactivated_at: BeijingTimeHelper.apiTimestamp()
      },
      '会话已失效',
      'SESSION_DEACTIVATED'
    )
  } catch (error) {
    logger.error(`❌ [Sessions] 失效会话失败: ${error.message}`)
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
    // 防止管理员踢出自己
    if (user_type === 'admin' && userIdNum === req.user.user_id) {
      return res.apiError('不能踢出自己的会话', 'CANNOT_DEACTIVATE_SELF', null, 400)
    }
    // 失效用户所有会话
    const deactivateReason = reason || `管理员强制登出 (operator: ${req.user.user_id})`
    const affectedCount = await AuthenticationSession.deactivateUserSessions(
      user_type,
      userIdNum,
      null // 不排除任何会话
    )
    logger.info(
      `🔐 [Sessions] 管理员失效用户所有会话: user_type=${user_type}, user_id=${userIdNum}, affected=${affectedCount}, operator=${req.user.user_id}`
    )
    return res.apiSuccess(
      {
        user_type,
        user_id: userIdNum,
        affected_count: affectedCount,
        reason: deactivateReason
      },
      `已失效该用户的 ${affectedCount} 个会话`,
      'USER_SESSIONS_DEACTIVATED'
    )
  } catch (error) {
    logger.error(`❌ [Sessions] 失效用户会话失败: ${error.message}`)
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
    const deletedCount = await AuthenticationSession.cleanupExpiredSessions()
    logger.info(
      `🗑️ [Sessions] 管理员清理过期会话: deleted=${deletedCount}, operator=${req.user.user_id}`
    )
    return res.apiSuccess(
      {
        deleted_count: deletedCount,
        cleanup_at: BeijingTimeHelper.apiTimestamp()
      },
      `已清理 ${deletedCount} 个过期会话`,
      'CLEANUP_COMPLETED'
    )
  } catch (error) {
    logger.error(`❌ [Sessions] 清理过期会话失败: ${error.message}`)
    return res.apiError('清理过期会话失败', 'CLEANUP_FAILED', { error: error.message }, 500)
  }
})
module.exports = router
