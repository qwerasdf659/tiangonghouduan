/**
 * 幂等键生成工具模块 - IdempotencyHelper
 *
 * 用于生成各种业务场景的幂等键，防止重复操作
 *
 * 幂等架构：入口幂等 + 内部派生（业界标准 - 方案B）
 * - 入口幂等：防止"同一个业务请求"被重复提交（重试/超时/重复点击）
 * - 内部派生：同一个业务请求内部产生多条事务记录，各自有独立幂等键
 *
 * 设计理念：
 * - lottery_session_id: 只负责"关联同一业务事件的多条记录"（业务关联）
 * - idempotency_key: 独立承担"防止重复入账"的责任（幂等保证）
 * - request_idempotency_key: 入口层的请求级幂等键（派生源）
 *
 * 命名规范（方案B - 从请求幂等键派生）：
 * - 请求幂等键: req_{timestamp}_{random8}_{seq}
 * - 抽奖会话ID: lottery_tx_{timestamp}_{random6}_{seq}
 * - 抽奖派生键: {req_key}:consume、{req_key}:reward_1（从请求幂等键派生）
 * - 独立幂等键: {business_type}_{account_id}_{timestamp}_{random6}
 *
 * 创建时间：2025-12-26
 * 版本：2.0.0 - 方案B业界标准版
 */

'use strict'

const crypto = require('crypto')

/**
 * 生成抽奖会话ID（lottery_session_id）
 *
 * 用途：把同一次抽奖的多条流水（consume + reward）关联起来
 *
 * 格式：lottery_tx_{timestamp}_{random6}_{seq}
 * - timestamp: 毫秒级时间戳
 * - random6: 6位16进制随机数
 * - seq: 3位随机序列号
 *
 * @returns {string} 抽奖会话ID
 *
 * @example
 * const sessionId = generateLotterySessionId()
 * // => 'lottery_tx_1703511234567_a1b2c3_001'
 */
function generateLotterySessionId() {
  const timestamp = Date.now()
  const random = crypto.randomBytes(3).toString('hex') // 6位16进制
  const seq = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `lottery_tx_${timestamp}_${random}_${seq}`
}

/**
 * 从请求幂等键派生事务级幂等键（Transaction-Level Idempotency Key）
 *
 * 用途：同一请求内的多条事务记录，各自有独立的幂等键
 *
 * 格式：{request_idempotency_key}:{transaction_type}
 * - request_idempotency_key: 请求级幂等键（来自入口层）
 * - transaction_type: 事务类型（consume/reward/reward_1/reward_2/refund等）
 *
 * 业界标准（方案B）：
 * - 入口幂等：api_idempotency_requests 表存储请求级幂等键
 * - 派生幂等：从请求级幂等键派生事务级幂等键
 * - 职责分离：lottery_session_id 只负责关联记录，idempotency_key 负责防重复
 *
 * @param {string} requestIdempotencyKey - 请求级幂等键（必须从入口层传递）
 * @param {string} transactionType - 事务类型（consume/reward/reward_1/refund等）
 * @returns {string} 事务级幂等键
 *
 * @example
 * const consumeKey = deriveTransactionIdempotencyKey('req_1703511234567_a1b2c3d4_001', 'consume')
 * // => 'req_1703511234567_a1b2c3d4_001:consume'
 * const rewardKey = deriveTransactionIdempotencyKey('req_1703511234567_a1b2c3d4_001', 'reward_1')
 * // => 'req_1703511234567_a1b2c3d4_001:reward_1'
 */
function deriveTransactionIdempotencyKey(requestIdempotencyKey, transactionType) {
  if (!requestIdempotencyKey || !transactionType) {
    throw new Error('requestIdempotencyKey 和 transactionType 不能为空')
  }
  return `${requestIdempotencyKey}:${transactionType}`
}

/**
 * 生成独立的事务级幂等键（非抽奖场景使用）
 *
 * 用途：非抽奖类的独立事务（充值/转账/兑换/管理员调整等）
 *
 * 格式：{business_type}_{account_id}_{timestamp}_{random6}
 * - business_type: 业务类型（recharge/transfer/exchange/admin_adjustment等）
 * - account_id: 账户ID
 * - timestamp: 毫秒级时间戳
 * - random6: 6位16进制随机数
 *
 * @param {string} businessType - 业务类型
 * @param {number|string} accountId - 账户ID
 * @returns {string} 事务幂等键
 *
 * @example
 * const key = generateStandaloneIdempotencyKey('admin_adjustment', 123)
 * // => 'admin_adjustment_123_1703511234567_a1b2c3'
 */
function generateStandaloneIdempotencyKey(businessType, accountId) {
  if (!businessType || accountId === undefined || accountId === null) {
    throw new Error('businessType 和 accountId 不能为空')
  }
  const timestamp = Date.now()
  const random = crypto.randomBytes(3).toString('hex') // 6位16进制
  return `${businessType}_${accountId}_${timestamp}_${random}`
}

/**
 * 生成请求级幂等键（Request-Level Idempotency Key）
 *
 * 用途：防止"同一次请求"被重复提交（重试/超时/重复点击）
 *
 * 格式：req_{timestamp}_{random8}_{seq}
 * - timestamp: 毫秒级时间戳
 * - random8: 8位16进制随机数
 * - seq: 3位随机序列号
 *
 * @returns {string} 请求幂等键
 *
 * @example
 * const reqKey = generateRequestIdempotencyKey()
 * // => 'req_1703511234567_a1b2c3d4_001'
 */
function generateRequestIdempotencyKey() {
  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString('hex') // 8位16进制
  const seq = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `req_${timestamp}_${random}_${seq}`
}

/**
 * 验证幂等键格式是否有效
 *
 * @param {string} key - 待验证的幂等键
 * @param {string} type - 预期的键类型（lottery_session/request_derived/standalone/request）
 * @returns {boolean} 是否有效
 */
function isValidIdempotencyKey(key, type) {
  if (!key || typeof key !== 'string') {
    return false
  }

  switch (type) {
    case 'lottery_session':
      // lottery_tx_{timestamp}_{random6}_{seq}
      return /^lottery_tx_\d+_[a-f0-9]{6}_\d{3}$/.test(key)

    case 'request_derived':
      // {req_key}:{type} - 方案B标准格式（从请求幂等键派生）
      return /^req_\d+_[a-f0-9]{8}_\d{3}:(consume|reward|refund|reward_\d+)$/.test(key)

    case 'standalone':
      // {business_type}_{account_id}_{timestamp}_{random6}
      return /^[a-z_]+_\d+_\d+_[a-f0-9]{6}$/.test(key)

    case 'request':
      // req_{timestamp}_{random8}_{seq}
      return /^req_\d+_[a-f0-9]{8}_\d{3}$/.test(key)

    default:
      return false
  }
}

/**
 * 从幂等键解析出会话信息
 *
 * @param {string} idempotencyKey - 幂等键
 * @returns {Object|null} 解析结果，失败返回null
 *
 * @example
 * // 解析请求派生键（方案B标准格式）
 * const info = parseIdempotencyKey('req_1703511234567_a1b2c3d4_001:consume')
 * // => { type: 'request_derived', requestIdempotencyKey: 'req_1703511234567_a1b2c3d4_001', transactionType: 'consume' }
 */
function parseIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return null
  }

  // 尝试解析请求派生键（方案B标准格式）
  const requestDerivedMatch = idempotencyKey.match(
    /^(req_\d+_[a-f0-9]{8}_\d{3}):(consume|reward|refund|reward_\d+)$/
  )
  if (requestDerivedMatch) {
    return {
      type: 'request_derived',
      requestIdempotencyKey: requestDerivedMatch[1],
      transactionType: requestDerivedMatch[2]
    }
  }

  // 尝试解析请求级幂等键
  if (/^req_\d+_[a-f0-9]{8}_\d{3}$/.test(idempotencyKey)) {
    return {
      type: 'request',
      requestIdempotencyKey: idempotencyKey
    }
  }

  // 尝试解析抽奖会话键
  if (/^lottery_tx_\d+_[a-f0-9]{6}_\d{3}$/.test(idempotencyKey)) {
    return {
      type: 'lottery_session',
      lotterySessionId: idempotencyKey
    }
  }

  return null
}

module.exports = {
  generateLotterySessionId,
  deriveTransactionIdempotencyKey,
  generateStandaloneIdempotencyKey,
  generateRequestIdempotencyKey,
  isValidIdempotencyKey,
  parseIdempotencyKey
}
