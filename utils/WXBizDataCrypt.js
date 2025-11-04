/**
 * 微信数据解密工具类 (WeChat Data Decryption Utility)
 *
 * 📋 功能说明: 解密微信小程序加密数据（手机号、用户信息等）
 * 🔒 安全说明: 使用微信官方提供的AES-128-CBC解密算法
 * 📚 官方文档: https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html
 * 🎯 使用场景: 微信授权获取手机号、获取用户敏感信息
 *
 * 技术实现:
 * - 加密算法: AES-128-CBC
 * - 密钥来源: 微信session_key
 * - 验证机制: watermark.appid校验
 *
 * 创建时间: 2025-11-03
 * 使用模型: Claude Sonnet 4.5
 */

const crypto = require('crypto')

/**
 * 微信数据解密类
 * @class WXBizDataCrypt
 */
class WXBizDataCrypt {
  /**
   * 构造函数
   * @param {string} appId - 微信小程序AppID
   * @param {string} sessionKey - 微信会话密钥（通过code换取）
   */
  constructor(appId, sessionKey) {
    this.appId = appId
    this.sessionKey = sessionKey
  }

  /**
   * 解密微信加密数据
   *
   * @param {string} encryptedData - 加密的数据（Base64编码）
   * @param {string} iv - 加密算法的初始向量（Base64编码）
   * @returns {Object} 解密后的数据对象
   * @throws {Error} 解密失败时抛出错误
   *
   * 返回数据结构（以手机号为例）:
   * {
   *   phoneNumber: "13800138000",      // 完整手机号
   *   purePhoneNumber: "13800138000",  // 不带区号的手机号
   *   countryCode: "86",               // 国家区号
   *   watermark: {
   *     appid: "wxd930ea5d5a258f4f",  // 小程序AppID（用于验证）
   *     timestamp: 1477314187          // 数据生成时间戳
   *   }
   * }
   */
  decryptData(encryptedData, iv) {
    try {
      /*
       * ========================================
       * 步骤1: Base64解码
       * ========================================
       * 将Base64编码的字符串解码为Buffer
       */
      const sessionKey = Buffer.from(this.sessionKey, 'base64')
      const encryptedDataBuffer = Buffer.from(encryptedData, 'base64')
      const ivBuffer = Buffer.from(iv, 'base64')

      console.log('🔓 开始解密微信数据...')

      /*
       * ========================================
       * 步骤2: AES-128-CBC解密
       * ========================================
       * 创建解密器（使用AES-128-CBC算法）
       */
      const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, ivBuffer)
      decipher.setAutoPadding(true) // 自动处理填充

      // 执行解密操作
      let decoded = decipher.update(encryptedDataBuffer, null, 'utf8')
      decoded += decipher.final('utf8')

      /*
       * ========================================
       * 步骤3: 解析JSON数据
       * ========================================
       */
      decoded = JSON.parse(decoded)

      console.log('✅ 微信数据解密成功')

      /*
       * ========================================
       * 步骤4: 验证AppID（安全校验）
       * ========================================
       * watermark.appid必须与当前小程序的AppID一致，防止数据被其他小程序冒用
       */
      if (decoded.watermark.appid !== this.appId) {
        console.error('❌ AppID验证失败:', {
          expected: this.appId,
          actual: decoded.watermark.appid
        })
        throw new Error('AppID不匹配，数据来源不可信')
      }

      console.log('✅ AppID验证通过')

      // 返回解密后的数据
      return decoded
    } catch (err) {
      // 捕获并处理所有解密错误
      console.error('❌ 微信数据解密失败:', err.message)
      throw new Error('解密失败: ' + err.message)
    }
  }
}

// 导出工具类
module.exports = WXBizDataCrypt
