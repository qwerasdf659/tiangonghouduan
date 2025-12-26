/**
 * 幂等键生成工具模块 - IdempotencyHelper
 *
 * 用于生成各种业务场景的幂等键，防止重复操作
 *
 * 幂等架构：入口幂等 + 内部派生（业界标准）
 * - 入口幂等：防止"同一个业务请求"被重复提交（重试/超时/重复点击）
 * - 内部派生：同一个业务请求内部产生多条事务记录，各自有独立幂等键
 *
 * 设计理念：
 * - lottery_session_id: 只负责"关联同一业务事件的多条记录"
 * - idempotency_key: 独立承担"防止重复入账"的责任
 *
 * 命名规范：
 * - 抽奖会话ID: lottery_tx_{timestamp}_{random6}_{seq}
 * - 抽奖派生键: {lottery_session_id}:consume、{lottery_session_id}:reward
 * - 独立幂等键: {business_type}_{account_id}_{timestamp}_{random6}
 *
 * 创建时间：2025-12-26
 * 版本：1.0.0
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
 * 从抽奖会话ID派生事务级幂等键
 *
 * 用途：同一请求内的多条事务记录，各自有独立的幂等键
 *
 * 格式：{lottery_session_id}:{transaction_type}
 * - lottery_session_id: 抽奖会话ID
 * - transaction_type: 事务类型（consume/reward/refund等）
 *
 * @param {string} lotterySessionId - 抽奖会话ID
 * @param {string} transactionType - 事务类型（consume/reward/refund等）
 * @returns {string} 事务级幂等键
 *
 * @example
 * const consumeKey = deriveTransactionIdempotencyKey('lottery_tx_xxx', 'consume')
 * // => 'lottery_tx_xxx:consume'
 * const rewardKey = deriveTransactionIdempotencyKey('lottery_tx_xxx', 'reward')
 * // => 'lottery_tx_xxx:reward'
 */
function deriveTransactionIdempotencyKey(lotterySessionId, transactionType) {
  if (!lotterySessionId || !transactionType) {
    throw new Error('lotterySessionId 和 transactionType 不能为空')
  }
  return `${lotterySessionId}:${transactionType}`
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
 * @param {string} type - 预期的键类型（lottery_session/lottery_derived/standalone/request）
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

    case 'lottery_derived':
      // {lottery_session_id}:{type}
      return /^lottery_tx_\d+_[a-f0-9]{6}_\d{3}:(consume|reward|refund)$/.test(key)

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
 * 从幂等键解析出会话信息（仅支持抽奖派生键）
 *
 * @param {string} idempotencyKey - 幂等键
 * @returns {Object|null} 解析结果，失败返回null
 *
 * @example
 * const info = parseIdempotencyKey('lottery_tx_1703511234567_a1b2c3_001:consume')
 * // => { lotterySessionId: 'lottery_tx_1703511234567_a1b2c3_001', transactionType: 'consume' }
 */
function parseIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return null
  }

  // 尝试解析抽奖派生键
  const lotteryDerivedMatch = idempotencyKey.match(
    /^(lottery_tx_\d+_[a-f0-9]{6}_\d{3}):(consume|reward|refund)$/
  )
  if (lotteryDerivedMatch) {
    return {
      type: 'lottery_derived',
      lotterySessionId: lotteryDerivedMatch[1],
      transactionType: lotteryDerivedMatch[2]
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
