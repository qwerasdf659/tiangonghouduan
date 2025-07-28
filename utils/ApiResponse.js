/**
 * API响应标准化工具类
 * 提供统一的响应格式和错误处理
 */

class ApiResponse {
  /**
   * 成功响应
   * @param {any} data - 响应数据
   * @param {string} message - 响应消息
   * @param {object} meta - 元数据
   * @returns {object} 格式化的成功响应
   */
  static success(data = null, message = 'Success', meta = {}) {
    return {
      success: true,
      code: 200,
      message: message,
      data: data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  }

  /**
   * 错误响应
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @param {number} httpStatus - HTTP状态码
   * @returns {object} 格式化的错误响应
   */
  static error(message = 'Error', errorCode = 'UNKNOWN_ERROR', details = null, httpStatus = 500) {
    const response = {
      success: false,
      code: httpStatus,
      message: message,
      error: {
        code: errorCode,
        message: message,
        timestamp: new Date().toISOString()
      }
    };

    // 只在开发环境或详情不为空时添加详情
    if (details && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) {
      response.error.details = details;
    }

    return response;
  }

  /**
   * 分页成功响应
   * @param {Array} data - 数据数组
   * @param {object} pagination - 分页信息
   * @param {string} message - 响应消息
   * @param {object} meta - 元数据
   * @returns {object} 格式化的分页响应
   */
  static paginated(data = [], pagination = {}, message = 'Success', meta = {}) {
    return {
      success: true,
      code: 200,
      message: message,
      data: data,
      pagination: {
        total: pagination.total || 0,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
        totalPages: pagination.totalPages || 0,
        hasNext: pagination.hasNext || false,
        hasPrev: pagination.hasPrev || false,
        ...pagination
      },
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  }

  /**
   * 创建响应 (201 Created)
   * @param {any} data - 创建的数据
   * @param {string} message - 响应消息
   * @param {object} meta - 元数据
   * @returns {object} 格式化的创建响应
   */
  static created(data = null, message = 'Created successfully', meta = {}) {
    return {
      success: true,
      code: 201,
      message: message,
      data: data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  }

  /**
   * 无内容响应 (204 No Content)
   * @param {string} message - 响应消息
   * @returns {object} 格式化的无内容响应
   */
  static noContent(message = 'No content') {
    return {
      success: true,
      code: 204,
      message: message,
      data: null,
      meta: {
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 客户端错误响应 (400)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @returns {object} 格式化的客户端错误响应
   */
  static badRequest(message = 'Bad Request', errorCode = 'BAD_REQUEST', details = null) {
    return this.error(message, errorCode, details, 400);
  }

  /**
   * 未授权响应 (401)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {object} 格式化的未授权响应
   */
  static unauthorized(message = 'Unauthorized', errorCode = 'UNAUTHORIZED') {
    return this.error(message, errorCode, null, 401);
  }

  /**
   * 禁止访问响应 (403)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {object} 格式化的禁止访问响应
   */
  static forbidden(message = 'Forbidden', errorCode = 'FORBIDDEN') {
    return this.error(message, errorCode, null, 403);
  }

  /**
   * 未找到响应 (404)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {object} 格式化的未找到响应
   */
  static notFound(message = 'Not Found', errorCode = 'NOT_FOUND') {
    return this.error(message, errorCode, null, 404);
  }

  /**
   * 方法不允许响应 (405)
   * @param {string} message - 错误消息
   * @param {Array} allowedMethods - 允许的HTTP方法
   * @returns {object} 格式化的方法不允许响应
   */
  static methodNotAllowed(message = 'Method Not Allowed', allowedMethods = []) {
    return {
      ...this.error(message, 'METHOD_NOT_ALLOWED', null, 405),
      meta: {
        allowedMethods: allowedMethods,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 冲突响应 (409)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 冲突详情
   * @returns {object} 格式化的冲突响应
   */
  static conflict(message = 'Conflict', errorCode = 'CONFLICT', details = null) {
    return this.error(message, errorCode, details, 409);
  }

  /**
   * 实体过大响应 (413)
   * @param {string} message - 错误消息
   * @param {number} maxSize - 最大允许大小
   * @returns {object} 格式化的实体过大响应
   */
  static payloadTooLarge(message = 'Payload Too Large', maxSize = null) {
    const response = this.error(message, 'PAYLOAD_TOO_LARGE', null, 413);
    if (maxSize) {
      response.meta = {
        maxSize: maxSize,
        timestamp: new Date().toISOString()
      };
    }
    return response;
  }

  /**
   * 不支持的媒体类型响应 (415)
   * @param {string} message - 错误消息
   * @param {Array} supportedTypes - 支持的媒体类型
   * @returns {object} 格式化的不支持媒体类型响应
   */
  static unsupportedMediaType(message = 'Unsupported Media Type', supportedTypes = []) {
    return {
      ...this.error(message, 'UNSUPPORTED_MEDIA_TYPE', null, 415),
      meta: {
        supportedTypes: supportedTypes,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 请求频率过高响应 (429)
   * @param {string} message - 错误消息
   * @param {number} retryAfter - 重试间隔（秒）
   * @returns {object} 格式化的请求频率过高响应
   */
  static tooManyRequests(message = 'Too Many Requests', retryAfter = 60) {
    return {
      ...this.error(message, 'TOO_MANY_REQUESTS', null, 429),
      meta: {
        retryAfter: retryAfter,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 内部服务器错误响应 (500)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @returns {object} 格式化的服务器错误响应
   */
  static internalError(message = 'Internal Server Error', errorCode = 'INTERNAL_ERROR', details = null) {
    return this.error(message, errorCode, details, 500);
  }

  /**
   * 服务不可用响应 (503)
   * @param {string} message - 错误消息
   * @param {number} retryAfter - 重试间隔（秒）
   * @returns {object} 格式化的服务不可用响应
   */
  static serviceUnavailable(message = 'Service Unavailable', retryAfter = 300) {
    return {
      ...this.error(message, 'SERVICE_UNAVAILABLE', null, 503),
      meta: {
        retryAfter: retryAfter,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 网关超时响应 (504)
   * @param {string} message - 错误消息
   * @returns {object} 格式化的网关超时响应
   */
  static gatewayTimeout(message = 'Gateway Timeout') {
    return this.error(message, 'GATEWAY_TIMEOUT', null, 504);
  }

  /**
   * 业务逻辑错误响应
   * @param {string} message - 错误消息
   * @param {string} errorCode - 业务错误代码
   * @param {any} details - 错误详情
   * @returns {object} 格式化的业务错误响应
   */
  static businessError(message, errorCode, details = null) {
    return {
      success: false,
      code: 400,
      message: message,
      error: {
        code: errorCode,
        type: 'BUSINESS_ERROR',
        message: message,
        details: details,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 验证错误响应
   * @param {string} message - 错误消息
   * @param {Array} errors - 验证错误列表
   * @returns {object} 格式化的验证错误响应
   */
  static validationError(message = 'Validation failed', errors = []) {
    return {
      success: false,
      code: 422,
      message: message,
      error: {
        code: 'VALIDATION_ERROR',
        type: 'VALIDATION_ERROR',
        message: message,
        errors: errors,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 批量操作响应
   * @param {Array} results - 批量操作结果
   * @param {string} message - 响应消息
   * @param {object} summary - 操作摘要
   * @returns {object} 格式化的批量操作响应
   */
  static batch(results = [], message = 'Batch operation completed', summary = {}) {
    const totalCount = results.length;
    const successCount = results.filter(r => r.success === true).length;
    const failureCount = totalCount - successCount;

    return {
      success: failureCount === 0,
      code: 200,
      message: message,
      data: results,
      summary: {
        total: totalCount,
        success: successCount,
        failed: failureCount,
        successRate: totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) + '%' : '0%',
        ...summary
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 包装Express响应的工具方法
   * @param {object} res - Express响应对象
   * @param {object} apiResponse - API响应对象
   * @returns {object} Express响应
   */
  static send(res, apiResponse) {
    return res.status(apiResponse.code).json(apiResponse);
  }

  /**
   * 包装异常处理的工具方法
   * @param {function} handler - 异步处理函数
   * @returns {function} 包装后的处理函数
   */
  static asyncHandler(handler) {
    return (req, res, next) => {
      Promise.resolve(handler(req, res, next)).catch(next);
    };
  }

  /**
   * 创建标准的Express错误处理中间件
   * @returns {function} Express错误处理中间件
   */
  static errorHandler() {
    return (error, req, res, next) => {
      console.error('API错误:', error);

      // 如果响应已经发送，不再处理
      if (res.headersSent) {
        return next(error);
      }

      // Multer错误处理
      if (error.code === 'LIMIT_FILE_SIZE') {
        return this.send(res, this.payloadTooLarge('文件大小超过限制'));
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return this.send(res, this.badRequest('不支持的文件字段'));
      }

      // JWT错误处理
      if (error.name === 'JsonWebTokenError') {
        return this.send(res, this.unauthorized('无效的访问令牌'));
      }

      if (error.name === 'TokenExpiredError') {
        return this.send(res, this.unauthorized('访问令牌已过期'));
      }

      // Sequelize错误处理
      if (error.name === 'SequelizeValidationError') {
        const validationErrors = error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }));
        return this.send(res, this.validationError('数据验证失败', validationErrors));
      }

      if (error.name === 'SequelizeUniqueConstraintError') {
        return this.send(res, this.conflict('数据已存在，违反唯一性约束'));
      }

      // 默认内部服务器错误
      const errorMessage = process.env.NODE_ENV === 'production' 
        ? '服务器内部错误' 
        : error.message;

      this.send(res, this.internalError(errorMessage, 'INTERNAL_ERROR', error.stack));
    };
  }
}

module.exports = ApiResponse; 