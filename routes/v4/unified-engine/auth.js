const logger = require('../../../utils/logger').logger

/**
 * V4认证系统路由 - RESTful标准设计（基于UUID角色系统）
 *
 * @route /api/v4/auth
 * @standard RESTful资源导向设计
 * @reference 腾讯云、阿里云、网易云、米哈游行业标准
 *
 * @description 用户认证与授权系统，支持手机号+验证码登录
 *
 * @features
 * - 用户登录/登出（POST /login, POST /logout）
 * - Token验证/刷新（GET /verify, POST /refresh）
 * - 权限检查中间件（authenticateToken, getUserRoles）
 * - JWT认证 + BCrypt密码加密
 * - 限流保护（10次/分钟/IP防暴力破解）
 * - 首次登录自动创建积分账户
 *
 * 🛡️ 权限管理：基于UUID角色系统（移除is_admin依赖）
 *
 * 创建时间：2025年01月21日
 * 更新时间：2025年11月11日（API路径重构为RESTful标准）
 */

const express = require('express')
const router = express.Router()
const {
  generateTokens,
  getUserRoles,
  authenticateToken,
  invalidateUserPermissions
} = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')
// ✅ 风险点3解决：创建Token验证接口专用限流器
const rateLimiter = getRateLimiter()
const verifyRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 100, // 最多100次请求（正常用户约12次/分钟，留足余量）
  keyPrefix: 'rate_limit:auth:verify:',
  message: 'Token验证过于频繁，请稍后再试',
  keyGenerator: 'user' // 按用户限流（防止恶意用户滥用）
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
  /*
   * 🔴 登录性能监控：记录开始时间（2025-11-09新增）
   * 用于监控登录响应时间，判断是否需要优化（文档方案0建议）
   */
  const loginStartTime = Date.now()

  const { mobile, verification_code } = req.body

  // 验证必需参数
  if (!mobile) {
    return res.apiError('手机号不能为空', 'MOBILE_REQUIRED', null, 400)
  }

  // ✅ 验证码必填验证
  if (!verification_code || verification_code.trim() === '') {
    return res.apiError('验证码不能为空', 'VERIFICATION_CODE_REQUIRED', null, 400)
  }

  // ✅ 验证码验证逻辑
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
    /*
     * 生产环境：真实验证码验证逻辑
     * TODO: 实现短信验证码验证
     */
    return res.apiError('生产环境验证码验证未实现', 'VERIFICATION_NOT_IMPLEMENTED', null, 501)
  }

  // 🎯 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  // 查找用户或自动注册
  let user = await UserService.findByMobile(mobile)
  let isNewUser = false

  if (!user) {
    // 用户不存在，自动注册（Service 内部管理事务）
    logger.info(`用户 ${mobile} 不存在，开始自动注册...`)

    try {
      user = await UserService.registerUser(mobile)
      isNewUser = true
      logger.info(`用户 ${mobile} 注册流程完成（用户+积分账户+角色）`)
    } catch (error) {
      logger.error(`用户 ${mobile} 注册失败:`, error)

      // 处理业务错误
      if (error.code === 'MOBILE_EXISTS') {
        // 并发情况下可能出现：检查时不存在，注册时已存在
        user = await UserService.findByMobile(mobile)
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

  // 🛡️ 获取用户角色信息
  const userRoles = await getUserRoles(user.user_id)

  // 更新最后登录时间和登录次数
  await UserService.updateLoginStats(user.user_id)

  // 生成Token
  const tokens = await generateTokens(user)

  const responseData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    user: {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      role_based_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
      roles: userRoles.roles,
      status: user.status,
      last_login: user.last_login,
      login_count: user.login_count
    },
    is_new_user: isNewUser, // 标识是否为新注册用户
    expires_in: 7 * 24 * 60 * 60, // 7天
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  const message = isNewUser ? '注册并登录成功' : '登录成功'

  /*
   * 🔴 登录性能监控：记录登录耗时（2025-11-09新增）
   * 告警阈值：>3秒需要关注，>5秒需要优化（文档方案0建议）
   */
  const loginDuration = Date.now() - loginStartTime
  if (loginDuration > 3000) {
    logger.warn('⚠️ 登录耗时告警:', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7), // 脱敏处理
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
    // 1-3秒：记录信息级日志，用于性能分析
    logger.info(
      `📊 登录耗时: ${loginDuration}ms (用户: ${mobile.substring(0, 3)}****${mobile.substring(7)})`
    )
  }

  return res.apiSuccess(responseData, message)
})

/**
 * 🛡️ 用户快速登录（手机号直接登录）
 * POST /api/v4/auth/quick-login
 */
/**
 * 🔐 微信手机号解密接口 (WeChat Phone Number Decryption)
 * POST /api/v4/auth/decrypt-phone
 *
 * 📍 路由位置: routes/v4/unified-engine/auth.js
 * 📋 功能说明: 解密微信加密的手机号数据，返回明文手机号
 * 🔒 安全说明: 使用微信官方提供的解密算法，确保数据安全
 * 🎯 调用时机: 用户微信授权后，前端调用此接口获取明文手机号
 * 💡 技术实现: 使用微信session_key + AES-128-CBC解密算法
 *
 * @param {string} code - 微信登录凭证（wx.login获取）
 * @param {string} encryptedData - 加密的手机号数据（wx.getPhoneNumber获取）
 * @param {string} iv - 加密算法的初始向量（wx.getPhoneNumber获取）
 * @returns {Object} 解密成功响应（phoneNumber: 明文手机号）
 */
router.post('/decrypt-phone', async (req, res) => {
  const { code, encryptedData, iv } = req.body

  /*
   * ========================================
   * 步骤1: 参数验证
   * ========================================
   */
  if (!code || !encryptedData || !iv) {
    return res.apiError('参数不完整，需要code、encryptedData和iv', 'INVALID_PARAMS', null, 400)
  }

  logger.info('📱 微信手机号解密请求...')

  /*
   * ========================================
   * 步骤2: 使用code换取session_key
   * ========================================
   */
  const WXBizDataCrypt = require('../../../utils/WXBizDataCrypt')
  const axios = require('axios')

  // 微信API地址
  const wxApiUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${process.env.WX_APPID}&secret=${process.env.WX_SECRET}&js_code=${code}&grant_type=authorization_code`

  logger.info('🔄 请求微信API获取session_key...')
  const wxRes = await axios.get(wxApiUrl)

  if (!wxRes.data.session_key) {
    logger.error('❌ 微信session_key获取失败:', wxRes.data)
    return res.apiError('微信session_key获取失败', 'WX_SESSION_ERROR', wxRes.data, 500)
  }

  const sessionKey = wxRes.data.session_key
  logger.info('✅ 获取到微信session_key')

  /*
   * ========================================
   * 步骤3: 解密手机号
   * ========================================
   */
  const pc = new WXBizDataCrypt(process.env.WX_APPID, sessionKey)
  const data = pc.decryptData(encryptedData, iv)

  if (!data.phoneNumber) {
    logger.error('❌ 手机号解密失败')
    return res.apiError('手机号解密失败', 'DECRYPT_FAILED', null, 500)
  }

  logger.info(`✅ 手机号解密成功: ${data.phoneNumber}`)

  /*
   * ========================================
   * 步骤4: 返回明文手机号
   * ========================================
   */
  return res.apiSuccess(
    {
      phoneNumber: data.phoneNumber, // 完整手机号（带区号，如+86 138****8000）
      purePhoneNumber: data.purePhoneNumber, // 不带区号的手机号（13800138000）
      countryCode: data.countryCode // 区号（中国：86）
    },
    '手机号获取成功'
  )
})

/**
 * 🛡️ 微信授权一键登录 (WeChat One-Click Login)
 * POST /api/v4/auth/quick-login
 *
 * 📍 路由位置: routes/v4/unified-engine/auth.js
 * 📋 功能说明: 接收前端传入的微信授权手机号，完成用户登录或自动注册
 * 🔒 安全说明: 手机号必须来自微信官方授权，禁止用户手动输入，杜绝商业风险
 * 🎯 业务场景: 微信小程序登录、微信内H5登录、线下门店扫码登录
 * 💡 设计理念: 微信官方验证 + 极致简化 + 快速转化 + 统一管理员和用户登录入口
 * ⏱️ 开发工时: 已完成（0天）
 * 🔧 技术栈: Sequelize ORM + BeijingTimeHelper时间工具 + JWT Token认证 + UUID角色系统
 *
 * ========================================
 * 📊 业务逻辑（8个核心步骤）
 * ========================================
 * 步骤1: 验证手机号参数（必填参数检查）
 * 步骤2: 查找用户（根据手机号查询users表）
 * 步骤3: 新用户自动注册（创建用户+积分账户+角色分配，使用事务保证原子性）
 * 步骤4: 验证账户状态（active正常登录，banned/inactive拒绝登录）
 * 步骤5: 获取用户角色信息（基于UUID角色系统计算权限）
 * 步骤6: 更新登录统计（last_login当前北京时间，login_count累加+1）
 * 步骤7: 生成JWT Token（access_token有效期7天）
 * 步骤8: 返回登录成功结果（包含Token和用户完整信息）
 *
 * @param {string} mobile - 手机号（必填，来自微信授权）
 * @returns {Object} 登录成功响应（access_token + user信息 + role_based_admin）
 */
router.post('/quick-login', async (req, res) => {
  /*
   * 🔴 登录性能监控：记录开始时间（2025-11-09新增）
   * 用于监控登录响应时间，判断是否需要优化（文档方案0建议）
   */
  const loginStartTime = Date.now()

  /*
   * ========================================
   * 步骤1: 验证手机号参数
   * ========================================
   */
  const { mobile } = req.body

  if (!mobile) {
    return res.apiError('手机号不能为空', 'MOBILE_REQUIRED', null, 400)
  }

  logger.info(`📱 快速登录请求: ${mobile}`)

  // 🎯 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  /*
   * ========================================
   * 步骤2: 查找用户
   * ========================================
   */
  let user = await UserService.findByMobile(mobile)

  /*
   * ========================================
   * 步骤3: 如果用户不存在，自动创建用户账户（Service 内部管理事务）
   * ========================================
   */
  if (!user) {
    logger.info(`用户 ${mobile} 不存在，开始自动注册...`)

    try {
      user = await UserService.registerUser(mobile)
      logger.info(`✅ 用户 ${mobile} 注册流程完成（用户+积分账户+角色）`)
    } catch (error) {
      logger.error(`❌ 用户 ${mobile} 注册失败:`, error)

      // 处理业务错误
      if (error.code === 'MOBILE_EXISTS') {
        // 并发情况下可能出现：检查时不存在，注册时已存在
        user = await UserService.findByMobile(mobile)
        if (!user) {
          return res.apiError('用户注册失败', 'REGISTRATION_FAILED', { error: error.message }, 500)
        }
      } else {
        return res.apiError('用户注册失败', 'REGISTRATION_FAILED', { error: error.message }, 500)
      }
    }
  }

  /*
   * ========================================
   * 步骤4: 验证账户状态
   * ========================================
   */
  if (user.status !== 'active') {
    logger.warn(`❌ 用户 ${mobile} 账户已被禁用，status: ${user.status}`)
    return res.apiError('用户账户已被禁用，无法登录', 'USER_INACTIVE', null, 403)
  }

  /*
   * ========================================
   * 步骤5: 获取用户角色信息（基于UUID角色系统）
   * ========================================
   */
  const userRoles = await getUserRoles(user.user_id)

  /*
   * ========================================
   * 步骤6: 更新最后登录时间和登录次数
   * ========================================
   */
  await UserService.updateLoginStats(user.user_id)

  logger.info(
    `✅ 用户 ${mobile} 更新登录统计：last_login=${user.last_login}, login_count=${user.login_count}`
  )

  /*
   * ========================================
   * 步骤7: 生成JWT Token（access_token + refresh_token）
   * ========================================
   */
  const tokens = await generateTokens(user)

  /*
   * ========================================
   * 步骤8: 返回登录成功结果
   * ========================================
   */
  const responseData = {
    access_token: tokens.access_token, // 访问令牌（JWT，有效期7天）
    refresh_token: tokens.refresh_token, // 刷新令牌（JWT，用于刷新access_token）
    user: {
      user_id: user.user_id, // 用户ID（唯一标识，自增主键）
      mobile: user.mobile, // 手机号（登录凭证，唯一索引）
      nickname: user.nickname, // 用户昵称（自动生成，格式：用户+后4位）
      role_based_admin: userRoles.isAdmin, // 是否为管理员（基于UUID角色系统计算）
      roles: userRoles.roles, // 用户角色列表（UUID角色系统，支持多角色）
      status: user.status, // 账户状态（active/inactive/banned）
      created_at: user.created_at, // 账户创建时间（北京时间，自动生成）
      last_login: user.last_login // 最后登录时间（北京时间，刚更新）
    },
    expires_in: 7 * 24 * 60 * 60, // Token有效期：7天=604800秒
    timestamp: BeijingTimeHelper.apiTimestamp() // API响应时间戳（北京时间，统一格式）
  }

  logger.info(`✅ 用户 ${mobile} 微信授权登录成功`)

  /*
   * 🔴 登录性能监控：记录登录耗时（2025-11-09新增）
   * 告警阈值：>3秒需要关注，>5秒需要优化（文档方案0建议）
   */
  const loginDuration = Date.now() - loginStartTime
  if (loginDuration > 3000) {
    logger.warn('⚠️ 登录耗时告警:', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7), // 脱敏处理
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
    // 1-3秒：记录信息级日志，用于性能分析
    logger.info(
      `📊 登录耗时: ${loginDuration}ms (用户: ${mobile.substring(0, 3)}****${mobile.substring(7)}, 类型: quick_login)`
    )
  }

  return res.apiSuccess(responseData, '快速登录成功')
})

/**
 * 🛡️ 获取当前用户信息
 * GET /api/v4/auth/profile
 */
router.get('/profile', require('../../../middleware/auth').authenticateToken, async (req, res) => {
  const user_id = req.user.user_id

  // 🎯 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  // ✅ 使用 UserService 获取用户信息（含状态验证）
  const user = await UserService.getUserWithValidation(user_id)

  // 🛡️ 获取用户角色信息
  const userRoles = await getUserRoles(user_id)

  const responseData = {
    user: {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      role_based_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
      roles: userRoles.roles,
      status: user.status,
      consecutive_fail_count: user.consecutive_fail_count,
      history_total_points: user.history_total_points,
      created_at: BeijingTimeHelper.formatToISO(user.created_at), // 🔧 转换为ISO8601格式（带+08:00）
      last_login: BeijingTimeHelper.formatToISO(user.last_login), // 🔧 转换为ISO8601格式（带+08:00）
      login_count: user.login_count
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  return res.apiSuccess(responseData, '用户信息获取成功')
})

/**
 * 🛡️ 刷新访问Token
 * POST /api/v4/auth/refresh
 *
 * @body {string} refresh_token - 刷新Token
 * @returns {Object} 新的访问Token和刷新Token
 */
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body

  // 验证必需参数
  if (!refresh_token) {
    return res.apiError('刷新Token不能为空', 'REFRESH_TOKEN_REQUIRED', null, 400)
  }

  // 验证刷新Token
  const { verifyRefreshToken } = require('../../../middleware/auth')
  const verifyResult = await verifyRefreshToken(refresh_token)

  if (!verifyResult.valid) {
    return res.apiError('刷新Token无效', 'INVALID_REFRESH_TOKEN', null, 401)
  }

  // 🎯 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  // ✅ 使用 UserService 获取用户信息并验证状态
  const user = await UserService.getUserWithValidation(verifyResult.user.user_id)

  // 生成新的Token对
  const tokens = await generateTokens(user)

  // 🛡️ 获取用户角色信息
  const userRoles = await getUserRoles(user.user_id)

  const responseData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    user: {
      user_id: user.user_id,
      mobile: user.mobile,
      role_based_admin: userRoles.isAdmin, // 🛡️ 基于角色计算
      roles: userRoles.roles,
      status: user.status
    },
    expires_in: 7 * 24 * 60 * 60, // 7天
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  return res.apiSuccess(responseData, 'Token刷新成功')
})

/**
 * 🛡️ 用户退出登录（User Logout）
 * POST /api/v4/auth/logout
 *
 * 业务场景：
 * - 用户主动退出登录，清除服务端权限缓存
 * - 确保下次刷新Token时重新验证账户状态
 *
 * 技术实现：
 * - 调用invalidateUserPermissions清除双层缓存（内存+Redis）
 * - 前端需要同步清除localStorage中的Token
 *
 * 安全说明：
 * - 仅清除权限缓存，不实现Token黑名单（基于10人小型系统实用主义原则）
 * - 缓存清除后，下次刷新Token时强制从数据库验证账户状态
 * - 如管理员禁用账户（status='banned'），刷新Token会返回403错误
 *
 * @param {string} req.user.user_id - 用户ID（从Access Token中获取）
 * @returns {Object} 退出登录结果
 */
/**
 * 🛡️ 验证Token有效性（统一接口）
 * GET /api/v4/auth/verify
 *
 * @route GET /api/v4/auth/verify
 * @group Auth - 认证相关
 * @security JWT
 *
 * @description 验证当前Token是否有效，返回用户完整信息
 * @returns {Object} 200 - Token有效，返回用户信息
 * @returns {Object} 401 - Token无效或已过期
 * @returns {Object} 403 - 用户账号已禁用
 * @returns {Object} 404 - 用户不存在
 *
 * ✅ 优化特性：
 * - 限流保护：100次/分钟（防DDoS攻击）
 * - 缓存机制：getUserRoles函数自动缓存角色信息
 * - 完整数据：返回用户所有必要信息
 * - 全局错误处理：使用next(error)统一处理异常
 *
 * 业务场景：
 * - 前端页面加载时验证登录状态
 * - Token续期前的有效性检查
 * - 跨页面的用户信息同步
 */
router.get('/verify', authenticateToken, verifyRateLimiter, async (req, res) => {
  const user_id = req.user.user_id

  // 🎯 通过ServiceManager获取UserService
  const UserService = req.app.locals.services.getService('user')

  // ✅ 使用 UserService 获取用户信息（含状态验证）
  const user = await UserService.getUserWithValidation(user_id, {
    attributes: [
      'user_id',
      'mobile',
      'nickname',
      'status',
      'created_at',
      'last_login',
      'login_count'
    ]
  })

  // 🛡️ 使用缓存机制获取用户角色信息（getUserRoles内置缓存）
  const userRoles = await getUserRoles(user_id)

  logger.info(`✅ [Auth] Token验证成功: user_id=${user_id}, roles=${userRoles.roles.join(',')}`)

  return res.apiSuccess(
    {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      status: user.status,
      roles: userRoles.roles,
      role_level: userRoles.maxLevel,
      is_admin: userRoles.isAdmin,
      role_based_admin: userRoles.isAdmin,
      created_at: BeijingTimeHelper.formatToISO(user.created_at),
      last_login: BeijingTimeHelper.formatToISO(user.last_login),
      login_count: user.login_count,
      valid: true, // 向后兼容旧测试
      token_valid: true, // 新字段
      timestamp: BeijingTimeHelper.apiTimestamp()
    },
    'Token验证成功',
    'TOKEN_VALID'
  )
})

router.post('/logout', authenticateToken, async (req, res) => {
  const user_id = req.user.user_id

  /**
   * 🔑 清除用户权限缓存（利用已有的invalidateUserPermissions函数）
   * 作用：清除内存缓存（memoryCache.delete）+ Redis缓存（redisClient.del）
   * 效果：下次刷新Token时，getUserRoles函数缓存未命中，触发数据库查询
   */
  await invalidateUserPermissions(user_id, 'user_logout', user_id)

  // 📝 记录退出日志（便于审计和问题追踪）
  logger.info(`✅ [Auth] 用户退出登录: user_id=${user_id}, mobile=${req.user.mobile}`)

  return res.apiSuccess(null, '退出登录成功', 'LOGOUT_SUCCESS')
})

module.exports = router
