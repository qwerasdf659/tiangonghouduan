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

/**
 * ============================================================================
 * BusinessIdGenerator - 业务唯一键生成器
 * ============================================================================
 *
 * 治理决策（2026-01-05 拍板）：
 * - idempotency_key：请求级幂等（防止同一请求重复提交）
 * - business_id：业务级幂等（防止同一业务操作从不同请求重复执行）
 *
 * 区别示例：
 * - 用户连续点击两次"下单"，idempotency_key 相同，第二次被拦截 ✅
 * - 用户刷新页面后重新下单，idempotency_key 不同，但 business_id 相同，第二次被拦截 ✅
 *
 * @see docs/事务边界治理现状核查报告.md 建议9.1
 */

/**
 * 生成抽奖记录业务唯一键
 *
 * 格式：lottery_draw_{user_id}_{session_id}_{draw_index}
 *
 * @param {number|string} userId - 用户ID
 * @param {string} lotterySessionId - 抽奖会话ID
 * @param {number} drawIndex - 本次抽奖在会话中的序号（从0开始）
 * @returns {string} 业务唯一键
 *
 * @example
 * generateLotteryDrawBusinessId(123, 'lottery_tx_1703511234567_a1b2c3_001', 0)
 * // => 'lottery_draw_123_lottery_tx_1703511234567_a1b2c3_001_0'
 */
function generateLotteryDrawBusinessId(userId, lotterySessionId, drawIndex) {
  if (!userId || !lotterySessionId || drawIndex === undefined) {
    throw new Error('userId, lotterySessionId 和 drawIndex 不能为空')
  }
  return `lottery_draw_${userId}_${lotterySessionId}_${drawIndex}`
}

/**
 * 生成消费记录业务唯一键
 *
 * 格式：consumption_{merchant_id}_{timestamp}_{random}
 *
 * 业务语义：同一商家在同一时间点（毫秒级）只能提交一笔消费记录
 *
 * @param {number|string} merchantId - 商家ID
 * @param {number} [timestamp] - 时间戳（可选，默认当前时间）
 * @param {string} [randomSuffix] - 随机后缀（可选，默认生成6位随机数）
 * @returns {string} 业务唯一键
 *
 * @example
 * generateConsumptionBusinessId(456)
 * // => 'consumption_456_1703511234567_a1b2c3'
 */
function generateConsumptionBusinessId(merchantId, timestamp, randomSuffix) {
  if (!merchantId) {
    throw new Error('merchantId 不能为空')
  }
  const ts = timestamp || Date.now()
  const random = randomSuffix || crypto.randomBytes(3).toString('hex')
  return `consumption_${merchantId}_${ts}_${random}`
}

/**
 * 生成兑换记录业务唯一键
 *
 * 格式：exchange_{user_id}_{item_id}_{timestamp}
 *
 * 业务语义：同一用户在同一时间点（毫秒级）只能兑换一次同一商品
 *
 * @param {number|string} userId - 用户ID
 * @param {number|string} exchangeItemId - 兑换商品ID
 * @param {number} [timestamp] - 时间戳（可选，默认当前时间）
 * @returns {string} 业务唯一键
 *
 * @example
 * generateExchangeBusinessId(123, 789)
 * // => 'exchange_123_789_1703511234567'
 */
function generateExchangeBusinessId(userId, exchangeItemId, timestamp) {
  if (!userId || !exchangeItemId) {
    throw new Error('userId 和 exchangeItemId 不能为空')
  }
  const ts = timestamp || Date.now()
  return `exchange_${userId}_${exchangeItemId}_${ts}`
}

/**
 * 生成交易订单业务唯一键
 *
 * 格式：trade_order_{buyer_id}_{market_listing_id}_{timestamp}
 *
 * 业务语义：同一买家在同一时间点（毫秒级）只能对同一挂牌下单一次
 *
 * @param {number|string} buyerId - 买家ID
 * @param {number|string} listingId - 挂牌ID
 * @param {number} [timestamp] - 时间戳（可选，默认当前时间）
 * @returns {string} 业务唯一键
 *
 * @example
 * generateTradeOrderBusinessId(123, 456)
 * // => 'trade_order_123_456_1703511234567'
 */
function generateTradeOrderBusinessId(buyerId, listingId, timestamp) {
  if (!buyerId || !listingId) {
    throw new Error('buyerId 和 listingId 不能为空')
  }
  const ts = timestamp || Date.now()
  return `trade_order_${buyerId}_${listingId}_${ts}`
}

/**
 * 验证业务唯一键格式是否有效
 *
 * @param {string} businessId - 待验证的业务唯一键
 * @param {string} type - 预期的键类型（lottery_draw/consumption/exchange/trade_order）
 * @returns {boolean} 是否有效
 */
function isValidBusinessId(businessId, type) {
  if (!businessId || typeof businessId !== 'string') {
    return false
  }

  switch (type) {
    case 'lottery_draw':
      // lottery_draw_{user_id}_{session_id}_{draw_index}
      return /^lottery_draw_\d+_lottery_tx_\d+_[a-f0-9]{6}_\d{3}_\d+$/.test(businessId)

    case 'consumption':
      // consumption_{merchant_id}_{timestamp}_{random}
      return /^consumption_\d+_\d+_[a-f0-9]{6}$/.test(businessId)

    case 'exchange':
      // exchange_{user_id}_{item_id}_{timestamp}
      return /^exchange_\d+_\d+_\d+$/.test(businessId)

    case 'trade_order':
      // trade_order_{buyer_id}_{market_listing_id}_{timestamp}
      return /^trade_order_\d+_\d+_\d+$/.test(businessId)

    default:
      return false
  }
}

/**
 * BusinessIdGenerator 类封装（便于对象形式调用）
 *
 * @example
 * BusinessIdGenerator.generateLotteryDrawId(123, 'session_001', 0)
 * BusinessIdGenerator.generateConsumptionId(456)
 */
const BusinessIdGenerator = {
  generateLotteryDrawId: generateLotteryDrawBusinessId,
  generateConsumptionId: generateConsumptionBusinessId,
  generateExchangeId: generateExchangeBusinessId,
  generateTradeOrderId: generateTradeOrderBusinessId,
  isValidBusinessId
}

module.exports = {
  // 原有的幂等键生成函数
  generateLotterySessionId,
  deriveTransactionIdempotencyKey,
  generateStandaloneIdempotencyKey,
  generateRequestIdempotencyKey,
  isValidIdempotencyKey,
  parseIdempotencyKey,

  // 新增：业务唯一键生成函数
  generateLotteryDrawBusinessId,
  generateConsumptionBusinessId,
  generateExchangeBusinessId,
  generateTradeOrderBusinessId,
  isValidBusinessId,

  // 新增：BusinessIdGenerator 类封装
  BusinessIdGenerator
}
