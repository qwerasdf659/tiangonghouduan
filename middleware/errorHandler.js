/**
 * 全局错误处理中间件（全局错误唯一出口）
 *
 * 2026-07-11 技术债务收口（拍板 2）：
 * - app.js 原内联全局错误处理已搬入本文件并删除，本中间件是全局错误处理的唯一实现
 * - app.js 通过 app.use(globalErrorHandler) 挂载（必须在所有路由之后注册）
 *
 * 错误处理策略（架构决策4，2026-01-13）：
 * - BusinessError：使用业务错误码，details 仅记录日志，不返回给客户端
 * - Sequelize 错误：隐藏内部细节，返回通用 DATABASE_ERROR 类错误码
 * - JWT 错误：INVALID_TOKEN / TOKEN_EXPIRED（401）
 * - 携带 statusCode 的服务层错误：透传业务错误码与 HTTP 状态码
 * - 未知错误：开发环境返回详细信息，生产环境返回「服务器内部错误」（INTERNAL_ERROR）
 *
 * @module middleware/errorHandler
 */

const crypto = require('crypto')
const BusinessError = require('../utils/BusinessError')
const { logger, sanitize } = require('../utils/logger')
const ApiResponse = require('../utils/ApiResponse')

/**
 * 统一 request_id 获取逻辑（与 ApiResponse.middleware 兼容）
 *
 * - /api/*：优先使用 ApiResponse.middleware 注入的 req.id
 * - 非 /api/*：使用请求头或本地生成
 *
 * @param {Object} req - Express 请求对象
 * @returns {string} 请求ID
 */
function getRequestId(req) {
  return (
    req.id ||
    req.headers['x-request-id'] ||
    req.headers['request-id'] ||
    `req_${crypto.randomUUID()}`
  )
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

  // 记录完整错误到日志（details 仅日志可见，不返回给客户端）
  logger.error('全局错误处理', {
    request_id: requestId,
    error_code: err.code || 'UNKNOWN',
    error_message: err.message,
    error_name: err.name,
    status_code: err.statusCode,
    error_stack: err.stack,
    error_details: err.details || null,
    path: req.path,
    method: req.method,
    // 使用脱敏函数处理请求体（防止密码/token 等敏感字段进日志）
    body: sanitize(req.body)
  })

  // 如果响应已发送，交给 Express 默认处理器
  if (res.headersSent) {
    return next(err)
  }

  // 业务异常：返回标准格式（架构决策4：details 不暴露给客户端）
  if (err instanceof BusinessError || err.name === 'BusinessError') {
    const resp = ApiResponse.error(err.message, err.code, null, err.statusCode || 400)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // Sequelize 连接错误（503：数据库暂不可用）
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

  // Sequelize 验证错误（400：数据不符合模型约束）
  if (err.name === 'SequelizeValidationError') {
    const resp = ApiResponse.error('数据验证失败', 'VALIDATION_ERROR', null, 400)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // Sequelize 唯一约束错误（409：数据已存在）
  if (err.name === 'SequelizeUniqueConstraintError') {
    const resp = ApiResponse.error('数据已存在，违反唯一性约束', 'DUPLICATE_ENTRY', null, 409)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // 其余 Sequelize 错误统一兜底（隐藏数据库内部细节）
  if (err.name === 'SequelizeError' || err.name?.startsWith('Sequelize')) {
    const resp = ApiResponse.error('数据库操作失败', 'DATABASE_ERROR', null, 500)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // JWT 错误处理（401）
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

  // 验证错误处理（Joi 等抛出的 ValidationError）
  if (err.name === 'ValidationError') {
    const resp = ApiResponse.error(err.message, 'VALIDATION_ERROR', null, 400)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // 携带 statusCode 的服务层错误（非 BusinessError 但带 HTTP 状态码，如 404 ORDER_NOT_FOUND）
  if (err.statusCode && err.statusCode !== 500) {
    const resp = ApiResponse.error(
      err.message,
      err.errorCode || err.code || 'SERVICE_ERROR',
      err.data || null,
      err.statusCode
    )
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // 未知错误：开发环境返回详细信息，生产环境隐藏
  const errorMessage = process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'

  const resp = ApiResponse.error(errorMessage, 'INTERNAL_ERROR', null, 500)
  resp.request_id = requestId
  return ApiResponse.send(res, resp)
}

module.exports = globalErrorHandler
module.exports.globalErrorHandler = globalErrorHandler
