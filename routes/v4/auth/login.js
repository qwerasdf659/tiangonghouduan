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
 * 会话管理（2026-01-21 新增，2026-02-18 优化 TTL）：
 * - 登录成功后创建 AuthenticationSession 记录
 * - 会话有效期：7天（与 refresh_token 生命周期对齐）
 * - session_token 存入 JWT Payload，用于敏感操作验证
 * - 单设备登录策略：新登录使旧会话失效
 *
 * 创建时间：2025-12-22
 * 更新时间：2026-01-21（新增会话存储功能）
 */

const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid') // 🆕 用于生成会话令牌
const { logger, sanitize } = require('../../../utils/logger')
const { generateTokens, getUserRoles } = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const TransactionManager = require('../../../utils/TransactionManager')
const { detectLoginPlatform } = require('../../../utils/platformDetector')

// Phase 3 收口：AuthenticationSession 在路由内通过 ServiceManager 获取，避免顶部直连 models

/**
 * 📱 发送短信验证码
 * POST /api/v4/auth/send-code
 *
 * 业务流程：
 * 1. 验证手机号格式
 * 2. 频率限制检查（同手机号60秒内仅发一次）
 * 3. 每日次数限制（每天上限10次）
 * 4. 生成6位验证码存入Redis（TTL 5分钟）
 * 5. 调用SMS SDK发送短信（Phase 2 对接）
 *
 * @param {string} mobile - 手机号（11位中国大陆手机号）
 */
router.post('/send-code', async (req, res) => {
  const { mobile } = req.body

  // 手机号必填验证
  if (!mobile) {
    return res.apiError('手机号不能为空', 'MOBILE_REQUIRED', null, 400)
  }

  // 手机号格式验证（11位中国大陆手机号）
  const mobileRegex = /^1[3-9]\d{9}$/
  if (!mobileRegex.test(mobile)) {
    return res.apiError('手机号格式不正确', 'INVALID_MOBILE_FORMAT', null, 400)
  }

  try {
    // 通过 ServiceManager 获取 SmsService
    const SmsService = req.app.locals.services.getService('sms')
    const result = await SmsService.sendVerificationCode(mobile)

    return res.apiSuccess(
      {
        expires_in: result.expires_in
      },
      result.message
    )
  } catch (error) {
    // 频率限制或每日限制错误
    if (error.code === 'SMS_RATE_LIMIT' || error.code === 'SMS_DAILY_LIMIT') {
      return res.apiError(error.message, error.code, error.data, error.statusCode || 429)
    }

    logger.error('❌ 发送验证码失败:', error)
    return res.apiError('验证码发送失败，请稍后重试', 'SMS_SEND_FAILED', null, 500)
  }
})

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

  // 验证码验证逻辑：支持万能码123456 + Redis存储的真实验证码
  const SmsService = req.app.locals.services.getService('sms')
  const isCodeValid = await SmsService.verifyCode(mobile, verification_code)
  if (!isCodeValid) {
    return res.apiError('验证码错误或已过期', 'INVALID_VERIFICATION_CODE', null, 401)
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
    logger.info(`用户 ${sanitize.mobile(mobile)} 不存在，开始自动注册...`)

    try {
      user = await TransactionManager.execute(async transaction => {
        return await UserService.registerUser(mobile, { transaction })
      })
      isNewUser = true
      logger.info(`用户 ${sanitize.mobile(mobile)} 注册流程完成（用户+积分账户+角色）`)
    } catch (error) {
      logger.error(`用户 ${sanitize.mobile(mobile)} 注册失败:`, error)

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

  /**
   * 🆕 2026-01-21 会话管理功能：创建认证会话记录
   *
   * 业务规则：
   * - 生成唯一的 session_token (UUID v4)
   * - 会话有效期：7天（与 refresh_token 生命周期对齐）
   * - 敏感操作时自动续期30分钟
   * - 强制登出/其他设备登录时立即失效会话
   *
   * @see docs/会话管理功能补齐方案.md
   */
  const sessionToken = uuidv4()
  const userType = userRoles.role_level >= 100 ? 'admin' : 'user'
  const loginIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  const platform = detectLoginPlatform(req)

  // 通过 app.locals.models 获取 AuthenticationSession（app.js 中注入）
  const { AuthenticationSession } = req.app.locals.models

  try {
    /**
     * 多平台会话隔离策略（行级锁 + 原子操作）
     *
     * 策略：先锁定 → 再失效旧会话 → 最后创建新会话
     * 使用 SELECT FOR UPDATE 行级锁序列化同一用户的并发登录，
     * 避免 REPEATABLE READ 隔离级别下多个事务互相看不到未提交数据导致旧会话未被去活。
     *
     * 平台隔离规则：
     *   Web 登录 → 只踢 Web 旧会话，微信/抖音小程序不受影响
     *   微信小程序登录 → 只踢微信旧会话，Web/抖音不受影响
     */
    const isTestEnv = process.env.NODE_ENV === 'test'
    const disableMultiDeviceCheck = process.env.DISABLE_MULTI_DEVICE_CHECK === 'true'
    const forceMultiDeviceCheck = process.env.ENABLE_MULTI_DEVICE_CHECK === 'true'

    const { sequelize } = AuthenticationSession
    const transaction = await sequelize.transaction()

    try {
      // 行级锁：锁定该用户在该平台的所有活跃会话，序列化并发登录
      await sequelize.query(
        'SELECT authentication_session_id FROM authentication_sessions WHERE user_type = ? AND user_id = ? AND login_platform = ? AND is_active = 1 FOR UPDATE',
        { replacements: [userType, user.user_id, platform], transaction }
      )

      let deactivatedCount = 0
      if (forceMultiDeviceCheck || (!isTestEnv && !disableMultiDeviceCheck)) {
        deactivatedCount = await AuthenticationSession.deactivateUserSessions(
          userType,
          user.user_id,
          null,
          platform,
          { transaction }
        )
      }

      await AuthenticationSession.createSession(
        {
          session_token: sessionToken,
          user_type: userType,
          user_id: user.user_id,
          login_ip: loginIp,
          login_platform: platform,
          expires_in_minutes: 10080
        },
        { transaction }
      )

      await transaction.commit()

      if (deactivatedCount > 0) {
        logger.info(
          `🔒 [Session] 同平台会话替换: 已使 ${deactivatedCount} 个旧会话失效 (user_id=${user.user_id}, platform=${platform})`
        )

        try {
          const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
          ChatWebSocketService.disconnectUser(user.user_id, userType)
          logger.info(
            `🔌 [Session] 已断开旧设备WebSocket连接: user_id=${user.user_id}, type=${userType}`
          )
        } catch (wsError) {
          logger.debug(`🔌 [Session] WebSocket断开跳过: ${wsError.message}`)
        }
      }

      logger.info(
        `🔐 [Session] 会话创建成功: user_id=${user.user_id}, platform=${platform}, session=${sessionToken.substring(0, 8)}...`
      )
    } catch (innerError) {
      await transaction.rollback()
      throw innerError
    }
  } catch (sessionError) {
    logger.warn(`⚠️ [Session] 会话创建失败（非致命）: ${sessionError.message}`)
  }

  // 生成Token（传入 session_token 关联会话）
  const tokens = await generateTokens(user, { session_token: sessionToken })

  res.cookie('refresh_token', tokens.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/v4/auth'
  })

  const responseData = {
    access_token: tokens.access_token,
    user: {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      role_level: userRoles.role_level,
      roles: userRoles.roles,
      status: user.status,
      last_login: user.last_login,
      login_count: user.login_count
    },
    is_new_user: isNewUser,
    expires_in: 7 * 24 * 60 * 60,
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

  logger.info(`📱 快速登录请求: ${sanitize.mobile(mobile)}`)

  // 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  /* 决策 D-2：与 SMS 登录保持一致，追踪是否为新用户（2026-02-21） */
  let isNewUser = false

  /*
   * 查找用户
   * 决策21：登录场景禁用缓存，强制查库获取最新用户状态
   */
  let user = await UserService.findByMobile(mobile, { useCache: false })

  // 如果用户不存在，自动创建用户账户
  if (!user) {
    logger.info(`用户 ${sanitize.mobile(mobile)} 不存在，开始自动注册...`)

    try {
      // 使用 TransactionManager 统一事务边界（符合治理决策）
      user = await TransactionManager.execute(async transaction => {
        return await UserService.registerUser(mobile, { transaction })
      })
      isNewUser = true
      logger.info(`✅ 用户 ${sanitize.mobile(mobile)} 注册流程完成（用户+积分账户+角色）`)
    } catch (error) {
      logger.error(`❌ 用户 ${sanitize.mobile(mobile)} 注册失败:`, error)

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
    logger.warn(`❌ 用户 ${sanitize.mobile(mobile)} 账户已被禁用，status: ${user.status}`)
    return res.apiError('用户账户已被禁用，无法登录', 'USER_INACTIVE', null, 403)
  }

  // 获取用户角色信息
  const userRoles = await getUserRoles(user.user_id)

  // 更新最后登录时间和登录次数
  await UserService.updateLoginStats(user.user_id)

  logger.info(
    `✅ 用户 ${sanitize.mobile(mobile)} 更新登录统计：last_login=${user.last_login}, login_count=${user.login_count}`
  )

  /**
   * 会话管理：创建认证会话记录（快速登录 = 微信小程序专用）
   *
   * quick-login 端点固定识别为 wechat_mp：
   *   该端点仅微信小程序调用，无需通过 UA 检测
   *
   * @see docs/multi-platform-session-design.md
   */
  const sessionToken = uuidv4()
  const userType = userRoles.role_level >= 100 ? 'admin' : 'user'
  const loginIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  const platform = 'wechat_mp' // quick-login 端点固定为微信小程序

  try {
    const { AuthenticationSession } = req.app.locals.models
    const { sequelize } = AuthenticationSession

    /**
     * 多平台会话隔离（快速登录 + 行级锁防并发）
     * 仅失效 wechat_mp 平台的旧会话，Web 端不受影响
     */
    const isTestEnv = process.env.NODE_ENV === 'test'
    const disableMultiDeviceCheck = process.env.DISABLE_MULTI_DEVICE_CHECK === 'true'
    const forceMultiDeviceCheck = process.env.ENABLE_MULTI_DEVICE_CHECK === 'true'

    const transaction = await sequelize.transaction()

    try {
      // 行级锁：锁定该用户在该平台的所有活跃会话，序列化并发登录
      await sequelize.query(
        'SELECT authentication_session_id FROM authentication_sessions WHERE user_type = ? AND user_id = ? AND login_platform = ? AND is_active = 1 FOR UPDATE',
        { replacements: [userType, user.user_id, platform], transaction }
      )

      let deactivatedCount = 0
      if (forceMultiDeviceCheck || (!isTestEnv && !disableMultiDeviceCheck)) {
        deactivatedCount = await AuthenticationSession.deactivateUserSessions(
          userType,
          user.user_id,
          null,
          platform,
          { transaction }
        )
      }

      await AuthenticationSession.createSession(
        {
          session_token: sessionToken,
          user_type: userType,
          user_id: user.user_id,
          login_ip: loginIp,
          login_platform: platform,
          expires_in_minutes: 10080
        },
        { transaction }
      )

      await transaction.commit()

      if (deactivatedCount > 0) {
        logger.info(
          `🔒 [Session] 快速登录同平台会话替换: 已使 ${deactivatedCount} 个旧会话失效 (user_id=${user.user_id}, platform=${platform})`
        )

        try {
          const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
          ChatWebSocketService.disconnectUser(user.user_id, userType)
          logger.info(
            `🔌 [Session] 快速登录已断开旧设备WebSocket: user_id=${user.user_id}, type=${userType}`
          )
        } catch (wsError) {
          logger.debug(`🔌 [Session] WebSocket断开跳过: ${wsError.message}`)
        }
      }

      logger.info(
        `🔐 [Session] 快速登录会话创建成功: user_id=${user.user_id}, platform=${platform}, session=${sessionToken.substring(0, 8)}...`
      )
    } catch (innerError) {
      await transaction.rollback()
      throw innerError
    }
  } catch (sessionError) {
    logger.warn(`⚠️ [Session] 快速登录会话创建失败（非致命）: ${sessionError.message}`)
  }

  // 生成JWT Token（传入 session_token 关联会话）
  const tokens = await generateTokens(user, { session_token: sessionToken })

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
      role_level: userRoles.role_level, // 角色级别（>= 100 为管理员）
      roles: userRoles.roles,
      status: user.status,
      created_at: user.created_at,
      last_login: user.last_login
    },
    is_new_user: isNewUser, // 决策 D-2：与 SMS 登录保持一致
    expires_in: 7 * 24 * 60 * 60,
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  const message = isNewUser ? '注册并登录成功' : '快速登录成功'
  logger.info(`✅ 用户 ${sanitize.mobile(mobile)} 微信授权登录成功 (is_new_user: ${isNewUser})`)

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

  return res.apiSuccess(responseData, message)
})

module.exports = router
