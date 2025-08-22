/**
 * 🔥 认证API接口 v3 - 用户认证
 * 创建时间：2025年08月22日 北京时间
 * 适用区域：中国 (使用北京时间)
 * 特点：用户认证 + 权限管理 + 会话管理 + 安全增强
 * 路径：/api/v3/auth
 * 🔧 修复：统一JWT密钥配置，增强验证码安全性
 */

'use strict'

const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { User } = require('../../models')
const { requireUser, generateTokens } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')
const EventBusService = require('../../services/EventBusService')
const BeijingTime = require('../../utils/timeHelper')

// 🔧 修复：统一JWT配置，确保安全性
const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

// 🔧 安全检查：验证JWT密钥配置
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET未配置，认证功能将无法正常工作')
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 生产环境必须配置JWT_SECRET')
    process.exit(1)
  }
}

/**
 * 🔥 用户登录 - 修复：增强安全性
 */

/**
 * POST /api/v3/auth/login
 * 用户登录（手机号验证码登录）
 */
router.post(
  '/login',
  validationMiddleware([
    { field: 'mobile', type: 'string', required: true, pattern: 'phone' },
    { field: 'verification_code', type: 'string', required: true, minLength: 4, maxLength: 8 }
  ]),
  async (req, res) => {
    try {
      const { mobile, verification_code } = req.body

      console.log(`🔐 用户登录请求: 手机号=${mobile}`)

      // 🔧 修复：增强验证码安全性检查
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

      if (isDevelopment) {
        // 开发环境：验证万能验证码，但记录安全日志
        if (verification_code !== '123456') {
          console.warn(`⚠️ 开发环境验证码错误: 手机号=${mobile}, 尝试验证码=${verification_code}`)
          return res.status(400).json({
            success: false,
            error: 'INVALID_VERIFICATION_CODE',
            message: '验证码错误（开发环境请使用123456）',
            timestamp: BeijingTime.apiTimestamp()
          })
        }
        console.log(`🔓 开发环境验证码验证通过: 手机号=${mobile}`)
      } else {
        // 🔥 生产环境：实现真实的验证码验证（TODO）
        return res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: '生产环境验证码功能待实现',
          timestamp: BeijingTime.apiTimestamp()
        })
      }

      // 🔥 查找或创建用户
      let user = await User.findOne({ where: { mobile } })

      if (!user) {
        // 新用户自动注册
        user = await User.create({
          mobile,
          nickname: `用户${mobile.slice(-4)}`,
          is_admin: false,
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        })

        console.log(`👤 新用户注册: 用户ID=${user.user_id}`)

        // 🔥 发送用户注册事件
        await EventBusService.emit('user:registered', {
          user_id: user.user_id,
          mobile: user.mobile,
          registration_time: new Date().toISOString()
        })
      } else {
        // 更新最后登录时间
        await user.update({
          last_login: new Date(),
          login_count: (user.login_count || 0) + 1,
          updated_at: new Date()
        })
      }

      // 🔧 修复：使用统一的token生成函数
      const { accessToken } = generateTokens(user)

      // 🔥 发送登录事件
      await EventBusService.emit('user:login', {
        user_id: user.user_id,
        login_time: new Date().toISOString(),
        login_method: 'phone_verification',
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      })

      res.json({
        success: true,
        data: {
          user: {
            user_id: user.user_id,
            nickname: user.nickname,
            mobile: user.mobile,
            is_admin: user.is_admin,
            status: user.status
          },
          token: accessToken,
          expires_in: JWT_EXPIRES_IN
        },
        message: '登录成功',
        timestamp: BeijingTime.apiTimestamp()
      })
    } catch (error) {
      console.error('用户登录失败:', error)
      res.status(500).json({
        success: false,
        error: 'LOGIN_FAILED',
        message: '登录失败，请稍后重试',
        timestamp: BeijingTime.apiTimestamp()
      })
    }
  }
)

/**
 * 🔥 发送验证码
 */

/**
 * POST /api/v3/auth/send-code
 * 发送手机验证码
 */
router.post(
  '/send-code',
  validationMiddleware([{ field: 'mobile', type: 'string', required: true }]),
  async (req, res) => {
    try {
      const { mobile } = req.body

      console.log(`📱 发送验证码请求: 手机号=${mobile}`)

      // 🔥 开发环境：模拟发送验证码
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        res.json({
          success: true,
          data: {
            mobile,
            code_sent: true,
            expires_in: 300,
            development_code: '123456'
          },
          message: '验证码发送成功（开发环境使用123456）',
          timestamp: BeijingTime.apiTimestamp()
        })
      } else {
        // 🔥 生产环境：这里将来实现真实的短信发送
        res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: '生产环境短信功能待实现',
          timestamp: BeijingTime.apiTimestamp()
        })
      }
    } catch (error) {
      console.error('发送验证码失败:', error)
      res.status(500).json({
        success: false,
        error: 'SEND_CODE_FAILED',
        message: '发送验证码失败',
        timestamp: BeijingTime.apiTimestamp()
      })
    }
  }
)

/**
 * 🔥 用户信息管理
 */

/**
 * GET /api/v3/auth/profile
 * 获取当前用户信息
 */
router.get('/profile', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`👤 获取用户信息: 用户ID=${userId}`)

    const user = await User.findByPk(userId, {
      attributes: [
        'user_id',
        'nickname',
        'mobile',
        'is_admin',
        'status',
        'created_at',
        'last_login'
      ]
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在',
        timestamp: BeijingTime.apiTimestamp()
      })
    }

    res.json({
      success: true,
      data: {
        user: user.toJSON()
      },
      message: '获取用户信息成功',
      timestamp: BeijingTime.apiTimestamp()
    })
  } catch (error) {
    console.error('获取用户信息失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_PROFILE_FAILED',
      message: '获取用户信息失败',
      timestamp: BeijingTime.apiTimestamp()
    })
  }
})

/**
 * PUT /api/v3/auth/profile
 * 更新用户信息
 */
router.put(
  '/profile',
  requireUser,
  validationMiddleware([
    { field: 'nickname', type: 'string', required: false, minLength: 2, maxLength: 20 }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { nickname } = req.body

      console.log(`✏️ 更新用户信息: 用户ID=${userId}`)

      const user = await User.findByPk(userId)
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: '用户不存在',
          timestamp: BeijingTime.apiTimestamp()
        })
      }

      // 更新用户信息
      const updateData = {}
      if (nickname && nickname !== user.nickname) {
        updateData.nickname = nickname
      }
      updateData.updated_at = new Date()

      await user.update(updateData)

      res.json({
        success: true,
        data: {
          user: {
            user_id: user.user_id,
            nickname: user.nickname,
            mobile: user.mobile,
            is_admin: user.is_admin,
            status: user.status
          }
        },
        message: '用户信息更新成功',
        timestamp: BeijingTime.apiTimestamp()
      })
    } catch (error) {
      console.error('更新用户信息失败:', error)
      res.status(500).json({
        success: false,
        error: 'UPDATE_PROFILE_FAILED',
        message: '更新用户信息失败',
        timestamp: BeijingTime.apiTimestamp()
      })
    }
  }
)

/**
 * 🔥 Token管理
 */

/**
 * POST /api/v3/auth/refresh
 * 刷新用户Token
 */
router.post('/refresh', requireUser, async (req, res) => {
  try {
    const user = req.user

    console.log(`🔄 刷新Token: 用户ID=${user.user_id}`)

    // 生成新的JWT Token
    const newToken = jwt.sign(
      {
        user_id: user.user_id,
        mobile: user.mobile,
        is_admin: user.is_admin,
        nickname: user.nickname
      },
      process.env.JWT_SECRET || 'development_secret_key',
      { expiresIn: '7d' }
    )

    res.json({
      success: true,
      data: {
        token: newToken,
        expires_in: '7d'
      },
      message: 'Token刷新成功',
      timestamp: BeijingTime.apiTimestamp()
    })
  } catch (error) {
    console.error('刷新Token失败:', error)
    res.status(500).json({
      success: false,
      error: 'REFRESH_TOKEN_FAILED',
      message: 'Token刷新失败',
      timestamp: BeijingTime.apiTimestamp()
    })
  }
})

/**
 * POST /api/v3/auth/logout
 * 用户登出
 */
router.post('/logout', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`👋 用户登出: 用户ID=${userId}`)

    // 🔥 发送登出事件
    await EventBusService.emit('user:logout', {
      user_id: userId,
      logout_time: new Date().toISOString()
    })

    res.json({
      success: true,
      message: '登出成功',
      timestamp: BeijingTime.apiTimestamp()
    })
  } catch (error) {
    console.error('用户登出失败:', error)
    res.status(500).json({
      success: false,
      error: 'LOGOUT_FAILED',
      message: '登出失败',
      timestamp: BeijingTime.apiTimestamp()
    })
  }
})

/**
 * 🔥 权限验证
 */

/**
 * GET /api/v3/auth/verify
 * 验证Token有效性
 */
router.get('/verify', requireUser, async (req, res) => {
  try {
    const user = req.user

    res.json({
      success: true,
      data: {
        valid: true,
        user: {
          user_id: user.user_id,
          nickname: user.nickname,
          mobile: user.mobile,
          is_admin: user.is_admin
        }
      },
      message: 'Token验证成功',
      timestamp: BeijingTime.apiTimestamp()
    })
  } catch (error) {
    console.error('Token验证失败:', error)
    res.status(500).json({
      success: false,
      error: 'TOKEN_VERIFICATION_FAILED',
      message: 'Token验证失败',
      timestamp: BeijingTime.apiTimestamp()
    })
  }
})

module.exports = router
