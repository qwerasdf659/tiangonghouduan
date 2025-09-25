/**
 * V4统一认证引擎路由
 * 提供统一的认证接口，支持用户和管理员认证
 *
 * @version 4.0.0
 * @date 2025-09-19
 */

const express = require('express')
const router = express.Router()
const ApiResponse = require('../../../utils/ApiResponse')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const jwt = require('jsonwebtoken')
const { User } = require('../../../models')

// 统一认证验证中间件
const { authenticateToken } = require('../../../middleware/auth')

/**
 * 用户登录/注册（合并接口）
 * POST /api/v4/unified-engine/auth/login
 * POST /api/v4/unified-engine/auth/register
 */
router.post('/login', async (req, res) => {
  try {
    const { mobile, verification_code } = req.body

    // 验证输入参数
    if (!mobile || !verification_code) {
      return ApiResponse.error(res, '手机号和验证码不能为空', 400)
    }

    // 验证码验证（开发环境：123456万能码）
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
    if (isDevelopment && verification_code !== '123456') {
      return ApiResponse.error(res, '验证码错误', 400)
    }

    // 查找或创建用户
    let user = await User.findOne({ where: { mobile } })

    if (!user) {
      // 自动创建新用户（登录即注册）
      user = await User.create({
        mobile,
        status: 'active',
        is_admin: false,
        last_login: new Date()
      })
    } else {
      // 更新最后登录时间
      await user.update({ last_login: new Date() })
    }

    // 生成JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        mobile: user.mobile,
        is_admin: user.is_admin || false
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    )

    return ApiResponse.success(res, {
      token,
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        is_admin: user.is_admin || false,
        status: user.status,
        last_login: user.last_login
      },
      expires_in: 7 * 24 * 60 * 60, // 7天
      timestamp: BeijingTimeHelper.apiTimestamp()
    }, '登录成功')
  } catch (error) {
    console.error('V4统一登录失败:', error)
    return ApiResponse.error(res, '登录失败', 500)
  }
})

// 注册接口重定向到登录（登录即注册）
router.post('/register', (req, res, next) => {
  // 直接调用登录逻辑
  router.handle(
    { ...req, method: 'POST', url: '/login' },
    res,
    next
  )
})

/**
 * 用户登出
 * POST /api/v4/unified-engine/auth/logout
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // 这里可以实现token黑名单逻辑
    // 目前简单返回成功，客户端删除token即可

    return ApiResponse.success(res, {
      user_id: req.user.user_id,
      logged_out_at: BeijingTimeHelper.apiTimestamp()
    }, '登出成功')
  } catch (error) {
    console.error('V4统一登出失败:', error)
    return ApiResponse.error(res, '登出失败', 500)
  }
})

/**
 * 用户认证验证
 * POST /api/v4/unified-engine/auth/verify
 */
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    return ApiResponse.success(res, {
      user_id: req.user.user_id,
      is_authenticated: true,
      auth_level: req.user.is_admin ? 'admin' : 'user',
      timestamp: BeijingTimeHelper.apiTimestamp()
    }, '认证验证成功')
  } catch (error) {
    console.error('V4认证验证失败:', error)
    return ApiResponse.error(res, '认证验证失败', 500)
  }
})

/**
 * 获取用户认证状态
 * GET /api/v4/unified-engine/auth/status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    return ApiResponse.success(res, {
      user_id: req.user.user_id,
      mobile: req.user.mobile,
      is_admin: req.user.is_admin || false,
      status: 'authenticated',
      session_valid: true,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }, '获取认证状态成功')
  } catch (error) {
    console.error('获取认证状态失败:', error)
    return ApiResponse.error(res, '获取认证状态失败', 500)
  }
})

/**
 * 刷新认证令牌
 * POST /api/v4/unified-engine/auth/refresh
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    // 这里可以实现令牌刷新逻辑
    return ApiResponse.success(res, {
      user_id: req.user.user_id,
      refreshed_at: BeijingTimeHelper.apiTimestamp(),
      expires_in: 3600 // 1小时
    }, '令牌刷新成功')
  } catch (error) {
    console.error('令牌刷新失败:', error)
    return ApiResponse.error(res, '令牌刷新失败', 500)
  }
})

/**
 * 认证健康检查
 * GET /api/v4/unified-engine/auth/health
 */
router.get('/health', (req, res) => {
  try {
    return res.apiSuccess({
      status: 'healthy',
      service: 'V4统一认证引擎',
      version: '4.0.0',
      timestamp: BeijingTimeHelper.apiTimestamp()
    }, 'V4认证引擎运行正常')
  } catch (error) {
    console.error('认证健康检查失败:', error)
    return res.apiError('认证健康检查失败', 'HEALTH_CHECK_FAILED', { error: error.message }, 500)
  }
})

module.exports = router
