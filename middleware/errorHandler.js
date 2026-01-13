/**
 * 全局错误处理中间件
 *
 * 架构决策 4：业务异常类 + 统一错误码体系
 * 2026-01-13 消费服务层QR码验证兼容模式清理方案
 *
 * 功能：
 * - 处理 BusinessError 业务异常，返回标准格式
 * - 处理 Sequelize 数据库错误，隐藏内部细节
 * - 处理 JWT 认证错误
 * - 处理未知错误，统一错误码
 *
 * @module middleware/errorHandler
 */

const BusinessError = require('../utils/BusinessError')
const { logger, sanitize } = require('../utils/logger')
const ApiResponse = require('../utils/ApiResponse')

/**
 * 获取请求ID
 * @param {Object} req - Express 请求对象
 * @returns {string} 请求ID
 */
function getRequestId(req) {
  return req.id || req.headers['x-request-id'] || 'unknown'
}

/**
 * 全局错误处理中间件
 *
 * 使用方式：在 app.js 中最后注册
 * app.use(globalErrorHandler)
 *
 * @param {Error} err - 错误对象
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 * @returns {Object} Express 响应
 */
function globalErrorHandler(err, req, res, next) {
  const requestId = getRequestId(req)

  // 记录完整错误到日志（包含 details）
  logger.error('请求处理失败', {
    request_id: requestId,
    error_code: err.code || 'UNKNOWN',
    error_message: err.message,
    error_name: err.name,
    error_stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    error_details: err.details, // 仅日志可见，不返回给客户端
    path: req.path,
    method: req.method,
    // 使用脱敏函数处理请求体
    body: sanitize(req.body)
  })

  // 如果响应已发送，跳过
  if (res.headersSent) {
    return next(err)
  }

  // 业务异常：返回标准格式（架构决策 4）
  if (err instanceof BusinessError) {
    const resp = ApiResponse.error(
      err.message,
      err.code,
      null, // ❌ 不返回 details（对外隐藏内部细节）
      err.statusCode
    )
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // Sequelize 数据库错误：隐藏内部细节
  if (err.name === 'SequelizeDatabaseError' || err.name === 'SequelizeError') {
    const resp = ApiResponse.error('数据库操作失败，请稍后重试', 'DATABASE_ERROR', null, 500)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // Sequelize 连接错误
  if (err.name === 'SequelizeConnectionError') {
    const resp = ApiResponse.error(
      '数据库连接失败，请稍后重试',
      'DATABASE_CONNECTION_ERROR',
      null,
      503
    )
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // Sequelize 验证错误
  if (err.name === 'SequelizeValidationError') {
    const resp = ApiResponse.error('数据验证失败', 'VALIDATION_ERROR', null, 400)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // Sequelize 唯一约束错误
  if (err.name === 'SequelizeUniqueConstraintError') {
    const resp = ApiResponse.error('数据已存在，违反唯一性约束', 'DUPLICATE_ENTRY', null, 409)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // JWT 错误处理
  if (err.name === 'JsonWebTokenError') {
    const resp = ApiResponse.error('Token无效', 'INVALID_TOKEN', null, 401)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  if (err.name === 'TokenExpiredError') {
    const resp = ApiResponse.error('Token已过期', 'TOKEN_EXPIRED', null, 401)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // 验证错误处理
  if (err.name === 'ValidationError') {
    const resp = ApiResponse.error(err.message, 'VALIDATION_ERROR', null, 400)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // 未知错误：通用错误码
  const errorMessage = process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'

  const resp = ApiResponse.error(errorMessage, 'INTERNAL_ERROR', null, 500)
  resp.request_id = requestId
  return ApiResponse.send(res, resp)
}

/**
 * 创建路由级错误处理辅助函数
 *
 * 用于路由中捕获并处理 Service 层抛出的 BusinessError
 *
 * @param {Error} error - 错误对象
 * @param {Object} res - Express 响应对象
 * @param {string} defaultMessage - 默认错误消息
 * @returns {Object} Express 响应
 */
function handleBusinessError(error, res, defaultMessage = '操作失败') {
  // 如果是 BusinessError，直接使用其属性
  if (error instanceof BusinessError) {
    return res.apiError(error.message, error.code, null, error.statusCode)
  }

  // 检查自定义的 statusCode 和 errorCode（兼容旧代码）
  if (error.statusCode) {
    const errorCode = error.errorCode || error.code || 'SERVICE_ERROR'
    return res.apiError(error.message || defaultMessage, errorCode, null, error.statusCode)
  }

  // 根据错误消息内容判断错误类型
  const errorMessage = error.message || defaultMessage

  if (errorMessage.includes('不存在') || errorMessage.includes('未找到')) {
    return res.apiError(errorMessage, 'NOT_FOUND', null, 404)
  }

  if (errorMessage.includes('无权限') || errorMessage.includes('权限不足')) {
    return res.apiError(errorMessage, 'FORBIDDEN', null, 403)
  }

  if (
    errorMessage.includes('不能') ||
    errorMessage.includes('不支持') ||
    errorMessage.includes('无效') ||
    errorMessage.includes('不可用') ||
    errorMessage.includes('过期') ||
    errorMessage.includes('超出') ||
    errorMessage.includes('不足') ||
    errorMessage.includes('未绑定') ||
    errorMessage.includes('已被禁用') ||
    errorMessage.includes('已存在') ||
    errorMessage.includes('已被占用') ||
    errorMessage.includes('已离职') ||
    errorMessage.includes('状态异常')
  ) {
    return res.apiError(errorMessage, 'BAD_REQUEST', null, 400)
  }

  // Sequelize 错误
  if (error.name === 'SequelizeDatabaseError') {
    return res.apiError('数据库查询失败，请稍后重试', 'DATABASE_ERROR', null, 500)
  }

  if (error.name === 'SequelizeConnectionError') {
    return res.apiError('数据库连接失败，请稍后重试', 'SERVICE_UNAVAILABLE', null, 503)
  }

  if (error.name === 'SequelizeValidationError') {
    return res.apiError(`数据验证失败: ${errorMessage}`, 'BAD_REQUEST', null, 400)
  }

  if (error.name === 'SequelizeTimeoutError') {
    return res.apiError('数据库查询超时，请稍后重试', 'DATABASE_TIMEOUT', null, 504)
  }

  // 默认服务器错误
  return res.apiError(defaultMessage + '，请稍后重试', 'INTERNAL_ERROR', null, 500)
}

module.exports = globalErrorHandler
module.exports.globalErrorHandler = globalErrorHandler
module.exports.handleBusinessError = handleBusinessError
