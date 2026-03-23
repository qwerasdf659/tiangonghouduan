/**
 * 餐厅积分抽奖系统 V4.0 - 二维码生成和验证工具（V2动态码版本）
 *
 * 业务场景：商家扫码录入方案B - 动态身份码方案
 * 安全机制：HMAC-SHA256签名 + 过期时间(exp) + 一次性随机数(nonce) + Redis防重放
 *
 * 🔒 二维码格式（v2）：QRV2_{base64_payload}_{signature}
 * - base64_payload: Base64编码的JSON payload，包含 user_uuid, exp, nonce
 * - signature: HMAC-SHA256签名（64位十六进制）
 *
 * Payload 结构：
 * {
 *   "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
 *   "exp": 1736659200000,  // 过期时间戳（毫秒）
 *   "nonce": "a1b2c3d4e5f6..."  // 32位随机数
 * }
 *
 * 签名算法：
 * signature = HMAC-SHA256(base64_payload, CONSUMPTION_QR_SECRET)
 *
 * 安全特性：
 * 1. 使用独立的 CONSUMPTION_QR_SECRET 作为签名密钥（不复用 JWT_SECRET）
 * 2. 动态过期时间：默认5分钟有效期
 * 3. 一次性 nonce：通过 Redis SET NX EX 原子操作防重放
 * 4. UUID格式防止用户ID枚举攻击（隐私保护）
 *
 * 💡 为什么从永久码（v1）升级到动态码（v2）？
 * - 安全性：永久码可被拍照复用，存在重放攻击风险
 * - 可控性：动态码5分钟过期 + 一次性使用，完全杜绝复用
 * - 真实案例：同一二维码8分钟内被提交9次的情况已真实发生
 *
 * 创建时间：2025年10月30日
 * 最后更新：2026年01月12日
 */

'use strict'

const crypto = require('crypto')
const BeijingTimeHelper = require('./timeHelper')
const logger = require('./logger').logger

/**
 * 二维码生成和验证工具类（V2动态码版本）
 *
 * @class QRCodeValidator
 * @description V2 动态身份码生成与验证
 */
class QRCodeValidator {
  /**
   * 构造函数
   *
   * @throws {Error} 如果 CONSUMPTION_QR_SECRET 环境变量未设置
   */
  constructor() {
    // 从环境变量获取签名密钥（独立密钥，不复用 JWT_SECRET）
    this.secret = process.env.CONSUMPTION_QR_SECRET

    // 开发环境：如果未配置，使用临时密钥并警告
    if (!this.secret) {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        // 开发/测试环境：使用临时密钥（警告但不阻断）
        this.secret =
          'dev_consumption_qr_secret_not_for_production_' +
          (process.env.JWT_SECRET || 'fallback').substring(0, 16)
        logger.warn(
          '⚠️ [QRCodeValidator] CONSUMPTION_QR_SECRET 未配置，使用开发环境临时密钥。请在 .env 中配置正式密钥。'
        )
      } else {
        // 生产环境：强制要求配置
        throw new Error(
          'CONSUMPTION_QR_SECRET 环境变量未设置，请在 .env 文件中配置。' +
            '这是生成和验证V2动态身份码所必需的独立密钥。'
        )
      }
    }

    // 签名算法
    this.algorithm = 'sha256'

    // 默认有效期（毫秒）：5分钟
    this.default_expiry_ms = 5 * 60 * 1000

    // nonce 长度（字节），生成32位十六进制字符串
    this.nonce_length = 16

    // Redis 客户端（延迟初始化）
    this._redis_client = null

    // V2 动态码前缀
    this.v2_prefix = 'QRV2_'
  }

  /**
   * 获取 Redis 客户端（延迟初始化）
   *
   * @private
   * @returns {Promise<Object>} Redis 客户端实例
   * @throws {Error} 如果 Redis 不可用
   */
  async _getRedisClient() {
    if (this._redis_client) {
      return this._redis_client
    }

    try {
      const { getRawClient } = require('./UnifiedRedisClient')
      this._redis_client = getRawClient()
      return this._redis_client
    } catch (error) {
      logger.error('❌ [QRCodeValidator] Redis 客户端初始化失败:', error.message)
      throw new Error('二维码验证服务暂不可用（Redis连接失败）')
    }
  }

  /**
   * 生成 HMAC-SHA256 签名
   *
   * @private
   * @param {string} data - 要签名的数据
   * @returns {string} 签名结果（64位十六进制）
   */
  _generateSignature(data) {
    const hmac = crypto.createHmac(this.algorithm, this.secret)
    hmac.update(data)
    return hmac.digest('hex')
  }

  /**
   * 生成安全随机 nonce
   *
   * @private
   * @returns {string} 32位十六进制随机字符串
   */
  _generateNonce() {
    return crypto.randomBytes(this.nonce_length).toString('hex')
  }

  /**
   * 生成用户的动态身份二维码（V2版本）
   *
   * 格式：QRV2_{base64_payload}_{signature}
   *
   * @param {string} user_uuid - 用户UUID（UUIDv4格式）
   * @param {Object} options - 可选参数
   * @param {number} options.expiry_ms - 有效期（毫秒），默认5分钟
   * @returns {Object} 二维码信息
   * @returns {string} returns.qr_code - 二维码字符串
   * @returns {string} returns.user_uuid - 用户UUID
   * @returns {string} returns.nonce - 一次性随机数
   * @returns {number} returns.exp - 过期时间戳（毫秒）
   * @returns {string} returns.expires_at - 过期时间（ISO格式，北京时间）
   * @returns {number} returns.validity_seconds - 有效期（秒）
   *
   * @example
   * const result = qrCodeValidator.generateQRCodeV2('550e8400-e29b-41d4-a716-446655440000')
   * // 返回: {
   * //   qr_code: 'QRV2_eyJ1c2VyX3V1aWQiOiI1NTBlODQwMC4uLiJ9_a1b2c3d4...',
   * //   user_uuid: '550e8400-e29b-41d4-a716-446655440000',
   * //   nonce: 'a1b2c3d4e5f6...',
   * //   exp: 1736659200000,
   * //   expires_at: '2026-01-12T16:20:00+08:00',
   * //   validity_seconds: 300
   * // }
   */
  generateQRCodeV2(user_uuid, options = {}) {
    // 参数验证：检查是否为有效UUID格式
    if (!user_uuid || typeof user_uuid !== 'string') {
      throw new Error('用户UUID必须是字符串')
    }

    // 基础UUID格式验证（正则表达式）
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(user_uuid)) {
      throw new Error('用户UUID格式不正确，必须是有效的UUIDv4格式')
    }

    // 计算过期时间
    const expiry_ms = options.expiry_ms || this.default_expiry_ms
    const now = Date.now()
    const exp = now + expiry_ms

    // 生成一次性 nonce
    const nonce = this._generateNonce()

    // 构建 payload
    const payload = {
      user_uuid,
      exp,
      nonce
    }

    // Base64 编码 payload
    const payload_json = JSON.stringify(payload)
    const base64_payload = Buffer.from(payload_json).toString('base64url')

    // 生成签名
    const signature = this._generateSignature(base64_payload)

    // 组装二维码：QRV2_{base64_payload}_{signature}
    const qr_code = `${this.v2_prefix}${base64_payload}_${signature}`

    logger.info(
      `✅ [QRCodeValidator] 生成V2动态身份码 - UUID: ${user_uuid.substring(0, 8)}..., 有效期: ${expiry_ms / 1000}秒`
    )

    return {
      qr_code,
      user_uuid,
      nonce,
      exp,
      expires_at: BeijingTimeHelper.formatForAPI(new Date(exp)),
      validity_seconds: Math.floor(expiry_ms / 1000),
      generated_at: BeijingTimeHelper.formatForAPI(new Date(now)),
      note: '此二维码仅一次有效，过期后请刷新'
    }
  }

  /**
   * 验证V2动态身份码（仅验证格式、签名、过期时间，不检查nonce）
   *
   * @private
   * @param {string} qr_code - 二维码字符串
   * @returns {Object} 验证结果
   * @returns {boolean} returns.valid - 是否通过基础验证
   * @returns {Object} returns.payload - 解析后的payload（如果有效）
   * @returns {string} returns.error - 错误信息（如果失败）
   * @returns {string} returns.error_code - 错误码（如果失败）
   */
  _validateV2Format(qr_code) {
    try {
      // 1. 基本格式验证
      if (!qr_code || typeof qr_code !== 'string') {
        return {
          valid: false,
          error: '二维码格式错误：必须是字符串',
          error_code: 'INVALID_FORMAT'
        }
      }

      // 2. 检查V2前缀
      if (!qr_code.startsWith(this.v2_prefix)) {
        return {
          valid: false,
          error: '二维码格式不支持，请刷新获取最新二维码',
          error_code: 'INVALID_QRCODE_FORMAT'
        }
      }

      // 3. 解析二维码：QRV2_{base64_payload}_{signature}
      const without_prefix = qr_code.substring(this.v2_prefix.length)
      const last_underscore = without_prefix.lastIndexOf('_')

      if (last_underscore === -1) {
        return {
          valid: false,
          error: '二维码格式错误：缺少签名',
          error_code: 'INVALID_FORMAT'
        }
      }

      const base64_payload = without_prefix.substring(0, last_underscore)
      const provided_signature = without_prefix.substring(last_underscore + 1)

      // 4. 验证签名长度
      if (!provided_signature || provided_signature.length !== 64) {
        return {
          valid: false,
          error: '二维码格式错误：签名长度不正确',
          error_code: 'INVALID_SIGNATURE_LENGTH'
        }
      }

      // 5. 验证签名
      const expected_signature = this._generateSignature(base64_payload)
      if (provided_signature !== expected_signature) {
        return {
          valid: false,
          error: '二维码验证失败：签名不匹配（可能被篡改）',
          error_code: 'INVALID_SIGNATURE'
        }
      }

      // 6. 解析 payload
      let payload
      try {
        const payload_json = Buffer.from(base64_payload, 'base64url').toString('utf8')
        payload = JSON.parse(payload_json)
      } catch (parseError) {
        return {
          valid: false,
          error: '二维码格式错误：payload解析失败',
          error_code: 'INVALID_PAYLOAD'
        }
      }

      // 7. 验证 payload 必需字段
      if (!payload.user_uuid || !payload.exp || !payload.nonce) {
        return {
          valid: false,
          error: '二维码格式错误：缺少必需字段',
          error_code: 'MISSING_FIELDS'
        }
      }

      // 8. 验证 UUID 格式
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(payload.user_uuid)) {
        return {
          valid: false,
          error: '二维码格式错误：用户UUID格式不正确',
          error_code: 'INVALID_UUID'
        }
      }

      // 9. 验证过期时间
      const now = Date.now()
      if (now > payload.exp) {
        const expired_ago = Math.floor((now - payload.exp) / 1000)
        logger.warn(`⏰ [QRCodeValidator] 二维码已过期: ${expired_ago}秒前`)
        return {
          valid: false,
          error: '二维码已过期，请刷新后重试',
          error_code: 'QRCODE_EXPIRED'
        }
      }

      // 基础验证通过
      return {
        valid: true,
        payload
      }
    } catch (error) {
      logger.error(`❌ [QRCodeValidator] 验证异常: ${error.message}`)
      return {
        valid: false,
        error: `二维码验证异常：${error.message}`,
        error_code: 'VALIDATION_ERROR'
      }
    }
  }

  /**
   * 验证V2动态身份码（仅验证格式/签名/过期，不消耗nonce）
   *
   * 适用场景：
   * - /user-info 扫码预览用户信息（可多次调用）
   * - 需要验证二维码有效性但不消耗其使用次数的场景
   *
   * 验证步骤：
   * 1. 格式验证（V2前缀）
   * 2. 签名验证（HMAC-SHA256）
   * 3. 过期验证（exp > 当前时间）
   * 4. ❌ 不执行 nonce 消耗（nonce 由 /submit 端点消耗）
   *
   * @param {string} qr_code - 要验证的二维码字符串
   * @returns {Object} 验证结果
   * @returns {boolean} returns.valid - 是否有效
   * @returns {string} returns.user_uuid - 用户UUID（验证通过时）
   * @returns {string} returns.nonce - nonce值（验证通过时）
   * @returns {string} returns.error - 错误信息（验证失败时）
   * @returns {string} returns.error_code - 错误码（验证失败时）
   * @returns {number} returns.http_status - 建议的HTTP状态码
   *
   * @example
   * // 用于 /user-info 端点，可多次调用同一二维码
   * const result = qrCodeValidator.validateQRCodeV2WithoutNonceConsumption('QRV2_..._signature')
   * if (result.valid) {
   *   console.log('用户UUID:', result.user_uuid)
   * }
   */
  validateQRCodeV2WithoutNonceConsumption(qr_code) {
    // 1. 基础格式、签名、过期验证（不消耗nonce）
    const format_result = this._validateV2Format(qr_code)
    if (!format_result.valid) {
      return {
        ...format_result,
        http_status: format_result.error_code === 'QRCODE_EXPIRED' ? 400 : 400
      }
    }

    const payload = format_result.payload

    logger.info(
      `✅ [QRCodeValidator] V2动态码预览验证通过（未消耗nonce）- UUID: ${payload.user_uuid.substring(0, 8)}...`
    )

    // 3. 返回验证结果（不消耗nonce，允许后续 /submit 使用）
    return {
      valid: true,
      user_uuid: payload.user_uuid,
      nonce: payload.nonce,
      exp: payload.exp,
      http_status: 200
    }
  }

  /**
   * 完整验证V2动态身份码（包含Redis nonce防重放检查）
   *
   * 适用场景：
   * - /submit 消费提交（一次性消耗nonce）
   * - 需要确保二维码只能使用一次的场景
   *
   * 验证步骤：
   * 1. 格式验证（V2前缀）
   * 2. 签名验证（HMAC-SHA256）
   * 3. 过期验证（exp > 当前时间）
   * 4. ✅ nonce一次性验证（Redis SET NX EX 原子操作，消耗nonce）
   *
   * @param {string} qr_code - 要验证的二维码字符串
   * @returns {Promise<Object>} 验证结果
   * @returns {boolean} returns.valid - 是否有效
   * @returns {string} returns.user_uuid - 用户UUID（验证通过时）
   * @returns {string} returns.nonce - nonce值（验证通过时）
   * @returns {string} returns.error - 错误信息（验证失败时）
   * @returns {string} returns.error_code - 错误码（验证失败时）
   * @returns {number} returns.http_status - 建议的HTTP状态码
   *
   * @example
   * const result = await qrCodeValidator.validateQRCodeV2WithNonce('QRV2_..._signature')
   * if (result.valid) {
   *   console.log('用户UUID:', result.user_uuid)
   * } else {
   *   console.log('验证失败:', result.error, '错误码:', result.error_code)
   * }
   */
  async validateQRCodeV2WithNonce(qr_code) {
    // 1. 基础格式、签名、过期验证
    const format_result = this._validateV2Format(qr_code)
    if (!format_result.valid) {
      // 根据错误码确定HTTP状态码
      const http_status = format_result.error_code === 'INVALID_QRCODE_FORMAT' ? 400 : 400
      return {
        ...format_result,
        http_status
      }
    }

    const payload = format_result.payload

    // 2. nonce 防重放检查（Redis SET NX EX 原子操作）
    try {
      const redis = await this._getRedisClient()

      /*
       * Redis key 格式：consumption:nonce:{nonce}
       * TTL = 剩余有效期 + 10秒缓冲（确保在二维码过期后仍有短暂窗口防止边界情况）
       */
      const nonce_key = `consumption:nonce:${payload.nonce}`
      const remaining_ms = payload.exp - Date.now()
      const ttl_seconds = Math.max(Math.ceil(remaining_ms / 1000) + 10, 60) // 至少60秒

      // SET NX EX 原子操作：只有 nonce 不存在时才能成功
      const set_result = await redis.set(nonce_key, '1', 'EX', ttl_seconds, 'NX')

      if (!set_result) {
        // nonce 已存在，检测到重放攻击
        logger.warn(
          `🚫 [QRCodeValidator] 检测到重放攻击: nonce=${payload.nonce.substring(0, 16)}..., user_uuid=${payload.user_uuid.substring(0, 8)}...`
        )
        return {
          valid: false,
          error: '二维码已使用，请刷新后重试',
          error_code: 'REPLAY_DETECTED',
          http_status: 409 // Conflict
        }
      }

      logger.info(
        `✅ [QRCodeValidator] V2动态码验证通过 - UUID: ${payload.user_uuid.substring(0, 8)}..., nonce: ${payload.nonce.substring(0, 16)}...`
      )

      // 验证成功
      return {
        valid: true,
        user_uuid: payload.user_uuid,
        nonce: payload.nonce,
        exp: payload.exp,
        http_status: 200
      }
    } catch (redisError) {
      logger.error(`❌ [QRCodeValidator] Redis操作失败: ${redisError.message}`)

      // Redis 不可用时，返回服务不可用错误（不能绕过安全检查）
      return {
        valid: false,
        error: '二维码验证服务暂不可用，请稍后重试',
        error_code: 'SERVICE_UNAVAILABLE',
        http_status: 503
      }
    }
  }

  /**
   * 生成二维码的完整信息（用于调试和显示，V2版本）
   *
   * @param {string} user_uuid - 用户UUID
   * @param {Object} options - 可选参数
   * @param {number} options.expiry_ms - 有效期（毫秒），默认5分钟
   * @returns {Object} 二维码完整信息
   */
  generateQRCodeInfo(user_uuid, options = {}) {
    const result = this.generateQRCodeV2(user_uuid, options)

    return {
      qr_code: result.qr_code,
      user_uuid: result.user_uuid,
      nonce: result.nonce,
      exp: result.exp,
      expires_at: result.expires_at,
      validity_seconds: result.validity_seconds,
      generated_at: result.generated_at,
      algorithm: this.algorithm,
      version: 'v2',
      note: result.note,
      usage: '商家扫描此二维码后可录入消费金额'
    }
  }

  /**
   * 提取二维码中的用户UUID（不验证签名和nonce）
   *
   * 注意：此方法不验证签名，仅用于快速提取UUID做日志记录，不能用于安全验证
   *
   * @param {string} qr_code - 二维码字符串
   * @returns {string|null} 用户UUID（失败返回null）
   */
  extractUuid(qr_code) {
    try {
      if (!qr_code || typeof qr_code !== 'string') {
        return null
      }

      // 检查V2格式
      if (!qr_code.startsWith(this.v2_prefix)) {
        return null
      }

      // 解析
      const without_prefix = qr_code.substring(this.v2_prefix.length)
      const last_underscore = without_prefix.lastIndexOf('_')

      if (last_underscore === -1) {
        return null
      }

      const base64_payload = without_prefix.substring(0, last_underscore)

      try {
        const payload_json = Buffer.from(base64_payload, 'base64url').toString('utf8')
        const payload = JSON.parse(payload_json)

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        return uuidRegex.test(payload.user_uuid) ? payload.user_uuid : null
      } catch {
        return null
      }
    } catch {
      return null
    }
  }

  /**
   * 检测二维码版本
   *
   * @param {string} qr_code - 二维码字符串
   * @returns {string} 版本：'v2'（动态码）、'unknown'
   */
  detectVersion(qr_code) {
    if (!qr_code || typeof qr_code !== 'string') {
      return 'unknown'
    }

    if (qr_code.startsWith(this.v2_prefix)) {
      return 'v2'
    }

    return 'unknown'
  }

  /**
   * 验证二维码（预览模式 - 不消耗nonce）
   *
   * 适用场景：
   * - /user-info 扫码获取用户信息（可多次调用）
   * - 需要验证二维码有效性但不消耗其使用次数的场景
   *
   * 验证步骤：
   * 1. 检测二维码版本
   * 2. V2码验证格式+签名+过期（不消耗nonce）
   *
   * @param {string} qr_code - 二维码字符串
   * @returns {Object} 验证结果（同步方法，不需要await）
   * @returns {boolean} returns.valid - 是否有效
   * @returns {string} returns.user_uuid - 用户UUID（验证通过时）
   * @returns {string} returns.nonce - nonce值（验证通过时）
   * @returns {string} returns.error - 错误信息（验证失败时）
   * @returns {string} returns.code - 错误码（验证失败时）
   * @returns {number} returns.statusCode - 建议的HTTP状态码
   *
   * @example
   * // 用于 /user-info，可多次调用同一二维码
   * const result = QRCodeValidator.validateQRCodePreview('QRV2_...')
   * if (!result.valid) {
   *   throw { code: result.code, message: result.error, statusCode: result.statusCode }
   * }
   * // result.user_uuid 可用于查询用户
   */
  validateQRCodePreview(qr_code) {
    // 1. 检测版本
    const version = this.detectVersion(qr_code)

    // 2. 未知格式拒绝
    if (version === 'unknown') {
      return {
        valid: false,
        error: '二维码格式不正确',
        code: 'INVALID_QRCODE_FORMAT',
        statusCode: 400
      }
    }

    // 3. V2码预览验证（格式+签名+过期，不消耗nonce）
    const result = this.validateQRCodeV2WithoutNonceConsumption(qr_code)

    // 4. 统一返回格式（将 error_code 映射为 code，http_status 映射为 statusCode）
    return {
      valid: result.valid,
      user_uuid: result.user_uuid,
      nonce: result.nonce,
      exp: result.exp,
      error: result.error,
      code: result.error_code,
      statusCode: result.http_status
    }
  }

  /**
   * 验证二维码（统一入口，自动检测版本并验证，消耗nonce）
   *
   * ⚠️ 注意：此方法会消耗nonce，二维码仅能使用一次
   * 适用场景：/submit 消费提交
   *
   * 如需多次验证（如 /user-info 预览），请使用 validateQRCodePreview()
   *
   * 验证步骤：
   * 1. 检测二维码版本
   * 2. V2码进行完整验证（格式+签名+过期+nonce防重放）
   *
   * @param {string} qr_code - 二维码字符串
   * @returns {Promise<Object>} 验证结果
   * @returns {boolean} returns.valid - 是否有效
   * @returns {string} returns.user_uuid - 用户UUID（验证通过时）
   * @returns {string} returns.nonce - nonce值（验证通过时）
   * @returns {string} returns.error - 错误信息（验证失败时）
   * @returns {string} returns.code - 错误码（验证失败时）
   * @returns {number} returns.statusCode - 建议的HTTP状态码
   *
   * @example
   * const result = await QRCodeValidator.validateQRCode('QRV2_...')
   * if (!result.valid) {
   *   throw { code: result.code, message: result.error, statusCode: result.statusCode }
   * }
   * // result.user_uuid 可用于查询用户
   */
  async validateQRCode(qr_code) {
    // 1. 检测版本
    const version = this.detectVersion(qr_code)

    // 2. 未知格式拒绝
    if (version === 'unknown') {
      return {
        valid: false,
        error: '二维码格式不正确',
        code: 'INVALID_QRCODE_FORMAT',
        statusCode: 400
      }
    }

    // 3. V2码完整验证（格式+签名+过期+nonce防重放）
    const result = await this.validateQRCodeV2WithNonce(qr_code)

    // 4. 统一返回格式（将 error_code 映射为 code，http_status 映射为 statusCode）
    return {
      valid: result.valid,
      user_uuid: result.user_uuid,
      nonce: result.nonce,
      exp: result.exp,
      error: result.error,
      code: result.error_code,
      statusCode: result.http_status
    }
  }

  /**
   * 批量验证二维码（用于批量处理场景）
   *
   * @param {Array<string>} qr_codes - 二维码数组
   * @returns {Promise<Object>} 批量验证结果
   */
  async batchValidate(qr_codes) {
    if (!Array.isArray(qr_codes)) {
      throw new Error('参数必须是数组')
    }

    const results = await Promise.all(
      qr_codes.map(async qr_code => {
        const result = await this.validateQRCodeV2WithNonce(qr_code)
        return {
          qr_code: qr_code.substring(0, 30) + '...',
          ...result
        }
      })
    )

    const valid_count = results.filter(r => r.valid).length
    const invalid_count = results.length - valid_count

    return {
      valid_count,
      invalid_count,
      total_count: results.length,
      results
    }
  }
}

// 导出单例
module.exports = new QRCodeValidator()
