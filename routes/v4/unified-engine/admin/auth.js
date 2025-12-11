/**
 * 管理员认证路由 - V4.0 UUID角色系统版本
 * 🛡️ 权限管理：完全使用UUID角色系统，移除is_admin字段依赖
 * 🏗️ 架构优化：路由层瘦身，业务逻辑收口到Service层
 * 创建时间：2025年01月21日
 * 更新时间：2025年12月11日
 */

const express = require('express')
const router = express.Router()
const { generateTokens, getUserRoles, authenticateToken } = require('../../../../middleware/auth')

/**
 * 🛡️ 管理员登录（基于UUID角色系统）
 * POST /api/v4/admin/auth/login
 */
router.post('/login', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('❌ 管理员登录失败:', error.message)

    // 业务错误处理（根据错误码返回对应状态码）
    if (error.code === 'VERIFICATION_CODE_REQUIRED' || error.code === 'INVALID_VERIFICATION_CODE') {
      return res.apiError(error.message, error.code, null, 400)
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.apiError(error.message, error.code, null, 404)
    }
    if (error.code === 'USER_INACTIVE' || error.code === 'INSUFFICIENT_PERMISSION') {
      return res.apiError(error.message, error.code, null, 403)
    }
    if (error.code === 'VERIFICATION_NOT_IMPLEMENTED') {
      return res.apiError(error.message, error.code, null, 501)
    }

    return res.apiError('登录失败', 'LOGIN_FAILED', null, 500)
  }
})

/**
 * 🛡️ 管理员信息获取（基于UUID角色系统）
 * GET /api/v4/admin/auth/profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
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
  } catch (error) {
    console.error('❌ 获取管理员信息失败:', error.message)

    // 业务错误处理（根据错误码返回对应状态码）
    if (error.code === 'USER_NOT_FOUND') {
      return res.apiError(error.message, error.code, null, 404)
    }
    if (error.code === 'USER_INACTIVE') {
      return res.apiError(error.message, error.code, null, 403)
    }

    return res.apiError('获取用户信息失败', 'GET_PROFILE_FAILED', null, 500)
  }
})

module.exports = router
