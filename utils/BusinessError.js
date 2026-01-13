/**
 * 业务异常类（Business Error Class）
 *
 * 文件路径：utils/BusinessError.js
 *
 * 架构决策4：业务异常类 + 统一错误码体系
 *
 * 核心功能：
 * - 统一业务层错误格式，区分业务错误与系统错误
 * - 使用按域拆分的错误码前缀（CONSUMPTION_* / QRCODE_* / PERMISSION_*）
 * - 支持错误详情（details），仅用于日志记录，不对外暴露
 *
 * 使用场景：
 * - Service 层抛出业务错误时使用 BusinessError
 * - 全局错误中间件识别 BusinessError 并返回标准响应格式
 *
 * 创建时间：2026-01-13
 * 版本：V4.5.0
 *
 * @example
 * // 在服务层使用
 * const BusinessError = require('../utils/BusinessError')
 *
 * if (!data.user_uuid) {
 *   throw new BusinessError(
 *     'user_uuid 是必需参数，必须由路由层传入',
 *     'CONSUMPTION_MISSING_USER_UUID',
 *     400
 *   )
 * }
 *
 * @example
 * // 带详情的错误（details 仅用于日志，不对外暴露）
 * throw new BusinessError(
 *   '用户不存在',
 *   'CONSUMPTION_USER_NOT_FOUND',
 *   404,
 *   { searched_uuid: userUuid.substring(0, 8) + '...' }
 * )
 */

'use strict'

/**
 * 业务异常类
 *
 * 用于统一业务层错误格式，区分业务错误与系统错误
 *
 * @class BusinessError
 * @extends Error
 */
class BusinessError extends Error {
  /**
   * 创建业务异常实例
   *
   * @param {string} message - 错误消息（人类可读，可返回给客户端）
   * @param {string} code - 业务错误码（按域拆分前缀，如 CONSUMPTION_MISSING_USER_UUID）
   * @param {number} [statusCode=400] - HTTP 状态码（默认 400）
   * @param {Object|null} [details=null] - 错误详情（仅用于日志，不对外暴露）
   */
  constructor(message, code, statusCode = 400, details = null) {
    super(message)

    /**
     * 错误名称（用于 instanceof 判断）
     * @type {string}
     */
    this.name = 'BusinessError'

    /**
     * 业务错误码（按域拆分前缀）
     * 命名规则：<DOMAIN>_<ERROR_TYPE>
     * 示例：CONSUMPTION_MISSING_USER_UUID, QRCODE_EXPIRED, PERMISSION_DENIED
     * @type {string}
     */
    this.code = code

    /**
     * HTTP 状态码
     * - 400: 参数错误、业务规则违反
     * - 401: 未认证
     * - 403: 权限不足
     * - 404: 资源不存在
     * - 409: 冲突（幂等键冲突等）
     * - 422: 业务规则违反（语义错误）
     * @type {number}
     */
    this.statusCode = statusCode

    /**
     * 错误详情（仅用于日志记录，不对外暴露）
     * 可包含调试信息、内部状态等敏感数据
     * @type {Object|null}
     */
    this.details = details

    // 捕获堆栈跟踪（Node.js 特性）
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BusinessError)
    }
  }

  /**
   * 转换为 API 响应格式
   *
   * 用于全局错误中间件构建标准响应
   * 注意：details 字段不包含在返回中（安全考虑）
   *
   * @param {string} [requestId] - 请求追踪 ID（用于日志关联）
   * @returns {Object} API 响应格式对象
   *
   * @example
   * // 返回格式
   * {
   *   success: false,
   *   code: 'CONSUMPTION_MISSING_USER_UUID',
   *   message: 'user_uuid 是必需参数',
   *   data: null,
   *   timestamp: '2026-01-13T12:00:00.000+08:00',
   *   request_id: 'req_abc123'
   * }
   */
  toAPIResponse(requestId = null) {
    return {
      success: false,
      code: this.code,
      message: this.message,
      data: null,
      timestamp: new Date().toISOString(),
      request_id: requestId
    }
  }

  /**
   * 转换为日志格式
   *
   * 用于结构化日志记录，包含完整错误信息
   * 注意：包含 details 字段，仅用于内部日志
   *
   * @param {string} [requestId] - 请求追踪 ID
   * @returns {Object} 日志格式对象
   */
  toLogFormat(requestId = null) {
    return {
      error_type: 'BusinessError',
      code: this.code,
      message: this.message,
      status_code: this.statusCode,
      details: this.details,
      request_id: requestId,
      stack: this.stack
    }
  }

  /**
   * 检查是否为业务错误实例
   *
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否为业务错误
   *
   * @example
   * if (BusinessError.isBusinessError(error)) {
   *   // 业务错误，返回标准格式
   * } else {
   *   // 系统错误，隐藏内部细节
   * }
   */
  static isBusinessError(error) {
    return error instanceof BusinessError || error?.name === 'BusinessError'
  }
}

module.exports = BusinessError
