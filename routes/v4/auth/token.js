/**
 * 餐厅积分抽奖系统 V4.0 - Token管理API
 *
 * 业务范围：
 * - Token验证
 * - Token刷新
 * - 用户退出登录
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 使用统一响应 res.apiSuccess / res.apiError
 *
 * 会话管理（2026-01-21 新增）：
 * - 登出时失效对应的会话记录
 * - 支持强制登出时立即失效
 *
 * 创建时间：2025-12-22
 * 更新时间：2026-01-21（新增登出时失效会话）
 */

const express = require('express')
const router = express.Router()
const { logger, sanitize } = require('../../../utils/logger')
const {
  generateTokens,
  getUserRoles,
  authenticateToken,
  invalidateUserPermissions
} = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')
const { AuthenticationSession } = require('../../../models') // 🆕 会话模型

// 创建Token验证接口专用限流器
const rateLimiter = getRateLimiter()
const verifyRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 100, // 最多100次请求
  keyPrefix: 'rate_limit:auth:verify:',
  message: 'Token验证过于频繁，请稍后再试',
  keyGenerator: 'user' // 按用户限流
})

/**
 * 🛡️ 验证Token有效性
 * GET /api/v4/auth/verify
 *
 * 验证当前Token是否有效，返回用户完整信息
 *
 * 优化特性：
 * - 限流保护：100次/分钟（防DDoS攻击）
 * - 缓存机制：getUserRoles函数自动缓存角色信息
 */
router.get('/verify', authenticateToken, verifyRateLimiter, async (req, res) => {
  const user_id = req.user.user_id

  // 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  // 使用 UserService 获取用户信息（含状态验证）
  const user = await UserService.getUserWithValidation(user_id, {
    attributes: [
      'user_id',
      'mobile',
      'nickname',
      'status',
      'created_at',
      'last_login',
      'login_count'
    ]
  })

  // 使用缓存机制获取用户角色信息
  const userRoles = await getUserRoles(user_id)

  logger.info(`✅ [Auth] Token验证成功: user_id=${user_id}, roles=${userRoles.roles.join(',')}`)

  return res.apiSuccess(
    {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      status: user.status,
      roles: userRoles.roles,
      role_level: userRoles.role_level, // 角色级别（>= 100 为管理员）
      created_at: BeijingTimeHelper.formatToISO(user.created_at),
      last_login: BeijingTimeHelper.formatToISO(user.last_login),
      login_count: user.login_count,
      valid: true, // Token有效标识
      token_valid: true, // 新字段
      timestamp: BeijingTimeHelper.apiTimestamp()
    },
    'Token验证成功',
    'TOKEN_VALID'
  )
})

/**
 * 🛡️ 刷新访问Token
 * POST /api/v4/auth/refresh
 *
 * 🔐 Token安全升级：
 * - 优先从HttpOnly Cookie读取refresh_token（安全方式）
 * - 响应时重新设置Cookie实现Token旋转
 * - 响应体仅返回access_token
 *
 * @returns {Object} 新的访问Token
 */
router.post('/refresh', async (req, res) => {
  /**
   * 🔐 安全模式：仅从HttpOnly Cookie读取refresh_token
   * - Cookie由浏览器自动携带（credentials: 'include'）
   * - 不支持请求体传递（防止XSS窃取）
   */
  const refresh_token = req.cookies.refresh_token

  // 验证必需参数
  if (!refresh_token) {
    return res.apiError(
      '刷新Token不能为空，请确保请求携带Cookie',
      'REFRESH_TOKEN_REQUIRED',
      { hint: '前端请求需要添加 credentials: "include"' },
      400
    )
  }

  // 验证刷新Token
  const { verifyRefreshToken } = require('../../../middleware/auth')
  const verifyResult = await verifyRefreshToken(refresh_token)

  if (!verifyResult.valid) {
    // 🔐 Token无效时清除Cookie
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v4/auth'
    })
    return res.apiError('刷新Token无效', 'INVALID_REFRESH_TOKEN', null, 401)
  }

  // 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  // 使用 UserService 获取用户信息并验证状态
  const user = await UserService.getUserWithValidation(verifyResult.user.user_id)

  // 生成新的Token对
  const tokens = await generateTokens(user)

  // 获取用户角色信息
  const userRoles = await getUserRoles(user.user_id)

  /**
   * 🔐 Token旋转：重新设置HttpOnly Cookie
   * 每次刷新都生成新的refresh_token，提高安全性
   */
  res.cookie('refresh_token', tokens.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天（毫秒）
    path: '/api/v4/auth'
  })

  const responseData = {
    access_token: tokens.access_token,
    // 🔐 安全升级：refresh_token不再通过响应体返回
    user: {
      user_id: user.user_id,
      mobile: user.mobile,
      role_level: userRoles.role_level, // 角色级别（>= 100 为管理员）
      roles: userRoles.roles,
      status: user.status
    },
    expires_in: 7 * 24 * 60 * 60, // 7天
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  return res.apiSuccess(responseData, 'Token刷新成功')
})

/**
 * 🛡️ 用户退出登录
 * POST /api/v4/auth/logout
 *
 * 🔐 Token安全升级：
 * - 清除HttpOnly Cookie中的refresh_token
 * - 清除服务端权限缓存
 * - 确保下次刷新Token时重新验证账户状态
 */
router.post('/logout', authenticateToken, async (req, res) => {
  const user_id = req.user.user_id
  const sessionToken = req.user?.session_token

  /**
   * 🔐 安全升级：清除refresh_token Cookie
   * 必须与设置时的参数一致才能正确清除
   */
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v4/auth'
  })

  /**
   * 🆕 2026-01-21 会话管理：失效当前会话
   *
   * 业务规则：
   * - 登出时立即失效当前会话
   * - 会话失效后，敏感操作验证将被拒绝
   * - JWT Token 仍有效（7天），但会话已失效
   */
  if (sessionToken) {
    try {
      const session = await AuthenticationSession.findByToken(sessionToken)
      if (session) {
        await session.deactivate('用户主动退出登录')
        logger.info(
          `🔐 [Session] 会话已失效: user_id=${user_id}, session_token=${sessionToken.substring(0, 8)}...`
        )
      }
    } catch (sessionError) {
      // 会话失效失败不阻塞登出流程
      logger.warn(`⚠️ [Session] 会话失效失败（非致命）: ${sessionError.message}`)
    }
  }

  // 清除用户权限缓存
  await invalidateUserPermissions(user_id, 'user_logout', user_id)

  // 记录退出日志
  logger.info(
    `✅ [Auth] 用户退出登录: user_id=${user_id}, mobile=${sanitize.mobile(req.user.mobile)}`
  )

  return res.apiSuccess(null, '退出登录成功', 'LOGOUT_SUCCESS')
})

module.exports = router
