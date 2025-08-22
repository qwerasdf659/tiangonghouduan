/**
 * 认证授权中间件 - V3统一安全版本
 * 🔴 权限级别：用户(default) | 管理员(is_admin: true)
 * 🔧 修复：统一JWT密钥配置，增强安全性
 */

const jwt = require('jsonwebtoken')
const { sequelize } = require('../models') // 只引用sequelize实例

// 🔧 修复：统一JWT密钥配置，确保安全性
const JWT_SECRET = process.env.JWT_SECRET
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h'
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'

// 🔧 启动时检查JWT密钥安全性
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET未配置或长度不足32位，存在安全风险')
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 生产环境必须配置强JWT密钥，程序退出')
    process.exit(1)
  }
  console.warn('⚠️ 开发环境检测到弱JWT密钥，建议配置更强密钥')
}

/**
 * 生成JWT Token - 修复：区分access和refresh token
 */
function generateTokens (user) {
  const payload = {
    user_id: user.user_id,
    mobile: user.mobile,
    is_admin: user.is_admin || false,
    type: 'access', // 🔧 新增：token类型标识
    iat: Math.floor(Date.now() / 1000)
  }

  const refreshPayload = {
    ...payload,
    type: 'refresh' // 🔧 新增：刷新token标识
  }

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'restaurant-points-system',
    audience: 'restaurant-app'
  })

  const refreshToken = jwt.sign(refreshPayload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    issuer: 'restaurant-points-system',
    audience: 'restaurant-app'
  })

  return { accessToken, refreshToken }
}

/**
 * 验证Access Token - 修复：增强验证逻辑
 */
function verifyAccessToken (token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'restaurant-points-system',
      audience: 'restaurant-app'
    })

    // 🔧 新增：验证token类型
    if (decoded.type && decoded.type !== 'access') {
      console.log('Token类型验证失败: 期望access，收到', decoded.type)
      return null
    }

    return decoded
  } catch (error) {
    console.log('Access Token验证失败:', error.message)
    return null
  }
}

/**
 * 验证Refresh Token - 修复：使用专用密钥
 */
function verifyRefreshToken (token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'restaurant-points-system',
      audience: 'restaurant-app'
    })

    // 🔧 新增：验证token类型
    if (decoded.type && decoded.type !== 'refresh') {
      console.log('Refresh Token类型验证失败: 期望refresh，收到', decoded.type)
      return null
    }

    return decoded
  } catch (error) {
    console.log('刷新Token验证失败:', error.message)
    return null
  }
}

/**
 * JWT Token认证中间件 - 修复：统一错误响应格式
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: '缺少访问令牌',
        timestamp: new Date().toISOString()
      })
    }

    const decoded = verifyAccessToken(token)
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: '访问令牌无效或已过期',
        timestamp: new Date().toISOString()
      })
    }

    // 从数据库获取用户信息（使用原生SQL查询）
    const users = await sequelize.query(
      'SELECT user_id, mobile, nickname, status, is_admin FROM users WHERE user_id = ?',
      { replacements: [decoded.user_id], type: sequelize.QueryTypes.SELECT }
    )

    const user = users[0]
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在',
        timestamp: new Date().toISOString()
      })
    }

    // 检查用户状态
    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'USER_BANNED',
        message: '用户已被禁用',
        timestamp: new Date().toISOString()
      })
    }

    if (user.status === 'inactive') {
      return res.status(403).json({
        success: false,
        error: 'USER_INACTIVE',
        message: '用户已被暂停',
        timestamp: new Date().toISOString()
      })
    }

    // 将用户信息添加到请求对象
    // eslint-disable-next-line require-atomic-updates
    req.user = user
    // eslint-disable-next-line require-atomic-updates
    req.token = decoded

    next()
  } catch (error) {
    console.error('认证中间件错误:', error)
    res.status(500).json({
      success: false,
      error: 'AUTH_SERVICE_ERROR',
      message: '认证服务异常',
      timestamp: new Date().toISOString()
    })
  }
}

/**
 * 可选认证中间件 - 修复：统一错误处理格式
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (token) {
      const decoded = verifyAccessToken(token)
      if (decoded) {
        const users = await sequelize.query(
          'SELECT user_id, mobile, nickname, status, is_admin FROM users WHERE user_id = ?',
          { replacements: [decoded.user_id], type: sequelize.QueryTypes.SELECT }
        )

        const user = users[0]
        if (user && user.status === 'active') {
          // eslint-disable-next-line require-atomic-updates
          req.user = user
          // eslint-disable-next-line require-atomic-updates
          req.token = decoded
        }
      }
    }

    next()
  } catch (error) {
    console.error('可选认证中间件错误:', error)
    next() // 即使出错也继续执行
  }
}

/**
 * 管理员权限检查中间件 - 修复：统一错误响应格式
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'LOGIN_REQUIRED',
      message: '需要登录访问',
      timestamp: new Date().toISOString()
    })
  }

  if (!req.user.is_admin) {
    return res.status(403).json({
      success: false,
      error: 'ADMIN_REQUIRED',
      message: '需要管理员权限',
      timestamp: new Date().toISOString()
    })
  }

  next()
}

/**
 * 请求日志中间件 - 修复：增强日志格式
 */
const requestLogger = (req, res, next) => {
  const start = Date.now()
  const { method, path, ip } = req
  const userAgent = req.get('User-Agent')
  const userId = req.user ? req.user.user_id : 'anonymous'

  // 记录请求开始
  console.log(`📥 [${new Date().toISOString()}] ${method} ${path} - User:${userId} - ${ip} - ${userAgent}`)

  // 监听响应结束
  res.on('finish', () => {
    const duration = Date.now() - start
    const { statusCode } = res

    console.log(`📤 [${new Date().toISOString()}] ${method} ${path} - ${statusCode} - ${duration}ms - User:${userId}`)
  })

  next()
}

/**
 * 用户身份验证中间件（仅验证用户身份，不检查权限）
 */
const requireUser = authenticateToken

/**
 * 管理员权限中间件别名（向后兼容）
 */
const isAdmin = requireAdmin

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  authenticateToken,
  optionalAuth,
  requireAdmin,
  isAdmin,
  requireUser,
  requestLogger
}
