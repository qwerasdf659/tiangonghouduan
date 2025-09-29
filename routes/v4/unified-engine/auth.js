/**
 * 统一认证引擎 - V4.0 UUID角色系统版本
 * 🛡️ 权限管理：使用UUID角色系统替代is_admin字段
 * 🔧 功能：登录、刷新Token、用户信息获取
 * 🕐 时区：北京时间 (UTC+8)
 */

const express = require('express')
const router = express.Router()
const { User: _User } = require('../../../models')
const { generateTokens, verifyRefreshToken, authenticateToken, getUserRoles } = require('../../../middleware/auth')
const ApiResponse = require('../../../utils/ApiResponse')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 🛡️ 用户登录 - 使用UUID角色系统
 * POST /api/v4/auth/login
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

    // 查找或创建用户
    let user = await _User.findOne({ where: { mobile } })

    if (!user) {
      // 自动创建新用户（登录即注册）
      user = await _User.create({
        mobile,
        status: 'active',
        last_login: new Date()
      })

      // 🛡️ 为新用户分配默认角色
      const { Role, UserRole } = require('../../../models')
      const userRole = await Role.findOne({ where: { role_name: 'user' } })
      if (userRole) {
        await UserRole.create({
          user_id: user.user_id,
          role_id: userRole.id,
          assigned_at: new Date(),
          is_active: true
        })
      }
    } else {
      // 更新最后登录时间和登录次数
      await user.update({
        last_login: new Date(),
        login_count: user.login_count + 1
      })
    }

    // 🛡️ 获取用户角色信息
    const userRoles = await getUserRoles(user.user_id)

    // 🔧 修复：使用统一的JWT Token生成函数
    const tokens = await generateTokens(user)

    const responseData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        is_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
        roles: userRoles.roles,
        status: user.status,
        last_login: user.last_login
      },
      expires_in: 7 * 24 * 60 * 60, // 7天
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    const response = ApiResponse.success(responseData, '登录成功')
    return ApiResponse.send(res, response)
  } catch (error) {
    console.error('登录失败:', error)
    return res.apiError('登录失败', 'LOGIN_FAILED', error.message, 500)
  }
})

/**
 * 🛡️ 刷新Token - 使用UUID角色系统
 * POST /api/v4/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body

    if (!refresh_token) {
      return res.apiError('刷新令牌不能为空', 'REFRESH_TOKEN_REQUIRED', null, 400)
    }

    const decoded = verifyRefreshToken(refresh_token)
    if (!decoded) {
      return res.apiError('刷新令牌无效或已过期', 'INVALID_REFRESH_TOKEN', null, 401)
    }

    // 获取用户信息
    const user = await _User.findByPk(decoded.user_id)
    if (!user || user.status !== 'active') {
      return res.apiError('用户不存在或已被禁用', 'USER_INVALID', null, 401)
    }

    // 🛡️ 获取最新角色信息
    const userRoles = await getUserRoles(user.user_id)

    // 生成新的Token
    const tokens = await generateTokens(user)

    const responseData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        is_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
        roles: userRoles.roles,
        status: user.status
      },
      expires_in: 7 * 24 * 60 * 60,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    const response = ApiResponse.success(responseData, 'Token刷新成功')
    return ApiResponse.send(res, response)
  } catch (error) {
    console.error('Token刷新失败:', error)
    return res.apiError('Token刷新失败', 'REFRESH_FAILED', error.message, 500)
  }
})

/**
 * 🛡️ 获取用户信息 - 使用UUID角色系统
 * GET /api/v4/auth/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user

    // 🛡️ 获取最新角色信息
    const userRoles = await getUserRoles(user.user_id)

    const responseData = {
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        auth_level: userRoles.isAdmin ? 'admin' : 'user',
        roles: userRoles.roles,
        status: user.status,
        last_login: user.last_login,
        login_count: user.login_count,
        history_total_points: user.history_total_points || 0,
        consecutive_fail_count: user.consecutive_fail_count || 0
      },
      permissions: {
        is_admin: userRoles.isAdmin,
        roles: userRoles.roles.map(role => ({
          uuid: role.uuid,
          name: role.name,
          level: role.level
        }))
      },
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    const response = ApiResponse.success(responseData, '获取用户信息成功')
    return ApiResponse.send(res, response)
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return res.apiError('获取用户信息失败', 'GET_USER_INFO_FAILED', error.message, 500)
  }
})

/**
 * 🛡️ 获取用户详细信息 - 使用UUID角色系统
 * GET /api/v4/auth/profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await _User.findByPk(req.user.user_id, {
      include: ['pointsAccount']
    })

    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    // 🛡️ 获取角色信息
    const userRoles = await getUserRoles(user.user_id)

    const responseData = {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      status: user.status,
      is_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
      roles: userRoles.roles,
      history_total_points: user.history_total_points || 0,
      consecutive_fail_count: user.consecutive_fail_count || 0,
      last_login: user.last_login,
      login_count: user.login_count,
      created_at: user.created_at,
      points_account: user.pointsAccount
        ? {
          current_points: user.pointsAccount.current_points,
          total_earned: user.pointsAccount.total_earned,
          total_spent: user.pointsAccount.total_spent
        }
        : null,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    const response = ApiResponse.success(responseData, '获取用户详细信息成功')
    return ApiResponse.send(res, response)
  } catch (error) {
    console.error('获取用户详细信息失败:', error)
    return res.apiError('获取用户详细信息失败', 'GET_PROFILE_FAILED', error.message, 500)
  }
})

module.exports = router
