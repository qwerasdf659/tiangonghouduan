/**
 * 统一错误处理中间件
 * 🔴 前端对接说明：所有错误都会返回统一格式 {code, msg, data}
 * 🔴 错误码规范：
 *   1xxx: 参数验证错误
 *   2xxx: 认证授权错误
 *   3xxx: 业务逻辑错误
 *   4xxx: 资源不存在错误
 *   5xxx: 系统内部错误
 * 🕐 时区：北京时间 (UTC+8) - 中国区域专用
 */

const fs = require('fs')
const path = require('path')
const BeijingTimeHelper = require('../utils/timeHelper') // 🕐 北京时间工具

// 🔴 创建日志目录
const logDir = path.join(__dirname, '../logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// 🔴 错误日志记录器
/**
 * 记录错误日志（写入 logs/error-YYYY-MM-DD.log）
 *
 * 业务场景：
 * - 开发环境：输出详细错误上下文（包含脱敏后的请求体）
 * - 生产环境：输出精简错误信息，并落盘用于排障
 *
 * @param {Error} error - 错误对象
 * @param {Object} req - Express 请求对象
 * @param {Object} additionalInfo - 额外上下文（可选）
 * @returns {void} 无返回值
 */
function logError(error, req, additionalInfo = {}) {
  const timestamp = BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
  const logEntry = {
    timestamp,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code || 'UNKNOWN'
    },
    request: {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        authorization: req.headers.authorization ? '[REDACTED]' : undefined
      },
      body: req.method === 'POST' ? sanitizeRequestBody(req.body) : undefined,
      query: req.query,
      params: req.params,
      ip: req.ip || req.connection.remoteAddress
    },
    user: req.user
      ? {
          user_id: req.user.user_id,
          username: req.user.username
        }
      : null,
    additionalInfo,
    environment: process.env.NODE_ENV
  }

  // 控制台输出（开发环境）
  if (process.env.NODE_ENV === 'development') {
    console.error('🚨 错误详情:', JSON.stringify(logEntry, null, 2))
  } else {
    console.error(`🚨 [${timestamp}] ${error.name}: ${error.message}`)
  }

  // 写入错误日志文件
  try {
    const logFile = path.join(logDir, `error-${BeijingTimeHelper.apiTimestamp().split('T')[0]}.log`) // 🕐 北京时间日期
    const logLine = JSON.stringify(logEntry) + '\n'
    fs.appendFileSync(logFile, logLine)
  } catch (logWriteError) {
    console.error('❌ 写入错误日志失败:', logWriteError.message)
  }
}

// 🔴 敏感数据过滤
/**
 * 对请求体进行脱敏，避免敏感字段被写入日志
 *
 * @param {Object} body - 原始请求体
 * @returns {Object} 脱敏后的请求体
 */
function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') return body

  const sanitized = { ...body }
  const sensitiveFields = ['password', 'token', 'code', 'secret']

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]'
    }
  }

  return sanitized
}

// 🔴 主错误处理中间件
/**
 * Express 统一错误处理中间件
 *
 * 业务场景：
 * - 捕获路由/服务层抛出的异常，统一输出 ApiResponse 标准格式
 * - 记录错误日志，便于定位与审计
 *
 * @param {Error} err - 错误对象
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} _next - Express next（未使用）
 * @returns {void} 无返回值
 */
const errorHandler = (err, req, res, _next) => {
  // 设置默认错误信息
  let errorCode = 5000
  let errorMessage = '系统内部错误'
  let statusCode = 500
  let additionalData = null

  // 🔴 根据错误类型设置响应
  if (err.name === 'SequelizeValidationError') {
    // Sequelize 验证错误
    errorCode = 1001
    errorMessage = '数据验证失败'
    statusCode = 400
    additionalData = {
      validationErrors: err.errors.map(e => ({
        field: e.path,
        message: e.message,
        value: e.value
      }))
    }
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    // 唯一约束错误
    errorCode = 1002
    errorMessage = '数据重复，请检查输入'
    statusCode = 400
    additionalData = {
      field: err.errors[0]?.path,
      value: err.errors[0]?.value
    }
  } else if (err.name === 'SequelizeConnectionError') {
    // 数据库连接错误
    errorCode = 5001
    errorMessage = '数据库连接失败'
    statusCode = 500
  } else if (err.name === 'SequelizeDatabaseError') {
    // 数据库操作错误
    errorCode = 5002
    errorMessage = '数据库操作失败'
    statusCode = 500
  } else if (err.name === 'JsonWebTokenError') {
    // JWT 错误
    errorCode = 2001
    errorMessage = 'Token无效'
    statusCode = 401
  } else if (err.name === 'TokenExpiredError') {
    // Token 过期
    errorCode = 2002
    errorMessage = 'Token已过期，请重新登录'
    statusCode = 401
  } else if (err.name === 'NotBeforeError') {
    // Token 未生效
    errorCode = 2003
    errorMessage = 'Token尚未生效'
    statusCode = 401
  } else if (err.name === 'ValidationError') {
    // 通用参数验证错误
    errorCode = 1000
    errorMessage = err.message || '参数验证失败'
    statusCode = 400
    additionalData = err.details || null
  } else if (err.name === 'UnauthorizedError') {
    // 认证错误
    errorCode = 2000
    errorMessage = err.message || '认证失败'
    statusCode = 401
  } else if (err.name === 'ForbiddenError') {
    // 权限错误
    errorCode = 3000
    errorMessage = err.message || '权限不足'
    statusCode = 403
  } else if (err.name === 'NotFoundError') {
    // 资源不存在
    errorCode = 4000
    errorMessage = err.message || '资源不存在'
    statusCode = 404
  } else if (err.name === 'ConflictError') {
    // 资源冲突
    errorCode = 4001
    errorMessage = err.message || '资源冲突'
    statusCode = 409
  } else if (err.name === 'BusinessLogicError') {
    // 业务逻辑错误
    errorCode = err.code || 3000
    errorMessage = err.message || '业务处理失败'
    statusCode = 400
    additionalData = err.data || null
  } else if (err.code && typeof err.code === 'number') {
    // 自定义错误码
    errorCode = err.code
    errorMessage = err.message || '操作失败'
    statusCode = err.statusCode || 400
    additionalData = err.data || null
  } else if (err.message) {
    // 其他已知错误
    errorMessage = err.message

    // 根据消息内容判断状态码
    if (err.message.includes('not found') || err.message.includes('不存在')) {
      statusCode = 404
      errorCode = 4000
    } else if (err.message.includes('unauthorized') || err.message.includes('未授权')) {
      statusCode = 401
      errorCode = 2000
    } else if (err.message.includes('forbidden') || err.message.includes('权限')) {
      statusCode = 403
      errorCode = 3000
    }
  }

  // 🔴 记录错误日志
  logError(err, req, {
    errorCode,
    statusCode,
    processedMessage: errorMessage
  })

  // 🔴 返回统一格式的错误响应
  const errorResponse = {
    code: errorCode,
    msg: errorMessage,
    data: additionalData
  }

  // 开发环境包含堆栈信息
  if (process.env.NODE_ENV === 'development') {
    errorResponse.debug = {
      stack: err.stack,
      originalError: err.name
    }
  }

  res.status(statusCode).json(errorResponse)
}

// 🔴 404 处理中间件
/**
 * 404 处理器：未匹配到任何路由时返回统一错误格式
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} ApiResponse 错误响应
 */
const notFoundHandler = (req, res) => {
  const errorResponse = {
    code: 4000,
    msg: `API接口不存在: ${req.method} ${req.originalUrl}`,
    data: {
      availableEndpoints: [
        'GET /health - 健康检查',
        'POST /api/v4/auth/login - 用户登录',
        'GET /api/v4/lottery/campaigns - 抽奖活动列表',
        'GET /api/v4/points/balance - 积分余额查询',
        'POST /api/v4/consumption/submit - 商家扫码录入消费',
        '更多API请访问 GET /api/v4/docs'
      ]
    }
  }

  // 记录404请求
  console.warn(`⚠️ 404请求: ${req.method} ${req.originalUrl} - IP: ${req.ip}`)

  res.status(404).json(errorResponse)
}

// 🔴 自定义错误类
/**
 * 业务逻辑错误（Business Logic Error）
 *
 * 业务场景：服务层主动抛出的业务错误（例如余额不足、状态机不允许等）
 */
class BusinessLogicError extends Error {
  /**
   * 构造业务错误对象
   *
   * @param {string} message - 错误描述（面向业务）
   * @param {number} code - 错误码（默认3000）
   * @param {Object|null} data - 额外数据（可选）
   * @returns {void} 无返回值
   */
  constructor(message, code = 3000, data = null) {
    super(message)
    this.name = 'BusinessLogicError'
    this.code = code
    this.data = data
  }
}

/**
 * 参数/数据校验错误（Validation Error）
 *
 * 业务场景：参数缺失、格式非法、字段不符合业务约束等
 */
class ValidationError extends Error {
  /**
   * 构造校验错误对象
   *
   * @param {string} message - 错误描述
   * @param {Object|null} details - 错误详情（可选）
   * @returns {void} 无返回值
   */
  constructor(message, details = null) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

/**
 * 未认证错误（Unauthorized Error）
 *
 * 业务场景：Token无效/缺失导致的认证失败
 */
class UnauthorizedError extends Error {
  /**
   * 构造未认证错误对象
   *
   * @param {string} message - 错误描述（可选）
   * @returns {void} 无返回值
   */
  constructor(message = '认证失败') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * 无权限错误（Forbidden Error）
 *
 * 业务场景：已登录但无权限访问资源
 */
class ForbiddenError extends Error {
  /**
   * 构造无权限错误对象
   *
   * @param {string} message - 错误描述（可选）
   * @returns {void} 无返回值
   */
  constructor(message = '权限不足') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/**
 * 资源不存在错误（Not Found Error）
 *
 * 业务场景：请求的资源不存在（订单/挂牌/物品等）
 */
class NotFoundError extends Error {
  /**
   * 构造资源不存在错误对象
   *
   * @param {string} message - 错误描述（可选）
   * @returns {void} 无返回值
   */
  constructor(message = '资源不存在') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/**
 * 资源冲突错误（Conflict Error）
 *
 * 业务场景：幂等键冲突、状态冲突等需要返回409的场景
 */
class ConflictError extends Error {
  /**
   * 构造资源冲突错误对象
   *
   * @param {string} message - 错误描述（可选）
   * @returns {void} 无返回值
   */
  constructor(message = '资源冲突') {
    super(message)
    this.name = 'ConflictError'
  }
}

// 🔴 异步错误捕获包装器
/**
 * 异步路由包装器：自动捕获 Promise rejection 并交给 errorHandler
 *
 * @param {Function} fn - 异步处理函数 (req, res, next) => Promise
 * @returns {Function} Express 中间件函数
 */
const asyncHandler = fn => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// 🔴 参数验证辅助函数
/**
 * 校验必填字段
 *
 * @param {Array<string>} fields - 必填字段列表
 * @param {Object} data - 待校验对象
 * @returns {{valid: boolean, missing: Array<string>}} 校验结果（valid=true 表示通过）
 */
const validateRequired = (fields, data) => {
  const missing = []

  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field)
    }
  }

  if (missing.length > 0) {
    throw new ValidationError(`缺少必填参数: ${missing.join(', ')}`, { missing })
  }
}

/**
 * 校验邮箱格式
 *
 * @param {string} email - 邮箱地址
 * @returns {void} 无返回值；不合法将抛出 ValidationError
 */
const validateEmail = email => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new ValidationError('邮箱格式不正确')
  }
}

/**
 * 校验手机号格式（中国大陆手机号）
 *
 * @param {string} phone - 手机号
 * @returns {void} 无返回值；不合法将抛出 ValidationError
 */
const validatePhone = phone => {
  const phoneRegex = /^1[3-9]\d{9}$/
  if (!phoneRegex.test(phone)) {
    throw new ValidationError('手机号格式不正确')
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,

  // 自定义错误类
  BusinessLogicError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,

  // 验证函数
  validateRequired,
  validateEmail,
  validatePhone,

  // 日志函数
  logError
}
