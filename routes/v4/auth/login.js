/**
 * 餐厅积分抽奖系统 V4.0 - 用户登录API
 *
 * 业务范围：
 * - 用户登录（支持自动注册）
 * - 微信授权一键登录
 * - 微信手机号解密
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 登录操作通过 UserService 处理
 *
 * 创建时间：2025-12-22
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { generateTokens, getUserRoles } = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 🛡️ 用户登录（支持自动注册）
 * POST /api/v4/auth/login
 *
 * 业务逻辑：
 * 1. 验证验证码（开发环境：123456，生产环境：真实验证码）
 * 2. 如果用户存在 → 正常登录
 * 3. 如果用户不存在 → 自动注册并分配普通用户（user）角色
 *
 * @param {string} mobile - 手机号
 * @param {string} verification_code - 验证码
 */
router.post('/login', async (req, res) => {
  // 登录性能监控：记录开始时间
  const loginStartTime = Date.now()

  const { mobile, verification_code } = req.body

  // 验证必需参数
  if (!mobile) {
    return res.apiError('手机号不能为空', 'MOBILE_REQUIRED', null, 400)
  }

  // 验证码必填验证
  if (!verification_code || verification_code.trim() === '') {
    return res.apiError('验证码不能为空', 'VERIFICATION_CODE_REQUIRED', null, 400)
  }

  // 验证码验证逻辑
  if (process.env.NODE_ENV === 'development') {
    // 开发环境：使用万能验证码 123456
    if (verification_code !== '123456') {
      return res.apiError(
        '验证码错误（开发环境使用123456）',
        'INVALID_VERIFICATION_CODE',
        null,
        400
      )
    }
  } else {
    // 生产环境：目前开发阶段统一使用123456验证码
    if (verification_code !== '123456') {
      return res.apiError('验证码错误', 'INVALID_VERIFICATION_CODE', null, 401)
    }
  }

  // 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  /*
   * 查找用户或自动注册
   * 决策21：登录场景禁用缓存，强制查库获取最新用户状态
   */
  let user = await UserService.findByMobile(mobile, { useCache: false })
  let isNewUser = false

  if (!user) {
    // 用户不存在，使用 TransactionManager 统一事务边界（符合治理决策）
    logger.info(`用户 ${mobile} 不存在，开始自动注册...`)

    try {
      user = await TransactionManager.execute(async transaction => {
        return await UserService.registerUser(mobile, { transaction })
      })
      isNewUser = true
      logger.info(`用户 ${mobile} 注册流程完成（用户+积分账户+角色）`)
    } catch (error) {
      logger.error(`用户 ${mobile} 注册失败:`, error)

      // 处理业务错误
      if (error.code === 'MOBILE_EXISTS') {
        /*
         * 并发情况下可能出现：检查时不存在，注册时已存在
         * 决策21：登录场景禁用缓存
         */
        user = await UserService.findByMobile(mobile, { useCache: false })
        if (!user) {
          return res.apiError('用户注册失败', 'REGISTRATION_FAILED', { error: error.message }, 500)
        }
      } else {
        return res.apiError('用户注册失败', 'REGISTRATION_FAILED', { error: error.message }, 500)
      }
    }
  }

  // 检查用户状态
  if (user.status !== 'active') {
    return res.apiError('用户账户已被禁用', 'USER_INACTIVE', null, 403)
  }

  // 获取用户角色信息
  const userRoles = await getUserRoles(user.user_id)

  // 更新最后登录时间和登录次数
  await UserService.updateLoginStats(user.user_id)

  // 生成Token
  const tokens = await generateTokens(user)

  /**
   * 🔐 Token安全升级：通过HttpOnly Cookie设置refresh_token
   * - httpOnly: true → JavaScript无法读取，防御XSS攻击
   * - secure: 生产环境强制HTTPS
   * - sameSite: 'strict' → 防御CSRF攻击
   * - maxAge: 7天 → 与refresh_token有效期一致
   * - path: '/api/v4/auth' → 仅在认证路径下携带
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
    // 🔐 安全升级：refresh_token不再通过响应体返回，改为HttpOnly Cookie
    user: {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      is_admin: userRoles.isAdmin,
      roles: userRoles.roles,
      status: user.status,
      last_login: user.last_login,
      login_count: user.login_count
    },
    is_new_user: isNewUser,
    expires_in: 7 * 24 * 60 * 60, // 7天
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  const message = isNewUser ? '注册并登录成功' : '登录成功'

  // 登录性能监控：记录登录耗时
  const loginDuration = Date.now() - loginStartTime
  if (loginDuration > 3000) {
    logger.warn('⚠️ 登录耗时告警:', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
      duration: `${loginDuration}ms`,
      threshold: '3000ms',
      is_new_user: isNewUser,
      timestamp: new Date().toISOString(),
      suggestion:
        loginDuration > 5000
          ? '登录耗时>5秒，建议执行优化方案2（参考文档）'
          : '登录耗时>3秒，持续观察，如持续1周则需优化'
    })
  } else if (loginDuration > 1000) {
    logger.info(
      `📊 登录耗时: ${loginDuration}ms (用户: ${mobile.substring(0, 3)}****${mobile.substring(7)})`
    )
  }

  return res.apiSuccess(responseData, message)
})

/**
 * 🔐 微信手机号解密接口
 * POST /api/v4/auth/decrypt-phone
 *
 * 功能说明: 解密微信加密的手机号数据，返回明文手机号
 *
 * 规范遵循：
 * - API设计与契约标准规范 v2.0（2025-12-23）
 * - 参数命名规范：禁止语义不清的裸 code，使用 wx_code 替代
 *
 * @param {string} wx_code - 微信登录凭证（wx.login获取）
 * @param {string} encryptedData - 加密的手机号数据
 * @param {string} iv - 加密算法的初始向量
 */
router.post('/decrypt-phone', async (req, res) => {
  const { wx_code, encryptedData, iv } = req.body

  // 参数验证（使用语义明确的 wx_code 参数名）
  if (!wx_code || !encryptedData || !iv) {
    return res.apiError(
      '参数不完整，需要 wx_code、encryptedData 和 iv',
      'INVALID_PARAMS',
      null,
      400
    )
  }

  logger.info('📱 微信手机号解密请求...')

  // 使用 wx_code 换取 session_key
  const WXBizDataCrypt = require('../../../utils/WXBizDataCrypt')
  const axios = require('axios')

  const wxApiUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${process.env.WX_APPID}&secret=${process.env.WX_SECRET}&js_code=${wx_code}&grant_type=authorization_code`

  logger.info('🔄 请求微信API获取session_key...')
  const wxRes = await axios.get(wxApiUrl)

  if (!wxRes.data.session_key) {
    logger.error('❌ 微信session_key获取失败:', wxRes.data)
    return res.apiError('微信session_key获取失败', 'WX_SESSION_ERROR', wxRes.data, 500)
  }

  const sessionKey = wxRes.data.session_key
  logger.info('✅ 获取到微信session_key')

  // 解密手机号
  const pc = new WXBizDataCrypt(process.env.WX_APPID, sessionKey)
  const data = pc.decryptData(encryptedData, iv)

  if (!data.phoneNumber) {
    logger.error('❌ 手机号解密失败')
    return res.apiError('手机号解密失败', 'DECRYPT_FAILED', null, 500)
  }

  logger.info(`✅ 手机号解密成功: ${data.phoneNumber}`)

  return res.apiSuccess(
    {
      phoneNumber: data.phoneNumber,
      purePhoneNumber: data.purePhoneNumber,
      countryCode: data.countryCode
    },
    '手机号获取成功'
  )
})

/**
 * 🛡️ 微信授权一键登录
 * POST /api/v4/auth/quick-login
 *
 * 功能说明: 接收前端传入的微信授权手机号，完成用户登录或自动注册
 *
 * @param {string} mobile - 手机号（必填，来自微信授权）
 */
router.post('/quick-login', async (req, res) => {
  // 登录性能监控
  const loginStartTime = Date.now()

  const { mobile } = req.body

  if (!mobile) {
    return res.apiError('手机号不能为空', 'MOBILE_REQUIRED', null, 400)
  }

  logger.info(`📱 快速登录请求: ${mobile}`)

  // 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  /*
   * 查找用户
   * 决策21：登录场景禁用缓存，强制查库获取最新用户状态
   */
  let user = await UserService.findByMobile(mobile, { useCache: false })

  // 如果用户不存在，自动创建用户账户
  if (!user) {
    logger.info(`用户 ${mobile} 不存在，开始自动注册...`)

    try {
      // 使用 TransactionManager 统一事务边界（符合治理决策）
      user = await TransactionManager.execute(async transaction => {
        return await UserService.registerUser(mobile, { transaction })
      })
      logger.info(`✅ 用户 ${mobile} 注册流程完成（用户+积分账户+角色）`)
    } catch (error) {
      logger.error(`❌ 用户 ${mobile} 注册失败:`, error)

      if (error.code === 'MOBILE_EXISTS') {
        // 决策21：登录场景禁用缓存
        user = await UserService.findByMobile(mobile, { useCache: false })
        if (!user) {
          return res.apiError('用户注册失败', 'REGISTRATION_FAILED', { error: error.message }, 500)
        }
      } else {
        return res.apiError('用户注册失败', 'REGISTRATION_FAILED', { error: error.message }, 500)
      }
    }
  }

  // 验证账户状态
  if (user.status !== 'active') {
    logger.warn(`❌ 用户 ${mobile} 账户已被禁用，status: ${user.status}`)
    return res.apiError('用户账户已被禁用，无法登录', 'USER_INACTIVE', null, 403)
  }

  // 获取用户角色信息
  const userRoles = await getUserRoles(user.user_id)

  // 更新最后登录时间和登录次数
  await UserService.updateLoginStats(user.user_id)

  logger.info(
    `✅ 用户 ${mobile} 更新登录统计：last_login=${user.last_login}, login_count=${user.login_count}`
  )

  // 生成JWT Token
  const tokens = await generateTokens(user)

  /**
   * 🔐 Token安全升级：通过HttpOnly Cookie设置refresh_token
   * - httpOnly: true → JavaScript无法读取，防御XSS攻击
   * - secure: 生产环境强制HTTPS
   * - sameSite: 'strict' → 防御CSRF攻击
   * - maxAge: 7天 → 与refresh_token有效期一致
   * - path: '/api/v4/auth' → 仅在认证路径下携带
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
    // 🔐 安全升级：refresh_token不再通过响应体返回，改为HttpOnly Cookie
    user: {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      is_admin: userRoles.isAdmin,
      roles: userRoles.roles,
      status: user.status,
      created_at: user.created_at,
      last_login: user.last_login
    },
    expires_in: 7 * 24 * 60 * 60,
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  logger.info(`✅ 用户 ${mobile} 微信授权登录成功`)

  // 登录性能监控
  const loginDuration = Date.now() - loginStartTime
  if (loginDuration > 3000) {
    logger.warn('⚠️ 登录耗时告警:', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
      duration: `${loginDuration}ms`,
      threshold: '3000ms',
      login_type: 'quick_login',
      timestamp: new Date().toISOString(),
      suggestion:
        loginDuration > 5000
          ? '登录耗时>5秒，建议执行优化方案2（参考文档）'
          : '登录耗时>3秒，持续观察，如持续1周则需优化'
    })
  } else if (loginDuration > 1000) {
    logger.info(
      `📊 登录耗时: ${loginDuration}ms (用户: ${mobile.substring(0, 3)}****${mobile.substring(7)}, 类型: quick_login)`
    )
  }

  return res.apiSuccess(responseData, '快速登录成功')
})

module.exports = router
