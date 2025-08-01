/**
 * API响应标准化工具类
 * 提供统一的响应格式和错误处理
 */

class ApiResponse {
  /**
   * 成功响应
   * @param {any} data - 响应数据
   * @param {string} message - 响应消息
   * @returns {object} 格式化的成功响应
   */
  static success (data = null, message = 'Success') {
    return {
      code: 0, // ✅ 修正：使用业务状态码0表示成功，不是HTTP状态码200
      msg: message, // ✅ 修正：使用msg字段名，符合前端标准
      data,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 错误响应
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @param {number} businessCode - 业务状态码（非0表示失败）
   * @returns {object} 格式化的错误响应
   */
  static error (message = 'Error', errorCode = 'UNKNOWN_ERROR', details = null, businessCode = -1) {
    const response = {
      code: businessCode, // ✅ 修正：使用业务状态码，非0表示失败
      msg: message, // ✅ 修正：使用msg字段名，符合前端标准
      data: null,
      timestamp: new Date().toISOString()
    }

    // 只在开发环境添加错误详情
    if (details && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) {
      response.details = details
      response.errorCode = errorCode
    }

    return response
  }

  /**
   * 分页成功响应
   * @param {Array} data - 数据数组
   * @param {object} pagination - 分页信息
   * @param {string} message - 响应消息
   * @returns {object} 格式化的分页响应
   */
  static paginated (data = [], pagination = {}, message = 'Success') {
    return {
      code: 0, // ✅ 修正：使用业务状态码0表示成功
      msg: message, // ✅ 修正：使用msg字段名，符合前端标准
      data,
      pagination: {
        total: pagination.total || 0,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
        totalPages: pagination.totalPages || 0,
        hasNext: pagination.hasNext || false,
        hasPrev: pagination.hasPrev || false,
        ...pagination
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 创建响应 (201 Created)
   * @param {any} data - 创建的数据
   * @param {string} message - 响应消息
   * @returns {object} 格式化的创建响应
   */
  static created (data = null, message = 'Created successfully') {
    return {
      code: 0, // ✅ 修正：创建成功也使用业务状态码0
      msg: message, // ✅ 修正：使用msg字段名，符合前端标准
      data,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 无内容响应 (204 No Content)
   * @param {string} message - 响应消息
   * @returns {object} 格式化的无内容响应
   */
  static noContent (message = 'No content') {
    return {
      code: 0, // ✅ 修正：无内容成功也使用业务状态码0
      msg: message, // ✅ 修正：使用msg字段名，符合前端标准
      data: null,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 客户端错误响应 (400)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @returns {object} 格式化的客户端错误响应
   */
  static badRequest (message = 'Bad Request', errorCode = 'BAD_REQUEST', details = null) {
    return this.error(message, errorCode, details, 2001)
  }

  /**
   * 未授权响应 (401)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {object} 格式化的未授权响应
   */
  static unauthorized (message = 'Unauthorized', errorCode = 'UNAUTHORIZED') {
    return this.error(message, errorCode, null, 4001)
  }

  /**
   * 禁止访问响应 (403)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {object} 格式化的禁止访问响应
   */
  static forbidden (message = 'Forbidden', errorCode = 'FORBIDDEN') {
    return this.error(message, errorCode, null, 4003)
  }

  /**
   * 未找到响应 (404)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {object} 格式化的未找到响应
   */
  static notFound (message = 'Not Found', errorCode = 'NOT_FOUND') {
    return this.error(message, errorCode, null, 4004)
  }

  /**
   * 方法不允许响应 (405)
   * @param {string} message - 错误消息
   * @param {Array} allowedMethods - 允许的HTTP方法
   * @returns {object} 格式化的方法不允许响应
   */
  static methodNotAllowed (message = 'Method Not Allowed', allowedMethods = []) {
    const response = this.error(message, 'METHOD_NOT_ALLOWED', null, 4005)
    response.allowedMethods = allowedMethods
    return response
  }

  /**
   * 冲突响应 (409)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 冲突详情
   * @returns {object} 格式化的冲突响应
   */
  static conflict (message = 'Conflict', errorCode = 'CONFLICT', details = null) {
    return this.error(message, errorCode, details, 4009)
  }

  /**
   * 实体过大响应 (413)
   * @param {string} message - 错误消息
   * @param {number} maxSize - 最大允许大小
   * @returns {object} 格式化的实体过大响应
   */
  static payloadTooLarge (message = 'Payload Too Large', maxSize = null) {
    const response = this.error(message, 'PAYLOAD_TOO_LARGE', null, 4013)
    if (maxSize) {
      response.maxSize = maxSize
    }
    return response
  }

  /**
   * 不支持的媒体类型响应 (415)
   * @param {string} message - 错误消息
   * @param {Array} supportedTypes - 支持的媒体类型
   * @returns {object} 格式化的不支持媒体类型响应
   */
  static unsupportedMediaType (message = 'Unsupported Media Type', supportedTypes = []) {
    const response = this.error(message, 'UNSUPPORTED_MEDIA_TYPE', null, 4015)
    response.supportedTypes = supportedTypes
    return response
  }

  /**
   * 请求频率过高响应 (429)
   * @param {string} message - 错误消息
   * @param {number} retryAfter - 重试间隔（秒）
   * @returns {object} 格式化的请求频率过高响应
   */
  static tooManyRequests (message = 'Too Many Requests', retryAfter = 60) {
    const response = this.error(message, 'TOO_MANY_REQUESTS', null, 4029)
    response.retryAfter = retryAfter
    return response
  }

  /**
   * 内部服务器错误响应 (500)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @returns {object} 格式化的服务器错误响应
   */
  static internalError (
    message = 'Internal Server Error',
    errorCode = 'INTERNAL_ERROR',
    details = null
  ) {
    return this.error(message, errorCode, details, 5001)
  }

  /**
   * 服务不可用响应 (503)
   * @param {string} message - 错误消息
   * @param {number} retryAfter - 重试间隔（秒）
   * @returns {object} 格式化的服务不可用响应
   */
  static serviceUnavailable (message = 'Service Unavailable', retryAfter = 300) {
    const response = this.error(message, 'SERVICE_UNAVAILABLE', null, 5003)
    response.retryAfter = retryAfter
    return response
  }

  /**
   * 网关超时响应 (504)
   * @param {string} message - 错误消息
   * @returns {object} 格式化的网关超时响应
   */
  static gatewayTimeout (message = 'Gateway Timeout') {
    return this.error(message, 'GATEWAY_TIMEOUT', null, 5004)
  }

  /**
   * 业务逻辑错误响应
   * @param {string} message - 错误消息
   * @param {string} errorCode - 业务错误代码
   * @param {any} details - 错误详情
   * @param {number} businessCode - 业务状态码（非0表示失败）
   * @returns {object} 格式化的业务错误响应
   */
  static businessError (message, errorCode, details = null, businessCode = 3001) {
    const response = {
      code: businessCode, // ✅ 修正：使用业务状态码，非0表示失败
      msg: message, // ✅ 修正：使用msg字段名，符合前端标准
      data: null,
      timestamp: new Date().toISOString()
    }

    // 只在开发环境添加错误详情
    if (details && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) {
      response.details = details
      response.errorCode = errorCode
    }

    return response
  }

  /**
   * 验证错误响应
   * @param {string} message - 错误消息
   * @param {Array} errors - 验证错误列表
   * @returns {object} 格式化的验证错误响应
   */
  static validationError (message = 'Validation failed', errors = []) {
    return {
      code: 2001, // ✅ 修正：使用业务状态码2001表示验证错误
      msg: message, // ✅ 修正：使用msg字段名，符合前端标准
      data: null,
      errors, // 验证错误详情
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 批量操作响应
   * @param {Array} results - 批量操作结果
   * @param {string} message - 响应消息
   * @param {object} summary - 操作摘要
   * @returns {object} 格式化的批量操作响应
   */
  static batch (results = [], message = 'Batch operation completed', summary = {}) {
    const totalCount = results.length
    const successCount = results.filter(r => r.success === true).length
    const failureCount = totalCount - successCount

    return {
      code: failureCount === 0 ? 0 : 1, // ✅ 修正：全部成功使用0，有失败使用1
      msg: message, // ✅ 修正：使用msg字段名，符合前端标准
      data: results,
      summary: {
        total: totalCount,
        success: successCount,
        failed: failureCount,
        successRate: totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) + '%' : '0%',
        ...summary
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 包装Express响应的工具方法
   * @param {object} res - Express响应对象
   * @param {object} apiResponse - API响应对象
   * @returns {object} Express响应
   */
  static send (res, apiResponse) {
    // ✅ 修正：固定使用HTTP 200状态码，业务状态通过response.code字段表示
    return res.status(200).json(apiResponse)
  }

  /**
   * 包装异常处理的工具方法
   * @param {function} handler - 异步处理函数
   * @returns {function} 包装后的处理函数
   */
  static asyncHandler (handler) {
    return (req, res, next) => {
      Promise.resolve(handler(req, res, next)).catch(next)
    }
  }

  /**
   * 创建标准的Express错误处理中间件
   * @returns {function} Express错误处理中间件
   */
  static errorHandler () {
    return (error, req, res, next) => {
      console.error('API错误:', error)

      // 如果响应已经发送，不再处理
      if (res.headersSent) {
        return next(error)
      }

      // Multer错误处理
      if (error.code === 'LIMIT_FILE_SIZE') {
        return this.send(res, this.payloadTooLarge('文件大小超过限制'))
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return this.send(res, this.badRequest('不支持的文件字段'))
      }

      // JWT错误处理
      if (error.name === 'JsonWebTokenError') {
        return this.send(res, this.unauthorized('无效的访问令牌'))
      }

      if (error.name === 'TokenExpiredError') {
        return this.send(res, this.unauthorized('访问令牌已过期'))
      }

      // Sequelize错误处理
      if (error.name === 'SequelizeValidationError') {
        const validationErrors = error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
        return this.send(res, this.validationError('数据验证失败', validationErrors))
      }

      if (error.name === 'SequelizeUniqueConstraintError') {
        return this.send(res, this.conflict('数据已存在，违反唯一性约束'))
      }

      // 默认内部服务器错误
      const errorMessage = process.env.NODE_ENV === 'production' ? '服务器内部错误' : error.message

      this.send(res, this.internalError(errorMessage, 'INTERNAL_ERROR', error.stack))
    }
  }
}

module.exports = ApiResponse
