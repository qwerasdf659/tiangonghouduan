/**
 * 用户认证路由 v2.0
 * 解决认证系统完全缺失的问题
 * 创建时间：2025年01月28日
 */

const express = require('express')
const jwt = require('jsonwebtoken')
const { User } = require('../../models')
const ApiResponse = require('../../utils/ApiResponse')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')

const router = express.Router()

// JWT密钥配置
const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-lottery-secret-key'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

/**
 * @route POST /api/v2/auth/login
 * @desc 用户登录（开发阶段使用万能验证码123456）
 * @access 公开
 */
router.post('/login', async (req, res) => {
  try {
    const { mobile, code } = req.body

    // 参数验证
    if (!mobile || !code) {
      return res.status(400).json(
        ApiResponse.error('手机号和验证码不能为空', 'MISSING_PARAMS')
      )
    }

    // 手机号格式验证
    const mobileRegex = /^1[3-9]\d{9}$/
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json(
        ApiResponse.error('手机号格式不正确', 'INVALID_MOBILE')
      )
    }

    // 开发阶段：验证万能验证码
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      if (code !== '123456') {
        return res.status(400).json(
          ApiResponse.error('验证码错误（开发阶段请使用123456）', 'INVALID_CODE')
        )
      }
    } else {
      // 生产环境需要实现真实的短信验证
      return res.status(501).json(
        ApiResponse.error('生产环境短信验证功能待实现', 'SMS_NOT_IMPLEMENTED')
      )
    }

    // 查找或创建用户
    let user = await User.findOne({
      where: { mobile },
      attributes: ['user_id', 'mobile', 'nickname', 'avatar_url', 'is_admin', 'total_points', 'available_points', 'status']
    })

    // 如果用户不存在，创建新用户
    if (!user) {
      user = await User.create({
        mobile,
        nickname: `用户${mobile.slice(-4)}`,
        is_admin: false,
        total_points: parseInt(process.env.NEW_USER_POINTS) || 1000,
        available_points: parseInt(process.env.NEW_USER_POINTS) || 1000,
        status: 'active',
        login_count: 1,
        last_login: new Date()
      })

      console.log(`✅ 创建新用户: ${mobile}, 初始积分: ${user.total_points}`)
    } else {
      // 检查用户状态
      if (user.status === 'banned') {
        return res.status(403).json(
          ApiResponse.error('用户已被禁用', 'USER_BANNED')
        )
      }

      // 更新登录信息
      await user.update({
        login_count: user.login_count + 1,
        last_login: new Date()
      })
    }

    // 生成JWT Token
    const tokenPayload = {
      user_id: user.user_id,
      mobile: user.mobile,
      is_admin: user.is_admin
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    })

    // 返回登录成功信息
    res.json(
      ApiResponse.success({
        token,
        userInfo: {
          userId: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          avatarUrl: user.avatar_url || '',
          isAdmin: user.is_admin,
          totalPoints: user.total_points,
          availablePoints: user.available_points,
          status: user.status
        },
        expiresIn: JWT_EXPIRES_IN
      }, '登录成功')
    )

    // 记录登录日志
    console.log(`🔐 用户登录: ${mobile}, 管理员: ${user.is_admin ? '是' : '否'}, IP: ${req.ip}`)

  } catch (error) {
    console.error('❌ 用户登录失败:', error.message)
    res.status(500).json(
      ApiResponse.error('登录失败，请稍后重试', 'LOGIN_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/auth/profile
 * @desc 获取用户信息
 * @access 需要认证
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.user_id, {
      attributes: ['user_id', 'mobile', 'nickname', 'avatar_url', 'is_admin', 'total_points', 'available_points', 'status', 'login_count', 'last_login', 'registration_date']
    })

    if (!user) {
      return res.status(404).json(
        ApiResponse.error('用户不存在', 'USER_NOT_FOUND')
      )
    }

    res.json(
      ApiResponse.success({
        userId: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        avatarUrl: user.avatar_url || '',
        isAdmin: user.is_admin,
        totalPoints: user.total_points,
        availablePoints: user.available_points,
        status: user.status,
        loginCount: user.login_count,
        lastLogin: user.last_login,
        registrationDate: user.registration_date
      }, '获取用户信息成功')
    )

  } catch (error) {
    console.error('❌ 获取用户信息失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取用户信息失败', 'GET_PROFILE_FAILED', error.message)
    )
  }
})

/**
 * @route POST /api/v2/auth/refresh
 * @desc 刷新Token
 * @access 需要认证
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    // 重新生成Token
    const tokenPayload = {
      user_id: req.user.user_id,
      mobile: req.user.mobile,
      is_admin: req.user.is_admin
    }

    const newToken = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    })

    res.json(
      ApiResponse.success({
        token: newToken,
        expiresIn: JWT_EXPIRES_IN
      }, 'Token刷新成功')
    )

  } catch (error) {
    console.error('❌ Token刷新失败:', error.message)
    res.status(500).json(
      ApiResponse.error('Token刷新失败', 'REFRESH_TOKEN_FAILED', error.message)
    )
  }
})

/**
 * @route POST /api/v2/auth/logout
 * @desc 用户登出
 * @access 需要认证
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // 在JWT模式下，登出主要是前端删除Token
    // 这里可以记录登出日志
    console.log(`🔐 用户登出: ${req.user.mobile}, IP: ${req.ip}`)

    res.json(
      ApiResponse.success(null, '登出成功')
    )

  } catch (error) {
    console.error('❌ 用户登出失败:', error.message)
    res.status(500).json(
      ApiResponse.error('登出失败', 'LOGOUT_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/auth/verify
 * @desc 验证Token有效性
 * @access 需要认证
 */
router.get('/verify', authenticateToken, (req, res) => {
  // 如果中间件通过，说明Token有效
  res.json(
    ApiResponse.success({
      valid: true,
      userId: req.user.user_id,
      mobile: req.user.mobile,
      isAdmin: req.user.is_admin
    }, 'Token验证成功')
  )
})

/**
 * @route GET /api/v2/auth/admin/check
 * @desc 检查管理员权限
 * @access 需要管理员权限
 */
router.get('/admin/check', requireAdmin, (req, res) => {
  res.json(
    ApiResponse.success({
      isAdmin: true,
      userId: req.user.user_id,
      mobile: req.user.mobile
    }, '管理员权限验证通过')
  )
})

module.exports = router 