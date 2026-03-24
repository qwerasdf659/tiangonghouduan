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
  const seq = String(crypto.randomInt(0, 1000)).padStart(3, '0')
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
  const seq = String(crypto.randomInt(0, 1000)).padStart(3, '0')
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
 */

/**
 * 生成抽奖记录业务唯一键（四段式：领域_用户_对象指纹_时间戳毫秒）
 *
 * 对象指纹：对「会话ID + 抽次序号」做 SHA-256 取前 12 位 hex，避免嵌套完整 session 串导致过长。
 *
 * @param {number|string} userId - 用户ID
 * @param {string} lotterySessionId - 抽奖会话ID
 * @param {number} drawIndex - 本次抽奖在会话中的序号（从0开始）
 * @param {number} [timestamp] - 毫秒时间戳，默认 Date.now()
 * @returns {string} 业务唯一键
 */
function generateLotteryDrawBusinessId(userId, lotterySessionId, drawIndex, timestamp) {
  if (!userId || !lotterySessionId || drawIndex === undefined) {
    throw new Error('userId, lotterySessionId 和 drawIndex 不能为空')
  }
  const ts = timestamp !== undefined && timestamp !== null ? timestamp : Date.now()
  const objectFingerprint = crypto
    .createHash('sha256')
    .update(`${lotterySessionId}|${drawIndex}`)
    .digest('hex')
    .slice(0, 12)
  return `lottery_${userId}_${objectFingerprint}_${ts}`
}

/**
 * 生成消费记录业务唯一键（四段式：consume_商家_用户_时间戳毫秒）
 *
 * @param {number|string} merchantId - 商家用户ID
 * @param {number|string} userId - 消费用户ID
 * @param {number} [timestamp] - 毫秒时间戳，默认当前时间
 * @returns {string} 业务唯一键
 */
function generateConsumptionBusinessId(merchantId, userId, timestamp) {
  if (!merchantId || userId === undefined || userId === null) {
    throw new Error('merchantId 与 userId 不能为空')
  }
  const ts = timestamp !== undefined && timestamp !== null ? timestamp : Date.now()
  return `consume_${merchantId}_${userId}_${ts}`
}

/**
 * 生成兑换记录业务唯一键（四段式：exchange_用户_SKU_时间戳毫秒）
 *
 * @param {number|string} userId - 用户ID
 * @param {number|string} skuId - 兑换 SKU ID（业务对象标识）
 * @param {number} [timestamp] - 毫秒时间戳，默认当前时间
 * @returns {string} 业务唯一键
 */
function generateExchangeBusinessId(userId, skuId, timestamp) {
  if (!userId || !skuId) {
    throw new Error('userId 和 skuId 不能为空')
  }
  const ts = timestamp !== undefined && timestamp !== null ? timestamp : Date.now()
  return `exchange_${userId}_${skuId}_${ts}`
}

/**
 * 生成交易订单业务唯一键（四段式：trade_买家_挂牌_时间戳毫秒）
 *
 * @param {number|string} buyerId - 买家用户ID
 * @param {number|string} listingId - 挂牌ID
 * @param {number} [timestamp] - 毫秒时间戳，默认当前时间
 * @returns {string} 业务唯一键
 */
function generateTradeOrderBusinessId(buyerId, listingId, timestamp) {
  if (!buyerId || !listingId) {
    throw new Error('buyerId 和 listingId 不能为空')
  }
  const ts = timestamp !== undefined && timestamp !== null ? timestamp : Date.now()
  return `trade_${buyerId}_${listingId}_${ts}`
}

/**
 * 生成交易市场订单幂等键（服务端推荐格式，收口调用方拼接）
 *
 * 格式：trade_{buyer_id}_{listing_id}_{timestamp}_{8位hex}
 * 客户端仍可通过 Header 传入任意唯一字符串；此函数供测试与内部脚本统一风格。
 *
 * @param {number|string} buyerId - 买家用户ID
 * @param {number|string} listingId - 挂牌ID
 * @returns {string} 幂等键
 */
function generateTradeIdempotencyKey(buyerId, listingId) {
  if (!buyerId || !listingId) {
    throw new Error('buyerId 和 listingId 不能为空')
  }
  const ts = Date.now()
  const hex = crypto.randomBytes(4).toString('hex')
  return `trade_${buyerId}_${listingId}_${ts}_${hex}`
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
      return /^lottery_\d+_[a-f0-9]{12}_\d+$/.test(businessId)

    case 'consumption':
      return /^consume_\d+_\d+_\d+$/.test(businessId)

    case 'exchange':
      return /^exchange_\d+_\d+_\d+$/.test(businessId)

    case 'trade_order':
      return /^trade_\d+_\d+_\d+$/.test(businessId)

    default:
      return false
  }
}

/**
 * 生成管理员操作幂等键（Admin Operation Idempotency Key）
 *
 * 用途：将前端 Date.now() 拼接的幂等键收口到后端统一生成，
 * 保证管理员批量操作（资产调整、批量发放等）的幂等性安全。
 *
 * 格式：admin_{operationType}_{operatorId}_{timestamp}_{random6}
 *
 * @param {number|string} operatorId - 管理员用户ID
 * @param {string} operationType - 操作类型（如 asset_adjust / batch_grant / diamond_adjust）
 * @param {Object} [context] - 可选上下文（如目标用户ID、资产类型，用于提高唯一性）
 * @param {number|string} [context.target_user_id] - 目标用户ID
 * @param {string} [context.asset_code] - 资产编码
 * @returns {string} 管理员操作幂等键
 *
 * @example
 * generateAdminOperationKey(31, 'asset_adjust', { target_user_id: 100, asset_code: 'DIAMOND' })
 * // => 'admin_asset_adjust_31_100_DIAMOND_1703511234567_a1b2c3'
 *
 * generateAdminOperationKey(31, 'batch_grant')
 * // => 'admin_batch_grant_31_1703511234567_a1b2c3'
 */
function generateAdminOperationKey(operatorId, operationType, context = {}) {
  if (!operatorId || !operationType) {
    throw new Error('operatorId 和 operationType 不能为空')
  }
  const timestamp = Date.now()
  const random = crypto.randomBytes(3).toString('hex')
  const contextParts = []
  if (context.target_user_id) contextParts.push(context.target_user_id)
  if (context.asset_code) contextParts.push(context.asset_code)
  const contextStr = contextParts.length > 0 ? `_${contextParts.join('_')}` : ''
  return `admin_${operationType}_${operatorId}${contextStr}_${timestamp}_${random}`
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
  generateAdminOperationKey,
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
  generateTradeIdempotencyKey,
  isValidBusinessId,

  // 管理员操作幂等键
  generateAdminOperationKey,

  // BusinessIdGenerator 类封装
  BusinessIdGenerator
}
