/**
 * 餐厅积分抽奖系统 V4.2 - 核销码QR动态签名工具
 *
 * 业务场景：核销码系统升级 Phase 1（决策 P7）
 * - 为用户的核销码生成动态QR码内容（5分钟有效）
 * - 商家扫码后验证签名有效性，再调用核销接口
 *
 * 与消费录入QR系统（QRCodeValidator.js）的区别：
 * - 消费QR：用户身份码（user_uuid/nonce），用于到店消费录入
 * - 核销QR：核销码动态签名（order_id/code_hash），用于到店兑换奖品
 * - 两套系统使用独立密钥，互不干扰
 *
 * QR码格式：RQRV1_{base64_payload}_{signature}
 * - base64_payload: Base64编码的JSON，包含 oid(订单ID)、ch(码哈希前8位)、ts(时间戳)
 * - signature: HMAC-SHA256签名（前32位hex）
 *
 * 创建时间：2026-02-21
 */

'use strict'

const crypto = require('crypto')
const logger = require('./logger').logger

/** QR码前缀标识 */
const QR_PREFIX = 'RQRV1'

/** QR码默认有效期（5分钟，单位：毫秒） */
const DEFAULT_EXPIRY_MS = 5 * 60 * 1000

/**
 * 核销码QR动态签名器
 *
 * @class RedemptionQRSigner
 * @description 负责核销QR码的签名生成和验证
 */
class RedemptionQRSigner {
  /**
   * 构造函数
   *
   * @param {string} secret - HMAC签名密钥（从 REDEMPTION_QR_SECRET 环境变量获取）
   */
  constructor(secret) {
    if (!secret) {
      throw new Error('REDEMPTION_QR_SECRET 环境变量未配置')
    }
    this._secret = secret
  }

  /**
   * 为核销订单生成动态QR码内容
   *
   * @param {string} redemptionOrderId - 核销订单ID（UUID）
   * @param {string} codeHash - 核销码的SHA-256哈希值
   * @param {Object} [options] - 可选参数
   * @param {number} [options.expiry_ms] - 自定义有效期（毫秒），默认5分钟
   * @returns {Object} result - 签名结果
   * @returns {string} result.qr_content - QR码内容
   * @returns {string} result.expires_at - 过期时间（ISO8601）
   */
  sign(redemptionOrderId, codeHash, options = {}) {
    const expiryMs = options.expiry_ms || DEFAULT_EXPIRY_MS
    const now = Date.now()
    const expiresAt = now + expiryMs

    const payload = {
      oid: redemptionOrderId,
      ch: codeHash.substring(0, 8),
      ts: now,
      exp: expiresAt
    }

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = this._hmac(payloadB64).substring(0, 32)
    const qrContent = `${QR_PREFIX}_${payloadB64}_${signature}`

    logger.debug('生成核销QR码', {
      order_id: redemptionOrderId,
      expires_in_ms: expiryMs
    })

    return {
      qr_content: qrContent,
      expires_at: new Date(expiresAt).toISOString()
    }
  }

  /**
   * 验证并解析QR码内容
   *
   * @param {string} qrContent - 扫描到的QR码原始内容
   * @returns {Object} result - 验证结果
   * @returns {boolean} result.valid - 是否有效
   * @returns {Object} [result.payload] - 解析后的数据
   * @returns {string} [result.error] - 错误信息
   */
  verify(qrContent) {
    if (!qrContent || typeof qrContent !== 'string') {
      return { valid: false, error: 'QR码内容为空' }
    }

    if (!qrContent.startsWith(`${QR_PREFIX}_`)) {
      return { valid: false, error: '非核销QR码格式' }
    }

    const parts = qrContent.split('_')
    // RQRV1_{payloadB64}_{signature} → 3个部分
    if (parts.length !== 3) {
      return { valid: false, error: 'QR码结构错误' }
    }

    const [, payloadB64, signature] = parts

    // 验证签名
    const expectedSig = this._hmac(payloadB64).substring(0, 32)
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      logger.warn('核销QR码签名验证失败')
      return { valid: false, error: 'QR码签名无效' }
    }

    // 解析 payload
    let payload
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    } catch {
      return { valid: false, error: 'QR码数据解析失败' }
    }

    // 检查过期
    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false, error: 'QR码已过期，请刷新后重试' }
    }

    return {
      valid: true,
      payload: {
        redemption_order_id: payload.oid,
        code_hash_prefix: payload.ch,
        created_at: payload.ts,
        expires_at: payload.exp
      }
    }
  }

  /**
   * HMAC-SHA256 计算
   *
   * @param {string} data - 待签名数据
   * @returns {string} 十六进制签名字符串
   * @private
   */
  _hmac(data) {
    return crypto.createHmac('sha256', this._secret).update(data).digest('hex')
  }
}

/** 单例工厂：延迟初始化，读取 REDEMPTION_QR_SECRET */
let _instance = null

/**
 * 获取 RedemptionQRSigner 单例
 *
 * @returns {RedemptionQRSigner} 签名器实例
 */
function getRedemptionQRSigner() {
  if (!_instance) {
    const secret = process.env.REDEMPTION_QR_SECRET
    if (!secret) {
      throw new Error('环境变量 REDEMPTION_QR_SECRET 未配置，核销QR码功能不可用')
    }
    _instance = new RedemptionQRSigner(secret)
  }
  return _instance
}

module.exports = { RedemptionQRSigner, getRedemptionQRSigner }
