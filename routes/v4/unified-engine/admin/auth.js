/**
 * 管理员认证路由 - V4.0 UUID角色系统版本
 * 🛡️ 权限管理：完全使用UUID角色系统，移除is_admin字段依赖
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const express = require('express')
const router = express.Router()
const { User } = require('../../../../models')
const { generateTokens, getUserRoles } = require('../../../../middleware/auth')

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

    // 开发环境万能验证码
    if (process.env.NODE_ENV === 'development' && verification_code !== '123456') {
      return res.apiError('验证码错误', 'INVALID_VERIFICATION_CODE', null, 400)
    }

    // 查找用户
    const user = await User.findOne({ where: { mobile } })

    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    if (user.status !== 'active') {
      return res.apiError('用户账户已被禁用', 'USER_INACTIVE', null, 403)
    }

    // 🛡️ 检查用户是否具有管理员权限（基于UUID角色系统）
    const userRoles = await getUserRoles(user.user_id)
    if (!userRoles.isAdmin) {
      return res.apiError('用户不具备管理员权限', 'INSUFFICIENT_PERMISSION', null, 403)
    }

    // 更新最后登录时间
    await user.update({
      last_login: new Date(),
      login_count: user.login_count + 1
    })

    // 生成Token
    const tokens = await generateTokens(user)

    return res.apiSuccess('管理员登录成功', {
      ...tokens,
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        role_level: userRoles.roleLevel,
        roles: userRoles.roles
      }
    })
  } catch (error) {
    console.error('❌ 管理员登录失败:', error.message)
    return res.apiError('登录失败', 'LOGIN_FAILED', null, 500)
  }
})

/**
 * 🛡️ 管理员信息获取（基于UUID角色系统）
 * GET /api/v4/admin/auth/profile
 */
router.get('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.apiError('缺少认证Token', 'MISSING_TOKEN', null, 401)
    }

    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // 获取用户信息
    const user = await User.findOne({
      where: { user_id: decoded.user_id, status: 'active' }
    })

    if (!user) {
      return res.apiError('用户不存在或已被禁用', 'USER_NOT_FOUND', null, 401)
    }

    // 🛡️ 获取用户角色信息
    const userRoles = await getUserRoles(user.user_id)

    // 验证管理员权限
    if (!userRoles.isAdmin) {
      return res.apiError('用户不具备管理员权限', 'INSUFFICIENT_PERMISSION', null, 403)
    }

    return res.apiSuccess('获取管理员信息成功', {
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        role_level: userRoles.roleLevel,
        roles: userRoles.roles,
        last_login: user.last_login,
        login_count: user.login_count,
        created_at: user.created_at
      }
    })
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.apiError('无效的Token', 'INVALID_TOKEN', null, 401)
    } else if (error.name === 'TokenExpiredError') {
      return res.apiError('Token已过期', 'TOKEN_EXPIRED', null, 401)
    } else {
      console.error('❌ 获取管理员信息失败:', error.message)
      return res.apiError('获取用户信息失败', 'GET_PROFILE_FAILED', null, 500)
    }
  }
})

module.exports = router
