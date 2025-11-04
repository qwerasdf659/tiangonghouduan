/**
 * 餐厅积分抽奖系统 V4.0 - 二维码生成和验证工具
 *
 * 业务场景：商家扫码录入方案A - 固定身份码方案
 * 安全机制：HMAC-SHA256签名，防止伪造和篡改
 *
 * 二维码格式：QR_{user_id}_{signature}
 * - user_id: 用户ID（明文）
 * - signature: HMAC-SHA256签名（64位十六进制）
 *
 * 签名算法：
 * signature = HMAC-SHA256(user_id, JWT_SECRET)
 * 每个用户的签名是固定的（基于user_id），长期有效，随用随扫
 *
 * 安全特性：
 * 1. 使用JWT_SECRET作为签名密钥（与系统其他安全机制保持一致）
 * 2. 固定签名设计（用户身份唯一标识，长期有效）
 * 3. 签名包含用户ID（防止跨用户伪造）
 * 4. 3分钟防误操作窗口（防止重复扫码）
 *
 * 💡 为什么使用固定身份码？
 * - 用户体验：二维码打印后长期有效，无需频繁更新
 * - 使用场景：线下消费，用户出示手机或打印二维码即可
 * - 安全保障：配合3分钟防重复扫码机制，保证安全性
 *
 * 创建时间：2025年10月30日
 * 最后更新：2025年10月30日
 */

'use strict'

const crypto = require('crypto')
const BeijingTimeHelper = require('./timeHelper')

/**
 * 二维码生成和验证工具类
 */
class QRCodeValidator {
  /**
   * 构造函数
   */
  constructor () {
    // 从环境变量获取签名密钥
    this.secret = process.env.JWT_SECRET || 'default_secret_key_for_development'

    // 签名算法
    this.algorithm = 'sha256'

    // 防误操作窗口（毫秒）
    this.antiMisoperationWindow = 3 * 60 * 1000 // 3分钟
  }

  /**
   * 获取当天0点的时间戳（北京时间）
   * 用于生成每日签名的基准时间
   * @returns {number} 当天0点的时间戳
   */
  _getTodayStartTimestamp () {
    const todayStart = BeijingTimeHelper.todayStart()
    return todayStart.getTime()
  }

  /**
   * 生成HMAC-SHA256签名
   * @param {string} data - 要签名的数据
   * @returns {string} 签名结果（32位十六进制）
   */
  _generateSignature (data) {
    const hmac = crypto.createHmac(this.algorithm, this.secret)
    hmac.update(data)
    return hmac.digest('hex')
  }

  /**
   * 生成用户的固定身份二维码（长期有效）
   * 格式：QR_{user_id}_{signature}
   *
   * @param {number} userId - 用户ID
   * @returns {string} 二维码字符串
   *
   * @example
   * const qrCode = qrCodeValidator.generateQRCode(123)
   * // 返回: QR_123_a1b2c3d4e5f6...（64位签名）
   *
   * @description
   * 固定身份码设计：
   * - 签名仅基于user_id，不包含时间戳
   * - 每个用户的QR码永久固定，可打印使用
   * - 配合防误操作窗口机制保证安全性
   */
  generateQRCode (userId) {
    // 参数验证
    if (!userId || typeof userId !== 'number' || userId <= 0) {
      throw new Error('用户ID必须是正整数')
    }

    // 生成签名数据：仅使用user_id（固定身份码核心设计）
    const signData = userId.toString()

    // 计算HMAC-SHA256签名
    const signature = this._generateSignature(signData)

    // 组装二维码：QR_{user_id}_{signature}
    const qrCode = `QR_${userId}_${signature}`

    console.log(`✅ 生成固定身份码 - 用户ID: ${userId}, 签名: ${signature.substring(0, 16)}...`)

    return qrCode
  }

  /**
   * 验证二维码的有效性
   *
   * @param {string} qrCode - 要验证的二维码字符串
   * @returns {Object} 验证结果
   *   - valid {boolean}: 是否有效
   *   - user_id {number|null}: 用户ID（验证成功时）
   *   - error {string|null}: 错误信息（验证失败时）
   *
   * @example
   * const result = qrCodeValidator.validateQRCode('QR_123_a1b2c3d4...')
   * if (result.valid) {
   *   console.log('用户ID:', result.user_id)
   * } else {
   *   console.log('验证失败:', result.error)
   * }
   */
  validateQRCode (qrCode) {
    try {
      // 基本格式验证
      if (!qrCode || typeof qrCode !== 'string') {
        return {
          valid: false,
          user_id: null,
          error: '二维码格式错误：必须是字符串'
        }
      }

      // 格式检查：QR_{user_id}_{signature}
      const parts = qrCode.split('_')
      if (parts.length !== 3 || parts[0] !== 'QR') {
        return {
          valid: false,
          user_id: null,
          error: '二维码格式错误：必须是QR_{user_id}_{signature}格式'
        }
      }

      // 提取用户ID
      const userId = parseInt(parts[1], 10)
      if (isNaN(userId) || userId <= 0) {
        return {
          valid: false,
          user_id: null,
          error: '二维码格式错误：用户ID必须是正整数'
        }
      }

      // 提取签名
      const providedSignature = parts[2]
      if (!providedSignature || providedSignature.length !== 64) {
        return {
          valid: false,
          user_id: null,
          error: '二维码格式错误：签名长度不正确'
        }
      }

      // 重新生成签名进行比对
      const expectedQRCode = this.generateQRCode(userId)
      const expectedSignature = expectedQRCode.split('_')[2]

      // 签名比对（防篡改）
      if (providedSignature !== expectedSignature) {
        return {
          valid: false,
          user_id: null,
          error: '二维码验证失败：签名不匹配（可能已过期或被篡改）'
        }
      }

      // 验证成功
      return {
        valid: true,
        user_id: userId,
        error: null
      }
    } catch (error) {
      return {
        valid: false,
        user_id: null,
        error: `二维码验证异常：${error.message}`
      }
    }
  }

  /**
   * 检查是否在防误操作窗口内
   * 用于防止短时间内重复扫码提交
   *
   * @param {string} qrCode - 二维码
   * @param {Date} lastScanTime - 上次扫码时间
   * @returns {Object} 检查结果
   *   - allowed {boolean}: 是否允许操作
   *   - remaining_seconds {number}: 剩余等待时间（秒）
   *   - message {string}: 提示信息
   *
   * @example
   * const result = qrCodeValidator.checkAntiMisoperation(qrCode, lastScanTime)
   * if (!result.allowed) {
   *   console.log(result.message) // "请等待XX秒后再试"
   * }
   */
  checkAntiMisoperation (qrCode, lastScanTime) {
    // 如果没有上次扫码时间，允许操作
    if (!lastScanTime) {
      return {
        allowed: true,
        remaining_seconds: 0,
        message: '允许操作'
      }
    }

    // 计算时间差
    const now = new Date()
    const timeDiff = now.getTime() - new Date(lastScanTime).getTime()

    // 检查是否在防误操作窗口内
    if (timeDiff < this.antiMisoperationWindow) {
      const remainingMs = this.antiMisoperationWindow - timeDiff
      const remainingSeconds = Math.ceil(remainingMs / 1000)

      return {
        allowed: false,
        remaining_seconds: remainingSeconds,
        message: `防止误操作：请等待${remainingSeconds}秒后再试`
      }
    }

    // 超出窗口期，允许操作
    return {
      allowed: true,
      remaining_seconds: 0,
      message: '允许操作'
    }
  }

  /**
   * 批量验证二维码（用于批量处理场景）
   *
   * @param {Array<string>} qrCodes - 二维码数组
   * @returns {Object} 批量验证结果
   *   - valid_count {number}: 有效数量
   *   - invalid_count {number}: 无效数量
   *   - results {Array<Object>}: 详细验证结果数组
   */
  batchValidate (qrCodes) {
    if (!Array.isArray(qrCodes)) {
      throw new Error('参数必须是数组')
    }

    const results = qrCodes.map(qrCode => ({
      qr_code: qrCode,
      ...this.validateQRCode(qrCode)
    }))

    const validCount = results.filter(r => r.valid).length
    const invalidCount = results.length - validCount

    return {
      valid_count: validCount,
      invalid_count: invalidCount,
      total_count: results.length,
      results
    }
  }

  /**
   * 提取二维码中的用户ID（不验证签名）
   * 注意：此方法不验证签名，仅用于快速提取ID，不能用于安全验证
   *
   * @param {string} qrCode - 二维码字符串
   * @returns {number|null} 用户ID（失败返回null）
   */
  extractUserId (qrCode) {
    try {
      if (!qrCode || typeof qrCode !== 'string') {
        return null
      }

      const parts = qrCode.split('_')
      if (parts.length !== 3 || parts[0] !== 'QR') {
        return null
      }

      const userId = parseInt(parts[1], 10)
      return isNaN(userId) ? null : userId
    } catch (error) {
      return null
    }
  }

  /**
   * 获取二维码的签名部分
   *
   * @param {string} qrCode - 二维码字符串
   * @returns {string|null} 签名（失败返回null）
   */
  extractSignature (qrCode) {
    try {
      if (!qrCode || typeof qrCode !== 'string') {
        return null
      }

      const parts = qrCode.split('_')
      if (parts.length !== 3 || parts[0] !== 'QR') {
        return null
      }

      return parts[2] || null
    } catch (error) {
      return null
    }
  }

  /**
   * 生成二维码的完整信息（用于调试和显示）
   *
   * @param {number} userId - 用户ID
   * @returns {Object} 二维码完整信息
   *
   * @description
   * 固定身份码信息：
   * - QR码长期有效，无需关注有效期
   * - 签名基于user_id，永久不变
   */
  generateQRCodeInfo (userId) {
    const qrCode = this.generateQRCode(userId)

    return {
      qr_code: qrCode,
      user_id: userId,
      signature: this.extractSignature(qrCode),
      generated_at: BeijingTimeHelper.now(),
      algorithm: this.algorithm,
      validity: 'permanent', // 固定身份码，永久有效
      note: '此二维码长期有效，可打印使用'
    }
  }
}

// 导出单例
module.exports = new QRCodeValidator()
