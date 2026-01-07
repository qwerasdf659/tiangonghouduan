/**
 * 管理员认证路由 - V4.0 UUID角色系统版本
 * 🛡️ 权限管理：完全使用UUID角色系统，移除is_admin字段依赖
 * 🏗️ 架构优化：路由层瘦身，业务逻辑收口到Service层
 * 创建时间：2025年01月21日
 * 更新时间：2025年12月11日
 */

const express = require('express')
const router = express.Router()
const { generateTokens, getUserRoles, authenticateToken } = require('../../../middleware/auth')
/**
 * 🛡️ 管理员登录（基于UUID角色系统）
 * POST /api/v4/console/auth/login
 */
router.post('/login', async (req, res) => {
  const { mobile, verification_code } = req.body

  // 验证必需参数
  if (!mobile) {
    return res.apiError('手机号不能为空', 'MOBILE_REQUIRED', null, 400)
  }

  // ✅ 通过 ServiceManager 获取 UserService
  const UserService = req.app.locals.services.getService('user')

  // ✅ 调用 Service 层方法（Service 内部完成所有验证和业务逻辑）
  const { user, roles } = await UserService.adminLogin(mobile, verification_code)

  // 生成Token
  const tokens = await generateTokens(user)

  // 返回登录结果 - 参数顺序：data第1个, message第2个
  return res.apiSuccess(
    {
      ...tokens,
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        role_level: roles.role_level,
        roles: roles.roles
      }
    },
    '管理员登录成功'
  )
})

/**
 * 🛡️ 管理员信息获取（基于UUID角色系统）
 * GET /api/v4/console/auth/profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  // ✅ 通过 ServiceManager 获取 UserService
  const UserService = req.app.locals.services.getService('user')

  // ✅ 调用 Service 层方法获取用户信息（含状态验证）
  const user = await UserService.getUserWithValidation(req.user.user_id, {
    attributes: [
      'user_id',
      'mobile',
      'nickname',
      'status',
      'last_login',
      'login_count',
      'created_at'
    ]
  })

  // 获取用户角色信息
  const userRoles = await getUserRoles(user.user_id)

  // 验证管理员权限
  if (!userRoles.isAdmin) {
    return res.apiError('用户不具备管理员权限', 'INSUFFICIENT_PERMISSION', null, 403)
  }

  // 返回管理员信息 - 参数顺序：data第1个, message第2个
  return res.apiSuccess(
    {
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
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

module.exports = router
