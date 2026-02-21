/**
 * 餐厅积分抽奖系统 V4.2 - C2C 交易担保码服务
 *
 * 业务场景（决策5/Phase 4）：
 * - 仅用于 listing_kind = 'item_instance' 的实物交易
 * - 买方付款（资产冻结）后，系统生成 6 位纯数字担保码
 * - 担保码发给卖方，卖方交付物品后将码告知买方
 * - 买方输入码确认收货 → 冻结资产转给卖方 → 交易完成
 *
 * 技术实现：
 * - 6 位纯数字码（crypto.randomInt 生成，范围 100000-999999）
 * - Redis 存储，30 分钟有效期（可配置）
 * - Key 格式：escrow:{trade_order_id}
 * - 超时策略（决策P3 阶梯式）：4h 提醒 → 24h 自动取消
 *
 * 创建时间：2026-02-21
 */

'use strict'

const crypto = require('crypto')
const logger = require('../utils/logger').logger

/**
 * C2C 交易担保码服务
 *
 * @class EscrowCodeService
 * @description 生成、验证、管理 C2C 实物交易的担保码
 */
class EscrowCodeService {
  /**
   * Redis Key 前缀
   * @type {string}
   */
  static REDIS_KEY_PREFIX = 'escrow'

  /**
   * 默认有效期（秒）：30 分钟
   * @type {number}
   */
  static DEFAULT_TTL_SECONDS = 1800

  /**
   * 生成担保码并存入 Redis
   *
   * @param {number} trade_order_id - 交易订单ID
   * @param {Object} options - 选项
   * @param {number} [options.ttl_seconds=1800] - 有效期（秒），默认 30 分钟
   * @param {number} options.buyer_user_id - 买方用户ID（用于验证）
   * @param {number} options.seller_user_id - 卖方用户ID（用于通知）
   * @returns {Promise<Object>} 生成结果 { escrow_code, expires_at, trade_order_id }
   */
  static async generateEscrowCode(trade_order_id, options = {}) {
    const { ttl_seconds = this.DEFAULT_TTL_SECONDS, buyer_user_id, seller_user_id } = options

    const code = this._generateSixDigitCode()
    const redisKey = `${this.REDIS_KEY_PREFIX}:${trade_order_id}`

    const { getRawClient } = require('../utils/UnifiedRedisClient')
    const redisClient = getRawClient()

    const escrowData = JSON.stringify({
      code,
      trade_order_id,
      buyer_user_id,
      seller_user_id,
      created_at: new Date().toISOString(),
      attempts: 0
    })

    await redisClient.set(redisKey, escrowData, 'EX', ttl_seconds)

    const expiresAt = new Date(Date.now() + ttl_seconds * 1000)

    logger.info('[担保码] 生成成功', {
      trade_order_id,
      buyer_user_id,
      seller_user_id,
      expires_in_seconds: ttl_seconds
    })

    return {
      escrow_code: code,
      trade_order_id,
      expires_at: expiresAt.toISOString(),
      ttl_seconds
    }
  }

  /**
   * 验证担保码
   *
   * @param {number} trade_order_id - 交易订单ID
   * @param {string} code - 用户输入的担保码
   * @param {number} verifier_user_id - 验证人（买方）用户ID
   * @returns {Promise<Object>} 验证结果 { valid, error?, trade_order_id }
   */
  static async verifyEscrowCode(trade_order_id, code, verifier_user_id) {
    const redisKey = `${this.REDIS_KEY_PREFIX}:${trade_order_id}`

    const { getRawClient } = require('../utils/UnifiedRedisClient')
    const redisClient = getRawClient()

    const raw = await redisClient.get(redisKey)

    if (!raw) {
      logger.warn('[担保码] 验证失败：担保码不存在或已过期', { trade_order_id })
      return { valid: false, error: '担保码不存在或已过期', trade_order_id }
    }

    const escrowData = JSON.parse(raw)

    // 验证人必须是买方
    if (escrowData.buyer_user_id !== verifier_user_id) {
      logger.warn('[担保码] 验证失败：非买方尝试验证', {
        trade_order_id,
        expected_buyer: escrowData.buyer_user_id,
        actual_user: verifier_user_id
      })
      return { valid: false, error: '只有买方可以确认担保码', trade_order_id }
    }

    // 错误尝试次数限制（最多 5 次）
    if (escrowData.attempts >= 5) {
      logger.warn('[担保码] 验证失败：尝试次数超限', {
        trade_order_id,
        attempts: escrowData.attempts
      })
      return { valid: false, error: '担保码验证次数超限，请联系客服', trade_order_id }
    }

    if (escrowData.code !== code) {
      escrowData.attempts += 1
      const ttl = await redisClient.ttl(redisKey)
      await redisClient.set(redisKey, JSON.stringify(escrowData), 'EX', Math.max(ttl, 60))

      logger.warn('[担保码] 验证失败：码不匹配', {
        trade_order_id,
        attempts: escrowData.attempts
      })
      return {
        valid: false,
        error: `担保码错误，剩余 ${5 - escrowData.attempts} 次尝试机会`,
        trade_order_id
      }
    }

    // 验证成功，删除 Redis 中的担保码（一次性使用）
    await redisClient.del(redisKey)

    logger.info('[担保码] 验证成功', {
      trade_order_id,
      buyer_user_id: verifier_user_id,
      seller_user_id: escrowData.seller_user_id
    })

    return { valid: true, trade_order_id }
  }

  /**
   * 查询担保码状态（卖方/管理员查看，不返回明文码）
   *
   * @param {number} trade_order_id - 交易订单ID
   * @returns {Promise<Object|null>} 担保码状态信息
   */
  static async getEscrowStatus(trade_order_id) {
    const redisKey = `${this.REDIS_KEY_PREFIX}:${trade_order_id}`

    const { getRawClient } = require('../utils/UnifiedRedisClient')
    const redisClient = getRawClient()

    const raw = await redisClient.get(redisKey)
    if (!raw) return null

    const ttl = await redisClient.ttl(redisKey)
    const escrowData = JSON.parse(raw)

    return {
      trade_order_id,
      exists: true,
      created_at: escrowData.created_at,
      attempts: escrowData.attempts,
      remaining_ttl_seconds: ttl,
      buyer_user_id: escrowData.buyer_user_id,
      seller_user_id: escrowData.seller_user_id
    }
  }

  /**
   * 重新生成担保码（旧码失效后重新生成）
   *
   * @param {number} trade_order_id - 交易订单ID
   * @param {number} requester_user_id - 请求者ID（必须是卖方或管理员）
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 新的担保码信息
   */
  static async regenerateEscrowCode(trade_order_id, requester_user_id, options = {}) {
    const status = await this.getEscrowStatus(trade_order_id)

    if (status && status.seller_user_id !== requester_user_id) {
      const error = new Error('只有卖方可以重新生成担保码')
      error.statusCode = 403
      error.code = 'FORBIDDEN'
      throw error
    }

    const redisKey = `${this.REDIS_KEY_PREFIX}:${trade_order_id}`
    const { getRawClient } = require('../utils/UnifiedRedisClient')
    const redisClient = getRawClient()
    await redisClient.del(redisKey)

    return await this.generateEscrowCode(trade_order_id, {
      buyer_user_id: status?.buyer_user_id || options.buyer_user_id,
      seller_user_id: status?.seller_user_id || options.seller_user_id,
      ttl_seconds: options.ttl_seconds
    })
  }

  /**
   * 取消担保码（订单取消时调用）
   *
   * @param {number} trade_order_id - 交易订单ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  static async cancelEscrowCode(trade_order_id) {
    const redisKey = `${this.REDIS_KEY_PREFIX}:${trade_order_id}`

    const { getRawClient } = require('../utils/UnifiedRedisClient')
    const redisClient = getRawClient()

    const deleted = await redisClient.del(redisKey)

    logger.info('[担保码] 已取消', { trade_order_id, deleted: deleted > 0 })

    return deleted > 0
  }

  /**
   * 生成 6 位纯数字担保码
   *
   * @returns {string} 6 位数字码（如 "582917"）
   * @private
   */
  static _generateSixDigitCode() {
    return String(crypto.randomInt(100000, 999999))
  }
}

module.exports = EscrowCodeService
