/**
 * API响应标准化工具类
 * 提供统一的响应格式和错误处理
 * 🕐 时区：北京时间 (UTC+8) - 中国区域专用
 */

const BeijingTimeHelper = require('./timeHelper') // 🕐 北京时间工具

/**
 * API响应标准化工具类
 *
 * 业务场景：
 * - 统一整个后端项目的API响应格式
 * - 实现符合接口规范文档的标准化响应结构
 * - 提供Express中间件模式的便捷响应方法
 * - 集成北京时间时间戳（UTC+8）
 *
 * 核心功能：
 * - 成功响应（success、created、paginated、noContent）
 * - 错误响应（error、businessError、validationError）
 * - HTTP状态码快捷方法（badRequest、unauthorized、forbidden等）
 * - Express中间件注入（middleware()，提供res.apiSuccess等方法）
 * - 统一错误处理中间件（errorHandler()）
 * - 业务错误码标准化（BusinessErrorCodes）
 * - 业务状态字段验证（validateBusinessStatus）
 *
 * 响应格式标准：
 * {
 *   success: boolean,    // 业务操作是否成功
 *   code: string,        // 业务代码（如SUCCESS、ERROR等）
 *   message: string,     // 响应消息
 *   data: any,           // 响应数据
 *   timestamp: string,   // 北京时间时间戳（YYYY-MM-DD HH:mm:ss）
 *   version: string,     // API版本（固定为v4.0）
 *   request_id: string   // 请求追踪ID（中间件模式时自动添加）
 * }
 *
 * 使用方式：
 * 1. 直接调用静态方法：
 *    return res.json(ApiResponse.success(data))
 *
 * 2. Express中间件模式（推荐）：
 *    app.use(ApiResponse.middleware())
 *    router.get('/users', (req, res) => {
 *      res.apiSuccess(users, '查询成功')
 *    })
 *
 * 3. 错误处理中间件：
 *    app.use(ApiResponse.errorHandler())
 *
 * HTTP状态码约定：
 * - 所有业务响应固定使用HTTP 200状态码
 * - 业务成功/失败通过response.success字段判断
 * - 业务错误码通过response.code字段表示
 * - 特殊场景（如JWT认证失败）使用对应的HTTP状态码
 *
 * 业务错误码分类：
 * - 1xxx: 用户相关错误
 * - 2xxx: 抽奖相关错误
 * - 3xxx: 系统错误
 * - 4xxx: 权限错误
 * - 5xxx: 验证错误
 * - 6xxx: 业务状态相关错误
 * - 7xxx: 业务契约相关错误
 *
 * 安全设计：
 * - 生产环境不返回详细错误堆栈
 * - 开发/测试环境返回httpStatus便于调试
 * - 自动处理Sequelize、JWT、Multer等常见错误
 *
 * 集成特性：
 * - 自动生成请求追踪ID（request_id）
 * - 支持Sequelize验证错误自动转换
 * - 支持JWT认证错误自动处理
 * - 支持Multer文件上传错误自动处理
 *
 * 设计决策：
 * - 使用static方法而非实例方法，避免重复实例化
 * - 中间件模式注入res对象，提供便捷的res.apiXxx()方法
 * - 固定HTTP 200状态码，通过业务字段区分成功/失败（符合接口规范文档标准）
 * - 集成业务错误码和状态字段验证（从ApiStandardManager合并）
 *
 * 创建时间：2025年10月20日
 * 最后更新：2025年10月30日
 *
 * @class ApiResponse
 */
class ApiResponse {
  /**
   * 成功响应 - 符合接口规范文档标准
   * @param {any} data - 响应数据
   * @param {string} message - 响应消息
   * @param {string} code - 业务代码，默认SUCCESS
   * @returns {Object} 格式化的成功响应
   */
  static success(data = null, message = '操作成功', code = 'SUCCESS') {
    return {
      success: true,
      code,
      message,
      data,
      timestamp: BeijingTimeHelper.apiTimestamp(),
      version: 'v4.0'
    }
  }

  /**
   * 错误响应 - 符合接口规范文档标准
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @param {number} httpStatus - HTTP状态码（用于设置响应状态）
   * @returns {Object} 格式化的错误响应
   */
  static error(
    message = '操作失败',
    errorCode = 'UNKNOWN_ERROR',
    details = null,
    httpStatus = null
  ) {
    const response = {
      success: false,
      code: errorCode,
      message,
      data: details || {},
      timestamp: BeijingTimeHelper.apiTimestamp(),
      version: 'v4.0'
    }

    // 始终写入httpStatus（所有环境统一行为）
    if (httpStatus) {
      response.httpStatus = httpStatus
    }

    return response
  }

  /**
   * 分页成功响应 - 符合接口规范文档标准
   * @param {Array} data - 数据数组
   * @param {Object} pagination - 分页信息
   * @param {string} message - 响应消息
   * @returns {Object} 格式化的分页响应
   */
  static paginated(data = [], pagination = {}, message = '查询成功') {
    const page = pagination.page ?? 1
    const page_size = pagination.page_size ?? pagination.limit ?? 20
    const total = pagination.total ?? 0
    const total_pages =
      pagination.total_pages ??
      pagination.totalPages ??
      (page_size > 0 ? Math.ceil(total / page_size) : 0)
    const has_next = pagination.has_next ?? pagination.hasNext ?? page * page_size < total
    const has_prev = pagination.has_prev ?? pagination.hasPrev ?? page > 1

    return {
      success: true,
      code: 'PAGINATION_SUCCESS',
      message,
      data,
      pagination: {
        total,
        page,
        page_size,
        total_pages,
        has_next,
        has_prev
      },
      timestamp: BeijingTimeHelper.apiTimestamp(),
      version: 'v4.0'
    }
  }

  /**
   * 创建响应 (201 Created) - 符合接口规范文档标准
   * @param {any} data - 创建的数据
   * @param {string} message - 响应消息
   * @returns {Object} 格式化的创建响应
   */
  static created(data = null, message = '创建成功') {
    return {
      success: true,
      code: 'CREATED',
      message,
      data,
      timestamp: BeijingTimeHelper.apiTimestamp(),
      version: 'v4.0'
    }
  }

  /**
   * 无内容响应 (204 No Content) - 符合接口规范文档标准
   * @param {string} message - 响应消息
   * @returns {Object} 格式化的无内容响应
   */
  static noContent(message = '操作成功') {
    return {
      success: true,
      code: 'NO_CONTENT',
      message,
      data: null,
      timestamp: BeijingTimeHelper.apiTimestamp(),
      version: 'v4.0'
    }
  }

  /**
   * 客户端错误响应 (400)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @returns {Object} 格式化的客户端错误响应
   */
  static badRequest(message = '请求参数错误', errorCode = 'BAD_REQUEST', details = null) {
    return this.error(message, errorCode, details, 400)
  }

  /**
   * 未授权响应 (401)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {Object} 格式化的未授权响应
   */
  static unauthorized(message = '未授权访问', errorCode = 'UNAUTHORIZED') {
    return this.error(message, errorCode, null, 401)
  }

  /**
   * 禁止访问响应 (403)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {Object} 格式化的禁止访问响应
   */
  static forbidden(message = '禁止访问', errorCode = 'FORBIDDEN') {
    return this.error(message, errorCode, null, 403)
  }

  /**
   * 未找到响应 (404)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @returns {Object} 格式化的未找到响应
   */
  static notFound(message = '资源未找到', errorCode = 'NOT_FOUND') {
    return this.error(message, errorCode, null, 404)
  }

  /**
   * 方法不允许响应 (405)
   * @param {string} message - 错误消息
   * @param {Array} allowedMethods - 允许的HTTP方法
   * @returns {Object} 格式化的方法不允许响应
   */
  static methodNotAllowed(message = '请求方法不允许', allowedMethods = []) {
    const response = this.error(message, 'METHOD_NOT_ALLOWED', null, 405)
    response.allowedMethods = allowedMethods
    return response
  }

  /**
   * 冲突响应 (409)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 冲突详情
   * @returns {Object} 格式化的冲突响应
   */
  static conflict(message = '资源冲突', errorCode = 'CONFLICT', details = null) {
    return this.error(message, errorCode, details, 409)
  }

  /**
   * 实体过大响应 (413)
   * @param {string} message - 错误消息
   * @param {number} maxSize - 最大允许大小
   * @returns {Object} 格式化的实体过大响应
   */
  static payloadTooLarge(message = 'Payload Too Large', maxSize = null) {
    const response = this.error(message, 'PAYLOAD_TOO_LARGE', null, 413)
    if (maxSize) {
      response.maxSize = maxSize
    }
    return response
  }

  /**
   * 不支持的媒体类型响应 (415)
   * @param {string} message - 错误消息
   * @param {Array} supportedTypes - 支持的媒体类型
   * @returns {Object} 格式化的不支持媒体类型响应
   */
  static unsupportedMediaType(message = 'Unsupported Media Type', supportedTypes = []) {
    const response = this.error(message, 'UNSUPPORTED_MEDIA_TYPE', null, 415)
    response.supportedTypes = supportedTypes
    return response
  }

  /**
   * 请求频率过高响应 (429)
   * @param {string} message - 错误消息
   * @param {number} retryAfter - 重试间隔（秒）
   * @returns {Object} 格式化的请求频率过高响应
   */
  static tooManyRequests(message = '请求过于频繁', retryAfter = 60) {
    const response = this.error(message, 'TOO_MANY_REQUESTS', null, 429)
    response.retryAfter = retryAfter
    return response
  }

  /**
   * 内部服务器错误响应 (500)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @returns {Object} 格式化的服务器错误响应
   */
  static internalError(message = '服务器内部错误', errorCode = 'INTERNAL_ERROR', details = null) {
    return this.error(message, errorCode, details, 500)
  }

  /**
   * 服务不可用响应 (503)
   * @param {string} message - 错误消息
   * @param {number} retryAfter - 重试间隔（秒）
   * @returns {Object} 格式化的服务不可用响应
   */
  static serviceUnavailable(message = '服务暂时不可用', retryAfter = 300) {
    const response = this.error(message, 'SERVICE_UNAVAILABLE', null, 503)
    response.retryAfter = retryAfter
    return response
  }

  /**
   * 网关超时响应 (504)
   * @param {string} message - 错误消息
   * @returns {Object} 格式化的网关超时响应
   */
  static gatewayTimeout(message = 'Gateway Timeout') {
    return this.error(message, 'GATEWAY_TIMEOUT', null, 504)
  }

  /**
   * 业务逻辑错误响应 - 符合接口规范文档标准
   * @param {string} message - 错误消息
   * @param {string} errorCode - 业务错误代码
   * @param {any} details - 错误详情
   * @param {number} httpStatus - HTTP状态码
   * @returns {Object} 格式化的业务错误响应
   */
  static businessError(message, errorCode, details = null, httpStatus = 400) {
    return this.error(message, errorCode, details, httpStatus)
  }

  /**
   * 验证错误响应 - 符合接口规范文档标准
   * @param {string} message - 错误消息
   * @param {Array} errors - 详细验证错误列表
   * @returns {Object} 格式化的验证错误响应
   */
  static validationError(message = '数据验证失败', errors = []) {
    return this.error(message, 'VALIDATION_ERROR', { errors }, 422)
  }

  /**
   * 批量操作响应
   * @param {Array} results - 批量操作结果
   * @param {string} message - 响应消息
   * @param {Object} summary - 操作摘要
   * @returns {Object} 格式化的批量操作响应
   */
  static batch(results = [], message = 'Batch operation completed', summary = {}) {
    const totalCount = results.length
    const successCount = results.filter(r => r.success === true).length
    const failureCount = totalCount - successCount

    return {
      success: failureCount === 0, // 业务操作是否全部成功
      code: failureCount === 0 ? 'BATCH_SUCCESS' : 'BATCH_PARTIAL_FAILURE', // 业务码（字符串枚举）
      message, // 人类可读消息（统一使用message）
      data: results,
      summary: {
        total: totalCount,
        success: successCount,
        failed: failureCount,
        success_rate: totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) + '%' : '0%',
        ...summary
      },
      timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
    }
  }

  /**
   * 包装Express响应的工具方法
   * @param {Object} res - Express响应对象
   * @param {Object} apiResponse - API响应对象
   * @returns {Object} Express响应
   */
  static send(res, apiResponse) {
    /*
     * ✅ 使用apiResponse中的httpStatus字段（如果有），否则使用200
     * 业务成功：200；业务错误：根据httpStatus字段（如400、401、403、404、500等）
     */
    const statusCode = apiResponse.httpStatus || 200
    return res.status(statusCode).json(apiResponse)
  }

  /**
   * 包装异常处理的工具方法
   * @param {function} handler - 异步处理函数
   * @returns {function} 包装后的处理函数
   */
  static asyncHandler(handler) {
    return (req, res, next) => {
      Promise.resolve(handler(req, res, next)).catch(next)
    }
  }

  /**
   * 创建Express中间件，将ApiResponse方法注入到res对象中
   * 符合接口规范文档的业务标准格式
   * @returns {function} Express中间件
   */
  static middleware() {
    return (req, res, next) => {
      // 生成或获取请求追踪ID - 符合业务标准
      const requestId =
        req.headers['x-request-id'] ||
        req.headers['request-id'] ||
        (() => {
          // Node.js 16+ 支持 crypto.randomUUID（本项目Node.js 20+）
          try {
            const crypto = require('crypto')
            return `req_${crypto.randomUUID()}`
          } catch (_e) {
            return `req_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
          }
        })()

      /*
       * ✅ 注入 request_id 到 req，并回传响应头（全链路追踪）
       * 说明：很多中间件/错误处理器需要从 req 读取 request_id
       */
      // eslint-disable-next-line require-atomic-updates
      req.id = requestId
      res.setHeader('X-Request-ID', requestId)

      // 注入统一的成功响应方法 - 符合接口规范文档标准
      res.apiSuccess = (data = null, message = '操作成功', code = 'SUCCESS') => {
        const response = this.success(data, message, code)
        response.request_id = requestId
        return this.send(res, response)
      }

      // 注入统一的错误响应方法 - 符合接口规范文档标准
      res.apiError = (
        message = '操作失败',
        errorCode = 'ERROR',
        details = null,
        httpStatus = 400
      ) => {
        const response = this.error(message, errorCode, details, httpStatus)
        response.request_id = requestId
        return this.send(res, response)
      }

      // 注入分页响应方法 - 符合业务标准
      res.apiPaginated = (data = [], pagination = {}, message = '查询成功') => {
        const response = this.paginated(data, pagination, message)
        response.request_id = requestId
        return this.send(res, response)
      }

      // 注入创建响应方法 - 符合业务标准
      res.apiCreated = (data = null, message = '创建成功') => {
        const response = this.created(data, message)
        response.request_id = requestId
        return this.send(res, response)
      }

      // 注入业务错误响应方法 - 符合业务标准
      res.apiBusinessError = (message, errorCode, details = null, httpStatus = 400) => {
        const response = this.businessError(message, errorCode, details, httpStatus)
        response.request_id = requestId
        return this.send(res, response)
      }

      // 注入验证错误响应方法 - 符合业务标准
      res.apiValidationError = (message = '数据验证失败', errors = []) => {
        const response = this.validationError(message, errors)
        response.request_id = requestId
        return this.send(res, response)
      }

      // 注入快捷错误方法 - 符合业务标准
      res.apiBadRequest = (message = '请求参数错误', details = null) => {
        const response = this.badRequest(message, 'BAD_REQUEST', details)
        response.request_id = requestId
        return this.send(res, response)
      }

      /**
       * 🔐 未授权响应（支持自定义错误码）
       * @param {string} message - 错误消息
       * @param {string} errorCode - 错误码，默认 'UNAUTHORIZED'
       * @returns {Object} Express响应对象
       * @example
       *   res.apiUnauthorized('会话已失效', 'SESSION_INVALIDATED')
       *   res.apiUnauthorized('未登录')  // 使用默认 'UNAUTHORIZED'
       */
      res.apiUnauthorized = (message = '未授权访问', errorCode = 'UNAUTHORIZED') => {
        const response = this.unauthorized(message, errorCode)
        response.request_id = requestId
        return this.send(res, response)
      }

      res.apiForbidden = (message = '禁止访问') => {
        const response = this.forbidden(message, 'FORBIDDEN')
        response.request_id = requestId
        return this.send(res, response)
      }

      res.apiNotFound = (message = '资源不存在') => {
        const response = this.notFound(message, 'NOT_FOUND')
        response.request_id = requestId
        return this.send(res, response)
      }

      res.apiInternalError = (message = '服务器内部错误') => {
        const response = this.internalError(message, 'INTERNAL_ERROR')
        response.request_id = requestId
        return this.send(res, response)
      }

      next()
    }
  }

  /**
   * 创建标准的Express错误处理中间件
   * @returns {function} Express错误处理中间件
   */
  static errorHandler() {
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

// =============== 业务错误码和验证功能（从ApiStandardManager合并） ===============

/**
 * 业务错误码标准化配置
 * 统一业务错误码，避免分散定义
 */
ApiResponse.BusinessErrorCodes = {
  // 用户相关错误 (1xxx)
  USER_NOT_FOUND: 1001,
  USER_DISABLED: 1002,
  INSUFFICIENT_POINTS: 1003,

  // 抽奖相关错误 (2xxx)
  LOTTERY_NOT_AVAILABLE: 2001,
  INVALID_STRATEGY: 2002,
  DRAW_LIMIT_EXCEEDED: 2003,
  CAMPAIGN_NOT_FOUND: 2004,
  PRIZE_NOT_AVAILABLE: 2005,

  // 系统错误 (3xxx)
  DATABASE_ERROR: 3001,
  CACHE_ERROR: 3002,
  EXTERNAL_SERVICE_ERROR: 3003,

  // 权限错误 (4xxx)
  UNAUTHORIZED: 4001,
  FORBIDDEN: 4002,
  TOKEN_EXPIRED: 4003,

  // 验证错误 (5xxx)
  VALIDATION_ERROR: 5001,
  INVALID_PARAMS: 5002,
  REQUIRED_FIELD_MISSING: 5003,

  // 业务状态相关错误 (6xxx)
  BUSINESS_STATUS_INVALID: 6001,
  FIELD_NAMING_VIOLATION: 6002,
  STATUS_TRANSITION_INVALID: 6003,

  // 业务契约相关错误 (7xxx)
  API_CONTRACT_MISMATCH: 7001,
  REQUIRED_API_MISSING: 7002
}

/**
 * 业务状态字段标准化配置
 * 统一业务状态字段的命名和取值
 */
ApiResponse.BusinessStatusStandards = {
  inventory_item_status: {
    field: 'status',
    type: 'enum',
    values: ['available', 'used', 'expired'],
    description: '库存物品状态枚举',
    usage: ['Item'],
    scenarios: ['物品可用性判断', '使用状态追踪']
  },
  prize_queue_status: {
    field: 'status',
    type: 'enum',
    values: ['pending', 'distributed', 'expired', 'cancelled'],
    description: '奖品队列状态（注意：distributed而非completed）',
    usage: ['UserSpecificPrizeQueue'],
    scenarios: ['管理员预设奖品发放', '队列式奖品管理']
  }
}

/**
 * 验证业务状态字段标准化
 * @param {Object} data - 待验证的数据对象
 * @param {string} context - 业务上下文
 * @returns {Object} 验证结果
 */
ApiResponse.validateBusinessStatus = function (data, context) {
  const standard = ApiResponse.BusinessStatusStandards[context]
  if (!standard) {
    return {
      valid: false,
      error: 'UNKNOWN_BUSINESS_CONTEXT',
      message: `未知的业务上下文: ${context}`
    }
  }

  const fieldName = standard.field
  const fieldValue = data[fieldName]

  // 检查字段是否存在
  if (fieldValue === undefined) {
    return {
      valid: false,
      error: 'REQUIRED_FIELD_MISSING',
      message: `缺少必需的业务状态字段: ${fieldName}`,
      expected: standard
    }
  }

  // 验证字段类型和值
  if (standard.type === 'enum' && !standard.values.includes(fieldValue)) {
    return {
      valid: false,
      error: 'INVALID_ENUM_VALUE',
      message: `业务状态字段 ${fieldName} 值无效: ${fieldValue}`,
      expected: standard.values,
      actual: fieldValue
    }
  }

  return {
    valid: true,
    message: `业务状态字段 ${fieldName} 验证通过`,
    standard
  }
}

/**
 * 根据业务错误码创建标准化错误响应
 * @param {string|number} errorCode - 业务错误码
 * @param {string} customMessage - 自定义错误消息（可选）
 * @param {any} details - 错误详情（可选）
 * @returns {Object} 标准化错误响应
 */
ApiResponse.businessError = function (errorCode, customMessage = null, details = null) {
  // 查找错误码对应的标准消息
  const errorCodeName = Object.keys(ApiResponse.BusinessErrorCodes).find(
    key => ApiResponse.BusinessErrorCodes[key] === errorCode
  )

  const defaultMessages = {
    [ApiResponse.BusinessErrorCodes.USER_NOT_FOUND]: '用户不存在',
    [ApiResponse.BusinessErrorCodes.USER_DISABLED]: '用户已被禁用',
    [ApiResponse.BusinessErrorCodes.INSUFFICIENT_POINTS]: '积分不足',
    [ApiResponse.BusinessErrorCodes.LOTTERY_NOT_AVAILABLE]: '抽奖暂不可用',
    [ApiResponse.BusinessErrorCodes.INVALID_STRATEGY]: '无效的抽奖策略',
    [ApiResponse.BusinessErrorCodes.DRAW_LIMIT_EXCEEDED]: '抽奖次数已达上限',
    [ApiResponse.BusinessErrorCodes.CAMPAIGN_NOT_FOUND]: '活动不存在',
    [ApiResponse.BusinessErrorCodes.PRIZE_NOT_AVAILABLE]: '奖品不可用',
    [ApiResponse.BusinessErrorCodes.DATABASE_ERROR]: '数据库操作失败',
    [ApiResponse.BusinessErrorCodes.CACHE_ERROR]: '缓存服务异常',
    [ApiResponse.BusinessErrorCodes.EXTERNAL_SERVICE_ERROR]: '外部服务异常',
    [ApiResponse.BusinessErrorCodes.UNAUTHORIZED]: '未授权访问',
    [ApiResponse.BusinessErrorCodes.FORBIDDEN]: '禁止访问',
    [ApiResponse.BusinessErrorCodes.TOKEN_EXPIRED]: '令牌已过期',
    [ApiResponse.BusinessErrorCodes.VALIDATION_ERROR]: '数据验证失败',
    [ApiResponse.BusinessErrorCodes.INVALID_PARAMS]: '参数无效',
    [ApiResponse.BusinessErrorCodes.REQUIRED_FIELD_MISSING]: '缺少必需字段',
    [ApiResponse.BusinessErrorCodes.BUSINESS_STATUS_INVALID]: '业务状态无效',
    [ApiResponse.BusinessErrorCodes.FIELD_NAMING_VIOLATION]: '字段命名不规范',
    [ApiResponse.BusinessErrorCodes.STATUS_TRANSITION_INVALID]: '状态转换无效',
    [ApiResponse.BusinessErrorCodes.API_CONTRACT_MISMATCH]: 'API契约不匹配',
    [ApiResponse.BusinessErrorCodes.REQUIRED_API_MISSING]: '必需API缺失'
  }

  const message = customMessage || defaultMessages[errorCode] || '未知业务错误'

  return ApiResponse.error(message, errorCodeName || `BUSINESS_ERROR_${errorCode}`, details)
}

module.exports = ApiResponse
