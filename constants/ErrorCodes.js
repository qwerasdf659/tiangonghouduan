/**
 * 错误代码统一定义（用于 TransactionManager 错误分类）
 *
 * 文件路径：constants/ErrorCodes.js
 *
 * 设计目标（P0-3决策）：
 * - 4xx/业务码：永不重试（立即抛出）
 * - 未知错误：最多重试 1 次
 * - 死锁/超时类：重试 3 次（指数退避）
 *
 * 使用方式：
 * - 在 Service 层抛出业务错误时，设置 error.code 为以下常量
 * - TransactionManager 根据 error.code 判断是否重试
 *
 * 创建时间：2026-01-09（P0-3 实施）
 * 更新时间：2026-01-13（架构决策4 - 添加消费域错误码）
 * 版本：V4.6.0
 */

'use strict'

/**
 * 不可重试的业务错误码（客户端错误 4xx）
 *
 * 这些错误表示业务逻辑层面的问题，重试不会改变结果：
 * - 权限不足：用户无权执行此操作
 * - 参数错误：请求参数不符合要求
 * - 资源不存在：请求的资源不存在
 * - 余额不足：账户余额不足以完成操作
 * - 重复请求：幂等键冲突，已有相同请求
 * - 业务规则违反：不满足业务规则
 * - 状态不合法：资源状态不允许此操作
 * - 需要所有权：操作需要资源所有权
 * - 资产不可交易：资产类型不允许交易
 *
 * @constant {string[]}
 */
const NON_RETRYABLE_ERROR_CODES = Object.freeze([
  // ========== 权限相关（403）==========
  'PERMISSION_DENIED', // 权限不足
  'NOT_OWNER', // 非所有者
  'OWNERSHIP_REQUIRED', // 需要所有权
  'UNAUTHORIZED', // 未授权
  'PERMISSION_STORE_MISMATCH', // 门店权限不匹配

  // ========== 参数相关（400）==========
  'INVALID_PARAMS', // 参数错误
  'MISSING_REQUIRED_PARAM', // 缺少必需参数
  'INVALID_FORMAT', // 格式错误

  // ========== 资源相关（404/400）==========
  'RESOURCE_NOT_FOUND', // 资源不存在
  'ITEM_NOT_FOUND', // 物品不存在
  'USER_NOT_FOUND', // 用户不存在
  'LISTING_NOT_FOUND', // 挂牌不存在
  'CAMPAIGN_NOT_FOUND', // 活动不存在

  // ========== 业务规则相关（400）==========
  'INSUFFICIENT_BALANCE', // 余额不足
  'BUSINESS_RULE_VIOLATION', // 业务规则违反
  'INVALID_STATUS', // 状态不合法
  'INVALID_ITEM_STATUS', // 物品状态不合法
  'INVALID_LISTING_STATUS', // 挂牌状态不合法
  'INVALID_LISTING_KIND', // 挂牌类型不合法
  'ASSET_NOT_TRADABLE', // 资产不可交易（数据库配置）
  'ASSET_C2C_BLACKLISTED', // 资产C2C黑名单禁止（P0-4硬编码保护）
  'ASSET_TYPE_DISABLED', // 资产类型已禁用
  'INVALID_ASSET_TYPE', // 无效资产类型
  'LISTING_LIMIT_EXCEEDED', // 挂牌数量超限

  // ========== 消费域错误码（CONSUMPTION_*）2026-01-13 ==========
  'CONSUMPTION_MISSING_USER_UUID', // 缺少用户UUID（必须由路由层传入）
  'CONSUMPTION_MISSING_IDEMPOTENCY_KEY', // 缺少幂等键
  'CONSUMPTION_USER_NOT_FOUND', // 消费用户不存在
  'CONSUMPTION_INVALID_AMOUNT', // 消费金额无效
  'CONSUMPTION_AMOUNT_EXCEEDED', // 消费金额超过上限
  'CONSUMPTION_DUPLICATE_SUBMISSION', // 重复提交消费记录

  // ========== 二维码域错误码（QRCODE_*）==========
  'QRCODE_INVALID_FORMAT', // 二维码格式无效
  'QRCODE_EXPIRED', // 二维码已过期
  'QRCODE_REPLAY_DETECTED', // 二维码重放攻击检测
  'QRCODE_SIGNATURE_INVALID', // 二维码签名无效

  // ========== 幂等相关（409）==========
  'DUPLICATE_REQUEST', // 重复请求
  'CONFLICT', // 资源冲突
  'IDEMPOTENCY_CONFLICT', // 幂等键冲突
  'IDEMPOTENCY_KEY_CONFLICT', // 幂等键冲突（别名）
  'IDEMPOTENCY_REQUEST_IN_PROGRESS', // 幂等请求处理中

  // ========== 事务边界相关（500 但不可重试）==========
  'TRANSACTION_REQUIRED', // 需要事务
  'TRANSACTION_FINISHED', // 事务已完成

  // ========== 通用错误码（用于隐藏内部细节）==========
  'INTERNAL_ERROR', // 服务器内部错误
  'DATABASE_ERROR', // 数据库错误
  'SERVICE_UNAVAILABLE' // 服务不可用
])

/**
 * 可重试的错误码（服务端错误 5xx 或临时性错误）
 *
 * 这些错误通常是临时性的，重试可能成功：
 * - 数据库死锁：并发操作导致的死锁
 * - 数据库超时：查询超时
 * - Redis连接错误：Redis暂时不可用
 * - 外部服务错误：第三方服务暂时不可用
 * - 临时不可用：服务暂时过载
 *
 * @constant {string[]}
 */
const RETRYABLE_ERROR_CODES = Object.freeze([
  // ========== 数据库相关（可重试 3 次）==========
  'DATABASE_DEADLOCK', // 数据库死锁
  'DATABASE_TIMEOUT', // 数据库超时
  'DATABASE_CONNECTION_ERROR', // 数据库连接错误
  'LOCK_WAIT_TIMEOUT', // 锁等待超时

  // ========== 外部服务相关（可重试 3 次）==========
  'REDIS_CONNECTION_ERROR', // Redis连接错误
  'EXTERNAL_SERVICE_ERROR', // 外部服务错误
  'TEMPORARY_UNAVAILABLE', // 临时不可用

  // ========== 事务相关（可重试 3 次）==========
  'TRANSACTION_TIMEOUT' // 事务超时
])

/**
 * 业务错误关键词（用于错误消息分析）
 *
 * 当 error.code 未明确设置时，TransactionManager 会分析错误消息
 * 如果消息包含以下关键词，判定为不可重试的业务错误
 *
 * @constant {string[]}
 */
const BUSINESS_ERROR_KEYWORDS = Object.freeze([
  // 中文业务错误关键词
  '余额不足',
  '库存不足',
  '权限不足',
  '不存在',
  '已存在',
  '状态不正确',
  '状态不可',
  '无权',
  '不允许',
  '不可交易',
  '已禁用',
  '超出限制',
  '重复',
  '冲突',
  '必需参数',

  // 英文业务错误关键词
  'not found',
  'already exists',
  'permission denied',
  'unauthorized',
  'forbidden',
  'invalid status',
  'insufficient',
  'not allowed',
  'duplicate',
  'conflict'
])

/**
 * 可重试错误关键词（用于错误消息分析）
 *
 * 当 error.code 未明确设置时，TransactionManager 会分析错误消息
 * 如果消息包含以下关键词，判定为可重试的临时错误
 *
 * @constant {string[]}
 */
const RETRYABLE_ERROR_KEYWORDS = Object.freeze([
  'deadlock',
  'lock wait timeout',
  'timeout',
  'connection',
  'temporarily unavailable',
  'service unavailable',
  'too many connections',
  'econnrefused',
  'econnreset',
  'etimedout'
])

/**
 * 检查错误码是否为不可重试的业务错误
 *
 * @param {string} errorCode - 错误码
 * @returns {boolean} 是否为不可重试的业务错误
 *
 * @example
 * if (isNonRetryableError('PERMISSION_DENIED')) {
 *   // 直接抛出，不重试
 * }
 */
function isNonRetryableError(errorCode) {
  return NON_RETRYABLE_ERROR_CODES.includes(errorCode)
}

/**
 * 检查错误码是否为可重试错误
 *
 * @param {string} errorCode - 错误码
 * @returns {boolean} 是否为可重试错误
 *
 * @example
 * if (isRetryableError('DATABASE_DEADLOCK')) {
 *   // 重试 3 次
 * }
 */
function isRetryableError(errorCode) {
  return RETRYABLE_ERROR_CODES.includes(errorCode)
}

/**
 * 分析错误消息判断是否为业务错误
 *
 * @param {string} message - 错误消息
 * @returns {boolean} 是否为业务错误
 */
function isBusinessErrorByMessage(message) {
  if (!message) return false
  const lowerMsg = message.toLowerCase()
  return BUSINESS_ERROR_KEYWORDS.some(keyword => lowerMsg.includes(keyword.toLowerCase()))
}

/**
 * 分析错误消息判断是否为可重试错误
 *
 * @param {string} message - 错误消息
 * @returns {boolean} 是否为可重试错误
 */
function isRetryableErrorByMessage(message) {
  if (!message) return false
  const lowerMsg = message.toLowerCase()
  return RETRYABLE_ERROR_KEYWORDS.some(keyword => lowerMsg.includes(keyword.toLowerCase()))
}

/**
 * 获取错误的重试策略
 *
 * 决策规则（P0-3已拍板）：
 * - 4xx/业务码：永不重试（maxRetries=0）
 * - 可重试错误：重试 3 次（maxRetries=3）
 * - 未知错误：重试 1 次（maxRetries=1）
 *
 * @param {Error} error - 错误对象
 * @returns {{ retryable: boolean, maxRetries: number, reason: string, code: string }} 重试策略对象
 */
function getRetryStrategy(error) {
  const errorCode = error.code || ''
  const statusCode = error.statusCode || 0
  const message = error.message || ''

  // 1. 优先检查 error.code（明确标识）
  if (errorCode) {
    // 1.1 在不可重试列表中 → 不重试
    if (isNonRetryableError(errorCode)) {
      return {
        retryable: false,
        maxRetries: 0,
        reason: 'non_retryable_error_code',
        code: errorCode
      }
    }

    // 1.2 在可重试列表中 → 重试 3 次
    if (isRetryableError(errorCode)) {
      return {
        retryable: true,
        maxRetries: 3,
        reason: 'retryable_error_code',
        code: errorCode
      }
    }
  }

  // 2. 检查 HTTP statusCode（4xx 不重试）
  if (statusCode >= 400 && statusCode < 500) {
    return {
      retryable: false,
      maxRetries: 0,
      reason: 'client_error_status_code',
      code: `HTTP_${statusCode}`
    }
  }

  /*
   * 3. 通过错误消息关键词判断
   * 3.1 业务错误关键词 → 不重试
   */
  if (isBusinessErrorByMessage(message)) {
    return {
      retryable: false,
      maxRetries: 0,
      reason: 'business_error_keyword',
      code: 'BUSINESS_ERROR'
    }
  }

  // 3.2 可重试错误关键词 → 重试 3 次
  if (isRetryableErrorByMessage(message)) {
    return {
      retryable: true,
      maxRetries: 3,
      reason: 'retryable_error_keyword',
      code: 'RETRYABLE_ERROR'
    }
  }

  // 4. 默认策略：未知错误重试 1 次（P0-3决策12）
  return {
    retryable: true,
    maxRetries: 1,
    reason: 'unknown_error',
    code: 'UNKNOWN'
  }
}

/**
 * 消费域错误码常量（架构决策4 - 2026-01-13）
 *
 * 用于 BusinessError 业务异常类的 code 参数
 * 便于在代码中引用：ErrorCodes.CONSUMPTION_USER_NOT_FOUND
 */
const CONSUMPTION_MISSING_USER_UUID = 'CONSUMPTION_MISSING_USER_UUID'
const CONSUMPTION_MISSING_IDEMPOTENCY_KEY = 'CONSUMPTION_MISSING_IDEMPOTENCY_KEY'
const CONSUMPTION_USER_NOT_FOUND = 'CONSUMPTION_USER_NOT_FOUND'
const CONSUMPTION_INVALID_AMOUNT = 'CONSUMPTION_INVALID_AMOUNT'
const CONSUMPTION_AMOUNT_EXCEEDED = 'CONSUMPTION_AMOUNT_EXCEEDED'
const CONSUMPTION_DUPLICATE_SUBMISSION = 'CONSUMPTION_DUPLICATE_SUBMISSION'

/**
 * 二维码域错误码常量
 */
const QRCODE_INVALID_FORMAT = 'QRCODE_INVALID_FORMAT'
const QRCODE_EXPIRED = 'QRCODE_EXPIRED'
const QRCODE_REPLAY_DETECTED = 'QRCODE_REPLAY_DETECTED'
const QRCODE_SIGNATURE_INVALID = 'QRCODE_SIGNATURE_INVALID'

module.exports = {
  // 错误码数组（用于 TransactionManager 分类）
  NON_RETRYABLE_ERROR_CODES,
  RETRYABLE_ERROR_CODES,
  BUSINESS_ERROR_KEYWORDS,
  RETRYABLE_ERROR_KEYWORDS,

  // 工具函数
  isNonRetryableError,
  isRetryableError,
  isBusinessErrorByMessage,
  isRetryableErrorByMessage,
  getRetryStrategy,

  // ========== 消费域错误码常量（架构决策4）==========
  CONSUMPTION_MISSING_USER_UUID,
  CONSUMPTION_MISSING_IDEMPOTENCY_KEY,
  CONSUMPTION_USER_NOT_FOUND,
  CONSUMPTION_INVALID_AMOUNT,
  CONSUMPTION_AMOUNT_EXCEEDED,
  CONSUMPTION_DUPLICATE_SUBMISSION,

  // ========== 二维码域错误码常量 ==========
  QRCODE_INVALID_FORMAT,
  QRCODE_EXPIRED,
  QRCODE_REPLAY_DETECTED,
  QRCODE_SIGNATURE_INVALID
}
