/**
 * 用户端设备/会话管理路由 - auth 域（设备级多会话）
 *
 * 顶层路径：/api/v4/auth/sessions
 *
 * 业务范围（docs/会话认证体系最终方案-设备级多会话.md 第七节 B）：
 * - GET    /api/v4/auth/sessions                          列出"当前登录用户自己"的在线设备
 * - DELETE /api/v4/auth/sessions/:authentication_session_id 用户踢掉自己的某台设备
 *
 * 架构规范：
 * - 路由层只负责：认证、参数校验、调用 Service、统一响应（res.api*）
 * - 不直连 models：读走 console_session_query，写走 session_management（经 ServiceManager 获取）
 * - 用户只能操作自己的会话（user_id 来自认证中间件，越权由 Service 层抛 403）
 * - 路径参数沿用项目"事务实体用 :id"惯例（此处 :authentication_session_id 即主键）
 *
 * @since 2026-06-01（设备级多会话方案）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * GET /api/v4/auth/sessions - 我的登录设备列表
 *
 * 返回当前用户所有活跃在线设备（含设备标识、登录地、是否当前设备）。
 * is_current 由后端依据本次请求的 session_token 判定（决策F，前端不解析JWT）。
 *
 * @returns {Object} { list: [{ authentication_session_id, device_id, login_platform,
 *                              login_ip, login_location, last_activity, expires_at, is_current }] }
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const SessionQueryService = req.app.locals.services.getService('console_session_query')

    const result = await SessionQueryService.getUserDevices({
      user_id: req.user.user_id,
      user_type: req.user.session_user_type || undefined, // 不限定类型时返回该用户全部在线设备
      current_session_token: req.user.session_token || null
    })

    return res.apiSuccess(result, '获取登录设备列表成功')
  })
)

/**
 * DELETE /api/v4/auth/sessions/:authentication_session_id - 踢掉自己的某台设备
 *
 * 仅能操作自己的会话（Service 层做越权校验，操作他人返回 403）。
 * 动作 = MySQL is_active=0 + 清 Redis 注册表 + Socket.io 推送该设备下线。
 *
 * @param {number} authentication_session_id - 会话主键ID
 * @returns {Object} { deactivated: true, authentication_session_id }
 */
router.delete(
  '/:authentication_session_id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const sessionId = parseInt(req.params.authentication_session_id, 10)
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('无效的会话ID', 'INVALID_SESSION_ID', null, 400)
    }

    const SessionManagementService = req.app.locals.services.getService('session_management')

    try {
      const result = await SessionManagementService.deactivateOwnSession(sessionId, {
        operator_user_id: req.user.user_id
      })
      return res.apiSuccess(result, '设备已下线', 'SESSION_DEACTIVATED')
    } catch (error) {
      // BusinessError 携带 code/statusCode：会话不存在(404) / 越权(403) / 参数无效(400)
      const statusCode = error.statusCode || 500
      if (statusCode === 404) {
        return res.apiError('会话不存在', 'SESSION_NOT_FOUND', null, 404)
      }
      if (statusCode === 403) {
        return res.apiForbidden('无权操作他人的会话')
      }
      if (statusCode === 400) {
        return res.apiError(error.message || '参数无效', 'INVALID_PARAMS', null, 400)
      }
      logger.error(`❌ [AuthSessions] 用户踢设备失败: ${error.message}`)
      return res.apiError('设备下线失败', 'SESSION_DEACTIVATE_FAILED', null, 500)
    }
  })
)

module.exports = router
