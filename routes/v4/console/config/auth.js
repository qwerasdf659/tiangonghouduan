/**
 * 管理员认证路由 - V4.0 UUID角色系统版本
 *
 * 会话管理（2026-02-19 补齐，2026-06-01 切换设备级多会话）：
 * - 管理后台登录固定 user_type='admin'，与用户端(user)天然隔离
 * - 同一管理员可同时保持：小程序(user+wechat_mp) + 管理后台(admin+web)
 * - 设备级多会话：隔离 key = (user_id, user_type) + device_id（不再按 platform 互斥）
 *   多电脑/多标签 = 不同 device_id = 并存不互踢；同设备重登 = 替换自己旧会话（token 轮换）
 * - 管理端会话 12 小时（决策6）；管理后台登出时失效会话 + 同步清 Redis
 *
 */

const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')
const {
  generateTokens,
  getUserRoles,
  authenticateToken,
  invalidateUserPermissions
} = require('../../../../middleware/auth')
const { asyncHandler } = require('../shared/middleware')
const { logger } = require('../../../../utils/logger')
const { detectLoginPlatform } = require('../../../../utils/platformDetector')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * 🛡️ 管理员登录（基于UUID角色系统）
 * POST /api/v4/console/auth/login
 *
 * 会话管理：创建 AuthenticationSession 并通过多平台隔离策略管理会话
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { mobile, verification_code } = req.body

    if (!mobile) {
      return res.apiError('手机号不能为空', 'MOBILE_REQUIRED', null, 400)
    }

    const UserService = req.app.locals.services.getService('user')
    const { user, roles } = await UserService.adminLogin(mobile, verification_code)

    /**
     * 会话管理：创建认证会话（原子操作 + 行级锁防并发）
     *
     * 策略：先锁定 → 再失效旧会话 → 最后创建新会话
     * 使用 SELECT FOR UPDATE 行级锁序列化同一用户的并发登录，
     * 避免 REPEATABLE READ 隔离级别下多个事务互相看不到未提交数据导致旧会话未被去活。
     */
    const sessionToken = uuidv4()
    /**
     * 设备级多会话：管理后台登录固定 user_type='admin'，与用户端(user)天然隔离。
     *   - 同一管理员可同时保持小程序(user) + 管理后台(admin) 两个会话
     *   - 管理后台多电脑/多标签 = 不同 device_id = 并存不互踢（解决"同账号互踢"痛点）
     *   - 同 device_id 重登 = 替换自己这台设备旧会话（token 轮换）
     * platform 降级为展示标签，不参与隔离判定。
     */
    const userType = 'admin'
    const loginIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
    const platform = detectLoginPlatform(req)
    const deviceId = req.headers['x-device-id'] || null

    try {
      // 写操作收口 SessionManagementService（设备级登录会话创建）
      const SessionManagementService = req.app.locals.services.getService('session_management')
      await SessionManagementService.createDeviceSession({
        session_token: sessionToken,
        user_type: userType,
        user_id: user.user_id,
        device_id: deviceId,
        login_ip: loginIp,
        login_platform: platform,
        expires_in_minutes: 720 // 管理端 12 小时（决策6：B端权限大用短会话增强安全）
      })
    } catch (sessionError) {
      logger.warn(`⚠️ [Session] 管理后台会话创建失败（非致命）: ${sessionError.message}`)
    }

    const tokens = await generateTokens(user, {
      session_token: sessionToken,
      device_id: deviceId
    })

    res.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v4/auth'
    })

    return res.apiSuccess(
      {
        access_token: tokens.access_token,
        user: {
          user_id: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          status: user.status,
          user_level: user.user_level,
          role_level: roles.role_level,
          roles: roles.roles
        },
        expires_in: 7 * 24 * 60 * 60,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '管理员登录成功'
    )
  })
)

/**
 * 🛡️ 管理员信息获取（基于UUID角色系统）
 * GET /api/v4/console/auth/profile
 */
router.get(
  '/profile',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // ✅ 通过 ServiceManager 获取 UserService
    const UserService = req.app.locals.services.getService('user')

    // ✅ 调用 Service 层方法获取用户信息（含状态验证）
    const user = await UserService.getUserWithValidation(req.user.user_id, {
      attributes: [
        'user_id',
        'mobile',
        'nickname',
        'status',
        'user_level',
        'last_login',
        'login_count',
        'created_at'
      ]
    })

    // 获取用户角色信息
    const userRoles = await getUserRoles(user.user_id)

    // 验证后台访问权限（role_level > 0 即可访问后台，菜单按权限过滤）
    if (userRoles.role_level <= 0) {
      return res.apiError('用户不具备后台访问权限', 'INSUFFICIENT_PERMISSION', null, 403)
    }

    // 返回管理员信息 - 参数顺序：data第1个, message第2个
    return res.apiSuccess(
      {
        user: {
          user_id: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          status: user.status,
          user_level: user.user_level,
          role_level: userRoles.role_level,
          roles: userRoles.roles,
          last_login: user.last_login,
          login_count: user.login_count,
          created_at: user.created_at
        }
      },
      '获取管理员信息成功'
    )
  })
)

/**
 * 🛡️ 管理员退出登录
 * POST /api/v4/console/auth/logout
 *
 * 失效当前会话 + 清除 refresh_token Cookie + 清除权限缓存
 */
router.post(
  '/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id
    const sessionToken = req.user?.session_token

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v4/auth'
    })

    if (sessionToken) {
      try {
        const { AuthenticationSession } = req.app.locals.models
        const session = await AuthenticationSession.findByToken(sessionToken)
        if (session) {
          await session.deactivate('管理员主动退出登录')
          // 同步清 Redis 会话注册表（设备级）
          const SessionManagementService = req.app.locals.services.getService('session_management')
          await SessionManagementService.unregisterSession(session.user_id, session.device_id)
          logger.info(
            `🔐 [Session] 管理后台会话已失效: user_id=${userId}, session=${sessionToken.substring(0, 8)}...`
          )
        }
      } catch (sessionError) {
        logger.warn(`⚠️ [Session] 管理后台会话失效失败（非致命）: ${sessionError.message}`)
      }
    }

    await invalidateUserPermissions(userId, 'console_logout', userId)
    logger.info(`✅ [Auth] 管理员退出登录: user_id=${userId}`)

    return res.apiSuccess(null, '退出登录成功', 'LOGOUT_SUCCESS')
  })
)

module.exports = router
